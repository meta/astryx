// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file first-strong-direction.ts
 * @input Nothing; re-exports the i18n classifier
 * @output `firstStrongDirection`, for Astryx packages outside core
 * @position Internal entry point. `@astryxdesign/richtext` classifies a block
 *   with the same function `Markdown` uses, so the two surfaces answer alike
 *   and the sets that approximate Bidi_Class live in one place. Not public
 *   API: no consumer outside Astryx needs it.
 */

export {firstStrongDirection} from '../i18n/firstStrongDirection';
