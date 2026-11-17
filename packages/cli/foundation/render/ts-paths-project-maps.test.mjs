// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `projectMapsImport`: whether a project's tsconfig maps a bare
 * specifier to its own code, by TypeScript's rules.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {projectMapsImport} from './ts-paths.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ts-paths-maps-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Record<string, string>} files */
function write(files) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), {recursive: true});
    fs.writeFileSync(path.join(tmp, rel), text);
  }
}

describe('projectMapsImport', () => {
  it('a paths key maps a specifier, through extends and with a wildcard inside the key', () => {
    write({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          paths: {'@/*': ['./src/*'], 'icons/*/svg': ['./art/*']},
        },
      }),
      // JSON with comments, as TypeScript reads it.
      'tsconfig.json':
        '{\n  // shared settings\n  "extends": "./tsconfig.base.json",\n}\n',
    });
    const from = path.join(tmp, 'src', 'page.tsx');
    expect(projectMapsImport('@/components/BrandIcon', from)).toBe(true);
    expect(projectMapsImport('icons/trash/svg', from)).toBe(true);
    expect(projectMapsImport('@acme/icons', from)).toBe(false);
  });

  it('baseUrl maps a specifier only when it holds the file', () => {
    write({
      'tsconfig.json': JSON.stringify({compilerOptions: {baseUrl: 'src'}}),
      'src/icons/logo.tsx': 'export const LogoIcon = () => null;\n',
    });
    const from = path.join(tmp, 'src', 'page.tsx');
    expect(projectMapsImport('icons/logo', from)).toBe(true);
    expect(projectMapsImport('icons/missing', from)).toBe(false);
    expect(projectMapsImport('./icons/logo', from)).toBe(false);
  });

  it('maps nothing without a config or an importer', () => {
    expect(projectMapsImport('@/x', path.join(tmp, 'page.tsx'))).toBe(false);
    expect(projectMapsImport('@/x', null)).toBe(false);
  });
});
