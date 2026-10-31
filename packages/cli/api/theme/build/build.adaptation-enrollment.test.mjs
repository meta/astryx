// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Root and adaptation component-value validation are the SAME check.
 *
 * AST-012/DEC-5: component writes in an adaptation rule use the same target,
 * axis, value-domain and extension validation as root `components`. The single
 * thing adaptations add is that a value whose validity comes from THEME
 * ENROLLMENT may not be enrolled conditionally — generated module augmentation
 * is unconditional, so a value existing only under a media condition would
 * widen a component's public type from a conditional surface.
 *
 * Everything else carries: built-ins are independently valid, and an
 * unresolved shared result (a closed literal-union axis with no augmentation
 * point, or a domain the docs cannot enumerate) reaches adaptations unchanged.
 * The spec explicitly rejects adaptation-specific resolvers, allowlists and
 * unresolved-domain exceptions.
 *
 * Each case is therefore PAIRED: the same `component:prop:value` is put on the
 * root and in a rule, and the two outcomes are asserted together. A test that
 * only checked the adaptation side could not tell parity from coincidence.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-enrollment-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** Build a theme whose ROOT declares `component[key]`. */
async function buildWithRootValue(name, component, key) {
  const file = `${name}.mjs`;
  fs.writeFileSync(
    path.join(tmpDir, file),
    `export default {
      name: '${name}',
      tokens: {'--color-background-body': '#fff'},
      components: {'${component}': {'${key}': {color: 'red'}}},
    };\n`,
  );
  return themeBuild(file, {}, {cwd: tmpDir});
}

/** Build a theme whose value appears ONLY inside an adaptation rule. */
async function buildWithRuleOnlyValue(name, component, key) {
  const file = `${name}.mjs`;
  fs.writeFileSync(
    path.join(tmpDir, file),
    `export default {
      name: '${name}',
      tokens: {'--color-background-body': '#fff'},
      adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {components: {'${component}': {'${key}': {color: 'red'}}}},
          },
        ],
      },
    };\n`,
  );
  return themeBuild(file, {}, {cwd: tmpDir});
}

/** Did the build emit type augmentation — i.e. was the value enrollment-dependent? */
function emittedAugmentation(receipt) {
  return Boolean(receipt?.data?.outputs?.variantsDts);
}

describe('values the root accepts without enrollment are accepted rule-only', () => {
  it.each([
    ['a built-in value', 'button', 'variant:primary'],
    // Button `size` is a closed literal union with no `ButtonSizeMap`, so the
    // root has no augmentation point to widen and passes the value through.
    // DEC-5 requires an adaptation to carry that same shared result.
    ['a closed non-augmentable axis', 'button', 'size:jumbo'],
    // A target whose prop domain the docs cannot enumerate — the unresolved
    // case. It must NOT be an adaptation-specific exception; it is simply
    // whatever root does.
    ['an unresolved domain', 'avatar-group', 'size:not-a-real-avatar-size'],
    // `IconVariantMap` is public and augmentable, but `Icon.variant` selects
    // artwork and has no component styling map (component-theming-surface
    // INV14), so a styling key on it never enrolls a value.
    ['an artwork-request axis', 'icon', 'variant:filled'],
  ])('accepts %s on both surfaces', async (_label, component, key) => {
    const rootReceipt = await buildWithRootValue('root-ok', component, key);
    expect(rootReceipt?.type).toBe('theme.build');
    // The root accepts it WITHOUT generating augmentation. That proves the
    // shared root path does not classify it as enrollment-dependent; for an
    // unresolved domain, acceptance is not evidence that the value is valid.
    expect(emittedAugmentation(rootReceipt)).toBe(false);

    const ruleReceipt = await buildWithRuleOnlyValue('rule-ok', component, key);
    expect(ruleReceipt?.type).toBe('theme.build');
  });
});

describe('enrollment-dependent values may not be enrolled by a rule', () => {
  const COMPONENT = 'button';
  const KEY = 'variant:brandy';

  it('the root enrolls it and generates augmentation', async () => {
    const receipt = await buildWithRootValue('root-custom', COMPONENT, KEY);

    expect(receipt?.type).toBe('theme.build');
    expect(emittedAugmentation(receipt)).toBe(true);
    const variants = fs.readFileSync(
      path.join(tmpDir, 'root-custom.variants.d.ts'),
      'utf8',
    );
    expect(variants).toContain('ButtonVariantMap');
    expect(variants).toContain("'brandy': true;");
  });

  it('a rule-only value is rejected', async () => {
    await expect(
      buildWithRuleOnlyValue('rule-custom', COMPONENT, KEY),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringMatching(/enrolls the custom value/),
    });
  });

  it('is accepted in a rule once the root declares it', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'both.mjs'),
      `export default {
        name: 'both',
        tokens: {'--color-background-body': '#fff'},
        components: {button: {'variant:brandy': {color: 'red'}}},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {components: {button: {'variant:brandy': {color: 'blue'}}}},
            },
          ],
        },
      };\n`,
    );

    const receipt = await themeBuild('both.mjs', {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
    // Enrolled once, at the root, and the augmentation stays unconditional.
    expect(emittedAugmentation(receipt)).toBe(true);
    const css = fs.readFileSync(path.join(tmpDir, 'both.css'), 'utf8');
    expect(css).toContain('pointer: coarse');
  });
});

describe('the enrollment rule is the only difference', () => {
  it('rejects a rule-only custom value while accepting its unresolved sibling', async () => {
    // One theme, one rule, two values: the enrollment-dependent one fails and
    // the unresolved one does not contribute an error. Proves the check keys
    // on classification, not on "absent from root".
    fs.writeFileSync(
      path.join(tmpDir, 'mixed.mjs'),
      `export default {
        name: 'mixed',
        tokens: {'--color-background-body': '#fff'},
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {
                components: {
                  button: {'size:jumbo': {color: 'red'}, 'variant:brandy': {color: 'blue'}},
                },
              },
            },
          ],
        },
      };\n`,
    );

    await expect(themeBuild('mixed.mjs', {}, {cwd: tmpDir})).rejects.toThrow(
      /variant:brandy/,
    );
    await expect(
      themeBuild('mixed.mjs', {}, {cwd: tmpDir}),
    ).rejects.not.toThrow(/size:jumbo/);
  });

  it('accepts a rule that only restyles built-ins on many axes', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'builtins.mjs'),
      `export default {
        name: 'builtins',
        tokens: {'--color-background-body': '#fff'},
        adaptations: {
          rules: [
            {
              when: {width: {below: 'md'}},
              value: {
                components: {
                  button: {'variant:secondary': {padding: '8px'}, base: {gap: '4px'}},
                },
              },
            },
          ],
        },
      };\n`,
    );

    const receipt = await themeBuild('builtins.mjs', {}, {cwd: tmpDir});

    expect(receipt?.type).toBe('theme.build');
    expect(emittedAugmentation(receipt)).toBe(false);
  });
});
