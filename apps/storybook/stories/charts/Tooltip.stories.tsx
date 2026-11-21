// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useEffect, useRef} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, waitFor} from 'storybook/test';
import * as stylex from '@stylexjs/stylex';
import {
  Chart,
  bar,
  line,
  ChartGrid,
  ChartAxis,
  currency,
  type ChartTooltipProps,
  type TooltipSeriesValue,
} from '@astryxdesign/charts';
import {
  defineTheme,
  MediaTheme,
  Text,
  Theme,
  useLocale,
  VStack,
} from '@astryxdesign/core';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {monthlyData} from './_data';

const styles = stylex.create({
  modal: {
    inlineSize: 720,
    maxInlineSize: 'calc(100vw - 32px)',
    padding: spacingVars['--spacing-4'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-surface'],
  },
});

const modalLayeringTheme = defineTheme({
  name: 'chart-tooltip-modal-test',
  tokens: {'--color-accent': '#7c3aed'},
});

const meta: Meta<typeof Chart> = {
  title: 'Charts/Chrome/Tooltip',
  component: Chart,
};
export default meta;

function TooltipChart({showLineDots = false}: {showLineDots?: boolean}) {
  const locale = useLocale();
  return (
    <Chart
      data={monthlyData}
      xKey="month"
      series={[
        bar('revenue', {color: '#3b82f6', label: 'Revenue', stack: 'x'}),
        bar('costs', {color: '#ef4444', label: 'Costs', stack: 'x'}),
        line('trend', {
          color: '#f59e0b',
          label: 'Trend',
          dots: showLineDots,
        }),
      ]}
      tooltip
      grid={<ChartGrid />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" formatTick={currency('$', locale)} />
        </>
      }
      height={320}
    />
  );
}

/** Hover the chart: a grouped tooltip shows every series value at that x, with a
 *  column highlight for bars and hover dots on lines. Today `placement`
 *  defaults to `'auto'`, which puts the card to the right of the hovered x and
 *  flips it left at the viewport edge; `'right'` and `'left'` pin the card to
 *  that side, and `'top'` centers it on the hovered x above the plot's top
 *  edge. Every value keeps the card inside the viewport. What placement should
 *  mean is ChartTooltip open question OQ1. */
export const Default: StoryObj = {
  render: () => <TooltipChart />,
  play: async ({canvasElement}) => {
    const hoveredMonth = 'Apr';
    const datum = monthlyData.find(row => row.month === hoveredMonth);
    expect(datum).toEqual({month: 'Apr', revenue: 61, costs: 38, trend: 48});
    const expectedText = ['Apr', 'Revenue', '61', 'Costs', '38', 'Trend', '48'];

    const getEventSurface = () =>
      canvasElement.querySelector<SVGRectElement>(
        'svg rect[fill="transparent"]',
      );
    const getMonthTick = () =>
      Array.from(
        canvasElement.querySelectorAll<SVGTextElement>(
          'g[aria-label="bottom axis"] text',
        ),
      ).find(tick => tick.textContent === hoveredMonth);
    const getTooltip = () =>
      canvasElement.querySelector<HTMLElement>('[role="tooltip"]');
    const isTooltipOpen = () =>
      getTooltip()?.parentElement?.matches(':popover-open') ?? false;
    const tooltipText = () =>
      Array.from(getTooltip()?.querySelectorAll('*') ?? [])
        .filter(
          element =>
            element.childElementCount === 0 && element.textContent?.trim(),
        )
        .map(element => element.textContent?.trim());

    // The tooltip host renders only after the tooltip subscribes to the
    // chart's pointer events. A pointer move before that is lost.
    await waitFor(() => {
      expect(getEventSurface()?.getBoundingClientRect().width).toBeGreaterThan(
        0,
      );
      expect(getMonthTick()).toBeDefined();
      expect(getTooltip()).not.toBeNull();
    });
    const eventSurface = getEventSurface();
    const monthTick = getMonthTick();
    if (!eventSurface || !monthTick) {
      throw new Error('Chart event surface or axis tick is missing');
    }

    const tickRect = monthTick.getBoundingClientRect();
    const plotRect = eventSurface.getBoundingClientRect();
    const x = tickRect.left + tickRect.width / 2;
    const y = plotRect.top + plotRect.height / 2;
    // A real pointer reaches the layer only if nothing painted above it,
    // such as the hover highlight, takes the hit.
    const pointerTarget = () => {
      const hit = canvasElement.ownerDocument.elementFromPoint(x, y);
      return hit === eventSurface
        ? 'chart pointer layer'
        : `<${hit?.tagName ?? 'nothing'}>`;
    };

    expect(isTooltipOpen()).toBe(false);
    expect(pointerTarget()).toBe('chart pointer layer');

    eventSurface.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerType: 'mouse',
      }),
    );
    await waitFor(() => {
      expect(isTooltipOpen()).toBe(true);
      expect(tooltipText()).toEqual(expectedText);
    });
    expect(pointerTarget()).toBe('chart pointer layer');

    // React derives onPointerLeave from pointerout and its relatedTarget.
    eventSurface.dispatchEvent(
      new PointerEvent('pointerout', {
        bubbles: true,
        relatedTarget: canvasElement.ownerDocument.body,
        pointerType: 'mouse',
      }),
    );
    await waitFor(() => {
      expect(isTooltipOpen()).toBe(false);
      expect(tooltipText()).toEqual([]);
    });
  },
};

/** Support tickets a help desk opened and resolved on each day of one week. */
const SUPPORT_TICKETS_BY_DAY = [
  {day: 'Mon', opened: 142, resolved: 128},
  {day: 'Tue', opened: 156, resolved: 149},
  {day: 'Wed', opened: 131, resolved: 140},
  {day: 'Thu', opened: 148, resolved: 151},
  {day: 'Fri', opened: 119, resolved: 133},
  {day: 'Sat', opened: 54, resolved: 61},
  {day: 'Sun', opened: 47, resolved: 50},
];

function SupportTicketsChart({
  tooltip,
}: {
  tooltip: Omit<ChartTooltipProps, 'series'>;
}) {
  return (
    <Chart
      data={SUPPORT_TICKETS_BY_DAY}
      xKey="day"
      series={[
        bar('opened', {label: 'Opened'}),
        line('resolved', {label: 'Resolved'}),
      ]}
      title="Support tickets per day"
      subtitle="Tickets opened and resolved, one week"
      legend
      tooltip={tooltip}
      grid={<ChartGrid />}
      axes={
        <>
          <ChartAxis position="bottom" />
          <ChartAxis position="left" />
        </>
      }
      height={320}
    />
  );
}

function BacklogTooltip({
  day,
  rows,
}: {
  day: unknown;
  rows: TooltipSeriesValue[];
}) {
  const valueOf = (key: string) =>
    Number(rows.find(row => row.key === key)?.value);
  const opened = valueOf('opened');
  const resolved = valueOf('resolved');
  const change = opened - resolved;
  return (
    <VStack gap={1}>
      <Text type="body" weight="semibold">
        {String(day)}
      </Text>
      <Text type="supporting">Opened: {opened}</Text>
      <Text type="supporting">Resolved: {resolved}</Text>
      <Text type="supporting" weight="semibold">
        Backlog change: {change > 0 ? `+${change}` : change}
      </Text>
    </VStack>
  );
}

/**
 * `tooltip.render` replaces the card body. It gets the hovered x value and one
 * row per visible series, so the card can show a value the default card
 * cannot. Here it adds the backlog change: tickets opened minus tickets
 * resolved.
 *
 * To check: hover Wed. The card reads "Wed", "Opened: 131", "Resolved: 140" and
 * "Backlog change: -9", with no color swatches.
 */
export const CustomRender: StoryObj = {
  render: () => (
    <SupportTicketsChart
      tooltip={{
        render: (day, rows) => <BacklogTooltip day={day} rows={rows} />,
      }}
    />
  ),
  parameters: {controls: {disable: true}},
};

/**
 * `tooltip.hoverIndicator: false` removes the mark at the hovered x. A chart
 * with bars draws a soft column highlight there; a chart without bars draws a
 * vertical line. The card and the hover dots stay.
 *
 * To check: hover any day. The card and the ring on the Resolved line appear,
 * but the column behind the bar is not shaded.
 */
export const HoverIndicatorOff: StoryObj = {
  render: () => <SupportTicketsChart tooltip={{hoverIndicator: false}} />,
  parameters: {controls: {disable: true}},
};

/**
 * `tooltip.showHoverDots: false` removes the ring that marks the hovered point
 * on each line, area and dot series. Bars never get a ring. The card and the
 * column highlight stay.
 *
 * To check: hover any day. The card and the shaded column appear, but the
 * Resolved line has no ring at that day.
 */
export const HoverDotsOff: StoryObj = {
  render: () => <SupportTicketsChart tooltip={{showHoverDots: false}} />,
  parameters: {controls: {disable: true}},
};

function ModalLayeringFixture() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <Theme theme={modalLayeringTheme} mode="light">
      <MediaTheme mode="dark">
        <dialog
          ref={dialogRef}
          aria-label="Chart tooltip layering test"
          {...stylex.props(styles.modal)}>
          <TooltipChart showLineDots />
        </dialog>
      </MediaTheme>
    </Theme>
  );
}

/**
 * Keeps the chart inside nested Theme/MediaTheme scopes and a native modal,
 * then opens its tooltip after the modal. The play assertions prove the host
 * stays in those scopes, remains continuously open across content-bearing
 * points, and becomes a later browser top-layer entry rather than a high-z-index
 * portal hidden behind the dialog.
 */
export const ModalLayering: StoryObj = {
  render: () => <ModalLayeringFixture />,
  play: async ({canvasElement}) => {
    const dialog = canvasElement.querySelector('dialog');
    await waitFor(() => expect(dialog?.matches(':modal')).toBe(true));

    const getEventSurface = () =>
      canvasElement.querySelector<SVGRectElement>(
        'svg rect[fill="transparent"]',
      );
    const getTooltip = () =>
      document.querySelector<HTMLElement>('[role="tooltip"]');
    await waitFor(() => {
      expect(getEventSurface()).not.toBeNull();
      expect(getTooltip()).not.toBeNull();
    });
    const eventSurface = getEventSurface();
    const tooltip = getTooltip();
    if (!eventSurface || !tooltip) {
      throw new Error('Chart event surface or tooltip did not render');
    }

    const layer = tooltip.parentElement;
    if (!layer) {
      throw new Error('Chart tooltip Layer host did not render');
    }
    const toggleStates: string[] = [];
    const recordToggle = (event: Event) => {
      toggleStates.push((event as ToggleEvent).newState);
    };
    layer.addEventListener('beforetoggle', recordToggle);

    await waitFor(() => {
      expect(eventSurface.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(
        canvasElement.querySelectorAll<SVGCircleElement>(
          'svg g[clip-path] circle',
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
    const points = canvasElement.querySelectorAll<SVGCircleElement>(
      'svg g[clip-path] circle',
    );
    const eventRect = eventSurface.getBoundingClientRect();
    const moveTo = (point: SVGCircleElement) => {
      const pointRect = point.getBoundingClientRect();
      eventSurface.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: pointRect.left + pointRect.width / 2,
          clientY: eventRect.top + eventRect.height / 2,
          pointerType: 'mouse',
        }),
      );
    };

    moveTo(points[0]);
    await waitFor(() => {
      expect(tooltip.textContent).toContain('Jan');
      expect(layer.matches(':popover-open')).toBe(true);
    });
    expect(toggleStates).toEqual(['open']);

    moveTo(points[1]);
    await waitFor(() => {
      expect(tooltip.textContent).toContain('Feb');
      expect(layer.matches(':popover-open')).toBe(true);
    });
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    expect(toggleStates).toEqual(['open']);
    expect(dialog?.matches(':modal')).toBe(true);
    expect(
      layer.closest('[data-astryx-theme="chart-tooltip-modal-test"]'),
    ).not.toBeNull();
    expect(layer.closest('[data-astryx-media="dark"]')).not.toBeNull();
    expect(getComputedStyle(layer).zIndex).toBe('auto');
    const layerRect = layer.getBoundingClientRect();
    expect(layerRect.width).toBeGreaterThan(0);
    expect(layerRect.height).toBeGreaterThan(0);
    layer.removeEventListener('beforetoggle', recordToggle);
  },
};
