// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build` against a core that predates ordered adaptations.
 *
 * The CLI and @astryxdesign/core are independently versioned optional peers
 * (`"@astryxdesign/core": "*"`), so a newer CLI routinely runs against an older
 * published core. Adaptations are a core CAPABILITY — `generateAdaptationCSS`
 * — and requiring it unconditionally broke every theme build on such a pairing,
 * adaptation or not.
 *
 * The contract these tests hold:
 * - a theme with no adaptation intent builds against the older core, unchanged;
 * - a theme that HAS adaptation intent — valid rules, a custom width map, or
 *   present-but-malformed metadata the old resolver would erase — fails before
 *   anything is generated or written with ERR_CORE_INCOMPATIBLE;
 * - every shape a theme arrives in is recognized: raw `adaptations` input, a
 *   resolved `__adaptationRules`, a built module's `__adaptations`, and a
 *   source file whose adaptations the older resolver erased on the way in;
 * - a source that cannot be observed completely fails clearly rather than
 *   building on an assumption;
 * - raw generative-axis metadata survives an old-core build for a later
 *   current-core child's source-equivalent extension.
 *
 * The capability is removed with vi.mock and the resolver is made
 * adaptation/axis-blind so unit cases exercise the same erased-input boundary
 * without installing another package. `build.packed-old-core.test.mjs` covers
 * the resolution-level pairing with a real package layout and separate process.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('@astryxdesign/core/theme', async importActual => {
  const actual = /** @type {Record<string, any>} */ (await importActual());
  const {generateAdaptationCSS: _dropped, ...withoutAdaptations} = actual;

  /** Model the published old core: it resolves ordinary theme values but drops
   * every adaptation field and retained generative-axis metadata. */
  const blind = value => {
    if (!value || typeof value !== 'object') return value;
    const {
      adaptations: _adaptations,
      __adaptations: _normalized,
      __adaptationRules: _rules,
      __axes: _axes,
      ...rest
    } = value;
    if (rest.extends) rest.extends = blind(rest.extends);
    return rest;
  };

  return {
    ...withoutAdaptations,
    defineTheme(input) {
      return blind(actual.defineTheme(blind(input)));
    },
  };
});

const {themeBuild} = await import('./build.mjs');

/** The message any old-core adaptation failure must carry. */
const UPGRADE_MESSAGE = /does not export `generateAdaptationCSS`/;

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-old-core-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {string} source
 * @returns {string} the file name, relative to tmpDir
 */
function writeTheme(name, source) {
  fs.writeFileSync(path.join(tmpDir, `${name}.mjs`), source);
  return `${name}.mjs`;
}

/** @param {string} name */
function outputs(name) {
  return ['css', 'js', 'd.ts', 'variants.d.ts'].map(ext =>
    path.join(tmpDir, `${name}.${ext}`),
  );
}

/** @param {string} name */
function wroteNothing(name) {
  return outputs(name).every(file => !fs.existsSync(file));
}

describe('theme build without core adaptation support', () => {
  it('builds a theme that declares no adaptations', async () => {
    const file = writeTheme(
      'plain',
      `export default {
        name: 'plain',
        tokens: {'--color-background': '#fff'},
        components: {button: {base: {borderRadius: '4px'}}},
      };\n`,
    );

    const receipt = await themeBuild(file, {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
    const css = fs.readFileSync(path.join(tmpDir, 'plain.css'), 'utf8');
    expect(css).toContain('--color-background: #fff;');
    expect(css).toContain('border-radius: 4px;');
  });

  it('builds a theme whose normalized adaptations carry no rules', async () => {
    // What core's resolver puts on EVERY theme, and what every shipped built
    // theme carries: the field is present, the rule list is empty, the width
    // map is the complete default one. That combination asks for nothing.
    const file = writeTheme(
      'normalized-empty',
      `export default {
        name: 'normalized-empty',
        tokens: {'--color-background': '#fff'},
        __adaptations: {
          widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
          rules: [],
        },
      };\n`,
    );

    const receipt = await themeBuild(file, {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
    expect(fs.existsSync(path.join(tmpDir, 'normalized-empty.css'))).toBe(true);
  });

  it('builds source that declares only the complete default adaptation map', async () => {
    const file = writeTheme(
      'raw-default-map',
      `import {defineTheme} from '@astryxdesign/core/theme';
      export default defineTheme({
        name: 'raw-default-map',
        tokens: {'--color-background': '#fff'},
        adaptations: {
          widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
          rules: [],
        },
      });\n`,
    );

    const receipt = await themeBuild(file, {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
    expect(fs.existsSync(path.join(tmpDir, 'raw-default-map.css'))).toBe(true);
  });

  it.each([
    ['a string rule list', 'rules-string', `{rules: 'invalid'}`],
    ['a null rule list', 'rules-null', `{rules: null}`],
    ['an object rule list', 'rules-object', `{rules: {invalid: true}}`],
    ['an array breakpoint map', 'points-array', `{widthBreakpoints: []}`],
    ['a null breakpoint map', 'points-null', `{widthBreakpoints: null}`],
  ])(
    'rejects malformed adaptations with %s',
    async (_label, name, adaptations) => {
      const file = writeTheme(
        name,
        `export default {
        name: '${name}',
        tokens: {'--color-background': '#fff'},
        adaptations: ${adaptations},
      };\n`,
      );

      await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
        code: 'ERR_CORE_INCOMPATIBLE',
      });
      expect(wroteNothing(name)).toBe(true);
    },
  );

  it('rejects a CUSTOM width map even with no rules', async () => {
    // Emits no CSS, so nothing looks lost — but the map is preserved in built
    // metadata, resolves `AppShell`'s `mobileNav.breakpoint` names, and is
    // inherited through `extends`. An older core keeps none of that, so the
    // theme would build and then behave differently wherever those points are
    // read. This is the one intent case with no CSS behind it.
    const file = writeTheme(
      'breakpoints-only',
      `export default {
        name: 'breakpoints-only',
        tokens: {'--color-background': '#fff'},
        __adaptations: {
          widthBreakpoints: {sm: 600, md: 900, lg: 1200, xl: 1500, '2xl': 1800},
          rules: [],
        },
      };\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
    expect(wroteNothing('breakpoints-only')).toBe(true);
  });

  it('rejects a partial width map, even one matching the defaults', async () => {
    // Core merges a partial map over the defaults; the override is real and
    // inheritable regardless of the values it happens to name.
    const file = writeTheme(
      'one-point',
      `export default {
        name: 'one-point',
        tokens: {'--color-background': '#fff'},
        adaptations: {widthBreakpoints: {md: 768}, rules: []},
      };\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
  });

  it('rejects raw `adaptations` input, writing nothing', async () => {
    const file = writeTheme(
      'raw',
      `export default {
        name: 'raw',
        tokens: {'--color-background': '#fff'},
        adaptations: {
          widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
          rules: [
            {when: {pointer: 'coarse'}, value: {tokens: {'--size-element-md': '44px'}}},
          ],
        },
      };\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
      message: expect.stringMatching(UPGRADE_MESSAGE),
    });
    expect(wroteNothing('raw')).toBe(true);
  });

  it('rejects a resolved theme carrying `__adaptationRules`', async () => {
    const file = writeTheme(
      'resolved',
      `export default {
        name: 'resolved',
        tokens: {'--color-background': '#fff'},
        __adaptationRules: [
          {
            when: {pointer: 'coarse'},
            value: {tokens: {'--size-element-md': '44px'}},
          },
        ],
      };\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
    expect(wroteNothing('resolved')).toBe(true);
  });

  it('rejects a built module read back as `__adaptations` with rules', async () => {
    // The shape `generateBuiltModule` emits — the base an `extends` chain reads.
    const file = writeTheme(
      'built-base',
      `export default {
        name: 'built-base',
        __built: true,
        tokens: {'--color-background': '#fff'},
        __adaptations: {
          widthBreakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
          rules: [
            {when: {contrast: 'more'}, value: {tokens: {'--color-border': '#000'}}},
          ],
        },
      };\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
    expect(wroteNothing('built-base')).toBe(true);
  });

  it('rejects a source whose adaptations the old resolver erased', async () => {
    // The dangerous pairing: this core's `defineTheme` builds its result field
    // by field and drops `adaptations`, so the object the build ends up
    // holding carries no trace of them. Interception records the raw input as
    // the call happens, which is the only remaining witness — without it this
    // ships CSS with every adaptation rule silently missing.
    const file = writeTheme(
      'erased',
      `import {defineTheme} from '@astryxdesign/core/theme';
      export default defineTheme({
        name: 'erased',
        tokens: {'--color-background': '#fff'},
        adaptations: {
          rules: [
            {when: {motion: 'reduce'}, value: {tokens: {'--motion-fast': '0ms'}}},
          ],
        },
      });\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
    expect(wroteNothing('erased')).toBe(true);
  });

  it('sees adaptations a factory hands to defineTheme', async () => {
    // No static analysis could follow this reliably; interception does not
    // have to — the call happens, so the input is recorded.
    const file = writeTheme(
      'factory',
      `import {defineTheme} from '@astryxdesign/core/theme';
      const layer = (...parts) => parts.reduce((a, p) => ({...a, ...p}), {});
      const build = cfg => defineTheme(layer({name: 'factory', tokens: {}}, cfg));
      export default [build({adaptations: {rules: [{when: {pointer: 'coarse'}, value: {}}]}})].at(-1);\n`,
    );

    await expect(themeBuild(file, {}, {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_CORE_INCOMPATIBLE',
    });
    expect(wroteNothing('factory')).toBe(true);
  });

  it('does not fail a plain theme for an adaptive sibling in the same module', async () => {
    // Both themes are defined in one module; only the selected one's lineage
    // decides. Failing here would be the false positive that makes the guard
    // unusable.
    const file = writeTheme(
      'siblings',
      `import {defineTheme} from '@astryxdesign/core/theme';
      export const unused = defineTheme({
        name: 'unused',
        tokens: {},
        adaptations: {rules: [{when: {pointer: 'coarse'}, value: {}}]},
      });
      export default defineTheme({
        name: 'siblings',
        tokens: {'--color-background': '#fff'},
      });\n`,
    );

    const receipt = await themeBuild(file, {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
  });

  it('builds a theme whose only mention of adaptations is comments and strings', async () => {
    // A text search would fail this theme; watching the actual call cannot.
    const file = writeTheme(
      'commented',
      `/**
       * No adaptations yet. One day maybe:
       *   adaptations: {rules: [{when: {pointer: 'coarse'}, value: {}}]}
       */
      // adaptations: {widthBreakpoints: {sm: 600}, rules: []},
      export default {
        name: 'commented',
        tokens: {'--color-background': '#fff'},
        /* adaptations: {rules: []}, */
      };\n`,
    );

    const receipt = await themeBuild(file, {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
  });

  it('fails the same way in --check mode, before reporting drift', async () => {
    const file = writeTheme(
      'checked',
      `export default {
        name: 'checked',
        tokens: {'--color-background': '#fff'},
        adaptations: {
          rules: [{when: {pointer: 'coarse'}, value: {tokens: {'--size-element-md': '44px'}}}],
        },
      };\n`,
    );

    await expect(
      themeBuild(file, {check: true}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_CORE_INCOMPATIBLE'});
  });
});
