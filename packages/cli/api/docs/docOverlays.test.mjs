// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards the --dense / --zh reference-doc overlays against drift (#2182).
 * @input packages/cli/assets/docs/{topic}.doc.mjs and its .doc.dense.mjs / .doc.zh.mjs overlays.
 * @output Vitest failures naming any overlay section that does not anchor to a
 *   real base section, or whose content overrides land on the wrong block type.
 * @position Regression gate for the docs API. Sits with the loader it guards.
 *
 * The overlays used to be applied BY ARRAY POSITION, so an overlay whose
 * sections were ordered differently from the base grafted every title onto the
 * wrong body. `docs tokens --dense` printed the entire colour table under a
 * heading that said "## Spacing", above prose reading "gap props use
 * space0-space12" — teaching any agent that spacing tokens are named
 * `--color-*`. CLAUDE.md tells every agent to run that exact command at
 * bootstrap, which is what made a doc bug into a codegen bug.
 *
 * Overlays now anchor to a base section by title, so a reordered or
 * partial overlay is correct by construction. These tests keep it that way.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {docs} from './docs.mjs';

const DOCS_DIR = path.join(import.meta.dirname, '..', '..', 'assets', 'docs');

/** Every base reference doc that has at least one overlay. */
function overlayPairs() {
  const pairs = [];
  for (const file of fs.readdirSync(DOCS_DIR)) {
    const m = file.match(/^(.+)\.doc\.(dense|zh)\.mjs$/);
    if (!m) continue;
    const [, topic, variant] = m;
    pairs.push({
      topic,
      variant,
      basePath: path.join(DOCS_DIR, `${topic}.doc.mjs`),
      overlayPath: path.join(DOCS_DIR, file),
    });
  }
  return pairs;
}

async function load(p) {
  return await import(pathToFileURL(p).href);
}

describe('reference doc overlays (#2182)', () => {
  const pairs = overlayPairs();

  it('finds overlays to check', () => {
    // A rename that stops overlays being discovered must not silently pass.
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const {topic, variant, basePath, overlayPath} of pairs) {
    it(`${topic} --${variant}: every overlay section anchors to a real base section`, async () => {
      const base = await load(basePath);
      const overlayMod = await load(overlayPath);
      const overlay = overlayMod.docsDense || overlayMod.docsZh;

      const baseTitles = base.docs.sections.map(s => s.title);
      const unanchored = (overlay.sections || [])
        .filter(s => s.section == null || !baseTitles.includes(s.section))
        .map(s => s.section ?? `(no anchor) "${s.title}"`);

      expect(
        unanchored,
        `${topic}.doc.${variant}.mjs has section entries that do not name a ` +
          `base section via \`section:\`. Without an anchor the overlay is ` +
          `applied by array position, which silently grafts each title onto ` +
          `the wrong body. Base sections are: ${baseTitles.join(', ')}.`,
      ).toEqual([]);
    });

    it(`${topic} --${variant}: every content override lands on a block of its own type`, async () => {
      // Blocks are matched by index and type, and a mismatch is dropped with
      // no warning: a prose override aimed at a code block leaves the base
      // text in place, so the reader gets a translated title over an English
      // body. Pad with null to reach the block you mean.
      const base = await load(basePath);
      const overlayMod = await load(overlayPath);
      const overlay = overlayMod.docsDense || overlayMod.docsZh;
      const byTitle = new Map(base.docs.sections.map(s => [s.title, s]));
      const dropped = [];
      for (const entry of overlay.sections || []) {
        const section = byTitle.get(entry.section);
        if (!section) continue;
        (entry.content || []).forEach((block, i) => {
          if (block == null) return;
          const target = section.content[i];
          if (target?.type !== block.type) {
            dropped.push(
              `${entry.section} block ${i}: ${block.type} over ${target?.type ?? 'nothing'}`,
            );
          }
        });
      }
      expect(dropped, `${topic}.doc.${variant}.mjs overrides that never apply`).toEqual([]);
    });

    it(`${topic} --${variant}: no base section is overridden twice`, async () => {
      const overlayMod = await load(overlayPath);
      const overlay = overlayMod.docsDense || overlayMod.docsZh;
      const anchors = (overlay.sections || []).map(s => s.section);
      const dupes = anchors.filter((a, i) => anchors.indexOf(a) !== i);
      expect(dupes, `${topic}.doc.${variant}.mjs overrides the same base section twice`).toEqual([]);
    });
  }
});

describe('the reported defect: docs tokens --dense (#2182)', () => {
  it('does not print the colour table under the Spacing heading', async () => {
    // The spacing table lives in its own guide; the spacing topic shows it
    // through a token reference to the tokens namespace. Both, read dense.
    for (const topic of ['tokens/tokens-spacing', 'spacing']) {
      const result = await docs(topic, null, {dense: true});
      const spacing = result.data.sections.find(s =>
        JSON.stringify(s).includes('--spacing-'),
      );
      expect(spacing, `${topic} --dense should show the spacing table`).toBeTruthy();
      const text = JSON.stringify(spacing);
      expect(
        text.includes('--color-'),
        `The "${spacing.title}" section of \`docs ${topic} --dense\` contains ` +
          `colour tokens. An agent reading this learns that spacing tokens are ` +
          `named --color-*.`,
      ).toBe(false);
    }
  });

  it('keeps every base section reachable, even without an overlay entry', async () => {
    // The tokens overlays compress 5 of 15 category tables. Read through the
    // namespace, the other 10 must still render (in English), not vanish or
    // absorb a neighbour's title.
    const full = await docs('tokens', null, {depth: 'all', detail: 'full'});
    const dense = await docs('tokens', null, {depth: 'all', detail: 'full', dense: true});
    const titles = read =>
      read.data.slots.flatMap(slot =>
        slot.children.flatMap(child => (child.sections ?? []).map(s => s.title)),
      );
    expect(titles(dense).length).toBe(titles(full).length);
    expect(titles(dense)).toContain('Color');
    expect(titles(dense)).toContain('Font Size Tokens');
  });

  it('does not lose a section from docs theme --dense', async () => {
    const full = await docs('theme');
    const dense = await docs('theme', null, {dense: true});
    const titles = dense.data.sections.map(s => s.title);
    // The dense overlay keeps every base section.
    expect(titles.length).toBe(full.data.sections.length);
  });

  it('does not emit a duplicate heading in docs theme --dense', async () => {
    const dense = await docs('theme', null, {dense: true});
    const titles = dense.data.sections.map(s => s.title.toLowerCase());
    const counts = new Map();
    for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, c]) => c > 1);
    expect(dupes).toEqual([]);
  });

  it('does not leak English headings into docs theme --zh', async () => {
    const zh = await docs('theme', null, {zh: true});
    const titles = zh.data.sections.map(s => s.title);
    // Every section the overlay translates must appear once, in Chinese only.
    expect(titles).not.toContain('Dark mode');
    expect(titles).toContain('深色模式');
  });

  it('teaches committed palette references in every theme-doc variant', async () => {
    for (const options of [{}, {dense: true}, {zh: true}]) {
      const result = await docs('theme', null, options);
      const rendered = JSON.stringify(result.data.sections);
      // The command, as `{@command …}` or bare `astryx …`: both print it.
      expect(rendered).toContain(
        'theme palette generate palette.config.json --out palette.generated.ts',
      );
      expect(rendered).toContain(
        "import {palette} from './palette.generated';",
      );
      expect(rendered).toContain('palette.neutral.light[100]');
    }
  });
});
