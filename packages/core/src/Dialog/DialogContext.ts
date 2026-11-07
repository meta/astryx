// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DialogContext.ts
 * @input React context
 * @output Internal dialog context for child focus behavior and default labelling
 * @position Dialog internals; consumed by focus-managing children and DialogHeader,
 *   and by Lab's DialogHeroHeader through the internal/dialog-context entry
 */

import {createContext, use} from 'react';

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
   * Checks the default aria-labelledby again. The dialog looks for its title
   * when it mounts; a composed header whose title element appears, changes,
   * or leaves after that calls this so the dialog's name follows it.
   */
  syncDefaultName?: () => void;
}

export const DialogContext = createContext<DialogContextValue | null>(null);
DialogContext.displayName = 'DialogContext';

export function useDialogContext(): DialogContextValue | null {
  return use(DialogContext);
}
