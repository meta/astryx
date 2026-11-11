// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Lightbox.tsx
 * @input Uses React, native dialog, StyleX, IconButton, theme tokens, layerTextReset, layerStructureReset,
 *   and isRtlElement (gallery arrow keys follow the rendered direction). The
 *   zoom uses useZoomCore and useZoomStage, a gallery pages with usePager,
 *   and the drag to dismiss fades the backdrop and controls on the animator
 * @output Exports Lightbox component, LightboxProps, LightboxMedia
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Lightbox/Lightbox.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Lightbox/Lightbox.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Lightbox/useZoomCore.ts (the zoom stage for every pointer)
 * - /packages/core/src/Lightbox/useZoomStage.ts (the gestures, for every pointer)
 * - /packages/core/src/Lightbox/__tests__/LightboxZoom.interaction.browser.spec.ts (touch zoom proofs)
 * - /packages/core/src/Lightbox/__tests__/LightboxPaging.interaction.browser.spec.ts (gallery paging proofs)
 * - /packages/core/src/Lightbox/index.ts (exports if types change)
 * - /packages/core/src/Layer/useLayerDismissal.ts (dismissal stack)
 * - /apps/storybook/stories/Lightbox.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Lightbox/ (showcase blocks)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ComponentProps,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  focusVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Icon} from '../Icon';
import {IconButton} from '../IconButton';
import {announceInModal} from '../hooks/useAnnounce';
import {useScrollLock} from '../hooks/useScrollLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useAttachment} from '../hooks/useAttachment';
import {observeResize} from '../utils/sharedResizeObserver';
import {mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {layerTextReset} from '../Layer/layerTextReset.stylex';
import {layerStructureReset} from '../Layer/layerStructureReset.stylex';
import {LayerContentBoundary} from '../Layer/layerScopedContext';
import {layerClickBoundary} from '../Layer/layerClickBoundary';
import {ModalAnnounceProvider} from '../hooks/ModalAnnounceProvider';
import {overlayPaddingReset} from '../Layout/overlayPaddingReset.stylex';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {useFocusRegionContainment} from '../hooks/useFocusTrap';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {isRtlElement} from '../hooks/isRtlElement';
import {useZoomCore} from './useZoomCore';
import {usePager} from '../hooks/usePager';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import type {GestureTouch} from '../gestures/types';
import {useGestureRecognizer} from '../gestures/useGestureRecognizer';
import {resolveMotion} from '../motion/resolveMotion';
import {springs} from '../motion/uikit/springs';
import {zoomMedia} from '../motion/uikit/zoomMedia';
import {useZoomStage} from './useZoomStage';
import {useTouchPresentation} from '../utils/touchPresentation';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Lightbox/Lightbox.generated';
import {isRenderable} from '../utils/isRenderable';
import {prepareFocusReturnOnRemoval} from '../utils/focusReturn';
import {animatorFor, type Animator} from '../motion/animator';
import {dismissBackdropAlpha, dismissChromeAlpha} from './zoomStage';

registerEnglishFallback(english);
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
   * Callback when the gallery index changes: the previous and next buttons,
   * the arrow keys or a swipe.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Enable zoom (images only). A pinch or a ctrl-wheel zooms about the
   * fingers or the pointer. A double tap fills the viewer and a double-click
   * zooms 2×, about that point, and the next goes back. Enter, Space, `+` and
   * `-` zoom 2× about the centre and back, and `0` returns to the fitted
   * size. When zoomed, drag or scroll a trackpad to pan, or use the arrow
   * keys. On a phone or a tablet, the pan has momentum. The gestures work
   * for every pointer.
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

/** Set on the stage while a mouse or a pen hovers over the fitted photo. */
const OVER_PHOTO_ATTRIBUTE = 'data-lightbox-over-photo';

const styles = stylex.create({
  dialog: {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    // The dynamic viewport: the height a mobile browser shows. Its 100vh is
    // the large viewport, measured with the toolbars retracted, so a viewer
    // that tall runs under Safari's bottom toolbar and hides the caption.
    height: stylex.firstThatWorks('100dvh', '100vh'),
    maxWidth: 'none',
    maxHeight: 'none',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    outline: 'none',
    // The backdrop is the theme's overlay colour over a 2 px blur. A drag to
    // dismiss and its release remove the blur through
    // `--_lightbox-backdrop-filter`. A full-viewport blur repainted every
    // frame of the fade drops frames.
    '::backdrop': {
      backgroundColor: colorVars['--color-overlay'],
      backdropFilter: 'var(--_lightbox-backdrop-filter, blur(2px))',
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
    // ZOOM_DISMISSING_ATTRIBUTE on the stage inside: a photo dragged to
    // dismiss draws outside the box that hugs it.
    overflow: {default: 'hidden', ':has([data-zoom-dismissing])': 'visible'},
  },
  // A zoomable photo's stage fills the viewer for every pointer, as a photo
  // viewer's zooming scroll view does. A zoomed photo uses the whole screen,
  // and a pinch can start anywhere around it. Only a zoom target does this:
  // around any other item, a tap on the dark area still closes the viewer.
  mediaGroupZoom: {
    alignSelf: 'stretch',
    flexGrow: 1,
    minHeight: 0,
  },
  imageWrapperFill: {
    alignSelf: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  // The filling stage's group clips, so its focus ring sits inside its edge.
  imageWrapperFocusInset: {
    outlineOffset: {
      default: '0',
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
  imageWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // ZOOM_DISMISSING_ATTRIBUTE, on this stage or a gallery page's: a photo
    // dragged to dismiss draws outside it, above its caption and below the
    // controls. The drag fades the caption, which makes it a stacking context
    // painted after the stage.
    overflow: {
      default: 'hidden',
      ':is([data-zoom-dismissing])': 'visible',
      ':has([data-zoom-dismissing])': 'visible',
    },
    zIndex: {default: null, ':is([data-zoom-dismissing])': 1},
    cursor: 'default',
    userSelect: 'none',
    minHeight: 0,
  },
  // The stage's own pinch, pan and double tap take every touch on it,
  // whatever the primary pointer. Only the stage does: the controls and
  // caption leave pinch-zoom to the page. It fills the viewer (mediaGroupZoom,
  // imageWrapperFill).
  imageWrapperZoomTarget: {
    touchAction: 'none',
  },
  // In a gallery the photo rows take the stage's touches, for every pointer
  // (as imageWrapperZoomTarget). A descendant cannot allow what an ancestor's
  // `touch-action` rules out. So the track allows only the page's pinch-zoom,
  // and a pinch on a caption still zooms the page. The pager's pan manages the
  // stage's own `touch-action`.
  trackZoomTarget: {
    touchAction: 'pinch-zoom',
  },
  // A zoomable page's photo box fills the page above its caption, as a
  // single item's stage does.
  pageMediaZoomTarget: {
    touchAction: 'none',
    alignSelf: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  // In the touch presentation, a photo without zoom leaves pinch-zoom to the
  // page but takes one-finger drags. A drag down dismisses it.
  imageWrapperDismissTarget: {
    touchAction: 'pinch-zoom',
  },
  // A gallery's stage is the pager's viewport: it fills the viewer on every
  // presentation, so its pages have a size of their own.
  mediaGroupGallery: {
    alignSelf: 'stretch',
    flexGrow: 1,
    minHeight: 0,
  },
  imageWrapperGallery: {
    alignSelf: 'stretch',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    position: 'relative',
  },
  // The pages stack in the track's one cell, each offset by its relative
  // inset.
  track: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    gridTemplateColumns: '100%',
    gridTemplateRows: '100%',
  },
  // One page per item, the stage's size, at index × (width + gap). A page
  // lays out its photo and caption as a single item does: the caption right
  // under the photo, and the pair centred. Each page has its own layer.
  // Through a busy main thread, Mobile Safari moves the track but cannot
  // paint what it had not painted. So a page that slides in must be painted
  // whole before it moves.
  page: {
    position: 'relative',
    gridArea: '1 / 1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    willChange: 'transform',
  },
  // A page's photo box: the zoom stage of the current page.
  pageMedia: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // As the single item's stage, while a photo is dragged to dismiss.
    overflow: {default: 'hidden', ':is([data-zoom-dismissing])': 'visible'},
    zIndex: {default: null, ':is([data-zoom-dismissing])': 1},
    minHeight: 0,
    minWidth: 0,
    maxWidth: '100%',
  },
  // A fitted photo's zoom-in cursor shows only over the photo, where the
  // stage sets OVER_PHOTO_ATTRIBUTE. Beside it, a click closes the viewer.
  imageWrapperZoomable: {
    cursor: {
      default: 'default',
      ':is([data-lightbox-over-photo])': 'zoom-in',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  imageWrapperZoomed: {
    cursor: {
      default: 'grab',
      // ZOOM_DRAGGING_ATTRIBUTE, set by the stage while a drag moves the photo.
      ':is([data-zoom-dragging])': 'grabbing',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    pointerEvents: 'none',
    // The zoom stage scales the photo about its top-left corner and moves it
    // with the individual `scale` and `translate` properties.
    transformOrigin: '0 0',
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
    // The individual `translate` property, not `transform`. This style lands
    // on the Button root, or on its backing with zoom. A `transform` on the
    // Button root would replace its own transform rules: measured, the
    // `scale(0.98)` press feedback stops firing. `translate` composes with them.
    translate: '0 -50%',
    zIndex: 1,
  },
  navPrev: {
    insetInlineStart: spacingVars['--spacing-3'],
  },
  navNext: {
    insetInlineEnd: spacingVars['--spacing-3'],
  },
  // The counter takes its own clicks in the click-through layer, so a click
  // on it leaves the viewer open.
  counter: {
    position: 'absolute',
    top: spacingVars['--spacing-3'],
    insetInlineStart: spacingVars['--spacing-3'],
    color: colorVars['--color-on-dark'],
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    zIndex: 1,
    pointerEvents: 'auto',
  },
  controlButton: {
    color: colorVars['--color-on-dark'],
    pointerEvents: 'auto',
  },
  // The controls sit in layers over the viewer that pass clicks through. A
  // drag to dismiss fades the layers, which carry no transition of their own,
  // since a Button's opacity transition would trail the finger.
  // They sit above the stage, even a photo dragged to dismiss. While a fade
  // writes their opacity, each is a stacking context. A gallery's positioned
  // pages, later in tree order, would otherwise cover them and take the taps
  // meant for the controls.
  chromeLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
  // With zoom a photo can lie under the controls. Lightbox's own translucent
  // backing keeps them readable over any photo: 3:1 for the buttons, 4.5:1
  // for the counter's text. A theme restyles the buttons, not the backing.
  controlBacking: {
    display: 'inline-flex',
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-on-light']} 75%, transparent)`,
    borderRadius: radiusVars['--radius-full'],
  },
  controlIcon: {
    color: colorVars['--color-on-dark'],
  },
  counterBacking: {
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-on-light']} 75%, transparent)`,
    borderRadius: radiusVars['--radius-full'],
    paddingInline: spacingVars['--spacing-2'],
  },
});

const pageStyles = stylex.create({
  position: (index: number) => ({
    insetInlineStart: `calc(${index} * (100% + ${zoomMedia.viewer.pageGap}px))`,
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

/** The height of a video's native controls, px: no browser reports it. */
const VIDEO_CONTROLS_BAND = 48;

/**
 * A fullscreen overlay for viewing images and videos at full resolution.
 *
 * Supports single image and gallery modes. In gallery mode, it provides
 * prev/next navigation via buttons and arrow keys. The arrow keys follow the
 * writing direction: in RTL, ArrowLeft goes to the next item, like the Next
 * button on the left.
 *
 * Optionally supports zoom like a photo viewer. A pinch or a ctrl-wheel zooms
 * about the fingers or the pointer, gives past the limits and springs back. A
 * double tap or a double-click zooms in at that point and back. Enter or
 * Space on the image, and `+` or `-` from the keyboard, zoom too, and `0`
 * returns to the fitted size. When zoomed, a drag or a trackpad's scroll
 * pans. On a phone or a tablet, the pan has momentum and a rubber band at the
 * edges. The arrow keys pan a zoomed photo and navigate the gallery
 * otherwise.
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
  const t = useComponentTranslator();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mergedDialogRef = useMergedRefs(ref, dialogRef);
  // Native showModal() lets Tab leave for the browser's own UI, so the shared
  // module wraps it.
  useFocusRegionContainment(dialogRef, isOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // A gallery's zoom stage: the current page's photo box.
  const pageMediaRef = useRef<HTMLDivElement>(null);
  const triggerElementRef = useRef<Element | null>(null);

  // Index state (controlled + uncontrolled)
  const isControlled = controlledIndex !== undefined;
  const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultIndex);
  const requestedIndex = isControlled ? controlledIndex : uncontrolledIndex;

  const setIndex = useCallback(
    (value: number) => {
      if (!isControlled) {
        setUncontrolledIndex(value);
      }
      onIndexChange?.(value);
    },
    [isControlled, onIndexChange, setUncontrolledIndex],
  );

  // Whether the photo is zoomed: a discrete state for aria-pressed and the
  // cursor. The zoom and pan themselves live outside React (useZoomCore,
  // useZoomStage).
  const [isZoomed, setIsZoomed] = useState(false);

  // Resolve current media item
  const mediaArray = useMemo(
    () => (Array.isArray(media) ? media : [media]),
    [media],
  );
  const isGallery = mediaArray.length > 1;
  // The item shown is current in every respect: its page, the counter, the
  // pager and the announcement.
  const wholeIndex = Number.isNaN(requestedIndex)
    ? 0
    : Math.round(requestedIndex);
  const index = Math.max(0, Math.min(wholeIndex, mediaArray.length - 1));
  const currentItem = mediaArray.length > 0 ? mediaArray[index] : null;
  const currentType = currentItem?.type ?? 'image';
  const isVideo = currentType === 'video';
  const canPrev = isGallery && index > 0;
  const canNext = isGallery && index < mediaArray.length - 1;

  // Scroll lock
  useScrollLock(isOpen);

  // A new media item starts unzoomed. Adjusted during render, so the new item
  // never paints as zoomed; the stage resets the photo before it paints.
  const currentSrc = currentItem?.src;
  const [viewedItem, setViewedItem] = useState({index, src: currentSrc});
  if (
    !Object.is(viewedItem.index, index) ||
    !Object.is(viewedItem.src, currentSrc)
  ) {
    setViewedItem({index, src: currentSrc});
    setIsZoomed(false);
  }

  // Announce gallery navigation to screen readers. Moving between images only
  // updates the visual counter, which is silent to assistive tech, so mirror
  // each change in a polite live region ("<alt>, 3 of 12", or "Image 3 of 12"
  // when the image has no alt). Announce only when the image changes during an
  // already-open session — not on mount, not when opening (even at a new
  // index, since the dialog's aria-label already names the current image), and
  // not on close.
  // While the modal viewer is open, a screen reader reads only messages
  // inside it.
  const announce = useCallback((message: string) => {
    const dialog = dialogRef.current;
    if (dialog != null) {
      announceInModal(dialog, message);
    }
  }, []);
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
    const item = mediaArray[index];
    const position = {index: index + 1, total: mediaArray.length};
    announce(
      item?.alt
        ? t('@astryx.lightbox.mediaPosition', {alt: item.alt, ...position})
        : t('@astryx.lightbox.imagePosition', position),
    );
  }, [index, isOpen, announce, mediaArray, t]);

  // A video left on another page stops: the pager keeps the neighbours
  // mounted, and a playing one would go on, with its sound, off screen. With
  // `hasAutoPlay`, the video paged to plays again, as a newly shown one does.
  // The closed dialog keeps them mounted too, so closing stops a playing
  // video. A single video has no page element. Play looks only in the media
  // box: a caption can contain its own video, and that one stays put.
  useEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    if (!isOpen) {
      for (const video of container.querySelectorAll<HTMLVideoElement>(
        'video',
      )) {
        if (!video.paused) {
          video.pause();
        }
      }
      return;
    }
    for (const video of container.querySelectorAll<HTMLVideoElement>(
      '[data-lightbox-page]:not([data-current]) video',
    )) {
      if (!video.paused) {
        video.pause();
      }
    }
    const onAPage = container.querySelector('[data-lightbox-page]') != null;
    const current = onAPage
      ? container.querySelector<HTMLVideoElement>(
          '[data-lightbox-page][data-current] [data-lightbox-page-media] video',
        )
      : (imageWrapperRef.current?.querySelector<HTMLVideoElement>('video') ??
        null);
    if (hasAutoPlay && current != null && current.paused) {
      // A browser can refuse playback without a user's gesture.
      void current.play()?.catch(() => {});
    }
  }, [index, hasAutoPlay, isOpen]);

  // The backdrop, the controls and the pages a dismissal faded, to restore
  // exactly those. A page faded as a neighbour may be the current one when
  // the viewer opens again.
  const fadedRef = useRef<Animator[]>([]);
  // Set when a dismissal has asked the caller to close; the next render
  // (one more is asked for) reads the caller's answer.
  const dismissalAnsweredRef = useRef(false);
  const [, renderAfterDismissal] = useReducer((n: number) => n + 1, 0);

  // Drag to dismiss, as in Photos. The backdrop fades with the drag's travel,
  // and the controls and the neighbouring photos fade faster. A dismissal
  // fades them out on its spring and closes once the photo has left.
  // The backdrop's blur comes off while the backdrop moves and comes back
  // once it rests, through the dialog's '::backdrop' style. Each move counts:
  // a release's end restores it only if nothing has moved the backdrop since.
  const backdropMovesRef = useRef(0);
  const setBackdropMoving = useCallback((moving: boolean) => {
    const dialog = dialogRef.current;
    if (moving) {
      dialog?.style.setProperty('--_lightbox-backdrop-filter', 'none');
    } else {
      dialog?.style.removeProperty('--_lightbox-backdrop-filter');
    }
  }, []);

  // Open/close dialog. The dialog renders only with an item, so a viewer
  // opened before its first item arrives opens when that item does.
  const hasItem = currentItem != null;
  // Syncs the native dialog with `isOpen` through `showModal()` and `close()`.
  useIsomorphicLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !hasItem) {
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
  }, [isOpen, hasItem]);

  // A viewer that unmounts while open (rendered only while open, or removed
  // with the rest of a view) never runs the close branch above. Focus the
  // removal lost goes back to the opener while the opener is still on the
  // page.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null) {
      return;
    }
    const returnFocusOnRemoval = prepareFocusReturnOnRemoval(dialog);
    return () => {
      if (dialog.open) {
        returnFocusOnRemoval(triggerElementRef.current);
      }
    };
  }, [hasItem]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: isOpen,
    onDismiss: handleClose,
    // The dialog's document is this layer's: rendered into an iframe or a
    // Picture-in-Picture window, it ranks with the layers opened inside it.
    getContainer: () => dialogRef.current,
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
      // A cancel that bubbles up from inside (a dismissed file picker) is not
      // a close request; the platform's is fired at the dialog itself.
      if (e.target !== e.currentTarget) {
        return;
      }
      e.preventDefault();
      if (!shouldDismissOnCloseRequest()) {
        return;
      }
      handleClose();
    },
    [handleClose, shouldDismissOnCloseRequest],
  );

  // The last press's pointer type, which the browser's `dblclick` does not
  // carry. A finger's double tap is the stage's own. A mouse's or a pen's is
  // the browser's `dblclick`.
  const pointerTypeRef = useRef('');
  // Where the last press on the media started, which a click does not carry.
  const pressPointRef = useRef<{x: number; y: number} | null>(null);
  // Without zoom, a click on the dark area lands on the container or the
  // dialog, and both close. A finger's tap on a gallery's stage, or on the
  // zoom stage beside the photo, closes on the stage's own tap. So does its
  // tap on the media group's strip below a single photo's stage. A mouse's or
  // a pen's click closes only outside the media (`isClickOutsideMedia`). A
  // zoomed drag sets `didDragRef`, so its click is ignored. The next press
  // clears the flag, and a finger's only on the stage.
  const didDragRef = useRef(false);
  const mediaGroupRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  // Whether a mouse's or a pen's click on the media closes the viewer. It
  // does when its press or its release lands outside the media: a single
  // item's, or a gallery's current page's. The media runs from the fitted
  // photo's top to the caption's bottom. It is as wide as the photo's
  // natural width or the caption, up to the viewer's. While zoomed, the
  // photo's shown box is media too.
  const isClickOutsideMedia = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    const viewer = imageWrapperRef.current;
    const page = viewer?.querySelector('[data-current]') ?? viewer;
    const media = page?.querySelector('img') ?? page?.querySelector('video');
    // The photo's own box, which centres it: the stage, or a page's.
    const box = media?.parentElement;
    const group = mediaGroupRef.current;
    if (
      e.detail === 0 ||
      pointerTypeRef.current === 'touch' ||
      viewer == null ||
      page == null ||
      media == null ||
      box == null ||
      group == null ||
      !(e.target instanceof Node) ||
      !group.contains(e.target)
    ) {
      return false;
    }
    const space = (box.clientHeight - media.offsetHeight) / 2;
    const boxRect = box.getBoundingClientRect();
    const top = boxRect.top + space;
    let bottom = top + media.offsetHeight;
    const caption =
      page === viewer
        ? captionRef.current
        : page.querySelector<HTMLElement>('[data-lightbox-caption]');
    if (caption != null) {
      // The caption's place under the fitted photo, also while zoomed.
      const lift = caption.style.translate === '' ? space : 0;
      bottom = Math.max(bottom, caption.getBoundingClientRect().bottom - lift);
    }
    const natural =
      media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
    const width = Math.min(
      viewer.clientWidth,
      Math.max(natural, caption?.offsetWidth ?? 0),
    );
    const middle = boxRect.left + box.clientWidth / 2;
    const shown = media.getBoundingClientRect();
    const isOutside = ({x, y}: {x: number; y: number}) =>
      (y < top || y > bottom || Math.abs(x - middle) > width / 2) &&
      !(
        x >= shown.left &&
        x <= shown.right &&
        y >= shown.top &&
        y <= shown.bottom
      );
    const press = pressPointRef.current;
    return (
      isOutside({x: e.clientX, y: e.clientY}) ||
      (press != null && isOutside(press))
    );
  }, []);
  const handleBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDialogElement>) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      const isMediaClose =
        pointerTypeRef.current === 'touch'
          ? hasZoom && !isVideo && e.target === mediaGroupRef.current
          : (isGallery || (hasZoom && !isVideo)) && isClickOutsideMedia(e);
      if (
        e.target === e.currentTarget ||
        e.target === containerRef.current ||
        isMediaClose
      ) {
        handleClose();
      }
    },
    [handleClose, hasZoom, isVideo, isGallery, isClickOutsideMedia],
  );

  const isZoomTarget = hasZoom && !isVideo;

  const dismissFades = useCallback((): {
    backdrop: Animator | null;
    chrome: Animator[];
  } => {
    const dialog = dialogRef.current;
    const container = containerRef.current;
    if (dialog == null || container == null) {
      return {backdrop: null, chrome: []};
    }
    const chrome: HTMLElement[] = [];
    for (const element of container.querySelectorAll<HTMLElement>(
      '[data-lightbox-chrome], [data-lightbox-page]:not([data-current]), [data-lightbox-caption]',
    )) {
      if (
        element.parentElement?.closest(
          '[data-lightbox-page]:not([data-current])',
        ) == null
      ) {
        chrome.push(element);
      }
    }
    return {
      backdrop: animatorFor(dialog, {pseudoElement: '::backdrop'}),
      chrome: chrome.map(element => animatorFor(element)),
    };
  }, []);

  const onDragStart = () => {
    didDragRef.current = true;
  };
  // With zoom the stage fills the viewer, so a caption would sit at the
  // viewer's bottom. It moves up by the stage's space below the fitted
  // photo, so it sits under the photo as it does without zoom. The stage
  // already leaves the caption its height. A photo shown larger than it fits
  // fills the stage, from a gesture's first move until a settle back lands.
  // Meanwhile the caption goes back to its own place below the stage.
  const isShownAtFitRef = useRef(true);
  const placeCaption = useCallback(() => {
    // The stage's space below its fitted photo: the photo's laid-out height,
    // not its zoomed box.
    const place = (
      caption: HTMLElement | null,
      stageElement: HTMLElement | null,
      isAtFit: boolean,
    ) => {
      const photo = stageElement?.querySelector('img');
      if (caption == null) {
        return;
      }
      const below =
        isZoomTarget && isAtFit && stageElement != null && photo != null
          ? (stageElement.clientHeight - photo.offsetHeight) / 2
          : 0;
      caption.style.translate = below > 0 ? `0 ${-below}px` : '';
    };
    place(captionRef.current, imageWrapperRef.current, isShownAtFitRef.current);
    // A gallery's pages, each with its own caption under its own photo. Only
    // the current one can be zoomed.
    for (const page of trackRef.current?.querySelectorAll<HTMLElement>(
      ':scope > [data-lightbox-page]',
    ) ?? []) {
      place(
        page.querySelector<HTMLElement>(':scope > [data-lightbox-caption]'),
        page.querySelector<HTMLElement>(':scope > [data-lightbox-page-media]'),
        !page.hasAttribute('data-current') || isShownAtFitRef.current,
      );
    }
  }, [isZoomTarget]);
  useAttachment(
    imageWrapperRef,
    element => observeResize(element, placeCaption),
    placeCaption,
  );
  // Places the caption for the new item's layout before it paints.
  useIsomorphicLayoutEffect(() => {
    placeCaption();
  }, [placeCaption, viewedItem]);

  // The zoom stage takes the keyboard's zoom and pan and every pointer's
  // gestures. Past a limit, a pinch or a pan gives way and returns.
  const zoom = useZoomCore({
    stageRef: isGallery ? pageMediaRef : imageWrapperRef,
    surfaceRef: isGallery ? trackRef : imageWrapperRef,
    isEnabled: isOpen && isZoomTarget,
    itemKey: viewedItem,
    // Zoom changes are silent to assistive tech, since only the transform
    // changes. Announce them in the polite live region.
    onZoomedChange: next => {
      setIsZoomed(next);
      announce(
        next ? t('@astryx.lightbox.zoomedIn') : t('@astryx.lightbox.zoomedOut'),
      );
    },
    onFitChange: isAtFit => {
      isShownAtFitRef.current = isAtFit;
      placeCaption();
    },
  });
  const {isTouch} = useTouchPresentation();
  const startsOnCaption = (touch: GestureTouch | undefined) => {
    const target = touch?.target;
    return (
      target instanceof Element &&
      target.closest('[data-lightbox-caption]') != null
    );
  };
  const stage = useZoomStage(zoom, {
    stageRef: isGallery ? pageMediaRef : imageWrapperRef,
    surfaceRef: isGallery ? trackRef : imageWrapperRef,
    isEnabled: isOpen && isZoomTarget,
    itemKey: viewedItem,
    // A gallery's stage shares its surface with the page around it. A tap
    // there closes, as on the backdrop, unless it lands on the caption.
    onTapOutside: ({x, y}) => {
      const caption = trackRef.current
        ?.querySelector('[data-current] [data-lightbox-caption]')
        ?.getBoundingClientRect();
      if (
        caption != null &&
        x >= caption.left &&
        x <= caption.right &&
        y >= caption.top &&
        y <= caption.bottom
      ) {
        return;
      }
      handleClose();
    },
    onDragStart,
    isTouchPresentation: isTouch,
    // Only a gallery's touch pager takes a drag past a zoomed photo's edge.
    hasOuterPager: isGallery && isTouch,
    // A pinch whose first finger lands on a gallery's caption is the page's.
    shouldBeginPinch: recognizer =>
      !startsOnCaption(recognizer.trackedTouches[0]),
    dismiss: {
      // Part of the touch presentation, which applies under a coarse primary
      // pointer. Where it is fine, a drag leaves the photo in place. A video
      // keeps its own controls' drags.
      isEnabled: isOpen && !isVideo && isTouch,
      onDrag: travel => {
        const {backdrop, chrome} = dismissFades();
        fadedRef.current = backdrop == null ? chrome : [backdrop, ...chrome];
        backdropMovesRef.current += 1;
        setBackdropMoving(true);
        backdrop?.set({opacity: dismissBackdropAlpha(travel)});
        const opacity = dismissChromeAlpha(travel);
        for (const animator of chrome) {
          animator.set({opacity});
        }
      },
      onRelease: (dismisses, touch) => {
        const {backdrop, chrome} = dismissFades();
        fadedRef.current = backdrop == null ? chrome : [backdrop, ...chrome];
        // They keep pace with the photo: the dismissal's measured spring, or
        // on a cancel the shared settle spring, read where the stage is.
        const spring = dismisses
          ? zoomMedia.dismiss.dismissSizeSpring
          : resolveMotion(
              (isGallery ? pageMediaRef : imageWrapperRef).current,
              springs.settle,
            );
        const opacity = dismisses ? 0 : 1;
        const move = (backdropMovesRef.current += 1);
        setBackdropMoving(true);
        const backdropMotion = backdrop?.animate(
          {opacity},
          {spring},
          {touchRelease: touch},
        );
        for (const animator of chrome) {
          animator.animate({opacity}, {spring}, {touchRelease: touch});
        }
        // Back at rest: the blur returns, unless the backdrop moved again.
        void backdropMotion?.finished.then(() => {
          if (!dismisses && backdropMovesRef.current === move) {
            setBackdropMoving(false);
          }
        });
      },
      onDismissed: () => {
        handleClose();
        // A caller may keep the viewer open, since the close is its call. The
        // render after its answer brings the photo, the backdrop and the
        // controls back, so no open dialog stays invisible.
        dismissalAnsweredRef.current = true;
        renderAfterDismissal();
      },
    },
  });

  // Restore the photo, the backdrop and the controls only when the viewer
  // opens or a dismissal is answered. Each write promotes a layer, and
  // releasing it later repaints during a gesture.
  const restoreAfterDismissal = useCallback(() => {
    stage.reset();
    backdropMovesRef.current += 1;
    setBackdropMoving(false);
    const faded = fadedRef.current;
    fadedRef.current = [];
    for (const animator of faded) {
      animator.set({opacity: 1});
    }
  }, [stage, setBackdropMoving]);
  // Effect: syncs the photo's and the controls' animations with an opening
  // viewer, so it opens at rest with the backdrop's blur back.
  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      restoreAfterDismissal();
    }
  }, [isOpen, restoreAfterDismissal]);
  useIsomorphicLayoutEffect(() => {
    if (!dismissalAnsweredRef.current) {
      return;
    }
    dismissalAnsweredRef.current = false;
    if (isOpen) {
      restoreAfterDismissal();
    }
  });
  // Whether a mouse or a pen hovers over the fitted photo, for its cursor. The
  // stage fills the viewer, so the photo's box is read, not the event target.
  // The attribute is written on the stage, so hovering renders nothing.
  const markPointerOverPhoto = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' || e.buttons !== 0) {
      return;
    }
    const photo =
      e.currentTarget.querySelector('[data-current] img') ??
      e.currentTarget.querySelector('img');
    const r = photo?.getBoundingClientRect();
    e.currentTarget.toggleAttribute(
      OVER_PHOTO_ATTRIBUTE,
      r != null &&
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom,
    );
  };
  // A gallery pages like Photos, on a UIKit paging scroll view's release. A
  // drag or a flick moves one page at most, with Photos' 40 pt gap. A zoomed
  // photo keeps the drag until its edge, then the pager takes the next one.
  // As in Photos, the photo left behind returns to the fitted size once the
  // pager rests.
  // A controlled parent can refuse a swipe by keeping its index. The pager
  // then goes back to the photo the parent shows.
  // A video's native controls are taken as a band at its bottom edge, since
  // browsers expose no control geometry. A drag that starts there stays the
  // video's, as a scrubber's or a volume slider's drag.
  const startsOnVideoControls = (touch: GestureTouch | undefined) => {
    const video = trackRef.current?.querySelector(
      '[data-current] video[controls]',
    );
    if (touch == null || video == null) {
      return false;
    }
    const box = video.getBoundingClientRect();
    return (
      touch.startX >= box.left &&
      touch.startX <= box.right &&
      touch.startY <= box.bottom &&
      touch.startY >= box.bottom - VIDEO_CONTROLS_BAND
    );
  };
  usePager({
    viewportRef: imageWrapperRef,
    trackRef,
    count: mediaArray.length,
    gap: zoomMedia.viewer.pageGap,
    index,
    // The drag paging is part of the touch presentation. Under a fine pointer
    // the buttons and the arrow keys page, and the page keeps its scroll.
    isPanEnabled: isOpen && isGallery && isTouch,
    // Under the touch presentation a change of `index` slides the pager, and
    // a refused drag springs back. Under a fine pointer it moves the pager at
    // once, so a refused button shows nothing.
    isControlledChangeAnimated: isTouch,
    // In the touch presentation every pointer pages. A drag that starts on a
    // video's controls stays the video's.
    panOptions: {
      allowedPointerTypes: ['touch', 'pen', 'mouse'],
      maximumNumberOfTouches: 1,
      shouldBegin: pan => !startsOnVideoControls(pan.trackedTouches[0]),
    },
    shouldBeginPan: direction => !stage.isZoomed() || stage.isAtEdge(direction),
    onIndexChange: (next, reason) => {
      if (reason === 'drag') {
        setIndex(next);
      }
    },
    // The pager names the page it rests on. Its report can come before the
    // render that marks that page current, so the page, not the mark, decides.
    onSettle: settled => {
      for (const page of trackRef.current?.querySelectorAll<HTMLElement>(
        ':scope > [data-lightbox-page]',
      ) ?? []) {
        const img = page.querySelector<HTMLElement>('img');
        if (img != null && page.dataset.lightboxPage !== String(settled)) {
          img.style.translate = '';
          img.style.scale = '';
        }
      }
    },
  });

  // Whether a point is on the current page's media group: its photo or video
  // and its caption, as one box. The photo takes no pointer events, so a
  // press on it lands on its box. An element with no size yet (a photo still
  // loading) adds nothing to the box.
  const isOnCurrentMedia = (x: number, y: number) => {
    const page = imageWrapperRef.current?.querySelector('[data-current]');
    const boxes = [
      page?.querySelector('img'),
      page?.querySelector('video'),
      page?.querySelector('[data-lightbox-caption]'),
    ]
      .map(element => element?.getBoundingClientRect())
      .filter((r): r is DOMRect => r != null && r.width > 0 && r.height > 0);
    return (
      boxes.length > 0 &&
      x >= Math.min(...boxes.map(r => r.left)) &&
      x <= Math.max(...boxes.map(r => r.right)) &&
      y >= Math.min(...boxes.map(r => r.top)) &&
      y <= Math.max(...boxes.map(r => r.bottom))
    );
  };
  // Without zoom, a gallery's stage fills the viewer. So a finger's tap on it
  // beside the media closes the viewer, as a click on the backdrop does. A
  // press that moves past the tap's movement limit is no tap. A mouse's or a
  // pen's click closes it only outside the media (`isClickOutsideMedia`).
  // With zoom, the stage's own tap closes it.
  useGestureRecognizer(
    imageWrapperRef,
    () =>
      new TapGestureRecognizer({
        name: 'lightbox-backdrop-tap',
        allowedPointerTypes: ['touch'],
      }),
    tap => {
      if (tap.state !== 'ended') {
        return;
      }
      const {x, y} = tap.location();
      if (!isOnCurrentMedia(x, y)) {
        handleClose();
      }
    },
    {isEnabled: isOpen && isGallery && !isZoomTarget, manageStyle: false},
  );

  // Gallery navigation. The buttons and the arrow keys ask for the new item.
  // Under the touch presentation the pager then slides there, as a paging
  // scroll view's `setContentOffset` does. Under a fine pointer it moves at
  // once.

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
      if (isZoomTarget) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          stage.zoomIn();
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          stage.zoomOut();
          return;
        }
        // Ctrl or Cmd with 0 resets the browser's page zoom; leave it.
        if (e.key === '0' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          stage.zoomOut();
          return;
        }
        if (stage.isZoomed() && KEYBOARD_PAN_OFFSETS[e.key] !== undefined) {
          e.preventDefault();
          const [dx, dy] = KEYBOARD_PAN_OFFSETS[e.key];
          stage.panBy(dx, dy);
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
    [isZoomTarget, stage, goToPrev, goToNext],
  );

  // Enter/Space on the focused image wrapper (role="button") toggles zoom.
  const handleImageKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stage.toggle();
      }
    },
    [stage],
  );

  if (!currentItem) {
    return null;
  }

  // A control of the viewer. With zoom it sits on Lightbox's own backing,
  // which takes the control's place. Its icon keeps the on-dark colour. So a
  // theme's restyling of the button can't remove its contrast.
  const control = (
    place: StyleXStyles,
    {
      icon,
      label,
      isDisabled,
      onClick,
      isMirrored = false,
    }: {
      icon: ComponentProps<typeof Icon>['icon'];
      label: string;
      isDisabled?: boolean;
      onClick: () => void;
      isMirrored?: boolean;
    },
  ) => {
    const button = (
      <IconButton
        icon={
          <Icon
            icon={icon}
            size="sm"
            color="inherit"
            xstyle={[
              isMirrored && rtlStyles.mirror,
              hasZoom && styles.controlIcon,
            ]}
          />
        }
        label={label}
        variant="ghost"
        isDisabled={isDisabled}
        onClick={onClick}
        xstyle={[!hasZoom && place, styles.controlButton]}
      />
    );
    return hasZoom ? (
      <span {...stylex.props(place, styles.controlBacking)}>{button}</span>
    ) : (
      button
    );
  };

  const renderMedia = (
    {src, alt, type: kind = 'image'}: LightboxMedia,
    isCurrent: boolean,
  ) =>
    kind === 'video' ? (
      <video
        src={src}
        aria-label={alt}
        controls
        autoPlay={isOpen && isCurrent && hasAutoPlay}
        preload={isCurrent ? 'auto' : 'metadata'}
        {...stylex.props(styles.video)}
      />
    ) : (
      <img
        ref={isCurrent ? stage.contentRef : undefined}
        onLoad={placeCaption}
        src={src}
        alt={isCurrent ? alt : ''}
        aria-hidden={isCurrent ? undefined : true}
        draggable={false}
        {...stylex.props(styles.image)}
      />
    );
  // The current item and its neighbours; the pager shows one at rest.
  const pageIndexes = isGallery
    ? [index - 1, index, index + 1].filter(i => i >= 0 && i < mediaArray.length)
    : [];

  return (
    <dialog
      ref={mergedDialogRef}
      onCancel={handleCancel}
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
      {...props}
      // Presses inside the lightbox do not reach handlers around where it is
      // written.
      {...layerClickBoundary({
        ...props,
        onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
          handleBackdropClick(e);
          onClickProp?.(e);
        },
      })}>
      <LayerDepthProvider>
        <ModalAnnounceProvider dialogRef={dialogRef} isOpen={isOpen}>
          <LayerContentBoundary>
            <div
              ref={containerRef}
              {...stylex.props(styles.container)}
              // Every press in the viewer records where and how it began. A
              // mouse's or a pen's press clears a zoomed drag's flag anywhere.
              // A finger's press clears it only on the stage.
              onPointerDown={e => {
                pointerTypeRef.current = e.pointerType;
                pressPointRef.current = {x: e.clientX, y: e.clientY};
                const isOnStage =
                  e.target instanceof Node &&
                  imageWrapperRef.current?.contains(e.target) === true;
                if (e.pointerType !== 'touch' || isOnStage) {
                  didDragRef.current = false;
                }
              }}>
              <div
                data-lightbox-chrome=""
                {...stylex.props(styles.chromeLayer)}>
                {control(styles.closeButton, {
                  icon: 'close',
                  label: t('@astryx.lightbox.close'),
                  onClick: handleClose,
                })}

                {/* Gallery nav: prev — stays mounted and is disabled at the start of
              the range so pressing/arrowing to the boundary doesn't unmount the
              focused control and drop focus to <body>. */}
                {isGallery &&
                  control([styles.navButton, styles.navPrev], {
                    icon: 'chevronLeft',
                    label: t('@astryx.lightbox.previous'),
                    isDisabled: !canPrev,
                    onClick: goToPrev,
                    isMirrored: true,
                  })}
              </div>

              {/* Media + caption group (centered together) */}
              <div
                ref={mediaGroupRef}
                data-lightbox-media=""
                {...stylex.props(
                  styles.mediaGroup,
                  isZoomTarget && !isGallery && styles.mediaGroupZoom,
                  isGallery && styles.mediaGroupGallery,
                )}>
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
                    isGallery && styles.imageWrapperGallery,
                    isZoomTarget && !isGallery && styles.imageWrapperZoomTarget,
                    isZoomTarget && !isGallery && styles.imageWrapperFill,
                    isTouch &&
                      !isZoomTarget &&
                      !isVideo &&
                      !isGallery &&
                      styles.imageWrapperDismissTarget,
                    isZoomTarget && focusOutlineStyles.focusVisible,
                    isZoomTarget && styles.imageWrapperFocusInset,
                    isZoomTarget && !isZoomed && styles.imageWrapperZoomable,
                    isZoomTarget && isZoomed && styles.imageWrapperZoomed,
                  )}
                  onKeyDown={isZoomTarget ? handleImageKeyDown : undefined}
                  onPointerMove={
                    isZoomTarget ? markPointerOverPhoto : undefined
                  }
                  onPointerLeave={
                    isZoomTarget
                      ? e =>
                          e.currentTarget.removeAttribute(OVER_PHOTO_ATTRIBUTE)
                      : undefined
                  }
                  onDoubleClick={
                    isZoomTarget
                      ? e => {
                          // A finger's double tap is the stage's own.
                          if (pointerTypeRef.current !== 'touch') {
                            stage.doubleClickAt(e.clientX, e.clientY);
                          }
                        }
                      : undefined
                  }>
                  {isGallery ? (
                    <div
                      ref={trackRef}
                      {...stylex.props(
                        styles.track,
                        isZoomTarget && styles.trackZoomTarget,
                        isTouch &&
                          !isZoomTarget &&
                          !isVideo &&
                          styles.imageWrapperDismissTarget,
                      )}>
                      {pageIndexes.map(i => (
                        <div
                          key={i}
                          data-lightbox-page={i}
                          data-current={i === index ? '' : undefined}
                          // Only the current page is on screen at rest: the
                          // others stay out of the tab order and the
                          // accessibility tree.
                          inert={i !== index ? true : undefined}
                          aria-hidden={i !== index ? true : undefined}
                          {...stylex.props(
                            styles.page,
                            pageStyles.position(i),
                          )}>
                          <div
                            ref={i === index ? pageMediaRef : undefined}
                            data-lightbox-page-media=""
                            {...stylex.props(
                              styles.pageMedia,
                              isZoomTarget && styles.pageMediaZoomTarget,
                            )}>
                            {renderMedia(mediaArray[i], i === index)}
                          </div>
                          {isRenderable(mediaArray[i].caption) && (
                            <div
                              data-lightbox-caption=""
                              {...stylex.props(styles.caption)}>
                              {mediaArray[i].caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderMedia(currentItem, true)
                  )}
                </div>

                {!isGallery && isRenderable(currentItem.caption) && (
                  <div
                    ref={captionRef}
                    data-lightbox-caption=""
                    {...stylex.props(styles.caption)}>
                    {currentItem.caption}
                  </div>
                )}
              </div>

              <div
                data-lightbox-chrome=""
                {...stylex.props(styles.chromeLayer)}>
                {/* Gallery nav: next — see "prev" above; stays mounted and disabled at
            the end of the range instead of unmounting. */}
                {isGallery &&
                  control([styles.navButton, styles.navNext], {
                    icon: 'chevronRight',
                    label: t('@astryx.lightbox.next'),
                    isDisabled: !canNext,
                    onClick: goToNext,
                    isMirrored: true,
                  })}

                {/* Gallery counter */}
                {isGallery && mediaArray.length > 1 && (
                  <div
                    {...stylex.props(
                      styles.counter,
                      hasZoom && styles.counterBacking,
                    )}>
                    {index + 1} / {mediaArray.length}
                  </div>
                )}
              </div>
            </div>
          </LayerContentBoundary>
        </ModalAnnounceProvider>
      </LayerDepthProvider>
    </dialog>
  );
}

Lightbox.displayName = 'Lightbox';
