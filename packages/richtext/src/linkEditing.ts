// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file linkEditing.ts
 * @input An entered address
 * @output Exports toLinkHref
 * @position Internal to RichText. The link rules RichTextEditorToolbar's link
 *   popover applies: which address an entry becomes.
 */

import {sanitizeUrl} from './linkUtils';

/**
 * The address an entry becomes under the link rules (`sanitizeUrl`), or null
 * when the rules refuse it.
 */
export function toLinkHref(entered: string): string | null {
  const href = sanitizeUrl(entered.trim());
  return href === 'about:blank' ? null : href;
}
