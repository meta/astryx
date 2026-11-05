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
} from '@astryxdesign/charts';
import {defineTheme, MediaTheme, Theme, useLocale} from '@astryxdesign/core';
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
          <ChartAxis position="left" tickFormat={currency('$', locale)} />
        </>
      }
      height={320}
    />
  );
}

/** Hover the chart: a grouped tooltip shows every series value at that x, with a
 *  column highlight for bars and hover dots on lines. */
export const Default: StoryObj = {
  render: () => <TooltipChart />,
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
