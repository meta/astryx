// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whether the app's own source imports a module: by a relative
 * specifier, or by a tsconfig path alias.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {projectImportsModule, specifierTargets} from './project-sources.mjs';

/** @type {string} */
let root;
/** @type {string} */
let moduleFile;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-project-sources-'));
  fs.mkdirSync(path.join(root, 'src', 'app'), {recursive: true});
  moduleFile = path.join(root, 'src', 'astryx-themes.ts');
  fs.writeFileSync(moduleFile, 'export const themes = {};\n');
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/** @param {string} source */
function writeProvider(source) {
  const file = path.join(root, 'src', 'app', 'providers.tsx');
  fs.writeFileSync(file, source);
  return file;
}

describe('specifierTargets', () => {
  it('names the module by a relative specifier, with or without its extension', () => {
    const from = writeProvider('');
    expect(specifierTargets('../astryx-themes', from, moduleFile)).toBe(true);
    expect(specifierTargets('../astryx-themes.ts', from, moduleFile)).toBe(
      true,
    );
    expect(specifierTargets('./astryx-themes', from, moduleFile)).toBe(false);
  });

  it("names the module through the tsconfig's paths, and not by a bare name the paths do not map", () => {
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      // A comment and a trailing comma, as tsconfig files often carry.
      '{\n  // aliases\n  "compilerOptions": {"paths": {"@/*": ["./src/*"]},},\n}\n',
    );
    const from = writeProvider('');
    expect(specifierTargets('@/astryx-themes', from, moduleFile)).toBe(true);
    expect(specifierTargets('~/astryx-themes', from, moduleFile)).toBe(false);
    expect(specifierTargets('astryx-themes', from, moduleFile)).toBe(false);
  });
});

describe('projectImportsModule', () => {
  it('finds an import of the module through a path alias', () => {
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({compilerOptions: {paths: {'@/*': ['./src/*']}}}),
    );
    writeProvider(
      "import {themes} from '@/astryx-themes';\nexport const t = themes;\n",
    );
    expect(projectImportsModule(root, moduleFile).found).toBe(true);
  });

  it('finds no import when the alias is not one the tsconfig maps', () => {
    writeProvider(
      "import {themes} from '@/astryx-themes';\nexport const t = themes;\n",
    );
    expect(projectImportsModule(root, moduleFile).found).toBe(false);
  });
});
