// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CopyToClipboard.tsx
 * @input Uses IconButton, Icon, useClipboard, useTranslator
 * @output Exports CopyToClipboard component and CopyToClipboardProps type
 * @position Thin wrapper over IconButton; delegates the clipboard write, the
 *   transient "copied" flag and its reset timer to the useClipboard hook
 *
 * Per [API Conventions → Behaviors: Hooks Over Wrappers], the copy behavior is
 * the useClipboard hook and this control is a thin shell over it: an icon-only
 * button whose icon flips from copy to check for the reset window, with a
 * polite announcement instead of relying on the aria-label swap alone.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CopyToClipboard/index.ts (exports if types change)
 * - /packages/core/src/CopyToClipboard/CopyToClipboard.doc.mjs (props table)
 * - /packages/core/src/CopyToClipboard/__tests__/CopyToClipboard.test.tsx
 * - /apps/storybook/stories/CopyToClipboard.stories.tsx (storybook stories)
 */

import type React from 'react';
import type {ReactNode} from 'react';

import {IconButton} from '../IconButton';
import type {ButtonSize, ButtonVariant} from '../Button';
import {Icon} from '../Icon';
import {useClipboard} from '../hooks/useClipboard';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/CopyToClipboard/CopyToClipboard.generated';
import type {BaseProps} from '../BaseProps';

registerEnglishFallback(english);

// =============================================================================
// Types
// =============================================================================

export interface CopyToClipboardProps extends BaseProps<HTMLButtonElement> {
  /** Ref forwarded to the root button element */
  ref?: React.Ref<HTMLButtonElement>;

  /** The visual style variant of the underlying button. @default 'ghost' */
  variant?: ButtonVariant;

  /** The size of the underlying button. @default 'md' */
  size?: ButtonSize;

  /**
   * The text written to the clipboard when the control is activated.
   */
  text: string;

  /**
   * Called after the clipboard write succeeds. A rejected write is a silent
   * no-op that never calls this.
   */
  onCopy?: () => void;

  /**
   * Accessible label and tooltip override for the default state. Defaults to
   * the localized "Copy to clipboard". Provide a more specific name (for
   * example, "Copy install command") when several copy controls share a page.
   */
  label?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * An icon-only button that copies text to the clipboard. The icon flips from
 * copy to check while the copied confirmation is active; the confirmation is
 * announced to assistive technology by the useClipboard hook.
 *
 * @example
 * ```
 * <CopyToClipboard text="npm install @astryxdesign/core" />
 *
 * <CopyToClipboard
 *   text="AASH-2026-11-17"
 *   label="Copy invitation code"
 *   onCopy={() => setInvited(true)}
 * />
 * ```
 */
export function CopyToClipboard({
  ref,
  text,
  onCopy,
  label,
  variant,
  onClick,
  ...props
}: CopyToClipboardProps): ReactNode {
  const t = useComponentTranslator();
  const {copy, isCopied} = useClipboard({
    announce: t('@astryx.copyToClipboard.copied'),
  });

  const defaultLabel = t('@astryx.copyToClipboard.copy');
  // The tooltip stays on the copy label in both states: the copy → check icon
  // flip is the confirmation, not a tooltip change.
  const tooltip = label ?? defaultLabel;

  return (
    <IconButton
      {...props}
      ref={ref}
      variant={variant ?? 'ghost'}
      tooltip={tooltip}
      label={
        isCopied ? t('@astryx.copyToClipboard.copied') : (label ?? defaultLabel)
      }
      onClick={event => {
        onClick?.(event);
        void copy(text).then(succeeded => {
          if (succeeded) {
            onCopy?.();
          }
        });
      }}
      icon={
        <Icon icon={isCopied ? 'check' : 'copy'} size="sm" color="inherit" />
      }
    />
  );
}

CopyToClipboard.displayName = 'CopyToClipboard';
