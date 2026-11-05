// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for mergeTranslation — overlaying translation docs onto base docs.
 *
 * Covers the hook param/return description merge (HookTranslationDoc) added so
 * dense translations of hook params/returns are actually consumed, plus a
 * regression guard for the existing component prop-description merge.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {loadComponentDoc, loadDocs, mergeTranslation} from './component-loader.mjs';

/** Minimal HookDoc-shaped fixture with params + returns. */
function hookDocs() {
  return {
    name: 'useFocusTrap',
    usage: {description: 'English description.'},
    params: [
      {name: 'options', type: 'UseFocusTrapOptions', description: 'Config object.', required: true},
      {name: 'options.isActive', type: 'boolean', description: 'Whether active.', required: true},
      {name: 'options.onEscape', type: '() => void', description: 'Escape callback.', required: false},
    ],
    returns: [
      {name: 'containerRef', type: 'React.RefObject<HTMLElement | null>', description: 'Ref to attach.'},
      {name: 'focusFirst', type: '() => void', description: 'Focuses first element.'},
    ],
  };
}

describe('mergeTranslation — hook param/return descriptions', () => {
  it('overrides param and return descriptions by name, preserving other fields', () => {
    const merged = mergeTranslation(hookDocs(), {
      paramDescriptions: {
        options: 'Cfg.',
        'options.onEscape': 'Esc cb.',
      },
      returnDescriptions: {
        containerRef: 'Attach ref.',
      },
    });

    // Translated params get the compressed description.
    const options = merged.params.find(p => p.name === 'options');
    expect(options.description).toBe('Cfg.');
    expect(options.type).toBe('UseFocusTrapOptions');
    expect(options.required).toBe(true);

    // Untranslated param keeps original description.
    const isActive = merged.params.find(p => p.name === 'options.isActive');
    expect(isActive.description).toBe('Whether active.');
    expect(isActive.required).toBe(true);

    // Translated return.
    const containerRef = merged.returns.find(r => r.name === 'containerRef');
    expect(containerRef.description).toBe('Attach ref.');
    expect(containerRef.type).toBe('React.RefObject<HTMLElement | null>');

    // Untranslated return unchanged.
    const focusFirst = merged.returns.find(r => r.name === 'focusFirst');
    expect(focusFirst.description).toBe('Focuses first element.');
  });

  it('overrides a nested (dotted) param name correctly', () => {
    const merged = mergeTranslation(hookDocs(), {
      paramDescriptions: {'options.isActive': 'Active?'},
    });

    const isActive = merged.params.find(p => p.name === 'options.isActive');
    expect(isActive.description).toBe('Active?');
    expect(isActive.type).toBe('boolean');

    // Sibling params untouched.
    expect(merged.params.find(p => p.name === 'options').description).toBe('Config object.');
  });

  it('leaves params/returns untouched when translation has no param/return descriptions', () => {
    const base = hookDocs();
    const merged = mergeTranslation(base, {usage: {description: 'Dense desc.'}});

    expect(merged.params).toEqual(base.params);
    expect(merged.returns).toEqual(base.returns);
    expect(merged.usage.description).toBe('Dense desc.');
  });
});

describe('mergeTranslation — component prop descriptions (regression)', () => {
  it('overrides prop descriptions by name, leaving others unchanged', () => {
    const docs = {
      name: 'Button',
      usage: {description: 'English.'},
      props: [
        {name: 'variant', type: 'string', description: 'The variant.'},
        {name: 'disabled', type: 'boolean', description: 'Disabled state.'},
      ],
    };

    const merged = mergeTranslation(docs, {
      usage: {description: 'Dense.'},
      propDescriptions: {variant: 'Vrnt.'},
    });

    expect(merged.usage.description).toBe('Dense.');
    expect(merged.props.find(p => p.name === 'variant').description).toBe('Vrnt.');
    expect(merged.props.find(p => p.name === 'disabled').description).toBe('Disabled state.');
  });
});

describe('loadDocs — default vs named export resolution', () => {
  const fixtureDir = path.join(import.meta.dirname, '__fixtures__');

  it('reads a default-export .doc.mjs (the shape integration add component writes)', async () => {
    const docs = await loadDocs(path.join(fixtureDir, 'component-default-export.doc.mjs'));
    expect(docs).toBeDefined();
    expect(docs.name).toBe('DefaultExportCard');
    expect(docs.description).toBe('A card written with default export.');
    expect(docs.props).toHaveLength(1);
    expect(docs.props[0].name).toBe('title');
  });

  it('still reads a named-export .doc.mjs (legacy shape)', async () => {
    const docs = await loadDocs(path.join(fixtureDir, 'component-named-export.doc.mjs'));
    expect(docs).toBeDefined();
    expect(docs.name).toBe('NamedExportCard');
    expect(docs.props).toHaveLength(1);
  });

  it('default export agrees with loadComponentDoc', async () => {
    const docPath = path.join(fixtureDir, 'component-default-export.doc.mjs');
    const fromLoadDocs = await loadDocs(docPath);
    const fromLoadComponentDoc = await loadComponentDoc(docPath);
    expect(fromLoadDocs).toEqual(fromLoadComponentDoc);
  });

  it('named export agrees with loadComponentDoc', async () => {
    const docPath = path.join(fixtureDir, 'component-named-export.doc.mjs');
    const fromLoadDocs = await loadDocs(docPath);
    const fromLoadComponentDoc = await loadComponentDoc(docPath);
    expect(fromLoadDocs).toEqual(fromLoadComponentDoc);
  });

  it('default export wins when both default and named exports are present', async () => {
    const docPath = path.join(fixtureDir, 'component-both-exports.doc.mjs');
    const fromLoadDocs = await loadDocs(docPath);
    const fromLoadComponentDoc = await loadComponentDoc(docPath);

    // Default export must win at both loaders
    expect(fromLoadDocs.name).toBe('DefaultWinsCard');
    expect(fromLoadDocs.description).toBe('From the default export.');
    expect(fromLoadDocs.props).toHaveLength(1);
    expect(fromLoadComponentDoc.name).toBe('DefaultWinsCard');
    // And the two must agree
    expect(fromLoadDocs).toEqual(fromLoadComponentDoc);
  });
});

describe('loadComponentDoc — full localized doc overlays', () => {
  it('inherits canonical anatomy when docsZh omits it and matches loadDocs', async () => {
    const docPath = path.join(
      import.meta.dirname,
      '__fixtures__',
      'component-accessibility-overlay.doc.mjs',
    );

    const direct = await loadComponentDoc(docPath, {zh: true});
    const cli = await loadDocs(docPath, {zh: true});

    expect(direct).toEqual(cli);
    expect(direct.usage.description).toBe('Translated full-doc description.');
    expect(direct.usage.anatomy).toEqual((await loadComponentDoc(docPath)).usage.anatomy);
    expect(direct.usage.bestPractices).toBeUndefined();
  });

  it('keeps explicit localized anatomy and matches loadDocs', async () => {
    const docPath = path.join(
      import.meta.dirname,
      '__fixtures__',
      'component-anatomy-override.doc.mjs',
    );

    const direct = await loadComponentDoc(docPath, {zh: true});
    const cli = await loadDocs(docPath, {zh: true});
    const canonical = await loadComponentDoc(docPath);

    expect(direct).toEqual(cli);
    expect(direct.usage.anatomy).not.toEqual(canonical.usage.anatomy);
    expect(direct.usage.anatomy[0].name).toBe('文本区域');
  });
});
