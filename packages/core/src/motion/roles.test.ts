// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roles.test.ts
 * @input roles.ts and the shared UIKit tables (registered on import)
 * @output Proof that each spring, duration and curve of a registered table is
 *   a role named by its path, that non-motion values are not, and that a
 *   role's CSS value reads back as the same motion
 * @position Testing for /packages/core/src/motion/roles.ts
 */

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  formatMotionRoleValue,
  isMotionRoleId,
  listMotionRoles,
  motionRoleIn,
  motionRoleOf,
  motionRoleVariable,
  parseMotionRoleValue,
  registerMotionTable,
} from './roles';
import {dampingRatioOf, naturalFrequency, toSpring} from './spring';
import {navigation, scroll, springs, timing} from './uikit';
import {
  motionTableFiles,
  REGISTER_EXPORT,
} from '../../../../scripts/motion-table-files.mjs';

// Every table the role list is generated from, registered the way the
// generator does: through each module's register<Name>Table.
for (const file of motionTableFiles(resolve(__dirname, '..'))) {
  const module = (await import(file)) as Record<string, unknown>;
  for (const [name, value] of Object.entries(module)) {
    if (REGISTER_EXPORT.test(name) && typeof value === 'function') {
      (value as () => void)();
    }
  }
}
// The tables that discovery registered, before any test adds a fixture.
const DISCOVERED = new Set(
  listMotionRoles().map(role => role.id.split('.')[0]),
);

describe('motion roles', () => {
  it('names a role by its table path, and its CSS variable in kebab case', () => {
    expect(isMotionRoleId('sheet.present')).toBe(true);
    expect(isMotionRoleId('timing.curves.move')).toBe(true);
    expect(isMotionRoleId('sheet')).toBe(false);
    expect(isMotionRoleId('Sheet.present')).toBe(false);
    expect(motionRoleVariable('springs.sheetDetent')).toBe(
      '--motion-springs-sheet-detent',
    );
    expect(motionRoleVariable('timing.curves.move')).toBe(
      '--motion-timing-curves-move',
    );
    expect(() => motionRoleVariable('sheet')).toThrow(/dotted table path/);
  });

  it('leaves a table value FR4 does not name an internal constant', () => {
    const shared = {response: 0.4, dampingRatio: 0.9};
    const table = {
      present: shared,
      dismiss: shared,
      fadeMs: 200,
      curves: {out: [0, 0, 0.58, 1] as const},
    };
    registerMotionTable('fixture', table);
    // No role, no CSS variable, and the table is untouched.
    expect(motionRoleOf(table.present)).toBeUndefined();
    expect(table.dismiss).toBe(table.present);
    expect(motionRoleIn(table, 'fadeMs')).toBeUndefined();
    expect(motionRoleOf(table.curves.out)).toBeUndefined();
    expect(listMotionRoles().some(role => role.id.startsWith('fixture.'))).toBe(
      false,
    );
  });

  it('has exactly the roles spec:AST-094 FR4 names', () => {
    const spec = readFileSync(
      resolve(
        __dirname,
        '../../../../docs/specs/AST-094-touch-presentations/spec.md',
      ),
      'utf8',
    );
    const fr4 = spec.slice(spec.indexOf('**FR4'), spec.indexOf('**FR5'));
    const named = [...fr4.matchAll(/^\s*\| `([a-z][\w.]*)`\s*\|/gm)].map(
      match => match[1],
    );
    expect(named.length).toBeGreaterThan(0);
    // Every table registered, the roles are exactly FR4's (other tests
    // here register a fixture, which lists none).
    expect(new Set(listMotionRoles().map(role => role.id))).toEqual(
      new Set(named),
    );
  });

  it('names the shared roles for their use, as spec:AST-094 FR4 does', () => {
    expect(
      [
        springs.fingerTracking,
        springs.emphasis,
        springs.settle,
        springs.quickChange,
        springs.viewChange,
        springs.timedChange,
        springs.stateChange,
        springs.directChange,
        springs.menuOpen,
        springs.menuClose,
        timing.curves.viewChange,
        timing.curves.exit,
        timing.curves.entrance,
        timing.curves.move,
      ].map(leaf => motionRoleOf(leaf)?.id),
    ).toEqual([
      'springs.fingerTracking',
      'springs.emphasis',
      'springs.settle',
      'springs.quickChange',
      'springs.viewChange',
      'springs.timedChange',
      'springs.stateChange',
      'springs.directChange',
      'springs.menuOpen',
      'springs.menuClose',
      'timing.curves.viewChange',
      'timing.curves.exit',
      'timing.curves.entrance',
      'timing.curves.move',
    ]);
    expect(motionRoleIn(timing, 'stateChangeMs')?.id).toBe(
      'timing.stateChangeMs',
    );
    // A preset or curve-shape name is no role id.
    for (const old of [
      'springs.smooth',
      'springs.bouncy',
      'timing.curves.easeInOut',
      'timing.implicitAnimationMs',
    ]) {
      expect(listMotionRoles().map(role => role.id)).not.toContain(old);
    }
  });

  it("leaves the keyboard's motion out: it rides the keyboard (FR4)", () => {
    expect(motionRoleOf(springs.keyboard)).toBeUndefined();
    expect(motionRoleIn(timing, 'keyboardNotificationMs')).toBeUndefined();
  });

  it('refuses a spring that never settles', () => {
    expect(() =>
      formatMotionRoleValue('spring', {duration: 0.5, bounce: 1}),
    ).toThrow(/must settle/);
    expect(() =>
      formatMotionRoleValue('spring', {response: 0.5, dampingRatio: 0}),
    ).toThrow(/must settle/);
    expect(parseMotionRoleValue('spring', '0.5s 1')).toBeNull();
  });

  it('makes the roles of the shared tables, and keeps every other value internal', () => {
    expect(motionRoleOf(springs.viewChange)?.id).toBe('springs.viewChange');
    expect(motionRoleOf(timing.curves.move)?.kind).toBe('curve');
    expect(motionRoleIn(timing, 'stateChangeMs')?.kind).toBe('duration');
    // A component's measured value is an internal constant, not a role.
    expect(motionRoleOf(springs.sheetPresent)).toBeUndefined();
    expect(springs.sheetPresent).toEqual(springs.viewChange);
    expect(motionRoleOf(scroll.bounce)).toBeUndefined();
    expect(motionRoleIn(timing.press, 'flashMs')).toBeUndefined();
    expect(motionRoleIn(navigation, 'transitionMs')).toBeUndefined();
    // The Reduced Motion fade, UIKit's menu spring under Reduce Motion, the
    // thresholds and the arbitration timings are not motion roles either.
    expect(motionRoleIn(timing, 'reducedMotionCrossFadeMs')).toBeUndefined();
    expect(motionRoleOf(springs.menuReducedMotion)).toBeUndefined();
    expect(motionRoleIn(timing.press, 'scrollBrakeMs')).toBeUndefined();
    expect(motionRoleIn(scroll, 'delaysContentTouchesMs')).toBeUndefined();
    expect(motionRoleIn(navigation, 'parallax')).toBeUndefined();
    const ids = listMotionRoles().map(role => role.id);
    expect(ids.some(id => id.startsWith('gestures.'))).toBe(false);
    // Every role has its own CSS variable.
    const variables = listMotionRoles().map(role => role.variable);
    expect(new Set(variables).size).toBe(variables.length);
  });

  it('registers exactly the roles spec:AST-094 FR4 names, internally', () => {
    // Every table discovery registered (other tests here add fixtures).
    const discovered = listMotionRoles().filter(role =>
      DISCOVERED.has(role.id.split('.')[0]),
    );
    expect(
      Object.fromEntries(discovered.map(role => [role.id, role.kind])),
    ).toEqual({
      'springs.directChange': 'spring',
      'springs.emphasis': 'spring',
      'springs.fingerTracking': 'spring',
      'springs.menuClose': 'spring',
      'springs.menuOpen': 'spring',
      'springs.quickChange': 'spring',
      'springs.settle': 'spring',
      'springs.stateChange': 'spring',
      'springs.subMenuBack': 'spring',
      'springs.subMenuOpen': 'spring',
      'springs.timedChange': 'spring',
      'springs.viewChange': 'spring',
      'timing.curves.entrance': 'curve',
      'timing.curves.exit': 'curve',
      'timing.curves.move': 'curve',
      'timing.curves.viewChange': 'curve',
      'timing.stateChangeMs': 'duration',
    });
  });

  it('writes every table value in CSS form and reads back the same motion', () => {
    for (const role of listMotionRoles()) {
      const text = formatMotionRoleValue(role.kind, role.value);
      const back = parseMotionRoleValue(role.kind, text);
      expect(back, `${role.id}: ${text}`).not.toBeNull();
      if (role.kind === 'spring') {
        const a = toSpring(role.value as Parameters<typeof toSpring>[0]);
        const b = toSpring(back as Parameters<typeof toSpring>[0]);
        expect(naturalFrequency(b) / naturalFrequency(a)).toBeCloseTo(1, 5);
        expect(dampingRatioOf(b)).toBeCloseTo(dampingRatioOf(a), 5);
      } else {
        expect(back).toEqual(role.value);
      }
    }
    expect(
      formatMotionRoleValue('spring', {response: 0.5, dampingRatio: 0.85}),
    ).toBe('0.5s 0.15');
    expect(formatMotionRoleValue('duration', 250)).toBe('250ms');
    expect(formatMotionRoleValue('curve', [0.42, 0, 0.58, 1])).toBe(
      'cubic-bezier(0.42, 0, 0.58, 1)',
    );
  });

  it('refuses invalid values and reads malformed CSS as unset', () => {
    expect(() => formatMotionRoleValue('duration', -1)).toThrow(/≥ 0/);
    expect(() => formatMotionRoleValue('curve', [2, 0, 0.5, 1])).toThrow(
      /x1 and x2/,
    );
    expect(() => formatMotionRoleValue('spring', {response: 0.5})).toThrow(
      /spring is/,
    );
    expect(parseMotionRoleValue('spring', '')).toBeNull();
    expect(parseMotionRoleValue('spring', 'fast')).toBeNull();
    expect(parseMotionRoleValue('spring', '0.4s 0.2')).toEqual({
      duration: 0.4,
      bounce: 0.2,
    });
    expect(parseMotionRoleValue('duration', ' 0.3s ')).toBe(300);
    expect(parseMotionRoleValue('curve', 'ease-in')).toBeNull();
  });
});
