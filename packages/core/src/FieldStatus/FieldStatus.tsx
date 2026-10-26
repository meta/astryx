// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FieldStatus.tsx
 * @input Uses React, stylex, theme tokens, useFieldStatusAnnouncement, Icon
 * @output Exports FieldStatus component, FieldStatusProps
 * @position Core implementation; consumed by Field, Switch, CheckboxInput, and the FieldStatus entrypoint
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/FieldStatus/FieldStatus.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Field/Field.doc.mjs (compat docs when public API changes)
 * - /packages/core/src/FieldStatus/index.ts (exports if types change)
 * - /packages/core/src/FieldStatus/useFieldStatusAnnouncement.ts (announcement timing shared with Field)
 * - /packages/core/src/Field/index.ts (compat re-export if public API changes)
 * - /packages/cli/assets/templates/blocks/components/FieldStatus/ (showcase blocks)
 */

'use client';

import React from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {InputStatusType} from '../Field/types';
import {useEntryAnimation} from '../hooks/useEntryAnimation';
import {themeProps} from '../utils/themeProps';
import {Icon} from '../Icon';
import type {IconName} from '../Icon';
import type {FieldStatusVariantMap} from './index';
import {useFieldStatusAnnouncement} from './useFieldStatusAnnouncement';

/**
 * Maps each status type to its status glyph. Mirrors the mapping the input
 * controls already use for the on-field status affordance, so the detached
 * message shows the same icon a consumer sees elsewhere for that status.
 */
const statusIconMap: Record<InputStatusType, IconName> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const ATTACHED_OVERLAP = `var(--_field-status-overlap, ${spacingVars['--spacing-1-5']})`;

const styles = stylex.create({
  base: {
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
  },
  attached: {
    marginTop: `calc(-1 * ${ATTACHED_OVERLAP})`,
    paddingBlockStart: `calc(${ATTACHED_OVERLAP} + ${spacingVars['--spacing-2']})`,
    paddingBlockEnd: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    borderEndStartRadius: radiusVars['--radius-element'],
    borderEndEndRadius: radiusVars['--radius-element'],
    // The overlap is visual only. Let pointer input reach the control beneath
    // it instead of allowing the later-painted status box to steal the click.
    pointerEvents: 'none',
  },
  detached: {
    marginTop: spacingVars['--spacing-1'],
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
  },
  detachedContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacingVars['--spacing-1'],
  },
  detachedIcon: {
    // Center the glyph within the first text-line box so it aligns to the
    // first line of the message (rather than the top of the flex row) when the
    // message wraps to multiple lines.
    display: 'inline-flex',
    alignItems: 'center',
    height: `calc(${typeScaleVars['--text-supporting-size']} * ${typeScaleVars['--text-supporting-leading']})`,
    flexShrink: 0,
  },
});

const colorStyles = stylex.create({
  warning: {
    backgroundColor: colorVars['--color-warning-muted'],
    color: colorVars['--color-on-warning-muted'],
  },
  error: {
    backgroundColor: colorVars['--color-error-muted'],
    color: colorVars['--color-on-error-muted'],
  },
  success: {
    backgroundColor: colorVars['--color-success-muted'],
    color: colorVars['--color-on-success-muted'],
  },
});

/**
 * FieldStatus variant type. Extensible via module augmentation of FieldStatusVariantMap.
 */
export type FieldStatusVariant = keyof FieldStatusVariantMap;

export interface FieldStatusProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * The type of status to display.
   */
  type: InputStatusType;
  /**
   * The status message to display.
   */
  message: string;
  /**
   * Visual variant of the status message.
   * - 'attached': Overlaps with input above (used in Field)
   * - 'detached': Floats below with spacing (used in Switch, CheckboxInput)
   * @default 'attached'
   */
  variant?: FieldStatusVariant;
}

/**
 * A status message component for form fields.
 *
 * The `detached` variant renders a leading status icon before the message so
 * status is not conveyed by color or position alone (WCAG 1.4.1). The icon is
 * decorative for assistive tech (`aria-hidden`): the message text already names
 * the status in words and is announced through the live region. The `attached`
 * variant keeps its status affordance on the bordered input, so it renders no
 * icon here to avoid a duplicate. The `tooltip` variant renders no message box
 * at all — the input surfaces the status through a tooltip on its on-field
 * icon — so callers skip rendering FieldStatus for it.
 *
 * Screen-reader announcements go through the persistent `useAnnounce` live
 * regions (assertive for errors, polite otherwise) rather than `role`/
 * `aria-live` on the rendered element. Live regions that mount together with
 * their content are not reliably announced by assistive technology, and
 * FieldStatus is almost always conditionally rendered by its callers. The
 * message is announced whenever it appears — including on first mount — and
 * whenever it changes.
 *
 * @example
 * ```
 * <FieldStatus
 *   type="error"
 *   message="This field is required"
 * />
 * <FieldStatus
 *   type="warning"
 *   message="This will be visible to others"
 *   variant="detached"
 * />
 * ```
 */
export function FieldStatus({
  ref,
  type,
  message,
  id,
  variant = 'attached',
  xstyle,
  className,
  style,
  ...rest
}: FieldStatusProps) {
  const entryStyle = useEntryAnimation('slideDown');
  // Announce-on-mount is intentional: callers conditionally mount FieldStatus
  // when a status appears (and whole forms can mount with a server-side
  // validation error already present), and both cases must be heard.
  useFieldStatusAnnouncement(message, type);

  return (
    <div
      ref={ref}
      id={id}
      {...rest}
      {...mergeProps(
        themeProps('field-status', {type, variant}),
        stylex.props(
          styles.base,
          entryStyle,
          variant === 'attached' ? styles.attached : styles.detached,
          colorStyles[type],
          xstyle,
        ),
        className,
        style,
      )}>
      {variant === 'detached' ? (
        <span {...stylex.props(styles.detachedContent)}>
          <span {...stylex.props(styles.detachedIcon)}>
            <Icon
              icon={statusIconMap[type]}
              size="sm"
              color="inherit"
              // Stable theme target on the detached message box's leading glyph
              // itself, so a theme can restyle just this icon (color, size) —
              // and each status — via `defineTheme`. Same-element rules in
              // @layer astryx-theme win over the icon's own base
              // width/height/fontSize, which a field-level target could not
              // reach.
              {...themeProps('field-status-icon', {type})}
            />
          </span>
          <span>{message}</span>
        </span>
      ) : (
        message
      )}
    </div>
  );
}

FieldStatus.displayName = 'FieldStatus';
