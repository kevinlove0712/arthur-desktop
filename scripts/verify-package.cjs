const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
(async () => {
  const { extractFile } = await import('@electron/asar');
  const root = path.resolve(__dirname, '..');
  const version = require('../package.json').version;
  const results = [];
  for (const [platform, label, resources] of [
    ['darwin-arm64', 'macOS-Apple-Silicon', 'Arthur.app/Contents/Resources'],
    ['darwin-x64', 'macOS-Intel', 'Arthur.app/Contents/Resources'],
    ['win32-x64', 'Windows-x64', 'resources']
  ]) {
    const dir = path.join(root, 'build', `Arthur-${platform}`);
    const archive = path.join(dir, resources, 'app.asar');
    for (const file of ['main.cjs','preload.cjs','renderer.js','model.js','preferences.cjs','updates.cjs','settings.html','settings.js','settings.css','settings-preload.cjs','reminder.html','reminder.js','reminder.css','reminder-preload.cjs','assets/arthur.png']) {
      assert.deepEqual(extractFile(archive, file), fs.readFileSync(path.join(root, file)), `${platform}/${file}`);
    }
    const metadata = JSON.parse(extractFile(archive, 'package.json'));
    assert.equal(metadata.version, version);
    assert.equal(metadata.main, 'main.cjs');
    assert.equal(metadata.devDependencies, undefined);
    for (const file of ['设置.txt', '整点文案.txt', '如何修改.txt']) {
      assert.deepEqual(fs.readFileSync(path.join(dir, '自定义', file)), fs.readFileSync(path.join(root, '自定义', file)));
      assert.deepEqual(extractFile(archive, `自定义/${file}`), fs.readFileSync(path.join(root, '自定义', file)));
    }
    if (platform.startsWith('darwin')) execFileSync('codesign', ['--verify', '--deep', '--strict', path.join(dir, 'Arthur.app')]);
    const zip = path.join(root, 'releases', `Arthur-${version}-${label}.zip`);
    execFileSync('unzip', ['-tqq', zip]);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    assert.equal(fs.readFileSync(zip + '.sha256', 'utf8').split(' ')[0], sha256);
    results.push({ platform, sha256, bytes: fs.statSync(zip).size, contentsMatch: true, zipOK: true });
  }
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
