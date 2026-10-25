// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file EmptyState.tsx
 * @input Uses React, HTMLAttributes, AnnounceRenderedText
 * @output Exports EmptyState component, EmptyStateProps type
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/EmptyState/EmptyState.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/EmptyState/EmptyState.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/EmptyState/index.ts (exports if types change)
 * - /apps/storybook/stories/EmptyState.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/EmptyState/ (showcase blocks)
 */

import {type ReactNode, createElement} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {AnnounceRenderedText} from '../hooks/AnnounceRenderedText';
import {isRenderable, mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: spacingVars['--spacing-4'],
    paddingBlock: spacingVars['--spacing-8'],
    paddingInline: spacingVars['--spacing-6'],
  },
  containerCompact: {
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-4'],
    paddingInline: spacingVars['--spacing-4'],
  },
  title: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-large-size'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    lineHeight: typeScaleVars['--text-large-leading'],
    color: colorVars['--color-text-primary'],
  },
  titleCompact: {
    fontSize: typeScaleVars['--text-label-size'],
  },
  description: {
    margin: 0,
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-body-size'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-secondary'],
  },
  descriptionCompact: {
    fontSize: typeScaleVars['--text-supporting-size'],
  },
  textGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '360px',
  },
  actions: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    marginTop: spacingVars['--spacing-1'],
  },
  actionsCompact: {
    flexDirection: 'column',
  },
});

export interface EmptyStateProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * The primary message displayed in the empty state.
   */
  title: string;
  /**
   * Optional secondary text providing additional context.
   */
  description?: string;
  /**
   * Optional icon or illustration displayed above the title.
   * Rendered as decorative (aria-hidden="true").
   */
  icon?: ReactNode;
  /**
   * Optional action buttons displayed below the description.
   * Laid out horizontally by default, stacked vertically when `isCompact`.
   */
  actions?: ReactNode;
  /**
   * Semantic heading level for the title element.
   * Controls only the rendered HTML tag (h1–h6) so the title fits the
   * document outline. This is a semantic change for accessibility and does
   * not change the visual size of the title, which stays fixed regardless
   * of level.
   * @default 3
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Use compact variant for constrained spaces with reduced spacing.
   * @default false
   */
  isCompact?: boolean;
}

/**
 * An empty state placeholder for content areas with no data.
 * Displays an icon or illustration, title, optional description, and action buttons.
 *
 * Not a live region. Its title and description are announced once when they
 * appear or change after the page loaded, never when the page first renders
 * with them (`spec:AST-086` FR2).
 * Styles use Astryx theme tokens via StyleX. Wrap your app in <Theme> to apply a theme.
 *
 * @example
 * ```
 * <EmptyState
 *   title="No results found"
 *   description="Try adjusting your search or filters."
 * />
 * <EmptyState
 *   icon={<Icon icon={InboxIcon} size="lg" />}
 *   title="No messages"
 *   description="You're all caught up!"
 *   actions={<Button label="Compose" variant="primary" />}
 * />
 * ```
 */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  headingLevel = 3,
  isCompact = false,
  xstyle,
  className,
  style,
  ref,
  ...props
}: EmptyStateProps) {
  const HeadingTag = `h${headingLevel}` as const;
  return (
    <div
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('empty-state', {variant: isCompact ? 'compact' : null}),
        stylex.props(
          styles.container,
          isCompact && styles.containerCompact,
          xstyle,
        ),
        className,
        style,
      )}>
      {isRenderable(icon) && <div aria-hidden="true">{icon}</div>}
      <AnnounceRenderedText {...stylex.props(styles.textGroup)}>
        {createElement(
          HeadingTag,
          mergeProps(
            themeProps('empty-state-title', {
              variant: isCompact ? 'compact' : null,
            }),
            stylex.props(styles.title, isCompact && styles.titleCompact),
          ),
          title,
        )}
        {isRenderable(description) && (
          <div
            {...mergeProps(
              themeProps('empty-state-description', {
                variant: isCompact ? 'compact' : null,
              }),
              stylex.props(
                styles.description,
                isCompact && styles.descriptionCompact,
              ),
            )}>
            {description}
          </div>
        )}
      </AnnounceRenderedText>
      {isRenderable(actions) && (
        <div
          {...stylex.props(styles.actions, isCompact && styles.actionsCompact)}>
          {actions}
        </div>
      )}
    </div>
  );
}

EmptyState.displayName = 'EmptyState';
