// Doctor: peer dependencies, package managers and lockfiles, one project per
// subfolder.
import * as path from 'node:path';

export default async function (dir, h) {
  const app = async (name, files, pkgExtra = {}) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    if (Object.keys(pkgExtra).length) {
      const pj = {name, version: '1.0.0', private: true, dependencies: {'@astryxdesign/core': h.CORE_VERSION}, ...pkgExtra};
      await h.writeJson(path.join(d, 'package.json'), pj);
    }
    for (const [rel, text] of Object.entries(files)) await h.writeFile(path.join(d, rel), text);
  };
  await app('peers', {
    'node_modules/react/package.json': JSON.stringify({name: 'react', version: '18.2.0'}),
    'node_modules/react-dom/package.json': JSON.stringify({name: 'react-dom', version: '19.1.0'}),
    'node_modules/@stylexjs/stylex/package.json': JSON.stringify({name: '@stylexjs/stylex', version: '0.19.2'}),
  });
  await app('stray', {'package-lock.json': '{}\n', 'yarn.lock': '# yarn lockfile v1\n'}, {packageManager: 'pnpm@9.0.0'});
  await app('ambiguous', {'yarn.lock': '# yarn lockfile v1\n', 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n"});
  await app('evidence', {'yarn.lock': '# yarn lockfile v1\n', 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", 'pnpm-workspace.yaml': "packages: ['.']\n"});
  await app('bun', {'bun.lock': '{}\n'});
  await app('yarn', {'yarn.lock': '# yarn lockfile v1\n'});
  await app('cli', {
    'node_modules/@astryxdesign/cli/package.json': JSON.stringify({name: '@astryxdesign/cli', version: '0.6.0'}),
  }, {devDependencies: {'@astryxdesign/cli': '0.6.0'}});
  await app('oldcore', {
    'node_modules/@astryxdesign/core/package.json': JSON.stringify({name: '@astryxdesign/core', version: '0.6.5', peerDependencies: {}}),
  });
  await app('workspace', {'node_modules/@astryxdesign/core/package.json': JSON.stringify({name: '@astryxdesign/core', version: 'workspace:*'})});
}
