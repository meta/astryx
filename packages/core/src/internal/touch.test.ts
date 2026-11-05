// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch.test.ts
 * @input The internal `internal/touch` entry and the gesture core
 * @output INV13's entry checks: the entry re-exports the gesture core's
 *   primitives by name, the same values a Core component imports by path, and
 *   no gathering object; importing it attaches no window or document
 *   listeners, so a page with only a fine pointer runs none (`spec:AST-094`
 *   FR19, FR24)
 * @position Unit tests of packages/core/src/internal/touch.ts
 *   (architecture:react-component-runtime INV13)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('internal/touch', () => {
  it('re-exports the gesture core by name, the same values Core imports by path', async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const arena = await import('../gestures/GestureArena');
    const recognizer = await import('../gestures/GestureRecognizer');
    expect(entry.GestureArena).toBe(arena.GestureArena);
    expect(entry.GestureRecognizer).toBe(recognizer.GestureRecognizer);
    for (const name of ['TapGestureRecognizer', 'LongPressGestureRecognizer']) {
      expect(typeof entry[name], name).toBe('function');
    }
    // Named re-exports only: no gathering object a component would carry
    // whole (architecture:component-style-authoring INV6).
    expect(entry).not.toHaveProperty('touchModule');
  });

  it("re-exports by name what Lab's useRefreshControl reads", async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const pan = await import('../gestures/PanGestureRecognizer');
    const hook = await import('../gestures/useGestureRecognizer');
    const animator = await import('../motion/animator');
    const bezier = await import('../motion/bezier');
    const progress = await import('../motion/progress');
    const roles = await import('../motion/roles');
    const band = await import('../motion/rubberBand');
    const scroll = await import('../motion/uikit/scroll');
    expect(entry.PanGestureRecognizer).toBe(pan.PanGestureRecognizer);
    expect(entry.useGestureRecognizer).toBe(hook.useGestureRecognizer);
    expect(entry.createMotionAnimator).toBe(animator.createMotionAnimator);
    expect(entry.cubicBezier).toBe(bezier.cubicBezier);
    expect(entry.mapProgress).toBe(progress.mapProgress);
    expect(entry.parseCssEasing).toBe(roles.parseCssEasing);
    expect(entry.parseMotionRoleValue).toBe(roles.parseMotionRoleValue);
    expect(entry.rubberBand).toBe(band.rubberBand);
    expect(entry.rubberBandInverse).toBe(band.rubberBandInverse);
    expect(entry.rubberBandSlope).toBe(band.rubberBandSlope);
    expect(entry.scroll).toBe(scroll.scroll);
    // No internal factory shares a public factory's name.
    expect(entry).not.toHaveProperty('createAnimator');
  });

  it('attaches no window or document listeners when it loads', async () => {
    vi.resetModules();
    const onWindow = vi.spyOn(window, 'addEventListener');
    const onDocument = vi.spyOn(document, 'addEventListener');
    await import('./touch');
    expect(onWindow).not.toHaveBeenCalled();
    expect(onDocument).not.toHaveBeenCalled();
  });
});
