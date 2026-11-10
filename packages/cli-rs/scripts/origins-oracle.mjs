// Test oracle only: module-exports origin/verdict reads over crafted modules.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const me = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/module-exports.mjs')).href);
const base = path.join(os.tmpdir(), 'astryx-origins');
fs.rmSync(base, {recursive: true, force: true});
const w = (rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, text); };
w('pkg/package.json', '{"name":"pkg","exports":{".":"./index.js","./icons":"./icons/index.js"}}');
w('pkg/index.js', `export {XIcon, YIcon as ZIcon} from './icons/x.js';
export * from './icons/more.js';
export * as ns from './icons/more.js';
import {Lib} from 'lib';
import Def from './def.js';
import * as All from './def.js';
export {Lib, Def, All};
export const Alias = XIconLocal;
import {XIcon as XIconLocal} from './icons/x.js';
export const themeIcons = {close: XIconLocal, search: <SearchIcon />, trash: createElement(TrashIcon), home: React.createElement(HomeIcon, null), bad: 1 + 2, nope: <a.b />};
import {SearchIcon, TrashIcon, HomeIcon} from './icons/more.js';
export const data = {a: 1};
export const list = [1];
export const str = 'x';
export function Fn() {}
export class Klass {}
export const arrow = () => null;
export const called = make();
export const member = Obj.prop;
export const wrapped = (XIconLocal as any);
export default Fn;
export declare const amb: number;
export type T = string;
export interface I {}
export const enum CE { A }
export enum E { A }
export namespace NS { export const a = 1; }
export const {d1, d2} = obj;
export const dyn = {...spread};
export const computed = {[k]: 1};
export const method = {m() {}};
export {missing} from './nowhere.js';
export {fromLib} from 'otherlib';
`);
w('pkg/icons/x.js', "export const XIcon = () => null;\nexport function YIcon() {}\n");
w('pkg/icons/more.js', "export const SearchIcon = () => null;\nexport const TrashIcon = () => null;\nexport const HomeIcon = () => null;\nexport * from './deep.js';\n");
w('pkg/icons/deep.js', "export const DeepIcon = () => null;\n");
w('pkg/icons/index.js', "export * from '../index.js';\n");
w('pkg/def.js', "export default function Def() {}\n");
w('pkg/cjs.js', "module.exports = {a: 1};\nexport const b = 1;\n");
w('pkg/assign.ts', "const a = 1;\nexport = a;\n");
w('pkg/broken.js', "export const a = ;\n");
w('pkg/reexport-broken.js', "export * from './broken.js';\nexport const ok = 1;\n");
w('pkg/ns.ts', "export namespace Icons { export const InnerIcon = () => null; export namespace Deep { export function DeepFn() {} } }\ndeclare module 'virtual' { export const V: number; export default function vd(): void; }\nnamespace Hidden { export const HiddenIcon = () => null; }\nexport const top = 1;\n");
w('pkg/uses-ns.ts', "import {InnerIcon, HiddenIcon, DeepFn, V, top} from './ns.ts';\nexport const Alias2 = InnerIcon;\nexport const Alias3 = HiddenIcon;\nexport const Alias4 = DeepFn;\nexport const Alias5 = V;\nexport const Alias6 = top;\nexport const map2 = {inner: InnerIcon, hidden: <HiddenIcon />, deep: DeepFn, top};\nexport {InnerIcon as ReInner} from './ns.ts';\n");
const broken = {
  'b-brace.js': 'export function A() {\n  return 1;\n',
  'b-string.js': "export const a = 'abc;\n",
  'b-jsx.tsx': 'export const A = () => <div><span></div>;\n',
  'b-default.js': 'export default {\n  a: 1,\n',
  'b-ts.ts': 'export const a: = 1;\n',
  'b-keyword.js': 'export const class = 1;\n',
  'b-paren.js': 'export const a = (1 + 2;\n',
  'b-arrow.js': 'export const a = => 1;\n',
  'b-import.js': "import {a from './x';\n",
  'b-dup.js': 'export const a = 1;\nexport const a = 2;\n',
  'b-await.js': 'function f() { await x; }\nexport {f};\n',
  'b-generic.tsx': 'export const f = <T>(x: T) => x;\n',
};
for (const [f, t] of Object.entries(broken)) w(`pkg/broken/${f}`, t);
w('pkg/scalars.ts', "export const s = 'a' as const;\nexport const t = `x`;\nexport const u = `x${1}`;\nexport const n = (3);\nexport const b = true satisfies boolean;\nexport const o = {};\nconst inner = 'q';\nexport {inner as aliasS};\nexport default 42;\nexport declare const d: string;\nexport type T = 1;\nexport * from './icons/more.js';\nexport * as nsx from './icons/x.js';\n");
w('pkg/node_modules/lib/package.json', '{"name":"lib","main":"main.js"}');
w('pkg/node_modules/lib/main.js', "export const Lib = 1;\n");
const P = rel => path.join(base, rel);
const names = ['s', 't', 'u', 'n', 'b', 'o', 'aliasS', 'd', 'nsx', 'InnerIcon', 'V', 'top', 'Alias2', 'Alias3', 'Alias4', 'Alias5', 'Alias6', 'map2', 'Icons', 'ReInner', 'HiddenIcon', 'XIcon', 'ZIcon', 'YIcon', 'DeepIcon', 'SearchIcon', 'ns', 'Lib', 'Def', 'All', 'Alias', 'themeIcons', 'data', 'list', 'str', 'Fn', 'Klass', 'arrow', 'called', 'member', 'wrapped', 'default', 'amb', 'T', 'I', 'CE', 'E', 'NS', 'd1', 'dyn', 'computed', 'method', 'missing', 'fromLib', 'nothing'];
const cases = [];
const ser = o => o ? {file: o.file, name: o.name} : null;
for (const file of ['pkg/index.js', 'pkg/icons/index.js', 'pkg/cjs.js', 'pkg/assign.ts', 'pkg/broken.js', 'pkg/ns.ts', 'pkg/uses-ns.ts', 'pkg/scalars.ts']) {
  for (const name of [...names, 'a', 'b']) {
    const v = me.exportOriginVerdict(P(file), name);
    const origin = me.moduleExportOrigin(P(file), name);
    const b = me.staticExportBindings(P(file), name);
    cases.push({file: P(file), name, verdict: v.verdict, origin: ser(v.origin), reason: v.reason ?? null,
      plain: me.moduleExportVerdict(P(file), name).verdict,
      kind: me.exportValueKind(P(file), name),
      scalar: me.exportScalarType(P(file), name),
      aliased: origin ? ser(me.aliasedOrigin(origin)) : null,
      bindings: b ? [...b].map(([k, o]) => [k, ser(o)]) : null});
  }
}
const failures = ['pkg/index.js', 'pkg/broken.js', 'pkg/reexport-broken.js', 'pkg/ns.ts', ...Object.keys(broken).map(f => `pkg/broken/${f}`)].map(f => {
  const r = me.moduleParseFailure(P(f));
  return [P(f), r ? [r.file, r.message] : null];
});
const followed = ['pkg/index.js', 'pkg/icons/index.js', 'pkg/scalars.ts', 'pkg/ns.ts', 'pkg/cjs.js', 'pkg/broken.js'].map(f => [P(f), me.followedExportNames(P(f))]);
fs.writeFileSync(out, JSON.stringify({cases, failures, followed}, null, 1));
console.log(cases.length, JSON.stringify(failures));
