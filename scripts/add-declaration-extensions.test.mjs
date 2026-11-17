// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies the declaration specifier rewrite.
 * @input A temporary package whose dist holds emitted .d.ts files.
 * @output Confirms relative specifiers become fully specified declaration
 *   paths that strict NodeNext consumers resolve (#7702).
 * @position Regression coverage for the build step that runs after the tsc
 *   declaration emit.
 */

import {execFileSync} from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {rewriteSource} from './add-declaration-extensions.mjs';
import {findOffenders} from './check-fully-specified.mjs';

const SCRIPT = fileURLToPath(
  new URL('./add-declaration-extensions.mjs', import.meta.url),
);

/** Write `files` (relative path → contents) under `root`. */
function writeTree(root, files) {
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    writeFileSync(path.join(root, file), contents);
  }
}

describe('rewriteSource', () => {
  let dist;

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), 'astryx-dts-extensions-'));
    writeTree(dist, {
      'index.d.ts': '',
      'Button/index.d.ts': '',
      'Selector/index.d.ts': '',
      'Selector/Selector.d.ts': '',
      'Selector/hooks.d.ts': '',
      'Selector/hooks/index.d.ts': '',
      'theme/tokens.stylex.d.ts': '',
      'theme/theme.css.d.ts': '',
    });
  });

  afterAll(() => {
    rmSync(dist, {force: true, recursive: true});
  });

  const rewrite = source => rewriteSource(source, path.join(dist, 'Selector'));

  it('adds .js to a specifier that names a declaration file', () => {
    expect(rewrite(`export { Selector } from './Selector';`)).toBe(
      `export { Selector } from './Selector.js';`,
    );
  });

  it('adds /index.js to a specifier that names a directory', () => {
    expect(rewrite(`import { type ButtonVariant } from '../Button';`)).toBe(
      `import { type ButtonVariant } from '../Button/index.js';`,
    );
  });

  it('prefers the file when a file and a directory share a name', () => {
    expect(rewrite(`export * from './hooks';`)).toBe(
      `export * from './hooks.js';`,
    );
  });

  it("rewrites re-exports from '.' and '..'", () => {
    const nested = path.join(dist, 'Selector', 'hooks');
    expect(rewriteSource(`export * from '.';`, nested)).toBe(
      `export * from './index.js';`,
    );
    expect(rewrite(`export * from "..";`)).toBe(`export * from "../index.js";`);
  });

  it('rewrites inline import() types', () => {
    expect(
      rewrite(`export declare const p: import("./hooks/index").Hook<never>;`),
    ).toBe(`export declare const p: import("./hooks/index.js").Hook<never>;`);
  });

  it('keeps the .stylex part of a file name', () => {
    expect(rewrite(`import { vars } from '../theme/tokens.stylex';`)).toBe(
      `import { vars } from '../theme/tokens.stylex.js';`,
    );
  });

  it('leaves specifiers that are already fully specified or bare', () => {
    const source = [
      `import '../theme/theme.css';`,
      `export * from './Selector.js';`,
      `import type { ReactNode } from 'react';`,
    ].join('\n');
    expect(rewrite(source)).toBe(source);
  });

  it('does not resolve a specifier to a .css.d.ts declaration', () => {
    expect(rewrite(`import '../theme/theme';`)).toBe(
      `import '../theme/theme';`,
    );
  });

  it('leaves unresolvable specifiers for the fully-specified check', () => {
    expect(rewrite(`export * from './missing';`)).toBe(
      `export * from './missing';`,
    );
  });

  it('skips comment lines and handles multi-line exports and CRLF', () => {
    const source = [
      `/**`,
      ` * import { Selector } from './Selector';`,
      ` */`,
      `export type {`,
      `  SelectorProps,`,
      `} from './Selector';\r`,
    ].join('\n');
    expect(rewrite(source).split('\n')).toEqual([
      `/**`,
      ` * import { Selector } from './Selector';`,
      ` */`,
      `export type {`,
      `  SelectorProps,`,
      `} from './Selector.js';\r`,
    ]);
  });
});

it('rewrites a package dist so the fully-specified check passes', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'astryx-dts-extensions-run-'));

  try {
    writeTree(cwd, {
      'dist/index.d.ts': `export * from './Selector';\n`,
      'dist/Selector/index.d.ts':
        `export { Selector } from './Selector';\n` +
        `export type { Option } from '../types';\n`,
      'dist/Selector/Selector.d.ts': `export declare const Selector: () => null;\n`,
      'dist/types.d.ts': `export type Option = string;\n`,
      'dist/Selector/index.js': `export { Selector } from './Selector.js';\n`,
    });
    expect(findOffenders(path.join(cwd, 'dist')).offenders).toHaveLength(2);

    execFileSync(process.execPath, [SCRIPT], {cwd});

    expect(readFileSync(path.join(cwd, 'dist', 'index.d.ts'), 'utf-8')).toBe(
      `export * from './Selector/index.js';\n`,
    );
    expect(
      readFileSync(path.join(cwd, 'dist', 'Selector', 'index.d.ts'), 'utf-8'),
    ).toBe(
      `export { Selector } from './Selector.js';\n` +
        `export type { Option } from '../types.js';\n`,
    );
    expect(findOffenders(path.join(cwd, 'dist')).offenders).toEqual([]);
  } finally {
    rmSync(cwd, {force: true, recursive: true});
  }
});
