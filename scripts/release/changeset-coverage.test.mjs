// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changeset coverage regression tests.
 *
 * @input  in-memory repository trees shaped like the real workspace
 * @output proofs that a shipped change needs a Changeset naming its package,
 *   that exempt surfaces need none, and that a released CLI JSON id cannot
 *   disappear unclassified — including regressions for #7125, #7154, and #7626
 * @position focused suite for scripts/release/changeset-coverage.mjs
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  classifyPath,
  cliJsonIds,
  consumerManifestDelta,
  evaluateChange,
  fixupCoverage,
  pendingChangesets,
  isPackedFile,
  isWorkspaceDir,
  jsonKeyPaths,
  memoryTree,
  typedefFields,
} from './changeset-coverage.mjs';

const WORKSPACE = `packages:
  - 'apps/*'
  - '!apps/example-*'
  - 'packages/*'
  - 'packages/themes/*'
  - 'internal/*'
`;

const CONFIG = JSON.stringify({
  fixed: [
    ['@astryxdesign/cli', '@astryxdesign/core', '@astryxdesign/theme-stone'],
  ],
  ignore: ['@astryxdesign/storybook', '@astryxdesign/sandbox'],
});

const manifest = (name, extra = {}) =>
  JSON.stringify({name, version: '0.6.6', ...extra});

const CLI_FILES = [
  'clients',
  'api',
  'assets',
  'authoring',
  'foundation',
  'scripts/postinstall.mjs',
  'CHANGELOG.md',
];

const DOCTOR_RELEASED = `export const checks = [
  {id: 'node-version', label: 'Node'},
  {id: 'themes', label: 'Themes'},
];
`;
const DOCTOR_WITHOUT_THEMES = `export const checks = [
  {id: 'node-version', label: 'Node'},
];
`;
const THEME_CHECKS = `export const themeChecks = [{id: 'theme-management', label: 'Theme management'}];
`;

const RESPONSE_TYPES = `export const doc = {
  members: [
    {value: 'doctor', description: 'Doctor checks.'},
    {value: 'docs.list', description: 'Doc topics.'},
  ],
};
`;

const DOCTOR_TYPES = `/**
 * @typedef {object} DoctorCheck
 * @property {string} id - Stable machine-readable id.
 * @property {string} label
 * @property {string} [fix] - Remediation.
 */

/**
 * @typedef {object} DoctorResponse
 * @property {'doctor'} type
 * @property {{checks: DoctorCheck[], summary: {pass: number}}} data
 */
`;

const DOCS_LIST_GOLDEN = JSON.stringify({
  apiVersion: 1,
  type: 'docs.list',
  data: [
    {topic: 'layout', description: 'Layout.', package: '@astryxdesign/cli'},
  ],
});

/** A small repository with the real package layout. */
function repo(overrides = {}) {
  const files = {
    'pnpm-workspace.yaml': WORKSPACE,
    'package.json': manifest('astryx-root', {private: true}),
    '.changeset/config.json': CONFIG,
    '.changeset/README.md': '# Changesets\n',
    'packages/cli/package.json': manifest('@astryxdesign/cli', {
      files: CLI_FILES,
      bin: {astryx: './clients/cli/bin/astryx.mjs'},
    }),
    'packages/cli/README.md': '# CLI\n',
    'packages/cli/assets/docs/layout.doc.mjs':
      'export default {title: "Layout"};\n',
    'packages/cli/api/doctor/doctor.mjs': DOCTOR_RELEASED,
    'packages/cli/api/doctor/doctor.type.mjs': DOCTOR_TYPES,
    'packages/cli/api/doctor/doctor.test.mjs': "it('x', () => {});\n",
    'packages/cli/foundation/response/response-types.doc.mjs': RESPONSE_TYPES,
    'packages/cli/test/__golden__/docs-list.json': DOCS_LIST_GOLDEN,
    'packages/cli/scripts/generate.mjs': '// repo-only generator\n',
    'packages/core/package.json': manifest('@astryxdesign/core', {
      files: ['dist', 'src', 'README.md', 'CHANGELOG.md'],
      peerDependencies: {react: '^19.0.0'},
    }),
    'packages/core/src/Button/Button.tsx': 'export const Button = 1;\n',
    'packages/core/src/Button/Button.doc.mjs': 'export const doc = {};\n',
    'packages/core/src/Button/Button.test.tsx': 'test();\n',
    'packages/core/src/Button/Button.a11y.chromium.spec.ts': 'test();\n',
    'packages/core/src/Button/Button.stories.tsx': 'export default {};\n',
    'docs/specs/components/Button/Button.spec.md': '# Button spec\n',
    'packages/core/src/Button/__fixtures__/data.ts': 'export {};\n',
    'packages/core/CHANGELOG.md': '# Changelog\n',
    'packages/themes/stone/package.json': manifest(
      '@astryxdesign/theme-stone',
      {files: ['dist', 'src']},
    ),
    'packages/themes/stone/src/stoneTheme.ts': 'export const stone = {};\n',
    'packages/lab/package.json': manifest('@astryxdesign/lab', {
      private: true,
      files: ['src'],
    }),
    'packages/lab/src/Thing.tsx': 'export {};\n',
    'packages/charts/package.json': manifest('@astryxdesign/charts', {
      private: true,
      astryx: {canaryOnly: true},
      files: ['src'],
    }),
    'packages/charts/src/Chart.tsx': 'export {};\n',
    'apps/storybook/package.json': manifest('@astryxdesign/storybook', {
      private: true,
    }),
    'apps/storybook/stories/Button.stories.tsx': 'export default {};\n',
    'apps/sandbox/package.json': manifest('@astryxdesign/sandbox', {
      private: true,
    }),
    'apps/sandbox/src/App.tsx': 'export {};\n',
    'apps/docsite/package.json': manifest('docsite', {private: true}),
    'apps/docsite/pages/index.tsx': 'export {};\n',
    '.github/workflows/lint.yml': 'name: Lint\n',
    'scripts/check-changesets.mjs': '// tooling\n',
    'docs/specs/AST-017/spec.md': '# spec\n',
    ...overrides,
  };
  for (const [file, contents] of Object.entries(files)) {
    if (contents === null) delete files[file];
  }
  return files;
}

const changeset = (packages, body) =>
  `---\n${Object.entries(packages)
    .map(([name, bump]) => `'${name}': ${bump}`)
    .join('\n')}\n---\n\n${body}\n\n@contributor\n`;

/** Build the change between two in-memory trees, git name-status style. */
function change(baseFiles, headFiles, {released = baseFiles} = {}) {
  const changes = [];
  for (const file of new Set([
    ...Object.keys(baseFiles),
    ...Object.keys(headFiles),
  ])) {
    const before = baseFiles[file];
    const after = headFiles[file];
    if (before === after) continue;
    const status = before === undefined ? 'A' : after === undefined ? 'D' : 'M';
    changes.push({filename: file, previous_filename: null, status});
  }
  return evaluateChange({
    changes,
    base: memoryTree(baseFiles, 'base'),
    head: memoryTree(headFiles, 'head'),
    released: released ? memoryTree(released, 'v0.6.6') : null,
  });
}

const at = files => ({
  tree: memoryTree(files),
  config: JSON.parse(files['.changeset/config.json']),
});

describe('classifyPath — what ships to consumers', () => {
  const files = repo();
  it.each([
    ['packages/core/src/Button/Button.tsx', '@astryxdesign/core', 'source'],
    ['packages/core/src/Button/Button.doc.mjs', '@astryxdesign/core', 'docs'],
    ['packages/cli/api/doctor/doctor.mjs', '@astryxdesign/cli', 'cli'],
    ['packages/cli/assets/docs/layout.doc.mjs', '@astryxdesign/cli', 'docs'],
    ['packages/cli/README.md', '@astryxdesign/cli', 'docs'],
    [
      'packages/themes/stone/src/stoneTheme.ts',
      '@astryxdesign/theme-stone',
      'source',
    ],
  ])('%s ships in %s as %s', (file, pkg, surface) => {
    expect(classifyPath(file, at(files))).toEqual({
      ships: true,
      package: pkg,
      surface,
    });
  });

  it.each([
    ['packages/core/src/Button/Button.test.tsx', /test/],
    ['packages/core/src/Button/Button.a11y.chromium.spec.ts', /test/],
    ['packages/core/src/Button/Button.stories.tsx', /story/],
    ['docs/specs/components/Button/Button.spec.md', /outside/],
    ['packages/core/src/Button/__fixtures__/data.ts', /fixture/],
    ['packages/cli/api/doctor/doctor.test.mjs', /test/],
    ['packages/cli/test/__golden__/docs-list.json', /test/],
    ['packages/core/CHANGELOG.md', /CHANGELOG/],
    ['packages/cli/scripts/generate.mjs', /tarball/],
    ['packages/lab/src/Thing.tsx', /private/],
    ['packages/charts/src/Chart.tsx', /canary-only/],
    ['apps/storybook/stories/Button.stories.tsx', /private/],
    ['apps/sandbox/src/App.tsx', /private/],
    ['apps/docsite/pages/index.tsx', /private/],
    ['.github/workflows/lint.yml', /outside/],
    ['scripts/check-changesets.mjs', /outside/],
    ['docs/specs/AST-017/spec.md', /outside/],
  ])('%s is exempt', (file, reason) => {
    const result = classifyPath(file, at(files));
    expect(result.ships).toBe(false);
    expect(result.reason).toMatch(reason);
  });

  it('exempts a package-root API report that files does not pack, despite its exclusion globs', () => {
    const negated = repo({
      'packages/core/package.json': manifest('@astryxdesign/core', {
        files: ['dist', 'src', '!**/*.test.*'],
      }),
    });
    const result = classifyPath('packages/core/api-report.md', at(negated));
    expect(result).toEqual({
      ships: false,
      reason: 'API report, outside the tarball',
    });
    expect(
      classifyPath('packages/core/src/Button/Button.tsx', at(negated)).ships,
    ).toBe(true);
  });

  it('ships an API report that files packs', () => {
    const packed = repo({
      'packages/core/package.json': manifest('@astryxdesign/core', {
        files: ['dist', 'api-report.md'],
      }),
    });
    expect(classifyPath('packages/core/api-report.md', at(packed))).toEqual({
      ships: true,
      package: '@astryxdesign/core',
      surface: 'docs',
    });
  });

  it('treats a Changesets-ignored package as exempt even when it is not private', () => {
    const ignored = repo({
      'apps/sandbox/package.json': manifest('@astryxdesign/sandbox'),
    });
    expect(classifyPath('apps/sandbox/src/App.tsx', at(ignored)).ships).toBe(
      false,
    );
  });
});

describe('isPackedFile, isWorkspaceDir, consumerManifestDelta', () => {
  it('follows npm packing: manifest, root README, and files entries', () => {
    const m = {files: ['src', 'scripts/postinstall.mjs']};
    expect(isPackedFile(m, 'package.json')).toBe(true);
    expect(isPackedFile(m, 'README.md')).toBe(true);
    expect(isPackedFile(m, 'src/a/b.ts')).toBe(true);
    expect(isPackedFile(m, 'scripts/postinstall.mjs')).toBe(true);
    expect(isPackedFile(m, 'scripts/other.mjs')).toBe(false);
    expect(isPackedFile(m, 'srcs/x.ts')).toBe(false);
    expect(isPackedFile({}, 'anything.ts')).toBe(true);
    expect(isPackedFile({files: ['dist/*.js']}, 'other.ts')).toBe(true);
  });

  it('matches pnpm workspace globs, honoring exclusions', () => {
    const globs = [
      'apps/*',
      '!apps/example-*',
      'packages/*',
      'packages/themes/*',
    ];
    expect(isWorkspaceDir('packages/core', globs)).toBe(true);
    expect(isWorkspaceDir('packages/themes/stone', globs)).toBe(true);
    expect(isWorkspaceDir('apps/example-next', globs)).toBe(false);
    expect(isWorkspaceDir('packages/core/src', globs)).toBe(false);
  });

  it('reports only consumer-facing manifest fields', () => {
    expect(
      consumerManifestDelta(
        {version: '1', scripts: {a: 'x'}},
        {version: '2', scripts: {a: 'y'}},
      ),
    ).toEqual([]);
    expect(
      consumerManifestDelta(
        {peerDependencies: {react: '^18'}},
        {peerDependencies: {react: '^19'}},
      ),
    ).toEqual(['peerDependencies']);
  });

  it('ignores a fixed-group co-bump of a sibling pin, but not a real range edit', () => {
    const before = {
      version: '0.6.5',
      peerDependencies: {'@astryxdesign/core': '0.6.5', react: '>=19'},
    };
    const synced = {
      version: '0.6.6',
      peerDependencies: {'@astryxdesign/core': '0.6.6', react: '>=19'},
    };
    expect(consumerManifestDelta(before, synced)).toEqual([]);
    const loosened = {
      version: '0.6.5',
      peerDependencies: {'@astryxdesign/core': '^0.6.0', react: '>=19'},
    };
    expect(consumerManifestDelta(before, loosened)).toEqual([
      'peerDependencies',
    ]);
  });
});

describe('rule 1 — locale updates', () => {
  const english = 'packages/core/locales/en.json';
  const french = 'packages/core/locales/fr-FR.json';
  const key = '@astryx.commandPalette.noResultsFor';
  const loading = '@astryx.commandPalette.loading';
  const catalog = {
    [key]: {
      defaultMessage: 'Aucun résultat pour {query}',
      description: 'Old context.',
    },
    [loading]: {defaultMessage: 'Chargement', description: 'Loading context.'},
  };
  const base = repo({
    'packages/core/package.json': manifest('@astryxdesign/core', {
      files: ['src', 'locales'],
    }),
    [english]: JSON.stringify({
      [key]: {
        defaultMessage: 'No results for {query}',
        description: 'Old context.',
      },
      [loading]: {defaultMessage: 'Loading', description: 'Loading context.'},
    }),
    [french]: JSON.stringify(catalog),
  });

  it('replays #7626: description-only edits in 29 existing locales need no Changeset', () => {
    const locales = [
      'af-ZA',
      'ar-SA',
      'ca-ES',
      'cs-CZ',
      'da-DK',
      'de-DE',
      'el-GR',
      'es-ES',
      'fi-FI',
      'fr-FR',
      'he-IL',
      'hu-HU',
      'it-IT',
      'ja-JP',
      'ko-KR',
      'nl-NL',
      'no-NO',
      'pl-PL',
      'pt-BR',
      'pt-PT',
      'ro-RO',
      'ru-RU',
      'sr-SP',
      'sv-SE',
      'tr-TR',
      'uk-UA',
      'vi-VN',
      'zh-CN',
      'zh-TW',
    ];
    const before = {...base};
    const after = {...base};
    for (const locale of locales) {
      const file = `packages/core/locales/${locale}.json`;
      before[file] = JSON.stringify(catalog);
      after[file] = JSON.stringify({
        ...catalog,
        [key]: {
          ...catalog[key],
          description:
            'Not read by any component: CommandPalette announces emptySearchText instead.',
        },
      });
    }
    const result = change(before, after);
    expect(result.problems).toEqual([]);
    expect(result.coverage.exempt).toHaveLength(29);
  });

  it('exempts translator descriptions in English, including JSON property reordering', () => {
    const source = JSON.parse(base[english]);
    source[key] = {
      description: 'Updated context.',
      defaultMessage: source[key].defaultMessage,
    };
    expect(
      change(base, {...base, [english]: JSON.stringify(source)}).problems,
    ).toEqual([]);
  });

  it.each([
    [
      'corrected text',
      {
        ...catalog,
        [key]: {
          ...catalog[key],
          defaultMessage: 'Aucun résultat trouvé pour {query}',
        },
      },
    ],
    ['filled translation', {[key]: catalog[key], [loading]: catalog[loading]}],
    ['omitted translation', {[key]: catalog[key]}],
  ])('exempts an existing language’s %s', (name, translated) => {
    const before =
      name === 'filled translation'
        ? {...base, [french]: JSON.stringify({[key]: catalog[key]})}
        : base;
    expect(
      change(before, {...base, [french]: JSON.stringify(translated)}).problems,
    ).toEqual([]);
  });

  it.each([
    [
      'new language',
      'packages/core/locales/es-ES.json',
      JSON.stringify(catalog),
    ],
    ['empty catalog', french, '{}'],
    ['malformed JSON', french, '{'],
    ['non-catalog JSON', french, '[]'],
    ['invalid message', french, JSON.stringify({[key]: {defaultMessage: 42}})],
    [
      'unknown field',
      french,
      JSON.stringify({...catalog, [key]: {...catalog[key], runtime: true}}),
    ],
  ])(
    'needs no Changeset for a translated catalog’s %s',
    (name, file, contents) => {
      const head = {...base, [file]: contents};
      if (contents === null) delete head[file];
      expect(change(base, head).problems).toEqual([]);
    },
  );

  it('requires a Changeset when a translated locale is renamed without keeping its old path', () => {
    const head = {...base, 'packages/core/locales/fr.json': base[french]};
    delete head[french];
    const result = change(base, head);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('fr-FR.json');
    expect(result.coverage.exempt).toHaveLength(1);
  });

  it.each([
    ['removed language', french, null],
    [
      'committed pseudo-locale',
      'packages/core/locales/pseudo.json',
      JSON.stringify(catalog),
    ],
    [
      'English key addition',
      english,
      JSON.stringify({
        ...JSON.parse(base[english]),
        '@astryx.newMessage': {
          defaultMessage: 'New message',
          description: 'New context.',
        },
      }),
    ],
    ['new English catalog', english, JSON.stringify(catalog)],
    ['removed English catalog', english, null],
    ['malformed English JSON', english, '{'],
    ['empty English catalog', english, '{}'],
    ['non-catalog English JSON', english, '[]'],
    [
      'invalid English message',
      english,
      JSON.stringify({[key]: {defaultMessage: 42}}),
    ],
    [
      'unknown English field',
      english,
      JSON.stringify({[key]: {...catalog[key], runtime: true}}),
    ],
    [
      'nested locale path',
      'packages/core/locales/sub/fr-FR.json',
      JSON.stringify(catalog),
    ],
    [
      'English copy',
      english,
      JSON.stringify({
        ...JSON.parse(base[english]),
        [key]: {
          defaultMessage: 'Nothing matches {query}',
          description: 'Old context.',
        },
      }),
    ],
    [
      'English key removal',
      english,
      JSON.stringify({[key]: JSON.parse(base[english])[key]}),
    ],
  ])('still requires a Changeset for %s', (name, file, contents) => {
    const before = {...base};
    if (name === 'new English catalog') delete before[english];
    const head = {...before, [file]: contents};
    if (contents === null) delete head[file];
    expect(change(before, head).problems).toHaveLength(1);
  });

  it('requires a Changeset when English is renamed to a translated locale', () => {
    const head = {...base, 'packages/core/locales/fr.json': base[english]};
    delete head[english];
    const result = change(base, head);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('en.json');
  });

  it('does not exempt source changes mixed with a routine translation update', () => {
    const head = {
      ...base,
      [french]: JSON.stringify({
        ...catalog,
        [key]: {...catalog[key], description: 'Updated context.'},
      }),
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
    };
    const result = change(base, head);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('Button.tsx');
    expect(result.coverage.exempt).toHaveLength(1);
  });
});

describe('rule 1 — a shipped change names its package', () => {
  it('passes when a Changeset in the change names the package', () => {
    const base = repo();
    const head = repo({
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'patch'},
        '[fix] Button renders.',
      ),
    });
    expect(change(base, head).problems).toEqual([]);
  });

  it('fails a source change whose Changeset names a different package', () => {
    const base = repo();
    const head = repo({
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
      '.changeset/button.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[fix] Wrong package.',
      ),
    });
    const [problem, ...rest] = change(base, head).problems;
    expect(rest).toEqual([]);
    expect(problem).toContain(
      '@astryxdesign/core: this change ships to consumers without a Changeset naming @astryxdesign/core',
    );
    expect(problem).toContain(
      'package source: packages/core/src/Button/Button.tsx',
    );
    expect(problem).toContain(
      'pnpm changeset:new --packages @astryxdesign/core --category <fix|feat>',
    );
  });

  it('does not count a Changeset that only names the package with bump none', () => {
    const base = repo();
    const head = repo({
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'none'},
        '[fix] Nothing.',
      ),
    });
    expect(change(base, head).problems).toHaveLength(1);
  });

  it('accepts an edit to an existing pending Changeset that names the package', () => {
    const base = repo({
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'patch'},
        '[fix] Button.',
      ),
    });
    const head = repo({
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'patch'},
        '[fix] Button, again.',
      ),
    });
    expect(change(base, head).problems).toEqual([]);
  });

  it('does not let an untouched pending Changeset cover a new change', () => {
    const pending = {
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'patch'},
        '[fix] Button.',
      ),
    };
    const base = repo(pending);
    const head = repo({
      ...pending,
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
    });
    expect(change(base, head).problems).toHaveLength(1);
  });

  it('names every uncovered package once, with its own surfaces', () => {
    const base = repo();
    const head = repo({
      'packages/core/src/Button/Button.tsx': 'export const Button = 2;\n',
      'packages/themes/stone/src/stoneTheme.ts':
        'export const stone = {a: 1};\n',
    });
    const problems = change(base, head).problems;
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^@astryxdesign\/core:/);
    expect(problems[1]).toMatch(/^@astryxdesign\/theme-stone:/);
  });

  it('does not let a package leaving the stable cut exempt its own shipped edits', () => {
    const base = repo();
    const head = repo({
      'packages/themes/stone/package.json': manifest(
        '@astryxdesign/theme-stone',
        {private: true, files: ['dist', 'src']},
      ),
      'packages/themes/stone/src/stoneTheme.ts':
        'export const stone = {a: 1};\n',
    });
    const problems = change(base, head).problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      'package source: packages/themes/stone/src/stoneTheme.ts',
    );
  });

  it('counts a deleted shipped file', () => {
    const base = repo();
    const head = repo({'packages/core/src/Button/Button.doc.mjs': null});
    expect(change(base, head).problems[0]).toContain(
      'shipped documentation: packages/core/src/Button/Button.doc.mjs',
    );
  });

  it('counts a peer range change but not a version or script change', () => {
    const base = repo();
    const bumped = repo({
      'packages/core/package.json': manifest('@astryxdesign/core', {
        version: '0.6.7',
        files: ['dist', 'src', 'README.md', 'CHANGELOG.md'],
        peerDependencies: {react: '^19.0.0'},
        scripts: {build: 'x'},
      }),
    });
    expect(change(base, bumped).problems).toEqual([]);
    const narrowed = repo({
      'packages/core/package.json': manifest('@astryxdesign/core', {
        files: ['dist', 'src', 'README.md', 'CHANGELOG.md'],
        peerDependencies: {react: '^19.1.0'},
      }),
    });
    expect(change(base, narrowed).problems[0]).toContain(
      'consumer-facing package.json: packages/core/package.json (peerDependencies)',
    );
  });

  it('needs nothing for stories, sandbox, tests, lab, canary-only, docsite, CI, tooling, specs, or CHANGELOGs', () => {
    const base = repo();
    const head = repo({
      'apps/storybook/stories/Button.stories.tsx':
        'export default {title: "B"};\n',
      'apps/sandbox/src/App.tsx': 'export const x = 1;\n',
      'apps/docsite/pages/index.tsx': 'export const y = 1;\n',
      'packages/core/src/Button/Button.test.tsx': 'test(2);\n',
      'docs/specs/components/Button/Button.spec.md': '# Button spec v2\n',
      'packages/core/src/Button/__fixtures__/data.ts': 'export const d = 1;\n',
      'packages/core/CHANGELOG.md': '# Changelog\n\n## 0.6.7\n',
      'packages/cli/test/__golden__/docs-list.json': DOCS_LIST_GOLDEN.replace(
        'Layout.',
        'Layouts.',
      ),
      'packages/cli/scripts/generate.mjs': '// changed generator\n',
      'packages/lab/src/Thing.tsx': 'export const t = 1;\n',
      'packages/charts/src/Chart.tsx': 'export const c = 1;\n',
      '.github/workflows/lint.yml': 'name: Lint 2\n',
      'scripts/check-changesets.mjs': '// tooling 2\n',
      'docs/specs/AST-017/spec.md': '# spec 2\n',
    });
    const result = change(base, head);
    expect(result.problems).toEqual([]);
    expect(result.coverage.required.size).toBe(0);
  });
});

describe('red arm — #7125: shipped CLI docs changed without a Changeset', () => {
  // #7125 split the Layout doc into a namespace: it rewrote
  // packages/cli/assets/docs/*.doc.mjs (shipped in the CLI tarball and read by
  // `astryx docs`), updated tests and the docs-list golden, and added no
  // Changeset. The release coverage audit treated `/docs/` as exempt, so the
  // change would have shipped with no release note.
  const base = repo();
  const head = repo({
    'packages/cli/assets/docs/layout.doc.mjs':
      'export default {title: "Layout", children: ["layout/scaffold"]};\n',
    'packages/cli/assets/docs/tree/scaffold.doc.mjs':
      'export default {title: "Scaffold"};\n',
    'packages/cli/assets/docs/tree/side-panels.doc.mjs':
      'export default {title: "Side panels"};\n',
    'packages/cli/api/doctor/doctor.test.mjs': "it('y', () => {});\n",
    'packages/cli/test/__golden__/docs-list.json': JSON.stringify({
      apiVersion: 1,
      type: 'docs.list',
      data: [
        {
          topic: 'layout/scaffold',
          description: 'Scaffold.',
          package: '@astryxdesign/cli',
        },
      ],
    }),
  });

  it('fails, naming @astryxdesign/cli and a [docs] Changeset', () => {
    const {problems} = change(base, head);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      '@astryxdesign/cli: this change ships to consumers without a Changeset naming @astryxdesign/cli',
    );
    expect(problems[0]).toContain(
      'shipped documentation: packages/cli/assets/docs/layout.doc.mjs',
    );
    expect(problems[0]).toContain(
      'pnpm changeset:new --packages @astryxdesign/cli --category docs',
    );
  });

  it('does not treat the renamed docs route in the golden as a broken JSON id (FR45)', () => {
    expect(change(base, head).ids.problems).toEqual([]);
  });

  it('at release time, accepts a later fix-up Changeset that names the package and cites the pull request', () => {
    const fixup = changeset(
      {'@astryxdesign/cli': 'patch'},
      '[docs] Layout lists its focused guides.\n\n(#7125)',
    );
    const pending = pendingChangesets(
      memoryTree({...head, '.changeset/layout-docs-namespace.md': fixup}),
    );
    expect([...fixupCoverage(pending, '7125')]).toEqual(['@astryxdesign/cli']);
    expect(fixupCoverage(pending, '712')).toEqual(new Set());
    const result = evaluateChange({
      changes: [
        {filename: 'packages/cli/assets/docs/layout.doc.mjs', status: 'M'},
      ],
      base: memoryTree(base),
      head: memoryTree(head),
      released: null,
      coveredElsewhere: fixupCoverage(pending, '7125'),
    });
    expect(result.problems).toEqual([]);
  });

  it('passes once a [docs] Changeset names @astryxdesign/cli', () => {
    const fixed = {
      ...head,
      '.changeset/layout-namespace.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[docs] Layout is now a namespace of focused guides.',
      ),
    };
    expect(change(base, fixed).problems).toEqual([]);
  });
});

describe('red arm — #7154: a released doctor check id described as a [fix] rename', () => {
  // v0.6.6 reports a doctor check with id `themes`. Main dropped it, and
  // #7154 added a [fix] Changeset saying "`themes` check is now
  // `theme-management`" — an incompatible rename of a released JSON id,
  // classified as a patch.
  const released = repo();
  const base = repo({
    'packages/cli/api/doctor/doctor.mjs': DOCTOR_WITHOUT_THEMES,
    'packages/cli/api/doctor/theme-checks.mjs': THEME_CHECKS,
  });
  const head = {
    ...base,
    'packages/cli/api/theme/_adapter.mjs': 'export const pkg = 1;\n',
    '.changeset/theme-import-names-package.md': changeset(
      {'@astryxdesign/cli': 'patch'},
      "[fix] `astryx theme add <slug> --import` names the npm package that owns the added theme.\n\n`astryx doctor`'s `themes` check is now `theme-management`, with focused `theme-*` checks beside it.",
    ),
  };

  it('fails, naming the id and both ways to classify it', () => {
    const {problems, coverage} = change(base, head, {released});
    expect(coverage.problems).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      '@astryxdesign/cli: doctor check id `themes` is in the released v0.6.6 JSON contract and is missing at this head.',
    );
    expect(problems[0]).toContain(
      'a [breaking] Changeset whose text names `themes`',
    );
    expect(problems[0]).toContain(
      'a paragraph beginning "Compatibility:" that names `themes`',
    );
  });

  it('also fails the change that removed the id', () => {
    const removal = {
      ...base,
      '.changeset/app-themes.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[feat] Apps can import package-managed themes.',
      ),
    };
    const {problems} = change(released, removal, {released});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('doctor check id `themes`');
  });

  it('passes when the id is restored', () => {
    const restored = {
      ...head,
      'packages/cli/api/doctor/theme-checks.mjs': `${THEME_CHECKS}export const legacy = {id: 'themes'};\n`,
    };
    expect(change(base, restored, {released}).problems).toEqual([]);
  });

  it('passes with a compatibility note naming the id', () => {
    const noted = {
      ...head,
      '.changeset/theme-import-names-package.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[fix] Theme import names its package.\n\nCompatibility: `themes` was never documented as stable in this release line, so no released consumer reads it.',
      ),
    };
    expect(change(base, noted, {released}).problems).toEqual([]);
  });

  it('passes with a [breaking] Changeset naming the id', () => {
    const breaking = {
      ...head,
      '.changeset/doctor-themes-renamed.md': changeset(
        {'@astryxdesign/cli': 'minor'},
        "[breaking] `astryx doctor`'s `themes` check is now `theme-management`.",
      ),
    };
    expect(change(base, breaking, {released}).problems).toEqual([]);
  });

  it('does not accept a [breaking] Changeset that never names the id', () => {
    const vague = {
      ...head,
      '.changeset/doctor-themes-renamed.md': changeset(
        {'@astryxdesign/cli': 'minor'},
        '[breaking] Doctor checks were reorganized.',
      ),
    };
    expect(change(base, vague, {released}).problems).toHaveLength(1);
  });

  it('leaves an unrelated change alone', () => {
    const unrelated = {
      ...base,
      'packages/core/src/Button/Button.tsx': 'export const Button = 3;\n',
      '.changeset/button.md': changeset(
        {'@astryxdesign/core': 'patch'},
        '[fix] Button renders.',
      ),
    };
    expect(change(base, unrelated, {released}).problems).toEqual([]);
  });

  it('at release time, reports every released id missing at the end of the range', () => {
    const result = evaluateChange({
      changes: [],
      base: memoryTree(base, 'origin/main'),
      head: memoryTree(base, 'origin/main'),
      released: memoryTree(released, 'v0.6.6'),
      attributeToChange: false,
    });
    expect(result.ids.problems).toHaveLength(1);
    expect(result.ids.problems[0]).toContain('doctor check id `themes`');
  });
});

describe('rule 2 — the released CLI JSON contract', () => {
  it('reads response types, typedef fields, golden fields, and doctor ids', () => {
    const ids = [...cliJsonIds(memoryTree(repo())).keys()];
    expect(ids).toEqual(
      expect.arrayContaining([
        'response-type:doctor',
        'response-type:docs.list',
        'field:DoctorCheck.id',
        'field:DoctorCheck.fix',
        'field:DoctorResponse.data',
        'golden:docs-list.json:data[].topic',
        'doctor-check:node-version',
        'doctor-check:themes',
      ]),
    );
    expect(ids.some(id => id.includes('doctor.test'))).toBe(false);
  });

  it('flags a removed response field and a removed response type', () => {
    const base = repo();
    const head = repo({
      'packages/cli/api/doctor/doctor.type.mjs': DOCTOR_TYPES.replace(
        ' * @property {string} [fix] - Remediation.\n',
        '',
      ),
      'packages/cli/foundation/response/response-types.doc.mjs':
        RESPONSE_TYPES.replace(
          "    {value: 'docs.list', description: 'Doc topics.'},\n",
          '',
        ),
      '.changeset/x.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[fix] Tidy.',
      ),
    });
    const problems = change(base, head).ids.problems.join('\n');
    expect(problems).toContain('response field `DoctorCheck.fix`');
    expect(problems).toContain('response type `docs.list`');
  });

  it('clears a removed field only by its full identity, not a shared field name', () => {
    const base = repo();
    const removed = DOCTOR_TYPES.replace(
      ' * @property {string} [fix] - Remediation.\n',
      '',
    );
    const byName = repo({
      'packages/cli/api/doctor/doctor.type.mjs': removed,
      '.changeset/x.md': changeset(
        {'@astryxdesign/cli': 'minor'},
        '[breaking] Drop `fix`.',
      ),
    });
    expect(change(base, byName).ids.problems).toHaveLength(1);
    const byIdentity = repo({
      'packages/cli/api/doctor/doctor.type.mjs': removed,
      '.changeset/x.md': changeset(
        {'@astryxdesign/cli': 'minor'},
        '[breaking] Drop `DoctorCheck.fix`.',
      ),
    });
    expect(change(base, byIdentity).problems).toEqual([]);
  });

  it('does not count moving fields into a composed typedef as a removal', () => {
    const released = repo({
      'packages/cli/api/docs/docs.type.mjs':
        '/**\n * @typedef {object} DocsIndexSection\n * @property {string} id\n * @property {string} title\n */\n',
    });
    const head = repo({
      'packages/cli/api/docs/docs.type.mjs':
        '/**\n * @typedef {object} DocsIndexEntry\n * @property {string} id\n * @property {string} title\n */\n\n' +
        '/**\n * @typedef {DocsIndexEntry & {package: string}} DocsIndexSection\n */\n',
      '.changeset/x.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[feat] Sections name their `package`.',
      ),
    });
    expect(change(released, head).problems).toEqual([]);
  });

  it('ignores an id that was never released (FR2)', () => {
    const released = repo();
    const base = repo({
      'packages/cli/api/doctor/theme-checks.mjs': THEME_CHECKS,
    });
    const head = repo({
      '.changeset/x.md': changeset(
        {'@astryxdesign/cli': 'patch'},
        '[fix] Drop the unreleased `theme-management` check.',
      ),
    });
    expect(change(base, head, {released}).problems).toEqual([]);
  });
});

describe('parsers', () => {
  it('reads typedef fields through nested type braces and optional names', () => {
    expect(typedefFields(DOCTOR_TYPES)).toEqual([
      'DoctorCheck.id',
      'DoctorCheck.label',
      'DoctorCheck.fix',
      'DoctorResponse.type',
      'DoctorResponse.data',
    ]);
    expect(
      typedefFields(
        '/**\n * @typedef {object} R\n * @property {object} data\n * @property {string[]} data.items\n */',
      ),
    ).toEqual(['R.data', 'R.data.items']);
    expect(
      typedefFields(
        "/**\n * @typedef {object} Base\n * @property {import('@astryxdesign/cli/authoring').Block[]} [content]\n */",
        "/**\n * @typedef {Base & {package: string, 'kind'?: string}} Child\n */",
      ).sort(),
    ).toEqual(['Base.content', 'Child.content', 'Child.kind', 'Child.package']);
  });

  it('collects key paths, not values', () => {
    expect(jsonKeyPaths({type: 'x', data: [{a: 1, b: {c: 2}}]})).toEqual([
      'type',
      'data',
      'data[].a',
      'data[].b',
      'data[].b.c',
    ]);
  });
});

describe('lint workflow', () => {
  it('runs the Changeset coverage and generated CLI README checks on pull requests', () => {
    const workflow = fs.readFileSync(
      new URL('../../.github/workflows/lint.yml', import.meta.url),
      'utf8',
    );
    expect(workflow).toMatch(/^ {2}pull_request:/m);
    expect(workflow).toContain(
      'node scripts/release/changeset-coverage.mjs pr',
    );
    expect(workflow).toContain(
      'node packages/cli/scripts/generate-cli-readme.mjs --check',
    );
  });
});
