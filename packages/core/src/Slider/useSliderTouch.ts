// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSliderTouch.ts
 * @input Slider's value model and parts, and sliderTouchController.ts
 * @output Exports `useSliderTouch` (the React wiring) and the
 *   `SliderTouchModel` and `SliderTouchParts` types
 * @position Internal to Slider. It is the touch layer's one import site, so
 *   a desktop build can swap that module whole.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Slider/sliderTouchController.ts
 * - /packages/core/src/Slider/Slider.tsx (the model and the parts)
 * - /packages/core/src/Slider/useSliderTouch.test.tsx
 */

import {useEffect, useState} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  SliderTouchController,
  type SliderTouchModel,
  type SliderTouchParts,
} from './sliderTouchController';

export type {SliderTouchModel, SliderTouchParts} from './sliderTouchController';

export interface UseSliderTouchOptions {
  /** The slider is enabled: its gestures attach for every pointer. */
  readonly isEnabled: boolean;
  readonly model: SliderTouchModel;
  readonly getParts: () => SliderTouchParts | null;
  /** Re-attaches when the thumbs or the orientation change. */
  readonly thumbCount: number;
  /**
   * Whether each thumb renders inside its value tooltip: changing it mounts
   * new thumbs. So the gestures re-attach.
   */
  readonly thumbsWrapped: boolean;
}

/**
 * Wires UISlider's tracking to a rendered Slider for every pointer, while it
 * is enabled. Slider's own pointer handlers then take only a mouse press on
 * the track.
 */
export function useSliderTouch({
  isEnabled,
  model,
  getParts,
  thumbCount,
  thumbsWrapped,
}: UseSliderTouchOptions): void {
  // The parts getter reads only refs. So the first one stays current.
  const [controller] = useState(
    () => new SliderTouchController(model, getParts),
  );
  // Hands the controller this render's model: the values and callbacks it
  // reads from gesture callbacks outside React's render.
  useIsomorphicLayoutEffect(() => {
    controller.setModel(model);
  });
  const {isHorizontal} = model;
  // Synchronizes the thumbs with the document's gesture host. Their
  // PressTrackers and pans attach while the slider is enabled. They detach,
  // ending any interaction silently, when it is disabled or the thumbs
  // change.
  useEffect(() => {
    if (!isEnabled) {
      return undefined;
    }
    return controller.attach();
  }, [controller, isEnabled, thumbCount, isHorizontal, thumbsWrapped]);
  // Releases the controller's animators and gesture host listeners on
  // unmount.
  useEffect(() => () => controller.dispose(), [controller]);
}
