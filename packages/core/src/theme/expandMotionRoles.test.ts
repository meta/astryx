// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expandMotionRoles.test.ts
 * @input expandMotionRoles.ts, defineTheme, generateThemeCSS and
 *   generateAdaptationCSS
 * @output Proof that a theme writes a CSS variable for each motion role it
 *   sets (and none for the rest), at its root and in adaptation rules, that
 *   the duration scale is all-or-nothing, and that adaptations have no
 *   platform condition
 * @position Testing for /packages/core/src/theme/expandMotionRoles.ts
 */

import {describe, expect, it} from 'vitest';
import '../motion/uikit';
import {expandMotionRoles, motionScaleOf} from './expandMotionRoles';
import {
  defineTheme,
  generateAdaptationCSS,
  generateThemeCSS,
  type DefineThemeInput,
} from './index';

describe('motion roles in a theme', () => {
  it('writes one CSS variable per role set, in CSS form', () => {
    expect(
      expandMotionRoles(
        {
          springs: {
            'springs.sheetPresent': {duration: 0.6, bounce: 0.1},
            'springs.alertPresent': {response: 0.5, dampingRatio: 0.85},
          },
          durations: {'navigation.transitionMs': 300},
          curves: {'timing.curves.move': [0.4, 0, 0.2, 1]},
        },
        'motion',
      ),
    ).toEqual({
      '--motion-springs-sheet-present': '0.6s 0.1',
      '--motion-springs-alert-present': '0.5s 0.15',
      '--motion-navigation-transition-ms': '300ms',
      '--motion-timing-curves-move': 'cubic-bezier(0.4, 0, 0.2, 1)',
    });
  });

  it('names the role in every refusal', () => {
    expect(() =>
      expandMotionRoles({springs: {sheet: {duration: 0.5, bounce: 0}}}, 'm'),
    ).toThrow(
      /m\.springs\["sheet"\]: a motion role is named by its table path/,
    );
    expect(() =>
      expandMotionRoles({durations: {'springs.sheetPresent': 300}}, 'm'),
    ).toThrow(/"springs\.sheetPresent" is a spring/);
    expect(() =>
      expandMotionRoles(
        {curves: {'timing.curves.exit': [1.5, 0, 1, 1]}},
        'm',
      ),
    ).toThrow(/m\.curves\["timing\.curves\.exit"\]: a curve's x1 and x2/);
    expect(() =>
      expandMotionRoles({durations: {'timing.press.flashMs': -5}}, 'm'),
    ).toThrow(/≥ 0/);
  });

  it('takes the duration scale whole or not at all', () => {
    expect(motionScaleOf({springs: {}}, 'motion')).toBeUndefined();
    expect(motionScaleOf({fast: 100, medium: 250, ratio: 0.8}, 'm')).toEqual({
      fast: 100,
      medium: 250,
      ratio: 0.8,
    });
    expect(() => motionScaleOf({fast: 100}, 'm')).toThrow(
      /`fast`, `medium`, and `ratio` together/,
    );
  });

  it('emits only the roles a theme sets, beside its scale', () => {
    const theme = defineTheme({
      name: 'soft-sheet',
      motion: {
        fast: 175,
        medium: 410,
        ratio: 0.75,
        springs: {'springs.sheetPresent': {duration: 0.6, bounce: 0.1}},
      },
    });
    expect(theme.tokens['--motion-springs-sheet-present']).toBe('0.6s 0.1');
    expect(theme.tokens['--duration-fast']).toBe('175ms');
    const motionTokens = Object.keys(theme.tokens).filter(name =>
      name.startsWith('--motion-'),
    );
    expect(motionTokens).toEqual(['--motion-springs-sheet-present']);
    expect(generateThemeCSS(theme).component).toContain(
      '--motion-springs-sheet-present: 0.6s 0.1',
    );
  });

  it('retunes roles alone, keeping an extended base theme\x27s scale', () => {
    const base = defineTheme({
      name: 'base',
      motion: {fast: 120, medium: 300, ratio: 0.75},
    });
    const child = defineTheme({
      name: 'child',
      extends: base,
      motion: {durations: {'navigation.transitionMs': 400}},
    });
    expect(child.tokens['--duration-fast']).toBe('120ms');
    expect(child.tokens['--motion-navigation-transition-ms']).toBe('400ms');
  });
});

describe('a theme written to spec:AST-094 FR4', () => {
  // FR4's role table: every role the record names, at its own default.
  const FR4_ROLES = {
    springs: {
      'springs.fingerTracking': {response: 0.15, dampingRatio: 0.86},
      'springs.emphasis': {duration: 0.5, bounce: 0.3},
      'springs.settle': {duration: 0.5, bounce: 0},
      'springs.quickChange': {duration: 0.5, bounce: 0.15},
      'springs.viewChange': {mass: 3, stiffness: 1000, damping: 500},
      'springs.timedChange': {duration: 0.5, bounce: 0},
      'springs.stateChange': {response: 0.55, dampingRatio: 1},
      'springs.directChange': {response: 0.5, dampingRatio: 0.825},
      'springs.menuOpen': {response: 0.32, dampingRatio: 0.8},
      'springs.menuClose': {response: 0.35, dampingRatio: 0.85},
      'springs.subMenuOpen': {response: 0.4, dampingRatio: 0.85},
      'springs.subMenuBack': {response: 0.4, dampingRatio: 1},
    },
    durations: {'timing.stateChangeMs': 250},
    curves: {
      'timing.curves.viewChange': [0.25, 0.1, 0.25, 1],
      'timing.curves.exit': [0.42, 0, 1, 1],
      'timing.curves.entrance': [0, 0, 0.58, 1],
      'timing.curves.move': [0.42, 0, 0.58, 1],
    },
  } as const;

  it('compiles every role the record names, one variable each', () => {
    const theme = defineTheme({name: 'fr4', motion: FR4_ROLES});
    const motionTokens = Object.keys(theme.tokens).filter(name =>
      name.startsWith('--motion-'),
    );
    expect(motionTokens).toHaveLength(17);
    expect(theme.tokens['--motion-springs-sub-menu-back']).toBe('0.4s 0');
    expect(theme.tokens['--motion-timing-curves-move']).toBe(
      'cubic-bezier(0.42, 0, 0.58, 1)',
    );
  });

  it('refuses keyboard motion, which follows the keyboard', () => {
    expect(() =>
      expandMotionRoles(
        {springs: {'springs.keyboard': {response: 0.5, dampingRatio: 1}}},
        'm',
      ),
    ).toThrow(/"springs\.keyboard" is not a motion role/);
    expect(() =>
      expandMotionRoles(
        {durations: {'timing.keyboardNotificationMs': 400}},
        'm',
      ),
    ).toThrow(/"timing\.keyboardNotificationMs" is not a motion role/);
  });
});

describe('motion roles in adaptation rules', () => {
  function adaptive(
    rules: NonNullable<NonNullable<DefineThemeInput['adaptations']>['rules']>,
  ) {
    return defineTheme({name: 'adaptive-motion', adaptations: {rules}});
  }

  it('needs no root motion axis for a rule that writes only roles', () => {
    expect(() =>
      adaptive([
        {
          when: {motion: 'reduce'},
          value: {
            motion: {durations: {'navigation.transitionMs': 250}},
          },
        },
      ]),
    ).not.toThrow();
    expect(() =>
      adaptive([{when: {motion: 'reduce'}, value: {motion: {fast: 100}}}]),
    ).toThrow(/must supply `fast`, `medium`, and `ratio`/);
  });

  it('refuses a platform condition, which adaptations do not have', () => {
    expect(() =>
      adaptive([
        {
          when: {platform: 'ios'} as never,
          value: {motion: {durations: {'navigation.transitionMs': 300}}},
        },
      ]),
    ).toThrow(/platform/);
  });
});
