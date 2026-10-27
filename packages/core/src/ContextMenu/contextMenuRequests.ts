// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuRequests.ts
 * @input An element, whether its menu is disabled, where to forward each
 *   request, and the hold's timeline, drift tolerance and stages
 * @output attachContextMenuRequests: the headless context menu's request core
 *   (spec:AST-107 FR8). It attaches the element's context request
 *   (gestures/contextRequest.ts) and forwards each request, and `open(at)`
 *   and `close()`, to whoever renders the menu; `destroy` detaches it
 * @position Used by createContextMenu, which ContextMenu is built on: one
 *   request path for both
 */

import {
  attachContextRequest,
  type ContextRequestOptions,
} from '../gestures/contextRequest';
import type {ContextMenuAttachedRequest} from './ContextMenu';

/** What a menu receives: a request to open, or a close. */
export type ContextMenuForwarded = ContextMenuAttachedRequest | 'close';

export interface ContextMenuRequestOptions {
  /** While true, the element makes no request and keeps the browser's menu. */
  isDisabled?: boolean;
  /** The hold's timeline and drift tolerance (the context request's `hold`). */
  hold?: ContextRequestOptions['hold'];
  /** The hold's stages (the context request's `onHold`). */
  onHold?: ContextRequestOptions['onHold'];
}

export interface ContextMenuRequests {
  /** Forwards an open at `at`, client coordinates, or at the element. */
  open(at?: {readonly x: number; readonly y: number}): void;
  /** Forwards a close. */
  close(): void;
  /** Takes new options; enabling, disabling or a new hold attaches again. */
  update(options: ContextMenuRequestOptions): void;
  /** Detaches the request. */
  destroy(): void;
}

/**
 * Attaches `element`'s context request and forwards each request to
 * `forward` (spec:AST-107 FR8). A disabled menu's request registers nothing
 * (spec:AST-094 FR24), so enabling attaches it again.
 */
export function attachContextMenuRequests(
  element: HTMLElement,
  initialOptions: ContextMenuRequestOptions,
  forward: (forwarded: ContextMenuForwarded) => void,
): ContextMenuRequests {
  let options = initialOptions;
  let isDestroyed = false;
  let detach: () => void = () => {};

  const attach = () => {
    detach();
    detach = attachContextRequest(element, {
      onRequest: request => {
        if (isDestroyed) {
          return;
        }
        // Several browsers report Shift+F10 as a mouse `contextmenu` at
        // (0, 0) with no keydown to read: that is a key's request, which opens
        // at the element, not at the viewport's corner (menus-8).
        const isKeyAtOrigin =
          request.kind === 'pointer' &&
          request.pointerType === 'mouse' &&
          request.point?.x === 0 &&
          request.point.y === 0;
        forward(
          isKeyAtOrigin
            ? {kind: 'keyboard', point: null}
            : {kind: request.kind, point: request.point},
        );
      },
      isEnabled: () => !isDestroyed && options.isDisabled !== true,
      hold: options.hold,
      onHold: phase => options.onHold?.(phase),
    });
  };
  attach();

  return {
    open(at) {
      if (!isDestroyed) {
        forward({kind: 'open', point: at ?? null});
      }
    },
    close() {
      if (!isDestroyed) {
        forward('close');
      }
    },
    update(next) {
      const wasDisabled = options.isDisabled === true;
      const holdChanged =
        JSON.stringify(options.hold ?? null) !==
        JSON.stringify(next.hold ?? null);
      options = next;
      if (isDestroyed) {
        return;
      }
      const isDisabled = options.isDisabled === true;
      if (isDisabled && !wasDisabled) {
        forward('close');
      }
      if (wasDisabled !== isDisabled || holdChanged) {
        attach();
      }
    },
    destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      detach();
      detach = () => {};
    },
  };
}
