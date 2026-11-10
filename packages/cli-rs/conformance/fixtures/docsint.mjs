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
  blocks: [{type: 'prose', text: 'Start with {@link namespace:acme-handbook} or {@link @astryxdesign/cli:generic:spacing}.'}],
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
    {
      id: 'cross-links',
      title: 'Cross links',
      content: [
        {type: 'prose', text: 'See {@link @astryxdesign/cli:generic:theme}, {@link @astryxdesign/cli:command:docs}, {@link @astryxdesign/cli:schema:component-doc}, {@link namespace:acme-handbook}, {@link @astryxdesign/core:component:Button}, {@link @astryxdesign/core:page:dashboard} and \`{@link generic:theme}\`.'},
        {type: 'reference', target: '@astryxdesign/cli:command:docs'},
        {type: 'reference', target: '@astryxdesign/cli:command:docs', presentation: 'compact'},
        {type: 'reference', target: '@astryxdesign/cli:command:docs', presentation: 'summary'},
        {type: 'reference', target: '@astryxdesign/cli:schema:component-doc', projection: {fields: ['name', 'props', 'nope']}}, {type: 'reference', target: '@astryxdesign/cli:command:docs', projection: {fields: ['name']}},
        {type: 'reference', target: '@astryxdesign/cli:schema:component-doc', presentation: 'summary'},
        {type: 'reference', target: '@astryxdesign/cli:generic:theme'},
        {type: 'reference', target: 'namespace:acme-handbook'},
        {type: 'reference', target: '@astryxdesign/core:component:Button'},
        {type: 'prose', text: 'Our panel: {@link component:AcmePanel}; missing: {@link component:AcmeNope}; Core Button again: {@link @astryxdesign/core:component:Button}.'},
        {type: 'reference', target: 'component:AcmePanel'},
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

DOCS['layout-extra.doc.mjs'] = `export default {
  type: 'generic',
  name: 'layout-extra',
  title: 'Layout extra',
  description: 'Acme notes on the shell.',
  extends: 'layout/scaffold',
  sections: [{id: 'acme-shell', title: 'Acme shell', content: [{type: 'prose', text: 'Use the Acme shell.'}]}],
};
`;
DOCS['responsive-acme.doc.mjs'] = `export default {
  type: 'generic',
  name: 'responsive-acme',
  title: 'Acme responsive',
  description: 'Responsive, the Acme way. See {@link generic:acme-colors}.',
  replaces: 'layout/responsive',
  sections: [{title: 'Breakpoints', content: [{type: 'prose', text: 'Two of them.'}]}],
};
`;

// A topic over the one-read budget: one section too large, and so many
// sections that its index is too large too.
DOCS['acme-big.doc.mjs'] = `const many = Array.from({length: 170}, (_, i) => ({
  title: 'Part ' + (i + 1),
  content: [{type: 'prose', text: 'Part ' + (i + 1) + ': ' + 'a long summary that fills the index line. '.repeat(6)}],
}));
export default {
  type: 'generic',
  name: 'acme-big',
  title: 'Acme big',
  description: 'Too much to read at once.',
  sections: [{id: 'huge', title: 'Huge', content: [{type: 'prose', text: 'word '.repeat(9000)}]}, ...many],
};
`;

export async function makeDocsApp(dir, h, docs) {
  await h.makeApp(dir);
  await h.writeJson(path.join(dir, 'package.json'), {
    name: 'proj',
    version: '1.0.0',
    dependencies: {'@astryxdesign/core': h.CORE_VERSION, '@acme/docs': '1.0.0'},
  });
  const pkg = path.join(dir, 'node_modules', '@acme', 'docs');
  await h.writeJson(path.join(pkg, 'package.json'), {name: '@acme/docs', version: '1.0.0'});
  await h.writeFile(path.join(pkg, 'astryx.integration.mjs'), "export default {docs: './docs', components: './components'};\n");
  await h.writeFile(path.join(pkg, 'components', 'AcmePanel.tsx'), 'export function AcmePanel() { return null; }\n');
  await h.writeFile(path.join(pkg, 'components', 'AcmePanel.doc.mjs'), "export default {type: 'component', name: 'AcmePanel', displayName: 'Acme Panel', category: 'Layout', usage: {description: 'A panel. See {@link generic:theme} and {@link generic:nope}.'}, props: [{name: 'tone', type: 'string', description: 'Tone, see {@link component:AcmeNope}.'}]};\n");
  await h.writeJson(path.join(pkg, 'package.json'), {name: '@acme/docs', version: '1.0.0', exports: {'.': './components/AcmePanel.tsx'}});
  for (const [file, text] of Object.entries(docs)) {
    await h.writeFile(path.join(pkg, 'docs', file), text);
  }
}

export default async function (dir, h) {
  await makeDocsApp(dir, h, DOCS);
}
