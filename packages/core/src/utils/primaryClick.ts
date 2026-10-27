// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file primaryClick.ts
 * @input A pointer event's button and ctrl key, and the platform
 * @output Exports isPrimaryClick
 * @position Core-internal utility, not exported from `@astryxdesign/core/utils`:
 *   the one answer to whether a press is a click, for every consumer of
 *   pointer input (the press controller, utils/pressFeedback.ts)
 *
 * A press is a primary click when it is the main button (a mouse's left
 * button, a pen's tip, a finger) and not a ctrl-click on macOS, which opens
 * the context menu there as a right click does (`spec:AST-094` FR43).
 *
 * SYNC: When modified, update primaryClick.test.ts.
 */

interface ClickLike {
  readonly button: number;
  readonly ctrlKey: boolean;
}

/** Whether `event` presses as a click rather than asking for a context menu. */
export function isPrimaryClick(event: ClickLike): boolean {
  return event.button === 0 && !(event.ctrlKey && isMacPlatform());
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const hints = (navigator as Navigator & {userAgentData?: {platform?: string}})
    .userAgentData;
  return /mac/i.test(hints?.platform ?? navigator.platform ?? '');
}
