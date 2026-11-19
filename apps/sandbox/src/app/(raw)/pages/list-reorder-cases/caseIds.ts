// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file caseIds.ts
 * @input None
 * @output The List reorder case ids, their labels, and the parser for `?case=`
 * @position Shared by the List reorder cases page and its cases.
 *
 * SYNC: A new case needs a component in cases.tsx.
 */

export const LIST_REORDER_CASES = [
  'list',
  'transfer-list',
  'list-in-a-card',
] as const;

export type ListReorderCaseId = (typeof LIST_REORDER_CASES)[number];

export const LIST_REORDER_CASE_LABELS: Readonly<
  Record<ListReorderCaseId, string>
> = {
  list: "A reorderable List: hold a row's handle, then drop the row in a new place",
  'transfer-list':
    'A TransferList: reorder the shown fields inside their panel, which clips them',
  'list-in-a-card':
    'A reorderable List in a Card, which clips it to its rounded corners. Each row also swipes to Archive',
};

export function parseListReorderCase(value: string | null): ListReorderCaseId {
  return (LIST_REORDER_CASES as readonly string[]).includes(value ?? '')
    ? (value as ListReorderCaseId)
    : LIST_REORDER_CASES[0];
}
