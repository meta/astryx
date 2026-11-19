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
  fillTemplatePlaceholders,
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

describe('fillTemplatePlaceholders', () => {
  it('leaves a source without placeholder imports unchanged', () => {
    const source = "import {TrashIcon} from '@heroicons/react/24/outline';\n";
    expect(fillTemplatePlaceholders(source)).toEqual({source, meanings: {}});
  });

  it('writes the library import for each variant and keeps each meaning by local name', () => {
    const {source, meanings} = fillTemplatePlaceholders(
      [
        '// A comment above stays.',
        "import {DeleteIcon, CloseIcon as Close} from '@astryxdesign/template-icons';",
        "import {DeleteIcon as DeleteSmall} from '@astryxdesign/template-icons/20/solid';",
        "import {CloseIcon as CloseLucide} from '@astryxdesign/template-icons/lucide';",
        '<DeleteIcon />;',
        '',
      ].join('\n'),
    );
    expect(source).toBe(
      [
        '// A comment above stays.',
        'import {',
        '  TrashIcon as DeleteIcon,',
        '  XMarkIcon as Close,',
        "} from '@heroicons/react/24/outline';",
        "import {TrashIcon as DeleteSmall} from '@heroicons/react/20/solid';",
        `import {${placeholderSource('close', 'lucide')?.export} as CloseLucide} from 'lucide-react';`,
        '<DeleteIcon />;',
        '',
      ].join('\n'),
    );
    expect(meanings).toEqual({
      DeleteIcon: 'delete',
      Close: 'close',
      DeleteSmall: 'delete',
      CloseLucide: 'close',
    });
  });

  it('keeps an import that names no meaning as written, and comments inside an import', () => {
    const {source} = fillTemplatePlaceholders(
      [
        'import {',
        '  // why this icon',
        '  DeleteIcon,',
        '  NotAMeaningIcon,',
        "} from '@astryxdesign/template-icons';",
        '',
      ].join('\n'),
    );
    expect(source).toBe(
      [
        '// why this icon',
        "import {TrashIcon as DeleteIcon} from '@heroicons/react/24/outline';",
        "import {NotAMeaningIcon} from '@astryxdesign/template-icons';",
        '',
      ].join('\n'),
    );
  });

  it('wraps a long import one name per line', () => {
    const {source} = fillTemplatePlaceholders(
      "import {DeleteIcon, CloseIcon, SearchIcon, SettingsIcon, HomeIcon} from '@astryxdesign/template-icons';\n",
    );
    expect(source.split('\n')[0]).toBe('import {');
    expect(source).toContain("} from '@heroicons/react/24/outline';");
  });
});

describe('placeholder imports in derived component names', () => {
  it('read as the library icon that draws them, as the copy renders it', async () => {
    const {parsedComponents} = await import('./template-adapter.mjs');
    const before = parsedComponents(
      "import {Search, Trash2} from 'lucide-react';\nexport default () => <><Search /><Trash2 /></>;\n",
    );
    const after = parsedComponents(
      "import {SearchIcon} from '@astryxdesign/template-icons/lucide';\nimport {XMarkIcon} from '@heroicons/react/24/outline';\nexport default () => <><SearchIcon /><XMarkIcon /></>;\n",
    );
    expect(after).toEqual(
      parsedComponents(
        "import {Search} from 'lucide-react';\nimport {XMarkIcon} from '@heroicons/react/24/outline';\nexport default () => <><Search /><XMarkIcon /></>;\n",
      ),
    );
    expect(before).toContain('Search');
  });
});

describe('placeholders in template search', () => {
  const raw =
    "import {DeleteIcon} from '@astryxdesign/template-icons';\nexport default () => <DeleteIcon />;\n";

  it('the filled copy lists the same component names as the template', async () => {
    const {parsedComponents} = await import('./template-adapter.mjs');
    expect(parsedComponents(fillTemplatePlaceholders(raw).source)).toEqual(
      parsedComponents(raw),
    );
  });

  it('the pre-parse bound holds the library icon a placeholder tag draws', async () => {
    const {componentNameBound, parsedComponents} =
      await import('./template-adapter.mjs');
    const bound = componentNameBound(raw) ?? [];
    for (const name of parsedComponents(raw)) expect(bound).toContain(name);
    expect(bound).toContain(placeholderSource('delete', '24/outline')?.export);
  });
});

describe('an aliased placeholder in the pre-parse bound', () => {
  it('holds the library icon the imported placeholder draws', async () => {
    const {componentNameBound, parsedComponents} =
      await import('./template-adapter.mjs');
    const raw =
      "import {DeleteIcon as Del} from '@astryxdesign/template-icons';\nexport default () => <Del />;\n";
    const bound = componentNameBound(raw) ?? [];
    for (const name of parsedComponents(raw)) expect(bound).toContain(name);
  });
});

describe('a placeholder import beside a default import', () => {
  it('keeps the default import as a default, and a comment beside a kept name', () => {
    const {source} = fillTemplatePlaceholders(
      "import Thing, {DeleteIcon, NotAMeaningIcon /* keep */} from '@astryxdesign/template-icons';\n",
    );
    expect(source).toBe(
      [
        "import {TrashIcon as DeleteIcon} from '@heroicons/react/24/outline';",
        "import Thing, {NotAMeaningIcon /* keep */} from '@astryxdesign/template-icons';",
        '',
      ].join('\n'),
    );
  });
});
