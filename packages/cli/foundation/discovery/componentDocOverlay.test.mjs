// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards translated/compressed component docs against dropping props.
 * @input packages/core/src/{Name}/{Name}.doc.mjs — its `docs`, `docsZh`, `docsDense`.
 * @output Vitest failures naming every prop that exists in `docs` but vanishes
 *   from a translated view.
 * @position Regression gate for component-loader.mjs.
 *
 * A `docsZh` that carries its own `props` array used to REPLACE the base doc
 * wholesale, so any prop the translation had not caught up with simply ceased
 * to exist: `astryx component Button --zh` silently omitted `isInterruptible`
 * and `isIconOnly`. A reader of the translated docs cannot discover a prop that
 * is not there, and CLAUDE.md tells every AI agent to read these docs.
 *
 * Translations are now an overlay: a prop the translation does not cover falls
 * back to its English entry rather than disappearing. Same principle as the
 * reference-doc overlays in #2182 — an overlay covering a subset must not
 * destroy what it does not cover.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadDocs} from './component-loader.mjs';

const CORE_SRC = path.join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'core',
  'src',
);

/** Component dirs that ship a doc file. */
function componentDocs() {
  const out = [];
  for (const dir of fs.readdirSync(CORE_SRC)) {
    const docPath = path.join(CORE_SRC, dir, `${dir}.doc.mjs`);
    if (!fs.existsSync(docPath)) continue;
    if (!fs.readdirSync(path.join(CORE_SRC, dir)).includes(`${dir}.doc.mjs`)) {
      continue; // case-exact match only
    }
    out.push({name: dir, docPath});
  }
  return out;
}

/** Prop names on a doc, across single- and multi-component shapes. */
function propNames(doc) {
  const names = new Set();
  for (const p of doc?.props ?? []) names.add(p.name);
  for (const c of doc?.components ?? []) {
    for (const p of c.props ?? []) names.add(`${c.name ?? '?'}.${p.name}`);
  }
  return names;
}

describe('translated component docs never drop a prop', () => {
  const comps = componentDocs();

  it('finds component docs to check', () => {
    expect(comps.length).toBeGreaterThan(0);
  });

  for (const {name, docPath} of comps) {
    for (const locale of ['zh', 'dense']) {
      it(`${name} --${locale}: documents every prop the English doc documents`, async () => {
        const mod = await import(pathToFileURL(docPath).href);
        const key = locale === 'zh' ? 'docsZh' : 'docsDense';
        if (!mod[key]) return; // no overlay, nothing to drift

        const english = propNames(mod.docs);
        const translated = propNames(
          await loadDocs(docPath, {[locale]: true}),
        );

        const dropped = [...english].filter(p => !translated.has(p));
        expect(
          dropped,
          `${name}.doc.mjs ${key} drops ${dropped.length} prop(s) from the ` +
            `--${locale} view: ${dropped.join(', ')}. A reader of the ` +
            `translated docs cannot discover a prop that is not there. An ` +
            `untranslated prop must fall back to its English entry, not vanish.`,
        ).toEqual([]);
      });
    }
  }
});

describe('full component-doc overlays', () => {
  it('astryx component Button --zh still lists isInterruptible and isIconOnly', async () => {
    const docPath = path.join(CORE_SRC, 'Button', 'Button.doc.mjs');
    const zh = await loadDocs(docPath, {zh: true});
    const names = propNames(zh);
    expect(names.has('isInterruptible')).toBe(true);
    expect(names.has('isIconOnly')).toBe(true);
  });

  it('keeps the translated descriptions it does have', async () => {
    const docPath = path.join(CORE_SRC, 'Button', 'Button.doc.mjs');
    const mod = await import(pathToFileURL(docPath).href);
    const zh = await loadDocs(docPath, {zh: true});

    const translated = mod.docsZh.props.find(p => p.name === 'variant');
    const merged = zh.props.find(p => p.name === 'variant');
    expect(merged.description).toBe(translated.description);
  });

  it('keeps base accessibility guidance when a translation does not replace it', async () => {
    const docPath = path.join(
      import.meta.dirname,
      '__fixtures__',
      'component-accessibility-overlay.doc.mjs',
    );
    const english = await loadDocs(docPath);
    const dense = await loadDocs(docPath, {dense: true});

    expect(english.usage.accessibility.length).toBeGreaterThan(0);
    expect(dense.usage.accessibility).toEqual(english.usage.accessibility);
    expect(dense.usage.accessibilityThemeCoverage).toEqual(
      english.usage.accessibilityThemeCoverage,
    );
    expect(dense.usage.accessibilityThemeCoverage[0].notMeasured).toContain(
      'Decorative track — Not part of the contrast audit.',
    );
    expect(dense.usage.bestPractices).toBeUndefined();
    expect(dense.usage.anatomy).toEqual(english.usage.anatomy);
  });

  it('inherits canonical anatomy when a full docsZh usage omits it', async () => {
    const docPath = path.join(
      import.meta.dirname,
      '__fixtures__',
      'component-accessibility-overlay.doc.mjs',
    );
    const english = await loadDocs(docPath);
    const zh = await loadDocs(docPath, {zh: true});

    expect(zh.usage.description).toBe('Translated full-doc description.');
    expect(zh.usage.anatomy).toEqual(english.usage.anatomy);
    expect(zh.usage.bestPractices).toBeUndefined();
  });

  it('keeps explicit localized anatomy from a full docsZh usage', async () => {
    const docPath = path.join(
      import.meta.dirname,
      '__fixtures__',
      'component-anatomy-override.doc.mjs',
    );
    const mod = await import(pathToFileURL(docPath).href);
    const zh = await loadDocs(docPath, {zh: true});

    expect(zh.usage.anatomy).toEqual(mod.docsZh.usage.anatomy);
    expect(zh.usage.anatomy).not.toEqual(mod.docs.usage.anatomy);
  });
});
