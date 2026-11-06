// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressClaim.ts
 * @input A long press that fires while its finger is still down
 * @output claimPress, which the long-press detector calls as a press fires,
 *   and watchPressClaims, which hears it
 * @position Internal. The long-press detector (hooks/longPressDetector.ts)
 *   tells the box hold (utils/boxHold.ts) here that the press acted. It adds
 *   no listener to the page.
 */

const watchers = new Set<() => void>();

/** Tells each watcher that a long press acted on the press that is down. */
export function claimPress(): void {
  for (const watcher of [...watchers]) {
    watcher();
  }
}

/** Calls `watcher` at each claim until the returned function runs. */
export function watchPressClaims(watcher: () => void): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}
