// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {
  analyzeSetupIntegrity,
  pairedModeArmSpans,
  setupDiffSha256,
  substantiveLineDelta,
  WHOLESALE_REPLACEMENT_THRESHOLD,
} from './setup-integrity.mjs';

const temporaryDirectories = [];
const INTEGRITY_CLI = fileURLToPath(
  new URL('./setup-integrity.mjs', import.meta.url),
);

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'setup-integrity-tests',
      GIT_AUTHOR_EMAIL: 'setup-integrity-tests@example.com',
      GIT_COMMITTER_NAME: 'setup-integrity-tests',
      GIT_COMMITTER_EMAIL: 'setup-integrity-tests@example.com',
    },
  });
}

function write(directory, relativePath, content) {
  const file = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

// The baseline repository is built once, before the tests, and copied for
// each test. A copy costs no git launch, and each launch is slow on a loaded
// machine.
let baselineRepository = null;
beforeAll(() => {
  baselineRepository = baseline();
});
afterAll(() => {
  if (baselineRepository !== null) {
    fs.rmSync(baselineRepository, {recursive: true, force: true});
  }
});

function repository() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'setup-integrity-test-'),
  );
  temporaryDirectories.push(directory);
  fs.cpSync(baselineRepository, directory, {recursive: true});
  return directory;
}

function baseline() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'setup-integrity-baseline-'),
  );
  write(directory, '.gitignore', 'ignored.txt\n');
  write(
    directory,
    'src/App.tsx',
    [
      'export function App() {',
      '  return <main className="host">Host application</main>;',
      '}',
      '',
    ].join('\n'),
  );
  write(
    directory,
    'src/index.css',
    [
      ':root {',
      '  color-scheme: light dark;',
      '}',
      '.host {',
      '  color: CanvasText;',
      '}',
      '',
    ].join('\n'),
  );
  git(directory, ['init', '-q']);
  git(directory, ['add', '-A']);
  git(directory, ['commit', '-qm', 'baseline']);
  return directory;
}

function addValidAstryxChange(directory) {
  write(
    directory,
    'src/App.tsx',
    [
      "import {Button} from '@astryxdesign/core/Button';",
      '',
      'export function App() {',
      '  return (',
      '    <main className="host">',
      '      Host application',
      '      <Button label="Continue" />',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n'),
  );
}

function attest(directory) {
  return setupDiffSha256(directory);
}

function kinds(result) {
  return result.escapeHatches.map(finding => finding.kind);
}

const HOST_RECORDS = [
  {name: 'Quarterly plan', owner: 'Avery', state: 'Ready'},
  {name: 'Partner review', owner: 'Morgan', state: 'In progress'},
  {name: 'Launch checklist', owner: 'Riley', state: 'Blocked'},
  {name: 'Vendor renewal', owner: 'Jordan', state: 'Ready'},
  {name: 'Budget transfer', owner: 'Casey', state: 'In progress'},
  {name: 'Access request', owner: 'Quinn', state: 'Ready'},
  {name: 'Hardware order', owner: 'Reese', state: 'Blocked'},
  {name: 'Contract amendment', owner: 'Sasha', state: 'Ready'},
];

/**
 * The JSX a provider wrapper re-indents: everything between `return (` and the
 * closing paren, at the indentation an unwrapped component tree has.
 */
function hostAppTree() {
  return [
    "    <div className={dark ? 'dark' : ''}>",
    '      <main',
    '        className="min-h-screen bg-background px-6 py-8 text-foreground"',
    '        data-vibe-probe="host-shell">',
    '        <div className="mx-auto max-w-5xl space-y-6">',
    '          <header className="flex items-center justify-between gap-4">',
    '            <div>',
    '              <p className="text-sm text-muted-foreground">Review queue</p>',
    '              <h1',
    '                className="text-2xl font-semibold tracking-tight"',
    '                data-vibe-probe="page-title">',
    '                Purchase requests',
    '              </h1>',
    '            </div>',
    '            <div className="flex gap-2">',
    '              <Button',
    '                variant="outline"',
    '                onClick={() => setDark(value => !value)}>',
    '                Toggle mode',
    '              </Button>',
    '            </div>',
    '          </header>',
    '          <Card className="divide-y" data-vibe-probe="record-list">',
    ...HOST_RECORDS.flatMap(record => [
      '            <div className="flex items-center justify-between px-4 py-3">',
      `              <span className="font-medium">${record.name}</span>`,
      `              <span className="text-muted-foreground">${record.owner}</span>`,
      `              <span className="text-sm">${record.state}</span>`,
      '            </div>',
    ]),
    '          </Card>',
    '        </div>',
    '      </main>',
    '    </div>',
  ];
}

/** An established host `App.tsx`, most of whose lines sit inside the tree. */
function establishedHostApp() {
  return [
    "import {useState} from 'react';",
    "import {Button} from '@/components/ui/button';",
    "import {Card} from '@/components/ui/card';",
    '',
    'export default function App() {',
    '  const [dark, setDark] = useState(false);',
    '',
    '  return (',
    ...hostAppTree(),
    '  );',
    '}',
    '',
  ].join('\n');
}

/**
 * The same app after adding Astryx: three imports, a `<Theme>` wrapper, one new
 * button — and, because the wrapper adds a nesting level, two more spaces of
 * indentation on every line of the tree. This is the shape that made a raw
 * line diff report the whole component tree as deleted.
 */
function wrappedHostApp() {
  return [
    "import {useState} from 'react';",
    "import {Button as AstryxButton} from '@astryxdesign/core/Button';",
    "import {Theme} from '@astryxdesign/core/theme';",
    "import {neutralTheme} from '@astryxdesign/theme-neutral/built';",
    "import {Button} from '@/components/ui/button';",
    "import {Card} from '@/components/ui/card';",
    '',
    'export default function App() {',
    '  const [dark, setDark] = useState(false);',
    '',
    '  return (',
    "    <Theme theme={neutralTheme} mode={dark ? 'dark' : 'light'}>",
    ...hostAppTree().map(line => (line === '' ? line : `  ${line}`)),
    '    </Theme>',
    '  );',
    '}',
    '',
  ].join('\n');
}

function numstat(directory, relativePath) {
  return parseNumstat(
    git(directory, [
      'diff',
      '--numstat',
      '--no-renames',
      'HEAD',
      '--',
      relativePath,
    ]),
  );
}

function numstatIgnoringWhitespace(directory, relativePath) {
  return parseNumstat(
    git(directory, [
      'diff',
      '--numstat',
      '--no-renames',
      '-w',
      'HEAD',
      '--',
      relativePath,
    ]),
  );
}

function parseNumstat(output) {
  const [record] = output.split('\n').filter(Boolean);
  if (!record) return {added: 0, deleted: 0};
  const [added, deleted] = record.split('\t');
  return {added: Number(added), deleted: Number(deleted)};
}

function commitHostApp(directory, source) {
  write(directory, 'src/App.tsx', source);
  git(directory, ['add', 'src/App.tsx']);
  git(directory, ['commit', '-qm', 'establish host app']);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe('setup integrity', () => {
  it('accepts a clean Astryx diff with an exact runner attestation and stays read-only', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    const digest = attest(directory);
    const before = git(directory, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(result).toMatchObject({
      schemaVersion: 1,
      diffSha256: digest,
      astryxUsage: {found: true},
      escapeHatches: [],
      attestation: {provided: true, expectedSha256: digest, matches: true},
      accepted: true,
      rejectionReasons: [],
    });
    expect(result.astryxUsage.evidence).toEqual([
      {
        path: 'src/App.tsx',
        line: 1,
        kind: 'code-import',
        text: "import {Button} from '@astryxdesign/core/Button';",
      },
    ]);
    expect(
      git(directory, [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=all',
      ]),
    ).toBe(before);
  });

  it('reports deterministic changed-file inventory and line totals', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/new.css', '.panel { color: CanvasText; }\n');
    write(directory, 'ignored.txt', 'not part of the agent diff\n');

    const first = analyzeSetupIntegrity(directory);
    const second = analyzeSetupIntegrity(directory);

    expect(second.diffSha256).toBe(first.diffSha256);
    expect(first.changedFiles).toEqual([
      {
        path: 'src/App.tsx',
        status: 'modified',
        tracked: true,
        added: 8,
        deleted: 1,
        binary: false,
      },
      {
        path: 'src/new.css',
        status: 'untracked',
        tracked: false,
        added: 1,
        deleted: 0,
        binary: false,
      },
    ]);
    expect(first.counts).toEqual({files: 2, added: 9, deleted: 1});
    expect(first.rejectionReasons).toContain('missing-attestation');
  });

  it.each([
    {
      name: 'hardcoded !important',
      source: '.host { color: red !important; }\n',
      expected: 'hardcoded-important',
    },
    {
      name: 'blanket all-property reset',
      source: '.host { all: revert; }\n',
      expected: 'blanket-reset',
    },
    {
      name: 'explicit dark-mode disabling',
      source: ':root { color-scheme: light; }\n',
      expected: 'dark-mode-disabled',
    },
  ])('rejects added $name', ({source, expected}) => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/escape.css', source);
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).toContain(expected);
    expect(result.accepted).toBe(false);
  });

  it('allows the standard light-and-dark color-scheme declaration', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/theme.css', ':root { color-scheme: light dark; }\n');
    const digest = attest(directory);
    expect(kinds(analyzeSetupIntegrity(directory, digest))).not.toContain(
      'dark-mode-disabled',
    );
  });

  describe('color-scheme mode arms', () => {
    /**
     * Real `astryx theme build` output, captured verbatim from a theme that
     * extends `neutralTheme`. Two runs of homogeneous rules — the remaining
     * prose elements and the `--color-data-*` defaults — are elided and marked,
     * and the component block is reduced to one rule; every other byte,
     * including the `@generated` header, the nested `@layer`/`@scope`
     * structure, the three document `color-scheme` rules and the inverted
     * media-surface pair, is exactly what the CLI emits. The emitted shape
     * itself is guarded upstream by
     * `packages/cli/clients/cli/commands/build-theme.color-scheme.test.mjs`.
     */
    const BUILT_THEME_CSS = `/*
 * @generated by \`astryx theme build\` — do not edit manually.
 * Source: src/hostTheme.mjs
 * Command: astryx theme build src/hostTheme.mjs
 * CLI: @astryxdesign/cli@0.5.2
 * Core: @astryxdesign/core@0.5.2
 */

@layer reset {
@scope ([data-astryx-theme="apptheme"]) to ([data-astryx-theme]) {
  :where(h1, h2, h3, h4, h5, h6) {
    font-family: var(--font-family-heading);
    color: var(--color-text-primary);
  }

  /* elided: the remaining h1-h6, p, small and code/pre prose rules */

  :where(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
  }
}
}

@layer astryx-base {
:root {
  --color-data-categorical-blue: light-dark(#0171E3, #0171E3);
  /* elided: the remaining --color-data-* defaults */
  --color-data-neutral: light-dark(#8494A3, #8C939B);
}
}

@layer astryx-theme {
  :root { color-scheme: light dark; }
  html[data-theme="light"] { color-scheme: light; }
  html[data-theme="dark"] { color-scheme: dark; }

@scope ([data-astryx-theme="apptheme"]) to ([data-astryx-theme]) {
  :scope {
    --color-accent: light-dark(#0B5FFF, #74A8FF);
  }
}
}

@layer astryx-theme {
@scope ([data-astryx-theme="apptheme"]) to ([data-astryx-theme]) {
  [data-astryx-media="dark"] {
    color-scheme: dark;
    --color-text-primary: var(--color-on-dark);
  }

  [data-astryx-media="light"] {
    color-scheme: light;
    --color-text-primary: var(--color-on-light);
  }
}
}
`;

    /** The theme source that artifact names, so its provenance resolves. */
    const BUILT_THEME_SOURCE = `export default {
  name: 'apptheme',
  tokens: {'--color-accent': 'light-dark(#0B5FFF, #74A8FF)'},
};
`;

    /** A host stylesheet that owns its own light/dark switch, by hand. */
    const HOST_MODE_CSS = [
      ":where(.fixture-shell[data-mode='light']) {",
      '  color-scheme: light;',
      '  --background: #f4f6f9;',
      '}',
      '',
      ":where(.fixture-shell[data-mode='dark']) {",
      '  color-scheme: dark;',
      '  --background: #111726;',
      '}',
      '',
    ].join('\n');

    function withBuiltTheme(directory, css = BUILT_THEME_CSS) {
      write(directory, 'src/hostTheme.mjs', BUILT_THEME_SOURCE);
      write(directory, 'src/apptheme.css', css);
    }

    function darkModeFindings(directory) {
      return analyzeSetupIntegrity(directory, attest(directory))
        .escapeHatches.filter(finding => finding.kind === 'dark-mode-disabled')
        .map(finding => `${finding.path}:${finding.line}`);
    }

    /** Where a snippet lands in a file, so expectations track the fixture. */
    function lineOf(text, snippet) {
      const at = text.indexOf(snippet);
      if (at < 0) throw new Error(`snippet not in fixture: ${snippet}`);
      return text.slice(0, at).split('\n').length;
    }

    /** The light-valued declarations in the artifact, both of them arms. */
    const LIGHT_DECLARATIONS = [
      'html[data-theme="light"]',
      'color-scheme: light;\n    --color-text-primary: var(--color-on-light);',
    ];

    /** Every light declaration flagged, i.e. the whole file unexempted. */
    function everyLightArm(path, css) {
      return LIGHT_DECLARATIONS.map(
        snippet => `${path}:${lineOf(css, snippet)}`,
      );
    }

    it('accepts the paired mode arms a real built theme emits', () => {
      const directory = repository();
      addValidAstryxChange(directory);
      withBuiltTheme(directory);
      const digest = attest(directory);

      const result = analyzeSetupIntegrity(directory, digest);

      expect(result.escapeHatches).toEqual([]);
      expect(result.accepted).toBe(true);
    });

    // MUTATION PROOFS. Each one changes exactly one thing about the artifact
    // above and must be rejected, so the test before this cannot pass by the
    // check having been switched off for built themes.
    it.each([
      {
        name: 'its dark arm rewritten to light',
        css: BUILT_THEME_CSS.replace(
          'html[data-theme="dark"] { color-scheme: dark; }',
          'html[data-theme="dark"] { color-scheme: light; }',
        ),
        // Neither arm survives: the pair no longer covers both modes.
        flagged: [
          'html[data-theme="light"] { color-scheme: light; }',
          'html[data-theme="dark"] { color-scheme: light; }',
        ],
      },
      {
        name: 'its dark arm deleted',
        css: BUILT_THEME_CSS.replace(
          '  html[data-theme="dark"] { color-scheme: dark; }\n',
          '',
        ),
        flagged: ['html[data-theme="light"] { color-scheme: light; }'],
      },
      {
        name: 'a global light pin added beside the pair',
        css: BUILT_THEME_CSS.replace(
          '@layer astryx-theme {\n',
          '@layer astryx-theme {\n  html { color-scheme: light; }\n',
        ),
        flagged: ['html { color-scheme: light; }'],
      },
      {
        name: 'a light pin sharing a line with a real arm',
        css: BUILT_THEME_CSS.replace(
          'html[data-theme="light"] { color-scheme: light; }',
          'html[data-theme="light"] { color-scheme: light; } html { color-scheme: light; }',
        ),
        flagged: ['html[data-theme="light"] { color-scheme: light; } html'],
      },
    ])('rejects a built theme with $name', ({css, flagged}) => {
      const directory = repository();
      addValidAstryxChange(directory);
      withBuiltTheme(directory, css);

      expect(darkModeFindings(directory)).toEqual(
        flagged.map(snippet => `src/apptheme.css:${lineOf(css, snippet)}`),
      );
    });

    it.each([
      {
        name: 'a forged generated banner',
        // The banner claims a source that was never written.
        setUp: directory => {
          write(directory, 'src/apptheme.css', BUILT_THEME_CSS);
          return {path: 'src/apptheme.css', css: BUILT_THEME_CSS};
        },
      },
      {
        name: 'an artifact that is not where its source builds it',
        // `astryx theme build src/hostTheme.mjs` writes next to its source, so
        // a copy in another directory is not the artifact its header claims.
        setUp: directory => {
          write(directory, 'src/hostTheme.mjs', BUILT_THEME_SOURCE);
          write(directory, 'vendor/apptheme.css', BUILT_THEME_CSS);
          return {path: 'vendor/apptheme.css', css: BUILT_THEME_CSS};
        },
      },
      {
        name: 'a banner whose source escapes the sandbox',
        setUp: directory => {
          write(directory, 'src/hostTheme.mjs', BUILT_THEME_SOURCE);
          const css = BUILT_THEME_CSS.replace(
            'Source: src/hostTheme.mjs',
            'Source: ../../elsewhere/hostTheme.mjs',
          );
          write(directory, 'src/apptheme.css', css);
          return {path: 'src/apptheme.css', css};
        },
      },
    ])('refuses the exemption to $name', ({setUp}) => {
      const directory = repository();
      addValidAstryxChange(directory);
      const {path, css} = setUp(directory);

      expect(darkModeFindings(directory)).toEqual(everyLightArm(path, css));
    });

    it('keeps scanning a genuine built theme for every other escape hatch', () => {
      const directory = repository();
      addValidAstryxChange(directory);
      withBuiltTheme(
        directory,
        BUILT_THEME_CSS.replace(
          '    --color-accent: light-dark(#0B5FFF, #74A8FF);',
          '    --color-accent: light-dark(#0B5FFF, #74A8FF) !important;',
        ),
      );

      expect(
        kinds(analyzeSetupIntegrity(directory, attest(directory))),
      ).toEqual(['hardcoded-important']);
    });

    it("accepts a host stylesheet's own hand-written mode arms", () => {
      const directory = repository();
      addValidAstryxChange(directory);
      write(directory, 'src/host-modes.css', HOST_MODE_CSS);

      expect(darkModeFindings(directory)).toEqual([]);
    });

    it('accepts re-indenting an arm of the host switch', () => {
      const directory = repository();
      write(directory, 'src/index.css', HOST_MODE_CSS);
      git(directory, ['add', 'src/index.css']);
      git(directory, ['commit', '-qm', 'establish host modes']);
      addValidAstryxChange(directory);
      write(
        directory,
        'src/index.css',
        HOST_MODE_CSS.replace(
          '  color-scheme: light;',
          '    color-scheme: light;',
        ),
      );

      expect(darkModeFindings(directory)).toEqual([]);
    });

    it('rejects dropping one arm of the host switch behind a fresh pair', () => {
      const directory = repository();
      write(directory, 'src/index.css', HOST_MODE_CSS);
      git(directory, ['add', 'src/index.css']);
      git(directory, ['commit', '-qm', 'establish host modes']);
      addValidAstryxChange(directory);
      // The host's dark arm is gone; a fresh, correctly paired switch is added
      // in its place. The pair alone would qualify, but the file lost an arm.
      write(
        directory,
        'src/index.css',
        [
          ":where(.fixture-shell[data-mode='light']) {",
          '  color-scheme: light;',
          '  --background: #f4f6f9;',
          '}',
          '',
          'html[data-theme="light"] { color-scheme: light; }',
          'html[data-theme="dark"] { color-scheme: dark; }',
          '',
        ].join('\n'),
      );

      expect(darkModeFindings(directory)).toEqual([
        // The host's surviving light arm is untouched by this change, so only
        // the added line is scanned — and it no longer earns the exemption.
        'src/index.css:6',
      ]);
    });

    it('does not exempt a mode arm quoted inside application code', () => {
      const directory = repository();
      addValidAstryxChange(directory);
      write(
        directory,
        'src/inject.ts',
        [
          'export const arms = [',
          '  \'html[data-theme="light"] { color-scheme: light; }\',',
          '  \'html[data-theme="dark"] { color-scheme: dark; }\',',
          '];',
          '',
        ].join('\n'),
      );

      expect(darkModeFindings(directory)).toEqual(['src/inject.ts:2']);
    });

    it.each([
      {
        name: 'a prefers-color-scheme pair',
        css: [
          '@media (prefers-color-scheme: light) {',
          '  :root { color-scheme: light; }',
          '}',
          '@media (prefers-color-scheme: dark) {',
          '  :root { color-scheme: dark; }',
          '}',
          '',
        ].join('\n'),
        exempt: [2, 5],
      },
      {
        name: 'arms at different scopes',
        css: 'html[data-theme="light"] { color-scheme: light; }\n.widget[data-theme="dark"] { color-scheme: dark; }\n',
        exempt: [],
      },
      {
        name: 'an arm under an ambiguous selector',
        css: 'html[data-theme="light"] .dark { color-scheme: light; }\nhtml[data-theme="dark"] .dark { color-scheme: dark; }\n',
        exempt: [],
      },
      {
        name: 'a theme-name attribute, which names no mode',
        css: '[data-astryx-theme="apptheme"] { color-scheme: light; }\n[data-astryx-theme="appdark"] { color-scheme: dark; }\n',
        exempt: [],
      },
      {
        name: 'a brace hidden in a string value',
        css: [
          'html[data-theme="light"]::after { content: "}"; color-scheme: light; }',
          'html[data-theme="dark"]::after { content: "}"; color-scheme: dark; }',
          '',
        ].join('\n'),
        exempt: [1, 2],
      },
    ])('reads $name correctly', ({css, exempt}) => {
      expect([...pairedModeArmSpans(css).keys()].sort((a, b) => a - b)).toEqual(
        exempt,
      );
    });
  });

  it('does not treat prose or lockfile text as a CSS escape hatch', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'README.md',
      'Avoid using !important in application CSS.\n',
    );
    const digest = attest(directory);
    expect(kinds(analyzeSetupIntegrity(directory, digest))).not.toContain(
      'hardcoded-important',
    );
  });

  it('rejects changing ignore rules after the execution baseline', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, '.gitignore', 'ignored.txt\nhidden.css\n');
    const digest = attest(directory);
    expect(kinds(analyzeSetupIntegrity(directory, digest))).toContain(
      'gitignore-modified',
    );
  });

  it('rejects deleting host source or CSS', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    fs.rmSync(path.join(directory, 'src', 'index.css'));
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(result.escapeHatches).toContainEqual({
      kind: 'deleted-host-source',
      path: 'src/index.css',
      line: null,
      message: 'deleted a host source or stylesheet file',
    });
    expect(result.accepted).toBe(false);
  });

  it('rejects neutralizing a short host stylesheet', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/index.css', ':root {}\n');
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).toContain('neutralized-host-css');
    expect(result.accepted).toBe(false);
  });

  it('rejects removing host dark-mode behavior', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/index.css', '.host {\n  color: CanvasText;\n}\n');
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).toContain('dark-mode-removed');
    expect(result.accepted).toBe(false);
  });

  it('rejects wholesale replacement at the documented threshold', () => {
    const directory = repository();
    const baselineLines = Array.from(
      {length: WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines + 5},
      (_, index) => `export const value${index} = ${index};`,
    );
    write(directory, 'src/large.ts', `${baselineLines.join('\n')}\n`);
    git(directory, ['add', 'src/large.ts']);
    git(directory, ['commit', '-qm', 'add established source']);
    addValidAstryxChange(directory);
    write(directory, 'src/large.ts', "export const replacement = 'new';\n");
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);
    const finding = result.escapeHatches.find(
      candidate => candidate.kind === 'wholesale-replacement',
    );

    expect(finding).toMatchObject({
      path: 'src/large.ts',
      baselineLines: baselineLines.length,
      deletedLines: baselineLines.length,
      deletedFraction: 1,
    });
    expect(result.wholesaleReplacementThreshold).toEqual({
      minimumDeletedLines: 20,
      deletedFraction: 0.8,
    });
    expect(result.accepted).toBe(false);
  });

  it('rejects a mismatched runner attestation', () => {
    const directory = repository();
    addValidAstryxChange(directory);

    const result = analyzeSetupIntegrity(directory, '0'.repeat(64));

    expect(result.attestation).toEqual({
      provided: true,
      expectedSha256: '0'.repeat(64),
      matches: false,
    });
    expect(result.rejectionReasons).toContain('attestation-mismatch');
    expect(result.accepted).toBe(false);
  });

  it('rejects a missing runner attestation while still returning the digest', () => {
    const directory = repository();
    addValidAstryxChange(directory);

    const result = analyzeSetupIntegrity(directory);

    expect(result.diffSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.attestation).toEqual({
      provided: false,
      expectedSha256: null,
      matches: false,
    });
    expect(result.rejectionReasons).toContain('missing-attestation');
    expect(result.accepted).toBe(false);
  });

  it('rejects a diff with no Astryx usage evidence', () => {
    const directory = repository();
    write(
      directory,
      'src/App.tsx',
      'export function App() { return <main>Changed host</main>; }\n',
    );
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(result.astryxUsage).toEqual({found: false, evidence: []});
    expect(result.rejectionReasons).toContain('missing-astryx-usage');
    expect(result.accepted).toBe(false);
  });

  it('prints the immediate post-agent digest as JSON from the CLI', () => {
    const directory = repository();
    addValidAstryxChange(directory);

    const result = JSON.parse(
      execFileSync(process.execPath, [INTEGRITY_CLI, '--app', directory], {
        encoding: 'utf8',
      }),
    );

    expect(result.diffSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.attestation).toEqual({
      provided: false,
      expectedSha256: null,
      matches: false,
    });
  });

  it('changes the digest when a nonignored untracked file changes', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'notes.txt', 'first\n');
    const first = attest(directory);

    write(directory, 'notes.txt', 'second\n');
    const second = attest(directory);

    expect(second).not.toBe(first);
  });
});

describe('substantive line delta', () => {
  it('sees no deletion when a wrapper only re-indents the tree', () => {
    expect(
      substantiveLineDelta(establishedHostApp(), wrappedHostApp()),
    ).toEqual({
      baselineLines: expect.any(Number),
      deletedLines: 0,
      deletedFraction: 0,
    });
  });

  it('sees every line deleted when the same content is minified onto one line', () => {
    const baseline = establishedHostApp();
    const minified = `${baseline
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join(' ')}\n`;

    const delta = substantiveLineDelta(baseline, minified);

    expect(delta.deletedLines).toBe(delta.baselineLines);
    expect(delta.deletedFraction).toBe(1);
  });

  it('does not equate lines that differ by whitespace between tokens', () => {
    expect(
      substantiveLineDelta(
        'const label = "Purchase requests";\n',
        'constlabel="Purchaserequests";\n',
      ),
    ).toEqual({baselineLines: 1, deletedLines: 1, deletedFraction: 1});
  });

  it('treats a line as unchanged when only its indentation moved', () => {
    expect(
      substantiveLineDelta(
        '  <Card className="divide-y">\n',
        '      <Card className="divide-y">\n',
      ),
    ).toEqual({baselineLines: 1, deletedLines: 0, deletedFraction: 0});
  });
});

describe('setup integrity — reformatting versus replacement', () => {
  it('accepts a provider wrapper that re-indents an established component tree', () => {
    const directory = repository();
    commitHostApp(directory, establishedHostApp());
    write(directory, 'src/App.tsx', wrappedHostApp());
    const digest = attest(directory);

    // Non-vacuous: on the raw line diff this change clears both halves of the
    // documented threshold, so a guard reading `git diff --numstat` rejects it.
    const raw = numstat(directory, 'src/App.tsx');
    const baselineLines = establishedHostApp().split('\n').length - 1;
    expect(raw.deleted).toBeGreaterThanOrEqual(
      WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines,
    );
    expect(raw.deleted / baselineLines).toBeGreaterThanOrEqual(
      WHOLESALE_REPLACEMENT_THRESHOLD.deletedFraction,
    );
    // ...and nothing was actually removed: the whole diff is added lines.
    expect(numstatIgnoringWhitespace(directory, 'src/App.tsx').deleted).toBe(0);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).not.toContain('wholesale-replacement');
    expect(result.rejectionReasons).toEqual([]);
    expect(result.accepted).toBe(true);
  });

  it('still rejects gutting the component tree, re-indentation notwithstanding', () => {
    const directory = repository();
    commitHostApp(directory, establishedHostApp());
    write(
      directory,
      'src/App.tsx',
      [
        "import {Button as AstryxButton} from '@astryxdesign/core/Button';",
        '',
        'export default function App() {',
        '  return (',
        '          <AstryxButton label="Deploy" variant="primary" />',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);
    const finding = result.escapeHatches.find(
      candidate => candidate.kind === 'wholesale-replacement',
    );

    expect(finding).toMatchObject({path: 'src/App.tsx'});
    expect(finding.deletedFraction).toBeGreaterThanOrEqual(
      WHOLESALE_REPLACEMENT_THRESHOLD.deletedFraction,
    );
    expect(result.accepted).toBe(false);
  });

  it('rejects a rewrite that minifies the host source onto one line', () => {
    const directory = repository();
    commitHostApp(directory, establishedHostApp());
    write(
      directory,
      'src/App.tsx',
      [
        "import {Button as AstryxButton} from '@astryxdesign/core/Button';",
        establishedHostApp()
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .join(' '),
        '',
      ].join('\n'),
    );
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).toContain('wholesale-replacement');
    expect(result.accepted).toBe(false);
  });

  it('rejects a rewrite that only removes the whitespace inside each line', () => {
    const directory = repository();
    const baselineLines = Array.from(
      {length: WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines + 10},
      (_, index) => `export const value${index} = ${index};`,
    );
    write(directory, 'src/large.ts', `${baselineLines.join('\n')}\n`);
    git(directory, ['add', 'src/large.ts']);
    git(directory, ['commit', '-qm', 'add established source']);
    addValidAstryxChange(directory);
    write(
      directory,
      'src/large.ts',
      `${baselineLines.map(line => line.replaceAll(' ', '')).join('\n')}\n`,
    );
    const digest = attest(directory);

    // A guard that asked Git to ignore whitespace would see nothing at all
    // here, because `-w` equates `a b` with `ab`.
    expect(numstatIgnoringWhitespace(directory, 'src/large.ts').deleted).toBe(
      0,
    );

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).toContain('wholesale-replacement');
    expect(result.accepted).toBe(false);
  });

  it('does not treat wrapping a stylesheet in a layer as neutralizing it', () => {
    const directory = repository();
    const rules = Array.from(
      {length: WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines + 4},
      (_, index) => `.host-row-${index} {\n  color: CanvasText;\n}`,
    ).join('\n');
    write(
      directory,
      'src/index.css',
      `:root {\n  color-scheme: light dark;\n}\n${rules}\n`,
    );
    git(directory, ['add', 'src/index.css']);
    git(directory, ['commit', '-qm', 'establish host stylesheet']);
    addValidAstryxChange(directory);
    write(
      directory,
      'src/index.css',
      `@layer base {\n${`:root {\n  color-scheme: light dark;\n}\n${rules}`
        .split('\n')
        .map(line => (line === '' ? line : `  ${line}`))
        .join('\n')}\n}\n`,
    );
    const digest = attest(directory);

    const raw = numstat(directory, 'src/index.css');
    expect(raw.deleted).toBeGreaterThanOrEqual(
      WHOLESALE_REPLACEMENT_THRESHOLD.minimumDeletedLines,
    );

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).not.toContain('neutralized-host-css');
    expect(kinds(result)).not.toContain('wholesale-replacement');
  });
});

/**
 * `hardcoded-important` at the sandbox level.
 *
 * The unit-level behavior lives in `setup-important.test.mjs`; these cases
 * prove the analyzer is actually wired into the escape-hatch scan, on both
 * tracked and untracked files, and that nothing else about the scan moved.
 */
describe('setup integrity — hardcoded !important is syntactic', () => {
  const GUEST_CONTAINED_REGION = [
    "import {Theme, neutralTheme} from '@astryxdesign/core';",
    '',
    '/**',
    ' * Keep the design system inside this region.',
    ' *',
    ' * TRADEOFF: with the theme attribute removed, body-portaled content loses',
    ' * its tokens. Do not re-add a global attribute under another name, copy',
    ' * theme variables onto `body`, or paper over it with `!important`.',
    ' */',
    'export function AstryxRegion({mode, children}) {',
    '  return (',
    '    <Theme theme={neutralTheme} mode={mode}>',
    '      {children}',
    '    </Theme>',
    '  );',
    '}',
    '',
  ].join('\n');

  it('does not fail a run for a comment that names the flag', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, 'src/AstryxRegion.tsx', GUEST_CONTAINED_REGION);
    const digest = attest(directory);

    const result = analyzeSetupIntegrity(directory, digest);

    expect(kinds(result)).not.toContain('hardcoded-important');
    expect(result.accepted).toBe(true);
  });

  it.each([
    {
      name: 'a CSS-in-JS template',
      file: 'src/sheet.ts',
      source: 'export const sheet = `.host { color: red !important; }`;\n',
    },
    {
      name: 'a generated stylesheet',
      file: 'src/theme.css',
      source: '.host { color: red !important; }\n',
    },
  ])('still fails a run for $name', ({file, source}) => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, file, source);

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).toContain('hardcoded-important');
    expect(result.accepted).toBe(false);
  });

  it('reports the override and not the comment that disclaims it', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'src/AstryxRegion.tsx',
      `${GUEST_CONTAINED_REGION}const patch = {color: 'red !important'};\n`,
    );

    const findings = analyzeSetupIntegrity(
      directory,
      attest(directory),
    ).escapeHatches.filter(finding => finding.kind === 'hardcoded-important');

    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('src/AstryxRegion.tsx');
    expect(findings[0].line).toBe(GUEST_CONTAINED_REGION.split('\n').length);
  });

  it('fails a run for an override hidden behind comment delimiters', () => {
    // `<!--` opens a comment only in markup text, so this string is code: the
    // override it carries reaches the host, and the check must see it.
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'public/boot.html',
      [
        '<div id="root"></div>',
        '<script>',
        "  const cloak = '<!-- color: red !important -->';",
        '  document.body.style.cssText = cloak.slice(4, -3).trim();',
        '</script>',
        '',
      ].join('\n'),
    );

    const findings = analyzeSetupIntegrity(
      directory,
      attest(directory),
    ).escapeHatches.filter(finding => finding.kind === 'hardcoded-important');

    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('public/boot.html');
    expect(findings[0].line).toBe(3);
  });

  it('still accepts a real markup comment that names the flag', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'public/notes.html',
      '<!-- color: red !important is banned here -->\n<div id="root"></div>\n',
    );

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).not.toContain('hardcoded-important');
    expect(result.accepted).toBe(true);
  });

  it('fails a run for an unquoted style attribute override', () => {
    // Valid HTML, and the form a quoted-only pattern never saw.
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'public/boot.html',
      '<div id="root" style=color:red!important></div>\n',
    );

    const findings = analyzeSetupIntegrity(
      directory,
      attest(directory),
    ).escapeHatches.filter(finding => finding.kind === 'hardcoded-important');

    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  it('does not fail a run for a data-style attribute', () => {
    // The browser never applies this as CSS, so it is not an override.
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'public/notes.html',
      '<div data-style="color: red !important"></div>\n',
    );

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).not.toContain('hardcoded-important');
    expect(result.accepted).toBe(true);
  });

  it('judges a modified tracked file by its added lines only', () => {
    const directory = repository();
    write(directory, 'src/legacy.css', '.legacy { color: red !important; }\n');
    git(directory, ['add', 'src/legacy.css']);
    git(directory, ['commit', '-qm', 'pre-existing override']);
    addValidAstryxChange(directory);
    write(
      directory,
      'src/legacy.css',
      '.legacy { color: red !important; }\n/* untouched by this change */\n',
    );

    expect(
      kinds(analyzeSetupIntegrity(directory, attest(directory))),
    ).not.toContain('hardcoded-important');
  });
});

/**
 * `blanket-reset` and `dark-mode-disabled` at the sandbox level.
 *
 * These are the two hatches still found by matching a line, and both used to
 * match prose: guidance that names `all: unset`, or a comment recording that
 * the host's own light arm was deliberately left alone, failed the run for
 * saying the right thing. The line is now read with its comments blanked (see
 * `setup-comments.mjs`), so what remains judged is what the host actually
 * gained. The unit-level behavior lives in `setup-comments.test.mjs`.
 */
describe('setup integrity — pattern hatches do not read prose', () => {
  it.each([
    {
      name: 'a comment naming a blanket reset',
      file: 'src/AstryxRegion.tsx',
      source: [
        '/**',
        ' * Scope the design system to this region.',
        ' *',
        ' * TRADEOFF: do NOT flatten the host with `all: unset` to stop its',
        ' * cascade reaching in — that would take the host apart.',
        ' */',
        'export function AstryxRegion({children}) {',
        '  return <div className="astryx-region">{children}</div>;',
        '}',
        '',
      ].join('\n'),
      kind: 'blanket-reset',
    },
    {
      name: 'a stylesheet comment naming a blanket reset',
      file: 'src/region.css',
      source: [
        '/* Deliberately narrow: `all: unset` here would strip the host too. */',
        '.astryx-region {',
        '  color: CanvasText;',
        '}',
        '',
      ].join('\n'),
      kind: 'blanket-reset',
    },
    {
      name: 'a comment recording that the host light arm was left alone',
      file: 'src/notes.ts',
      source: [
        '// The host declares `color-scheme: light` on its own root and we did',
        '// not touch it; setting `darkMode: false` would have been the easy',
        '// way out.',
        'export const migrated = true;',
        '',
      ].join('\n'),
      kind: 'dark-mode-disabled',
    },
    {
      name: 'an HTML comment naming the meta tag',
      file: 'public/notes.html',
      source: [
        '<!doctype html>',
        '<!-- Not this: <meta name="color-scheme" content="light"> -->',
        '<div id="root"></div>',
        '',
      ].join('\n'),
      kind: 'dark-mode-disabled',
    },
  ])('does not fail a run for $name', ({file, source, kind}) => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, file, source);

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).not.toContain(kind);
    expect(result.accepted).toBe(true);
  });

  it.each([
    {
      name: 'a blanket reset',
      file: 'src/region.css',
      source: '.astryx-region {\n  all: unset;\n}\n',
      kind: 'blanket-reset',
    },
    {
      name: 'a disabled dark mode',
      file: 'src/config.ts',
      source: 'export const config = {darkMode: false};\n',
      kind: 'dark-mode-disabled',
    },
  ])('still fails a run for $name', ({file, source, kind}) => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(directory, file, source);

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).toContain(kind);
    expect(result.accepted).toBe(false);
  });

  it.each([
    {
      name: 'a blanket reset',
      file: 'src/region.css',
      source: '.astryx-region {\n  all: unset; /* not prose */\n}\n',
      kind: 'blanket-reset',
      line: 2,
    },
    {
      name: 'a disabled dark mode',
      file: 'src/config.ts',
      source:
        '// The host owns this decision.\nexport const config = {darkMode: false}; // not prose\n',
      kind: 'dark-mode-disabled',
      line: 2,
    },
  ])(
    'reports $name written beside the comment about it',
    ({file, source, kind, line}) => {
      const directory = repository();
      addValidAstryxChange(directory);
      write(directory, file, source);

      const findings = analyzeSetupIntegrity(
        directory,
        attest(directory),
      ).escapeHatches.filter(finding => finding.kind === kind);

      expect(findings).toHaveLength(1);
      expect(findings[0].path).toBe(file);
      expect(findings[0].line).toBe(line);
    },
  );

  it('fails a run for a hatch a script hides behind comment delimiters', () => {
    // `<!--` opens a comment only in markup text. A flat scan for the
    // delimiters would blank this string, and the reset it reconstructs would
    // reach the host unexamined.
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'public/boot.html',
      [
        '<div id="root"></div>',
        '<script>',
        "  const cloak = '<!-- all: unset -->';",
        '  document.body.style.cssText = cloak.slice(4, -3).trim();',
        '</script>',
        '',
      ].join('\n'),
    );

    const findings = analyzeSetupIntegrity(
      directory,
      attest(directory),
    ).escapeHatches.filter(finding => finding.kind === 'blanket-reset');

    expect(findings).toHaveLength(1);
    expect(findings[0].path).toBe('public/boot.html');
    expect(findings[0].line).toBe(3);
  });

  it('still exempts a paired mode arm, which is not a comment', () => {
    const directory = repository();
    addValidAstryxChange(directory);
    write(
      directory,
      'src/theme.css',
      [
        'html[data-theme="light"] {',
        '  color-scheme: light;',
        '}',
        'html[data-theme="dark"] {',
        '  color-scheme: dark;',
        '}',
        '',
      ].join('\n'),
    );

    const result = analyzeSetupIntegrity(directory, attest(directory));

    expect(kinds(result)).not.toContain('dark-mode-disabled');
  });
});
