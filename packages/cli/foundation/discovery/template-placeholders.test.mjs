// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The template icon placeholder table and package (AST-084 FR21):
 * every meaning is an icon definition, every icon exists in the library that
 * draws its look, and packages/template-icons matches the table.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  DEFAULT_PLACEHOLDER_LOOK,
  PLACEHOLDER_MODULE,
  placeholderLook,
  placeholderMeaning,
  placeholderModule,
  placeholderSource,
  placeholderTable,
} from './template-placeholders.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';
import {templateIconFiles} from '../../scripts/generate-template-icons.mjs';

const CLI_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const require = createRequire(path.join(CLI_DIR, 'package.json'));
const table = placeholderTable();

describe('template icon placeholders', () => {
  it('names only icon definitions', () => {
    const definitions = astryxDefinitionsByName();
    const unknown = Object.keys(table.meanings).filter(
      meaning => !definitions.has(meaning),
    );
    expect(unknown).toEqual([]);
  });

  it('draws every meaning with an icon its library exports, in every look', () => {
    const missing = [];
    for (const [look, library] of Object.entries(table.looks)) {
      const exported = require(library);
      for (const [meaning, entry] of Object.entries(table.meanings)) {
        const icon = look === 'lucide' ? entry.lucide : entry.heroicons;
        if (icon && !(icon in exported))
          missing.push(`${look} ${meaning}: ${icon}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps packages/template-icons the same as the table', () => {
    const stale = [];
    for (const [rel, text] of templateIconFiles(table)) {
      const file = path.join(CLI_DIR, '../template-icons', rel);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== text) {
        stale.push(rel);
      }
    }
    expect(stale).toEqual([]);
  });

  it('reads the look from the import path', () => {
    expect(placeholderLook(PLACEHOLDER_MODULE)).toBe(DEFAULT_PLACEHOLDER_LOOK);
    expect(placeholderLook(`${PLACEHOLDER_MODULE}/24/solid`)).toBe('24/solid');
    expect(placeholderLook(`${PLACEHOLDER_MODULE}/lucide`)).toBe('lucide');
    expect(placeholderLook(`${PLACEHOLDER_MODULE}/24/outline`)).toBeNull();
    expect(placeholderLook(`${PLACEHOLDER_MODULE}/32/solid`)).toBeNull();
    expect(placeholderLook('@heroicons/react/24/outline')).toBeNull();
  });

  it('reads the meaning from the export name', () => {
    expect(placeholderMeaning('DeleteIcon')).toBe('delete');
    expect(placeholderMeaning('AlignBottomIcon')).toBe('alignBottom');
    expect(placeholderMeaning('Delete')).toBeNull();
    expect(placeholderMeaning('deleteIcon')).toBeNull();
  });

  it('names the library icon for a meaning and look', () => {
    expect(placeholderSource('delete', '24/outline')).toEqual({
      module: '@heroicons/react/24/outline',
      export: 'TrashIcon',
    });
    expect(placeholderSource('delete', '20/solid')).toEqual({
      module: '@heroicons/react/20/solid',
      export: 'TrashIcon',
    });
    expect(placeholderSource('notAMeaning', '24/outline')).toBeNull();
    expect(placeholderSource('delete', 'unknown')).toBeNull();
  });
});

describe('the placeholder package from a template source', () => {
  it('resolves from a bundled template directory, as a preview imports it', () => {
    const from = createRequire(
      path.join(CLI_DIR, 'assets/templates/pages/settings-dialog/page.tsx'),
    );
    for (const look of Object.keys(table.looks)) {
      expect(() => from.resolve(placeholderModule(look))).not.toThrow();
    }
  });
});
