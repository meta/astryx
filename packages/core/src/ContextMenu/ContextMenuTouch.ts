// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ContextMenuTouch.ts
 * @input ContextMenu's touch modules
 * @output ContextMenu's touch layer, its one import site: the press
 *   recognizer (contextMenuPress.ts) and the press feedback
 *   (contextMenuPressFeedback.ts)
 * @position ContextMenuTouchLayer.tsx, which ContextMenu imports
 *   under the touch model, imports its touch behaviour from here only; the
 *   mouse and keyboard paths stay in ContextMenu.tsx
 *
 * SYNC: When modified, update /packages/core/src/ContextMenu/ContextMenuTouchLayer.tsx
 */

export {ContextMenuPressRecognizer} from './contextMenuPress';
export {useContextMenuPressFeedback} from './contextMenuPressFeedback';
