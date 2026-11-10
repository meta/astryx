// A Yarn Plug'n'Play app whose @astryxdesign/core 0.7.5 lives zipped in
// .yarn/cache, Yarn's default: the CLI reads it through PnP's virtual and
// zip paths. Core's own dependencies are dropped from the packed copy so the
// install needs no registry; its peers make Yarn give it a virtual path.
// Cases run the CLI as Yarn does: NODE_OPTIONS="--require <fixture>/.pnp.cjs
// --experimental-loader <fixture>/.pnp.loader.mjs".
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CACHE = '/tmp/astryx-conformance/npm-cache';
const YARN = '4.5.0';
const CORE = '0.7.5';

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', ...opts});
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stdout}${r.stderr}`);
  return r;
}

function cached(name, spec) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, {recursive: true});
  run('npm', ['pack', spec, '--silent', '--pack-destination', CACHE]);
  return file;
}

function yarnBin() {
  const dir = path.join(CACHE, `yarn-${YARN}`);
  const bin = path.join(dir, 'bin/yarn.js');
  if (fs.existsSync(bin)) return bin;
  const tgz = cached(`yarnpkg-cli-dist-${YARN}.tgz`, `@yarnpkg/cli-dist@${YARN}`);
  fs.mkdirSync(dir, {recursive: true});
  run('tar', ['-xzf', tgz, '-C', dir, '--strip-components=1']);
  return bin;
}

export default function (dir, h) {
  const tgz = cached(`astryxdesign-core-${CORE}.tgz`, `@astryxdesign/core@${CORE}`);
  const pkgDir = path.join(dir, 'vendor/pkg');
  fs.mkdirSync(pkgDir, {recursive: true});
  run('tar', ['-xzf', tgz, '-C', pkgDir, '--strip-components=1']);
  const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  delete pj.dependencies;
  delete pj.devDependencies;
  delete pj.scripts;
  fs.writeFileSync(path.join(pkgDir, 'package.json'), `${JSON.stringify(pj, null, 2)}\n`);
  run('tar', ['-czf', path.join(dir, 'vendor/core.tgz'), '-C', path.join(dir, 'vendor'), '--transform', 's,^pkg,package,', 'pkg']);
  fs.rmSync(pkgDir, {recursive: true, force: true});
  h.writeJson(path.join(dir, 'package.json'), {
    name: 'pnpzip-app',
    version: '1.0.0',
    private: true,
    packageManager: `yarn@${YARN}`,
    dependencies: {'@astryxdesign/core': 'file:./vendor/core.tgz'},
  });
  h.writeFile(path.join(dir, '.yarnrc.yml'), 'nodeLinker: pnp\nenableTelemetry: false\n');
  h.writeFile(
    path.join(dir, 'src/App.tsx'),
    "import {Button} from '@astryxdesign/core';\n\nexport default function App() {\n  return <Button label=\"Hi\" />;\n}\n",
  );
  run(process.execPath, [yarnBin(), 'install'], {
    cwd: dir,
    env: {
      ...process.env,
      YARN_ENABLE_TELEMETRY: '0',
      YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
      YARN_ENABLE_GLOBAL_CACHE: 'false',
      YARN_ENABLE_PROGRESS_BARS: 'false',
      YARN_GLOBAL_FOLDER: path.join(CACHE, 'yarn-global'),
    },
  });
}
