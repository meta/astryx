// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {swizzle} from './swizzle.mjs';

// api/swizzle/ -> up 3 = packages/cli, up 4 = repo root (has packages/core).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The module specifiers a file imports or re-exports, read from its import and
 * export declarations as TypeScript parses them, at the top level and inside
 * `declare module` blocks, so comments never count: a header comment can quote
 * an import (`export * from './utils'`) that the file does not make.
 */
function importSpecifiers(content, fileName = 'file.tsx') {
  const source = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = [];
  const read = statements => {
    for (const statement of statements) {
      if (
        (ts.isImportDeclaration(statement) ||
          ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier != null &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        specifiers.push(statement.moduleSpecifier.text);
      } else if (ts.isModuleDeclaration(statement)) {
        // `declare module 'a.b' {…}` can nest as `module a { module b {…} }`.
        let body = statement.body;
        while (body != null && ts.isModuleDeclaration(body)) body = body.body;
        if (body != null && ts.isModuleBlock(body)) read(body.statements);
      }
    }
  };
  read(source.statements);
  return specifiers;
}

describe('importSpecifiers', () => {
  it('reads imports and re-exports, and not import text in comments', () => {
    const content = [
      '/**',
      " * Not listed in `export * from './utils'`, so naming it there would",
      ' * publish it as API.',
      ' */',
      "// import {x} from './commented';",
      "import {a} from './a';",
      "import type {B} from '../b';",
      "export * from './c';",
      "export {d} from '@astryxdesign/core/d';",
      "export * as ns from './e';",
      "export type * as types from './f';",
      "declare module '*.doc.mjs' {",
      "  import type {Doc} from '@astryxdesign/cli/authoring';",
      '}',
    ].join('\n');
    expect(importSpecifiers(content)).toEqual([
      './a',
      '../b',
      './c',
      '@astryxdesign/core/d',
      './e',
      './f',
      '@astryxdesign/cli/authoring',
    ]);
  });
});

describe('swizzle() API', () => {
  it('no component → swizzle.list of core components', async () => {
    const r = await swizzle(undefined, {cwd: REPO});
    expect(r.type).toBe('swizzle.list');
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data).toContain('Button');
  });

  it('--list → swizzle.list even with a component arg', async () => {
    const r = await swizzle('Button', {cwd: REPO, list: true});
    expect(r.type).toBe('swizzle.list');
  });

  it('unknown component → AstryxError ERR_UNKNOWN_COMPONENT with suggestions', async () => {
    await expect(swizzle('NotARealComponent99', {cwd: REPO})).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_COMPONENT',
    });
  });
});

describe('swizzle imports resolve for components with .stylex imports', () => {
  const OUT = 'tmp-swizzle-resolve-test';
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it('Button: every import in the copy resolves, in the core exports map or to a copied file', async () => {
    const corePkg = JSON.parse(
      fs.readFileSync(
        path.join(REPO, 'packages/core/package.json'),
        'utf-8',
      ),
    );
    const exportKeys = new Set(Object.keys(corePkg.exports));

    const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
    const outputDir = path.join(REPO, r.data.outputDir);
    const copied = r.data.files
      .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.includes('.test.'))
      .map(f => path.join(outputDir, f));

    for (const file of copied) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const specifier of importSpecifiers(content, file)) {
        if (specifier.startsWith('@astryxdesign/core/')) {
          const subpath = './' + specifier.replace('@astryxdesign/core/', '');
          expect(
            exportKeys.has(subpath),
            `${specifier} (subpath ${subpath}) must resolve in core exports`,
          ).toBe(true);
        } else if (specifier.startsWith('.')) {
          // A relative import names a file the copy wrote: one of the
          // component's own, or an owner module carried beside it (FR4).
          const target = path.resolve(path.dirname(file), specifier);
          expect(
            ['', '.ts', '.tsx', '.mjs', '.js'].some(ext => fs.existsSync(target + ext)),
            `${specifier} in ${path.relative(outputDir, file)} must name a copied file`,
          ).toBe(true);
        }
      }
    }
  }, 30_000);
});
