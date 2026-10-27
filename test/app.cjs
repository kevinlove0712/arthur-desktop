const { _electron: electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { states } = require('../model.js');

(async () => {
  const root = path.resolve(__dirname, '..');
  const output = process.env.ARTHUR_TEST_OUTPUT || path.join(os.tmpdir(), 'arthur-app-test');
  fs.mkdirSync(output, { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'arthur-profile-'));
  const application = await electron.launch({
    executablePath: process.env.ARTHUR_EXECUTABLE || require('electron'),
    args: process.env.ARTHUR_EXECUTABLE ? [] : [root],
    env: { ...process.env, ARTHUR_TEST_DATA: data }
  });
  const errors = [];
  const reports = [];
  try {
    const page = await application.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.getElementById('pet').dataset.cell);
    const security = await page.evaluate(() => ({ require: typeof require, process: typeof process, background: getComputedStyle(document.body).backgroundColor }));
    assert.equal(security.require, 'undefined');
    assert.equal(security.process, 'undefined');
    assert.equal(security.background, 'rgba(0, 0, 0, 0)');
    await application.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.webContents.send('pet:settings', { follow: false, spontaneous: false });
    });
    for (const [state, spec] of Object.entries(states)) {
      await application.evaluate(({ BrowserWindow }, name) => BrowserWindow.getAllWindows()[0].webContents.send('pet:action', name), state);
      await page.waitForFunction(name => document.getElementById('pet').dataset.state === name, state);
      const first = await page.locator('#pet').getAttribute('data-cell');
      assert.equal(Number(first.split(':')[0]), spec.row);
      await page.waitForTimeout(spec.times[0] + 80);
      const second = await page.locator('#pet').getAttribute('data-cell');
      assert.notEqual(second, first);
      await page.screenshot({ path: path.join(output, `${state}.png`), omitBackground: true });
      reports.push({ state, first, second, animated: true });
    }
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pet:action', 'idle'));
    const viewport = await page.locator('#pet').boundingBox();
    await page.mouse.click(viewport.width / 2, viewport.height / 2);
    await page.waitForFunction(() => document.getElementById('pet').dataset.state === 'jumping');
    await page.waitForFunction(() => document.getElementById('pet').dataset.state === 'idle');
    await page.mouse.dblclick(viewport.width / 2, viewport.height / 2);
    await page.waitForFunction(() => document.getElementById('pet').dataset.state === 'waving');
    await page.waitForFunction(() => document.getElementById('pet').dataset.state === 'idle');
    const beforeDrag = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewport.width / 2 - 40, viewport.height / 2 - 30);
    await page.waitForTimeout(100);
    await page.mouse.up();
    const afterDrag = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    assert.equal(afterDrag.x - beforeDrag.x, -40);
    assert.equal(afterDrag.y - beforeDrag.y, -30);
    assert.deepEqual(errors, []);
    const window = await application.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { bounds: w.getBounds(), top: w.isAlwaysOnTop(), resizable: w.isResizable(), webPreferences: w.webContents.getLastWebPreferences() };
    });
    assert.equal(window.top, true);
    assert.equal(window.resizable, false);
    assert.equal(window.webPreferences.sandbox, true);
    const runtime = await application.evaluate(() => ({ platform: process.platform, arch: process.arch, electron: process.versions.electron }));
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: true, runtime, security, states: reports, interactions: ['single click jump and return', 'double click wave', 'drag window -40,-30'], beforeDrag, afterDrag, window, errors }, null, 2));
    console.log('Desktop app smoke test passed:', output);
  } finally { await application.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
