// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Per-message values ChatMessage sets on its article for its own slots.
 *
 * `--_chat-avatar-offset` is the avatar's top spacing: the name row's spacing
 * when a bubble in this message renders a name, else none. Each article sets
 * it from its own `:has([data-chat-name])`, a parent-relative rule: a
 * sibling-relative `:has(~ …)` in the global stylesheet makes WebKit re-check
 * every earlier sibling on each insertion into any container, so filling one
 * grows quadratically. A message nested in another sets its own value, so it
 * never inherits the outer message's.
 */
export const chatMessageVars = stylex.defineVars({
  '--_chat-avatar-offset': '0px',
});
