// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file roles.test.ts
 * @input roles.ts and the shared UIKit tables (registered on import)
 * @output Proof that each spring, duration and curve of a registered table is
 *   a role named by its path, that non-motion values are not, and that a
 *   role's CSS value reads back as the same motion
 * @position Testing for /packages/core/src/motion/roles.ts
 */

import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {MOTION_ROLE_KINDS} from './roleKinds.generated';
import {
  formatMotionRoleValue,
  isMotionRoleId,
  listMotionRoles,
  motionRole,
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
    expect(isMotionRoleId('timing.curves.easeInOut')).toBe(true);
    expect(isMotionRoleId('sheet')).toBe(false);
    expect(isMotionRoleId('Sheet.present')).toBe(false);
    expect(motionRoleVariable('springs.sheetDetent')).toBe(
      '--motion-springs-sheet-detent',
    );
    expect(motionRoleVariable('timing.curves.easeInOut')).toBe(
      '--motion-timing-curves-ease-in-out',
    );
    expect(() => motionRoleVariable('sheet')).toThrow(/dotted table path/);
  });

  it('registers springs, …Ms durations and curves, skipping exclusions and other numbers', () => {
    const shared = {response: 0.4, dampingRatio: 0.9};
    const table = {
      present: shared,
      dismiss: shared,
      fadeMs: 200,
      holdMs: 150,
      threshold: 48,
      curves: {out: [0, 0, 0.58, 1] as const},
    };
    registerMotionTable('fixture', table, {exclude: ['holdMs']});
    expect(motionRoleOf(table.present)?.id).toBe('fixture.present');
    // A shared object becomes one copy per role, equal in value.
    expect(table.dismiss).not.toBe(table.present);
    expect(table.dismiss).toEqual(shared);
    expect(motionRoleOf(table.dismiss)?.id).toBe('fixture.dismiss');
    expect(motionRoleIn(table, 'fadeMs')).toMatchObject({
      id: 'fixture.fadeMs',
      kind: 'duration',
      variable: '--motion-fixture-fade-ms',
    });
    expect(motionRoleIn(table, 'holdMs')).toBeUndefined();
    expect(motionRoleIn(table, 'threshold')).toBeUndefined();
    expect(motionRoleOf(table.curves.out)).toMatchObject({
      id: 'fixture.curves.out',
      kind: 'curve',
    });
    expect(motionRoleIn(table.curves, 'out')?.id).toBe('fixture.curves.out');
  });

  it('makes the shared tables roles, without their thresholds and arbitration timings', () => {
    expect(motionRoleOf(springs.sheetPresent)?.id).toBe('springs.sheetPresent');
    expect(motionRoleOf(springs.uikitDefault)?.id).toBe('springs.uikitDefault');
    expect(springs.sheetPresent).toEqual(springs.uikitDefault);
    expect(motionRoleOf(scroll.bounce)?.kind).toBe('spring');
    expect(motionRoleOf(timing.curves.easeInOut)?.kind).toBe('curve');
    expect(motionRoleIn(timing.press, 'flashMs')?.kind).toBe('duration');
    // The Reduced Motion fade is not a role: no theme lengthens it.
    expect(motionRoleIn(timing, 'reducedMotionCrossFadeMs')).toBeUndefined();
    // Nor is UIKit's menu spring under Reduce Motion: nothing springs under
    // reduced motion (design:reduced-motion DR1).
    expect(motionRoleIn(springs, 'menuReducedMotion')).toBeUndefined();
    expect(motionRoleIn(navigation, 'transitionMs')?.id).toBe(
      'navigation.transitionMs',
    );
    expect(motionRoleIn(timing.press, 'scrollBrakeMs')).toBeUndefined();
    expect(motionRoleIn(scroll, 'delaysContentTouchesMs')).toBeUndefined();
    expect(motionRoleIn(navigation, 'parallax')).toBeUndefined();
    expect(motionRole('springs.navigationPush')?.value).toBe(
      springs.navigationPush,
    );
    const ids = listMotionRoles().map(role => role.id);
    expect(ids).toContain('scroll.bounce');
    expect(ids.some(id => id.startsWith('gestures.'))).toBe(false);
    // Every role has its own CSS variable.
    const variables = listMotionRoles().map(role => role.variable);
    expect(new Set(variables).size).toBe(variables.length);
  });

  it('lists every registered role, and its kind, in the generated role kinds', () => {
    // Every table discovery registered (other tests here add fixtures).
    const discovered = listMotionRoles().filter(role =>
      DISCOVERED.has(role.id.split('.')[0]),
    );
    expect(
      Object.fromEntries(discovered.map(role => [role.id, role.kind])),
    ).toEqual(MOTION_ROLE_KINDS);
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
