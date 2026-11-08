// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computeRequiredFiles,
  compareIdentities,
  findSourceOnlyCandidates,
} from './contribution-inventory.mjs';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-ci-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** Build a minimal LoadedIntegration-shaped object from fixture contents. */
function loaded(overrides = {}) {
  const manifestFile = path.join(tmpDir, 'astryx.integration.mjs');
  if (!fs.existsSync(manifestFile)) {
    fs.writeFileSync(manifestFile, 'export default {};\n');
  }
  return {
    name: '@acme/widgets',
    version: '1.0.0',
    __spec: '@acme/widgets',
    __packageDir: tmpDir,
    __manifestFile: manifestFile,
    ...overrides,
  };
}

function writeTheme(slug, files = [`${slug}Theme.ts`]) {
  const root = path.join(tmpDir, 'themes');
  const themeDir = path.join(root, slug);
  fs.mkdirSync(themeDir, {recursive: true});
  for (const file of files) {
    const target = path.join(themeDir, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, `// ${file}\n`);
  }
  fs.writeFileSync(
    path.join(themeDir, `${slug}Theme.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: '${slug} theme.', maintained: true};\n`,
  );
  return root;
}

const UNPUBLISHED = [
  '.DS_Store',
  '._oceanTheme.ts',
  '.gitignore',
  '.npmignore',
  '.npmrc',
  'oceanTheme.ts.orig',
  'npm-debug.log',
  'palette/.DS_Store',
  'palette/npm-debug.log',
  '.git/HEAD',
  'CVS/Entries',
  'node_modules/dep/index.js',
];

describe('computeRequiredFiles', () => {
  it('enumerates each complete descriptor-owned theme directory', () => {
    const root = writeTheme('ocean', ['oceanTheme.ts', 'tokens.ts']);
    const inv = computeRequiredFiles(loaded({themes: root}));

    expect(inv.manifest).toBe('astryx.integration.mjs');
    expect(inv.roots).toHaveLength(1);
    expect(inv.roots[0].kind).toBe('themes');
    expect(inv.roots[0].files).toEqual(
      expect.arrayContaining([
        'themes/ocean/oceanTheme.doc.mjs',
        'themes/ocean/oceanTheme.ts',
        'themes/ocean/tokens.ts',
      ]),
    );
    expect(inv.allFiles).toContain('astryx.integration.mjs');
    expect(inv.allFiles).toContain('themes/ocean/oceanTheme.doc.mjs');
    expect(inv.allFiles).not.toContain('themes/manifest.json');
  });

  it('requires no file npm leaves out, at any depth, and none beside the themes', () => {
    const root = writeTheme('ocean', ['oceanTheme.ts', 'palette/tokens.ts']);
    for (const file of [
      ...UNPUBLISHED.map(name => `ocean/${name}`),
      'README.md',
      'npm-debug.log',
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), 'x\n');
    }
    expect(computeRequiredFiles(loaded({themes: root})).roots[0].files).toEqual(
      [
        'themes/ocean/oceanTheme.doc.mjs',
        'themes/ocean/oceanTheme.ts',
        'themes/ocean/palette/tokens.ts',
      ],
    );
  });

  it('requires only the folders theme discovery reads', () => {
    const root = writeTheme('ocean');
    for (const file of ['shared/palette.ts', '.cache/state.json']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), '{}\n');
    }
    const inv = computeRequiredFiles(loaded({themes: root}));
    expect(inv.roots[0].files).toEqual([
      'themes/ocean/oceanTheme.doc.mjs',
      'themes/ocean/oceanTheme.ts',
    ]);
  });

  it('enumerates paired component metadata and source files', () => {
    const root = path.join(tmpDir, 'components');
    fs.mkdirSync(root, {recursive: true});
    for (const name of ['Card', 'Button']) {
      fs.writeFileSync(path.join(root, `${name}.tsx`), `// ${name}\n`);
      fs.writeFileSync(
        path.join(root, `${name}.doc.mjs`),
        `export default {type: 'component', name: '${name}', props: []};\n`,
      );
    }
    fs.writeFileSync(path.join(root, 'PrivateHelper.tsx'), '// unpaired\n');
    fs.writeFileSync(path.join(root, 'utils.ts'), '// not a component\n');
    const inv = computeRequiredFiles(loaded({components: root}));

    expect(inv.roots[0].kind).toBe('components');
    expect(inv.roots[0].files).toEqual(
      expect.arrayContaining([
        'components/Button.doc.mjs',
        'components/Button.tsx',
        'components/Card.doc.mjs',
        'components/Card.tsx',
      ]),
    );
    expect(inv.roots[0].files).not.toContain('components/PrivateHelper.tsx');
    expect(inv.roots[0].files).not.toContain('components/utils.ts');
  });

  it('includes symlinked component metadata and source paths', () => {
    const root = path.join(tmpDir, 'components');
    const shared = path.join(tmpDir, 'shared');
    fs.mkdirSync(root);
    fs.mkdirSync(shared);
    fs.writeFileSync(
      path.join(shared, 'LinkedWidget.doc.mjs'),
      "export default {type: 'component', name: 'LinkedWidget', props: []};\n",
    );
    fs.writeFileSync(
      path.join(shared, 'LinkedWidget.tsx'),
      'export function LinkedWidget() { return null; }\n',
    );
    fs.symlinkSync(
      path.relative(root, path.join(shared, 'LinkedWidget.doc.mjs')),
      path.join(root, 'LinkedWidget.doc.mjs'),
    );
    fs.symlinkSync(
      path.relative(root, path.join(shared, 'LinkedWidget.tsx')),
      path.join(root, 'LinkedWidget.tsx'),
    );

    const inventory = computeRequiredFiles(loaded({components: root}));

    expect(inventory.roots[0].files).toEqual([
      'components/LinkedWidget.doc.mjs',
      'components/LinkedWidget.tsx',
    ]);
  });

  it('enumerates template files with paired sources', () => {
    const root = path.join(tmpDir, 'templates');
    fs.mkdirSync(path.join(root, 'dashboard'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'dashboard', 'dashboard.doc.mjs'),
      '// tmpl\n',
    );
    fs.writeFileSync(path.join(root, 'dashboard', 'dashboard.tsx'), '// src\n');
    const inv = computeRequiredFiles(loaded({templates: root}));

    expect(inv.roots[0].files).toContain(
      'templates/dashboard/dashboard.doc.mjs',
    );
    expect(inv.roots[0].files).toContain('templates/dashboard/dashboard.tsx');
  });

  it('enumerates released .template compatibility metadata with paired sources', () => {
    const root = path.join(tmpDir, 'templates');
    fs.mkdirSync(path.join(root, 'dashboard'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'dashboard', 'dashboard.template.mjs'),
      '// released compatibility template\n',
    );
    fs.writeFileSync(path.join(root, 'dashboard', 'dashboard.tsx'), '// src\n');

    const inv = computeRequiredFiles(loaded({templates: root}));

    expect(inv.roots[0].files).toEqual([
      'templates/dashboard/dashboard.template.mjs',
      'templates/dashboard/dashboard.tsx',
    ]);
  });

  it('enumerates codemod files under version dirs', () => {
    const root = path.join(tmpDir, 'codemods');
    fs.mkdirSync(path.join(root, '0.2.0'), {recursive: true});
    fs.writeFileSync(path.join(root, '0.2.0', 'rename-prop.mjs'), '// cm\n');
    const inv = computeRequiredFiles(loaded({codemods: root}));

    expect(inv.roots[0].files).toContain('codemods/0.2.0/rename-prop.mjs');
  });

  it('enumerates doc files', () => {
    const root = path.join(tmpDir, 'docs');
    fs.mkdirSync(root, {recursive: true});
    fs.writeFileSync(path.join(root, 'theming.doc.mjs'), '// doc\n');
    const inv = computeRequiredFiles(loaded({docs: root}));

    expect(inv.roots[0].files).toContain('docs/theming.doc.mjs');
  });

  it('returns empty contributions for a bare manifest', () => {
    const inv = computeRequiredFiles(loaded());
    expect(inv.roots).toEqual([]);
    expect(inv.allFiles).toEqual(['astryx.integration.mjs']);
  });

  it('handles missing root directories gracefully', () => {
    const inv = computeRequiredFiles(
      loaded({themes: path.join(tmpDir, 'nonexistent')}),
    );
    expect(inv.roots[0].files).toEqual([]);
  });
});

describe('compareIdentities', () => {
  const base = () => ({
    themes: [],
    components: [],
    templates: [],
    codemods: [],
    docs: [],
    agentDocsAppend: [],
  });

  it('returns no issues when identities match exactly', () => {
    const local = {
      ...base(),
      themes: [{slug: 'ocean', exportName: 'oceanTheme'}],
      components: ['Card'],
    };
    const packed = {
      ...base(),
      themes: [{slug: 'ocean', exportName: 'oceanTheme'}],
      components: ['Card'],
    };
    expect(compareIdentities(local, packed)).toEqual([]);
  });

  it('errors when a theme slug is missing from packed', () => {
    const local = {
      ...base(),
      themes: [
        {slug: 'ocean', exportName: 'oceanTheme'},
        {slug: 'forest', exportName: 'forestTheme'},
      ],
    };
    const packed = {
      ...base(),
      themes: [{slug: 'ocean', exportName: 'oceanTheme'}],
    };
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'identity_not_packed',
      severity: 'error',
    });
    expect(issues[0].message).toContain('forest');
  });

  it('errors when a component name is missing from packed', () => {
    const local = {...base(), components: ['Card', 'Button']};
    const packed = {...base(), components: ['Card']};
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('Button');
  });

  it('errors when a template id is missing from packed', () => {
    const local = {
      ...base(),
      templates: [{id: 'dash', type: 'page', name: 'Dashboard'}],
    };
    const packed = {...base()};
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('dash');
  });

  it('errors when a packed template replaces a different target', () => {
    const template = {id: 'acme-shell', type: 'page', name: 'Acme shell'};
    const local = {
      ...base(),
      templates: [{...template, replaces: 'shell-side-nav'}],
    };
    const packed = {
      ...base(),
      templates: [{...template, replaces: 'shell-top-nav'}],
    };

    expect(compareIdentities(local, packed)).toEqual([
      expect.objectContaining({
        code: 'identity_mismatch',
        message: expect.stringContaining('acme-shell'),
      }),
    ]);
  });

  it('errors when a codemod is missing from packed', () => {
    const local = {
      ...base(),
      codemods: [{version: '0.2.0', id: 'rename-prop'}],
    };
    const packed = {...base()};
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('rename-prop');
  });

  it('errors when a doc topic is missing from packed', () => {
    const local = {...base(), docs: ['theming']};
    const packed = {...base()};
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('theming');
  });

  it('errors when packed contains an identity absent locally', () => {
    const local = {...base()};
    const packed = {...base(), docs: ['surprise']};
    const issues = compareIdentities(local, packed);
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'packed_identity_unexpected',
        message: expect.stringContaining('surprise'),
      }),
    ]);
  });

  it('errors when a matching identity resolves to different metadata', () => {
    const local = {
      ...base(),
      templates: [{id: 'dash', type: 'page', name: 'Dashboard'}],
    };
    const packed = {
      ...base(),
      templates: [{id: 'dash', type: 'block', name: 'Dashboard'}],
    };
    const issues = compareIdentities(local, packed);
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'identity_mismatch',
        message: expect.stringContaining('dash'),
      }),
    ]);
  });

  it('errors when agentDocs lines differ', () => {
    const local = {...base(), agentDocsAppend: ['Install via npm.']};
    const packed = {...base(), agentDocsAppend: []};
    const issues = compareIdentities(local, packed);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('agent_docs_mismatch');
  });
});

describe('findSourceOnlyCandidates', () => {
  it('finds PascalCase .tsx without metadata', () => {
    const root = path.join(tmpDir, 'components');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'Card.tsx'), '// Card\n');
    fs.writeFileSync(path.join(root, 'Button.tsx'), '// Button\n');
    fs.writeFileSync(path.join(root, 'helper.tsx'), '// lowercase\n');
    const candidates = findSourceOnlyCandidates(root, ['Card']);
    expect(candidates).toEqual(['Button']);
  });

  it('includes a symlinked PascalCase source candidate', () => {
    const root = path.join(tmpDir, 'components');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'source.tsx'), '// source\n');
    fs.symlinkSync('source.tsx', path.join(root, 'LinkedWidget.tsx'));
    expect(findSourceOnlyCandidates(root, [])).toEqual(['LinkedWidget']);
  });

  it('returns empty when all are registered', () => {
    const root = path.join(tmpDir, 'components');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'Card.tsx'), '// Card\n');
    expect(findSourceOnlyCandidates(root, ['Card'])).toEqual([]);
  });

  it('returns empty for missing root', () => {
    expect(findSourceOnlyCandidates(undefined, [])).toEqual([]);
  });

  it('ignores nested directories', () => {
    const root = path.join(tmpDir, 'components');
    fs.mkdirSync(path.join(root, 'sub'), {recursive: true});
    fs.writeFileSync(path.join(root, 'sub', 'Deep.tsx'), '// nested\n');
    expect(findSourceOnlyCandidates(root, [])).toEqual([]);
  });
});
