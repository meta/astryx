// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PreviewStage.tsx
 * @input viewport size, fullscreen flag, a ref for the iframe element, the
 *   current preview frame generation (key + src)
 * @output Responsive preview frame hosting the /playground/preview iframe
 * @position Playground right panel — preview surface.
 *
 * Keeps a SINGLE iframe element mounted across viewport + fullscreen changes
 * (only the wrapper styles change) so the parent's channel to the preview
 * never resets. The one thing that DOES replace the element is the playground
 * starting a new frame generation (see previewChannel.ts): the iframe is keyed
 * on it, so a replaced preview document is torn down with its whole browsing
 * context rather than navigated in place. Desktop = fill; Phone = a fixed
 * 402px-wide frame (content reflows natively at mobile width, no scaling).
 */

'use client';

import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Center} from '@astryxdesign/core/Center';
import {Button} from '@astryxdesign/core/Button';
import {Minimize2} from 'lucide-react';
import {PreviewFrame, type PreviewFrameGeneration} from './usePreviewFrame';

const noop = () => {};

export type Viewport = 'desktop' | 'phone';

// iPhone 17 logical viewport (402 × 874 CSS px, ~9:19.5).
const PHONE_WIDTH = 402;
const PHONE_HEIGHT = 874;

const s = stylex.create({
  area: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    paddingInline: 'var(--spacing-4)',
    paddingBlockEnd: 'var(--spacing-4)',
    paddingBlockStart: 0,
  },
  areaFullBleed: {
    paddingInline: 0,
    paddingBlockEnd: 0,
    paddingBlockStart: 0,
  },
  fullscreen: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    paddingInline: 0,
    paddingBlockEnd: 0,
  },
  // In fullscreen the card chrome (radius, border, shadow) is stripped so the
  // preview reads as a bare, edge-to-edge surface. The element stays mounted to
  // preserve the single iframe + its postMessage channel.
  cardFullscreen: {
    borderRadius: 0,
    borderWidth: 0,
    boxShadow: 'none',
  },
  cardFullBleed: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
  },
  card: {
    maxWidth: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
    transitionProperty: 'width, height',
    transitionDuration: 'var(--duration-medium, 410ms)',
    transitionTimingFunction:
      'var(--ease-standard, cubic-bezier(0.24, 1, 0.4, 1))',
  },
  iframe: {
    border: 'none',
    width: '100%',
    height: '100%',
    display: 'block',
    // Transparent so the iframe's own themed body color shows (not the
    // docsite/astryx body color). The selected theme paints inside the iframe.
    backgroundColor: 'transparent',
  },
  // Let pointer events pass through to window while the panel is being resized,
  // so dragging over the iframe doesn't stall the drag.
  iframeInert: {
    pointerEvents: 'none',
  },
  exitButtonCard: {
    position: 'absolute',
    top: 'var(--spacing-4)',
    right: 'var(--spacing-4)',
    zIndex: 51,
    boxShadow: 'var(--shadow-med)',
  },
});

// Runtime sizing — the preview frame is a fixed device size or fills its area.
const dynamic = stylex.create({
  size: (width: number | string, height: number | string) => ({
    width,
    height,
  }),
});

interface PreviewStageProps {
  viewport: Viewport;
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  /**
   * Receives the iframe element of the current generation when it mounts —
   * the playground hands its window to the channel (see previewChannel.ts).
   */
  frameRef: React.Ref<HTMLIFrameElement>;
  /**
   * The current preview frame generation: a key that remounts the iframe and
   * the nonce-carrying URL it must load (see previewChannel.ts). Null until
   * the playground has issued one on the client — the nonce must never be
   * baked into server-rendered HTML.
   */
  frame: PreviewFrameGeneration | null;
  /**
   * Fires on every load of the preview document — including a replaced one
   * (previewed code navigating or reloading its own frame), which is what
   * tells the playground the attested document is gone (previewChannel.ts).
   */
  onFrameLoad?: () => void;
  /** Disable iframe pointer events (e.g. while the panel is being resized). */
  isInteractionDisabled?: boolean;
  /** Render the iframe directly, without the preview card/device frame. */
  isFullBleed?: boolean;
}

export function PreviewStage({
  viewport,
  isFullscreen,
  onExitFullscreen,
  frameRef,
  frame,
  onFrameLoad,
  isInteractionDisabled = false,
  isFullBleed = false,
}: PreviewStageProps) {
  const isPhone = !isFullscreen && !isFullBleed && viewport === 'phone';
  const width = isPhone ? PHONE_WIDTH : '100%';
  const height = isPhone ? PHONE_HEIGHT : '100%';

  return (
    <Center
      axis={isPhone ? 'both' : 'horizontal'}
      xstyle={[
        s.area,
        isFullBleed && !isFullscreen && s.areaFullBleed,
        isFullscreen && s.fullscreen,
      ]}>
      {isFullscreen && (
        <Card padding={0} xstyle={s.exitButtonCard}>
          <Button
            label="Exit fullscreen"
            tooltip="Exit fullscreen"
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<Minimize2 size={16} />}
            onClick={onExitFullscreen}
          />
        </Card>
      )}
      <Card
        padding={0}
        xstyle={[
          s.card,
          (isFullscreen || isFullBleed) && s.cardFullscreen,
          isFullBleed && !isFullscreen && s.cardFullBleed,
          dynamic.size(width, height),
        ]}>
        {frame != null && (
          <PreviewFrame
            frame={frame}
            frameRef={frameRef}
            onLoad={onFrameLoad ?? noop}
            title="Preview"
            {...stylex.props(s.iframe, isInteractionDisabled && s.iframeInert)}
          />
        )}
      </Card>
    </Center>
  );
}
