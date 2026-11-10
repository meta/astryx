// Test oracle only: elementPropOrigins with doctor's definedThemeBase unwrap.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const me = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/module-exports.mjs')).href);
// Copy of api/doctor/theme-checks.mjs definedThemeBase (not exported).
function definedThemeBase(init) {
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'Identifier' || init.callee.name !== 'defineTheme') return null;
  const options = init.arguments?.[0];
  if (options?.type !== 'ObjectExpression') return null;
  const base = options.properties.find(p => p.type === 'ObjectProperty' && !p.computed && (p.key?.name ?? p.key?.value) === 'extends');
  return base?.value ?? null;
}
const base = path.join(os.tmpdir(), 'astryx-elemprops');
fs.rmSync(base, {recursive: true, force: true});
const w = (rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, text); };
w('app/package.json', '{"name":"app"}');
w('app/node_modules/@acme/themes/package.json', '{"name":"@acme/themes","exports":{".":"./index.js"}}');
w('app/node_modules/@acme/themes/index.js', "export const oceanTheme = {};\nexport {forestTheme} from './forest.js';\n");
w('app/node_modules/@acme/themes/forest.js', 'export const forestTheme = {};\n');
w('app/src/theme.ts', "import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanTheme} from '@acme/themes';\nexport const mine = defineTheme({extends: oceanTheme, tokens: {}});\nexport const plain = defineTheme({tokens: {}});\nexport const viaMember = defineTheme({extends: lib.theme});\nexport const alias = mine;\nexport const literal = {a: 1};\n");
w('app/src/App.tsx', `import {Theme} from '@astryxdesign/core';
import {Theme as T2} from '@astryxdesign/core/theme';
import type {Theme as TT} from '@astryxdesign/core';
import {Other} from '@astryxdesign/core';
import {mine, plain, viaMember, alias, literal} from './theme';
import {forestTheme} from '@acme/themes';
const local = forestTheme;
export function App() {
  return <Theme theme={mine}><T2 theme={alias as any}><Theme theme={plain} /><Theme theme={viaMember} /><Theme theme={local} /><Theme theme={literal} /><Theme theme="x" /><Theme /><Other theme={mine} /><TT theme={mine} /><Theme theme={missing} /></T2></Theme>;
}
`);
const P = r => path.join(base, r);
const ser = o => o ? {file: o.file, name: o.name} : null;
const sources = new Set(['@astryxdesign/core', '@astryxdesign/core/theme']);
const r1 = me.elementPropOrigins(P('app/src/App.tsx'), {sources, name: 'Theme', prop: 'theme', unwrap: definedThemeBase}).map(ser);
const r2 = me.elementPropOrigins(P('app/src/App.tsx'), {sources, name: 'Theme', prop: 'theme'}).map(ser);
fs.writeFileSync(out, JSON.stringify({file: P('app/src/App.tsx'), unwrapped: r1, plain: r2}, null, 1));
console.log(JSON.stringify(r1));
