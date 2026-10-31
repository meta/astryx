// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DialogHeader.tsx
 * @input Uses React, StyleX, LayoutHeader, Button, Icon, Heading, Text, DialogContext, isRenderable, mergeProps, themeProps
 * @output Exports DialogHeader component and DialogHeaderProps
 * @position Dialog header component; used with Dialog and Layout
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Dialog/Dialog.doc.mjs
 * - /packages/core/src/Dialog/DialogHeader.test.tsx
 * - /packages/core/src/Dialog/index.ts
 * - /apps/storybook/stories/Dialog.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Dialog/ (showcase blocks)
 */

import {useEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars, sizeVars, typeScaleVars} from '../theme/tokens.stylex';
import {LayoutHeader} from '../Layout/LayoutHeader';
import {Button} from '../Button/Button';
import {Icon} from '../Icon/Icon';
import {Heading} from '../Heading/Heading';
import {Text} from '../Text/Text';
import type {BaseProps} from '../BaseProps';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {useDialogContext} from './DialogContext';
import {useTranslator} from '../i18n/useTranslator';

const styles = stylex.create({
  container: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-3'],
  },
  // Compensate for the medium icon button's visual padding on the end slot.
  endBlockEdgeCompensation: {
    marginBlock: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  endInlineEdgeCompensation: {
    marginInlineEnd: `calc(-1 * ${spacingVars['--spacing-2']})`,
  },
  titleWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0'],
    flex: 1,
    minWidth: 0,
    // Visual centering: align title center with close button center
    // buttonCenter = size-element-md/2 = 16px (close button midpoint relative to edge)
    // titleCenter = heading-2-size * heading-2-leading / 2 = 14px
    // adjustment = 8 - 14 = -6px
    marginBlock: `calc(${sizeVars['--size-element-md']} / 2 - ${spacingVars['--spacing-2']} - ${typeScaleVars['--text-heading-2-size']} * ${typeScaleVars['--text-heading-2-leading']} / 2)`,
  },
  titleFocusable: {
    outline: 'none',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
  },
});

export interface DialogHeaderProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * The title of the dialog.
   * Rendered inside the dialog's focusable h2, so rich inline content (for
   * example a styled span) keeps the heading semantics. Keep it inline,
   * non-interactive, and non-empty: its text becomes the dialog's name.
   * This title receives focus when the dialog opens for screen reader
   * accessibility, and names the parent Dialog via aria-labelledby unless the
   * consumer passes an explicit aria-label/aria-labelledby to the Dialog. The
   * accessible name is the rendered title's text content.
   */
  title: ReactNode;

  /**
   * Optional subtitle displayed below the title in smaller, secondary text.
   * Accepts inline content such as a Link; it renders inside a span, so
   * avoid block elements. Nothing renders for `null`, `undefined`, booleans,
   * or an empty string.
   */
  subtitle?: ReactNode;

  /**
   * Callback fired when the dialog visibility changes.
   * Called with `false` when the close button is clicked.
   * If not provided, no close button will be rendered.
   */
  onOpenChange?: (isOpen: boolean) => unknown;

  /**
   * Content to render before the title (e.g., a back button).
   */
  startContent?: ReactNode;

  /**
   * Content to render after the title, before the close button (e.g., action buttons).
   */
  endContent?: ReactNode;

  /**
   * Overrides automatic end-slot compensation. When omitted, the slot keeps its
   * existing behavior: rendering the close action applies block and logical
   * inline-end compensation. Use `inline`, `block`, or `all` to select the axes
   * explicitly.
   */
  endContentEdgeCompensation?: 'inline' | 'block' | 'all';

  /**
   * Adds a themed border at the bottom edge.
   * When false, spacing collapse is applied automatically for seamless visual flow.
   * Defaults to the parent Layout's `defaultHasDividers` context value.
   */
  hasDivider?: boolean;
}

/**
 * Header component designed specifically for Dialog.
 *
 * Renders a title that receives focus when a modal dialog opens (for screen reader accessibility)
 * and an optional close button. Inline documentation previews suppress this autofocus.
 * The title is an h2 element with tabIndex={-1} so it can be programmatically focused but
 * doesn't appear in the tab order. The title also names the parent Dialog via
 * aria-labelledby (unless the Dialog receives an explicit aria-label/aria-labelledby).
 *
 * Uses LayoutHeader internally for consistent styling with other layout headers.
 *
 * @example
 * ```
 * <Dialog isOpen={isOpen} onOpenChange={open => setIsOpen(open)}>
 *   <Layout
 *     header={<DialogHeader title="Modal Title" onOpenChange={open => setIsOpen(open)} />}
 *     content={<LayoutContent>Content</LayoutContent>}
 *     footer={<LayoutFooter hasDivider>Actions</LayoutFooter>}
 *   />
 * </Dialog>
 * ```
 */
export function DialogHeader({
  title,
  subtitle,
  onOpenChange,
  startContent,
  endContent,
  endContentEdgeCompensation,
  hasDivider,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: DialogHeaderProps) {
  const t = useTranslator();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogContext = useDialogContext();
  const shouldAutoFocus = dialogContext?.isInline !== true;
  const titleId = dialogContext?.titleId;
  const hasSubtitle = isRenderable(subtitle);
  const hasStartContent = isRenderable(startContent);
  const hasEndContent = isRenderable(endContent);
  const shouldCompensateEndBlock =
    endContentEdgeCompensation == null
      ? onOpenChange != null
      : endContentEdgeCompensation === 'block' ||
        endContentEdgeCompensation === 'all';
  const shouldCompensateEndInline =
    endContentEdgeCompensation == null
      ? onOpenChange != null
      : endContentEdgeCompensation === 'inline' ||
        endContentEdgeCompensation === 'all';

  // Auto-focus the title when mounted for screen reader accessibility.
  // Inline dialogs are documentation/showcase previews, so suppress focus to
  // avoid stealing scroll position from the surrounding page.
  // The parent Dialog detects this title (by `titleId`) via a callback ref to
  // set its default aria-labelledby — no registration handshake needed here.
  useEffect(() => {
    if (shouldAutoFocus && titleRef.current) {
      titleRef.current.focus();
    }
  }, [shouldAutoFocus]);

  return (
    <LayoutHeader
      ref={ref}
      hasDivider={hasDivider}
      xstyle={xstyle}
      className={className}
      style={style}
      {...rest}>
      <div
        {...mergeProps(
          themeProps('dialog-header'),
          stylex.props(styles.container),
        )}>
        {hasStartContent && (
          <div
            {...mergeProps(
              themeProps('dialog-header-start-content'),
              stylex.props(styles.actions),
            )}>
            {startContent}
          </div>
        )}
        <div
          {...mergeProps(
            themeProps('dialog-header-title-block'),
            stylex.props(styles.titleWrapper),
          )}>
          <Heading
            ref={titleRef}
            id={titleId}
            level={2}
            tabIndex={-1}
            xstyle={styles.titleFocusable}>
            {title}
          </Heading>
          {hasSubtitle && (
            <Text type="body" size="sm" color="secondary">
              {subtitle}
            </Text>
          )}
        </div>
        {(hasEndContent || onOpenChange != null) && (
          <div
            {...mergeProps(
              themeProps('dialog-header-end-content'),
              stylex.props(
                styles.actions,
                shouldCompensateEndBlock && styles.endBlockEdgeCompensation,
                shouldCompensateEndInline && styles.endInlineEdgeCompensation,
              ),
            )}>
            {endContent}
            {onOpenChange && (
              <Button
                variant="ghost"
                label={t('@astryx.dialog.close')}
                tooltip={t('@astryx.dialog.close')}
                icon={
                  <Icon
                    icon="close"
                    color="inherit"
                    {...themeProps('dialog-header-close-icon')}
                  />
                }
                onClick={() => {
                  onOpenChange?.(false);
                }}
                isIconOnly
              />
            )}
          </div>
        )}
      </div>
    </LayoutHeader>
  );
}

DialogHeader.displayName = 'DialogHeader';
