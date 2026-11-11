// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file target-wait.ts
 * @input Nothing
 * @output `TARGET_WAIT_MS`, how long a gate waits for an element it names to
 *   be on the page
 * @position A leaf module. ./curves.ts and ./busy.ts both read it, and
 *   ./busy.ts imports nothing from ./curves.ts, so the constant lives apart
 *   from both.
 */

/**
 * How long a hold waits for its scope or a judged target, and
 * `blockMainThread` for its `during` element, to be on the page, ms.
 */
export const TARGET_WAIT_MS = 5_000;
