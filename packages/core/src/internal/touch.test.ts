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
    expect(entry.createMotionEngine).toBe(animator.createMotionEngine);
    expect(entry.cubicBezier).toBe(bezier.cubicBezier);
    expect(entry.mapProgress).toBe(progress.mapProgress);
    expect(entry.parseCssEasing).toBe(roles.parseCssEasing);
    expect(entry.parseMotionRoleValue).toBe(roles.parseMotionRoleValue);
    expect(entry.rubberBand).toBe(band.rubberBand);
    expect(entry.rubberBandInverse).toBe(band.rubberBandInverse);
    expect(entry.rubberBandSlope).toBe(band.rubberBandSlope);
    expect(entry.scroll).toBe(scroll.scroll);
    // No internal factory shares a public factory's name, or a planned one's.
    for (const name of [
      'createAnimator',
      'createPanGesture',
      'createDragToSnapPoints',
    ]) {
      expect(entry, name).not.toHaveProperty(name);
    }
  });

  it('re-exports by name what other Lab components read', async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const presentation = await import('../utils/touchPresentation');
    const direction = await import('../hooks/isRtlElement');
    const uikitGestures = await import('../motion/uikit/gestures');
    const touchQueries = await import('../utils/touchQueries');
    expect(entry.useTouchPresentation).toBe(presentation.useTouchPresentation);
    expect(entry.isRtlElement).toBe(direction.isRtlElement);
    expect(entry.UIKIT_GESTURES).toBe(uikitGestures.UIKIT_GESTURES);
    expect(entry.TOUCH_QUERY).toBe(touchQueries.TOUCH_QUERY);
    // An identity check passes when both sides are undefined, so each name
    // must also be defined.
    for (const name of ['useTouchPresentation', 'isRtlElement']) {
      expect(typeof entry[name], name).toBe('function');
    }
    for (const name of ['UIKIT_GESTURES', 'TOUCH_QUERY']) {
      expect(entry[name], name).toBeDefined();
    }
  });

  it('re-exports by name the finger-scroll watch Lab components read', async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const fingerScroll = await import('../gestures/useFingerScroll');
    expect(entry.useFingerScroll).toBe(fingerScroll.useFingerScroll);
    expect(typeof entry.useFingerScroll).toBe('function');
  });

  it("re-exports by name what Lab's NavigationStack reads", async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const edgePan = await import('../gestures/ScreenEdgePanGestureRecognizer');
    const resolver = await import('../motion/resolveMotion');
    const spring = await import('../motion/spring');
    const uikitNavigation = await import('../motion/uikit/navigation');
    const uikitSprings = await import('../motion/uikit/springs');
    const focusReturn = await import('../utils/focusReturn');
    const modality = await import('../utils/interactionModality');
    expect(entry.ScreenEdgePanGestureRecognizer).toBe(
      edgePan.ScreenEdgePanGestureRecognizer,
    );
    expect(entry.resolveMotion).toBe(resolver.resolveMotion);
    expect(entry.solveSpring).toBe(spring.solveSpring);
    expect(entry.toSpring).toBe(spring.toSpring);
    expect(entry.navigation).toBe(uikitNavigation.navigation);
    for (const name of [
      'NAVIGATION_PUSH_SPRING',
      'NAVIGATION_POP_SPRING',
      'NAVIGATION_INTERACTIVE_POP_FINISH_SPRING',
      'NAVIGATION_BAR_ELEMENTS_SPRING',
    ] as const) {
      expect(entry[name], name).toBe(uikitSprings[name]);
      expect(entry[name], name).toBeDefined();
    }
    // Only the navigation rows: the whole springs table stays out.
    expect(entry).not.toHaveProperty('springs');
    expect(entry.focusForLastInput).toBe(focusReturn.focusForLastInput);
    expect(entry.isFocusLost).toBe(focusReturn.isFocusLost);
    expect(entry.prepareFocusReturnOnRemoval).toBe(
      focusReturn.prepareFocusReturnOnRemoval,
    );
    expect(entry.useInteractionModalityTracking).toBe(
      modality.useInteractionModalityTracking,
    );
    for (const name of [
      'ScreenEdgePanGestureRecognizer',
      'resolveMotion',
      'solveSpring',
      'toSpring',
      'focusForLastInput',
      'isFocusLost',
      'useInteractionModalityTracking',
    ]) {
      expect(typeof entry[name], name).toBe('function');
    }
    expect(entry.navigation).toBeDefined();
  });

  it("re-exports by name what Lab's PageControl also reads", async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const animator = await import('../motion/animator');
    const reduced = await import('../motion/reducedMotion');
    const hitArea = await import('../utils/touchHitArea');
    const hitAreaStyles = await import('./touchHitArea.stylex');
    expect(entry.animatorFor).toBe(animator.animatorFor);
    expect(entry.reducedMotionFade).toBe(reduced.reducedMotionFade);
    expect(entry.useTouchHitArea).toBe(hitArea.useTouchHitArea);
    expect(entry.touchHitAreaStyles).toBe(hitAreaStyles.touchHitAreaStyles);
    // An identity check passes when both sides are undefined, so each name
    // must also be defined.
    for (const name of [
      'animatorFor',
      'reducedMotionFade',
      'useTouchHitArea',
    ]) {
      expect(typeof entry[name], name).toBe('function');
    }
    expect(entry.touchHitAreaStyles).toBeDefined();
  });

  it("re-exports by name what NavigationStack's bars and scroll edge effect read", async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const host = await import('../gestures/GestureHost');
    const pointer = await import('../utils/coarsePointer');
    const fingerScroll = await import('../gestures/useFingerScroll');
    expect(entry.getGestureHost).toBe(host.getGestureHost);
    expect(entry.isCoarsePointer).toBe(pointer.isCoarsePointer);
    expect(entry.useFingerScroll).toBe(fingerScroll.useFingerScroll);
    for (const name of [
      'getGestureHost',
      'isCoarsePointer',
      'useFingerScroll',
    ]) {
      expect(typeof entry[name], name).toBe('function');
    }
  });

  it('re-exports the action-group tracking hook by name', async () => {
    const entry: Record<string, unknown> = await import('./touch');
    // Identity alone passes when both sides are undefined.
    expect(typeof entry.useActionGroupTracking).toBe('function');
    const modules: Record<string, Record<string, unknown>> = {
      useActionGroupTracking: await import('../hooks/useActionGroupTracking'),
    };
    for (const [name, module] of Object.entries(modules)) {
      expect(entry[name], name).toBe(module[name]);
    }
  });

  it("re-exports by name the scroll test Lab's TabBar reads", async () => {
    const entry: Record<string, unknown> = await import('./touch');
    const geometry = await import('../hooks/scrollGeometry');
    // Identity alone passes when both sides are undefined.
    expect(typeof entry.measureLogicalScrollAxis).toBe('function');
    expect(entry.measureLogicalScrollAxis).toBe(
      geometry.measureLogicalScrollAxis,
    );
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
