// Test oracle only: decidePackageManagerIn / explainPackageManager and the
// template needs' "no install command" text over every lockfile mix.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const pm = await import(pathToFileURL(path.join(cliRoot, 'foundation/env/package-manager.mjs')).href);
const tn = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/template-needs.mjs')).href);
const base = path.join(os.tmpdir(), 'astryx-pm');
fs.rmSync(base, {recursive: true, force: true});
const files = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'package-lock.json'];
const extras = [[], ['pnpm-workspace.yaml'], ['.yarnrc.yml'], ['bunfig.toml']];
const cases = [];
delete process.env.npm_config_user_agent;
for (let mask = 0; mask < 1 << files.length; mask++) {
  for (const [ei, extra] of extras.entries()) {
    if (ei > 0 && mask % 3 !== 0) continue;
    const dir = path.join(base, `m${mask}-e${ei}`);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
    files.forEach((f, i) => { if (mask & (1 << i)) fs.writeFileSync(path.join(dir, f), ''); });
    for (const e of extra) fs.writeFileSync(path.join(dir, e), '');
    const d = pm.decidePackageManagerIn(dir);
    const needs = tn.analyzeTemplateNeeds("import {motion} from 'framer-motion';\n", dir);
    cases.push({dir, decision: d ? {pm: d.pm, ambiguous: d.ambiguous, lockfiles: d.lockfiles.map(l => l.file)} : null, notes: needs.notes});
  }
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.length);
