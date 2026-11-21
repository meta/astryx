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
import {defineTheme, type TokenName, type TokenValue} from './defineTheme';
import {
  generateAdaptationCSS,
  generateOnMediaCSS,
  generateThemeCSS,
} from './generateThemeRules';

// Core's components and Lab's: a Lab part can sit on a Core component.
const SRCS = [join(__dirname, '..'), join(__dirname, '../../../lab/src')];

async function docTargets(): Promise<{className: string; sitsOn?: string}[]> {
  const out: {className: string; sitsOn?: string}[] = [];
  for (const SRC of SRCS) {
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
  it("lets a part's root entry beat its component's media-surface entry", () => {
    const theme = defineTheme({
      name: 'shared-element-stages',
      tokens: {},
      components: {'toggle-button': {base: {borderColor: 'red'}}},
      onDark: {components: {button: {base: {borderColor: 'white'}}}},
    });
    const {component} = generateThemeCSS(theme);
    const at = component.indexOf('@layer parts {');
    // The component's dark-surface entry stays in the earlier sub-layer, so
    // the part's root entry wins on a toggle button there too.
    expect(component.slice(0, at)).toMatch(
      /astryx-button[^{]*\{\s*border-color: white/,
    );
    expect(component.slice(at)).toMatch(
      /\.astryx-toggle-button\s*\{\s*border-color: red/,
    );
  });
  it("lets a pager cell's entry beat a keyed button entry on its element", () => {
    const theme = defineTheme({
      name: 'shared-element-pager',
      tokens: {},
      components: {
        button: {'variant:ghost': {backgroundColor: 'gray'}},
        'pagination-item': {selected: {backgroundColor: 'blue'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const at = component.indexOf('@layer parts {');
    expect(at).toBeGreaterThan(-1);
    expect(component.slice(at)).toMatch(
      /\.astryx-pagination-item\[data-selected="selected"\]\s*\{\s*background-color: blue/,
    );
    expect(component.slice(0, at)).toMatch(
      /\.astryx-button\[data-variant="ghost"\]\s*\{\s*background-color: gray/,
    );
  });
  describe('on a surface that flips with the page', () => {
    // An inverted fill dark on a light page and light on a dark one: a toast
    // card takes its light side on a dark page.
    const flipping: Partial<Record<TokenName, TokenValue>> = {
      '--color-background-inverted': ['#0a1317', '#f4f0e8'],
      '--color-on-dark': ['#ffffff', '#ffffff'],
      '--color-on-light': ['#111111', '#111111'],
    };
    const flipped = '[data-astryx-media-dark-page="light"]';
    const modes = {'@dark': {color: '#fafafa'}, '@light': {color: '#121212'}};

    it("follows the dark-page side in a part's root color-mode blocks", () => {
      const theme = defineTheme({
        name: 'shared-element-flip',
        tokens: {...flipping},
        components: {
          button: {'variant:ghost': {backgroundColor: 'gray'}},
          'toggle-button': {base: modes},
        },
      });
      const {component} = generateThemeCSS(theme);
      const parts = component.slice(component.indexOf('@layer parts {'));
      expect(parts).toContain(flipped);
      expect(
        parts
          .split('}')
          .some(
            rule =>
              rule.includes(`${flipped} *`) &&
              rule.includes('.astryx-toggle-button') &&
              rule.includes('color: #121212'),
          ),
      ).toBe(true);
    });

    it("follows it in a part's adaptation color-mode blocks", () => {
      const theme = defineTheme({
        name: 'shared-element-flip-adapt',
        tokens: {...flipping},
        components: {button: {'variant:ghost': {backgroundColor: 'gray'}}},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {components: {'toggle-button': {base: modes}}},
            },
          ],
        },
      });
      const layered = generateAdaptationCSS(theme, [], {layered: true});
      const unlayered = generateAdaptationCSS(
        defineTheme({
          name: 'shared-element-flip-adapt',
          tokens: {...flipping},
          adaptations: {
            rules: [
              {
                when: {pointer: 'coarse'},
                value: {components: {'toggle-button': {base: modes}}},
              },
            ],
          },
        }),
      ).component;
      expect(unlayered).toContain(flipped);
      expect(layered.parts).toContain(flipped);
    });

    it("writes a part's on-media rules for the flipped side as its component's are", () => {
      const theme = defineTheme({
        name: 'shared-element-flip-media',
        tokens: {...flipping},
        onDark: {components: {'toggle-button': {base: {color: '#fafafa'}}}},
      });
      const whole = generateOnMediaCSS(theme);
      const {parts} = generateOnMediaCSS(theme, [], {layered: true});
      expect(whole).toContain('.astryx-toggle-button');
      // Every toggle-button rule the single output writes, the parts output
      // writes too, the dark-page copies included.
      const rulesOf = (css: string) =>
        css
          .split('}')
          .filter(rule => rule.includes('.astryx-toggle-button'))
          .map(rule => rule.slice(rule.indexOf(':is([data-astryx-media')));
      expect(rulesOf(parts)).toEqual(rulesOf(whole));
    });
  });

  it("keeps Timestamp's and Timer's entries in the components sub-layer, beside Text's", () => {
    // Their targets sit on Text's element, but Text's prop overrides decide
    // there by weight and order in one layer, so these parts are not split out.
    const theme = defineTheme({
      name: 'shared-element-text-hosted',
      tokens: {},
      components: {
        text: {'type:supporting+color:accent': {color: 'teal'}},
        timestamp: {base: {color: 'red'}},
        timer: {base: {color: 'purple'}},
        // A listed part turns the sub-layers on.
        'toggle-button': {base: {borderColor: 'red'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const partsAt = component.indexOf('@layer parts {');
    expect(partsAt).toBeGreaterThan(-1);
    expect(component.indexOf('.astryx-toggle-button')).toBeGreaterThan(partsAt);
    for (const cls of ['.astryx-timestamp', '.astryx-timer']) {
      expect(component.indexOf(cls)).toBeGreaterThan(-1);
      expect(component.lastIndexOf(cls)).toBeLessThan(partsAt);
    }
  });

  it('puts a Lab part on a listed part in the parts sub-layer beside it', () => {
    const theme = defineTheme({
      name: 'shared-element-lab-parts',
      tokens: {},
      components: {
        'list-item': {base: {backgroundColor: 'gray'}},
        'transfer-list-item': {'side:selected': {backgroundColor: 'teal'}},
        'toggle-button': {base: {borderColor: 'red'}},
        'media-captions-button': {base: {borderColor: 'blue'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const partsAt = component.indexOf('@layer parts {');
    expect(partsAt).toBeGreaterThan(-1);
    for (const cls of [
      '.astryx-list-item',
      '.astryx-transfer-list-item',
      '.astryx-toggle-button',
      '.astryx-media-captions-button',
    ]) {
      expect(component.indexOf(cls), cls).toBeGreaterThan(partsAt);
    }
  });

  it("keeps an !important value in the component's entry ahead of one in the part's", () => {
    // CSS reverses layer order for important declarations, so the part's
    // later sub-layer loses there. The compiler keeps both values as written.
    const theme = defineTheme({
      name: 'shared-element-important',
      tokens: {},
      components: {
        button: {'variant:ghost': {borderColor: 'blue !important'}},
        'toggle-button': {base: {borderColor: 'red !important'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const partsAt = component.indexOf('@layer parts {');
    expect(partsAt).toBeGreaterThan(-1);
    const buttonAt = component.indexOf('.astryx-button[data-variant="ghost"]');
    expect(buttonAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeLessThan(partsAt);
    expect(
      component.slice(buttonAt, component.indexOf('}', buttonAt)),
    ).toContain('blue !important');
    const partAt = component.indexOf('.astryx-toggle-button', partsAt);
    expect(component.slice(partAt, component.indexOf('}', partAt))).toContain(
      'red !important',
    );
  });
});
