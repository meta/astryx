// Test oracle only: docCommandsIn / findDocCommands / tokenForCommand.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {pathToFileURL} from 'node:url';
const [cliRoot, out] = process.argv.slice(2);
const rc = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/runner-commands.mjs')).href);
const ds = await import(pathToFileURL(path.join(cliRoot, 'foundation/doc-compiler/doc-syntax.mjs')).href);
const dd = await import(pathToFileURL(path.join(cliRoot, 'foundation/discovery/docs-discovery.mjs')).href);
const texts = [
  ['Run `npx astryx docs` then `pnpm exec astryx build x`.', null],
  ['npx -y astryx@latest init\npnpm astryx doctor && yarn astryx template x', 'bash'],
  ['`npm install @astryxdesign/core` and `pnpm add -D x` and `yarn global add astryx`', null],
  ['`astryx docs theme` `astryx component Button` `npm run build` `pnpm build` `npm test -- --watch`', null],
  ['{@command docs} {@command nope} {@command --version} {@pm install x} {@pm-only yarn "why" foo} {@foo bar} {@@command x} {@command docs', null],
  ['$ npm i -g @astryxdesign/cli\n$ bunx astryx docs # comment\nnpm pkg set name=x', 'sh'],
  ['npx astryx docs', 'tsx'],
  ['`npx tsc --noEmit` `npx @scope/tool` `npm exec -- astryx doctor` `bun x astryx`', null],
];
const tokens = ['astryx docs', 'npx tsc', 'npx --yes foo', 'pnpm dlx astryx docs', 'yarn global add x', 'yarn global list', 'npm i -DE react', 'npm run astryx -- docs', 'npm', 'pnpm build', 'npm pack', 'pnpm add --frozen x', 'bun add -d x', 'npm exec astryx', 'yarn exec -- astryx template x'];
const pkg = path.join(os.tmpdir(), 'astryx-commands-pkg');
fs.rmSync(pkg, {recursive: true, force: true});
fs.mkdirSync(path.join(pkg, 'docs'), {recursive: true});
fs.writeFileSync(path.join(pkg, 'docs/guide.doc.mjs'), `const intro = {title: 'Intro', content: [{type: 'prose', text: 'Run \`npx astryx docs\` first.'}]};
export default {type: 'generic', name: 'guide', title: 'Guide', description: 'd', sections: [intro,
  {title: 'Setup', content: [{type: 'code', lang: 'bash', code: 'npm install x\\npnpm exec astryx build'}, {type: 'prose', text: 'Then \`astryx doctor\` and \`npx astryx docs\`.'}]},
]};
`);
const found = await dd.discoverIntegrationDocs({name: '@x/c', docs: path.join(pkg, 'docs')});
fs.writeFileSync(out, JSON.stringify({
  texts: texts.map(([t, l]) => [t, l, rc.docCommandsIn(t, l)]),
  tokens: tokens.map(t => [t, ds.tokenForCommand(t)]),
  docsDir: path.join(pkg, 'docs'),
  notes: await rc.findDocCommands(found),
}, null, 1));
