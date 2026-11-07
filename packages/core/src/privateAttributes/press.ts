// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/press.ts
 * @input None.
 * @output `PRESS_BELIEVED_SELECTOR`, which matches an element while the press
 *   controller believes a press on it, inside it, or around it.
 * @position Owner module of the private press attribute. The press controller
 *   (utils/pressFeedback.ts) writes the attribute. Its `.stylex.ts` sibling
 *   writes the styles that read it, and the theme engine (theme/) builds a
 *   themed press on this selector. No package entry exports it.
 */

const PRESS_ON = '[data-astryx-press="on"]';

/**
 * The controller marks the pressable element only, which can be a wrapper of
 * the themed element or sit inside it. Each argument has the specificity of
 * one attribute, as `:active` has one pseudo-class.
 */
export const PRESS_BELIEVED_SELECTOR = `:is(${PRESS_ON}, ${PRESS_ON} *, :has(${PRESS_ON}))`;
