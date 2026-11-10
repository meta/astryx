// Test oracle only: findCopiedPassages and findFluff on a crafted package
// that copies Core's guides and its own topics, and pads its prose.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const imp = rel => import(pathToFileURL(path.join(cliRoot, rel)).href);
const cp = await imp('foundation/discovery/copied-passages.mjs');
const fl = await imp('foundation/discovery/doc-fluff.mjs');
const dd = await imp('foundation/discovery/docs-discovery.mjs');
// The longest prose string of a Core guide, to copy.
let longest = '';
for (const f of dd.builtinGuideFiles()) {
  const doc = await cp.loadQuietly(f);
  if (!doc) continue;
  for (const {text} of cp.proseStrings(doc)) if (text.length > longest.length && text.length < 600 && !text.includes('`')) longest = text;
}
const pkg = path.join(os.tmpdir(), 'astryx-prose-pkg');
fs.rmSync(pkg, {recursive: true, force: true});
fs.mkdirSync(path.join(pkg, 'docs'), {recursive: true});
const shared = 'Menus open from a trigger button and close when the person picks an item or presses Escape anywhere on the page outside the menu panel itself.';
const glue = Array.from({length: 30}, () => 'it is the one that is there and it was so').join(' ');
fs.writeFileSync(path.join(pkg, 'docs/menus.doc.mjs'), `export default {type: 'generic', name: 'menus', title: 'Menus', description: 'About menus.', sections: [
  {title: 'Behavior', content: [{type: 'prose', text: ${JSON.stringify(shared)}}]},
  {title: 'Copied', content: [{type: 'prose', text: ${JSON.stringify(longest)}}]},
]};
`);
fs.writeFileSync(path.join(pkg, 'docs/popovers.doc.mjs'), `export default {type: 'generic', name: 'popovers', title: 'Popovers', description: 'It is important to note that popovers float. Basically they float.', sections: [
  {title: 'Notes', content: [{type: 'prose', text: ${JSON.stringify('Note that ' + shared)}}, {type: 'prose', text: 'In order to open it, as mentioned above, click. It is worth noting that "in order to" is quoted. Obviously.'}]},
  {title: 'Glue', content: [{type: 'prose', text: ${JSON.stringify(glue)}}]},
]};
`);
const found = await dd.discoverIntegrationDocs({name: '@x/prose', docs: path.join(pkg, 'docs')});
const texts = ['It is important to note that x.', 'Note that a note that explains.', "Don't say 'basically' or `obviously`.", 'non-obviously essentially.'];
fs.writeFileSync(out, JSON.stringify({
  docsDir: path.join(pkg, 'docs'),
  copied: await cp.findCopiedPassages(found),
  fluff: await fl.findFluff(found),
  filler: texts.map(t => [t, fl.fillerAt(t)]),
  median: await fl.coreDensityMedian(),
}, null, 1));
