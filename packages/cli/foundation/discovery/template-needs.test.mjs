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
} from './template-needs.mjs';

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
