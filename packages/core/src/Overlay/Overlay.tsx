// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Overlay.tsx
 * @input Uses React, useOverlay; forwards host props to the container
 * @output Exports Overlay component
 * @position Overlay system component; thin wrapper over useOverlay
 *
 * Wraps content with an overlay scrim. Same pattern as Tooltip:
 * `children` is the base content, `content` is what appears on top.
 *
 * For applying overlay behavior to an existing container (Card),
 * use the useOverlay hook directly.
 */

import type {ReactNode, Ref} from 'react';
import * as stylex from '@stylexjs/stylex';
import {composeEventHandlers, mergeProps} from '../utils';
import {useOverlay} from './useOverlay';
import {overlayScope, overlayContainerStyles} from './overlay.markers.stylex';
import {themeProps} from '../utils/themeProps';
import type {BaseProps} from '../BaseProps';
import type {
  OverlayScrimMode,
  OverlayPosition,
  OverlayAlign,
  OverlayShowOn,
} from './OverlayScrim';

import {useMergedRefs} from '../hooks/useMergedRefs';
export interface OverlayProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the container element. */
  ref?: Ref<HTMLDivElement>;
  /** Base content (image, card, video, etc.). */
  children?: ReactNode;
  /** Content rendered inside the overlay scrim. */
  content: ReactNode;
  /** @default "always" */
  showOn?: OverlayShowOn;
  /** JS-controlled visibility override. */
  isOpen?: boolean;
  /** @default "dark" */
  scrim?: OverlayScrimMode;
  /** @default "fill" */
  position?: OverlayPosition;
  /** @default "end" */
  align?: OverlayAlign;
}

// The wrapper takes the radius of its first child, so the scrim clips to the
// media corners. Only the component does this. A hook consumer sets the
// radius on its own element.
function mirrorFirstChildRadius(container: HTMLElement | null) {
  const firstChild = container?.firstElementChild;
  if (container == null || firstChild == null) {
    return;
  }
  const radius = getComputedStyle(firstChild).borderRadius;
  if (radius && radius !== '0px') {
    container.style.borderRadius = radius;
  }
}

/**
 * Overlay — renders content on top of media with a scrim background
 * and automatic theme inversion.
 *
 * `children` = base content, `content` = what appears on top.
 *
 * @compositionHint Wrap images, video, or media content.
 *
 * @example
 * ```
 * <Overlay
 *   showOn="hover"
 *   content={<Button label="Quick view" variant="ghost" />}>
 *   <AspectRatio ratio={16/9}>
 *     <img src="hero.jpg" style={{objectFit: 'cover', width: '100%', height: '100%'}} />
 *   </AspectRatio>
 * </Overlay>
 * ```
 */
export function Overlay({
  children,
  content,
  showOn,
  isOpen,
  scrim,
  position,
  align,
  xstyle,
  className,
  style,
  ref,
  onClick: onClickProp,
  onMouseUp: onMouseUpProp,
  ...rest
}: OverlayProps) {
  const overlay = useOverlay({
    content,
    showOn,
    isOpen,
    scrim,
    position,
    align,
  });

  return (
    <div
      {...rest}
      ref={useMergedRefs(ref, overlay.containerRef, mirrorFirstChildRadius)}
      {...mergeProps(
        themeProps('overlay'),
        stylex.props(overlayScope, overlayContainerStyles.root, xstyle),
        className,
        style,
      )}
      // The touch toggle runs before the caller's handler: Overlay promises no
      // cancellation, so a caller preventDefault() cannot stop it
      // (architecture:public-component-api INV7).
      onClick={composeEventHandlers(
        overlay.containerProps.onClick,
        onClickProp,
      )}
      onMouseUp={composeEventHandlers(
        overlay.containerProps.onMouseUp,
        onMouseUpProp,
      )}>
      {children}
      {overlay.element}
    </div>
  );
}

Overlay.displayName = 'Overlay';
