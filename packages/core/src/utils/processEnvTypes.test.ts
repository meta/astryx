// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy is built by a product that may not install Node's types.
 * Bundlers replace `process.env.NODE_ENV` at build time, so a module of Core
 * or of a package swizzle copies from must still type-check without them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.resolve(SRC, '../..');
/** The packages swizzle copies components from. */
const SWIZZLE_SOURCES = ['core', 'lab', 'charts', 'richtext', 'vega']
  .map(name => path.join(PACKAGES, name, 'src'))
  .filter(dir => fs.existsSync(dir));

/** Their source modules, without tests, stories and declaration files. */
function sourceModules(): string[] {
  return SWIZZLE_SOURCES.flatMap(dir =>
    fs
      .readdirSync(dir, {recursive: true, withFileTypes: true})
      .filter(
        entry =>
          entry.isFile() &&
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name) &&
          !entry.parentPath.includes('__tests__'),
      )
      .map(entry => path.join(entry.parentPath, entry.name)),
  );
}

/** A module's code without its comments. */
function codeOf(file: string): string {
  return fs
    .readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('process.env without Node types', () => {
  it('every module that reads process.env type-checks without them', () => {
    const readers = sourceModules().filter(file =>
      /\bprocess\.env\b/.test(codeOf(file)),
    );
    expect(readers.length).toBeGreaterThan(0);
    const program = ts.createProgram(readers, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      types: [],
      noResolve: true,
      noEmit: true,
      skipLibCheck: true,
    });
    // 2580 and 2591: "Cannot find name 'process'", with or without the hint
    // to install Node's types.
    const missing = readers.flatMap(file =>
      program
        .getSemanticDiagnostics(program.getSourceFile(file))
        .filter(d => d.code === 2580 || d.code === 2591)
        .map(d => `${path.relative(PACKAGES, file)}: TS${d.code}`),
    );
    expect(missing).toEqual([]);
  });
});
