// Test oracle only: dumps the JS discovery answers for a set of folders, so
// the Rust unit tests can prove equality. Never run by the binary.
// Usage: node scripts/discovery-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';

const [cliRoot, out] = process.argv.slice(2);
// Run from the sandbox app, where the JS CLI is the project's own CLI, as in
// the conformance runs.
process.chdir(path.resolve(cliRoot, '..', '..', 'apps', 'sandbox'));
const imp = rel => import(pathToFileURL(path.join(cliRoot, rel)).href);
const paths = await imp('foundation/fs/paths.mjs');
const pm = await imp('foundation/env/package-manager.mjs');
const rc = await imp('foundation/release/run-context.mjs');
const semver = await imp('foundation/env/semver.mjs');

const fx = path.join(os.tmpdir(), 'astryx-disc-fixtures');
fs.rmSync(fx, {recursive: true, force: true});
const w = (rel, text = '') => {
  const f = path.join(fx, rel);
  fs.mkdirSync(path.dirname(f), {recursive: true});
  fs.writeFileSync(f, text);
};
fs.mkdirSync(path.join(fx, '.git'), {recursive: true});
w('yarn1/package.json', '{"name":"a","dependencies":{"@astryxdesign/core":"^0.7.0"}}');
w('yarn1/yarn.lock', '# yarn lockfile v1\n');
w('berry/package.json', '{"packageManager":"yarn@4.1.0"}');
w('berry/package-lock.json', '{}');
w('tie/package.json', '{}');
w('tie/yarn.lock', '');
w('tie/pnpm-lock.yaml', '');
w('tie-ev/package.json', '{}');
w('tie-ev/yarn.lock', '');
w('tie-ev/pnpm-lock.yaml', '');
w('tie-ev/pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n  - packages/** # all\n');
w('tie-ev/apps/web/package.json', '{"name":"web"}');
w('ws/package.json', '{"workspaces":{"packages":["apps/*","!apps/skip"]},"devDependencies":{"@xds/core":"1"}}');
w('ws/apps/one/package.json', '{"name":"one"}');
w('ws/apps/skip/package.json', '{"name":"skip"}');
w('ws/apps/one/deep/a/b/c/d/e/.keep');
w('bun/bun.lockb', '');
w('bun/sub/x/.keep');
w('nothing/.keep');
w('core-src/packages/core/package.json', '{"name":"@astryxdesign/core","version":"9.9.9"}');
w('core-src/packages/core/src/Button/.keep');
w('core-src/packages/core/src/Avatar/.keep');
w('core-src/packages/core/src/utils/.keep');
w('core-src/node_modules/@astryxdesign/core/package.json', '{"name":"@astryxdesign/core","version":"1.0.0"}');
w('core-src/node_modules/.bin/astryx', '');
w('pnpm-lock/package.json', '{"name":"p","dependencies":{"@astryxdesign/core":"^0.7.0","@astryxdesign/cli":"0.7.3"}}');
w('pnpm-lock/pnpm-lock.yaml', "lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      '@astryxdesign/core':\n        specifier: ^0.7.0\n        version: 0.7.5(react@19.0.0)\n");

const sandbox = path.resolve(cliRoot, '..', '..', 'apps', 'sandbox');
const repo = path.resolve(cliRoot, '..', '..');
const dirs = [
  sandbox, path.join(sandbox, 'src'), repo, path.join(repo, 'packages', 'core'),
  cliRoot, os.tmpdir(), os.homedir(), '/',
  ...['yarn1', 'berry', 'tie', 'tie-ev', 'tie-ev/apps/web', 'ws', 'ws/apps/one',
    'ws/apps/skip', 'ws/apps/one/deep/a/b/c/d/e', 'bun/sub/x', 'nothing',
    'core-src', 'pnpm-lock'].map(d => path.join(fx, d)),
];
const safe = f => { try { return f(); } catch (e) { return {error: String(e.message), code: e.code ?? null}; } };
const cases = dirs.map(dir => ({
  dir,
  findCoreDir: safe(() => paths.findCoreDir(dir)),
  findProjectCoreDir: safe(() => paths.findProjectCoreDir(dir)),
  requireCoreDir: safe(() => paths.requireCoreDir(dir)),
  findAstryxProject: paths.findAstryxProject(dir),
  findWorkspaceRoot: paths.findWorkspaceRoot(dir),
  findPackageRoot: paths.findPackageRoot(dir),
  findProjectRoot: paths.findProjectRoot(dir),
  findInstalledCli: paths.findInstalledPackage(dir, '@astryxdesign/cli'),
  listComponents: (() => { const c = paths.findCoreDir(dir); return c ? paths.listComponents(c) : null; })(),
  explain: (() => { const r = pm.explainPackageManager(dir); return {pm: r.pm, ambiguous: r.ambiguous, dir: r.dir, candidates: r.candidates, declared: r.declared, source: r.source, stray: r.strayLockfiles}; })(),
  dlx: pm.getDlxPrefix(dir),
  docPm: pm.docPackageManager(dir),
  invocation: pm.getCliInvocation(dir),
  formatted: pm.formatCliCommand('astryx docs tokens', dir),
  answeredBy: rc.answeredBy(dir),
  runChoice: (() => { const c = rc.runChoice(dir); return {copy: c.copy, inProject: c.inProject}; })(),
}));
const versions = ['0.7.12', '1.0.0-rc.1', '0.8.0', '2.0.0', 'x.y'];
const ranges = ['^0.7.0', '~0.7', '>=0.7.12 <1', '1.0.0 - 2', '0', '*', 'workspace:*', '^0', '=0.8.0', '<0.8.0 || >=2'];
const semverCases = [];
for (const v of versions) for (const r of ranges) semverCases.push([v, r, semver.satisfiesRange(v, r)]);
const compares = [['0.10.0', '0.9.0'], ['1.0.0', '1.0'], ['a.b', 'a.c'], ['1.2.3-rc', '1.2.3']].map(([a, b]) => [a, b, Math.sign(semver.semverCompare(a, b))]);
const prefixText = 'Run `astryx docs`.\n```bash\n$ astryx build && astryx doctor | astryx x\n```\n~~~text\n`astryx a` astryx b\n~~~\n```tsx\nastryx no\n```\nastryx plain';
fs.writeFileSync(out, JSON.stringify({cliRoot, cwd: process.cwd(), home: os.homedir(), cases, semverCases, compares,
  prefix: [prefixText, pm.prefixCliCommands(prefixText, 'pnpm exec astryx')],
  quote: ['a b', "it's", '', 'x@1/y.z', 'a$b'].map(v => [v, pm.quoteCommandArgument(v, 'linux')]),
}, null, 1));
