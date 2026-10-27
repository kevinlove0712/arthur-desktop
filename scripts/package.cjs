const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

(async () => {
  const { packager } = await import('@electron/packager');
  const source = path.resolve(__dirname, '..');
  const root = source;
  const staging = process.env.ARTHUR_BUILD_DIR || path.join(source, 'build');
  const release = path.join(root, 'releases');
  fs.mkdirSync(release, { recursive: true });
  const targets = {
    'mac-arm64': { platform: 'darwin', arch: 'arm64', label: 'macOS-Apple-Silicon' },
    'mac-x64': { platform: 'darwin', arch: 'x64', label: 'macOS-Intel' },
    'windows-x64': { platform: 'win32', arch: 'x64', label: 'Windows-x64' }
  };
  const selected = process.argv.slice(2);
  for (const target of selected.length ? selected : Object.keys(targets)) {
    const config = targets[target];
    if (!config) throw new Error(`Unknown target: ${target}`);
    const [output] = await packager({
      dir: source, name: 'Arthur', executableName: 'Arthur', appBundleId: 'com.kevin.arthurdesktop',
      platform: config.platform, arch: config.arch, electronVersion: '45.0.0',
      appVersion: '1.0.0', buildVersion: '1.0.0', asar: true,
      out: staging, overwrite: true, prune: true,
      ignore: [/^\/(test|scripts|build|releases|checks|docs)(\/|$)/, /^\/\.git/],
      icon: path.join(source, 'assets', config.platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
      extendInfo: config.platform === 'darwin' ? { LSUIElement: true } : undefined,
      download: { cacheRoot: process.env.electron_config_cache }
    });
    if (config.platform === 'darwin') {
      // Local ad-hoc signing makes the bundle internally valid. It is not Apple notarization.
      const bundle = path.join(output, 'Arthur.app');
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
      execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
    }
    fs.copyFileSync(path.join(root, '使用说明.txt'), path.join(output, 'README.txt'));
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));
    fs.copyFileSync(path.join(root, '发行检查记录.txt'), path.join(output, 'RELEASE-NOTES.txt'));
    const zip = path.join(release, `Arthur-1.0.0-${config.label}.zip`);
    if (fs.existsSync(zip)) fs.unlinkSync(zip);
    if (config.platform === 'darwin') {
      execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', output, zip]);
    } else {
      execFileSync('zip', ['-q', '-r', zip, path.basename(output)], { cwd: path.dirname(output) });
    }
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    fs.writeFileSync(`${zip}.sha256`, `${sha256}  ${path.basename(zip)}\n`);
    console.log(JSON.stringify({ target, output, zip, bytes: fs.statSync(zip).size, sha256 }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
