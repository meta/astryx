// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createFileProtectionResolver,
  ProtectionSourceError,
} from './file-protection.mjs';

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-protection-'));
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

function write(relative, contents = '') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, contents);
  return file;
}

function declarations(relative) {
  return createFileProtectionResolver(root)
    .classify(path.join(root, relative))
    .map(item => item.declaration);
}

describe('working-tree .gitattributes', () => {
  it('honors nested later rules and explicit false or unset values', () => {
    write(
      '.gitattributes',
      [
        '*.css linguist-generated=true',
        'vendor/** linguist-vendored',
        'authored.css -linguist-generated',
        'unset.css !linguist-generated',
        '',
      ].join('\n'),
    );
    write('generated.css', 'body {}');
    write('authored.css', 'body {}');
    write('unset.css', 'body {}');
    write('nested/keep.css', 'body {}');
    write('nested/.gitattributes', 'keep.css linguist-generated=false\n');
    write('vendor/pkg/index.js', 'export {};');

    expect(declarations('generated.css')).toContain(
      'linguist-generated in .gitattributes:1',
    );
    expect(declarations('authored.css')).toEqual([]);
    expect(declarations('unset.css')).toEqual([]);
    expect(declarations('nested/keep.css')).toEqual([]);
    expect(declarations('vendor/pkg/index.js')).toContain(
      'linguist-vendored in .gitattributes:2',
    );
  });

  it('expands top-level attribute macros, including forward definitions', () => {
    write(
      '.gitattributes',
      'via-macro/** outer\n[attr]outer generated\n[attr]generated linguist-generated\n',
    );
    write('via-macro/output.js', 'export {};');
    expect(declarations('via-macro/output.js')).toContain(
      'linguist-generated in .gitattributes:1',
    );
  });

  it('preserves escaped wildcards as literal path characters', () => {
    write('.gitattributes', 'literal\\*.js linguist-generated\n');
    write('literal*.js', 'export {};');
    write('literalX.js', 'export {};');
    expect(declarations('literal*.js')).toHaveLength(1);
    expect(declarations('literalX.js')).toEqual([]);
  });

  it('supports quoted attribute patterns with spaces', () => {
    write('.gitattributes', '"generated output/*.js" linguist-generated\n');
    write('generated output/theme.js', 'export {};');
    expect(declarations('generated output/theme.js')).toHaveLength(1);
  });

  it('matches basename patterns below the declaring directory', () => {
    write('.gitattributes', '*.gen.ts linguist-generated\n');
    write('src/deep/theme.gen.ts', 'export {};');
    expect(declarations('src/deep/theme.gen.ts')).toHaveLength(1);
  });
});

describe('working-tree ignore rules', () => {
  it('honors gitignore negation and nested precedence', () => {
    write('.gitignore', ['src/**/*.js', '!src/keep.js', ''].join('\n'));
    write('src/drop.js', 'drop');
    write('src/keep.js', 'keep');
    write('src/deep/drop.js', 'drop');
    write('src/.gitignore', '!deep/keep.js\n');
    write('src/deep/keep.js', 'keep');

    expect(declarations('src/drop.js')[0]).toBe('excluded by .gitignore');
    expect(declarations('src/deep/drop.js')[0]).toBe('excluded by .gitignore');
    expect(declarations('src/keep.js')).toEqual([]);
    expect(declarations('src/deep/keep.js')).toEqual([]);
  });

  it('uses case-sensitive Git matching on case-sensitive platforms', () => {
    write('.gitignore', 'FOO\n');
    write('FOO', 'x');
    write('foo', 'x');

    expect(declarations('FOO')[0]).toBe('excluded by .gitignore');
    expect(declarations('foo')).toEqual([]);
  });

  it('does not let a nested ignore file re-include beneath an excluded parent', () => {
    write('.gitignore', 'ignored/\n');
    write('ignored/.gitignore', '!keep.js\n');
    write('ignored/keep.js', 'keep');

    expect(declarations('ignored/keep.js')[0]).toBe('excluded by .gitignore');
  });

  it('ignores nested .hgignore files unless the root file includes them', () => {
    write('sub/.hgignore', 'syntax: glob\n*.tmp\n');
    write('sub/file.tmp', 'x');
    expect(declarations('sub/file.tmp')).toEqual([]);
  });

  it('reads Mercurial glob and regexp syntax without a repository process', () => {
    write(
      '.hgignore',
      ['syntax: glob', '**/*.generated.css', 're:^legacy/.+\\.js$', ''].join(
        '\n',
      ),
    );
    write('src/theme.generated.css', 'x');
    write('legacy/file.js', 'x');
    write('src/file.js', 'x');

    expect(declarations('src/theme.generated.css')[0]).toMatch(/\.hgignore:2/);
    expect(declarations('legacy/file.js')[0]).toMatch(/\.hgignore:3/);
    expect(declarations('src/file.js')).toEqual([]);
  });
});

describe('leading generated comments', () => {
  it.each([
    ['// @generated\nexport const x = 1;\n', '@generated'],
    [
      '/* @partially-generated */\nexport const x = 1;\n',
      '@partially-generated',
    ],
    [
      '// Code generated by Acme. DO NOT EDIT.\nconst x = 1;\n',
      'Code generated',
    ],
    ['#!/usr/bin/env node\n// @generated\nconsole.log(1);\n', '@generated'],
  ])('protects a recognized leading marker', (source, expected) => {
    write('file.js', source);
    expect(declarations('file.js')[0]).toContain(expected);
  });

  it('recognizes hash comments after a shebang in an extensionless file', () => {
    write('script', '#!/bin/sh\n# @generated\necho hi\n');
    expect(declarations('script')[0]).toContain('@generated');
  });

  it('does not treat a marker after authored code as protection', () => {
    write('file.js', 'export const authored = true;\n// @generated\n');
    expect(declarations('file.js')).toEqual([]);
  });

  it('does not accept longer generated-like annotations', () => {
    write('file.js', '// @generated-code\nexport const authored = true;\n');
    expect(declarations('file.js')).toEqual([]);
  });

  it('does not mistake a leading CSS id selector for a comment', () => {
    write('file.css', '#root { color: red; }\n/* @generated */\n');
    expect(declarations('file.css')).toEqual([]);
  });

  it('extracts an exact regeneration command from a generated header', () => {
    const file = write(
      'theme.css',
      '/*\n * @generated\n * Command: pnpm astryx theme build src/theme.ts\n */\n',
    );
    const protection = createFileProtectionResolver(root).classify(file)[0];
    expect(protection.command).toBe('pnpm astryx theme build src/theme.ts');
  });
});

describe('hard boundaries and fail-closed parsing', () => {
  it('protects dependency metadata, VCS metadata leaves, symlinks, and paths outside root', () => {
    const dependency = write('node_modules/pkg/index.js', 'x');
    const yarnDependency = write('.yarn/unplugged/pkg/index.js', 'x');
    const yarnVirtual = write('.yarn/__virtual__/pkg/index.js', 'x');
    const yarnInstallState = write('.yarn/install-state.gz', 'x');
    const yarnPatch = write('.yarn/patches/pkg.patch', 'x');
    const pnp = write('.pnp.cjs', 'x');
    const pnpData = write('.pnp.data.json', '{}');
    const metadata = write('.git', 'gitdir: elsewhere\n');
    const target = write('target.js', 'x');
    const link = path.join(root, 'link.js');
    fs.symlinkSync(target, link);
    const resolver = createFileProtectionResolver(root);

    expect(resolver.classify(dependency)[0].reason).toBe('dependency');
    expect(resolver.classify(yarnDependency)[0].reason).toBe('dependency');
    expect(resolver.classify(yarnVirtual)[0].reason).toBe('dependency');
    expect(resolver.classify(yarnInstallState)[0].reason).toBe('dependency');
    expect(resolver.classify(yarnPatch)).toEqual([]);
    expect(resolver.classify(pnp)[0].reason).toBe('dependency');
    expect(resolver.classify(pnpData)[0].reason).toBe('dependency');
    expect(resolver.classify(metadata)[0].reason).toBe('vcs');
    expect(resolver.classify(link)[0].reason).toBe('symlink');
    expect(
      resolver.classify(path.join(root, '..', 'outside.js'))[0].reason,
    ).toBe('outside-root');
  });

  it('rejects an .hgignore include reached through a symlink', () => {
    const outside = path.join(
      os.tmpdir(),
      `astryx-ignore-${process.pid}-${Date.now()}`,
    );
    fs.writeFileSync(outside, 'syntax: glob\n*.generated\n');
    try {
      fs.symlinkSync(outside, path.join(root, 'rules'));
      write('.hgignore', 'include:rules\n');
      expect(() => createFileProtectionResolver(root)).toThrow(/symbolic link/);
    } finally {
      fs.rmSync(outside, {force: true});
    }
  });

  it('fails before use when a protection source cannot be parsed', () => {
    write('.hgignore', 'syntax: regexp\n[unterminated\n');
    expect(() => createFileProtectionResolver(root)).toThrow(
      ProtectionSourceError,
    );
    expect(() => createFileProtectionResolver(root)).toThrow(/\.hgignore/);
  });
});
