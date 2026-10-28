const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cleanSettings } = require('../model.js');
const { parseConfig, formatConfig, parseMessages, formatMessage, initPreferences, saveConfig } = require('../preferences.cjs');
const { newer, selectRelease } = require('../updates.cjs');
test('readable config round trips every setting, accepts BOM and CRLF', () => {
  const settings = cleanSettings({ sizePercent: 143, walking: false, walkRegion: '0', actionSeconds: 75, walkSeconds: 340, hourly: false, follow: false, spontaneous: false, top: false });
  const result = parseConfig('\uFEFF' + formatConfig(settings).replaceAll('\n', '\r\n'));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(cleanSettings(result.value), settings);
  const bad = parseConfig('大小百分比=900\n动作间隔秒=abc\n走动范围=月球\n整点提醒=yes\n无效行');
  assert.equal(bad.errors.length, 5);
  assert.deepEqual(bad.value, {});
});
test('user edits survive restarts and defaults are only created when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arthur-config-test-'));
  try {
    const defaults = path.join(__dirname, '..', '自定义');
    assert.equal(initPreferences(dir, defaults, { size: 1.5 }).settings.sizePercent, 120);
    fs.writeFileSync(path.join(dir, '整点文案.txt'), '# test\n{time}，你好亚瑟！\n');
    saveConfig(dir, { sizePercent: 175, walkRegion: '7', walkSeconds: 400 });
    const reloaded = initPreferences(dir, defaults);
    assert.equal(reloaded.settings.sizePercent, 175);
    assert.equal(reloaded.settings.walkSeconds, 400);
    assert.deepEqual(reloaded.messages, ['{time}，你好亚瑟！']);
    fs.writeFileSync(path.join(dir, '整点文案.txt'), '# empty');
    assert.equal(initPreferences(dir, defaults).messages.length, 1);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
test('message lines are plain text and time placeholders are substituted', () => {
  assert.deepEqual(parseMessages('\uFEFF# ignore\r\n\n你好\r\n<script>text</script>'), ['你好', '<script>text</script>']);
  assert.equal(formatMessage('{hour} 点 {time}', new Date(2026, 1, 1, 9)), '9 点 09:00');
});
test('update selection compares numeric versions and only links our release assets', () => {
  assert.equal(newer('v1.10.0', '1.9.0'), true);
  assert.equal(newer('v1.0.0', '1.1.0'), false);
  assert.equal(newer('../../bad', '1.0.0'), false);
  const asset = 'Arthur-1.2.0-macOS-Apple-Silicon.zip';
  const url = `https://github.com/kevinlove0712/arthur-desktop/releases/download/v1.2.0/${asset}`;
  const releases = [{ tag_name: 'v9.0.0', draft: true }, { tag_name: 'v1.2.0', prerelease: true, assets: [{ name: asset, browser_download_url: url }] }];
  assert.equal(selectRelease(releases, '1.1.0', 'darwin', 'arm64').download, url);
  assert.equal(selectRelease(releases, '1.1.0', 'win32', 'x64').download, null);
  assert.equal(selectRelease(releases, '1.2.0', 'darwin', 'arm64'), null);
  releases[1].assets[0].browser_download_url = 'https://untrusted.example/update.zip';
  assert.equal(selectRelease(releases, '1.1.0', 'darwin', 'arm64').download, null);
});
