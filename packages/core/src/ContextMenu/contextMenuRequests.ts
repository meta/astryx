// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuRequests.ts
 * @input An element, whether its menu is disabled, and where to forward each
 *   request
 * @output attachContextMenuRequests: attaches the element's context request
 *   (gestures/contextRequest.ts) and forwards each request to the menu;
 *   `destroy` detaches it
 * @position Internal to ContextMenu: createContextMenu's request path
 */

import {attachContextRequest} from '../gestures/contextRequest';
import type {ContextMenuAttachedRequest} from './ContextMenu';

/** What a menu receives: a request to open, or a close. */
export type ContextMenuForwarded = ContextMenuAttachedRequest | 'close';

export interface ContextMenuRequestOptions {
  /** While true, the element makes no request and keeps the browser's menu. */
  isDisabled?: boolean;
}

export interface ContextMenuRequests {
  /** Takes new options; enabling or disabling attaches again. */
  update(options: ContextMenuRequestOptions): void;
  /** Detaches the request. */
  destroy(): void;
}

/**
 * Attaches `element`'s context request and forwards each request to
 * `forward`. A disabled menu's request registers nothing, so enabling
 * attaches it again, and disabling an open menu closes it.
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
        // (0, 0) with no keydown to read: that is a key's request, which
        // opens at the element, not at the viewport's corner.
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
    });
  };
  attach();

  return {
    update(next) {
      const wasDisabled = options.isDisabled === true;
      options = next;
      if (isDestroyed) {
        return;
      }
      const isDisabled = options.isDisabled === true;
      if (isDisabled && !wasDisabled) {
        forward('close');
      }
      if (wasDisabled !== isDisabled) {
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
