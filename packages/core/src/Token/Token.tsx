// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Token.tsx
 * @input Uses React, ReactNode, StyleXStyles
 * @output Exports Token component, TokenProps, TokenColor, TokenColorMap types
 * @position Core implementation; consumed by index.ts, tested by Token.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Token/TokenLink.tsx (interactive wrapper for href+onRemove)
 * - /packages/core/src/Token/Token.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Token/Token.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Token/index.ts (exports if types change)
 * - /apps/storybook/stories/Token.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Token/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  sizeVars,
  durationVars,
  easeVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Icon} from '../Icon';
import {mergeProps} from '../utils';
import {useLinkComponent} from '../Link/useLinkComponent';
import {useInteractiveRole} from '../hooks/useInteractiveRole';
import {TokenLink} from './TokenLink';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useTranslator} from '../i18n';
import type {TokenColorMap} from './index';
import {disabledInteractionProps} from '../utils/disabledInteraction';

// =============================================================================
// Types
// =============================================================================

/**
 * Token color type derived from TokenColorMap.
 * Extensible via module augmentation of TokenColorMap.
 */
export type TokenColor = keyof TokenColorMap;

export type TokenSize = 'sm' | 'md' | 'lg';

export interface TokenProps extends BaseProps<HTMLElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * The text label displayed in the token.
   */
  label: string;
  /**
   * The size of the token.
   * @default 'md'
   */
  size?: TokenSize;
  /**
   * The color variant of the token.
   * @default 'default'
   */
  color?: TokenColor;
  /**
   * Optional icon to display before the label.
   */
  icon?: ReactNode;
  /**
   * Whether the token is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Callback when the remove (X) button is clicked.
   * When provided, a remove button is rendered.
   */
  onRemove?: (e: React.MouseEvent) => void;
  /**
   * Click handler. When provided, the token renders as a `<span>` container
   * with an invisible `<button>` inside for accessibility.
   */
  onClick?: (e: React.MouseEvent) => void;
  /**
   * Link URL. When provided, the token renders as an `<a>`.
   */
  href?: string;
  /**
   * Accessible description for the token.
   */
  description?: string;
  /**
   * Content rendered after the label (before the remove button, if present).
   */
  endContent?: ReactNode;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    paddingBlock: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-inner'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    maxWidth: '100%',
    overflow: 'hidden',
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  interactive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-image',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  labelHidden: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  invisibleButton: {
    cursor: {
      default: 'inherit',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    color: 'inherit',
    outline: 'none',
    overflow: 'hidden',
    minWidth: 0,
  },
  removeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding: 0,
    marginInlineEnd: `calc(-1 * ${spacingVars['--spacing-1']})`,
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-full'],
    width: '16px',
    height: '16px',
    color: 'inherit',
    '::after': {
      content: '""',
      position: 'absolute',
      inset: '-4px',
    },
  },
});

const sizeStyles = stylex.create({
  sm: {
    height: `calc(${sizeVars['--size-element-sm']} - 8px)`,
    fontSize: typeScaleVars['--text-supporting-size'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    height: `calc(${sizeVars['--size-element-md']} - 8px)`,
    paddingInline: spacingVars['--spacing-2'],
  },
  lg: {
    height: `calc(${sizeVars['--size-element-lg']} - 8px)`,
    paddingInline: spacingVars['--spacing-2'],
  },
});

const colorStyles = stylex.create({
  default: {
    backgroundColor: colorVars['--color-neutral'],
    color: colorVars['--color-text-primary'],
  },
  red: {
    backgroundColor: colorVars['--color-background-red'],
    color: colorVars['--color-text-red'],
  },
  orange: {
    backgroundColor: colorVars['--color-background-orange'],
    color: colorVars['--color-text-orange'],
  },
  yellow: {
    backgroundColor: colorVars['--color-background-yellow'],
    color: colorVars['--color-text-yellow'],
  },
  green: {
    backgroundColor: colorVars['--color-background-green'],
    color: colorVars['--color-text-green'],
  },
  teal: {
    backgroundColor: colorVars['--color-background-teal'],
    color: colorVars['--color-text-teal'],
  },
  cyan: {
    backgroundColor: colorVars['--color-background-cyan'],
    color: colorVars['--color-text-cyan'],
  },
  blue: {
    backgroundColor: colorVars['--color-background-blue'],
    color: colorVars['--color-text-blue'],
  },
  purple: {
    backgroundColor: colorVars['--color-background-purple'],
    color: colorVars['--color-text-purple'],
  },
  pink: {
    backgroundColor: colorVars['--color-background-pink'],
    color: colorVars['--color-text-pink'],
  },
  gray: {
    backgroundColor: colorVars['--color-background-gray'],
    color: colorVars['--color-text-gray'],
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A chip/tag component for displaying entities inline.
 *
 * Renders as a `<span>` by default, `<a>` when `href` is provided, or a
 * `<span>` container with an invisible `<button>` when `onClick` is provided.
 * The invisible button pattern provides real button semantics for accessibility
 * while the container uses `:focus-within` to show focus outlines around the
 * entire token. When both `href` and `onRemove` are provided, the same
 * container pattern is used with an invisible `<a>` so the remove `<button>`
 * renders as a sibling of the link rather than nested inside it.
 *
 * @example
 * ```
 * <Token label="Tag" />
 * <Token label="Status" color="green" />
 * <Token label="Removable" onRemove={() => {}} />
 * <Token label="Clickable" onClick={() => {}} />
 * <Token label="Link" href="/path" />
 * ```
 */
export function Token({
  label,
  size = 'md',
  color = 'default',
  icon,
  isDisabled = false,
  onRemove,
  onClick,
  href,
  description,
  endContent,
  isLabelHidden = false,
  xstyle,
  className,
  style,
  'data-testid': testId,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ref,
  ...rest
}: TokenProps) {
  // Constant marker props; the hook's only effect is installing the shared
  // document controller once, so the token's output stays a pure function
  // of its props.
  const pressable = usePressFeedback();
  const t = useTranslator();
  const LinkComponent = useLinkComponent();
  const role = useInteractiveRole({href, onClick, isDisabled});

  // When role is 'button' via context (no explicit onClick), treat as
  // if onClick was provided — the popover attaches its own handler.
  const effectiveOnClick = onClick ?? (role === 'button' ? () => {} : null);

  const removeButton = onRemove != null && (
    <button
      type="button"
      aria-label={t('@astryx.token.remove', {label})}
      onClick={e => {
        e.stopPropagation();
        onRemove(e);
      }}
      // Focusable while disabled (spec:AST-085 FR1), but inert (FR2).
      aria-disabled={isDisabled || undefined}
      {...(isDisabled ? disabledInteractionProps() : null)}
      {...focusOutlineProps.focusVisible(styles.removeButton)}>
      <Icon icon="close" size="xsm" color="inherit" />
    </button>
  );

  const content = (
    <>
      {icon}
      <span
        {...stylex.props(styles.label, isLabelHidden && styles.labelHidden)}>
        {label}
      </span>
      {endContent}
      {removeButton}
    </>
  );

  // Naming inputs reach the element that owns the token's action: the inner
  // button of a clickable token, otherwise the root
  // (architecture:public-component-api INV5).
  const labellingProps = {
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
  };

  const sharedProps = {
    'data-testid': testId,
    ...(isLabelHidden ? {'aria-label': label} : {}),
    ...(description != null ? {'aria-description': description} : {}),
  };

  // A disabled link keeps a focusable link with aria-disabled and no
  // destination, as a disabled Link does (spec:AST-085 FR1, FR5;
  // component:Link FR5). useInteractiveRole reports no link role once
  // disabled, so the structure is chosen here.
  const isDisabledLink = isDisabled && href != null && effectiveOnClick == null;

  if (isDisabledLink && onRemove == null) {
    // A disabled link is an <a> with no href, as Link renders one: nothing can
    // navigate, it keeps a Tab stop and the link role (spec:AST-085 FR1, FR5).
    // The router LinkComponent is skipped, since a custom router link may
    // require a live href.
    const DisabledAnchor = 'a';
    return (
      <DisabledAnchor
        ref={ref as React.Ref<HTMLAnchorElement>}
        role="link"
        aria-disabled={true}
        tabIndex={0}
        {...mergeProps(
          themeProps('token', {color, size, disabled: 'disabled'}),
          focusOutlineProps.focusVisible(
            styles.base,
            sizeStyles[size],
            colorStyles[color],
            styles.interactive,
            styles.disabled,
            xstyle,
          ),
          className,
          style,
        )}
        {...rest}
        {...labellingProps}
        {...disabledInteractionProps(rest.onKeyDown)}
        {...sharedProps}>
        {content}
      </DisabledAnchor>
    );
  }

  if (role === 'link' || isDisabledLink) {
    if (onRemove == null) {
      return (
        <LinkComponent
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href as string}
          {...pressable}
          {...mergeProps(
            themeProps('token', {
              color,
              size,
              disabled: isDisabled ? 'disabled' : null,
            }),
            focusOutlineProps.focusVisible(
              styles.base,
              sizeStyles[size],
              colorStyles[color],
              styles.interactive,
              interactionOverlayStyles.backgroundImage,
              isDisabled && styles.disabled,
              xstyle,
            ),
            className,
            style,
          )}
          {...rest}
          {...labellingProps}
          {...(isDisabled ? {'aria-disabled': true} : {})}
          {...sharedProps}>
          {content}
        </LinkComponent>
      );
    }

    // With a remove button, the link cannot be the root — nesting a <button>
    // inside an <a> is invalid HTML (WCAG 4.1.2). Delegate to TokenLink, a
    // non-presentational wrapper that renders a <span> container with the link
    // and the remove button as siblings and wires up useClickableContainer so
    // the whole token surface activates the link (including middle-click and
    // cmd/ctrl-click to open in a new tab). Token itself stays presentational
    // (no refs/effects) per the @astryx/presentational-component rule.
    return (
      <TokenLink
        ref={ref}
        href={href as string}
        isDisabled={isDisabled}
        LinkComponent={LinkComponent}
        icon={icon}
        endContent={endContent}
        removeButton={removeButton}
        linkStyleProps={stylex.props(styles.invisibleButton)}
        {...pressable}
        labelContent={
          <span
            {...stylex.props(
              styles.label,
              isLabelHidden && styles.labelHidden,
            )}>
            {label}
          </span>
        }
        {...mergeProps(
          themeProps('token', {
            color,
            size,
            disabled: isDisabled ? 'disabled' : null,
          }),
          focusOutlineProps.focusWithin(
            styles.base,
            sizeStyles[size],
            colorStyles[color],
            styles.interactive,
            interactionOverlayStyles.backgroundImage,
            isDisabled && styles.disabled,
            xstyle,
          ),
          className,
          style,
        )}
        {...rest}
        {...labellingProps}
        {...sharedProps}
      />
    );
  }

  if (effectiveOnClick != null) {
    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a')) {
        return;
      }
      effectiveOnClick(e);
    };

    return (
      <span
        ref={ref}
        onClick={isDisabled ? undefined : handleContainerClick}
        {...pressable}
        {...mergeProps(
          themeProps('token', {
            color,
            size,
            disabled: isDisabled ? 'disabled' : null,
          }),
          focusOutlineProps.focusWithin(
            styles.base,
            sizeStyles[size],
            colorStyles[color],
            styles.interactive,
            interactionOverlayStyles.backgroundImage,
            isDisabled && styles.disabled,
            xstyle,
          ),
          className,
          style,
        )}
        {...rest}
        {...sharedProps}>
        {icon}
        <button
          type="button"
          onClick={effectiveOnClick}
          {...labellingProps}
          aria-disabled={isDisabled || undefined}
          {...(isDisabled ? disabledInteractionProps() : null)}
          {...stylex.props(styles.invisibleButton)}>
          <span
            {...stylex.props(
              styles.label,
              isLabelHidden && styles.labelHidden,
            )}>
            {label}
          </span>
        </button>
        {endContent}
        {removeButton}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      {...mergeProps(
        themeProps('token', {
          color,
          size,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          styles.base,
          sizeStyles[size],
          colorStyles[color],
          isDisabled && styles.disabled,
          xstyle,
        ),
        className,
        style,
      )}
      {...rest}
      {...labellingProps}
      {...sharedProps}>
      {content}
    </span>
  );
}

Token.displayName = 'Token';
