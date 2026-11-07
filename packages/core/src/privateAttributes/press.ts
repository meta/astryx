// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/press.ts
 * @input None.
 * @output `PRESS_BELIEVED_SELECTOR`, the selector that matches a control
 *   while the press controller believes a press.
 * @position Owner module of the private press attribute. The press controller
 *   (utils/pressFeedback.ts) writes the attribute. Its `.stylex.ts` sibling
 *   writes the styles that read it, and the theme engine (theme/) builds a
 *   themed press on this selector. No package entry exports it.
 */

export const PRESS_BELIEVED_SELECTOR = '[data-astryx-press="on"]';
