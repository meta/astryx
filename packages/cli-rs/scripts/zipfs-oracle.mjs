// Test oracle only: what PnP's patched fs reports for virtual and zipped
// paths in the yarnpnpzip fixture built at <fixture> (default /tmp/pnpz2).
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
const [, out, fixture = '/tmp/pnpz2'] = process.argv.slice(2);
const probe = `
const fs = require('fs');
const path = require('path');
const pnp = require('pnpapi');
const core = pnp.resolveToUnqualified('@astryxdesign/core', process.cwd() + '/');
const zip = fs.readdirSync('.yarn/cache').filter(f => f.endsWith('.zip')).map(f => path.resolve('.yarn/cache', f))[0];
const probes = [core, core + 'package.json', core + 'src', core + 'src/Button', core + 'src/Button/Button.doc.mjs', core + 'missing', zip, zip + '/node_modules', zip + '/node_modules/@astryxdesign/core/src/Button/Button.doc.mjs', zip + '/nope'];
const res = probes.map(p => {
  let kind = null, text = null, list = null;
  try { const s = fs.statSync(p); kind = s.isDirectory() ? 'dir' : s.isFile() ? 'file' : 'other'; } catch {}
  if (kind === 'file') text = fs.readFileSync(p, 'utf8');
  if (kind === 'dir') list = fs.readdirSync(p, {withFileTypes: true}).map(d => [d.name, d.isDirectory()]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return {path: p, exists: fs.existsSync(p), kind, text, list};
});
console.log(JSON.stringify(res));
`;
const r = spawnSync(process.execPath, ['-e', probe], {cwd: fixture, encoding: 'utf8', env: {...process.env, NODE_OPTIONS: `--require ${fixture}/.pnp.cjs`}, maxBuffer: 1 << 28});
if (r.status !== 0) throw new Error(r.stderr);
fs.writeFileSync(out, r.stdout.trim().split('\n').pop());
console.log('ok');
