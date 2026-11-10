// Test oracle only: contribution-fixes over crafted packages.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const cf = await import(pathToFileURL(path.join(cliRoot, 'foundation/integrations/contribution-fixes.mjs')).href);
const base = path.join(os.tmpdir(), 'astryx-fixes');
fs.rmSync(base, {recursive: true, force: true});
const w = (rel, text) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, text); };
const doc = (type, name, extra = '') => `export default {type: '${type}', name: '${name}', description: 'd'${extra}};\n`;
// p1: components root holds a generic topic, a theme and a template; a stray component outside.
w('p1/package.json', '{"name":"p1"}');
w('p1/src/components/Button.doc.mjs', doc('component', 'Button'));
w('p1/src/components/Button.tsx', 'export {};');
w('p1/src/components/guide.doc.mjs', doc('generic', 'guide'));
w('p1/src/components/hero.template.ts', "export const docs = {type: 'block', name: 'Hero'} satisfies X;\n");
w('p1/src/components/hero.tsx', 'export {};');
w('p1/src/components/ocean.doc.mjs', doc('theme', 'ocean'));
w('p1/src/components/ocean.ts', "import './shared.ts';\nexport {};");
w('p1/src/components/shared.ts', 'export {};');
w('p1/extra/Card.doc.mjs', doc('component', 'Card'));
w('p1/extra/Card.tsx', 'export {};');
w('p1/lost/Thing.doc.ts', `export default defineDoc({type: 'component', name: 'Thing'} as const);\n`);
w('p1/themes-src/sunset/sunset.doc.mjs', doc('theme', 'sunset'));
w('p1/themes-src/sunset/sunset.ts', "import '../../lib/tokens.ts';\nimport {a} from '../../lib/more';\nexport {};");
w('p1/lib/tokens.ts', "import './deep.mjs';\nexport {};");
w('p1/lib/deep.mjs', 'export {};');
w('p1/lib/more.ts', 'export const a = 1;');
w('p1/docs2/topic.doc.mjs', doc('generic', 'topic'));
w('p1/broken.doc.mjs', 'export default {type: ;\n');
// p2: package root is the components root and the codemods root.
w('p2/package.json', '{"name":"p2"}');
w('p2/Button.doc.mjs', doc('component', 'Button'));
w('p2/Button.tsx', 'export {};');
w('p2/intro.doc.mjs', doc('generic', 'intro'));
w('p2/1.0.0/rename.mjs', 'export default {};');
w('p2/templates/page.template.mjs', doc('page', 'Page'));
// p3: templates root inside components root; codemods holds docs.
w('p3/package.json', '{"name":"p3"}');
w('p3/ui/Button.doc.mjs', doc('component', 'Button'));
w('p3/ui/Button.tsx', 'export {};');
w('p3/ui/templates/Hero.doc.mjs', doc('block', 'Hero'));
w('p3/ui/templates/Hero.tsx', 'export {};');
w('p3/stray/Hero.doc.mjs', doc('block', 'Hero'));
w('p3/mods/docs/a.doc.mjs', doc('generic', 'a'));
w('p3/mods/2.0.0/x.mjs', 'export default {};');
w('p3/elsewhere/a.doc.mjs', doc('generic', 'A'));
const P = rel => path.join(base, rel);
const pkgs = {
  p1: {components: P('p1/src/components'), templates: undefined, docs: P('p1/docs2'), themes: undefined, codemods: undefined, __manifestFile: P('p1/astryx.integration.ts')},
  p2: {components: P('p2'), codemods: P('p2'), templates: undefined},
  p3: {components: P('p3/ui'), templates: P('p3/ui/templates'), codemods: P('p3/mods'), docs: P('p3/mods/docs')},
};
const cases = [];
const run = (pkg, fn, args) => {
  const ctx = cf.createFixContext(P(pkg), pkgs[pkg]);
  let result;
  const file = args[0] && P(args[0]);
  const stamp = file ? cf.stampOf(ctx, file) : null;
  try {
    if (fn === 'stamp') result = stamp;
    else if (fn === 'unreachable') result = cf.unreachableFix(ctx, file, stamp);
    else if (fn === 'notAComponent') result = cf.notAComponentFix(ctx, file, stamp);
    else if (fn === 'notACodemod') result = cf.notACodemodFix(ctx, file, stamp, args[1] ?? undefined, args[2] ?? undefined);
    else if (fn === 'sharedCodemods') result = cf.sharedCodemodsRootFix(ctx, args[1] ?? undefined);
    else if (fn === 'heldRoot') result = cf.heldRootFix(ctx, P(args[1]));
    else if (fn === 'newComponentDocNote') result = cf.newComponentDocNote(ctx);
    else if (fn === 'themeImporting') { const r = cf.themeImporting(ctx, file); result = r && {doc: r.doc, stamp: r.stamp, source: r.source}; }
  } catch (e) { result = {error: String(e.message)}; }
  cases.push({pkg, dir: P(pkg), integration: pkgs[pkg], fn, args: args.map((a, i) => (i === 0 && a) ? P(a) : a), result: result ?? null});
};
for (const f of ['p1/src/components/guide.doc.mjs', 'p1/src/components/hero.template.ts', 'p1/src/components/ocean.doc.mjs', 'p1/src/components/Button.doc.mjs']) { run('p1', 'stamp', [f]); run('p1', 'notAComponent', [f]); }
for (const f of ['p1/extra/Card.doc.mjs', 'p1/lost/Thing.doc.ts', 'p1/themes-src/sunset/sunset.doc.mjs', 'p1/docs2/topic.doc.mjs']) { run('p1', 'stamp', [f]); run('p1', 'unreachable', [f]); run('p1', 'notACodemod', [f, null, null]); }
run('p1', 'stamp', ['p1/broken.doc.mjs']);
run('p1', 'themeImporting', ['p1/src/components/shared.ts']);
run('p1', 'newComponentDocNote', [null]);
run('p2', 'notAComponent', ['p2/intro.doc.mjs']);
run('p2', 'unreachable', ['p2/templates/page.template.mjs']);
run('p2', 'sharedCodemods', [null, 'stray.mjs']);
run('p2', 'sharedCodemods', [null, null]);
run('p2', 'notACodemod', ['p2/intro.doc.mjs', 'intro.ts', 'helper.ts']);
run('p2', 'newComponentDocNote', [null]);
run('p3', 'notAComponent', ['p3/ui/templates/Hero.doc.mjs']);
run('p3', 'unreachable', ['p3/stray/Hero.doc.mjs']);
run('p3', 'notAComponent', ['p3/stray/Hero.doc.mjs']);
run('p3', 'sharedCodemods', [null, 'x.mjs']);
run('p3', 'heldRoot', [null, 'p3/mods']);
run('p3', 'unreachable', ['p3/elsewhere/a.doc.mjs']);
run('p3', 'notACodemod', ['p3/mods/docs/a.doc.mjs', null, null]);
run('p3', 'newComponentDocNote', [null]);
fs.writeFileSync(out, JSON.stringify(cases, null, 1));
console.log(cases.length, cases.filter(c => c.result?.error).length);
