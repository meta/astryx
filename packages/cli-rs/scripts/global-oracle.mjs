// Test oracle only: installPlaceOf / globalFolderOf with a pinned home and env.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const ch = await import(pathToFileURL(path.join(cliRoot, 'foundation/release/choose.mjs')).href);
const base = path.join(os.tmpdir(), 'astryx-global');
fs.rmSync(base, {recursive: true, force: true});
const home = path.join(base, 'home');
const mk = rel => { const d = path.join(base, rel); fs.mkdirSync(d, {recursive: true}); return d; };
mk('home');
fs.writeFileSync(path.join(home, '.bunfig.toml'), `globalDir = "${path.join(base, 'bunglobal')}"\n`);
fs.writeFileSync(path.join(home, '.npmrc'), `global-dir=${path.join(base, 'pnpmdir')}\n`);
const envs = {
  plain: {},
  custom: {BUN_INSTALL: path.join(base, 'buninst'), YARN_GLOBAL_FOLDER: path.join(base, 'yarnglobal'), PNPM_HOME: path.join(base, 'pnpmhome'), XDG_DATA_HOME: path.join(base, 'xdg')},
  xdg: {XDG_DATA_HOME: path.join(base, 'xdg'), XDG_CONFIG_HOME: path.join(base, 'xdgconf')},
};
const cli = 'node_modules/@astryxdesign/cli';
const roots = [
  `home/.bun/install/global/${cli}`,
  `bunglobal/${cli}`,
  `buninst/install/global/${cli}`,
  `home/.config/yarn/global/${cli}`,
  `yarnglobal/${cli}`,
  `xdg/yarn/global/${cli}`,
  `home/.local/share/pnpm/global/5/${cli}`,
  `home/.local/share/pnpm/global/v11/abc/${cli}`,
  `home/.local/share/pnpm/global/v11/abc/node_modules/.pnpm/@astryxdesign+cli@1.0.0/${cli}`,
  `home/.local/share/pnpm/global/5/.pnpm/@astryxdesign+cli@1.0.0/${cli}`,
  `pnpmhome/global/5/${cli}`,
  `xdg/pnpm/global/v11/x/${cli}`,
  `pnpmdir/5/${cli}`,
  `home/.npm/_npx/123/${cli}`,
  `app/${cli}`,
  `lookalike/install/global/${cli}`,
  `nomodules/cli`,
];
const cases = [];
for (const r of roots) mk(r);
for (const [ename, env] of Object.entries(envs)) {
  for (const r of roots) {
    const root = path.join(base, r);
    const g = ch.globalFolderOf(root, {home, env, platform: 'linux'});
    cases.push({env: ename, envVars: env, root, place: ch.installPlaceOf(root), global: g ? [g.manager, g.folder] : null});
  }
}
fs.writeFileSync(out, JSON.stringify({home, cases}, null, 1));
console.log(cases.filter(c => c.global).length, '/', cases.length);
