// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DialogContext.ts
 * @input React context
 * @output Internal dialog context for child focus behavior and default labelling
 * @position Dialog internals; consumed by focus-managing children and DialogHeader,
 *   and by Lab's DialogHeroHeader through the internal/dialog-context entry
 */

import {use} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export interface DialogContextValue {
  /** Whether the dialog is rendered inline for docs/showcases. */
  isInline: boolean;
  /**
   * Id the DialogHeader title should render with so the dialog can name
   * itself via aria-labelledby. The dialog detects the title element's
   * presence directly (via a callback ref), so it only emits aria-labelledby
   * when the title actually rendered — never pointing at a nonexistent id.
   */
  titleId?: string;
  /**
   * Sets the dialog's default name from its header title: `true` when the
   * title mounts, `false` when it unmounts. With no argument, the dialog
   * looks for the title again. A caller's `aria-label` or `aria-labelledby`
   * wins either way.
   */
  syncDefaultName?: (isTitleMounted?: boolean) => void;
}

export const DialogContext = createSharedContext<DialogContextValue | null>(
  'DialogContext',
  1,
  null,
);
DialogContext.displayName = 'DialogContext';

export function useDialogContext(): DialogContextValue | null {
  return use(DialogContext);
}
