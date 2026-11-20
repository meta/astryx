// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The three page templates the theme editor's theme-building page
 * shows in full (`PAGE_TEMPLATES` in `api/theme-edit/_preview.mjs`)
 * typecheck in an app with the strictest common settings,
 * `noUncheckedIndexedAccess` included.
 */

import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pages = path.resolve(here, '../../assets/templates/pages');
const require = createRequire(import.meta.url);

describe('page templates under noUncheckedIndexedAccess', () => {
  it('dashboard, contact-form and settings typecheck', () => {
    const ts = require('typescript');
    const files = ['dashboard', 'contact-form', 'settings'].map(n =>
      path.join(pages, n, 'page.tsx'),
    );
    const program = ts.createProgram(files, {
      strict: true,
      noUncheckedIndexedAccess: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'],
      noEmit: true,
      skipLibCheck: true,
      types: [],
    });
    const errors = ts
      .getPreEmitDiagnostics(program)
      .filter(
        (/** @type {any} */ d) =>
          d.file && files.includes(path.resolve(d.file.fileName)),
      )
      .map(
        (/** @type {any} */ d) =>
          `${path.relative(pages, d.file.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
      );
    expect(errors).toEqual([]);
  }, 120_000);
});
