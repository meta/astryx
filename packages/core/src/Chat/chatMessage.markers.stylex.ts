// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Scoped marker on the ChatMessage article.
 *
 * The avatar wrapper reads it through `stylex.when.ancestor()` to take its top
 * spacing when the message holds a bubble name (`[data-chat-name]`). The rule
 * is parent-relative, never sibling-relative: a sibling-relative `:has(~ …)`
 * in the global stylesheet makes WebKit re-check every earlier sibling on each
 * insertion into any container, so filling one grows quadratically.
 */
export const chatMessageScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
