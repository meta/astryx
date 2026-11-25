// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/transferRow.stylex.ts
 * @input A TransferList selected row's option value
 * @output transferRowProps, which marks a row with its value, and
 *   transferRowTogglesIn, which finds the toggle buttons in the row of a value
 * @position Owner module of the private transfer-row attribute: the only file
 *   that writes its name. TransferList marks each selected row, and the
 *   tooltip of a disabled reorder handle finds its handle by it. No package
 *   entry exports it.
 */

const TRANSFER_ROW = 'data-astryx-transfer-row';

/** Spread on a TransferList selected row: marks it with its option value. */
export function transferRowProps(
  value: string,
): Readonly<Record<string, string>> {
  return {[TRANSFER_ROW]: value};
}

/** The toggle buttons in the row of `value` inside `root`, in document order. */
export function transferRowTogglesIn(
  root: ParentNode,
  value: string,
): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      `[${TRANSFER_ROW}="${CSS.escape(value)}"] button[aria-pressed]`,
    ),
  );
}
