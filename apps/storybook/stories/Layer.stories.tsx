// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useLayoutEffect, useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {useLayer} from '@astryxdesign/core/Layer';
import {LayerProvider} from '@astryxdesign/core/Layer';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';

const styles = stylex.create({
  popoverContent: {
    backgroundColor: 'var(--color-background-surface)',
    borderRadius: 8,
    padding: 16,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    border: '1px solid var(--color-border-default)',
  },
  demoArea: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
});

const meta: Meta = {
  title: 'Core/Layer',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Layer is the core positioning hook for overlay content using CSS Anchor Positioning and the Popover API. Used as the foundation for Popover, HoverCard, and Tooltip.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

function ContextModeDemo() {
  const layer = useLayer({mode: 'context', lightDismiss: true});

  return (
    <div {...stylex.props(styles.demoArea)}>
      <Button
        ref={layer.ref}
        label="Show layer"
        onClick={() => (layer.isOpen ? layer.hide() : layer.show())}
      />
      {layer.render(
        <div {...stylex.props(styles.popoverContent)}>
          <Text type="body">
            This layer is anchored to the button using CSS Anchor Positioning.
          </Text>
        </div>,
        {placement: 'below', alignment: 'center'},
      )}
    </div>
  );
}

export const ContextMode: Story = {
  render: () => <ContextModeDemo />,
};

function OffsetDemo() {
  const [placement, setPlacement] = useState<
    'above' | 'below' | 'start' | 'end'
  >('end');
  const flush = useLayer({mode: 'context', lightDismiss: true});
  const spaced = useLayer({mode: 'context', lightDismiss: true});

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      <div style={{display: 'flex', gap: 8}}>
        {(['above', 'below', 'start', 'end'] as const).map(p => (
          <Button
            key={p}
            label={p}
            variant={placement === p ? 'primary' : 'secondary'}
            onClick={() => setPlacement(p)}
          />
        ))}
      </div>
      <div {...stylex.props(styles.demoArea)} style={{gap: 120}}>
        <div>
          <Button
            ref={flush.ref}
            label="offset: 0"
            onClick={() => (flush.isOpen ? flush.hide() : flush.show())}
          />
          {flush.render(
            <div {...stylex.props(styles.popoverContent)}>
              <Text type="body">Flush against the anchor</Text>
            </div>,
            {placement, alignment: 'center'},
          )}
        </div>
        <div>
          <Button
            ref={spaced.ref}
            label="offset: 12"
            onClick={() => (spaced.isOpen ? spaced.hide() : spaced.show())}
          />
          {spaced.render(
            <div {...stylex.props(styles.popoverContent)}>
              <Text type="body">12px of clearance, on either side</Text>
            </div>,
            {placement, alignment: 'center', offset: 12},
          )}
        </div>
      </div>
    </div>
  );
}

export const Offset: Story = {
  render: () => <OffsetDemo />,
};

function PlacementDemo() {
  const [placement, setPlacement] = useState<
    'above' | 'below' | 'start' | 'end'
  >('above');
  const layer = useLayer({mode: 'context', lightDismiss: true});

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
      }}>
      <div style={{display: 'flex', gap: 8}}>
        {(['above', 'below', 'start', 'end'] as const).map(p => (
          <Button
            key={p}
            label={p}
            variant={placement === p ? 'primary' : 'secondary'}
            onClick={() => setPlacement(p)}
          />
        ))}
      </div>
      <div {...stylex.props(styles.demoArea)}>
        <Button
          ref={layer.ref}
          label="Trigger"
          onClick={() => (layer.isOpen ? layer.hide() : layer.show())}
        />
        {layer.render(
          <div {...stylex.props(styles.popoverContent)}>
            <Text type="body">Placement: {placement}</Text>
          </div>,
          {placement, alignment: 'center'},
        )}
      </div>
    </div>
  );
}

export const Placements: Story = {
  render: () => <PlacementDemo />,
};

function FixedModeDemo() {
  const [coords, setCoords] = useState({x: 0, y: 0});
  const layer = useLayer({mode: 'fixed', lightDismiss: true});

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 300,
        border: '1px dashed var(--color-border-default)',
        borderRadius: 8,
        cursor: 'crosshair',
      }}
      onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        setCoords({
          x: e.clientX - rect.left + rect.left,
          y: e.clientY - rect.top + rect.top,
        });
        layer.show();
      }}>
      <Text type="supporting" style={{padding: 16}}>
        Click anywhere in this area to show a fixed-position layer
      </Text>
      {layer.render(
        <div {...stylex.props(styles.popoverContent)}>
          <Text type="body">
            Fixed at ({Math.round(coords.x)}, {Math.round(coords.y)})
          </Text>
        </div>,
        {x: coords.x, y: coords.y},
      )}
    </div>
  );
}

export const FixedMode: Story = {
  render: () => <FixedModeDemo />,
};

function LayerProviderDemo() {
  return (
    <LayerProvider toast={{position: 'topEnd', maxVisible: 3}}>
      <div style={{padding: 16}}>
        <Text type="body">
          LayerProvider wraps your app to configure layer systems (toast
          positioning, max visible toasts). It is optional; hooks fall back to
          defaults when no provider exists.
        </Text>
      </div>
    </LayerProvider>
  );
}

export const Provider: Story = {
  render: () => <LayerProviderDemo />,
};

const FILLER =
  'Sequential focus follows DOM order, so where a layer is hosted decides what the browser does when focus moves into it. This paragraph is filler, so the container has something to scroll.';

interface HostingProbe {
  parentTag: string;
  insideParagraph: boolean;
  fontSize: string;
}

function describeFocus(): string {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) {
    return 'nothing';
  }
  const label = el.textContent?.trim().slice(0, 20);
  const tag = el.tagName.toLowerCase();
  return label ? `${tag} "${label}"` : tag;
}

function InlineHostingDemo() {
  const layer = useLayer({
    mode: 'context',
    lightDismiss: true,
    lazyMount: true,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [probe, setProbe] = useState<HostingProbe | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  // Samples the scroll offset on both sides of a frame: the browser's
  // scroll-into-view for the newly focused element lands in between.
  const record = (label: string, watchScroll = true) => {
    const before = Math.round(scrollRef.current?.scrollTop ?? 0);
    requestAnimationFrame(() => {
      const after = Math.round(scrollRef.current?.scrollTop ?? 0);
      const scroll = !watchScroll
        ? `scrollTop ${after}`
        : before === after
          ? `scrollTop ${after} (no jump)`
          : `scrollTop ${before} → ${after}`;
      const popover = document.getElementById(layer.id);
      setProbe(
        popover
          ? {
              parentTag: popover.parentElement?.tagName.toLowerCase() ?? '—',
              insideParagraph: paragraphRef.current?.contains(popover) ?? false,
              fontSize: window.getComputedStyle(popover).fontSize,
            }
          : null,
      );
      setEvents(prev =>
        [`${label} — focus: ${describeFocus()} — ${scroll}`, ...prev].slice(
          0,
          6,
        ),
      );
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxWidth: 520,
      }}>
      <Button label="Before the article" />

      <div
        ref={scrollRef}
        onScroll={() => record('scrolled', false)}
        onFocusCapture={() => record('focus moved')}
        style={{
          height: 200,
          overflow: 'auto',
          padding: 16,
          border: '1px solid var(--color-border-default)',
          borderRadius: 8,
        }}>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
        <p ref={paragraphRef} style={{fontSize: 13, textAlign: 'center'}}>
          Reviewed by{' '}
          <button
            ref={layer.ref}
            type="button"
            onClick={() => {
              if (layer.isOpen) {
                layer.hide();
              } else {
                layer.show();
              }
              record('toggled the card');
            }}
            style={{
              font: 'inherit',
              color: 'var(--color-content-link)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}>
            Jane Doe
          </button>{' '}
          earlier today, from inside a 13px centered paragraph.
          {layer.render(
            <div {...stylex.props(styles.popoverContent)} style={{width: 240}}>
              <Text type="body">Jane Doe</Text>
              <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                <Button label="Follow" variant="primary" />
                <Button label="Message" />
              </div>
            </div>,
            {
              placement: 'below',
              alignment: 'start',
              offset: 8,
              role: 'dialog',
              'aria-label': 'Jane Doe',
            },
          )}
        </p>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
        <p style={{fontSize: 13, textAlign: 'center'}}>{FILLER}</p>
      </div>

      <Button label="After the article" />

      <Text type="supporting">
        Tab in from the button above: the browser scrolls the trigger into view.
        Open the card, then Tab from the trigger into it and out the far side.
        Every move is logged with the container&apos;s scroll offset before and
        after the browser&apos;s scroll-into-view.
      </Text>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content max-content',
          gap: '2px 12px',
          fontSize: 13,
          margin: 0,
        }}>
        <dt>Layer&apos;s parent</dt>
        <dd style={{margin: 0}}>
          <code>{probe?.parentTag ?? 'not rendered yet'}</code>
        </dd>
        <dt>Inside the paragraph</dt>
        <dd style={{margin: 0}}>
          <code>{probe ? String(probe.insideParagraph) : '—'}</code>
        </dd>
        <dt>Card font size</dt>
        <dd style={{margin: 0}}>
          <code>{probe?.fontSize ?? '—'}</code>
        </dd>
      </dl>

      <ol style={{fontSize: 13, lineHeight: 1.6, paddingInlineStart: 20}}>
        {events.map((event, i) => (
          <li key={`${event}-${i}`}>{event}</li>
        ))}
      </ol>
    </div>
  );
}

export const InlineTriggerHosting: Story = {
  render: () => <InlineHostingDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'A closed context layer leaves only an inert marker at its JSX position. When opened from this unsafe paragraph, the final layer is lazily portaled to the nearest ancestor that can contain it; a layer at a safe position would stay inline. The readout shows where the layer landed and what typography it inherits; the log shows what the browser scrolls as focus moves into and out of it.',
      },
    },
  },
};

// =============================================================================
// Viewport inset — spec:AST-059
// =============================================================================
//
// Each story below is a claim in `docs/specs/AST-059-layer-viewport-inset`
// a person can open and look at, and a geometry assertion the story play
// guard runs in real Chromium at two viewports — 1280×900 and a 390×844
// phone — so a claim that holds only where the viewport is wider than the
// layer is caught. The assertions read the layer's rectangle synchronously
// after the opening click commits: that is the geometry of the first frame
// the browser paints (FR8). Each then settles and reads again; any
// difference is a paint-then-shift and fails.

const GUTTER = 16; // --spacing-4
const TOLERANCE = 1.5;

const viewportStyles = stylex.create({
  canvas: {
    position: 'relative',
    boxSizing: 'border-box',
    inlineSize: '100%',
    minBlockSize: '100dvh',
    overflow: 'clip',
  },
  wideCanvas: {
    inlineSize: 3000,
    minBlockSize: '100dvh',
    position: 'relative',
  },
  caption: {
    position: 'absolute',
    insetBlockStart: 16,
    insetInlineStart: 16,
    maxInlineSize: 'calc(100% - 32px)',
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  // A raw useLayer surface. The runtime caps the layer box to the viewport;
  // what happens to content wider or taller than that is the surface's — here
  // it reads the same cap and scrolls, as Popover does once it measures
  // overflow.
  surface: {
    boxSizing: 'border-box',
    backgroundColor: 'var(--color-background-surface)',
    border: '2px solid var(--color-border-accent, #6366f1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    lineHeight: 1.4,
    maxInlineSize: stylex.firstThatWorks(
      'calc(100vi - 32px)',
      'calc(100vw - 32px)',
    ),
    maxBlockSize: stylex.firstThatWorks(
      'calc(100dvb - 32px)',
      'calc(100vh - 32px)',
    ),
    overflow: 'auto',
  },
  nowrap: {whiteSpace: 'nowrap'},
  tall: {
    blockSize: 2000,
    inlineSize: 200,
    background:
      'repeating-linear-gradient(to bottom, transparent 0 39px, var(--color-border-default) 39px 40px)',
  },
  explicitWidth: (width: number) => ({width}),
  bottomBar: {
    position: 'fixed',
    insetBlockEnd: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    backgroundColor: 'var(--color-background-inverse, #111)',
    color: 'var(--color-text-inverse, #fff)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
  },
  barHeight: (height: number) => ({blockSize: height}),
  controls: {
    position: 'fixed',
    insetBlockStart: 8,
    insetInlineEnd: 8,
    display: 'flex',
    gap: 8,
    zIndex: 1,
  },
});

type Pos = {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
};
type Placement = 'above' | 'below' | 'start' | 'end';
type Alignment = 'start' | 'center' | 'end';

function ViewportLayer({
  at,
  placement = 'below',
  alignment = 'start',
  width,
  children,
  caption,
  canvasXstyle,
  extra,
  isOpenInitially = false,
}: {
  at: Pos;
  placement?: Placement;
  alignment?: Alignment;
  width?: number;
  children: React.ReactNode;
  caption: string;
  canvasXstyle?: stylex.StyleXStyles;
  extra?: React.ReactNode;
  isOpenInitially?: boolean;
}) {
  const layer = useLayer({mode: 'context', lightDismiss: true});
  const openedRef = useRef(false);
  useLayoutEffect(() => {
    if (isOpenInitially && !openedRef.current) {
      openedRef.current = true;
      layer.show();
    }
  }, [isOpenInitially, layer]);
  return (
    <div
      {...stylex.props(viewportStyles.canvas, canvasXstyle)}
      data-testid="canvas">
      <p {...stylex.props(viewportStyles.caption)}>{caption}</p>
      <div style={{position: 'absolute', ...at}}>
        <Button
          ref={layer.ref}
          label="Open"
          size="sm"
          data-testid="trigger"
          onClick={() => (layer.isOpen ? layer.hide() : layer.show())}
        />
      </div>
      {layer.render(
        <div {...stylex.props(viewportStyles.surface)}>{children}</div>,
        {
          placement,
          alignment,
          offset: 4,
          xstyle: width != null ? viewportStyles.explicitWidth(width) : null,
        },
      )}
      {extra}
    </div>
  );
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r(null)));
// React commits a discrete event's state update in a microtask; microtasks
// run before the browser paints, so a read after this is still the first
// frame's geometry.
const committed = () => new Promise(r => queueMicrotask(() => r(null)));
const settle = async () => {
  await nextFrame();
  await nextFrame();
};

type Rects = {
  trigger: DOMRect;
  layer: DOMRect;
  vw: number;
  vh: number;
};

function rects(canvasElement: HTMLElement): Rects {
  const trigger = canvasElement.querySelector<HTMLElement>(
    '[data-testid="trigger"]',
  );
  const layer = document.querySelector<HTMLElement>(
    '[popover]:popover-open[id]',
  );
  if (!trigger || !layer) {
    throw new Error('No open layer');
  }
  return {
    trigger: trigger.getBoundingClientRect(),
    layer: layer.getBoundingClientRect(),
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
}

/** The largest inline size a layer may take at this viewport (FR2). */
const inlineCap = (r: Rects) => r.vw - 2 * GUTTER;

function sameRect(a: DOMRect, b: DOMRect) {
  return (
    Math.abs(a.left - b.left) <= TOLERANCE &&
    Math.abs(a.top - b.top) <= TOLERANCE &&
    Math.abs(a.width - b.width) <= TOLERANCE &&
    Math.abs(a.height - b.height) <= TOLERANCE
  );
}

/**
 * Click the trigger, read the first frame's geometry synchronously (the
 * discrete event flushes React and the rect read forces layout), then settle
 * and read again. A difference is a paint-then-shift (FR8).
 */
async function open(canvasElement: HTMLElement): Promise<Rects> {
  canvasElement.querySelector<HTMLElement>('[data-testid="trigger"]')?.click();
  const first = rects(canvasElement);
  await settle();
  const settled = rects(canvasElement);
  assertNoShift(first, settled, 'after opening');
  return settled;
}

function assertNoShift(first: Rects, settled: Rects, when: string) {
  if (!sameRect(first.layer, settled.layer)) {
    fail(
      `Paint-then-shift ${when}: first frame ${fmt(first.layer)}, settled ${fmt(settled.layer)}`,
    );
  }
}

const fmt = (r: DOMRect) =>
  `${Math.round(r.left)}..${Math.round(r.right)} × ${Math.round(r.top)}..${Math.round(r.bottom)} (${Math.round(r.width)}w)`;

/** What the browser resolved for the open layer; appended to every failure. */
function diagnose(): string {
  const layer = document.querySelector<HTMLElement>(
    '[popover]:popover-open[id]',
  );
  if (!layer) {
    return 'no open layer';
  }
  const cs = getComputedStyle(layer);
  const read = (prop: string) => cs.getPropertyValue(prop).trim();
  return [
    `position-area=${read('position-area')}`,
    `fallbacks=${read('position-try-fallbacks')}`,
    `justify-self=${read('justify-self')} align-self=${read('align-self')}`,
    `inset t/r/b/l=${read('top')}/${read('right')}/${read('bottom')}/${read('left')}`,
    `margin t/r/b/l=${read('margin-top')}/${read('margin-right')}/${read('margin-bottom')}/${read('margin-left')}`,
    `max w/h=${read('max-width')}/${read('max-height')}`,
    `inline style=${layer.getAttribute('style') ?? ''}`,
  ].join('\n  ');
}

function fail(message: string): never {
  throw new Error(`${message}\n  ${diagnose()}`);
}

function assertOnScreen(r: Rects, label: string, gutter = GUTTER) {
  const {layer, vw, vh} = r;
  if (
    layer.left < gutter - TOLERANCE ||
    layer.right > vw - gutter + TOLERANCE ||
    layer.top < gutter - TOLERANCE ||
    layer.bottom > vh - gutter + TOLERANCE
  ) {
    fail(
      `${label}: layer ${fmt(layer)} leaves the ${gutter}px gutter in a ${vw}×${vh} viewport`,
    );
  }
}

/** An explicit width renders at its size, or at the cap when it is larger. */
function assertWidth(r: Rects, asked: number, label: string) {
  const expected = Math.min(asked, inlineCap(r));
  if (Math.abs(r.layer.width - expected) > TOLERANCE) {
    throw new Error(
      `${label}: asked ${asked}px, cap ${inlineCap(r)}px, rendered ${Math.round(r.layer.width)}px`,
    );
  }
}

const viewportParameters = {
  layout: 'fullscreen',
  docs: {story: {inline: false, height: '600px'}},
};

export const ContentFitsBesideTrigger: Story = {
  name: 'Viewport inset: content-sized, fits beside the trigger',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 40}}
      caption="FR2, FR4 — A content-sized layer with room beside its trigger sizes to its content and stays start-aligned to the trigger. Nothing caps it to the span; nothing moves it.">
      <span {...stylex.props(viewportStyles.nowrap)}>Four short rows</span>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    if (Math.abs(r.layer.left - r.trigger.left) > TOLERANCE) {
      throw new Error(
        `Expected the layer to stay start-aligned to the trigger (${r.trigger.left}), got ${r.layer.left}`,
      );
    }
    if (r.layer.width < 120) {
      throw new Error(`Layer shrank to ${r.layer.width}px`);
    }
    assertOnScreen(r, 'fits beside');
  },
};

export const ContentDoesNotFitBesideTrigger: Story = {
  name: 'Viewport inset: content-sized, does not fit beside the trigger',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, right: 60}}
      caption="FR2, FR4 — The trigger sits 60px from the inline-end edge and the layer's content cannot wrap. Where the content fits the viewport (desktop), the layer keeps its size and flips to end alignment instead of being squeezed into the room beside the trigger. Where it does not fit the viewport at all (a phone), the layer is capped to the viewport minus its gutters and the content scrolls inside it.">
      <span {...stylex.props(viewportStyles.nowrap)}>
        Unbreakable-label-that-cannot-wrap-to-fit-beside-the-trigger
      </span>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    const cap = inlineCap(r);
    if (r.layer.width < Math.min(300, cap) - TOLERANCE) {
      throw new Error(`Layer was squeezed to ${r.layer.width}px`);
    }
    if (r.layer.width > cap + TOLERANCE) {
      throw new Error(`Layer ${r.layer.width}px exceeds the cap ${cap}px`);
    }
    if (
      r.layer.width < cap - TOLERANCE &&
      Math.abs(r.layer.right - r.trigger.right) > TOLERANCE
    ) {
      throw new Error(
        `Expected a flip to end alignment (right ${r.trigger.right}), got right ${r.layer.right}`,
      );
    }
    assertOnScreen(r, 'does not fit beside');
  },
};

export const ExplicitSizeNearEdge: Story = {
  name: 'Viewport inset: explicit size near an edge (352px)',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 45}}
      alignment="end"
      width={352}
      caption="FR2 — An end-aligned layer given width 352 on a trigger 45px from the inline-start edge. The room beside the trigger is 45px plus the trigger; the layer renders at 352px anyway, flipped to start alignment, never shrunk to 274px.">
      A 352px panel
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 352, 'explicit size');
    assertOnScreen(r, 'explicit size');
  },
};

export const TriggerNearEdgeFlips: Story = {
  name: 'Viewport inset: trigger near an edge flips',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, right: 80}}
      width={320}
      caption="FR4 — A start-aligned 320px layer on a trigger 80px from the inline-end edge flips to end alignment: its inline-end edge meets the trigger's, and it keeps the 16px gutter from the viewport edge.">
      Flipped to the other side
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 320, 'flip');
    // A flip is the answer where the end side has room for 320px (desktop);
    // on a phone neither side does and the layer slides instead (FR4).
    const roomOnEndSide = r.trigger.right - GUTTER;
    if (
      roomOnEndSide >= 320 &&
      Math.abs(r.layer.right - r.trigger.right) > TOLERANCE
    ) {
      throw new Error(
        `Expected the flipped layer's end edge at ${r.trigger.right}, got ${r.layer.right}`,
      );
    }
    assertOnScreen(r, 'flip');
  },
};

export const NeitherSideFits: Story = {
  name: 'Viewport inset: neither side fits',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 'calc(50% - 20px)'}}
      width={1000}
      caption="FR2, FR4 — A 1000px layer on a centred trigger fits on neither side of it. Where 1000px fits the viewport, it keeps its size and slides along the inline axis the least distance that brings it inside the gutters. Where it does not, it is capped to the viewport minus the gutters.">
      Too wide for either side; slid into view
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 1000, 'neither side fits');
    assertOnScreen(r, 'neither side fits');
  },
};

function assertAbove(r: Rects, label: string) {
  if (r.layer.bottom > r.trigger.top + TOLERANCE) {
    fail(
      `${label}: expected the layer above its trigger (trigger top ${Math.round(r.trigger.top)}), layer ${fmt(r.layer)}`,
    );
  }
}

export const TriggerNearTheBottomFlips: Story = {
  name: 'Viewport inset: trigger near the bottom flips above',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{bottom: 60, left: 40}}
      width={240}
      caption="FR4 — A 240px layer placed below a trigger 60px from the bottom edge has no room below and flips above. The block axis follows the same rule as the inline axis.">
      <div style={{blockSize: 90}}>90px of rows</div>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertAbove(r, 'near the bottom');
    assertOnScreen(r, 'near the bottom');
  },
};

export const WideLayerNearTheBottomFlips: Story = {
  name: 'Viewport inset: wide layer, trigger near the bottom',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{bottom: 60, left: 40}}
      width={690}
      caption="FR2, FR4 — A 690px layer placed below a trigger 60px from the bottom edge. On a phone the width is capped to the viewport and fits beside the trigger on neither side; the layer still flips above, because the slide option spans the whole inline axis and leaves the block axis free to choose the side with room.">
      <div style={{blockSize: 90}}>90px of rows</div>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 690, 'wide near the bottom');
    assertAbove(r, 'wide near the bottom');
    assertOnScreen(r, 'wide near the bottom');
  },
};

export const TallerThanTheViewport: Story = {
  name: 'Viewport inset: taller than the viewport',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 40}}
      caption="FR3 — Content 2000px tall. The layer box is capped to the viewport minus both block gutters; the surface inside scrolls.">
      <div {...stylex.props(viewportStyles.tall)}>2000px of rows</div>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    if (r.layer.height > r.vh - 2 * GUTTER + TOLERANCE) {
      fail(
        `Layer block size ${r.layer.height}px exceeds the viewport minus gutters (${r.vh - 2 * GUTTER}px)`,
      );
    }
    // Taller than either side can hold: capped and shifted into the viewport,
    // keeping its anchor clearance rather than the gutter on the edge it
    // meets (FR4). Inside the viewport on the block axis; gutters inline.
    if (r.layer.top < -TOLERANCE || r.layer.bottom > r.vh + TOLERANCE) {
      fail(`Layer ${fmt(r.layer)} leaves the viewport`);
    }
    if (
      r.layer.left < GUTTER - TOLERANCE ||
      r.layer.right > r.vw - GUTTER + TOLERANCE
    ) {
      fail(`Layer ${fmt(r.layer)} leaves the inline gutter`);
    }
  },
};

// Anchor visibility is observed, not polled; give the observer its
// rendering opportunity and the fallback re-evaluation that follows.
const scrollAndSettle = async (x: number) => {
  window.scrollTo(x, 0);
  await settle();
  await new Promise(resolve => setTimeout(resolve, 600));
  await settle();
};

export const AnchorLeavesTheViewport: Story = {
  name: 'Viewport inset: anchor leaves the viewport',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 200}}
      width={320}
      canvasXstyle={viewportStyles.wideCanvas}
      caption="FR5 — Scroll the page sideways until the trigger leaves the viewport. The open layer goes with it and keeps its 320px: it does not slide toward the edge and pin itself into the strip that is left. Scroll back and it is where it was.">
      Holds position and size
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const before = await open(canvasElement);
    await scrollAndSettle(before.trigger.right + 400);
    const away = rects(canvasElement);
    if (away.trigger.right > 0) {
      throw new Error(
        `Fixture: trigger still in view at ${away.trigger.left}..${away.trigger.right}`,
      );
    }
    if (Math.abs(away.layer.width - before.layer.width) > TOLERANCE) {
      throw new Error(
        `Layer changed size with its anchor off-screen: ${before.layer.width} → ${away.layer.width}`,
      );
    }
    if (away.layer.left >= 0) {
      throw new Error(
        `Layer slid toward the viewport edge (left ${away.layer.left}) while its anchor is at ${away.trigger.left}`,
      );
    }
    await scrollAndSettle(0);
    const back = rects(canvasElement);
    if (Math.abs(back.layer.width - before.layer.width) > TOLERANCE) {
      fail(
        `Layer changed size after its anchor returned: ${before.layer.width} → ${back.layer.width}`,
      );
    }
    // Where the layer fit beside its trigger it comes back to the same
    // place. A layer that had to slide (a phone) is a recorded verification
    // gap (spec:AST-059 VG1): Chromium does not re-run the slide when the pin
    // is withdrawn, so the layer can return start-aligned to its anchor and
    // off-screen until its next layout. Asserted here only where it fit.
    const fitBeside = before.layer.left >= before.trigger.left - TOLERANCE;
    if (fitBeside) {
      assertOnScreen(back, 'after the anchor returned');
      if (Math.abs(back.layer.left - before.layer.left) > TOLERANCE) {
        fail(
          `Layer did not return with its anchor: ${before.layer.left} → ${back.layer.left}`,
        );
      }
    }
  },
};

export const AnchorAlreadyOffScreen: Story = {
  name: 'Viewport inset: anchor already off-screen when the layer opens',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, left: 200}}
      width={320}
      canvasXstyle={viewportStyles.wideCanvas}
      caption="FR5, FR8 — The page is scrolled so the trigger is off-screen before the layer opens. The first painted frame already holds beside the anchor; it does not open pinned to the viewport edge and then move.">
      Opened with its anchor out of view
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const trigger = canvasElement.querySelector<HTMLElement>(
      '[data-testid="trigger"]',
    );
    if (!trigger) {
      throw new Error('No trigger');
    }
    await scrollAndSettle(trigger.getBoundingClientRect().right + 400);
    if (trigger.getBoundingClientRect().right > 0) {
      throw new Error('Fixture: trigger still in view');
    }
    const r = await open(canvasElement);
    if (r.layer.left >= 0) {
      throw new Error(
        `First frame pinned the layer to the viewport (left ${r.layer.left}) while its anchor is at ${r.trigger.left}`,
      );
    }
    await scrollAndSettle(0);
  },
};

function AppInsetDemo({
  initialInset,
  isOpenInitially,
}: {
  initialInset: number;
  isOpenInitially?: boolean;
}) {
  const [inset, setInset] = useState(initialInset);
  return (
    <LayerProvider inset={{blockEnd: inset}}>
      <ViewportLayer
        at={{bottom: 270, left: 40}}
        isOpenInitially={isOpenInitially}
        caption={`FR6, FR8 — The app floats a ${inset}px bar over the bottom edge and declares it once: <LayerProvider inset={{blockEnd: ${inset}}}>. The layer's bottom gutter becomes ${inset + 16}px, so a layer that would end under the bar flips above its trigger instead. (Storybook already mounts the root provider, so this one is nested and narrows the inset for the layers in this story; an app declares it on its root provider and its toasts rise too.) Change the inset while the layer is open: the layer and the bar move in the same frame.`}
        extra={
          <>
            <div
              {...stylex.props(
                viewportStyles.bottomBar,
                viewportStyles.barHeight(inset),
              )}>
              persistent bar — {inset}px, outside layout flow
            </div>
            <div {...stylex.props(viewportStyles.controls)}>
              <Button
                label="Bar 80"
                size="sm"
                variant="secondary"
                data-testid="inset-80"
                onClick={() => setInset(80)}
              />
              <Button
                label="Bar 160"
                size="sm"
                variant="secondary"
                data-testid="inset-160"
                onClick={() => setInset(160)}
              />
            </div>
          </>
        }>
        <div style={{blockSize: 90}}>90px of rows</div>
      </ViewportLayer>
    </LayerProvider>
  );
}

function assertAboveBar(r: Rects, bar: number, label: string) {
  if (r.layer.bottom > r.vh - bar - GUTTER + TOLERANCE) {
    fail(
      `${label}: layer ends at ${r.layer.bottom}px (trigger ${fmt(r.trigger)}), under the ${bar}px bar (viewport ${r.vh}px)`,
    );
  }
}

export const AppDeclaredInset: Story = {
  name: 'Viewport inset: app-declared inset (floating bar)',
  parameters: viewportParameters,
  render: () => <AppInsetDemo initialInset={160} />,
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertAboveBar(r, 160, 'declared 160px');
    if (r.layer.bottom > r.trigger.top) {
      throw new Error('Expected the layer to flip above the trigger');
    }
  },
};

export const InsetChangesWhileOpen: Story = {
  name: 'Viewport inset: inset changes while the layer is open',
  parameters: viewportParameters,
  render: () => <AppInsetDemo initialInset={80} />,
  play: async ({canvasElement}) => {
    const at80 = await open(canvasElement);
    // With an 80px bar the 90px layer fits below its trigger.
    if (at80.layer.top < at80.trigger.bottom) {
      throw new Error('Fixture: expected the layer below its trigger at 80px');
    }
    canvasElement
      .querySelector<HTMLElement>('[data-testid="inset-160"]')
      ?.click();
    await committed();
    const first = rects(canvasElement);
    assertAboveBar(first, 160, 'first frame after the inset changed');
    await settle();
    assertNoShift(first, rects(canvasElement), 'after the inset changed');
  },
};

export const LayerOpensAsInsetArrives: Story = {
  name: 'Viewport inset: layer opens in the frame the inset arrives',
  parameters: viewportParameters,
  render: () => <AppInsetDemo initialInset={160} isOpenInitially />,
  play: async ({canvasElement}) => {
    // The provider mounts with its inset and the layer opens in the same
    // commit; the first frame is already above the bar.
    const first = rects(canvasElement);
    assertAboveBar(first, 160, 'first frame');
    await settle();
    assertNoShift(first, rects(canvasElement), 'after mounting open');
  },
};

function MeasuredBarDemo() {
  const barRef = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [measured, setMeasured] = useState(0);
  // The app measures its own bar before paint and declares what it found.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return;
    }
    setMeasured(bar.getBoundingClientRect().height);
  }, [tall]);
  return (
    <LayerProvider inset={{blockEnd: measured}}>
      <ViewportLayer
        at={{bottom: 270, left: 40}}
        caption={`FR6, FR8 — The bar's height is measured by the app (${measured}px) and declared on LayerProvider. The runtime measures nothing: it renders at whatever the provider declares, in the same frame the declaration changes.`}
        extra={
          <>
            <div
              ref={barRef}
              {...stylex.props(
                viewportStyles.bottomBar,
                viewportStyles.barHeight(tall ? 160 : 80),
              )}>
              measured bar — {measured}px
            </div>
            <div {...stylex.props(viewportStyles.controls)}>
              <Button
                label={tall ? 'Shrink bar' : 'Grow bar'}
                size="sm"
                variant="secondary"
                data-testid="toggle-bar"
                onClick={() => setTall(v => !v)}
              />
            </div>
          </>
        }>
        <div style={{blockSize: 90}}>90px of rows</div>
      </ViewportLayer>
    </LayerProvider>
  );
}

export const MeasuredInset: Story = {
  name: 'Viewport inset: inset measured by the app',
  parameters: viewportParameters,
  render: () => <MeasuredBarDemo />,
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertAboveBar(r, 80, 'measured 80px');
    canvasElement
      .querySelector<HTMLElement>('[data-testid="toggle-bar"]')
      ?.click();
    await committed();
    // The app's layout effect re-measured and re-declared before this paint.
    const first = rects(canvasElement);
    assertAboveBar(first, 160, 'first frame after the bar grew');
    await settle();
    assertNoShift(first, rects(canvasElement), 'after the bar grew');
  },
};

function PortaledLayerDemo() {
  const layer = useLayer({mode: 'context', lightDismiss: true});
  return (
    <div {...stylex.props(viewportStyles.canvas)} data-testid="canvas">
      <p {...stylex.props(viewportStyles.caption)}>
        FR6, FR8 — The trigger sits inside a paragraph, which cannot contain the
        layer, so the layer portals out of it. The declared 160px inset still
        reaches it: the value travels by context and is written on the layer
        itself, not inherited from the provider&apos;s subtree.
      </p>
      <p style={{position: 'absolute', bottom: 270, left: 40, margin: 0}}>
        <Button
          ref={layer.ref}
          label="Open"
          size="sm"
          data-testid="trigger"
          onClick={() => (layer.isOpen ? layer.hide() : layer.show())}
        />
        {layer.render(
          <div {...stylex.props(viewportStyles.surface)}>
            <div style={{blockSize: 90}}>90px of rows</div>
          </div>,
          {placement: 'below', alignment: 'start', offset: 4},
        )}
      </p>
      <div
        {...stylex.props(
          viewportStyles.bottomBar,
          viewportStyles.barHeight(160),
        )}>
        persistent bar — 160px
      </div>
    </div>
  );
}

export const PortaledOutsideTheProviderSubtree: Story = {
  name: 'Viewport inset: layer portaled out of its JSX position',
  parameters: viewportParameters,
  render: () => (
    <LayerProvider inset={{blockEnd: 160}}>
      <PortaledLayerDemo />
    </LayerProvider>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    const layer = document.querySelector<HTMLElement>(
      '[popover]:popover-open[id]',
    );
    if (layer?.closest('p')) {
      throw new Error('Fixture: the layer did not portal out of the paragraph');
    }
    assertAboveBar(r, 160, 'portaled layer');
  },
};

export const GutterAtTheEdge: Story = {
  name: 'Viewport inset: the gutter',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 120, right: 0}}
      caption="FR1 — The trigger is flush with the inline-end edge. The layer's content can wrap, so it fits beside the trigger by wrapping, and its inline-end edge stops 16px short of the viewport. (The device safe-area term of the gutter cannot be shown here: Chromium emulation does not populate env(safe-area-inset-*).)">
      <span>
        Prose that wraps keeps the gutter rather than flipping or sliding, so a
        layer never touches the viewport edge.
      </span>
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    if (r.layer.right > r.vw - GUTTER + TOLERANCE) {
      throw new Error(
        `Layer end edge ${r.layer.right} is inside the ${GUTTER}px gutter (viewport ${r.vw})`,
      );
    }
  },
};

export const SidePlacementWithAWidth: Story = {
  name: 'Viewport inset: side placement with a width',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 200, right: 24}}
      placement="end"
      width={320}
      caption="FR2, FR4 — A 320px layer placed to the inline END of a trigger 24px from that edge. The room on that side is 24px, so the layer flips to the trigger's other side rather than shrinking. A slide cannot rescue a side placement: the alignment axis is the block axis, so sliding along it moves the layer up or down and does nothing for an inline overflow.">
      Placed to the side
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 320, 'side placement with a width');
    assertOnScreen(r, 'side placement with a width');
  },
};

export const SidePlacementNeitherSideFits: Story = {
  name: 'Viewport inset: side placement, neither side fits',
  parameters: viewportParameters,
  render: () => (
    <ViewportLayer
      at={{top: 200, left: 'calc(50% - 20px)'}}
      placement="start"
      width={900}
      caption="FR2 — A 900px layer placed to the inline start of a centred trigger. Neither side of the trigger has 900px, and on a phone the viewport itself does not, so the cap is what keeps it on screen: flipping cannot help when both sides are too small, and a block-axis slide cannot change an inline overflow.">
      Too wide for either side of the trigger
    </ViewportLayer>
  ),
  play: async ({canvasElement}) => {
    const r = await open(canvasElement);
    assertWidth(r, 900, 'side placement, neither side fits');
    assertOnScreen(r, 'side placement, neither side fits');
  },
};

// -----------------------------------------------------------------------------
// Playground — an exploration instrument, not a claim. Drag the trigger
// anywhere (touch or mouse); the layer stays open and follows. Adjust width,
// placement, and alignment from the canvas; read the resolved geometry.
// -----------------------------------------------------------------------------

const playgroundStyles = stylex.create({
  canvas: {
    position: 'fixed',
    inset: 0,
    overflow: 'clip',
    touchAction: 'none',
  },
  handle: {
    position: 'absolute',
    touchAction: 'none',
    userSelect: 'none',
    cursor: 'grab',
  },
  panel: {
    position: 'fixed',
    insetBlockStart: 8,
    insetInlineStart: 8,
    insetInlineEnd: 8,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    fontSize: 12,
    lineHeight: 1.4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: 'var(--shadow-low)',
    zIndex: 1,
  },
  readout: {
    position: 'fixed',
    insetBlockEnd: 8,
    insetInlineStart: 8,
    insetInlineEnd: 8,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
    lineHeight: 1.5,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'var(--color-background-surface)',
    boxShadow: 'var(--shadow-low)',
    whiteSpace: 'pre-wrap',
    zIndex: 1,
  },
  select: {
    fontSize: 12,
    padding: 4,
  },
});

type Readout = {
  box: string;
  within: string;
  resolved: string;
};

function readGeometry(trigger: HTMLElement, layer: HTMLElement): Readout {
  const t = trigger.getBoundingClientRect();
  const l = layer.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const side =
    l.bottom <= t.top + 1
      ? 'above'
      : l.top >= t.bottom - 1
        ? 'below'
        : l.right <= t.left + 1
          ? 'start'
          : l.left >= t.right - 1
            ? 'end'
            : 'overlapping';
  const isBlock = side === 'above' || side === 'below';
  const align = isBlock
    ? Math.abs(l.left - t.left) <= 1
      ? 'start'
      : Math.abs(l.right - t.right) <= 1
        ? 'end'
        : Math.abs(l.left + l.width / 2 - (t.left + t.width / 2)) <= 1
          ? 'center'
          : 'slid'
    : Math.abs(l.top - t.top) <= 1
      ? 'start'
      : Math.abs(l.bottom - t.bottom) <= 1
        ? 'end'
        : Math.abs(l.top + l.height / 2 - (t.top + t.height / 2)) <= 1
          ? 'center'
          : 'slid';
  const inside =
    l.left >= GUTTER - 1 &&
    l.right <= vw - GUTTER + 1 &&
    l.top >= GUTTER - 1 &&
    l.bottom <= vh - GUTTER + 1;
  return {
    box: `layer ${Math.round(l.width)}×${Math.round(l.height)} at ${Math.round(l.left)},${Math.round(l.top)} · viewport ${vw}×${vh} · cap ${vw - 2 * GUTTER}`,
    within: inside
      ? 'inside the 16px gutters'
      : `OUTSIDE the gutters: left ${Math.round(l.left)} right ${Math.round(vw - l.right)} top ${Math.round(l.top)} bottom ${Math.round(vh - l.bottom)}`,
    resolved: `resolved ${side} / ${align} · anchor ${Math.round(t.left)},${Math.round(t.top)}`,
  };
}

function PlaygroundDemo() {
  const [pos, setPos] = useState({x: 160, y: 200});
  const [width, setWidth] = useState(240);
  const [placement, setPlacement] = useState<Placement>('below');
  const [alignment, setAlignment] = useState<Alignment>('start');
  const [readout, setReadout] = useState<Readout | null>(null);
  const layer = useLayer({mode: 'context', lightDismiss: false});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const layerElRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{dx: number; dy: number} | null>(null);
  const openedRef = useRef(false);

  useLayoutEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      layer.show();
    }
  }, [layer]);

  // Read after each commit; the readout is display, never an input to layout.
  // Set only when the text changes, or the readout would re-render itself.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const el =
      layerElRef.current ??
      document.querySelector<HTMLElement>('[popover]:popover-open[id]');
    if (trigger && el) {
      layerElRef.current = el;
      const next = readGeometry(trigger, el);
      setReadout(current =>
        current &&
        current.box === next.box &&
        current.within === next.within &&
        current.resolved === next.resolved
          ? current
          : next,
      );
    }
  });

  return (
    <div {...stylex.props(playgroundStyles.canvas)}>
      <div {...stylex.props(playgroundStyles.panel)}>
        <label>
          width{' '}
          <input
            type="range"
            min={80}
            max={1400}
            step={10}
            value={width}
            onChange={e => setWidth(Number(e.target.value))}
          />{' '}
          {width}px
        </label>
        <select
          {...stylex.props(playgroundStyles.select)}
          value={placement}
          aria-label="placement"
          onChange={e => setPlacement(e.target.value as Placement)}>
          {(['above', 'below', 'start', 'end'] as const).map(p => (
            <option key={p} value={p}>
              placement: {p}
            </option>
          ))}
        </select>
        <select
          {...stylex.props(playgroundStyles.select)}
          value={alignment}
          aria-label="alignment"
          onChange={e => setAlignment(e.target.value as Alignment)}>
          {(['start', 'center', 'end'] as const).map(a => (
            <option key={a} value={a}>
              alignment: {a}
            </option>
          ))}
        </select>
        <span>Drag the trigger anywhere; the layer stays open.</span>
      </div>
      <button
        type="button"
        ref={el => {
          triggerRef.current = el;
          layer.ref(el);
        }}
        {...stylex.props(playgroundStyles.handle)}
        style={{left: pos.x, top: pos.y}}
        onPointerDown={e => {
          dragRef.current = {dx: e.clientX - pos.x, dy: e.clientY - pos.y};
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const d = dragRef.current;
          if (d) {
            setPos({x: e.clientX - d.dx, y: e.clientY - d.dy});
          }
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}>
        drag me
      </button>
      {layer.render(
        <div {...stylex.props(viewportStyles.surface)}>
          <div style={{blockSize: 120}}>
            {placement}/{alignment}, {width}px
          </div>
        </div>,
        {
          placement,
          alignment,
          offset: 4,
          xstyle: viewportStyles.explicitWidth(width),
        },
      )}
      <div {...stylex.props(playgroundStyles.readout)}>
        {readout
          ? `${readout.box}\n${readout.resolved}\n${readout.within}`
          : '…'}
      </div>
    </div>
  );
}

export const Playground: Story = {
  name: 'Viewport inset: playground (drag the trigger)',
  parameters: {
    ...viewportParameters,
    docs: {
      ...viewportParameters.docs,
      description: {
        story:
          'An exploration instrument, not a claim: drag the trigger to any edge or corner, on a phone or with a mouse, while the layer stays open; change width (past the viewport), placement, and alignment; read the resolved geometry. The pinned stories above are the evidence for each rule — this is how to find the configuration nobody pinned.',
      },
    },
  },
  render: () => <PlaygroundDemo />,
};

/**
 * A trigger that carries a focus-driven layer (the shape of a tooltip, shown
 * on plain focus) and opens a light-dismissible layer. An Escape the browser's
 * close watcher answers is a hide the browser runs itself: with focus inside
 * the layer, it returns focus to the trigger while the document still counts
 * the layer as hiding, and the focus-driven layer asks to show inside that
 * window. A tap outside is the browser's hide too, but it returns no focus:
 * the press itself took it.
 */
function BrowserHideWakesAFocusLayerDemo() {
  const content = useLayer({mode: 'context', lightDismiss: true});
  const hint = useLayer({mode: 'context'});
  // A second light-dismissible layer, opened by a press that light-dismisses
  // the first one; like a menu, it moves focus into itself right after the
  // show, which only works when the show ran at once.
  const other = useLayer({mode: 'context', lightDismiss: true});
  const otherInsideRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div {...stylex.props(styles.demoArea)}>
      <Button
        ref={el => {
          content.ref(el);
          hint.ref(el);
        }}
        label="Show layer"
        onFocus={hint.show}
        onBlur={hint.hide}
        onClick={() => (content.isOpen ? content.hide() : content.show())}
      />
      {content.render(
        <div {...stylex.props(styles.popoverContent)}>
          <Text type="body">A light-dismissible layer.</Text>
          <Button label="Inside" onClick={content.hide} />
        </div>,
        {placement: 'below', alignment: 'center'},
      )}
      {hint.render(
        <div {...stylex.props(styles.popoverContent)} role="tooltip">
          <Text type="body">Shown while the trigger has focus.</Text>
        </div>,
        {placement: 'above', alignment: 'center'},
      )}
      <Button
        ref={other.ref}
        label="Show the other layer"
        onClick={() => {
          other.show();
          otherInsideRef.current?.focus();
        }}
      />
      {other.render(
        <div {...stylex.props(styles.popoverContent)}>
          <Text type="body">The other layer.</Text>
          <Button ref={otherInsideRef} label="Inside the other" />
        </div>,
        {placement: 'below', alignment: 'center'},
      )}
    </div>
  );
}

export const BrowserHideWakesAFocusLayer: Story = {
  render: () => <BrowserHideWakesAFocusLayerDemo />,
};
