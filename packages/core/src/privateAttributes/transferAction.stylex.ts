// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/transferAction.stylex.ts
 * @input A TransferList row's Add or Remove button and its panel
 * @output transferActionProps, which marks the button with its panel, and
 *   transferActionsIn, which finds a panel's buttons
 * @position Owner module of the private transfer-action attribute: the only
 *   file that writes its name. TransferList marks each row's Add or Remove,
 *   and moves the focus to one of them after a transfer. No package entry
 *   exports it.
 */

const TRANSFER_ACTION = 'data-astryx-transfer-action';

type TransferSide = 'selected' | 'available';

/** Spread on a row's Add or Remove: marks it with its panel. */
export function transferActionProps(
  side: TransferSide,
): Readonly<Record<string, string>> {
  return {[TRANSFER_ACTION]: side};
}

/**
 * The Add or Remove buttons of `side` inside `root` that are not natively
 * disabled, in document order.
 */
export function transferActionsIn(
  root: ParentNode,
  side: TransferSide,
): HTMLButtonElement[] {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>(
      `[${TRANSFER_ACTION}="${side}"]:not([disabled])`,
    ),
  );
}
