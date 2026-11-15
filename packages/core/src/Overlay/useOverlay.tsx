// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useOverlay.tsx
 * @input Overlay options (showOn, scrim, position, content, etc.)
 * @output containerRef, containerProps, element, renderOverlay
 * @position Core hook for overlay system — same pattern as useTooltip
 *
 * For applying overlay behavior to an existing container (Card,
 * custom elements) without a wrapper. Returns props to spread on the
 * container and the scrim to render inside it.
 *
 * Handles: marker, positioning, touch toggle (via useClickableContainer),
 * and scrim rendering.
 */

import {
  type ReactNode,
  type ReactElement,
  type MouseEvent,
  useState,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useClickableContainer} from '../hooks/useClickableContainer';
import {matchesMediaQuery, watchMediaQuery} from '../utils/coarsePointer';
import {overlayScope, overlayContainerStyles} from './overlay.markers.stylex';
import {OverlayScrim} from './OverlayScrim';
import type {
  OverlayScrimMode,
  OverlayPosition,
  OverlayAlign,
  OverlayShowOn,
} from './OverlayScrim';

// =============================================================================
// Touch detection
// =============================================================================

function getIsTouchDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return matchesMediaQuery(window, '(hover: none)');
}

function subscribeToHoverChange(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  return watchMediaQuery(window, '(hover: none)', callback);
}

function getServerSnapshot(): boolean {
  return false;
}

// =============================================================================
// Types
// =============================================================================

export interface UseOverlayOptions {
  /** Content rendered inside the scrim overlay. */
  content?: ReactNode;

  /**
   * CSS-driven visibility trigger.
   * - `"always"` — always visible
   * - `"hover"` — hover + focus (accessible default). Touch: strip = always visible, fill = tap-to-toggle.
   * - `"focus"` — focus-within only
   * - `"hover-or-focus"` — alias for "hover"
   * @default "always"
   */
  showOn?: OverlayShowOn;

  /**
   * JS-controlled visibility override. Takes precedence over showOn + touch.
   */
  isOpen?: boolean;

  /**
   * Scrim background mode.
   * @default "dark"
   */
  scrim?: OverlayScrimMode;

  /**
   * Scrim placement.
   * @default "fill"
   */
  position?: OverlayPosition;

  /**
   * Content alignment.
   * @default "end"
   */
  align?: OverlayAlign;
}

export interface OverlayContainerProps {
  /** CSS class names for marker + positioning. */
  className: string | undefined;
  /** Inline styles for marker + positioning. */
  style: React.CSSProperties | undefined;
  /** Touch tap-to-toggle handler. Only set on touch devices with full overlays. */
  onClick: ((e: MouseEvent<HTMLElement>) => void) | undefined;
  /** Touch tap-to-toggle handler. Only set on touch devices with full overlays. */
  onMouseUp: ((e: MouseEvent<HTMLElement>) => void) | undefined;
}

export interface UseOverlayResult {
  /** Ref — attach to the container element. */
  containerRef: React.RefObject<HTMLElement | null>;

  /** Props to spread on the container element. */
  containerProps: OverlayContainerProps;

  /**
   * Pre-rendered scrim element — place inside the container.
   * Only available when `content` is provided in options.
   */
  element: ReactElement | null;

  /**
   * Render function for the overlay scrim. Use when you want to
   * control where/when the scrim mounts, or pass dynamic content.
   * Same pattern as useTooltip's renderTooltip.
   */
  renderOverlay: (children: ReactNode) => ReactElement;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for overlay behavior on an existing container.
 * Returns containerRef, containerProps, and scrim element/render function.
 *
 * @example
 * ```
 * const overlay = useOverlay({
 *   showOn: 'hover',
 *   content: <Button label="Quick view" variant="ghost" />,
 * });
 * <Card ref={overlay.containerRef} {...overlay.containerProps}>
 *   <Layout content={...} />
 *   {overlay.element}
 * </Card>
 * ```
 *
 * @example
 * ```
 * const overlay = useOverlay({ showOn: 'hover' });
 * <div ref={overlay.containerRef} {...overlay.containerProps}>
 *   <img src={src} />
 *   {overlay.renderOverlay(<Button label="Quick view" />)}
 * </div>
 * ```
 */
export function useOverlay({
  content,
  showOn = 'always',
  isOpen: isOpenProp,
  scrim = 'dark',
  position = 'fill',
  align = 'end',
}: UseOverlayOptions = {}): UseOverlayResult {
  const containerRef = useRef<HTMLElement | null>(null);

  const isTouchDevice = useSyncExternalStore(
    subscribeToHoverChange,
    getIsTouchDevice,
    getServerSnapshot,
  );

  const [touchOpen, setTouchOpen] = useState(false);

  const isHoverMode = showOn === 'hover' || showOn === 'hover-or-focus';

  const needsTouchToggle = isTouchDevice && isHoverMode;

  const handleToggle = useCallback(() => {
    setTouchOpen(prev => !prev);
  }, []);

  const {onClick, onMouseUp} = useClickableContainer({
    containerRef,
    onClick: needsTouchToggle ? handleToggle : undefined,
    disabled: !needsTouchToggle,
  });

  // Resolve isOpen: consumer prop > touch toggle > undefined (CSS)
  const effectiveIsOpen =
    isOpenProp !== undefined
      ? isOpenProp
      : needsTouchToggle
        ? touchOpen
        : undefined;

  // Container styles (marker + positioning)
  const resolved = stylex.props(overlayScope, overlayContainerStyles.root);

  const containerProps = useMemo<OverlayContainerProps>(
    () => ({
      className: resolved.className ?? undefined,
      style: resolved.style ?? undefined,
      onClick: needsTouchToggle ? onClick : undefined,
      onMouseUp: needsTouchToggle ? onMouseUp : undefined,
    }),
    [resolved.className, resolved.style, needsTouchToggle, onClick, onMouseUp],
  );

  // Render function — matches tooltip's renderTooltip pattern
  const renderOverlay = useCallback(
    (children: ReactNode): ReactElement => (
      <OverlayScrim
        scrim={scrim}
        position={position}
        align={align}
        showOn={showOn}
        isOpen={effectiveIsOpen}>
        {children}
      </OverlayScrim>
    ),
    [scrim, position, align, showOn, effectiveIsOpen],
  );

  // Pre-rendered element when content is provided
  const element = content != null ? renderOverlay(content) : null;

  return {
    containerRef,
    containerProps,
    element,
    renderOverlay,
  };
}
