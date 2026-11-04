// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every shipped topic compiles to a plain-JSON node that answers every
 * docs read exactly as the live one does, and no read can change another read
 * of the same catalog.
 */

import {describe, expect, it} from 'vitest';
import {parseCompiledReferenceNode} from '../../foundation/doc-compiler/ir.mjs';
import {detailView, indexView} from '../../foundation/doc-compiler/lenses.mjs';
import {
  compileTopic,
  loadDocsCatalog,
  lowerTopic,
  overlayLanguages,
} from './_adapter.mjs';

const SLOW = 60_000;

describe('every shipped topic compiles to plain JSON', () => {
  it(
    'survives a JSON round trip with identical responses in every language',
    async () => {
      const catalog = await loadDocsCatalog();
      let compiled = 0;
      for (const entry of catalog.entries()) {
        for (const lang of [null, ...overlayLanguages(entry)]) {
          const lowered = await lowerTopic(catalog, entry, lang);
          expect(parseCompiledReferenceNode(lowered)).toBe(lowered);
          const node = await compileTopic(catalog, entry, lang);
          expect(parseCompiledReferenceNode(node)).toBe(node);
          const copy = parseCompiledReferenceNode(
            JSON.parse(JSON.stringify(node)),
          );
          expect(JSON.stringify(detailView(copy))).toBe(
            JSON.stringify(detailView(node)),
          );
          expect(JSON.stringify(indexView(copy))).toBe(
            JSON.stringify(indexView(node)),
          );
          compiled += 1;
        }
      }
      expect(compiled).toBeGreaterThan(catalog.entries().length);
    },
    SLOW,
  );
});

describe('author-a-theme color guidance', () => {
  it('teaches committed generated palette references as the main example', async () => {
    const catalog = await loadDocsCatalog();
    const topic = detailView(
      await compileTopic(catalog, catalog.resolve('author-a-theme')),
    );
    const rendered = JSON.stringify(topic);

    expect(rendered).toContain("import {palette} from './palette.generated';");
    expect(rendered).toContain('palette.neutral.light[100]');
    expect(rendered).toContain('palette.neutral.dark[15]');
    expect(rendered).toContain('color (existing themes)');
    expect(rendered).not.toContain("color: { accent: ['#7B61FF'");
  });
});

describe('reads that share a catalog', () => {
  it(
    'never let one read change another',
    async () => {
      const catalog = await loadDocsCatalog();
      const tokens = catalog.resolve('color');
      const first = detailView(await compileTopic(catalog, tokens));
      for (const section of first.sections) {
        section.title = 'EDITED';
        for (const block of section.content) {
          if (typeof block.text === 'string') block.text = 'EDITED';
          if (Array.isArray(block.rows)) block.rows.push(['EDITED']);
        }
      }
      const again = detailView(await compileTopic(catalog, tokens));
      const index = indexView(await lowerTopic(catalog, tokens));
      const spacing = detailView(
        await compileTopic(catalog, catalog.resolve('spacing')),
      );
      for (const read of [again, index, spacing]) {
        expect(JSON.stringify(read)).not.toContain('EDITED');
      }
      const lowered = await lowerTopic(catalog, tokens);
      expect(Object.isFrozen(lowered.doc.sections[0].content)).toBe(true);
    },
    SLOW,
  );
});
