// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AlertDialog.tsx
 * @input Uses React, StyleX, Dialog, Layout, Heading, Text, Button
 * @output Exports AlertDialog component, AlertDialogProps type
 * @position Core implementation; consumed by index.ts, tested by AlertDialog.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/AlertDialog/AlertDialog.doc.mjs (props table, features, examples)
 * - /packages/core/src/AlertDialog/AlertDialog.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/AlertDialog/index.ts (exports if types change)
 * - /apps/storybook/stories/AlertDialog.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/AlertDialog/ (showcase blocks)
 */

import React, {useId, useCallback} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Dialog} from '../Dialog';
import {Layout} from '../Layout/Layout';
import {LayoutContent} from '../Layout/LayoutContent';
import {LayoutFooter} from '../Layout/LayoutFooter';
import {Stack} from '../Stack';
import {Heading} from '../Heading/Heading';
import {Text} from '../Text/Text';
import {Button, type ButtonVariant} from '../Button';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import {useMediaQuery} from '../hooks/useMediaQuery';

const SMALL_SCREEN_QUERY = '(max-width: 640px)';

const styles = stylex.create({
  action: {
    maxWidth: '100%',
    minWidth: 0,
  },
  stackedAction: {
    width: '100%',
  },
});

export interface AlertDialogProps extends BaseProps<HTMLDialogElement> {
  ref?: React.Ref<HTMLDialogElement>;
  /**
   * Whether the dialog is open.
   */
  isOpen: boolean;

  /**
   * Renders alert dialog content inline without modal behavior.
   * For documentation previews and showcases only. The inline path is not a
   * modal, so it renders `role="group"` rather than `role="alertdialog"`.
   * @default false
   */
  isInline?: boolean;

  /**
   * Callback fired when the dialog visibility changes.
   * Called with `false` when cancel is clicked or Escape is pressed.
   */
  onOpenChange: (isOpen: boolean) => unknown;

  /**
   * Dialog title. Linked to the dialog via `aria-labelledby`.
   */
  title: string;

  /**
   * Consequence description. Linked to the dialog via `aria-describedby`.
   */
  description: string;

  /**
   * Label for the cancel button. Rendered as a ghost Button.
   * Clicking cancel calls `onOpenChange(false)`.
   * @default 'Cancel'
   */
  cancelLabel?: string;

  /**
   * Label for the action button.
   */
  actionLabel: string;

  /**
   * Variant for the action button.
   * @default 'destructive'
   */
  actionVariant?: ButtonVariant;

  /**
   * Whether the action button shows a loading spinner.
   */
  isActionLoading?: boolean;

  /**
   * Callback fired when the action button is clicked.
   * The dialog does NOT auto-close — call `onOpenChange(false)` when done.
   */
  onAction: () => unknown;

  /**
   * The width of the dialog.
   * Numbers are treated as pixels, strings are used as-is.
   * @default 400
   */
  width?: number | string;
}

/**
 * A confirmation dialog for destructive or irreversible actions.
 *
 * Implements the WAI-ARIA APG Alert Dialog pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/
 *
 * Uses `role="alertdialog"` and requires explicit user action to dismiss.
 * Cannot be dismissed by clicking outside. Escape key triggers cancel.
 * Initial focus goes to the cancel button (least destructive action), pinned
 * with `data-autofocus` so it survives any change to the footer's order.
 *
 * The `isInline` preview path is not modal, so it renders `role="group"`
 * instead — the alertdialog role would promise modality it does not have.
 *
 * @example
 * ```
 * <AlertDialog
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   title="Delete item?"
 *   description="This action cannot be undone."
 *   actionLabel="Delete"
 *   onAction={async () => { await deleteItem(); setIsOpen(false); }}
 * />
 * ```
 */
export function AlertDialog({
  ref,
  isOpen,
  isInline,
  onOpenChange,
  title,
  description,
  cancelLabel: cancelLabelFromProps,
  actionLabel,
  actionVariant = 'destructive',
  isActionLoading,
  onAction,
  width = 400,
  xstyle,
  className,
  style,
  'data-testid': testId,
  ...rest
}: AlertDialogProps) {
  const t = useTranslator();
  const cancelLabel = cancelLabelFromProps ?? t('@astryx.alertDialog.cancel');
  const titleId = useId();
  const descriptionId = useId();
  // Width stays delegated to Dialog: this query exists only so AlertDialog can
  // keep narrow visual, DOM, and tab order aligned for its destructive/cancel
  // semantics without coupling action order to pointer or hover capability.
  const isSmallScreen = useMediaQuery(SMALL_SCREEN_QUERY);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const buttonActionStyle = [
    styles.action,
    isSmallScreen && styles.stackedAction,
  ];
  const cancelButton = (
    <Button
      key="cancel"
      variant="ghost"
      label={cancelLabel}
      onClick={handleCancel}
      xstyle={buttonActionStyle}
      // Dialog focuses [data-autofocus] itself after showModal(), because
      // React's autoFocus runs during commit while the dialog is invisible.
      // Cancel is least destructive, so it remains the autofocus target even
      // when small-screen visual order places the destructive action above it.
      data-autofocus
    />
  );
  const actionButton = (
    <Button
      key="action"
      variant={actionVariant}
      label={actionLabel}
      onClick={onAction}
      isLoading={isActionLoading}
      xstyle={buttonActionStyle}
    />
  );

  return (
    <Dialog
      {...rest}
      ref={ref}
      isOpen={isOpen}
      isInline={isInline}
      onOpenChange={onOpenChange}
      width={width}
      purpose="form"
      // `alertdialog` is a modal role: it promises an interruption the user
      // has to deal with, a focus trap, and an inert page behind it. The
      // inline path renders a plain always-present div with none of that, so
      // the role would misdescribe it. `group` keeps the title and
      // description associated with a container without claiming a dialog.
      role={isInline ? 'group' : 'alertdialog'}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      {...mergeProps(themeProps('alert-dialog'), {className, style})}
      xstyle={xstyle}
      data-testid={testId}>
      <Layout
        content={
          <LayoutContent>
            <Heading level={2} id={titleId}>
              {title}
            </Heading>
            <Text type="body" color="secondary" id={descriptionId}>
              {description}
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            {/* Generic Dialog footers should wrap, but their consumers own
                action semantics and order. AlertDialog keeps this
                destructive-above-Cancel narrow order because confirmation
                actions have component-specific meaning here. */}
            <Stack
              direction={isSmallScreen ? 'vertical' : 'horizontal'}
              gap={2}
              hAlign={isSmallScreen ? 'stretch' : 'end'}
              wrap={isSmallScreen ? 'nowrap' : 'wrap'}>
              {isSmallScreen
                ? [actionButton, cancelButton]
                : [cancelButton, actionButton]}
            </Stack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}

AlertDialog.displayName = 'AlertDialog';
