// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file caseIds.ts
 * @input None
 * @output The swipe actions case ids, their labels, and the parser for `?case=`
 * @position Shared by the swipe actions cases page and its cases.
 *
 * SYNC: A new case needs a component in cases.tsx.
 */

export const SWIPE_ACTIONS_CASES = ['mail', 'one-entry', 'commit'] as const;

export type SwipeActionsCaseId = (typeof SWIPE_ACTIONS_CASES)[number];

export const SWIPE_ACTIONS_CASE_LABELS: Readonly<
  Record<SwipeActionsCaseId, string>
> = {
  mail: 'A mail list. Swipe left for Archive and Delete, or right to mark a message read. A flick opens the row; a drag from the open row deletes',
  'one-entry':
    'One entry on each side. A long drag from the closed row fires it',
  commit:
    "swipeBehavior: 'commit'. A release past the commit point dismisses the row, and nothing rests open",
};

export function parseSwipeActionsCase(
  value: string | null,
): SwipeActionsCaseId {
  return (SWIPE_ACTIONS_CASES as readonly string[]).includes(value ?? '')
    ? (value as SwipeActionsCaseId)
    : SWIPE_ACTIONS_CASES[0];
}
