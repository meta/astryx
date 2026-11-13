// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import {SLOT_KINDS, isPageKind, isSlotKind, slotTakes} from './slot-kinds.mjs';

describe('the slot kinds', () => {
  it('are the members of TemplateSlotKind, in its order', () => {
    const typeText = fs.readFileSync(new URL('./type.ts', import.meta.url), 'utf-8');
    const start = typeText.indexOf('export type TemplateSlotKind =');
    // The union ends at its last member line, `  | '<kind>';`.
    const union = typeText.slice(start, typeText.indexOf("';\n", start) + 2);
    const members = [...union.matchAll(/\| '([a-z-]+)'/g)].map(m => m[1]);
    expect(SLOT_KINDS.map(k => k.kind)).toEqual(members);
  });

  it('carry the meanings the TemplateSlotKind type gives its members', () => {
    const typeText = fs.readFileSync(new URL('./type.ts', import.meta.url), 'utf-8');
    const start = typeText.indexOf('export type TemplateSlotKind =');
    const union = typeText.slice(start, typeText.indexOf("';\n", start) + 2);
    const documented = [...union.matchAll(/\/\*\* (.+?) \*\/\s*\| '([a-z-]+)'/g)].map(m => [
      m[2],
      m[1],
    ]);
    expect(documented).toEqual(SLOT_KINDS.map(k => [k.kind, k.summary]));
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
