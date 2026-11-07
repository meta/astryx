// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/alertExit.stylex.ts
 * @input A closing alert's dialog element, and the global hosts it holds
 * @output takeAlertExitCopy, which takes the layer runtime's exit copy of a
 *   closing alert, marked as an alert's, for its caller to place
 * @position Owner module of the private alert-exit attribute: the only file
 *   that writes its name. AlertDialog's touch close plays on the copy it
 *   takes. No package entry exports it.
 */

import {
  takeLayerExitCopy,
  type TakenLayerExitCopy,
} from '../Layer/layerExitCopy';
import {modalOutletHosts} from '../Layer/modalOutlet';

const ALERT_EXIT = 'data-astryx-alert-exit';

/** The child indexes that lead from `root` down to `node`. */
function pathTo(root: Element, node: Element): number[] {
  const path: number[] = [];
  for (let at = node; at !== root;) {
    const parent = at.parentElement;
    if (parent == null) {
      break;
    }
    path.unshift([...parent.children].indexOf(at));
    at = parent;
  }
  return path;
}

/** The element at `path` under `root`, if there is one. */
function elementAt(root: Element, path: ReadonlyArray<number>): Element | null {
  let at: Element | null = root;
  for (const index of path) {
    at = at?.children[index] ?? null;
  }
  return at;
}

/**
 * Takes the layer runtime's exit copy of a closing alert, marked as an
 * alert's, for its caller to place. A global host the open alert holds, such
 * as the toast viewport, stays out of the copy. It goes back to the page as
 * the alert closes, and stays live there. Returns null where there is no top
 * layer to show it in: the close is then immediate.
 */
export function takeAlertExitCopy(
  element: HTMLElement,
): TakenLayerExitCopy | null {
  const hostPaths = modalOutletHosts()
    .filter(host => host !== element && element.contains(host))
    .map(host => pathTo(element, host));
  const taken = takeLayerExitCopy(element, ALERT_EXIT);
  if (taken != null) {
    // Found before any removal, which would move the later paths.
    const hostCopies = hostPaths.map(path => elementAt(taken.copy, path));
    for (const hostCopy of hostCopies) {
      hostCopy?.remove();
    }
  }
  return taken;
}
