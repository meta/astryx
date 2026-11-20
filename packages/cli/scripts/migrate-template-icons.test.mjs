// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The template icon migration (AST-084 FR21): library imports become
 * meaning placeholders by the declared meaning, uses take the placeholder's
 * name unless the import aliased the icon, a second run changes nothing, and
 * an icon the table draws differently stops the run.
 */

import {describe, expect, it} from 'vitest';
import {migrateTemplateSource} from './migrate-template-icons.mjs';
import {placeholderTable} from '../foundation/discovery/template-placeholders.mjs';

const table = placeholderTable();

describe('migrateTemplateSource', () => {
  const SOURCE = [
    "import {TrashIcon, XMarkIcon} from '@heroicons/react/24/outline';",
    "import {StarIcon as StarSolid} from '@heroicons/react/24/solid';",
    "import {Icon} from '@astryxdesign/core/Icon';",
    'const items = [{icon: TrashIcon}, {XMarkIcon}];',
    'export default () => <><TrashIcon /><Icon icon={XMarkIcon} /><StarSolid /></>;',
    '',
  ].join('\n');
  const declared = {TrashIcon: 'delete', XMarkIcon: 'close', StarIcon: 'star'};

  it('imports each icon by its declared meaning, in its look', () => {
    expect(migrateTemplateSource('demo', SOURCE, declared, table)).toBe(
      [
        "import {DeleteIcon, CloseIcon} from '@astryxdesign/template-icons';",
        "import {StarIcon as StarSolid} from '@astryxdesign/template-icons/24/solid';",
        "import {Icon} from '@astryxdesign/core/Icon';",
        'const items = [{icon: DeleteIcon}, {XMarkIcon: CloseIcon}];',
        'export default () => <><DeleteIcon /><Icon icon={CloseIcon} /><StarSolid /></>;',
        '',
      ].join('\n'),
    );
  });

  it('changes nothing in a migrated source', () => {
    const once = /** @type {string} */ (
      migrateTemplateSource('demo', SOURCE, declared, table)
    );
    expect(migrateTemplateSource('demo', once, {}, table)).toBeNull();
  });

  it('stops when the table draws the meaning with another icon', () => {
    expect(() =>
      migrateTemplateSource(
        'demo',
        "import {TrashIcon} from '@heroicons/react/24/outline';\n<TrashIcon />;\n",
        {TrashIcon: 'close'},
        table,
      ),
    ).toThrow(/the table draws XMarkIcon for it/u);
  });

  it('stops on an icon with no declared meaning', () => {
    expect(() =>
      migrateTemplateSource(
        'demo',
        "import {TrashIcon} from '@heroicons/react/24/outline';\n<TrashIcon />;\n",
        {},
        table,
      ),
    ).toThrow(/declares no meaning/u);
  });
});
