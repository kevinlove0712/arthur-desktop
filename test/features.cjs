const { _electron: electron } = require('playwright-core');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { formatConfig } = require('../preferences.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const output = process.env.ARTHUR_TEST_OUTPUT || path.join(os.tmpdir(), 'arthur-feature-test');
  fs.mkdirSync(output, { recursive: true });
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'arthur-features-'));
  const custom = path.join(data, '自定义');
  fs.mkdirSync(custom);
  fs.writeFileSync(path.join(custom, '设置.txt'), formatConfig({ spontaneous: false, walking: false, hourly: false }));
  fs.writeFileSync(path.join(custom, '整点文案.txt'), '# test\n{time} 亚瑟测试 <b>原样文字</b>\n');
  const launch = () => electron.launch({ executablePath: process.env.ARTHUR_EXECUTABLE || require('electron'), args: process.env.ARTHUR_EXECUTABLE ? [] : [root], env: { ...process.env, ARTHUR_TEST_DATA: data } });
  let application = await launch();
  const errors = [];
  async function openSettings(pet) {
    await application.evaluate(({ Menu }) => {
      Menu.prototype.popup = function(options) {
        this.items.find(item => item.label === '设置…').click();
        options.callback();
      };
    });
    const pending = application.waitForEvent('window');
    await pet.evaluate(() => window.arthur.menu());
    const page = await pending;
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => document.getElementById('sizePercent').value);
    return page;
  }
  try {
    const pet = await application.firstWindow();
    pet.on('pageerror', e => errors.push(e.message));
    await pet.waitForFunction(() => document.getElementById('pet').dataset.cell);
    const settings = await openSettings(pet);
    assert.equal(await settings.locator('#sizePercent').inputValue(), '100');
    assert.equal(await settings.evaluate(() => typeof require), 'undefined');
    await settings.locator('#sizePercent').fill('125');
    await settings.locator('#actionSeconds').fill('60');
    await settings.locator('#walkSeconds').fill('10');
    await settings.locator('[name=walkRegion][value="7"]').check();
    await settings.locator('#walking').check();
    await settings.locator('button[type=submit]').click();
    await settings.waitForFunction(() => document.getElementById('status').textContent.includes('已保存'));
    const b = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === '亚瑟').getBounds());
    assert.equal(b.width, 300); assert.equal(b.height, 325);
    assert.match(fs.readFileSync(path.join(custom, '设置.txt'), 'utf8'), /大小百分比=125/);
    await settings.screenshot({ path: path.join(output, 'settings.png'), fullPage: true });
    await pet.waitForFunction(() => document.getElementById('pet').dataset.state.startsWith('running-'), null, { timeout: 15000 });
    const movingBefore = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === '亚瑟').getBounds());
    await pet.waitForTimeout(450);
    const movingAfter = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === '亚瑟').getBounds());
    assert.notDeepEqual(movingAfter, movingBefore);
    // Actual drag IPC must stop autonomous walking, and must not move again during a held drag.
    await pet.evaluate(() => window.arthur.dragStart({ x: 100, y: 100 }));
    await pet.waitForFunction(() => !document.getElementById('pet').dataset.state.startsWith('running-'));
    const stopped = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === '亚瑟').getBounds());
    await pet.waitForTimeout(250);
    assert.deepEqual(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === '亚瑟').getBounds()), stopped);
    await pet.evaluate(() => window.arthur.dragEnd());
    // Preview shares the real notification rendering path, including literal text and click-through window.
    const reminderPromise = application.waitForEvent('window');
    await settings.locator('#preview').click();
    const reminder = await reminderPromise;
    await reminder.waitForFunction(() => document.getElementById('message').textContent.includes('亚瑟测试'));
    assert.equal(await reminder.locator('b').count(), 0);
    await reminder.screenshot({ path: path.join(output, 'reminder.png'), omitBackground: true });
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle().includes('整点提醒')).isFocusable()), false);
    await application.evaluate(() => { globalThis.fetch = async () => ({ ok: true, json: async () => [] }); });
    await settings.locator('#update').click();
    await settings.waitForFunction(() => document.getElementById('updateStatus').textContent.includes('没有发现更新'));
    await application.evaluate(() => { globalThis.fetch = async () => { throw new Error('offline'); }; });
    await settings.locator('#update').click();
    await settings.waitForFunction(() => document.getElementById('updateStatus').textContent.includes('检查失败'));
    assert.equal(await settings.locator('#update').isEnabled(), true);
    // Fire a real main-process hourly boundary without changing the machine clock.
    await settings.locator('#walking').uncheck();
    await settings.locator('#hourly').check();
    await settings.locator('button[type=submit]').click();
    await settings.waitForFunction(() => document.getElementById('status').textContent.includes('已保存'));
    await application.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) if (w.getTitle().includes('整点提醒')) w.close(); });
    const hourlyPromise = application.waitForEvent('window');
    await application.evaluate(() => {
      const RealDate = Date;
      const next = new RealDate(); next.setHours(next.getHours() + 1, 0, 0, 0);
      globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [next.getTime()])); } };
    });
    const hourly = await hourlyPromise;
    await hourly.waitForFunction(() => document.getElementById('message').textContent.includes('亚瑟测试'));
    await pet.waitForTimeout(300);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.getTitle().includes('整点提醒')).length), 1);
    await application.close();
    // File edits must take effect on restart, without changing user text.
    fs.writeFileSync(path.join(custom, '设置.txt'), formatConfig({ sizePercent: 80, walking: false, spontaneous: false, hourly: false, walkRegion: '0' }));
    application = await launch();
    const restarted = await application.firstWindow();
    await restarted.waitForFunction(() => document.getElementById('pet').dataset.cell);
    const reread = await openSettings(restarted);
    assert.equal(await reread.locator('#sizePercent').inputValue(), '80');
    assert.equal(await reread.locator('[name=walkRegion][value="0"]').isChecked(), true);
    assert.match(fs.readFileSync(path.join(custom, '整点文案.txt'), 'utf8'), /原样文字/);
    assert.deepEqual(errors, []);
    console.log('Feature integration passed: settings, movement, drag interruption, reminders, update states, restart configuration. Screenshots:', output);
  } finally { await application.close(); fs.rmSync(data, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
