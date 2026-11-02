// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSliderTouch.ts
 * @input The touch presentation's state (Slider.tsx), the slider's value
 *   model and parts; sliderTouchController.ts
 * @output Exports `useSliderTouch` (the React wiring), `SLIDER_HIT_ATTRIBUTE`
 *   and the `SliderTouchModel` and `SliderTouchParts` types
 * @position Internal to Slider: wires its touch presentation. The touch
 *   layer itself (the gesture recognizers, the animator and the UIKit tables)
 *   is sliderTouchController.ts, and this is its one import site, so a build
 *   can swap that module whole (a desktop build without the touch layer).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Slider/sliderTouchController.ts
 * - /packages/core/src/Slider/Slider.tsx (the state it returns)
 * - /packages/core/src/Slider/useSliderTouch.test.tsx
 */

import {useEffect, useRef, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  SliderTouchController,
  type SliderTouchModel,
  type SliderTouchParts,
} from './sliderTouchController';

export type {SliderTouchModel, SliderTouchParts} from './sliderTouchController';

/** Marks a thumb's touch target: an invisible square centered on the thumb. */
export const SLIDER_HIT_ATTRIBUTE = 'data-slider-hit';

export interface UseSliderTouchOptions {
  /** The slider is enabled: its gestures attach for every pointer (`spec:AST-094` FR43). */
  readonly isEnabled: boolean;
  readonly model: SliderTouchModel;
  readonly getParts: () => SliderTouchParts | null;
  /** Re-attaches when the thumbs or the orientation change. */
  readonly thumbCount: number;
  /**
   * Whether the thumbs' touch targets render (a coarse primary pointer):
   * the recognizers re-attach to them when they render or go.
   */
  readonly hasTouchTargets: boolean;
  /**
   * Whether each thumb renders inside its value tooltip: changing it mounts
   * new thumbs and touch targets, so the gestures re-attach.
   */
  readonly thumbsWrapped: boolean;
}

/**
 * Wires UISlider's tracking to a rendered Slider for every pointer. Returns
 * whether its gestures are attached (the slider is enabled); Slider's own
 * pointer handlers then take only a mouse press on the track.
 */
export function useSliderTouch({
  isEnabled,
  model,
  getParts,
  thumbCount,
  hasTouchTargets,
  thumbsWrapped,
}: UseSliderTouchOptions): boolean {
  const getPartsRef = useRef(getParts);
  // Keeps the parts getter current for the controller, which reads it from
  // gesture callbacks outside React's render.
  useIsomorphicLayoutEffect(() => {
    getPartsRef.current = getParts;
  });
  const [controller] = useState(
    () => new SliderTouchController(model, () => getPartsRef.current()),
  );
  // Hands the controller this render's model: the values and callbacks it
  // reads from gesture callbacks outside React's render.
  useIsomorphicLayoutEffect(() => {
    controller.setModel(model);
  });
  const {isHorizontal} = model;
  // Synchronizes the thumbs with the document's gesture host: their
  // PressTrackers and pans attach (to the touch targets where they render)
  // while the slider is enabled, and detach (ending any interaction
  // silently) when it is disabled or the thumbs or their touch targets
  // change.
  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }
    return controller.attach();
  }, [
    controller,
    isEnabled,
    hasTouchTargets,
    thumbCount,
    isHorizontal,
    thumbsWrapped,
  ]);
  // Releases the controller's animators and gesture host listeners on
  // unmount.
  useEffect(() => () => controller.dispose(), [controller]);
  return isEnabled;
}
