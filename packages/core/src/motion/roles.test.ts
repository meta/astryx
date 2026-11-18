// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roles.test.ts
 * @input roles.ts and the shared UIKit tables (registered by this test)
 * @output Proof that the registered roles are every role spec:AST-094 FR4
 *   names plus the ones the generated motion role table lists, each by its
 *   table path and each named by FR4 or a component's own record (DEC-5);
 *   that the generated table is in step with the registered tables; that
 *   every other table value, a component's measured spring included, is no
 *   role; and that a role's CSS value reads back as the same motion
 * @position Testing for /packages/core/src/motion/roles.ts
 */

import {spawnSync} from 'node:child_process';
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
  parseCssEasing,
  parseMotionRoleValue,
  registerMotionTable,
} from './roles';
import {dampingRatioOf, naturalFrequency, toSpring} from './spring';
import {navigation, scroll, springs, timing} from './uikit';
import {
  motionTableFiles,
  REGISTER_EXPORT,
} from '../../../../scripts/motion-table-files.mjs';
import {
  fr4RoleIds,
  MOTION_ROLE_TABLE,
  tableRoleIds,
} from '../../../../scripts/motion-roles-table.mjs';

const ROOT = resolve(__dirname, '../../../..');

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
/** The roles of the tables discovery registered (tests here add fixtures). */
const discoveredRoles = () =>
  listMotionRoles().filter(role => DISCOVERED.has(role.id.split('.')[0]));

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

  it('has every role spec:AST-094 FR4 names, and exactly the roles the generated motion role table lists', () => {
    const named = fr4RoleIds(
      readFileSync(
        resolve(ROOT, 'docs/specs/AST-094-touch-presentations/spec.md'),
        'utf8',
      ),
    );
    expect(named.length).toBeGreaterThan(0);
    const registered = new Set(discoveredRoles().map(role => role.id));
    for (const id of named) {
      expect(registered.has(id), id).toBe(true);
    }
    // FR4's roles and the ones a component's record measures (DEC-5).
    expect(registered).toEqual(
      new Set(
        tableRoleIds(readFileSync(resolve(ROOT, MOTION_ROLE_TABLE), 'utf8')),
      ),
    );
  });

  it('keeps the generated motion role table in step with the registered tables, each role named by FR4 or a component record (spec:AST-094 DEC-5)', () => {
    // The generator registers every table itself, in its own Node process:
    // it reads the knowledge records, which this environment cannot load.
    const run = spawnSync(
      process.execPath,
      [resolve(ROOT, 'scripts/generate-motion-roles.mjs'), '--check'],
      {cwd: ROOT, encoding: 'utf8'},
    );
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
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
    // Nor is the keyboard's motion: it rides the keyboard's own spring and
    // notification duration, not a role (spec:AST-094 FR4).
    expect(motionRoleIn(springs, 'keyboard')).toBeUndefined();
    expect(motionRoleIn(timing, 'keyboardNotificationMs')).toBeUndefined();
    expect(motionRoleIn(timing.press, 'scrollBrakeMs')).toBeUndefined();
    expect(motionRoleIn(scroll, 'delaysContentTouchesMs')).toBeUndefined();
    expect(motionRoleIn(navigation, 'parallax')).toBeUndefined();
    const ids = listMotionRoles().map(role => role.id);
    expect(ids.some(id => id.startsWith('gestures.'))).toBe(false);
    // Every role has its own CSS variable.
    const variables = listMotionRoles().map(role => role.variable);
    expect(new Set(variables).size).toBe(variables.length);
  });

  it('registers the roles spec:AST-094 FR4 names internally, each of its kind', () => {
    expect(
      Object.fromEntries(discoveredRoles().map(role => [role.id, role.kind])),
    ).toMatchObject({
      'segmented.selectionSpring': 'spring',
      'springs.contextMenuDismiss': 'spring',
      'springs.contextMenuLift': 'spring',
      'springs.contextMenuMorph': 'spring',
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
    // A spring with no damping never settles.
    for (const never of [
      {duration: 0.5, bounce: 1},
      {duration: 0.5, bounce: 1.5},
      {response: 0.5, dampingRatio: 0},
      {mass: 1, stiffness: 100, damping: 0},
    ]) {
      expect(() => formatMotionRoleValue('spring', never)).toThrow(
        /must settle/,
      );
    }
    expect(parseMotionRoleValue('spring', '0.5s 1')).toBeNull();
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

describe('parseCssEasing', () => {
  it('reads a keyword as the control points CSS gives it, and a cubic-bezier() as a curve role does', () => {
    expect(parseCssEasing('linear')).toEqual([0, 0, 1, 1]);
    expect(parseCssEasing(' ease-out ')).toEqual([0, 0, 0.58, 1]);
    expect(parseCssEasing('cubic-bezier(0.24, 1, 0.4, 1)')).toEqual([
      0.24, 1, 0.4, 1,
    ]);
  });

  it('gives null for an easing it cannot read as one curve', () => {
    expect(parseCssEasing('steps(4)')).toBeNull();
    expect(parseCssEasing('')).toBeNull();
    expect(parseCssEasing('cubic-bezier(2, 0, 0.5, 1)')).toBeNull();
  });
});
