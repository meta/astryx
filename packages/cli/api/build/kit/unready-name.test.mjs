// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An idea that is a not-ready page template's name, typed as one word or
 * with its own separators, gets the ready-only kit build gives that name's
 * words, and the reason says the template is not ready yet: search reads a
 * whole entry name as naming that one entry, and build reads search as if a
 * not-ready template were absent.
 */

import {describe, expect, it} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../build.mjs';
import {loadTemplates} from '../_adapter.mjs';
import {readNames} from './words.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/** @param {string} id kebab-case id @returns {string} */
const pascal = id =>
  id
    .split('-')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('');

describe("a not-ready page template's name as the whole idea", () => {
  it('gets the ready-only kit and the not-ready reason', async () => {
    const {pages, notReadyPages} = await loadTemplates(REPO);
    const ready = new Set(pages.map(p => p.name));
    const named = notReadyPages.filter(t => t.name.includes('-'));
    expect(named.length).toBeGreaterThan(0);
    for (const {name} of named) {
      for (const idea of [pascal(name), name]) {
        const r = await build(idea, {cwd: REPO});
        if (r.type !== 'build.kit') throw new Error(r.type);
        const kit = r.data;
        expect(
          kit.pages.length + kit.blocks.length + kit.domain.length,
        ).toBeGreaterThan(0);
        for (const page of kit.pages) expect(ready.has(page.name)).toBe(true);
        expect(kit.start?.reason).toContain(`\`${name}\` isn't ready yet`);
      }
    }
  }, 60_000);

  it('leaves a one-word not-ready name, a plural and a name typed as words as typed', async () => {
    const {notReadyPages} = await loadTemplates(REPO);
    for (const {name} of notReadyPages) {
      const words = name.split('-');
      const asWords = `a ${words.join(' ')} page`;
      expect(readNames(asWords, notReadyPages, {spaced: true})).toBe(asWords);
      if (words.length === 1) {
        for (const idea of [`a ${name} page`, `${name}s with filters`]) {
          expect(readNames(idea, notReadyPages, {spaced: true})).toBe(idea);
        }
      }
    }
  });
});
