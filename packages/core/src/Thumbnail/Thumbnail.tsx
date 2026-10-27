// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Thumbnail.tsx
 * @input Uses React, stylex, Button, Skeleton, Spinner
 * @output Exports Thumbnail component, ThumbnailProps
 * @position Core implementation; consumed by index.ts
 *
 * Square preview card for image attachments. Shows a skeleton shimmer while
 * the image loads, the image on success, or a placeholder on failure.
 * The overlaid remove button sits on a fixed --color-overlay scrim with an
 * --color-on-dark icon so it always has sufficient contrast against the image.
 *
 * Images without `alt` are explicitly decorative (alt="" +
 * role="presentation" + aria-hidden, matching Avatar). A dev-time warning
 * fires once when `src` is set with no `alt` and no other name source.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Thumbnail/Thumbnail.doc.mjs
 * - /packages/core/src/Thumbnail/Thumbnail.test.tsx
 * - /packages/core/src/Thumbnail/index.ts
 * - /apps/storybook/stories/Thumbnail.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Thumbnail/ (showcase blocks)
 */

import {useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  spacingVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {Skeleton} from '../Skeleton';
import {Spinner} from '../Spinner';
import {Tooltip} from '../Tooltip/Tooltip';
import {useDevWarning} from '../hooks/useDevWarning';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useContainerReveal} from '../hooks/useContainerReveal';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useTranslator} from '../i18n';

export interface ThumbnailProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Image source for the thumbnail preview.
   * Shows a skeleton while loading, the image on success, or a placeholder on error.
   */
  src?: string;
  /**
   * Alt text for the image.
   *
   * When omitted, the image is explicitly decorative (`alt=""` +
   * `role="presentation"` + `aria-hidden`, matching Avatar) and hidden from
   * assistive technology. Provide `alt` whenever the image conveys content;
   * without it, screen reader users only hear the `label` (file name), or a
   * generic "thumbnail" if `label` is also missing — which triggers a
   * dev-time warning.
   */
  alt?: string;
  /**
   * Accessible label for the thumbnail (e.g. file name).
   * Not rendered visually — shown in a tooltip on hover, exposed as the
   * accessible name of the thumbnail group, and used as the accessible
   * name for the remove button.
   */
  label?: string;
  /**
   * Callback when the remove button is clicked.
   * When provided, an overlaid close button appears in the top-right corner.
   */
  onRemove?: (e: React.MouseEvent) => void;
  /**
   * Click handler for opening a lightbox or detail view.
   * When provided, the thumbnail renders as interactive.
   */
  onClick?: (e: React.MouseEvent) => void;
  /**
   * Content rendered below the thumbnail image area.
   * Use for metadata like file size, duration, or status.
   */
  /**
   * Whether the thumbnail is in a loading state.
   * Shows a skeleton shimmer regardless of `src`. Use while uploading
   * or processing before an image URL is available.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Whether the thumbnail is in a disabled state.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * When the remove button is visible.
   * - `'hover'` — the button is revealed on hover, and on keyboard focus so
   *   it stays reachable. On any touch-capable device it stays visible.
   *   This is the default.
   * - `'always'` — the button is always shown.
   *
   * Only has an effect when `onRemove` is set.
   * @default 'hover'
   */
  showRemoveOn?: 'always' | 'hover';
  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
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
  root: {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    width: 64,
    flexShrink: 0,
    isolation: 'isolate',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1',
    borderRadius: radiusVars['--radius-element'],
    overflow: 'hidden',
    backgroundColor: colorVars['--color-neutral'],
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  insetBorder: {
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    boxShadow: `inset 0 0 0 1px ${colorVars['--color-border']}`,
    pointerEvents: 'none',
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    color: colorVars['--color-icon-secondary'],
  },
  interactive: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // Hover and pressed overlay — the exact same treatment as ClickableCard and
  // SelectableCard. A transparent `::after` tints on hover/press instead of
  // shifting shadow or opacity. Guarded by @media (hover: hover) so touch
  // devices don't show a stuck hover state; active/pressed works everywhere.
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
      borderRadius: 'inherit',
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
      // The press at its strength, which the container's `pressedAlpha` arms
      // own: 1 on the first frame of a believed press, then 1 → 0 over the
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
  interactiveButton: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: radiusVars['--radius-element'],
    overflow: 'hidden',
  },

  removeSlot: {
    position: 'absolute',
    top: spacingVars['--spacing-1'],
    insetInlineEnd: spacingVars['--spacing-1'],
    zIndex: 1,
    lineHeight: 0,
  },
  removeButtonOverrides: {
    '--_button-radius': `calc(${radiusVars['--radius-element']} - ${spacingVars['--spacing-1']})`,
    position: 'relative',
    height: 20,
    minWidth: 20,
    // Fixed colors instead of luminance-adapting theme: a translucent scrim
    // (--color-overlay) plus an --color-on-dark icon reads on any image
    // without sampling pixel brightness.
    backgroundColor: colorVars['--color-overlay'],
    color: colorVars['--color-on-dark'],
    '--_thumbnail-hit-inset': {
      default: '0px',
      '@media (pointer: coarse)': '-2px',
    },
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 'var(--_thumbnail-hit-inset)',
    },
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none' as const,
  },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colorVars['--color-overlay'],
    borderRadius: 'inherit',
    zIndex: 1,
    lineHeight: 0,
  },
});

// =============================================================================
// Placeholder icon — a simple image silhouette
// =============================================================================

function ImagePlaceholder() {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true">
      <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2M8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-5.5z" />
    </svg>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * A square thumbnail preview for image attachments.
 *
 * Shows a skeleton shimmer while the image loads, the image on success, or
 * a placeholder icon on failure / when no src is provided. An overlaid
 * remove button appears when `onRemove` is set — revealed on hover or
 * keyboard focus by default (`showRemoveOn`), or always shown.
 *
 * The remove button uses a fixed `--color-overlay` scrim with an
 * `--color-on-dark` icon so it stays legible on any image without sampling
 * the image's luminance.
 *
 * @example
 * ```
 * <Thumbnail src="/photo.jpg" alt="Vacation photo" onRemove={() => {}} />
 * <Thumbnail src="/preview.png" alt="Preview" onClick={() => {}} label="preview.png" />
 * <Thumbnail src="/logo.png" alt="Logo" onRemove={() => {}} showRemoveOn="always" />
 * ```
 */
export function Thumbnail({
  src,
  alt,
  label,
  onRemove,
  onClick,
  isLoading = false,
  isDisabled = false,
  showRemoveOn = 'hover',
  xstyle,
  className,
  style,
  'data-testid': testId,
  ref,
  ...props
}: ThumbnailProps) {
  const pressable = usePressFeedback();
  const t = useTranslator();

  // Track the exact src that failed (rather than a boolean) so a changed src
  // gets a fresh load attempt instead of the stale error.
  const [erroredSrc, setErroredSrc] = useState<string | undefined>(undefined);

  const hasSrc = src != null;
  const hasError = hasSrc && erroredSrc === src;
  const showSkeleton = isLoading && !hasSrc;
  const showImage = hasSrc && !showSkeleton && !hasError;
  const showUploadOverlay = isLoading && hasSrc;
  const uploadOverlayRef = useRef<HTMLDivElement>(null);
  // The upload Spinner is decorative; the thumbnail announces its busy start
  // instead (spec:AST-086 FR8).
  useBusyAnnouncement(
    showUploadOverlay,
    t('@astryx.spinner.loading'),
    uploadOverlayRef,
  );
  const showPlaceholder = (!isLoading && !hasSrc) || hasError;
  const isInteractive = onClick != null && !isDisabled && !isLoading;
  // Open and Remove stay mounted while they cannot act, inert and announced
  // as disabled, so a focused one keeps focus (spec:AST-085 FR1, FR4, FR6).
  const hasOpen = onClick != null;
  const hasRemove = onRemove != null;
  const isHoverReveal = hasRemove && showRemoveOn === 'hover';
  const {getContainerProps, getContentRevealProps} = useContainerReveal({
    isEnabled: isHoverReveal,
  });
  const accessibleName =
    label && alt
      ? `${label} — ${alt}`
      : (label ?? alt ?? t('@astryx.thumbnail.fallbackName'));

  // Without `alt`, the image is explicitly decorative rather than silently
  // empty-alt, matching Avatar's handling of unnamed images.
  const isImageDecorative = !alt;

  // Dev-time guardrail: `src` with no `alt` hides the image from assistive
  // technology. That is fine when the thumbnail is otherwise named — `label`
  // (or a consumer-provided aria name) becomes the group's accessible name —
  // but with no name source at all the group falls back to a generic
  // "thumbnail".
  const hasNameSource =
    alt != null ||
    label != null ||
    props['aria-label'] != null ||
    props['aria-labelledby'] != null;
  useDevWarning(
    'Thumbnail',
    '`src` is set without `alt` or `label`. The image is ' +
      'treated as decorative and hidden from assistive technology, and ' +
      'the thumbnail falls back to a generic "thumbnail" name. Pass ' +
      '`alt` to describe the image content, or `label` (file name) to ' +
      'name the thumbnail.',
    hasSrc && !hasNameSource,
  );

  const imageContent = (
    <>
      {showImage && (
        <img
          src={src}
          alt={alt ?? ''}
          role={isImageDecorative ? 'presentation' : undefined}
          aria-hidden={isImageDecorative || undefined}
          onError={() => setErroredSrc(src)}
          {...stylex.props(styles.image)}
        />
      )}
      {showSkeleton && <Skeleton radius={2} />}
      {showPlaceholder && (
        <div {...stylex.props(styles.placeholder)}>
          <ImagePlaceholder />
        </div>
      )}
    </>
  );

  const removeButtonEl = hasRemove ? (
    <div
      {...mergeProps(
        stylex.props(styles.removeSlot),
        // The remove button is absolutely positioned in the corner, so it is
        // already out of flow — an opacity-only reveal (layout preserved)
        // matches its overlay placement instead of the clip recipe.
        isHoverReveal ? getContentRevealProps({isLayoutPreserved: true}) : {},
      )}>
      <Button
        icon={<Icon icon="close" size="xsm" />}
        label={t('@astryx.thumbnail.remove', {accessibleName})}
        variant="secondary"
        size="sm"
        isIconOnly
        aria-disabled={isDisabled ? 'true' : undefined}
        onKeyDown={isDisabled ? suppressActivationKeys : undefined}
        onClick={e => {
          e.stopPropagation();
          if (!isDisabled) {
            onRemove(e);
          }
        }}
        xstyle={styles.removeButtonOverrides}
      />
    </div>
  ) : null;

  const thumbnail = (
    <div
      ref={ref}
      data-testid={testId}
      role="group"
      aria-label={accessibleName}
      {...mergeProps(
        themeProps('thumbnail'),
        stylex.props(styles.root, isDisabled && styles.disabled, xstyle),
        className,
        style,
      )}
      {...props}>
      <div
        {...(isInteractive ? pressable : undefined)}
        {...mergeProps(
          focusOutlineProps.focusWithin(
            styles.imageContainer,
            isInteractive && styles.interactive,
            isInteractive && styles.overlay,
            // The touch press's strength and release, on the element the
            // controller writes to; the `::after` above paints off it.
            isInteractive && interactionOverlayStyles.pressedAlpha,
          ),
          isHoverReveal ? getContainerProps() : {},
        )}>
        {hasOpen ? (
          <button
            type="button"
            onClick={isInteractive ? onClick : stopInertPress}
            onKeyDown={isInteractive ? undefined : suppressActivationKeys}
            aria-label={t('@astryx.thumbnail.open', {accessibleName})}
            aria-disabled={isInteractive ? undefined : 'true'}
            {...stylex.props(styles.interactiveButton)}>
            {imageContent}
          </button>
        ) : (
          imageContent
        )}
        {showImage && <div {...stylex.props(styles.insetBorder)} />}
        {showUploadOverlay && (
          <div ref={uploadOverlayRef} {...stylex.props(styles.uploadOverlay)}>
            <Spinner size="sm" shade="onMedia" aria-hidden="true" />
          </div>
        )}
        {removeButtonEl}
      </div>
    </div>
  );

  if (label != null) {
    return <Tooltip content={label}>{thumbnail}</Tooltip>;
  }

  return thumbnail;
}

Thumbnail.displayName = 'Thumbnail';

/**
 * Enter and Space on an inert action dispatch no click at all, so no listener
 * anywhere receives one (spec:AST-085 FR2), as Button does for its own
 * aria-disabled state.
 */
function suppressActivationKeys(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
  }
}

/**
 * A click that still reaches an inert Open (a pointer, or assistive
 * technology dispatching one) calls nothing and stops here, so an ancestor's
 * click handler does not take it either (spec:AST-085 FR2).
 */
function stopInertPress(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}
