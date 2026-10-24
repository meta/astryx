// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Lightbox.tsx
 * @input Uses React, native dialog, StyleX, IconButton, theme tokens, layerTextReset, layerStructureReset,
 *   isRtlElement (gallery arrow keys follow the rendered direction)
 * @output Exports Lightbox component, LightboxProps, LightboxMedia
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Lightbox/Lightbox.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Lightbox/Lightbox.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Lightbox/index.ts (exports if types change)
 * - /packages/core/src/Layer/useLayerDismissal.ts (dismissal stack)
 * - /apps/storybook/stories/Lightbox.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Lightbox/ (showcase blocks)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars, typeScaleVars} from '../theme/tokens.stylex';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import {useAnnounce} from '../hooks/useAnnounce';
import {useScrollLock} from '../hooks/useScrollLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {overlayPaddingReset} from '../Layout/padding.stylex';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {useTranslator} from '../i18n';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {isRtlElement} from '../hooks/isRtlElement';
/**
 * Media type for lightbox items.
 */
export type LightboxMediaType = 'image' | 'video';

/**
 * Describes a single media item in a lightbox.
 */
export interface LightboxMedia {
  /** Media source URL */
  src: string;
  /** Alt text for accessibility (used as aria-label for video) */
  alt: string;
  /** Optional caption displayed below the media */
  caption?: ReactNode;
  /**
   * Media type. Zoom/pan is disabled for video.
   * @default 'image'
   */
  type?: LightboxMediaType;
}

export interface LightboxProps extends BaseProps<HTMLDialogElement> {
  /** Ref forwarded to the root dialog element */
  ref?: React.Ref<HTMLDialogElement>;
  /**
   * Whether the lightbox is open.
   */
  isOpen: boolean;
  /**
   * Callback when the lightbox open state changes.
   * Called with `false` on Escape, backdrop click, or close button.
   */
  onOpenChange: (isOpen: boolean) => void;
  /**
   * Media to display. Pass a single object for one item, or an array
   * for gallery mode with prev/next navigation.
   */
  media: LightboxMedia | LightboxMedia[];
  /**
   * Current index in gallery mode (when `media` is an array).
   * When provided, puts the component in controlled mode.
   */
  index?: number;
  /**
   * Initial index in gallery mode for uncontrolled usage.
   * @default 0
   */
  defaultIndex?: number;
  /**
   * Callback when the gallery index changes via prev/next navigation.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Enable zoom on double-click, or Enter/Space/`+`/`-` via keyboard
   * (images only). When zoomed, drag or use arrow keys to pan.
   * @default false
   */
  hasZoom?: boolean;
  /**
   * Whether video should autoplay when the lightbox opens.
   * @default false
   */
  hasAutoPlay?: boolean;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  dialog: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    maxWidth: 'none',
    maxHeight: 'none',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    outline: 'none',
    '::backdrop': {
      backgroundColor: colorVars['--color-overlay'],
      backdropFilter: 'blur(2px)',
    },
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  mediaGroup: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },
  imageWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'default',
    userSelect: 'none',
    minHeight: 0,
  },
  imageWrapperZoomable: {
    cursor: {
      default: 'zoom-in',
      '@media (hover: hover)': 'zoom-in',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  imageWrapperZoomed: {
    cursor: {
      default: 'grab',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  imageWrapperDragging: {
    cursor: {
      default: 'grabbing',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
    transitionProperty: 'transform',
    transitionDuration: {
      default: '200ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionTimingFunction: 'ease-out',
  },
  imageDragging: {
    transitionProperty: 'none',
  },
  video: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    outline: 'none',
  },
  caption: {
    color: colorVars['--color-on-dark'],
    fontSize: typeScaleVars['--text-large-size'],
    lineHeight: typeScaleVars['--text-large-leading'],
    textAlign: 'center',
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: 0,
    paddingInline: spacingVars['--spacing-3'],
    maxWidth: '600px',
    flexShrink: 0,
  },
  closeButton: {
    position: 'absolute',
    top: spacingVars['--spacing-3'],
    insetInlineEnd: spacingVars['--spacing-3'],
    zIndex: 1,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    // The individual `translate` property, not `transform`: this style now
    // lands on the Button root, and a `transform` here replaces the Button's
    // own transform rules — measured: the `scale(0.98)` press feedback stops
    // firing. `translate` composes with them, reproducing exactly what the
    // removed wrapper element did (wrapper translated, button scaled).
    translate: '0 -50%',
    zIndex: 1,
  },
  navPrev: {
    insetInlineStart: spacingVars['--spacing-3'],
  },
  navNext: {
    insetInlineEnd: spacingVars['--spacing-3'],
  },
  counter: {
    position: 'absolute',
    top: spacingVars['--spacing-3'],
    insetInlineStart: spacingVars['--spacing-3'],
    color: colorVars['--color-on-dark'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    zIndex: 1,
  },
  controlButton: {
    color: colorVars['--color-on-dark'],
  },
});

const dynamicStyles = stylex.create({
  imageTransform: (transform: string) => ({
    transform,
  }),
});

/**
 * Pan distance (px) per arrow-key press while zoomed. Offsets move the
 * viewport in the arrow's direction — pressing ArrowRight reveals content to
 * the right, so the image itself shifts left (negative x), matching how
 * scrolling and pointer-drag panning feel.
 */
const KEYBOARD_PAN_STEP = 50;
const KEYBOARD_PAN_OFFSETS: Record<string, [number, number]> = {
  ArrowLeft: [KEYBOARD_PAN_STEP, 0],
  ArrowRight: [-KEYBOARD_PAN_STEP, 0],
  ArrowUp: [0, KEYBOARD_PAN_STEP],
  ArrowDown: [0, -KEYBOARD_PAN_STEP],
};

/**
 * A fullscreen overlay for viewing images at full resolution.
 *
 * Supports single image and gallery modes. In gallery mode, provides
 * prev/next navigation via buttons and arrow keys; the arrow keys follow
 * the writing direction (in RTL, ArrowLeft goes to the next item, like the
 * Next button on the left). Optionally supports
 * zoom (double-click, Enter/Space on the image, or `+`/`-` to toggle 2x)
 * and pan (drag or arrow keys when zoomed; arrows navigate the gallery
 * when not zoomed).
 *
 * Uses the native `<dialog>` element with `showModal()` for focus
 * trapping and top-layer placement. Dismiss via Escape, close button,
 * or backdrop click.
 *
 * @example
 * ```
 * <Lightbox
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   media={{src: "/photo.jpg", alt: "A photo"}}
 * />
 * <Lightbox
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   media={photos}
 * />
 * <Lightbox
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   media={photos}
 *   index={currentIndex}
 *   onIndexChange={setCurrentIndex}
 * />
 * ```
 */
export function Lightbox({
  isOpen,
  onOpenChange,
  media,
  index: controlledIndex,
  defaultIndex = 0,
  onIndexChange,
  hasZoom = false,
  hasAutoPlay = false,
  xstyle,
  className,
  style,
  ref,
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  ...props
}: LightboxProps) {
  const t = useTranslator();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mergedDialogRef = useMergedRefs(ref, dialogRef);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<Element | null>(null);

  // Index state (controlled + uncontrolled)
  const isControlled = controlledIndex !== undefined;
  const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultIndex);
  const index = isControlled ? controlledIndex : uncontrolledIndex;

  const setIndex = useCallback(
    (value: number) => {
      if (!isControlled) {
        setUncontrolledIndex(value);
      }
      onIndexChange?.(value);
    },
    [isControlled, onIndexChange, setUncontrolledIndex],
  );

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({x: 0, y: 0});
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({x: 0, y: 0, panX: 0, panY: 0});

  // Resolve current media item
  const mediaArray = useMemo(
    () => (Array.isArray(media) ? media : [media]),
    [media],
  );
  const isGallery = mediaArray.length > 1;
  const currentItem =
    mediaArray.length > 0
      ? mediaArray[Math.min(index, mediaArray.length - 1)]
      : null;
  const currentType = currentItem?.type ?? 'image';
  const isVideo = currentType === 'video';
  const canPrev = isGallery && index > 0;
  const canNext = isGallery && index < mediaArray.length - 1;

  // Scroll lock
  useScrollLock(isOpen);

  // A new media item starts unzoomed. Adjusted during render, so the new item
  // never paints at the previous item's zoom and pan.
  const currentSrc = currentItem?.src;
  const [viewedItem, setViewedItem] = useState({index, src: currentSrc});
  // Object.is, matching the dependency comparison of the effect this replaces:
  // a controlled index of NaN must not re-render forever.
  if (
    !Object.is(viewedItem.index, index) ||
    !Object.is(viewedItem.src, currentSrc)
  ) {
    setViewedItem({index, src: currentSrc});
    setZoom(1);
    setPan({x: 0, y: 0});
  }

  // Announce gallery navigation to screen readers. Moving between images only
  // updates the visual counter, which is silent to assistive tech, so mirror
  // each change in a polite live region ("<alt>, 3 of 12", or "Image 3 of 12"
  // when the image has no alt). Announce only when the image changes during an
  // already-open session — not on mount, not when opening (even at a new
  // index, since the dialog's aria-label already names the current image), and
  // not on close.
  const announce = useAnnounce();
  const prevIndexRef = useRef(index);
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    const indexChanged = prevIndexRef.current !== index;
    const wasOpen = wasOpenRef.current;
    prevIndexRef.current = index;
    wasOpenRef.current = isOpen;
    if (!indexChanged || !isOpen || !wasOpen) {
      return;
    }
    const item = mediaArray[Math.min(index, mediaArray.length - 1)];
    const position = {index: index + 1, total: mediaArray.length};
    announce(
      item?.alt
        ? t('@astryx.lightbox.mediaPosition', {alt: item.alt, ...position})
        : t('@astryx.lightbox.imagePosition', position),
    );
  }, [index, isOpen, announce, mediaArray, t]);

  // Open/close dialog
  useIsomorphicLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      triggerElementRef.current = document.activeElement;
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
      if (triggerElementRef.current instanceof HTMLElement) {
        triggerElementRef.current.focus();
      }
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: isOpen,
    onDismiss: handleClose,
  });

  // The native `cancel` event is the browser's own close-watcher firing: an
  // Android back gesture, or a close request the stack never saw a press for.
  // Escape presses the stack owns never arrive here — it preventDefault()s
  // those, which suppresses the close watcher.
  //
  // Always preventDefault so the browser cannot close a controlled <dialog>
  // behind React's back, then answer with the stack's own rules: top-most
  // only, and never while an IME composition is in progress.
  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (!shouldDismissOnCloseRequest()) {
        return;
      }
      handleClose();
    },
    [handleClose, shouldDismissOnCloseRequest],
  );

  // Backdrop click. The layout container fills the whole transparent dialog,
  // so clicks on the visual backdrop (the dark area around the media) land on
  // the container, never on the dialog element itself — treat both as the
  // backdrop. A pan drag that ends over the backdrop still fires a click on
  // the common ancestor; ignore it so releasing a drag doesn't dismiss.
  const didDragRef = useRef(false);
  const handleBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDialogElement>) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      if (e.target === e.currentTarget || e.target === containerRef.current) {
        handleClose();
      }
    },
    [handleClose],
  );

  // Gallery navigation
  const goToPrev = useCallback(() => {
    if (canPrev) {
      setIndex(index - 1);
    }
  }, [canPrev, index, setIndex]);

  const goToNext = useCallback(() => {
    if (canNext) {
      setIndex(index + 1);
    }
  }, [canNext, index, setIndex]);

  // Zoom: double-click, Enter/Space on the image, or +/- keys toggle 1x ↔ 2x.
  // Zoom changes are silent to assistive tech (only the transform changes), so
  // mirror them in the polite live region, including a hint that arrow keys
  // pan while zoomed.
  const applyZoom = useCallback(
    (next: number) => {
      if (!hasZoom || isVideo || next === zoom) {
        return;
      }
      setZoom(next);
      setPan({x: 0, y: 0});
      announce(
        next > 1
          ? t('@astryx.lightbox.zoomedIn')
          : t('@astryx.lightbox.zoomedOut'),
      );
    },
    [hasZoom, isVideo, zoom, announce, t],
  );

  const handleDoubleClick = useCallback(() => {
    applyZoom(zoom === 1 ? 2 : 1);
  }, [applyZoom, zoom]);

  // Keyboard navigation. While zoomed, arrows pan the image (matching common
  // lightbox conventions); when not zoomed they navigate the gallery.
  //
  // Gallery arrows follow the rendered direction, resolved at keydown: in RTL
  // the Next button sits on the left, so ArrowLeft goes to the next item and
  // ArrowRight to the previous one. Panning stays physical in both directions:
  // the image itself is not mirrored, so ArrowRight still reveals what is to
  // its right.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (hasZoom && !isVideo) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          applyZoom(2);
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          applyZoom(1);
          return;
        }
        if (zoom > 1 && KEYBOARD_PAN_OFFSETS[e.key] !== undefined) {
          e.preventDefault();
          const [dx, dy] = KEYBOARD_PAN_OFFSETS[e.key];
          setPan(prev => ({x: prev.x + dx, y: prev.y + dy}));
          return;
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const towardEnd =
          (e.key === 'ArrowRight') !== isRtlElement(dialogRef.current);
        if (towardEnd) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    },
    [hasZoom, isVideo, zoom, applyZoom, goToPrev, goToNext],
  );

  // Enter/Space on the focused image wrapper (role="button") toggles zoom.
  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDoubleClick();
      }
    },
    [handleDoubleClick],
  );

  // Pan: mouse drag when zoomed
  const handlePointerDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (zoom <= 1 || !hasZoom) {
        return;
      }
      setIsDragging(true);
      didDragRef.current = false;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [zoom, hasZoom, pan],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (e: PointerEvent) => {
      didDragRef.current = true;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  const isZoomed = zoom > 1;
  const isZoomTarget = hasZoom && !isVideo;
  const imageTransform =
    zoom === 1
      ? null
      : `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`;

  if (!currentItem) {
    return null;
  }

  return (
    <dialog
      ref={mergedDialogRef}
      onCancel={handleCancel}
      onClick={e => {
        handleBackdropClick(e);
        onClickProp?.(e);
      }}
      onKeyDown={e => {
        handleKeyDown(e);
        onKeyDownProp?.(e);
      }}
      aria-label={currentItem.alt || t('@astryx.lightbox.mediaViewer')}
      {...mergeProps(
        themeProps('lightbox'),
        stylex.props(
          layerTextReset.reset,
          layerStructureReset.reset,
          styles.dialog,
          overlayPaddingReset.reset,
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      <LayerDepthProvider>
        <LayerContentBoundary>
          <div ref={containerRef} {...stylex.props(styles.container)}>
            {/* Close button */}
            <IconButton
              icon={<Icon icon="close" size="sm" color="inherit" />}
              label={t('@astryx.lightbox.close')}
              variant="ghost"
              onClick={handleClose}
              xstyle={[styles.closeButton, styles.controlButton]}
            />

            {/* Gallery nav: prev — stays mounted and is disabled at the start of
            the range so pressing/arrowing to the boundary doesn't unmount the
            focused control and drop focus to <body>. */}
            {isGallery && (
              <IconButton
                icon={
                  <Icon
                    icon="chevronLeft"
                    size="sm"
                    color="inherit"
                    xstyle={rtlStyles.mirror}
                  />
                }
                label={t('@astryx.lightbox.previous')}
                variant="ghost"
                isDisabled={!canPrev}
                onClick={goToPrev}
                xstyle={[
                  styles.navButton,
                  styles.navPrev,
                  styles.controlButton,
                ]}
              />
            )}

            {/* Media + caption group (centered together) */}
            <div {...stylex.props(styles.mediaGroup)}>
              <div
                ref={imageWrapperRef}
                // The wrapper is a keyboard-operable zoom toggle when zoom is
                // enabled: Enter/Space toggles, aria-pressed reflects state.
                role={isZoomTarget ? 'button' : undefined}
                tabIndex={isZoomTarget ? 0 : undefined}
                aria-pressed={isZoomTarget ? isZoomed : undefined}
                aria-label={
                  isZoomTarget ? t('@astryx.lightbox.zoom') : undefined
                }
                {...stylex.props(
                  styles.imageWrapper,
                  isZoomTarget && focusOutlineStyles.focusVisible,
                  !isVideo &&
                    hasZoom &&
                    !isZoomed &&
                    styles.imageWrapperZoomable,
                  !isVideo && isZoomed && styles.imageWrapperZoomed,
                  !isVideo && isDragging && styles.imageWrapperDragging,
                )}
                onDoubleClick={isVideo ? undefined : handleDoubleClick}
                onKeyDown={isZoomTarget ? handleImageKeyDown : undefined}
                onPointerDown={isVideo ? undefined : handlePointerDown}>
                {isVideo ? (
                  <video
                    src={currentItem.src}
                    aria-label={currentItem.alt}
                    controls
                    autoPlay={hasAutoPlay}
                    {...stylex.props(styles.video)}
                  />
                ) : (
                  <img
                    src={currentItem.src}
                    alt={currentItem.alt}
                    draggable={false}
                    {...stylex.props(
                      styles.image,
                      isDragging && styles.imageDragging,
                      imageTransform != null &&
                        dynamicStyles.imageTransform(imageTransform),
                    )}
                  />
                )}
              </div>

              {currentItem.caption && (
                <div {...stylex.props(styles.caption)}>
                  {currentItem.caption}
                </div>
              )}
            </div>

            {/* Gallery nav: next — see "prev" above; stays mounted and disabled at
            the end of the range instead of unmounting. */}
            {isGallery && (
              <IconButton
                icon={
                  <Icon
                    icon="chevronRight"
                    size="sm"
                    color="inherit"
                    xstyle={rtlStyles.mirror}
                  />
                }
                label={t('@astryx.lightbox.next')}
                variant="ghost"
                isDisabled={!canNext}
                onClick={goToNext}
                xstyle={[
                  styles.navButton,
                  styles.navNext,
                  styles.controlButton,
                ]}
              />
            )}

            {/* Gallery counter */}
            {isGallery && mediaArray.length > 1 && (
              <div {...stylex.props(styles.counter)}>
                {index + 1} / {mediaArray.length}
              </div>
            )}
          </div>
        </LayerContentBoundary>
      </LayerDepthProvider>
    </dialog>
  );
}

Lightbox.displayName = 'Lightbox';
