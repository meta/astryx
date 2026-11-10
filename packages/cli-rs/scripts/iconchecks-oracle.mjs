// Test oracle only: iconSetIssues / iconSetCoverage over crafted icon packages.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const imp = rel => import(pathToFileURL(path.join(cliRoot, rel)).href);
const fx = await imp('test-utils/icon-set-fixture.mjs');
const ic = await imp('foundation/discovery/icon-set-checks.mjs');
const base = path.join(os.tmpdir(), 'astryx-iconchecks');
fs.rmSync(base, {recursive: true, force: true});
const specs = {
  basic: {},
  complete: (() => { const c = fx.completeGlyphs(); return {data: {...c.data, module: '@acme/glyphs'}, modules: c.modules}; })(),
  mismatch: (() => { const c = fx.completeGlyphs(); const m = {...c.modules}; m['theme.js'] = m['theme.js'].replace('close: XIcon,', 'close: HomeIcon,\n  extra: XIcon,').replace('  search: Magnifier,\n', '  search: make(),\n'); return {data: {...c.data, module: '@acme/glyphs'}, modules: m}; })(),
  missingExports: {data: {...fx.glyphsData(), module: '@acme/glyphs', icons: [...fx.glyphsData().icons, {id: 'gone', export: 'GoneIcon'}, {id: 'bad', export: 'badName', module: '@other/lib'}], adapter: {module: './adapt', export: 'toIcon'}}},
  upstream: {data: {...fx.glyphsData(), module: '@acme/glyphs', source: {package: 'lucide-react', version: '0.1.0'}}, dependencies: {'lucide-react': '^0.2.0'}},
  dataIcon: {modules: {...fx.glyphsModules(), 'icons/home.js': 'export const HomeIcon = {d: "x"};\n'}},
  brokenModule: {modules: {...fx.glyphsModules(), 'icons/x.js': 'export const XIcon = ;\n'}},
  noThemeMap: {data: (() => { const d = {...fx.glyphsData(), module: '@acme/glyphs'}; delete d.themeMap; return d; })()},
  ownDefs: {definitions: {rotate: fx.definitionSource('rotate'), close: fx.definitionSource('close')}, data: {...fx.glyphsData(), module: '@acme/glyphs', icons: [...fx.glyphsData().icons, {id: 'rotate-cw', export: 'RotateCwIcon', words: ['rotate']}]}},
};
const cases = [];
for (const [name, spec] of Object.entries(specs)) {
  const dir = path.join(base, name);
  fx.writeIconPackage(dir, spec);
  const loaded = {name: '@acme/glyphs', iconSets: path.join(dir, 'icon-sets')};
  const unchecked = new Map();
  const issues = ic.iconSetIssues(dir, loaded, unchecked);
  cases.push({name, dir, loaded, issues, unchecked: [...unchecked], coverage: ic.iconSetCoverage(loaded, unchecked)});
}
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.map(c => `${c.name}:${c.issues.length}`).join(' '));
