// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DrawerHeader.tsx
 * @input Uses React, StyleX, LayoutHeader, Button, Icon, Heading, Text, i18n, BaseProps, isRenderable, mergeProps, themeProps
 * @output Exports DrawerHeader component and DrawerHeaderProps
 * @position Drawer header; composed in a Layout header slot inside Drawer, tested by DrawerHeader.test.tsx
 *
 * Mirrors DialogHeader's API: a title, an optional subtitle, start/end content
 * slots, and a close button that renders only when `onOpenChange` is passed.
 * Two differences follow from Drawer's contract:
 * - It does not move focus on mount. Drawer owns focus entry through
 *   `data-autofocus` once its native host is presented.
 * - It does not name the drawer. Drawer's required `label` does.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Drawer/DrawerHeader.doc.mjs (props, anatomy, theming)
 * - /packages/core/src/Drawer/DrawerHeader.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Drawer/index.ts (exports if types change)
 * - /packages/cli/assets/templates/blocks/components/Drawer/ (showcase blocks)
 * - /packages/cli/assets/templates/blocks/components/DrawerHeader/ (showcase blocks)
 * - /apps/storybook/stories/Drawer.stories.tsx (examples and visual coverage)
 * - /apps/storybook/stories/DrawerHeader.stories.tsx (component audit fixture)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {sizeVars, spacingVars, typeScaleVars} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {Heading} from '../Heading';
import {Icon} from '../Icon';
import {LayoutHeader} from '../Layout';
import {Text} from '../Text';
import {useTranslator} from '../i18n';
import {isRenderable, mergeProps, themeProps} from '../utils';

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
    // Align the title's center with the close button's center, as
    // DialogHeader does.
    marginBlock: `calc(${sizeVars['--size-element-md']} / 2 - ${spacingVars['--spacing-2']} - ${typeScaleVars['--text-heading-2-size']} * ${typeScaleVars['--text-heading-2-leading']} / 2)`,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexShrink: 0,
  },
});

export interface DrawerHeaderProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * The title of the drawer, rendered as an h2. Keep it inline and
   * non-interactive. It does not name the drawer; Drawer's `label` does.
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
   * Called with `false` when the close button is clicked. Pass the Drawer's
   * own `onOpenChange`. If not provided, no close button is rendered.
   */
  onOpenChange?: (isOpen: boolean) => unknown;

  /**
   * Content to render before the title (e.g., a back button).
   */
  startContent?: ReactNode;

  /**
   * Content to render after the title, before the close button (e.g., action
   * buttons).
   */
  endContent?: ReactNode;

  /**
   * Overrides automatic end-slot compensation. When omitted, rendering the
   * close action applies block and logical inline-end compensation. Use
   * `inline`, `block`, or `all` to select the axes explicitly.
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
 * Header for a Drawer: a title, optional subtitle and start/end content, and a
 * close button when `onOpenChange` is passed. Same API as DialogHeader.
 *
 * Uses LayoutHeader internally for consistent styling with other layout headers.
 *
 * @example
 * ```
 * <Drawer isOpen={isOpen} onOpenChange={setIsOpen} label="Details">
 *   <DrawerHeader title="Details" onOpenChange={setIsOpen} />
 *   <Section padding={4}>Content</Section>
 * </Drawer>
 * ```
 */
export function DrawerHeader({
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
}: DrawerHeaderProps) {
  const t = useTranslator();
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
          themeProps('drawer-header'),
          stylex.props(styles.container),
        )}>
        {hasStartContent && (
          <div
            {...mergeProps(
              themeProps('drawer-header-start-content'),
              stylex.props(styles.actions),
            )}>
            {startContent}
          </div>
        )}
        <div
          {...mergeProps(
            themeProps('drawer-header-title-block'),
            stylex.props(styles.titleWrapper),
          )}>
          <Heading level={2}>{title}</Heading>
          {hasSubtitle && (
            <Text type="body" size="sm" color="secondary">
              {subtitle}
            </Text>
          )}
        </div>
        {(hasEndContent || onOpenChange != null) && (
          <div
            {...mergeProps(
              themeProps('drawer-header-end-content'),
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
                    {...themeProps('drawer-header-close-icon')}
                  />
                }
                onClick={() => {
                  onOpenChange(false);
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

DrawerHeader.displayName = 'DrawerHeader';
