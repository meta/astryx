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
    const hook = await import('../gestures/useGestureRecognizer');
    const presentation = await import('../utils/touchPresentation');
    const direction = await import('../hooks/isRtlElement');
    const focusMoves = await import('../utils/claimFocusMoves');
    const animator = await import('../motion/animator');
    const bezier = await import('../motion/bezier');
    const uikitTiming = await import('../motion/uikit/timing');
    expect(entry.useGestureRecognizer).toBe(hook.useGestureRecognizer);
    expect(entry.useTouchPresentation).toBe(presentation.useTouchPresentation);
    expect(entry.isRtlElement).toBe(direction.isRtlElement);
    expect(entry.claimFocusMoves).toBe(focusMoves.claimFocusMoves);
    expect(entry.createMotionAnimator).toBe(animator.createAnimator);
    expect(entry.cubicBezier).toBe(bezier.cubicBezier);
    expect(entry.timing).toBe(uikitTiming.timing);
    // No internal factory shares a public factory's name
    // (architecture:react-component-runtime INV13, spec:AST-107 FR6).
    for (const name of [
      'createAnimator',
      'createPanGesture',
      'createDragToSnapPoints',
    ]) {
      expect(entry, name).not.toHaveProperty(name);
    }
    // Named re-exports only: no gathering object a component would carry
    // whole (architecture:component-style-authoring INV6).
    expect(entry).not.toHaveProperty('touchModule');
  });

  it('re-exports the pan recognizer, the press tracker, the action-group tracker, the finger-scroll reader, the selection lock, the touch query, the rubber band and UIKit gesture values by name', async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const modules: Record<string, Record<string, unknown>> = {
      PanGestureRecognizer: await import('../gestures/PanGestureRecognizer'),
      useFingerScroll: await import('../gestures/useFingerScroll'),
      usePressTracker: await import('../gestures/usePressTracker'),
      createActionGroupTracker: await import('../hooks/actionGroupTracker'),
      lockSelection: await import('../utils/selectionLock'),
      TOUCH_QUERY: await import('../utils/touchQueries'),
      rubberBand: await import('../motion/rubberBand'),
      UIKIT_GESTURES: await import('../motion/uikit/gestures'),
    };
    for (const [name, module] of Object.entries(modules)) {
      expect(entry[name], name).toBe(module[name]);
    }
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
