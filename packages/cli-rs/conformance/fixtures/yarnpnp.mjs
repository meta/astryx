// A Yarn Plug'n'Play app (Yarn 4, `nodeLinker: pnp`): no node_modules; Core
// is linked from vendor/core and found through the project's .pnp.cjs. The
// Yarn release is the @yarnpkg/cli-dist tarball, cached under
// /tmp/astryx-conformance/npm-cache (downloaded once with npm when missing,
// using the environment's proxy settings if any). Cases run the CLI as a PnP
// process: env NODE_OPTIONS="--require <fixture>/.pnp.cjs", as `yarn` does.
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CACHE = '/tmp/astryx-conformance/npm-cache';
const YARN = '4.5.0';

function yarnBin() {
  const dir = path.join(CACHE, `yarn-${YARN}`);
  const bin = path.join(dir, 'bin/yarn.js');
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(CACHE, {recursive: true});
  const tgz = path.join(CACHE, `yarnpkg-cli-dist-${YARN}.tgz`);
  if (!fs.existsSync(tgz)) {
    const r = spawnSync('npm', ['pack', `@yarnpkg/cli-dist@${YARN}`, '--silent', '--pack-destination', CACHE], {encoding: 'utf8'});
    if (r.status !== 0 || !fs.existsSync(tgz)) throw new Error(`could not download yarn ${YARN}: ${r.stderr}`);
  }
  fs.mkdirSync(dir, {recursive: true});
  const r = spawnSync('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1'], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`could not unpack yarn ${YARN}: ${r.stderr}`);
  return bin;
}

function yarnInstall(dir) {
  const r = spawnSync(process.execPath, [yarnBin(), 'install'], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      YARN_ENABLE_TELEMETRY: '0',
      YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
      YARN_ENABLE_GLOBAL_CACHE: 'false',
      YARN_ENABLE_PROGRESS_BARS: 'false',
      YARN_GLOBAL_FOLDER: path.join(CACHE, 'yarn-global'),
    },
  });
  if (r.status !== 0) throw new Error(`yarn install failed in ${dir}: ${r.stdout}${r.stderr}`);
}

export default function (dir, h) {
  h.copyPackage(h.PKG('core'), path.join(dir, 'vendor/core'));
  h.writeJson(path.join(dir, 'package.json'), {
    name: 'pnp-app',
    version: '1.0.0',
    private: true,
    packageManager: `yarn@${YARN}`,
    dependencies: {'@astryxdesign/core': 'link:./vendor/core'},
  });
  h.writeFile(path.join(dir, '.yarnrc.yml'), 'nodeLinker: pnp\nenableTelemetry: false\n');
  h.writeFile(
    path.join(dir, 'src/App.tsx'),
    "import {Button} from '@astryxdesign/core';\n\nexport default function App() {\n  return <Button label=\"Hi\" />;\n}\n",
  );
  // A folder the project's PnP ignores, and a nested PnP project that does
  // not declare Core.
  h.writeFile(path.join(dir, '.yarn/sdks/README.md'), 'sdks\n');
  yarnInstall(dir);
  const nested = path.join(dir, 'tools/other');
  h.writeJson(path.join(nested, 'package.json'), {name: 'other', version: '1.0.0', private: true, packageManager: `yarn@${YARN}`});
  h.writeFile(path.join(nested, '.yarnrc.yml'), 'nodeLinker: pnp\nenableTelemetry: false\n');
  h.writeFile(path.join(nested, 'yarn.lock'), '');
  yarnInstall(nested);
}
