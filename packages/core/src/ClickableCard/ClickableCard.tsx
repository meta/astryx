// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ClickableCard.tsx
 * @input Uses Card, useClickableContainer, StyleX
 * @output Exports ClickableCard component and ClickableCardProps
 * @position Interactive card for navigation or action targets
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ClickableCard/ClickableCard.doc.mjs (props table, features)
 * - /packages/core/src/ClickableCard/index.ts (exports if types change)
 * - /apps/storybook/stories/ClickableCard.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Card/ClickableCardShowcase.tsx (showcase block)
 * - /packages/cli/assets/templates/blocks/components/Card/ClickableCardWithNestedButton.tsx (block)
 * - /packages/cli/assets/templates/blocks/components/Card/ClickableCardElevated.tsx (block)
 *
 * Composes Card for all visual styling (radius, padding, variants,
 * container tokens, theming). Adds an interactive wrapper with
 * useClickableContainer for safe nested interactive elements.
 *
 * A hidden <button> or <a> inside the card provides the accessible role,
 * label, and focus ring — the card surface itself has no role/tabIndex.
 * This gives screen readers a real interactive element to announce while
 * keeping the visual hover/active overlay on the full card.
 *
 * For static display, use Card.
 * For toggle selection, use SelectableCard.
 */

import {type ReactNode, type MouseEvent, useRef, type Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import type {SizeValue, SpacingStep, Elevation} from '../utils/types';
import {mergeProps} from '../utils';
import {Card} from '../Card/Card';
import type {CardVariant} from '../Card/Card';
import {useClickableContainer} from '../hooks/useClickableContainer';
import type {BaseProps} from '../BaseProps';
import {useLinkComponent} from '../Link/useLinkComponent';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {disabledInteractionProps} from '../utils/disabledInteraction';
// =============================================================================
// Styles — only the interactive layer, Card handles everything else
// =============================================================================

// The touch press's paint, declared by the shared overlay styles on the
// element the controller writes to (`pressedAlpha`) at the press's strength,
// 1 while on and 1 → 0 over the release, and inherited resolved by the
// `::after` that paints it. See interactionOverlay.stylex.ts.
const pressedOverlayImage = 'var(--_press-paint-image)';
/** Written by the press controller while it paints a press. */
const PRESSED_ON = '[data-astryx-press="on"]';
/** Written by the press controller for the press's release. */
const PRESSED_FADING = '[data-astryx-press="fading"]';

const styles = stylex.create({
  interactive: {
    position: 'relative',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textDecoration: 'none',
    color: 'inherit',
  },
  // Hover and pressed overlay. Hover is guarded by @media (hover: hover) so
  // touch devices don't show a stuck hover state; the press has two arms,
  // `:active` for a mouse and `data-astryx-press` for the press controller.
  overlay: {
    // The `::after` layer paints the hover and mouse states as its colour,
    // `--_press-overlay`, which their arms set on the element itself (same
    // enabled guard as the shared overlay utility). The press the controller
    // paints (a finger's, and on a touch-first device a mouse's or a key's)
    // is the same layer's image, keyed on the `data-astryx-press` attribute
    // the controller writes. Every arm of that press is a plain property of
    // the `::after`, which outranks the layer's own defaults in a layered
    // stylesheet and a flat one alike. A custom property's attribute arm
    // does not: a layered build emits the property's default outside the
    // priority layers its attribute arms land in, and the default wins.
    '--_press-overlay': {
      default: 'transparent',
      ':where(:not(:disabled,[aria-disabled="true"]))': {
        default: null,
        ':active': {
          default: colorVars['--color-overlay-pressed'],
          '@media (pointer: coarse)': 'transparent',
        },
        '@media (hover: hover)': {
          default: null,
          ':hover:where(:not(:disabled,[aria-disabled="true"]))':
            colorVars['--color-overlay-hover'],
          ':active': colorVars['--color-overlay-pressed'],
        },
      },
    },
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      // A press the controller paints shows on its first frame and fades on
      // its strength's own animation, so the colour it replaces drops out at
      // once rather than crossfading: no transition while it paints. The
      // mouse states keep the fast fade.
      transitionProperty: {
        default: 'background-color',
        [PRESSED_ON]: 'none',
        [PRESSED_FADING]: 'none',
      },
      transitionDuration: durationVars['--duration-fast'],
      transitionTimingFunction: easeVars['--ease-standard'],
      // While the controller paints, the colour yields to the image: a
      // touchscreen beside a fine pointer still matches `:active` under a
      // finger, and the press would otherwise paint twice.
      backgroundColor: {
        default: 'var(--_press-overlay)',
        [PRESSED_ON]: 'transparent',
        [PRESSED_FADING]: 'transparent',
      },
      // The press at its strength, which the card's `pressedAlpha` arms own:
      // 1 on the first frame of a believed press, then 1 → 0 over the
      // release. The `::after` inherits the resolved paint and repaints with
      // it on every frame of the fade. Read only inside this element's own
      // arms, so a pressed ancestor's strength never paints here.
      backgroundImage: {
        default: null,
        [PRESSED_ON]: pressedOverlayImage,
        [PRESSED_FADING]: pressedOverlayImage,
      },
    },
  },
  // Borderless variants (everything except `default`): drop the transparent
  // 1px border Card applies. The overlay is inset to the padding box — inside
  // that border — so a transparent border strip stays untinted on hover and
  // reads as a faint ring. With no border, the overlay covers the full box
  // edge-to-edge and the ring disappears.
  borderless: {
    borderWidth: 0,
  },
  // Bordered variant (`default`): draw the 1px border *within* the padding by
  // subtracting the border width from every side. Total inset (border +
  // padding) then equals the borderless variants' padding, so content geometry
  // and outer dimensions stay identical across all variants. The border rests
  // at the subtle token and emphasizes on hover.
  bordered: {
    borderColor: colorVars['--color-border'],
    paddingInlineStart: `calc(var(--container-padding-inline-start) - ${borderVars['--border-width']})`,
    paddingInlineEnd: `calc(var(--container-padding-inline-end) - ${borderVars['--border-width']})`,
    paddingBlockStart: `calc(var(--container-padding-block-start) - ${borderVars['--border-width']})`,
    paddingBlockEnd: `calc(var(--container-padding-block-end) - ${borderVars['--border-width']})`,
    transitionProperty: 'border-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // Emphasize the bordered variant's border on hover. Guarded by
  // @media (hover: hover) so touch devices don't get a stuck hover state.
  borderedHoverOnPointer: {
    '@media (hover: hover)': {
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        borderColor: colorVars['--color-border-emphasized'],
      },
    },
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

// =============================================================================
// Props
// =============================================================================

export interface ClickableCardProps extends BaseProps {
  /** Ref forwarded to the root element. */
  ref?: Ref<HTMLDivElement>;

  /**
   * Accessibility label for the card.
   * Used as `aria-label` — provides the accessible name for screen readers.
   * When the card has visible text that serves as its label, prefer
   * passing that text here so the screen reader announcement matches.
   */
  label: string;

  /**
   * Click handler. Fires when the card surface is clicked
   * (not when nested interactive elements are clicked).
   */
  onClick?: (event: MouseEvent<HTMLElement>) => void;

  /**
   * Navigation URL. When provided, clicking the card navigates to this URL.
   * Ctrl/Cmd+click opens in a new tab.
   */
  href?: string;

  /**
   * Link target for href navigation.
   * @default '_self'
   */
  target?: string;

  /**
   * Set to true to disable the card.
   * Disabled cards keep their tab stop and expose aria-disabled; activation is
   * blocked, and disabled link cards render no live destination.
   */
  isDisabled?: boolean;

  /**
   * Content to render inside the card.
   * Can include nested interactive elements (buttons, links) — they will
   * work independently from the card's click/navigation behavior.
   */
  children?: ReactNode;

  /**
   * Internal padding of the card using the spacing scale.
   * @default 4 (16px)
   */
  padding?: SpacingStep;

  /**
   * Background color variant.
   * @default 'default'
   */
  variant?: CardVariant;

  /**
   * Resting elevation — the shadow depth the card sits at. Often raised to
   * signal that the whole card is clickable.
   * @default 'none'
   */
  elevation?: Elevation;

  /** Width of the card. */
  width?: SizeValue;

  /** Height of the card. */
  height?: SizeValue;

  /** Maximum width of the card. */
  maxWidth?: SizeValue;
}

// =============================================================================
// Component
// =============================================================================

/**
 * An interactive card that acts as a single navigation or action target.
 *
 * Composes Card for visual styling and adds an interactive layer
 * with useClickableContainer. Nested interactive elements (buttons,
 * links, inputs) work independently — clicking them does NOT trigger
 * the card's onClick or navigation.
 *
 * A visually-hidden <button> or <a> inside the card provides the
 * accessible role and label. The card surface is a plain <div> —
 * no role or tabIndex on the container.
 *
 * @compositionHint Use for cards that navigate to a detail page or trigger an action.
 * For toggle selection cards, use SelectableCard instead.
 * Nest Button or other interactive elements freely inside — they won't conflict.
 *
 * @example
 * ```
 * <ClickableCard label="Settings" href="/settings">
 *   <Text type="body" weight="bold">Settings</Text>
 *   <Text type="supporting" color="secondary">Manage your preferences</Text>
 * </ClickableCard>
 * ```
 *
 * @example
 * ```
 * <ClickableCard label="Open modal" onClick={() => setShowModal(true)}>
 *   <Text type="body">Click anywhere to open</Text>
 *   <Button label="Other action" onClick={handleOther} />
 * </ClickableCard>
 * ```
 */
export function ClickableCard({
  label,
  onClick: onClickProp,
  onMouseUp: onMouseUpProp,
  href,
  target,
  isDisabled = false,
  children,
  padding,
  variant = 'default',
  elevation = 'none',
  width,
  height,
  maxWidth,
  ref,
  xstyle: xstyleProp,
  className: classNameProp,
  style,
  ...props
}: ClickableCardProps) {
  const pressable = usePressFeedback();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactiveRef = useRef<HTMLElement | null>(null);
  const LinkComponent = useLinkComponent();

  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    interactiveRef,
    onClick: onClickProp,
    href,
    target,
    disabled: isDisabled,
  });

  const handleMouseUp = onMouseUpProp
    ? (e: MouseEvent<HTMLElement>) => {
        onMouseUp(e);
        onMouseUpProp(e);
      }
    : onMouseUp;

  const isLink = href != null;

  // Only the `default` variant has a visible border. Card draws a transparent
  // 1px border on every other variant purely to avoid layout jitter; we drop
  // it here so the hover overlay covers the full box with no untinted ring.
  const hasBorder = variant === 'default';

  return (
    <Card
      ref={useMergedRefs(ref, containerRef)}
      {...(isDisabled ? undefined : pressable)}
      width={width}
      height={height}
      maxWidth={maxWidth}
      padding={padding}
      variant={variant}
      elevation={elevation}
      {...mergeProps(
        themeProps('clickable-card', {variant}),
        focusOutlineProps.focusWithin(),
        classNameProp,
        style,
      )}
      xstyle={
        [
          styles.interactive,
          hasBorder ? styles.bordered : styles.borderless,
          !isDisabled && styles.overlay,
          // The touch press's strength and release, on the element the
          // controller writes to; the `::after` above paints off it.
          !isDisabled && interactionOverlayStyles.pressedAlpha,
          !isDisabled && hasBorder && styles.borderedHoverOnPointer,
          isDisabled && styles.disabled,
          xstyleProp,
        ] as unknown as StyleXStyles
      }
      onClick={!isDisabled ? onClick : undefined}
      onMouseUp={!isDisabled ? handleMouseUp : undefined}
      {...props}>
      {isLink ? (
        <LinkComponent
          ref={interactiveRef as React.Ref<HTMLAnchorElement>}
          href={isDisabled ? undefined : href}
          target={isDisabled ? undefined : target}
          role={isDisabled ? 'link' : undefined}
          {...(isDisabled ? disabledInteractionProps() : null)}
          aria-label={label}
          aria-disabled={isDisabled || undefined}
          // A disabled card keeps its Tab stop (spec:AST-085 FR1).
          tabIndex={0}
          {...stylex.props(styles.srOnly)}
        />
      ) : (
        <button
          ref={interactiveRef as React.Ref<HTMLButtonElement>}
          type="button"
          aria-label={label}
          aria-disabled={isDisabled || undefined}
          onClick={onClickProp}
          // Focusable while disabled (FR1), but inert (FR2).
          {...(isDisabled ? disabledInteractionProps() : null)}
          {...stylex.props(styles.srOnly)}
        />
      )}
      {children}
    </Card>
  );
}

ClickableCard.displayName = 'ClickableCard';
