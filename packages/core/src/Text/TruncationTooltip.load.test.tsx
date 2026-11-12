// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TruncationTooltip.load.test.tsx
 * @output Tests that importing Text or Heading does not load the touch
 *   trigger, and that a failed load of the Tooltip module keeps the text and
 *   asks the loader again on the next interaction
 * @position Validates TruncationTooltip's eager imports and load failure.
 *   Each test starts from a fresh module registry.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

const LABEL = 'A label far wider than the space it has been given';
const loads = {touchTrigger: 0, tooltip: 0, tooltipFailures: 0};

beforeEach(() => {
  vi.resetModules();
  loads.touchTrigger = 0;
  loads.tooltip = 0;
  loads.tooltipFailures = 0;
  vi.doUnmock('../Layer/useTouchTrigger');
  vi.doUnmock('../Tooltip/Tooltip');
  vi.doMock('../Layer/useTouchTrigger', async importOriginal => {
    loads.touchTrigger += 1;
    return importOriginal();
  });
  vi.doMock('../Tooltip/Tooltip', async importOriginal => {
    loads.tooltip += 1;
    if (loads.tooltip <= loads.tooltipFailures) {
      throw new Error('Failed to fetch dynamically imported module');
    }
    return importOriginal();
  });
});

const restorers: (() => void)[] = [];
afterEach(() => {
  for (const restore of restorers.splice(0)) {
    restore();
  }
});

function withOverflowAndPopover() {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
    showPopover: proto.showPopover,
    hidePopover: proto.hidePopover,
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get: () => 100,
  });
  proto.showPopover = vi.fn();
  proto.hidePopover = vi.fn();
  restorers.push(() => {
    if (original.scrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
    }
    if (original.offsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
    }
    proto.showPopover = original.showPopover;
    proto.hidePopover = original.hidePopover;
  });
}

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 50));
  });
}

describe('TruncationTooltip loading', () => {
  it('does not load the touch trigger when Text or Heading is imported', async () => {
    await import('./Text');
    await import('../Heading/Heading');
    expect(loads.touchTrigger).toBe(0);
  });

  it('keeps the text when the Tooltip module fails to load, and asks the loader again on the next hover', async () => {
    withOverflowAndPopover();
    loads.tooltipFailures = 1;
    const {Text} = await import('./Text');
    const {container} = render(
      <div>
        <Text type="body" maxLines={1}>
          {LABEL}
        </Text>
      </div>,
    );
    await settle();
    expect(loads.tooltip).toBe(1);
    const text = screen.getByText(LABEL);
    expect(container.textContent).toBe(LABEL);

    fireEvent.pointerEnter(text, {pointerType: 'mouse'});
    await settle();

    expect(loads.tooltip).toBe(2);
    expect(screen.getByText(LABEL)).toBe(text);
    await waitFor(
      () => {
        expect(screen.queryByRole('tooltip', {hidden: true})).not.toBeNull();
      },
      {timeout: 3000},
    );
  });
  it('mounts the tooltip on a text whose own load failed, after another text loaded the module', async () => {
    withOverflowAndPopover();
    loads.tooltipFailures = 1;
    const {Text} = await import('./Text');
    render(
      <div>
        <Text type="body" maxLines={1}>
          First {LABEL}
        </Text>
        <Text type="body" maxLines={1}>
          Second {LABEL}
        </Text>
      </div>,
    );
    await settle();
    expect(loads.tooltip).toBe(1);
    const first = screen.getByText(`First ${LABEL}`);
    const second = screen.getByText(`Second ${LABEL}`);

    // The second text's hover loads the module for the page.
    fireEvent.pointerEnter(second, {pointerType: 'mouse'});
    await waitFor(
      () => {
        expect(second).toHaveAttribute('aria-describedby');
      },
      {timeout: 3000},
    );

    // The first text, whose own load failed, takes the loaded module.
    fireEvent.pointerEnter(first, {pointerType: 'mouse'});
    await waitFor(
      () => {
        expect(first).toHaveAttribute('aria-describedby');
      },
      {timeout: 3000},
    );
    expect(loads.tooltip).toBe(2);
  });
});
