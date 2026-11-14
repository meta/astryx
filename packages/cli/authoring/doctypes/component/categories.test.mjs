// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests that the component categories match the doc type's `category`
 * values, and that each page family a category declares is a family of the
 * shipped page templates.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COMPONENT_CATEGORIES} from './categories.mjs';
import {loadPageTemplates} from '../../../api/build/_adapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../../..');

describe('COMPONENT_CATEGORIES', () => {
  it('names exactly the values the doc type allows for `category`', () => {
    const type = fs.readFileSync(path.join(HERE, 'type.ts'), 'utf8');
    const union = type.slice(type.indexOf('category?:'));
    const values = [
      ...union.slice(0, union.indexOf(';')).matchAll(/'([^']+)'/g),
    ].map(m => m[1]);
    expect(Object.keys(COMPONENT_CATEGORIES).sort()).toEqual(values.sort());
  });

  it('declares only page families the shipped templates have', async () => {
    const families = new Set(
      (await loadPageTemplates(REPO)).map(t =>
        (t.category.split(' - ')[0] ?? '').trim(),
      ),
    );
    for (const {pageFamily} of Object.values(COMPONENT_CATEGORIES)) {
      if (pageFamily) expect(families).toContain(pageFamily);
    }
  });
});
