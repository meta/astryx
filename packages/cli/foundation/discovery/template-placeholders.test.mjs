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
  meaningWithFallbacks,
  placeholderMeaningsIn,
  templatePlaceholderProblems,
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

describe('meaning fallbacks', () => {
  it('names a fallback that is itself a table meaning and an icon definition', () => {
    const definitions = astryxDefinitionsByName();
    const bad = Object.entries(table.meanings)
      .filter(([, entry]) => entry.fallback)
      .filter(
        ([, entry]) =>
          !Object.hasOwn(
            table.meanings,
            /** @type {string} */ (entry.fallback),
          ) || !definitions.has(/** @type {string} */ (entry.fallback)),
      )
      .map(([meaning]) => meaning);
    expect(bad).toEqual([]);
  });

  it('tries a meaning, then its fallback', () => {
    expect(meaningWithFallbacks('verified')).toEqual(['verified', 'success']);
    expect(meaningWithFallbacks('delete')).toEqual(['delete']);
    expect(meaningWithFallbacks('notAMeaning')).toEqual(['notAMeaning']);
  });
});

describe('templatePlaceholderProblems', () => {
  const definitions = astryxDefinitionsByName();
  const check = (/** @type {string} */ source, declared = {}) =>
    templatePlaceholderProblems(
      [{id: 'pages/demo', source, declared}],
      definitions,
    );

  it('finds nothing wrong in good placeholder imports', () => {
    expect(
      check(
        "import {DeleteIcon} from '@astryxdesign/template-icons';\nimport {StarIcon as StarSolid} from '@astryxdesign/template-icons/24/solid';\n",
      ),
    ).toEqual([]);
  });

  it('names a type-only or side-effect import, which a copy never fills', () => {
    expect(
      check("import type {DeleteIcon} from '@astryxdesign/template-icons';\n"),
    ).toEqual([expect.stringMatching(/type-only import .* is never filled/u)]);
    expect(check("import '@astryxdesign/template-icons';\n")).toEqual([
      expect.stringMatching(/side-effect import .* is never filled/u),
    ]);
    expect(
      check("import {type DeleteIcon} from '@astryxdesign/template-icons';\n"),
    ).toEqual([expect.stringMatching(/imported as a type/u)]);
  });

  it('reads an aliased placeholder as the icon it draws', async () => {
    const {parsedComponents} = await import('./template-adapter.mjs');
    expect(
      parsedComponents(
        "import {StarIcon as StarSolid} from '@astryxdesign/template-icons/24/solid';\nexport default () => <StarSolid />;\n",
      ),
    ).toEqual(
      parsedComponents(
        "import {StarIcon} from '@heroicons/react/24/solid';\nexport default () => <StarIcon />;\n",
      ),
    );
  });

  it('names an unknown meaning, with its fix', () => {
    const [problem] = check(
      "import {DeletIcon} from '@astryxdesign/template-icons';\n",
    );
    expect(problem).toMatch(/DeletIcon names no icon meaning\. Fix:/u);
  });

  it('names a path that is not a variant, with its fix', () => {
    const [problem] = check(
      "import {DeleteIcon} from '@astryxdesign/template-icons/32/solid';\n",
    );
    expect(problem).toMatch(/is not a variant\. Fix:/u);
  });

  it('names a meaning the look does not draw, with its fix', () => {
    const [problem] = check(
      "import {DeleteIcon} from '@astryxdesign/template-icons/lucide';\n",
    );
    expect(problem).toMatch(
      /has no lucide icon in the template icon table\. Fix:/u,
    );
  });

  it('names an icons declaration left beside placeholder imports', () => {
    const [problem] = check(
      "import {DeleteIcon} from '@astryxdesign/template-icons';\n",
      {
        TrashIcon: 'delete',
      },
    );
    expect(problem).toMatch(/still declares icons\. Fix:/u);
  });

  it('reads the meanings a source imports', () => {
    expect(
      placeholderMeaningsIn(
        "import {DeleteIcon, CloseIcon} from '@astryxdesign/template-icons';\nimport {DeleteIcon as D2} from '@astryxdesign/template-icons/20/solid';\n",
      ),
    ).toEqual(['delete', 'close']);
  });
});

describe('the fill without a parse', () => {
  it('gives every bundled template the same copy as the parsed fill', async () => {
    const {fillParsed} = await import('./template-placeholders.mjs');
    const root = path.join(CLI_DIR, 'assets/templates');
    /** @param {string} dir @returns {string[]} */
    const tsx = dir =>
      fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
        entry.isDirectory()
          ? tsx(path.join(dir, entry.name))
          : entry.name.endsWith('.tsx')
            ? [path.join(dir, entry.name)]
            : [],
      );
    const differ = [];
    for (const file of tsx(root)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('@astryxdesign/template-icons')) continue;
      if (
        JSON.stringify(fillTemplatePlaceholders(source)) !==
        JSON.stringify(fillParsed(source))
      )
        differ.push(path.relative(root, file));
    }
    expect(differ).toEqual([]);
  });
});
