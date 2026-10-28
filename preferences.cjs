const fs = require('node:fs');
const path = require('node:path');
const { cleanSettings } = require('./model.js');

const fields = [
  ['大小百分比', 'sizePercent', 50, 200],
  ['偶尔动一动', 'spontaneous'],
  ['动作间隔秒', 'actionSeconds', 5, 86400],
  ['屏幕走动', 'walking'],
  ['走动间隔秒', 'walkSeconds', 10, 86400],
  ['走动范围', 'walkRegion'],
  ['整点提醒', 'hourly'],
  ['目光跟随鼠标', 'follow'],
  ['保持最上层', 'top']
];
const regions = ['左上', '上中', '右上', '左中', '中间', '右中', '左下', '下中', '右下'];
function parseConfig(text) {
  const value = {}, errors = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const content = line.trim();
    if (!content || content.startsWith('#')) continue;
    const match = content.match(/^([^=]+)=(.*)$/);
    const spec = match && fields.find(([label]) => label === match[1].trim());
    if (!spec) { errors.push(`无法识别：${content}`); continue; }
    const [label, key, min, max] = spec;
    const raw = match[2].trim();
    if (min !== undefined) {
      const n = Number(raw);
      if (!raw || !Number.isInteger(n) || n < min || n > max) errors.push(`${label}应为 ${min}～${max} 的整数`);
      else value[key] = n;
    } else if (key === 'walkRegion') {
      const region = raw === '整个屏幕' ? 'all' : raw === '底部一排' ? 'bottom' : String(regions.indexOf(raw));
      if (region === '-1') errors.push('走动范围无效'); else value[key] = region;
    } else if (raw === '开' || raw === '关') value[key] = raw === '开';
    else errors.push(`${label}请填写 开 或 关`);
  }
  return { value, errors };
}
function formatConfig(settings) {
  const s = cleanSettings(settings);
  return '# 亚瑟设置：只修改等号右侧，保存为 UTF-8 文本，重启后生效。\n# 时间每次在设定值的 80%～120% 之间随机；单位是秒。\n# 走动范围：底部一排、整个屏幕、左上、上中、右上、左中、中间、右中、左下、下中、右下。\n' + fields.map(([label, key]) => {
    let value = s[key];
    if (typeof value === 'boolean') value = value ? '开' : '关';
    if (key === 'walkRegion') value = value === 'all' ? '整个屏幕' : value === 'bottom' ? '底部一排' : regions[Number(value)];
    return `${label}=${value}`;
  }).join('\n') + '\n';
}
function parseMessages(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).map(s => s.slice(0, 180));
}
function formatMessage(template, date) {
  return template.replaceAll('{hour}', String(date.getHours())).replaceAll('{time}', `${String(date.getHours()).padStart(2, '0')}:00`);
}
function saveConfig(directory, settings) {
  const target = path.join(directory, '设置.txt');
  fs.writeFileSync(`${target}.tmp`, formatConfig(settings), 'utf8');
  fs.renameSync(`${target}.tmp`, target);
}
function initPreferences(directory, defaultsDirectory, legacy = {}) {
  fs.mkdirSync(directory, { recursive: true });
  for (const filename of ['设置.txt', '整点文案.txt', '如何修改.txt']) {
    const target = path.join(directory, filename);
    if (!fs.existsSync(target)) {
      if (filename === '设置.txt') saveConfig(directory, legacy);
      else fs.copyFileSync(path.join(defaultsDirectory, filename), target);
    }
  }
  const { value, errors } = parseConfig(fs.readFileSync(path.join(directory, '设置.txt'), 'utf8'));
  const messages = parseMessages(fs.readFileSync(path.join(directory, '整点文案.txt'), 'utf8'));
  return { settings: cleanSettings({ ...legacy, ...value }), errors, messages: messages.length ? messages : ['现在是 {time}，亚瑟提醒你：起来伸个懒腰吧。'] };
}
module.exports = { fields, regions, parseConfig, formatConfig, parseMessages, formatMessage, saveConfig, initPreferences };
