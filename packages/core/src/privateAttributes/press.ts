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
// The public pressable marker (`utils/pressFeedback.ts` PRESSABLE_ATTRIBUTE).
// The theme engine cannot import that runtime module.
const PRESSABLE = '[data-astryx-pressable]';

/**
 * The controller marks the innermost pressable element only. That element can
 * wrap the themed element (Switch's row) or sit inside it. The selector
 * matches the marked element, its descendants up to a nested pressable, and a
 * non-pressable element around it. A pressable row therefore does not paint
 * the controls inside it, and a pressed control does not paint the pressable
 * row around it. Each argument has the specificity of one attribute, as
 * `:active` has one pseudo-class.
 */
export const PRESS_BELIEVED_SELECTOR =
  `:is(${PRESS_ON}, ` +
  `${PRESS_ON} :where(:not(${PRESSABLE}, ${PRESS_ON} ${PRESSABLE} *)), ` +
  `:where(:not(${PRESSABLE})):has(${PRESS_ON}))`;
