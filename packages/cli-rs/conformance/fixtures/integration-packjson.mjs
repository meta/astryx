// integration verify: integration packages whose package.json npm pack
// refuses or reads oddly, one package per subfolder.
import * as path from 'node:path';

const DOC =
  "export default {type: 'generic', name: 'guide', title: 'Guide', description: 'Guide.', sections: [{title: 'Intro', content: [{type: 'prose', text: 'Hello.'}]}]};\n";

export default async function (dir, h) {
  const pkg = async (name, json) => {
    const d = path.join(dir, name);
    await h.writeJson(path.join(d, 'package.json'), json);
    await h.writeFile(path.join(d, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
    await h.writeFile(path.join(d, 'docs/guide.doc.mjs'), DOC);
  };
  await pkg('noversion', {name: '@acme/noversion'});
  await pkg('noname', {version: '1.0.0'});
  await pkg('emptyversion', {name: '@acme/emptyversion', version: ''});
  await pkg('numversion', {name: '@acme/numversion', version: 1});
  await pkg('oddversion', {name: '@acme/oddversion', version: 'v2'});
}
