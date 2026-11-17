// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file opacityFloor.ts
 * @input None
 * @output Exports `ENTRANCE_OPACITY_FLOOR`
 * @position A motion constant for entrances that fade in from transparent as
 *   Web Animations
 *
 * Chromium skips drawing a layer at exactly opacity 0 as its animation starts.
 * It rasterizes the layer again once the fade makes it visible, so the first
 * frames show the layer without its content. An entrance that fades in from
 * this floor draws its start frame. The floor is a quarter of one step of an
 * 8-bit channel, so it changes no pixel.
 */

/** The lowest opacity a compositor entrance fades in from. */
export const ENTRANCE_OPACITY_FLOOR = 0.001;
