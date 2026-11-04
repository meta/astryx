// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useFieldStatusAnnouncement.ts
 * @input Uses React useEffect and useAnnounce
 * @output Exports the internal useFieldStatusAnnouncement hook
 * @position Internal to the field family; the one place that decides when and
 *   how loudly a field status message is spoken. FieldStatus calls it for the
 *   attached and detached message boxes, and Field calls it for the tooltip
 *   placement, which renders no FieldStatus. Not exported from the package.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FieldStatus/FieldStatus.tsx
 * - /packages/core/src/Field/Field.tsx
 */

import {useEffect} from 'react';
import {useAnnounce} from '../hooks/useAnnounce';
import type {InputStatusType} from '../Field/types';

/**
 * Speaks a field status message through the persistent live regions:
 * errors assertively, warnings and successes politely. It speaks when a
 * message is first present, including on mount, and again whenever the
 * message or its type changes. An absent or empty message is never spoken.
 *
 * The persistent regions are used instead of `role`/`aria-live` on the
 * rendered message because a live region mounted together with its content is
 * not reliably announced, and field status is almost always conditionally
 * rendered.
 */
export function useFieldStatusAnnouncement(
  message: string | undefined,
  type: InputStatusType | undefined,
): void {
  const announce = useAnnounce();
  useEffect(() => {
    if (message) {
      announce(message, type === 'error' ? 'assertive' : 'polite');
    }
  }, [announce, message, type]);
}
