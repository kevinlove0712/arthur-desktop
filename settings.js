const $ = id => document.getElementById(id);
const numeric = ['sizePercent', 'actionSeconds', 'walkSeconds'];
const toggles = ['spontaneous', 'walking', 'hourly', 'follow', 'top'];
function ranges() {
  for (const [input, output] of [['actionSeconds', 'actionRange'], ['walkSeconds', 'walkRange']]) {
    const n = Number($(input).value);
    $(output).textContent = `每次在 ${(n * 0.8).toFixed(1).replace(/\.0$/, '')}～${(n * 1.2).toFixed(1).replace(/\.0$/, '')} 秒之间随机（±20%）。`;
  }
}
function populate(settings) {
  for (const key of numeric) $(key).value = settings[key];
  for (const key of toggles) $(key).checked = settings[key];
  document.querySelector(`input[name=walkRegion][value="${settings.walkRegion}"]`).checked = true;
  ranges();
}
window.preferences.get().then(data => {
  populate(data.settings);
  $('directory').textContent = data.directory;
  $('version').textContent = `亚瑟 ${data.version}`;
}).catch(() => { $('status').textContent = '读取设置失败，请关闭设置窗口重试。'; });
$('settings').addEventListener('input', ranges);
$('settings').addEventListener('submit', async event => {
  event.preventDefault();
  const values = {};
  for (const key of numeric) values[key] = Number($(key).value);
  for (const key of toggles) values[key] = $(key).checked;
  values.walkRegion = document.querySelector('input[name=walkRegion]:checked').value;
  const result = await window.preferences.save(values);
  $('status').textContent = result.ok ? '已保存并生效。' : result.error;
  if (result.ok) populate(result.settings);
});
$('folder').addEventListener('click', async () => {
  const error = await window.preferences.folder();
  if (error) $('status').textContent = `打开失败：${error}`;
});
$('preview').addEventListener('click', () => window.preferences.preview());
$('update').addEventListener('click', async () => {
  $('update').disabled = true;
  $('updateStatus').textContent = '正在检查 GitHub 上的新版本…';
  try { $('updateStatus').textContent = (await window.preferences.update()).message; }
  catch { $('updateStatus').textContent = '检查失败，请稍后重试。'; }
  finally { $('update').disabled = false; }
});
