// An integration topic that extends a CLI topic with two sections under one
// authored ID: merging it fails.
import {makeDocsApp} from './docsint.mjs';

const DOCS = {
  'theme-dup.doc.mjs': `export default {
  type: 'generic',
  name: 'theme-dup',
  title: 'Theme dup',
  description: 'Duplicate IDs.',
  extends: 'theme',
  sections: [
    {id: 'acme-dup', title: 'First', content: [{type: 'prose', text: 'One.'}]},
    {id: 'acme-dup', title: 'Second', content: [{type: 'prose', text: 'Two.'}]},
  ],
};
`,
};

export default async function (dir, h) {
  await makeDocsApp(dir, h, DOCS);
}
