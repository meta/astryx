// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a theme name may be, in words: the one text every theme-name
 * refusal, the help of `new` and its API docs state.
 *
 * @position api/theme-edit — imported by _settings.mjs and the `new` docs
 */

/** What a theme name may be, in words. */
export const NAME_RULE =
  'lowercase letters, digits and dashes, starting with a letter, a dash only between letters or digits (no two in a row, none at the end), 64 characters at most, and not a name Windows reserves (con, prn, aux, nul, com0-com9, lpt0-lpt9, and com¹-com³, lpt¹-lpt³)';
