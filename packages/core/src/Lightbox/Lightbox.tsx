// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Lightbox.tsx
 * @input Uses React, native dialog, StyleX, IconButton, theme tokens, layerTextReset, layerStructureReset,
 *   and isRtlElement (gallery arrow keys follow the rendered direction). The
 *   zoom uses useZoomCore and useZoomStage
 * @output Exports Lightbox component, LightboxProps, LightboxMedia
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Lightbox/Lightbox.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Lightbox/Lightbox.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Lightbox/useZoomCore.ts (the zoom stage for every pointer)
 * - /packages/core/src/Lightbox/useZoomStage.ts (the gestures, for every pointer)
 * - /packages/core/src/Lightbox/__tests__/LightboxZoom.interaction.browser.spec.ts (touch zoom proofs)
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
import {useAnnounce} from '../hooks/useAnnounce';
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

import {useMergedRefs} from '../hooks/useMergedRefs';
import {isRtlElement} from '../hooks/isRtlElement';
import {useZoomCore} from './useZoomCore';
import {useZoomStage} from './useZoomStage';
import {useTouchPresentation} from '../utils/touchPresentation';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Lightbox/Lightbox.generated';
import {isRenderable} from '../utils/isRenderable';
import {prepareFocusReturnOnRemoval} from '../utils/focusReturn';

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
   * Callback when the gallery index changes via prev/next navigation.
   */
  onIndexChange?: (index: number) => void;
  /**
   * Enable zoom (images only). A pinch or a ctrl-wheel zooms about the
   * fingers or the pointer. A double tap fills the viewer and a double-click
   * zooms 2×, about that point, and the next goes back. Enter, Space, `+` and
   * `-` zoom 2× about the centre and back. When zoomed, drag or scroll a
   * trackpad to pan, or use the arrow keys. On a phone or a tablet, the pan
   * has momentum. The gestures work for every pointer.
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
    overflow: 'hidden',
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
 * Supports single image and gallery modes. In gallery mode, it provides
 * prev/next navigation via buttons and arrow keys. The arrow keys follow the
 * writing direction: in RTL, ArrowLeft goes to the next item, like the Next
 * button on the left.
 *
 * Optionally supports zoom like a photo viewer. A pinch or a ctrl-wheel zooms
 * about the fingers or the pointer, gives past the limits and eases back. A
 * double tap or a double-click zooms in at that point and back. Enter or
 * Space on the image, and `+` or `-` from the keyboard, zoom too. When zoomed,
 * a drag or a trackpad's scroll pans. On a phone or a tablet, the pan has
 * momentum and a rubber band at the edges. The arrow keys pan a zoomed photo
 * and navigate the gallery otherwise.
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
  // never paints as zoomed; the stage resets the photo before it paints.
  const currentSrc = currentItem?.src;
  const [viewedItem, setViewedItem] = useState({index, src: currentSrc});
  // Object.is, matching the dependency comparison of the effect this replaces:
  // a controlled index of NaN must not re-render forever.
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

  // The last press's pointer type. A finger's double tap is the stage's own.
  // A mouse's or a pen's is the browser's `dblclick`.
  const pointerTypeRef = useRef('');
  // Without zoom, a click on the dark area lands on the container or the
  // dialog, and both close. With zoom, the stage covers that area. A finger's
  // tap beside the photo closes on the stage's own tap, and so does its tap on
  // the media group's strip below the stage. A mouse's or a pen's click
  // closes only outside the media (`isClickOutsideMedia`). A zoomed drag sets
  // `didDragRef`, so its click is ignored. The next press clears the flag, and
  // a finger's only on the stage.
  const didDragRef = useRef(false);
  const mediaGroupRef = useRef<HTMLDivElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const pressPointRef = useRef<{x: number; y: number} | null>(null);
  // Whether a mouse's or a pen's click on the zoom target's media closes the
  // viewer. It does when its press or its release lands outside the media.
  // The media runs from the fitted photo's top to the caption's bottom. It is
  // as wide as the photo's natural width or the caption, up to the viewer's.
  // While zoomed, the photo's shown box is media too.
  const isClickOutsideMedia = useCallback((e: ReactMouseEvent<HTMLElement>) => {
    const stageElement = imageWrapperRef.current;
    const photo = stageElement?.querySelector('img');
    const group = mediaGroupRef.current;
    if (
      e.detail === 0 ||
      pointerTypeRef.current === 'touch' ||
      stageElement == null ||
      photo == null ||
      group == null ||
      !(e.target instanceof Node) ||
      !group.contains(e.target)
    ) {
      return false;
    }
    const space = (stageElement.clientHeight - photo.offsetHeight) / 2;
    const box = stageElement.getBoundingClientRect();
    const top = box.top + space;
    let bottom = top + photo.offsetHeight;
    const caption = captionRef.current;
    if (caption != null) {
      // The caption's place under the fitted photo, also while zoomed.
      const lift = caption.style.translate === '' ? space : 0;
      bottom = Math.max(bottom, caption.getBoundingClientRect().bottom - lift);
    }
    const width = Math.min(
      stageElement.clientWidth,
      Math.max(photo.naturalWidth, caption?.offsetWidth ?? 0),
    );
    const middle = box.left + stageElement.clientWidth / 2;
    const shown = photo.getBoundingClientRect();
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
      if (
        e.target === e.currentTarget ||
        e.target === containerRef.current ||
        (hasZoom &&
          !isVideo &&
          (pointerTypeRef.current === 'touch'
            ? e.target === mediaGroupRef.current
            : isClickOutsideMedia(e)))
      ) {
        handleClose();
      }
    },
    [handleClose, hasZoom, isVideo, isClickOutsideMedia],
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

  const isZoomTarget = hasZoom && !isVideo;
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
    const caption = captionRef.current;
    if (caption == null) {
      return;
    }
    const stageElement = imageWrapperRef.current;
    const photo = stageElement?.querySelector('img');
    // The photo's laid-out height, not its zoomed box.
    const below =
      isZoomTarget &&
      isShownAtFitRef.current &&
      stageElement != null &&
      photo != null
        ? (stageElement.clientHeight - photo.offsetHeight) / 2
        : 0;
    caption.style.translate = below > 0 ? `0 ${-below}px` : '';
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
    stageRef: imageWrapperRef,
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
  const stage = useZoomStage(zoom, {
    stageRef: imageWrapperRef,
    isEnabled: isOpen && isZoomTarget,
    onTapOutside: handleClose,
    onDragStart,
    isTouchPresentation: isTouch,
  });
  // Whether a mouse or a pen hovers over the fitted photo, for its cursor. The
  // stage fills the viewer, so the photo's box is read, not the event target.
  // The attribute is written on the stage, so hovering renders nothing.
  const markPointerOverPhoto = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType === 'touch' || e.buttons !== 0) {
      return;
    }
    const r = e.currentTarget.querySelector('img')?.getBoundingClientRect();
    e.currentTarget.toggleAttribute(
      OVER_PHOTO_ATTRIBUTE,
      r != null &&
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom,
    );
  };

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

              {/* Media + caption group (centered together) */}
              <div
                ref={mediaGroupRef}
                {...stylex.props(
                  styles.mediaGroup,
                  isZoomTarget && styles.mediaGroupZoom,
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
                    isZoomTarget && styles.imageWrapperZoomTarget,
                    isZoomTarget && styles.imageWrapperFill,
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
                      ref={stage.contentRef}
                      src={currentItem.src}
                      alt={currentItem.alt}
                      draggable={false}
                      onLoad={placeCaption}
                      {...stylex.props(styles.image)}
                    />
                  )}
                </div>

                {isRenderable(currentItem.caption) && (
                  <div ref={captionRef} {...stylex.props(styles.caption)}>
                    {currentItem.caption}
                  </div>
                )}
              </div>

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
          </LayerContentBoundary>
        </ModalAnnounceProvider>
      </LayerDepthProvider>
    </dialog>
  );
}

Lightbox.displayName = 'Lightbox';
