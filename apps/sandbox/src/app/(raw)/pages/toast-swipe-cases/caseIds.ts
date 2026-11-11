// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file caseIds.ts
 * @input None
 * @output The Toast swipe case ids, their labels, and the parser for `?case=`
 * @position Shared by the Toast swipe cases page and its cases.
 *
 * SYNC: A new case needs a toast body in cases.tsx.
 */

export const TOAST_SWIPE_CASES = [
  'swipe-away',
  'turn-back',
  'pull-away',
] as const;

export type ToastSwipeCaseId = (typeof TOAST_SWIPE_CASES)[number];

export const TOAST_SWIPE_CASE_LABELS: Readonly<
  Record<ToastSwipeCaseId, string>
> = {
  'swipe-away':
    'Swipe a top toast up and away. A short drag springs it back; a quick flick or a longer drag sends it off the top',
  'turn-back':
    'Drag the toast up, then move back down before you lift. A release that moves back springs the card back',
  'pull-away':
    'Drag the toast up a little, then pull it down past where it started. The card stretches down and springs back',
};

export function parseToastSwipeCase(value: string | null): ToastSwipeCaseId {
  return (TOAST_SWIPE_CASES as readonly string[]).includes(value ?? '')
    ? (value as ToastSwipeCaseId)
    : TOAST_SWIPE_CASES[0];
}
