// A project whose integration (@acme/docs) ships docs: a namespace with a
// placed guide (with a translation), a topic that extends a CLI topic, and one
// that replaces a CLI topic, with links, command tokens and a token reference.
import * as path from 'node:path';

export const DOCS = {
  'acme-handbook.doc.mjs': `export default {
  type: 'namespace',
  name: 'acme-handbook',
  title: 'Acme handbook',
  summary: 'Everything about Acme. See {@link generic:theme}.',
  slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}},
};
`,
  'deploying.doc.mjs': `export default {
  type: 'generic',
  name: 'deploying',
  title: 'Deploying',
  description: 'Ship it with {@pm install --dev @acme/docs}.',
  placement: {parent: 'namespace:acme-handbook'},
  sections: [
    {
      title: 'Overview',
      content: [
        {type: 'prose', text: 'Run {@command docs theme} first; see {@link generic:spacing} and {@link command:docs}.'},
        {type: 'code', lang: 'bash', code: '{@pm exec astryx docs}'},
      ],
    },
    {
      id: 'rollback',
      title: 'Rolling back',
      content: [
        {type: 'list', style: 'unordered', items: ['one {@link generic:nope}', 'two']},
        {type: 'reference', target: 'command:docs'},
      ],
    },
  ],
};
`,
  'deploying.doc.zh.mjs': `export const docsZh = {
  description: '中文描述',
  sections: [{section: 'Overview', title: '概述', content: [{type: 'prose', text: '中文正文'}]}],
};
`,
  'theme-extra.doc.mjs': `export default {
  type: 'generic',
  name: 'theme-extra',
  title: 'Theme extra',
  description: 'More theme notes.',
  extends: 'theme',
  sections: [
    {id: 'acme-tips', title: 'Acme tips', after: 'quick-start', content: [{type: 'prose', text: 'Tip.'}]},
    {title: 'Dark mode', content: [{type: 'prose', text: 'Replaced by Acme.'}]},
  ],
};
`,
  'colors.doc.mjs': `export default {
  type: 'generic',
  name: 'acme-colors',
  title: 'Acme colors',
  description: 'Our palette.',
  replaces: 'color',
  category: 'foundations',
  sections: [{title: 'Palette', content: [{type: 'token-ref', topic: 'spacing', section: 'Overview'}]}],
};
`,
};

export async function makeDocsApp(dir, h, docs) {
  await h.makeApp(dir);
  await h.writeJson(path.join(dir, 'package.json'), {
    name: 'proj',
    version: '1.0.0',
    dependencies: {'@astryxdesign/core': h.CORE_VERSION, '@acme/docs': '1.0.0'},
  });
  const pkg = path.join(dir, 'node_modules', '@acme', 'docs');
  await h.writeJson(path.join(pkg, 'package.json'), {name: '@acme/docs', version: '1.0.0'});
  await h.writeFile(path.join(pkg, 'astryx.integration.mjs'), "export default {docs: './docs'};\n");
  for (const [file, text] of Object.entries(docs)) {
    await h.writeFile(path.join(pkg, 'docs', file), text);
  }
}

export default async function (dir, h) {
  await makeDocsApp(dir, h, DOCS);
}
