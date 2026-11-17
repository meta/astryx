// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedElementParts.test.ts
 * @input Every core component doc's theming targets, and SHARED_ELEMENT_PARTS
 * @output Verifies the compiler's shared-element parts are exactly the targets
 *   whose doc entry names a `sitsOn` target, each naming an existing target, and
 *   that a theme's entry for a shared-element part lands in the later `parts`
 *   sub-layer, so it wins over its component's entries by layer order
 * @position Unit test for the shared-element-part theme layering
 */

import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {SHARED_ELEMENT_PARTS} from './sharedElementParts';
import {defineTheme, generateThemeCSS} from './defineTheme';

const SRC = join(__dirname, '..');

async function docTargets(): Promise<{className: string; sitsOn?: string}[]> {
  const out: {className: string; sitsOn?: string}[] = [];
  for (const dir of readdirSync(SRC, {withFileTypes: true})) {
    if (!dir.isDirectory()) {
      continue;
    }
    for (const file of readdirSync(join(SRC, dir.name))) {
      if (!file.endsWith('.doc.mjs')) {
        continue;
      }
      const mod = await import(pathToFileURL(join(SRC, dir.name, file)).href);
      for (const value of Object.values(mod)) {
        const docs = Array.isArray(value) ? value : [value];
        for (const doc of docs) {
          const targets = (doc as {theming?: {targets?: unknown}})?.theming
            ?.targets;
          if (Array.isArray(targets)) {
            out.push(...(targets as typeof out));
          }
        }
      }
    }
  }
  return out;
}

describe('shared-element parts', () => {
  it('are exactly the doc targets that name a sitsOn target, each an existing target', async () => {
    const targets = await docTargets();
    const names = new Set(
      targets.map(t => t.className.slice('astryx-'.length)),
    );
    const declared: Record<string, string> = {};
    for (const target of targets) {
      if (target.sitsOn) {
        declared[target.className.slice('astryx-'.length)] = target.sitsOn;
      }
    }
    expect(declared).toEqual(SHARED_ELEMENT_PARTS);
    for (const host of Object.values(SHARED_ELEMENT_PARTS)) {
      expect(names.has(host), host).toBe(true);
    }
  });

  it("put a part's entry in the later parts sub-layer, its component's in components", () => {
    const theme = defineTheme({
      name: 'shared-element-parts',
      tokens: {},
      components: {
        button: {'variant:ghost': {borderColor: 'transparent'}},
        'toggle-button': {base: {borderColor: 'red'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    expect(component.startsWith('@layer components, parts;')).toBe(true);
    const parts = component.slice(component.indexOf('@layer parts {'));
    const components = component.slice(0, component.indexOf('@layer parts {'));
    expect(parts).toMatch(/\.astryx-toggle-button\s*\{\s*border-color: red/);
    expect(parts).not.toMatch(/astryx-button/);
    expect(components).toMatch(/\.astryx-button\[data-variant="ghost"\]/);
    expect(components).not.toMatch(/astryx-toggle-button/);
  });

  it('leaves a theme with no shared-element part entry in one layer, as before', () => {
    const theme = defineTheme({
      name: 'no-shared-element-parts',
      tokens: {},
      components: {button: {base: {borderColor: 'red'}}},
    });
    const {component} = generateThemeCSS(theme);
    expect(component).not.toMatch(/@layer/);
    expect(component).toMatch(/\.astryx-button\s*\{\s*border-color: red/);
  });

  it('keeps root, adaptation and media-surface order inside the parts sub-layer', () => {
    const theme = defineTheme({
      name: 'shared-element-order',
      tokens: {},
      components: {'toggle-button': {base: {borderColor: 'red'}}},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {'toggle-button': {base: {borderColor: 'blue'}}},
            },
          },
        ],
      },
      onDark: {components: {'toggle-button': {base: {borderColor: 'white'}}}},
    });
    const {component} = generateThemeCSS(theme);
    const parts = component.slice(component.indexOf('@layer parts {'));
    const red = parts.indexOf('border-color: red');
    const blue = parts.indexOf('border-color: blue');
    const white = parts.indexOf('border-color: white');
    expect(red).toBeGreaterThan(-1);
    expect(blue).toBeGreaterThan(red);
    expect(white).toBeGreaterThan(blue);
  });
});
