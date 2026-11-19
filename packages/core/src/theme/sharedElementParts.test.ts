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
  it("lets a side nav item's icon entry beat a keyed icon entry on its element", () => {
    const theme = defineTheme({
      name: 'shared-element-side-nav-icon',
      tokens: {},
      components: {
        icon: {'size:sm': {color: 'gray'}},
        'side-nav-item-icon': {base: {color: 'blue'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const at = component.indexOf('@layer parts {');
    expect(at).toBeGreaterThan(-1);
    expect(component.slice(at)).toMatch(
      /\.astryx-side-nav-item-icon\s*\{\s*color: blue/,
    );
    expect(component.slice(0, at)).toMatch(
      /\.astryx-icon\[data-size="sm"\]\s*\{\s*color: gray/,
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
  it("keeps Text's color and size props over a part's entry on Text's element", () => {
    // Timestamp and Timer draw on Text's element: an explicit `color` or
    // `size` (`data-color`, `data-size` on that element) still wins over the
    // theme's `timestamp` entry in the later sub-layer, as it wins over a
    // `text` entry. The overrides name the part's own target, so no other
    // Text is reached.
    const theme = defineTheme({
      name: 'shared-element-text-props',
      tokens: {},
      components: {
        text: {base: {color: 'black'}},
        timestamp: {base: {color: 'red', fontSize: '20px'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const parts = component.slice(component.indexOf('@layer parts {'));
    const part = parts.indexOf('.astryx-timestamp {');
    const color = parts.indexOf(
      '.astryx-timestamp[data-color="primary"] { color: var(--color-text-primary); }',
    );
    const size = parts.indexOf(
      '.astryx-timestamp[data-size="sm"] { font-size: var(--font-size-sm); }',
    );
    expect(part).toBeGreaterThan(-1);
    expect(color).toBeGreaterThan(part);
    expect(size).toBeGreaterThan(part);
    // With no color prop a Timestamp still reflects its default `secondary`:
    // no override for it follows the part, so the theme's timestamp color
    // paints there, and an explicit color beats it.
    expect(parts).not.toContain('[data-color="secondary"]');
  });

  it("leaves a theme's own multi-key text entries in charge of every other Text", () => {
    // A `timestamp` entry puts the part in the later sub-layer; nothing that
    // selects every Text may follow it there, or it would outrank the theme's
    // `text` entries for body text keyed on color or size.
    const theme = defineTheme({
      name: 'shared-element-text-entries',
      tokens: {},
      components: {
        text: {
          'type:body+color:primary': {color: 'green'},
          'type:body+size:lg': {fontSize: '30px'},
        },
        timestamp: {base: {color: 'red'}},
        timer: {base: {color: 'red'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    const at = component.indexOf('@layer parts {');
    expect(at).toBeGreaterThan(-1);
    const parts = component.slice(at);
    expect(parts).not.toMatch(/\.astryx-text[[.:\s{]/);
    expect(component.slice(0, at)).toMatch(
      /\.astryx-text\.type-body\[data-color="primary"\]|\.astryx-text[^{]*\[data-color="primary"\][^{]*\{[^}]*color: green/,
    );
  });

  it("writes no Text prop rules in the parts sub-layer without a part on Text's element", () => {
    const theme = defineTheme({
      name: 'shared-element-no-text-part',
      tokens: {},
      components: {
        text: {base: {color: 'black'}},
        'toggle-button': {base: {color: 'red'}},
      },
    });
    const {component} = generateThemeCSS(theme);
    expect(component.slice(component.indexOf('@layer parts {'))).not.toContain(
      '[data-color=',
    );
  });
});
