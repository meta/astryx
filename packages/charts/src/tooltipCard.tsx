// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tooltipCard.tsx
 * @input Chart context (svgRef, margin, width), card content and an anchor
 * @output The chart tooltip card: a fixed-mode Layer host with the card chrome,
 *         portaled into the chart's HTML parent, its placement, and the
 *         default card body
 * @position Package-private. ChartTooltip and dotGLInteractive render their
 *           cards through it, so every chart card looks and moves the same.
 */

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {HStack, Text, useLayer, VStack} from '@astryxdesign/core';
import {useChart} from './ChartContext';
import {ChartSwatch, swatchVariantForType} from './ChartSwatch';
import type {ChartTooltipPlacement} from './ChartTooltip';
import type {TooltipSeriesValue} from './tooltip';

/** Space between the anchor (plus its clearance) and the card, in CSS px. */
const CARD_GAP = 8;

const styles = stylex.create({
  // Visual card chrome is applied to the Layer host. useLayer owns its fixed
  // positioning and browser top-layer promotion.
  card: {
    backgroundColor: colorVars['--color-background-popover'],
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    // Longhands match the Layer host's padding reset, so the card padding
    // still wins when each package ships its own prebuilt stylesheet.
    paddingBlockStart: spacingVars['--spacing-2'],
    paddingBlockEnd: spacingVars['--spacing-2'],
    paddingInlineStart: spacingVars['--spacing-3'],
    paddingInlineEnd: spacingVars['--spacing-3'],
    boxShadow: shadowVars['--shadow-med'],
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
});

/** Default tooltip body — used when a caller passes no custom render. */
export const DefaultTooltipContent = memo(function DefaultTooltipContent({
  xValue,
  rows,
}: {
  xValue: unknown;
  rows: TooltipSeriesValue[];
}) {
  return (
    <VStack gap={1}>
      <Text type="body" weight="semibold">
        {String(xValue)}
      </Text>
      {rows.length === 1 ? (
        <Text type="supporting">{String(rows[0].value)}</Text>
      ) : (
        <VStack gap={1}>
          {rows.map((row, i) => (
            <HStack key={`${row.key}-${i}`} gap={2} vAlign="center">
              <ChartSwatch
                color={row.color}
                variant={swatchVariantForType(row.type)}
              />
              <Text type="supporting">{row.label}</Text>
              <Text type="supporting" weight="semibold">
                {String(row.value)}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
});

export interface TooltipCardPlacementOptions {
  placement: ChartTooltipPlacement;
  /** Radius around the anchor that the card keeps clear of. Default 0. */
  clearance?: number;
  /**
   * `'start'` (default): the card top is at the anchor. `'center'`: the card
   * is centered on the anchor. A `'top'` placement ignores it.
   */
  verticalAlign?: 'start' | 'center';
}

/**
 * Card coordinates for a card of the given size at an anchor in viewport
 * coordinates, clamped to the viewport. Oversized custom content keeps its
 * caller-owned dimensions and may extend past the far edge.
 */
function placeCard(
  anchorX: number,
  anchorY: number,
  cardWidth: number,
  cardHeight: number,
  {
    placement,
    clearance = 0,
    verticalAlign = 'start',
  }: TooltipCardPlacementOptions,
): {x: number; y: number} {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let x: number;
  let y = verticalAlign === 'center' ? anchorY - cardHeight / 2 : anchorY;
  switch (placement) {
    case 'left':
      x = anchorX - clearance - cardWidth - CARD_GAP;
      break;
    case 'right':
      x = anchorX + clearance + CARD_GAP;
      break;
    case 'top':
      x = anchorX - cardWidth / 2;
      y = anchorY - cardHeight - CARD_GAP;
      break;
    case 'auto':
    default: {
      const rightX = anchorX + clearance + CARD_GAP;
      x =
        rightX + cardWidth > viewportWidth
          ? anchorX - clearance - cardWidth - CARD_GAP
          : rightX;
    }
  }
  x = Math.max(CARD_GAP, Math.min(x, viewportWidth - cardWidth - CARD_GAP));
  y = Math.max(CARD_GAP, Math.min(y, viewportHeight - cardHeight - CARD_GAP));
  return {x, y};
}

/**
 * The card host's portal target: the chart's nearest HTML element. The store
 * owns the node, and the card subscribes to it, so the node is never React
 * state.
 */
interface PortalTargetStore {
  readonly get: () => HTMLElement | null;
  readonly set: (target: HTMLElement | null) => void;
  readonly subscribe: (onChange: () => void) => () => void;
}

function createPortalTargetStore(): PortalTargetStore {
  let target: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => target,
    set: next => {
      if (next === target) {
        return;
      }
      target = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: onChange => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

const readNoPortalTarget = (): HTMLElement | null => null;

/**
 * The chart tooltip card. `show` and `hide` open and close it, `place`
 * measures the committed card and moves it beside an anchor in plot
 * coordinates, and `renderCard` renders the Layer host with the content.
 */
export function useTooltipCard() {
  const {svgRef, margin, width} = useChart();
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPosition, setCardPosition] = useState({x: 0, y: 0});
  const [portalTargetStore] = useState(createPortalTargetStore);
  const portalTarget = useSyncExternalStore(
    portalTargetStore.subscribe,
    portalTargetStore.get,
    readNoPortalTarget,
  );
  const {hide, isOpen, render, show} = useLayer({mode: 'fixed'});

  // Effect: syncs the portal target store with the DOM. The Layer host must
  // remain in the chart's nearest HTML subtree so nested Theme and MediaTheme
  // scopes keep applying. The portal crosses only the SVG boundary; browser
  // top-layer promotion remains Layer's responsibility.
  useEffect(() => {
    portalTargetStore.set(svgRef.current?.parentElement ?? null);
  }, [portalTargetStore, svgRef, width]);

  const place = useCallback(
    (
      anchor: {px: number; py: number},
      options: TooltipCardPlacementOptions,
    ) => {
      const svg = svgRef.current;
      const layerHost = cardRef.current?.parentElement;
      if (!svg || !layerHost) {
        return;
      }
      const svgRect = svg.getBoundingClientRect();
      const {x, y} = placeCard(
        svgRect.left + margin.left + anchor.px,
        svgRect.top + margin.top + anchor.py,
        layerHost.offsetWidth,
        layerHost.offsetHeight,
        options,
      );
      setCardPosition(current =>
        current.x === x && current.y === y ? current : {x, y},
      );
    },
    [svgRef, margin],
  );

  const renderCard = (content: ReactNode, isHidden: boolean): ReactNode => {
    if (!portalTarget) {
      return null;
    }
    const hasNativePopover =
      typeof HTMLElement !== 'undefined' &&
      typeof HTMLElement.prototype.showPopover === 'function';
    return createPortal(
      render(
        <div ref={cardRef} role="tooltip">
          {content}
        </div>,
        {
          x: cardPosition.x,
          y: cardPosition.y,
          // Native Popover keeps a closed host out of layout itself, so
          // remove our guard before showPopover() measures it. Layer's
          // reduced fallback needs the explicit closed display state.
          style:
            isHidden || (!hasNativePopover && !isOpen)
              ? {display: 'none'}
              : undefined,
          xstyle: styles.card,
        },
      ),
      portalTarget,
    );
  };

  return {cardRef, show, hide, place, renderCard};
}
