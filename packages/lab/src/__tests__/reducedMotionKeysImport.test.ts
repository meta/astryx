// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionKeysImport.test.ts
 * @input Uses vitest, Babel with the StyleX plugin, and core's exported Reduce
 *   Motion keys
 * @output Checks that core's Reduce Motion keys import from lab, that the
 *   literal keys a lab transition spells equal them, and that those literals
 *   compile to media rules in the ordinary media layer
 * @position Test for the `@astryxdesign/core/motion/reducedMotion.stylex`
 *   export
 *
 * A transition spells the two keys literally: StyleX puts a constant used as
 * a computed key in a later priority layer than a literal media key, where it
 * would outrank the element's state styles. The constants are the spelling
 * the literals must match.
 */

import {createRequire} from 'node:module';
import path from 'node:path';
import {
  reducedMotionFadeConsts,
  reducedMotionKeys,
} from '@astryxdesign/core/motion/reducedMotion.stylex';
import {describe, expect, it} from 'vitest';

const lab = path.resolve(__dirname, '../..');

// Babel ships no type declarations to lab; type the one call used.
const {transformSync} = createRequire(import.meta.url)('@babel/core') as {
  transformSync: (
    code: string,
    options: Record<string, unknown>,
  ) => {metadata?: unknown} | null;
};

const FADE = '@media (prefers-reduced-motion: reduce) and (pointer: coarse)';
const INSTANT =
  '@media (prefers-reduced-motion: reduce) and (not (pointer: coarse))';

const SOURCE = `
import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({
  panel: {
    transitionDuration: {
      default: '300ms',
      '${FADE}': '200ms',
      '${INSTANT}': '0s',
    },
  },
  wide: {
    transitionDuration: {default: null, '@media (min-width: 900px)': '1s'},
  },
});
`;

describe('core Reduce Motion keys from lab', () => {
  it('match the literal keys a lab transition spells', () => {
    expect(reducedMotionKeys.fade).toBe(FADE);
    expect(reducedMotionKeys.instant).toBe(INSTANT);
    expect(reducedMotionFadeConsts.duration).toBe('200ms');
  });

  it('compile, spelled literally, to media rules in the ordinary media layer', () => {
    const output = transformSync(SOURCE, {
      filename: path.join(lab, 'src/Panel.tsx'),
      babelrc: false,
      configFile: false,
      parserOpts: {plugins: ['typescript', 'jsx']},
      plugins: [
        [
          '@stylexjs/babel-plugin',
          {dev: false, runtimeInjection: false, treeshakeCompensation: true},
        ],
      ],
    });
    const rules = (
      (output?.metadata as {stylex?: [string, {ltr: string}, number][]})
        .stylex ?? []
    ).map(([, rule, priority]) => ({css: rule.ltr, priority}));
    const media = rules.find(rule =>
      rule.css.includes('transition-duration:1s'),
    );
    const fade = rules.find(rule =>
      rule.css.includes('transition-duration:.2s'),
    );
    const instant = rules.find(rule =>
      rule.css.includes('transition-duration:0s'),
    );
    expect(fade?.css).toMatch(/^@media .*\(pointer: coarse\)/);
    expect(instant?.css.startsWith(INSTANT)).toBe(true);
    expect(fade?.priority).toBe(media?.priority);
    expect(instant?.priority).toBe(media?.priority);
  });
});
