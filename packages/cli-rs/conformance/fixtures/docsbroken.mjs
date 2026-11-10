// docsint plus one invalid doc: the integration's docs are withdrawn.
import {DOCS, makeDocsApp} from './docsint.mjs';

export default async function (dir, h) {
  await makeDocsApp(dir, h, {
    ...DOCS,
    'broken.doc.mjs': "export default {type: 'generic', name: 'broken'};\n",
  });
}
