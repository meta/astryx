// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {SLOT_KINDS, isPageKind, isSlotKind, slotTakes} from './slot-kinds.mjs';
import {doc as schemaDoc} from './template.doc.mjs';

describe('the slot kinds', () => {
  it('are the members of TemplateSlotKind, in its order', () => {
    const typeText = fs.readFileSync(new URL('./type.ts', import.meta.url), 'utf-8');
    const union = typeText.slice(
      typeText.indexOf('export type TemplateSlotKind ='),
      typeText.indexOf(';', typeText.indexOf('export type TemplateSlotKind =')),
    );
    const members = [...union.matchAll(/\| '([a-z-]+)'/g)].map(m => m[1]);
    expect(SLOT_KINDS.map(k => k.kind)).toEqual(members);
  });

  it('match the table the template doc schema prints', () => {
    const table = /** @type {any} */ (schemaDoc.notes).find(
      (/** @type {any} */ note) => note.type === 'table',
    );
    expect(
      table.rows.map((/** @type {string[]} */ row) => [
        row[0].replaceAll('`', ''),
        row[1],
        row[2],
      ]),
    ).toEqual(SLOT_KINDS.map(k => [k.kind, k.group, k.summary]));
  });

  it('put regions and sections in a page and contexts nowhere', () => {
    expect(isPageKind('toolbar')).toBe(true);
    expect(isPageKind('metrics')).toBe(true);
    expect(isPageKind('overlay')).toBe(false);
    expect(isPageKind('inline')).toBe(false);
    expect(isPageKind('hologram')).toBe(false);
    expect(isSlotKind('chat')).toBe(true);
    expect(isSlotKind('hologram')).toBe(false);
  });

  it('let the page body take every kind that goes in a page', () => {
    for (const {kind} of SLOT_KINDS) {
      expect(slotTakes('main', kind)).toBe(isPageKind(kind));
      expect(slotTakes(kind, kind)).toBe(isPageKind(kind));
    }
    expect(slotTakes('table', 'chart')).toBe(false);
  });
});
