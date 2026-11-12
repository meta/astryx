// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TourStep.tsx
 * @input Uses React, useLayer/useLayerDismissal and Button/IconButton/Text/Heading/Stack from @astryxdesign/core, TourContext
 * @output Exports TourStep component and TourStepProps
 * @position Lab; one step of a Tour. It draws a highlight ring over its
 *   target and a non-modal callout anchored to that ring. The target gets no
 *   trigger wiring, and its own styles are never changed. Escape ends the
 *   tour through the shared layer dismissal stack. The ring and the callout
 *   open in the top layer in place, so they keep the consumer's theme tokens.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Tour/Tour.tsx
 * - /packages/lab/src/Tour/TourContext.ts
 * - /packages/lab/src/Tour/Tour.doc.mjs (props table, features)
 * - /packages/lab/src/Tour/Tour.test.tsx (tests for new/changed behavior)
 * - /packages/lab/src/Tour/index.ts (exports if types change)
 */

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  LayerDepthProvider,
  useLayer,
  useLayerDismissal,
  type LayerAlignment,
  type LayerPlacement,
} from '@astryxdesign/core/Layer';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {
  prepareFocusReturnOnRemoval,
  useInteractionModalityTracking,
} from '@astryxdesign/core/internal/touch';
import {Text} from '@astryxdesign/core/Text';
import {focusOutlineStyles} from '@astryxdesign/core/utils';
import {Heading} from '@astryxdesign/core/Heading';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {
  colorVars,
  spacingVars,
  durationVars,
  easeVars,
  radiusVars,
  shadowVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {TourContext} from './TourContext';

// Client-only layout effect (SSR renders no overlay, so this only runs on the
// client). Kept local since core does not export its isomorphic variant.
const useClientLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Gap between the target's edge and the highlight ring, in px.
const HIGHLIGHT_PADDING = 4;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

const styles = stylex.create({
  // The callout surface: the same paint as a Popover surface.
  surface: {
    backgroundColor: colorVars['--color-background-popover'],
    borderRadius: radiusVars['--radius-container'],
    boxShadow: shadowVars['--shadow-low'],
    padding: spacingVars['--spacing-3'],
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-3'],
    // Keep the callout from growing arbitrarily wide with long body copy.
    maxWidth: '320px',
  },
  header: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Extra clearance between the target and the callout, so the highlight ring
  // (which extends a few px past the target) is never covered by the callout.
  // Placement-aware: the margin goes on the side of the callout that faces the
  // target. Adds to the layer's own small anchor offset.
  calloutGapBelow: {marginBlockStart: spacingVars['--spacing-2']},
  calloutGapAbove: {marginBlockEnd: spacingVars['--spacing-2']},
  calloutGapStart: {marginInlineEnd: spacingVars['--spacing-2']},
  calloutGapEnd: {marginInlineStart: spacingVars['--spacing-2']},
  // Full-viewport overlay root, promoted into the browser top layer so it sits
  // above all page content with NO z-index. UA popover styles are neutralized
  // so it fills the viewport. Click-through by default (coachmark); interactive
  // only when it dims (to catch backdrop clicks).
  overlayRoot: {
    position: 'fixed',
    inset: 0,
    // A popover is sized to fit its content by default; the overlay fills
    // the viewport so a dimmed step catches presses on the page.
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    overflow: 'visible',
    pointerEvents: 'none',
  },
  overlayInteractive: {
    pointerEvents: 'auto',
  },
  // The highlight box, sized to the target. Non-interactive so clicks reach the
  // target (coachmark) or the overlay root (dimmed). The accent ring with a
  // surface-colored gap mirrors the focus-visible outline used across the
  // system.
  highlight: {
    position: 'absolute',
    pointerEvents: 'none',
    boxShadow: `0 0 0 2px ${colorVars['--color-background-surface']}, 0 0 0 4px ${colorVars['--color-accent']}`,
    transitionProperty: 'top, left, width, height',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // Spotlight cutout: a huge box-shadow spread dims the whole viewport EXCEPT
  // this box, so the target reads as lit rather than covered. Layered after the
  // ring so both shadows show. Only applied when the step opts into a backdrop.
  cutout: {
    boxShadow: `0 0 0 2px ${colorVars['--color-background-surface']}, 0 0 0 4px ${colorVars['--color-accent']}, 0 0 0 9999px ${colorVars['--color-overlay']}`,
  },
  hidden: {
    opacity: 0,
  },
});

const calloutGapStyles = {
  below: styles.calloutGapBelow,
  above: styles.calloutGapAbove,
  start: styles.calloutGapStart,
  end: styles.calloutGapEnd,
} as const;

/**
 * The highlight overlay: a top-layer box sized to the target, plus an optional
 * spotlight-cutout dim. Rendered inline (not portaled) so it stays inside the
 * consumer's Theme subtree and inherits theme tokens — the popover API promotes
 * it into the top layer in place. Rendered before the callout so the callout
 * promotes on top of it; promoted once (never re-promoted) so that ordering
 * holds across re-measures.
 */
function TourHighlight({
  rect,
  hasBackdrop,
  onBackdropClick,
  highlightRef,
}: {
  rect: TargetRect | null;
  hasBackdrop: boolean;
  onBackdropClick: () => void;
  highlightRef: (node: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useClientLayoutEffect(() => {
    const el = ref.current;
    if (el == null || typeof el.showPopover !== 'function') {
      return;
    }
    el.showPopover();
    return () => {
      if (el.isConnected && typeof el.hidePopover === 'function') {
        el.hidePopover();
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      popover="manual"
      data-testid={hasBackdrop ? 'tour-backdrop' : undefined}
      aria-hidden="true"
      onClick={hasBackdrop ? onBackdropClick : undefined}
      {...stylex.props(
        styles.overlayRoot,
        hasBackdrop && styles.overlayInteractive,
      )}>
      <div
        ref={highlightRef}
        data-testid="tour-highlight"
        {...stylex.props(
          styles.highlight,
          hasBackdrop && styles.cutout,
          rect == null && styles.hidden,
        )}
        style={
          rect != null
            ? {
                top: rect.top - HIGHLIGHT_PADDING,
                left: rect.left - HIGHLIGHT_PADDING,
                width: rect.width + HIGHLIGHT_PADDING * 2,
                height: rect.height + HIGHLIGHT_PADDING * 2,
                borderRadius: rect.radius,
              }
            : undefined
        }
      />
    </div>
  );
}

export interface TourStepProps {
  /**
   * Ref to the element this step points at: any element, such as a button, a
   * card, a table cell or a chart region. The callout sits beside it. The
   * target keeps its own behavior: without a backdrop, pressing it does not
   * end the tour, and keyboard focus can reach it while the step shows.
   * Accepts a ref to any HTMLElement subtype (e.g.
   * `useRef<HTMLDivElement>(null)`).
   */
  targetRef: React.RefObject<HTMLElement | null>;
  /** Step heading. */
  heading: ReactNode;
  /** Step body content. */
  children?: ReactNode;
  /**
   * Which side of the target the callout sits on.
   * @default 'below'
   */
  placement?: LayerPlacement;
  /**
   * How the callout aligns along the placement side — e.g. with `placement="below"`,
   * `start` left-aligns it under the target, `center` centers it, `end` right-aligns it.
   * @default 'start'
   */
  alignment?: LayerAlignment;
  /** Test id applied to the callout content. */
  'data-testid'?: string;
}

/**
 * A single spotlight step within a `<Tour>`. Renders its callout only while
 * active.
 *
 * @example
 * ```
 * <TourStep targetRef={saveRef} heading="Save your work">
 *   Changes save automatically.
 * </TourStep>
 * ```
 */
export function TourStep({
  targetRef,
  heading,
  children,
  placement = 'below',
  alignment = 'start',
  'data-testid': testId,
}: TourStepProps) {
  const tour = useContext(TourContext);
  const id = useId();
  const headingId = useId();
  const isActiveStep = tour != null && tour.activeStepId === id;
  const regionRef = useRef<HTMLElement | null>(null);
  // Focus return reads the last input from shared modality tracking.
  const {ref: trackModality} = useInteractionModalityTracking();
  // Prepared when the callout mounts, since the layer mounts its content
  // after the step's first commit. Kept on unmount: the cleanup that returns
  // focus runs after the callout leaves the DOM.
  const returnFocusOnRemovalRef = useRef<
    ((opener: Element | null) => void) | null
  >(null);
  const setRegion = useCallback(
    (node: HTMLElement | null) => {
      regionRef.current = node;
      if (node != null) {
        returnFocusOnRemovalRef.current = prepareFocusReturnOnRemoval(node);
      }
      return trackModality(node);
    },
    [trackModality],
  );

  // A non-modal anchored layer with no light dismiss. Without a backdrop, a
  // press on the page or the target leaves the tour running. The backdrop owns
  // the press that ends a dimmed tour.
  const layer = useLayer({mode: 'context'});
  const {ref: anchorLayerTo, show: showLayer, hide: hideLayer} = layer;
  const layerId = layer.id;

  // Whether any step of the tour is active after the latest commit. The
  // passive cleanup below runs after this layout effect, so it can tell a
  // step change from the end of the tour.
  const isTourRunningRef = useRef(false);
  const getOpener = tour?.getOpener;
  const isTourRunning = tour?.activeStepId != null;
  // An unmounted tour is not running: an app that removes Tour from
  // onDismiss still gets the focus return.
  useClientLayoutEffect(() => {
    isTourRunningRef.current = isTourRunning;
    return () => {
      isTourRunningRef.current = false;
    };
  }, [isTourRunning]);

  // The active target's viewport box, tracked so the highlight overlay can sit
  // exactly over it. null until measured (or when inactive).
  const [rect, setRect] = useState<TargetRect | null>(null);

  // Register with the controller on mount so the tour learns this step (and
  // its position among siblings). Unregister on unmount.
  useEffect(() => {
    if (tour == null) {
      return;
    }
    return tour.registerStep(id);
  }, [tour, id]);

  // Track the target's box while this step is active. Re-measure on
  // scroll/resize so the highlight stays glued to the target.
  useEffect(() => {
    const el = targetRef.current;
    if (el == null || !isActiveStep) {
      setRect(null);
      return;
    }
    const measure = () => {
      const box = el.getBoundingClientRect();
      setRect({
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        radius: getComputedStyle(el).borderRadius || '0px',
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      setRect(null);
    };
  }, [targetRef, isActiveStep]);

  // The callout anchors to the highlight box, not to the target. The box is
  // placed from the target's measured rect, so a press that scales the
  // target does not move the callout. The target gets no anchor name, no
  // trigger ARIA and no press handler.
  const setHighlight = useCallback(
    (node: HTMLDivElement | null) => {
      anchorLayerTo(node);
    },
    [anchorLayerTo],
  );

  // Shows the callout after the highlight overlay promotes itself, so the
  // callout stays above the highlight in the top layer.
  useEffect(() => {
    if (!isActiveStep) {
      return;
    }
    showLayer();
    // Focus moves to the step region, so assistive technology reads the new
    // step. The popover opens through the layer's own scheduling, so focus
    // waits one frame.
    const frame = requestAnimationFrame(() => {
      regionRef.current?.focus({preventScroll: true});
    });
    const target = targetRef.current;
    return () => {
      cancelAnimationFrame(frame);
      hideLayer();
      if (isTourRunningRef.current) {
        return;
      }
      // Focus returns only when the callout's removal lost it. It goes to
      // the target when the target is in the tab order. Otherwise it goes to
      // the element that had focus when the tour started.
      returnFocusOnRemovalRef.current?.(
        target != null && target.tabIndex >= 0
          ? target
          : (getOpener?.() ?? null),
      );
    };
  }, [isActiveStep, targetRef, showLayer, hideLayer, getOpener]);

  const onDismiss = tour?.onDismiss;
  useLayerDismissal({
    isActive: isActiveStep,
    onDismiss: () => onDismiss?.('escape'),
    getContainer: () =>
      regionRef.current?.ownerDocument.getElementById(layerId) ?? null,
  });

  // Outside a <Tour>, or when this isn't the active step, render nothing.
  if (tour == null || !isActiveStep || onDismiss == null) {
    return null;
  }

  const {
    activeStepIndex,
    stepCount,
    isStepCountShown,
    hasBackdrop,
    onNext,
    onPrevious,
  } = tour;

  const isFirstStep = activeStepIndex <= 0;
  const isLastStep = stepCount > 0 && activeStepIndex === stepCount - 1;

  const content = (
    <section
      ref={setRegion}
      aria-labelledby={headingId}
      tabIndex={-1}
      {...stylex.props(styles.surface, focusOutlineStyles.focusVisible)}
      data-testid={testId}>
      <div {...stylex.props(styles.content)}>
        <VStack gap={1}>
          <HStack gap={2} xstyle={styles.header}>
            <Heading level={4} id={headingId}>
              {heading}
            </Heading>
            <IconButton
              variant="ghost"
              size="sm"
              label="Close tour"
              icon={<Icon icon="close" size="sm" />}
              onClick={() => onDismiss('close')}
            />
          </HStack>
          {children != null && <Text type="body">{children}</Text>}
        </VStack>
        <HStack gap={2} xstyle={styles.footer}>
          {isStepCountShown && stepCount > 0 ? (
            <Text type="supporting" color="secondary">
              {`${activeStepIndex + 1} of ${stepCount}`}
            </Text>
          ) : (
            <span />
          )}
          <HStack gap={2}>
            {!isFirstStep && (
              <Button
                variant="ghost"
                size="sm"
                label="Back"
                onClick={onPrevious}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              label={isLastStep ? 'Done' : 'Next'}
              onClick={onNext}
            />
          </HStack>
        </HStack>
      </div>
    </section>
  );

  return (
    <>
      {/* Rendered before the callout so the callout promotes above it in the
          top layer (callout > highlight > page). */}
      <TourHighlight
        rect={rect}
        hasBackdrop={hasBackdrop}
        onBackdropClick={() => onDismiss('backdrop')}
        highlightRef={setHighlight}
      />
      {layer.render(<LayerDepthProvider>{content}</LayerDepthProvider>, {
        placement,
        alignment,
        offset: spacingVars['--spacing-1'],
        // Push the callout clear of the highlight ring so the ring is never
        // covered (placement-aware; adds to the layer's anchor offset).
        xstyle: calloutGapStyles[placement],
      })}
    </>
  );
}

TourStep.displayName = 'TourStep';
