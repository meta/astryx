// Test oracle only: findStrayPointers on a crafted package.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const imp = rel => import(pathToFileURL(path.join(cliRoot, rel)).href);
const sp = await imp('foundation/discovery/stray-pointers.mjs');
const dd = await imp('foundation/discovery/docs-discovery.mjs');
const pkg = path.join(os.tmpdir(), 'astryx-stray-pkg');
fs.rmSync(pkg, {recursive: true, force: true});
fs.mkdirSync(path.join(pkg, 'docs'), {recursive: true});
fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
fs.writeFileSync(path.join(pkg, 'docs/menus.doc.mjs'), `export default {type: 'generic', name: 'menus', title: 'Menus', description: 'See \`astryx docs color\` and \`astryx docs extra\`.', sections: [
  {title: 'Use', content: [{type: 'prose', text: 'Read {@command docs popovers} first, then \`astryx docs nope\`.'}, {type: 'list', style: 'unordered', items: ['Try \`astryx docs menus\`.']}, {type: 'table', headers: ['a'], rows: [['\`astryx docs tokens\`']]}]},
]};
`);
fs.writeFileSync(path.join(pkg, 'docs/popovers.doc.mjs'), `export default {type: 'generic', name: 'popovers', title: 'Popovers', description: 'Popovers.', sections: [{title: 'X', content: [{type: 'prose', text: 'x'}]}]};\n`);
fs.writeFileSync(path.join(pkg, 'docs/extra.doc.mjs'), `export default {type: 'generic', name: 'extra', title: 'Extra', description: 'Extra.', extends: 'color', sections: [{title: 'More', content: [{type: 'prose', text: 'see \`astryx docs extra\`'}]}]};\n`);
fs.writeFileSync(path.join(pkg, 'components/Thing.doc.mjs'), `export default {type: 'component', name: 'Thing', description: 'Open \`astryx docs menus\`.', props: [{name: 'a', type: 'string', description: 'See \`astryx docs color\`.'}]};\n`);
const found = await dd.discoverIntegrationDocs({name: '@x/stray', docs: path.join(pkg, 'docs')});
fs.writeFileSync(out, JSON.stringify({docsDir: path.join(pkg, 'docs'), components: [['Thing', path.join(pkg, 'components/Thing.doc.mjs')]],
  found: await sp.findStrayPointers({...found, components: [{name: 'Thing', file: path.join(pkg, 'components/Thing.doc.mjs')}]})}, null, 1));
