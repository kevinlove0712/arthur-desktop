const RELEASES = 'https://github.com/kevinlove0712/arthur-desktop/releases';
const API = 'https://api.github.com/repos/kevinlove0712/arthur-desktop/releases?per_page=100';
function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}
function newer(a, b) {
  const x = versionParts(a), y = versionParts(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function selectRelease(releases, current, platform, arch) {
  const label = platform === 'darwin' ? { arm64: 'macOS-Apple-Silicon', x64: 'macOS-Intel' }[arch] : platform === 'win32' && arch === 'x64' ? 'Windows-x64' : null;
  const candidates = releases.filter(r => !r.draft && newer(r.tag_name, current)).sort((a, b) => newer(a.tag_name, b.tag_name) ? -1 : 1);
  const release = candidates[0];
  if (!release) return null;
  const version = release.tag_name.replace(/^v/, '');
  const filename = `Arthur-${version}-${label}.zip`;
  const expected = `${RELEASES}/download/${release.tag_name}/${filename}`;
  const asset = label && release.assets?.find(a => a.name === filename && a.browser_download_url === expected);
  return { version, preview: !!release.prerelease, url: `${RELEASES}/tag/${release.tag_name}`, download: asset ? expected : null };
}
async function checkRelease(current, platform, arch) {
  const response = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub 请求过于频繁，请稍后再试。' : `GitHub 返回 ${response.status}`);
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error('版本信息格式不正确');
  return selectRelease(releases, current, platform, arch);
}
module.exports = { newer, selectRelease, checkRelease };
