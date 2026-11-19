// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for template-needs analysis: external package detection, StyleX
 * compiler warning, and install command generation.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractImportedPackages,
  analyzeTemplateNeeds,
  installCommandFor,
  installStepFor,
  parsedSpecifiers,
} from './template-needs.mjs';
import {_resetHostedRun, activateHostedRun} from '../runtime/package-root.mjs';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';
import {recordDeclaredSettings} from '../env/cli-command.mjs';

// ── extractImportedPackages ─────────────────────────────────────────────────

describe('extractImportedPackages', () => {
  it('extracts bare package names from static imports', () => {
    const source = `
      import {Button} from '@astryxdesign/core';
      import {ArrowIcon} from '@heroicons/react/24/outline';
      import * as stylex from '@stylexjs/stylex';
      import {useState} from 'react';
      import recharts from 'recharts';
    `;
    const pkgs = extractImportedPackages(source);
    expect(pkgs).toEqual(
      new Set([
        '@astryxdesign/core',
        '@heroicons/react',
        '@stylexjs/stylex',
        'react',
        'recharts',
      ]),
    );
  });

  it('ignores relative and absolute imports', () => {
    const source = `
      import {foo} from './bar';
      import {baz} from '../qux';
      import {thing} from '/absolute/path';
    `;
    expect(extractImportedPackages(source).size).toBe(0);
  });

  it('ignores Node builtins with the node: prefix', () => {
    const source = `
      import * as fs from 'node:fs';
      import * as path from 'node:path';
      import {createRequire} from 'node:module';
    `;
    expect(extractImportedPackages(source).size).toBe(0);
  });

  it('ignores bare Node builtins and their subpaths', () => {
    const source = `
      import * as fs from 'fs';
      import {join} from 'path';
      import {createReadStream} from 'fs/promises';
    `;
    expect(extractImportedPackages(source).size).toBe(0);
  });

  it('handles type imports', () => {
    const source = `import type {Props} from 'some-package';`;
    expect(extractImportedPackages(source)).toEqual(new Set(['some-package']));
  });

  it('deduplicates multiple imports from the same package', () => {
    const source = `
      import {A} from '@heroicons/react/24/outline';
      import {B} from '@heroicons/react/24/solid';
    `;
    expect(extractImportedPackages(source)).toEqual(
      new Set(['@heroicons/react']),
    );
  });

  it('maps subpath imports to the package root', () => {
    const source = `
      import debounce from 'lodash/debounce';
      import {Chart} from 'recharts/es6';
    `;
    const pkgs = extractImportedPackages(source);
    expect(pkgs).toEqual(new Set(['lodash', 'recharts']));
  });
});

describe('extractImportedPackages reads only real module specifiers', () => {
  it('ignores words in comments, strings, template literals and JSX text', () => {
    const source = [
      "import {Button} from '@astryxdesign/core';",
      '/**',
      ' * Next: the copy goes stale. Pressing Next moves on.',
      " *   import { neutralTheme } from '@astryxdesign/theme-neutral';",
      ' */',
      "// import {Editor} from 'canvas-editor';",
      "const code = `import {useState} from 'react';`;",
      'const label = "from \'Distribution\'";',
      'export function Page() {',
      "  return <p>import x from 'left-pad'</p>;",
      '}',
    ].join('\n');
    expect(extractImportedPackages(source)).toEqual(
      new Set(['@astryxdesign/core']),
    );
  });

  it('reads export-from and dynamic imports', () => {
    const source = [
      "export {format} from 'date-fns';",
      "export * from 'recharts';",
      "const lazy = () => import('canvas-confetti');",
    ].join('\n');
    expect(extractImportedPackages(source)).toEqual(
      new Set(['date-fns', 'recharts', 'canvas-confetti']),
    );
  });

  it('drops path aliases and names npm does not accept, and keeps legacy capitals', () => {
    const source = [
      "import {Card} from '@/components/card';",
      "import {cn} from '~/lib/utils';",
      "import data from '#internal/data';",
      "import x from 'not a package';",
      "import JSONStream from 'JSONStream';",
      "import a1 from '@scope/_private';",
      "import a2 from '@_scope/pkg';",
      "import a3 from '@-scope/pkg';",
      "import a4 from '@.scope/pkg';",
      "import a5 from '@scope/-dash';",
      "import {a} from 'valid-pkg';",
    ].join('\n');
    expect(extractImportedPackages(source)).toEqual(
      new Set([
        'JSONStream',
        '@scope/_private',
        '@_scope/pkg',
        '@-scope/pkg',
        '@.scope/pkg',
        '@scope/-dash',
        'valid-pkg',
      ]),
    );
  });

  it('reads a type-only import() reference and a require() call', () => {
    const source = [
      "type Options = import('chart-lib').Options;",
      "const legacy = require('legacy-lib');",
    ].join('\n');
    expect(extractImportedPackages(source)).toEqual(
      new Set(['chart-lib', 'legacy-lib']),
    );
  });

  it('still reads a source the parser cannot read, statement by statement', () => {
    const source = [
      "import {a} from 'kept-pkg';",
      "// import {b} from 'commented-pkg';",
      'import {',
      '  LineChart,',
      "} from 'recharts';",
      "export const name = 'not-a-pkg';",
      "export {c} from 'reexported-pkg';",
      "const glob = 'images/*';",
      "import {d} from 'after-glob-pkg';",
      '/* a note */',
      "const url = 'https://example.com'; // import {e} from 'comment-pkg';",
      "import {f} from 'after-url-pkg';",
      'const = ;',
    ].join('\n');
    expect(extractImportedPackages(source)).toEqual(
      new Set([
        'kept-pkg',
        'recharts',
        'reexported-pkg',
        'after-glob-pkg',
        'after-url-pkg',
      ]),
    );
  });

  it.each([
    ['pages/form-wizard/page.tsx', 'Next'],
    ['pages/form-wizard-vertical/page.tsx', 'Distribution'],
    ['pages/table-tree/page.tsx', 'canvas-editor'],
  ])('reads no package from the comments of the %s template', (file, word) => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, '../../assets/templates', file),
      'utf-8',
    );
    expect(extractImportedPackages(source).has(word)).toBe(false);
  });
});

// ── analyzeTemplateNeeds ────────────────────────────────────────────────────

describe('analyzeTemplateNeeds', () => {
  let dir;
  let userAgent;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-needs-'));
    userAgent = process.env.npm_config_user_agent;
  });
  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    if (userAgent === undefined) delete process.env.npm_config_user_agent;
    else process.env.npm_config_user_agent = userAgent;
  });

  it('reports missing external packages with an install command', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {react: '^19.0.0', '@astryxdesign/core': '^0.6.0'},
      }),
    );
    const source = `
      import {Button} from '@astryxdesign/core';
      import {ArrowIcon} from '@heroicons/react/24/outline';
      import {useState} from 'react';
    `;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.missingPackages).toEqual(['@heroicons/react']);
    expect(result.installCommand).toMatch(/npm install @heroicons\/react/);
    expect(result.notes.length).toBeGreaterThanOrEqual(1);
    expect(result.notes[0]).toMatch(/Install missing dependencies/);
  });

  it('reports nothing when all packages are installed', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          react: '^19.0.0',
          '@astryxdesign/core': '^0.6.0',
          '@heroicons/react': '^2.2.0',
        },
      }),
    );
    const source = `
      import {Button} from '@astryxdesign/core';
      import {ArrowIcon} from '@heroicons/react/24/outline';
    `;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.missingPackages).toEqual([]);
    expect(result.installCommand).toBeNull();
    expect(result.notes).toEqual([]);
  });

  it('warns about StyleX compiler when template uses it and project lacks one', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({dependencies: {'@stylexjs/stylex': '^0.10.0'}}),
    );
    const source = `import * as stylex from '@stylexjs/stylex';`;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining('StyleX'),
        expect.stringContaining('styling-overview'),
      ]),
    );
  });

  it('does NOT warn about StyleX when the project has a compiler', () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        devDependencies: {
          '@stylexjs/stylex': '^0.10.0',
          '@stylexjs/rollup-plugin': '^0.10.0',
        },
      }),
    );
    const source = `import * as stylex from '@stylexjs/stylex';`;
    const result = analyzeTemplateNeeds(source, dir);
    const stylexNotes = result.notes.filter(n => n.includes('StyleX'));
    expect(stylexNotes).toEqual([]);
  });

  it('detects pnpm from lockfile', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
    const source = `import {Chart} from 'recharts';`;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.installCommand).toMatch(/^pnpm add /);
  });

  it('detects yarn from lockfile', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
    const source = `import {Chart} from 'recharts';`;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.installCommand).toMatch(/^yarn add /);
  });

  describe('package manager for the install command (AST-048 FR17, FR19)', () => {
    const source = `import {Chart} from 'recharts';`;
    const write = (rel, body = '') => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
      fs.writeFileSync(path.join(dir, rel), body);
    };

    it('uses npm when no directory up to the workspace root has a field or lockfile, whatever runs the CLI', () => {
      write('package.json', '{}');
      process.env.npm_config_user_agent = 'pnpm/11.10.0 npm/? node/v22.0.0';
      expect(analyzeTemplateNeeds(source, dir).installCommand).toMatch(
        /^npm install recharts/,
      );
    });

    it('reads a lockfile that sits only at the workspace root', () => {
      write('package.json', JSON.stringify({workspaces: ['apps/*']}));
      write('yarn.lock');
      write('apps/web/package.json', '{}');
      const result = analyzeTemplateNeeds(source, path.join(dir, 'apps/web'));
      expect(result.installCommand).toMatch(/^yarn add recharts/);
    });

    it('ignores a lockfile above the workspace root of a standalone project', () => {
      write('yarn.lock');
      write('app/package.json', '{}');
      const result = analyzeTemplateNeeds(source, path.join(dir, 'app'));
      expect(result.installCommand).toMatch(/^npm install recharts/);
    });

    it('follows a declared packageManager over another lockfile', () => {
      write('package.json', JSON.stringify({packageManager: 'pnpm@11.10.0'}));
      write('pnpm-lock.yaml');
      write('yarn.lock');
      expect(analyzeTemplateNeeds(source, dir).installCommand).toMatch(
        /^pnpm add recharts/,
      );
    });

    it('lets a file only one package manager reads decide between tied lockfiles', () => {
      write('package.json', '{}');
      write('pnpm-lock.yaml');
      write('yarn.lock');
      write('pnpm-workspace.yaml', "packages: ['.']\n");
      expect(analyzeTemplateNeeds(source, dir).installCommand).toMatch(
        /^pnpm add recharts/,
      );
    });

    it.each([
      ['no other file', []],
      [
        'config files for two package managers',
        ['pnpm-workspace.yaml', '.yarnrc.yml'],
      ],
    ])(
      'omits the command and names the directory and lockfiles when lockfiles tie with %s',
      (_label, extras) => {
        write('package.json', '{}');
        write('pnpm-lock.yaml');
        write('yarn.lock');
        for (const file of extras) write(file);
        const result = analyzeTemplateNeeds(source, dir);
        expect(result.missingPackages).toEqual(['recharts']);
        expect(result.installCommand).toBeNull();
        const note = result.notes[0];
        expect(note).toContain('recharts');
        expect(note).toContain('No install command: . has');
        expect(note).toMatch(
          /yarn\.lock and pnpm-lock\.yaml|pnpm-lock\.yaml and yarn\.lock/,
        );
        expect(note).not.toMatch(/npm install|pnpm add|yarn add/);
      },
    );

    it('names the deciding directory relative to the target, not the process', () => {
      write('package.json', JSON.stringify({workspaces: ['apps/*']}));
      write('package-lock.json');
      write('yarn.lock');
      write('apps/web/package.json', '{}');
      const result = analyzeTemplateNeeds(source, path.join(dir, 'apps/web'));
      expect(result.installCommand).toBeNull();
      expect(result.notes[0]).toContain(
        `No install command: ${path.join('..', '..')} has`,
      );
    });

    it('stays ambiguous with only a package.json workspaces field beside tied lockfiles', () => {
      write('package.json', JSON.stringify({workspaces: ['apps/*']}));
      write('package-lock.json');
      write('yarn.lock');
      expect(analyzeTemplateNeeds(source, dir).installCommand).toBeNull();
    });
  });

  it('excludes @stylexjs/stylex from missing packages (it is a Core peer)', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    const source = `import * as stylex from '@stylexjs/stylex';`;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.missingPackages).not.toContain('@stylexjs/stylex');
  });

  it('handles a template with no external imports', () => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    const source = `
      import {useState} from 'react';
      import {Button} from '@astryxdesign/core';
    `;
    const result = analyzeTemplateNeeds(source, dir);
    expect(result.notes).toEqual([]);
    expect(result.missingPackages).toEqual([]);
  });
});

describe('installCommandFor names a package Astryx releases with Core at the project Core release', () => {
  const theme = '@astryxdesign/theme-neutral';
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmpl-needs-core-'));
  });
  afterEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
  });
  /** @param {Record<string, string>} dependencies @param {string} [lockfile] */
  const app = (dependencies, lockfile = 'package-lock.json') => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'app', dependencies}),
    );
    fs.writeFileSync(path.join(dir, lockfile), '{}');
    return dir;
  };

  it('adds it at the Core release a project pins, saved exactly, with its package manager', () => {
    expect(
      installCommandFor([theme], app({'@astryxdesign/core': '0.7.10'}))
        .installCommand,
    ).toBe(`npm install -E ${theme}@0.7.10`);
    fs.rmSync(path.join(dir, 'package-lock.json'));
    fs.writeFileSync(
      path.join(dir, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    );
    expect(installCommandFor([theme], dir).installCommand).toBe(
      `pnpm add -E ${theme}@0.7.10`,
    );
  });

  it('adds it at the Core range a project declares, quoted for the shell', () => {
    expect(
      installCommandFor([theme], app({'@astryxdesign/core': '^0.7.10'}))
        .installCommand,
    ).toBe(`npm install "${theme}@^0.7.10"`);
  });

  it('adds it at the release of the CLI that answers when the project has no Core', () => {
    expect(installCommandFor([theme], app({})).installCommand).toBe(
      `npm install ${theme}@${CLI_VERSION}`,
    );
  });

  it('takes the release of the CLI that answers when the declared Core is not a plain version range', () => {
    expect(
      installCommandFor([theme], app({'@astryxdesign/core': 'workspace:*'}))
        .installCommand,
    ).toBe(`npm install ${theme}@${CLI_VERSION}`);
    const crafted = installCommandFor(
      [theme],
      app({'@astryxdesign/core': '^0.7.0"; echo INJECTED; "'}),
    ).installCommand;
    expect(crafted).toBe(`npm install ${theme}@${CLI_VERSION}`);
    expect(crafted).not.toContain('INJECTED');
  });

  it("quotes a declared Core range in an integration's install guidance", () => {
    const ranged = app({'@astryxdesign/core': '>=0.7.0 <0.8.0'});
    recordDeclaredSettings(ranged, [
      {name: '@acme/a', installGuidance: 'acme add {packages}'},
    ]);
    try {
      expect(installCommandFor([theme], ranged).installGuidance).toBe(
        `acme add "${theme}@>=0.7.0 <0.8.0"`,
      );
    } finally {
      recordDeclaredSettings(ranged, []);
    }
  });

  it('leaves any other package to the package manager, and saves nothing exactly beside it', () => {
    const pinned = app({'@astryxdesign/core': '0.7.10'});
    expect(installCommandFor(['left-pad'], pinned).installCommand).toBe(
      'npm install left-pad',
    );
    expect(installCommandFor([theme, 'left-pad'], pinned).installCommand).toBe(
      `npm install ${theme}@0.7.10 left-pad`,
    );
  });

  it('names the release in the line it prints when the lockfiles disagree', () => {
    const pinned = app({'@astryxdesign/core': '0.7.10'}, 'yarn.lock');
    fs.writeFileSync(
      path.join(pinned, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    );
    expect(installStepFor([theme], pinned).line).toBe(
      `npm install -E ${theme}@0.7.10`,
    );
  });
});

describe('parsedSpecifiers', () => {
  it('reads a template literal with nothing put in it as the string it holds', () => {
    expect(
      parsedSpecifiers(
        'await import(`../shared.ts`);\nrequire(`./a.css`);\nawait import(`./${x}.ts`);',
      ),
    ).toEqual(['../shared.ts', './a.css']);
  });
});

describe('analyzeTemplateNeeds in a hosted run', () => {
  const dirs = [];
  const temp = prefix => {
    const made = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(made);
    return made;
  };
  afterEach(() => {
    _resetHostedRun();
    for (const made of dirs.splice(0)) {
      fs.rmSync(made, {recursive: true, force: true});
    }
  });
  const source = `
    import {Button} from '@astryxdesign/core';
    import {ArrowIcon} from '@heroicons/react/24/outline';
    import {LineChart} from 'recharts';
  `;

  it("counts a package the host's set declares as installed outside a project", () => {
    const set = temp('tmpl-needs-set-');
    fs.writeFileSync(
      path.join(set, 'package.json'),
      JSON.stringify({dependencies: {'@heroicons/react': '2.2.0'}}),
    );
    const outside = temp('tmpl-needs-outside-');

    // A folder no package.json holds gets no install step, which would make
    // it a project.
    expect(analyzeTemplateNeeds(source, outside)).toMatchObject({
      missingPackages: ['@heroicons/react', 'recharts'],
      installCommand: null,
      notes: [
        'Missing dependencies: @heroicons/react, recharts. Install them in the project that uses this page.',
      ],
    });
    activateHostedRun({startingRoot: set});
    const result = analyzeTemplateNeeds(source, outside);
    expect(result).toMatchObject({
      missingPackages: ['recharts'],
      installCommand: null,
      notes: [
        'Missing dependencies: recharts. Install them in the project that uses this page.',
      ],
    });
  });

  it('counts an integration the host approves and its set holds as installed outside a project, as render serves it', () => {
    const set = temp('tmpl-needs-set-');
    fs.writeFileSync(path.join(set, 'package.json'), JSON.stringify({}));
    const kit = path.join(set, 'node_modules', '@acme', 'astryx-kit');
    fs.mkdirSync(kit, {recursive: true});
    fs.writeFileSync(
      path.join(kit, 'package.json'),
      JSON.stringify({name: '@acme/astryx-kit', version: '1.0.0'}),
    );
    const outside = temp('tmpl-needs-outside-');
    const page = `
      import {Button} from '@astryxdesign/core';
      import {Banner} from '@acme/astryx-kit';
    `;

    expect(analyzeTemplateNeeds(page, outside).missingPackages).toEqual([
      '@acme/astryx-kit',
    ]);
    activateHostedRun({startingRoot: set, integrations: ['@acme/astryx-kit']});
    expect(analyzeTemplateNeeds(page, outside)).toMatchObject({
      missingPackages: [],
      installCommand: null,
      notes: [],
    });
  });

  it('still names an integration the host approves that its set does not hold, which render cannot serve', () => {
    const set = temp('tmpl-needs-set-');
    fs.writeFileSync(path.join(set, 'package.json'), JSON.stringify({}));
    const outside = temp('tmpl-needs-outside-');
    activateHostedRun({startingRoot: set, integrations: ['@acme/astryx-kit']});
    expect(
      analyzeTemplateNeeds("import {Banner} from '@acme/astryx-kit';", outside)
        .missingPackages,
    ).toEqual(['@acme/astryx-kit']);
  });

  it('still names it inside a project, which installs its own packages', () => {
    const set = temp('tmpl-needs-set-');
    fs.writeFileSync(
      path.join(set, 'package.json'),
      JSON.stringify({dependencies: {'@heroicons/react': '2.2.0'}}),
    );
    const app = temp('tmpl-needs-app-');
    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({dependencies: {'@astryxdesign/core': '0.7.16'}}),
    );
    activateHostedRun({startingRoot: set, projectRoot: app});

    expect(analyzeTemplateNeeds(source, app).missingPackages).toEqual([
      '@heroicons/react',
      'recharts',
    ]);
  });
});
