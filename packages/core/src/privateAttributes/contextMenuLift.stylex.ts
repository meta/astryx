// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/contextMenuLift.stylex.ts
 * @input The lift module (liftFromTrigger/)
 * @output liftContextMenuTrigger: lifts ContextMenu's trigger, with the
 *   private context-menu lift mark on the lift layer, its anchor and its
 *   placeholder
 * @position Owner module of the private context-menu lift attribute: the
 *   only file that writes its name. ContextMenu/ContextMenuLift.ts lifts
 *   through it. No package entry exports it.
 */

import type {
  LiftFromTrigger,
  LiftFromTriggerOptions,
  LiftFromTriggerResult,
} from '../liftFromTrigger/liftFromTrigger';

const CONTEXT_MENU_LIFT = 'data-astryx-context-menu-lift';

/**
 * Lifts `trigger` through `lift`. The lift marks its layer with the name,
 * and its anchor and placeholder with the name plus `-anchor` and
 * `-placeholder`.
 */
export function liftContextMenuTrigger(
  lift: LiftFromTrigger,
  trigger: HTMLElement,
  options: Omit<LiftFromTriggerOptions, 'attribute'>,
): LiftFromTriggerResult | null {
  return lift.lift(trigger, {...options, attribute: CONTEXT_MENU_LIFT});
}
