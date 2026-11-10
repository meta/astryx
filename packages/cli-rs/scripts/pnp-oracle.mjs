// Test oracle only: the PnP lookups of foundation/fs/paths.mjs, run in a
// PnP process (NODE_OPTIONS --require <project>/.pnp.cjs) over the yarnpnp
// conformance fixture built at <fixture> (default /tmp/pnp-fx).
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
const [cliRoot, out, fixture = '/tmp/pnp-fx'] = process.argv.slice(2);
const probe = `
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
const p = await import(pathToFileURL(path.join(${JSON.stringify(cliRoot)}, 'foundation/fs/paths.mjs')).href);
const dirs = JSON.parse(process.argv[1]);
const out = dirs.map(dir => ({dir,
  installed: p.findInstalledPackage(dir, '@astryxdesign/core'),
  installedFar: p.findInstalledPackage(dir, '@astryxdesign/core', Infinity),
  missing: p.findInstalledPackage(dir, 'left-pad'),
  core: p.findCoreDir(dir),
  projectCore: p.findProjectCoreDir(dir),
  projectOf: p.findProjectPackageOf(dir, ['@astryxdesign/cli', '@astryxdesign/core']),
}));
console.log(JSON.stringify(out));
`;
const dirs = ['', 'src', 'vendor/core', 'vendor', '.yarn/sdks', 'tools/other', 'tools', '..'].map(d => path.resolve(fixture, d));
const runtimes = {none: null, project: path.join(fixture, '.pnp.cjs'), nested: path.join(fixture, 'tools/other/.pnp.cjs'), quoted: `"${path.join(fixture, '.pnp.cjs')}"`};
const cases = [];
for (const [name, rt] of Object.entries(runtimes)) {
  const env = {...process.env};
  delete env.NODE_OPTIONS;
  if (rt) env.NODE_OPTIONS = `--require ${rt}`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe, JSON.stringify(dirs)], {env, encoding: 'utf8', cwd: fixture});
  if (r.status !== 0) throw new Error(r.stderr);
  cases.push({runtime: name, nodeOptions: env.NODE_OPTIONS ?? null, results: JSON.parse(r.stdout.trim().split('\n').pop())});
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.map(c => c.runtime + ':' + c.results.filter(x => x.installed).length).join(' '));
