// An app with ShadCN-copied compositions and their install receipts: valid
// (version 1 and 2, pristine and edited source, a JavaScript install), and
// broken ones (tampered hash, wrong filename, bad JSON, bad schema, two
// installed variants, a source linked outside the project, a linked receipt).
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

function receipt({name, itemPath, kind = 'example', version = '0.5.0', schema = 2, dir, files}) {
  return {
    schemaVersion: schema,
    item: {name, path: itemPath, aliases: [], kind},
    source: {package: '@astryxdesign/cli', version},
    files: files.map(f => {
      const file = {
        id: f.id ?? 'primary',
        target: `../${f.file}`,
        registryTarget: `components/astryx/${dir}/${f.file}`,
        registryPath: `registry/${name}/${f.file}`,
        sha256: f.sha ?? sha(f.content),
        content: f.content,
      };
      if (schema === 2) {
        file.variants = (f.variants ?? []).map(v => ({
          format: 'javascript',
          target: `../${v.file}`,
          registryTarget: `components/astryx/${dir}/${v.file}`,
          sha256: sha(v.content),
          content: v.content,
        }));
      }
      return file;
    }),
  };
}

const TSX = "export default function Example(): null {\n  return null;\n}\n";
const JSX = 'export default function Example() {\n  return null;\n}\n';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'registry-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  const json = (rel, value) => w(rel, `${JSON.stringify(value, null, 2)}\n`);
  const ex = 'src/components/astryx/examples';
  const bl = 'src/components/astryx/blocks';

  w(`${ex}/ButtonBasic.tsx`, TSX);
  json(`${ex}/.astryx/example-button-basic.json`, receipt({name: 'example-button-basic', itemPath: 'examples/button/basic', dir: 'examples', files: [{file: 'ButtonBasic.tsx', content: TSX}]}));
  w(`${ex}/.astryx/notes.txt`, 'not a receipt\n');

  w(`${ex}/Modified.tsx`, TSX.replace('null;\n}', 'null; // edited\n}'));
  json(`${ex}/.astryx/example-modified.json`, receipt({name: 'example-modified', itemPath: 'examples/modified', dir: 'examples', files: [{file: 'Modified.tsx', content: TSX}]}));

  w(`${ex}/Compiled.jsx`, JSX);
  json(`${ex}/.astryx/example-compiled.json`, receipt({name: 'example-compiled', itemPath: 'examples/compiled', schema: 1, dir: 'examples', files: [{file: 'Compiled.tsx', content: TSX}]}));

  w(`${ex}/Both.tsx`, TSX);
  w(`${ex}/Both.jsx`, JSX);
  json(`${ex}/.astryx/example-both.json`, receipt({name: 'example-both', itemPath: 'examples/both', dir: 'examples', files: [{file: 'Both.tsx', content: TSX, variants: [{file: 'Both.jsx', content: JSX}]}]}));

  w('outside/Escape.tsx', TSX);
  fs.mkdirSync(path.join(dir, ex), {recursive: true});
  fs.symlinkSync('../../../../outside/Escape.tsx', path.join(dir, ex, 'Escape.tsx'));
  json(`${ex}/.astryx/example-escape.json`, receipt({name: 'example-escape', itemPath: 'examples/escape', dir: 'examples', files: [{file: 'Escape.tsx', content: TSX}]}));

  w(`${ex}/Linked.tsx`, TSX);
  fs.symlinkSync('Linked.tsx', path.join(dir, ex, 'LinkedCopy.tsx'));
  json(`${ex}/.astryx/example-linked.json`, receipt({name: 'example-linked', itemPath: 'examples/linked', kind: 'showcase', dir: 'examples', files: [{file: 'LinkedCopy.tsx', content: TSX}]}));

  w(`${bl}/Hero.tsx`, TSX);
  json(`${bl}/.astryx/block-tampered.json`, receipt({name: 'block-tampered', itemPath: 'blocks/hero', kind: 'block', dir: 'blocks', files: [{file: 'Hero.tsx', content: TSX, sha: '0'.repeat(64)}]}));
  json(`${bl}/.astryx/wrong-name.json`, receipt({name: 'block-other', itemPath: 'blocks/other', kind: 'block', dir: 'blocks', files: [{file: 'Hero.tsx', content: TSX}]}));
  w(`${bl}/.astryx/block-broken.json`, '{"schemaVersion": 2,\n');
  const bad = receipt({name: 'block-schema', itemPath: 'blocks/schema', kind: 'block', dir: 'blocks', files: [{file: 'Hero.tsx', content: TSX}]});
  bad.item.kind = 'widget';
  bad.extra = true;
  bad.files[0].target = '../../Hero.tsx';
  json(`${bl}/.astryx/block-schema.json`, bad);
  json('shared/block-linked.json', receipt({name: 'block-linked', itemPath: 'blocks/linked', kind: 'block', dir: 'blocks', files: [{file: 'Hero.tsx', content: TSX}]}));
  fs.symlinkSync('../../../../../shared/block-linked.json', path.join(dir, bl, '.astryx/block-linked.json'));

  w('src/pages/Home.tsx', TSX);
  json('src/pages/.astryx/page-home.json', receipt({name: 'page-home', itemPath: 'pages/home', kind: 'page', version: 'canary', dir: 'pages', files: [{file: 'Home.tsx', content: TSX}]}));

  w('src/node_modules/x/.astryx/ignored.json', '{}\n');
  w('src/dist/.astryx/ignored.json', '{}\n');
}
