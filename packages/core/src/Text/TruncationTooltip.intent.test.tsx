// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TruncationTooltip.intent.test.tsx
 * @output Tests that importing Text or Heading loads neither the Tooltip
 *   component, the layer runtime nor the touch trigger,
 *   that a held tap opens the tooltip as soon as it loads, that a scroll or a
 *   key press drops a held press, and that a failed load keeps the text and
 *   is asked for again on the next interaction, and that a pointer's focus
 *   inside the text does not take the first tap
 * @position Validates the truncation tooltip's base intent (Text and Heading
 *   PR1). Each test starts from a fresh module registry.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';

const LABEL = 'A label far wider than the space it has been given';
const loads = {touchTrigger: 0, layer: 0, tooltip: 0, tooltipFailures: 0};
let releaseTooltip: (() => void) | null = null;

beforeEach(() => {
  vi.resetModules();
  loads.touchTrigger = 0;
  loads.layer = 0;
  loads.tooltip = 0;
  loads.tooltipFailures = 0;
  releaseTooltip = null;
  vi.doUnmock('../Layer/useTouchTrigger');
  vi.doUnmock('../Layer/useLayer');
  vi.doUnmock('../Tooltip/Tooltip');
  vi.doMock('../Layer/useTouchTrigger', async importOriginal => {
    loads.touchTrigger += 1;
    return importOriginal();
  });
  vi.doMock('../Layer/useLayer', async importOriginal => {
    loads.layer += 1;
    return importOriginal();
  });
  vi.doMock('../Tooltip/Tooltip', async importOriginal => {
    loads.tooltip += 1;
    if (loads.tooltip <= loads.tooltipFailures) {
      throw new Error('Failed to fetch dynamically imported module');
    }
    if (releaseTooltip === null) {
      return importOriginal();
    }
    const held = new Promise<void>(resolve => {
      releaseTooltip = resolve;
    });
    await held;
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
  const showPopover = vi.fn();
  proto.showPopover = showPopover;
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
  return showPopover;
}

async function settle(ms = 50) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('the truncation tooltip base (PR1)', () => {
  it('importing Text or Heading loads neither the Tooltip component, the layer runtime nor the touch trigger', async () => {
    const {Text} = await import('./Text');
    const {Heading} = await import('../Heading/Heading');
    render(
      <>
        <Text type="body">{LABEL}</Text>
        <Heading level={2}>{LABEL}</Heading>
      </>,
    );
    await settle();
    expect(loads.touchTrigger).toBe(0);
    expect(loads.layer).toBe(0);
    expect(loads.tooltip).toBe(0);
  });

  it('a tap held while the tooltip loads opens it as soon as it loads', async () => {
    const showPopover = withOverflowAndPopover();
    releaseTooltip = () => {};
    const {Text} = await import('./Text');
    render(
      <Text type="body" maxLines={1}>
        {LABEL}
      </Text>,
    );
    await settle();
    expect(loads.tooltip).toBe(1);
    const text = screen.getByText(LABEL);
    fireEvent.pointerDown(text, {pointerType: 'touch'});
    fireEvent.pointerUp(text, {pointerType: 'touch'});
    fireEvent.click(text);
    await settle();
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    await act(async () => {
      releaseTooltip?.();
    });
    await waitFor(() => expect(showPopover).toHaveBeenCalled(), {
      timeout: 8000,
    });
  }, 15000);

  it('a press that becomes a scroll mounts nothing, even if a click follows', async () => {
    withOverflowAndPopover();
    const {Text} = await import('./Text');
    render(
      <Text type="body" maxLines={1}>
        {LABEL}
      </Text>,
    );
    const text = screen.getByText(LABEL);
    fireEvent.pointerDown(text, {pointerType: 'touch'});
    fireEvent.pointerCancel(text, {pointerType: 'touch'});
    fireEvent.click(text);
    await settle(300);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it("a key press ends a held press, so a keyboard click is not the press's tap", async () => {
    withOverflowAndPopover();
    const {Text} = await import('./Text');
    render(
      <Text type="body" maxLines={1}>
        {LABEL}
      </Text>,
    );
    const text = screen.getByText(LABEL);
    fireEvent.pointerDown(text, {pointerType: 'touch'});
    fireEvent.keyDown(text, {key: 'Enter'});
    fireEvent.click(text);
    await settle(300);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  function pointerFocus(element: HTMLElement) {
    // Chrome on Android focuses a focusable element between a press and its
    // click. That focus is not :focus-visible; jsdom treats every focus as one.
    const realMatches = element.matches.bind(element);
    vi.spyOn(element, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? false : realMatches(selector),
    );
    act(() => element.focus());
  }

  it.each([
    ['loaded', false],
    ['still loading', true],
  ])(
    'the first tap on a focusable child of truncated text opens the tooltip, though the tap focuses the child first (Tooltip %s)',
    async (_state, holdLoad) => {
      const showPopover = withOverflowAndPopover();
      const {Text} = await import('./Text');
      if (holdLoad) {
        releaseTooltip = () => {};
      }
      render(
        <Text type="body" maxLines={1}>
          {LABEL} <button type="button">Edit</button>
        </Text>,
      );
      if (!holdLoad) {
        await settle(300);
      }
      const child = screen.getByRole('button', {name: 'Edit'});
      fireEvent.pointerDown(child, {pointerType: 'touch'});
      fireEvent.pointerUp(child, {pointerType: 'touch'});
      pointerFocus(child);
      fireEvent.click(child);
      if (holdLoad) {
        await settle();
        await act(async () => {
          releaseTooltip?.();
        });
      }
      await waitFor(() => expect(showPopover).toHaveBeenCalled(), {
        timeout: 8000,
      });
    },
    15000,
  );

  it('a keyboard focus inside truncated text still mounts the tooltip', async () => {
    withOverflowAndPopover();
    const {Text} = await import('./Text');
    render(
      <Text type="body" maxLines={1}>
        {LABEL} <button type="button">Edit</button>
      </Text>,
    );
    await settle(300);
    // A Tab press makes the focus that follows :focus-visible.
    fireEvent.keyDown(document.body, {key: 'Tab'});
    act(() => screen.getByRole('button', {name: 'Edit'}).focus());
    await waitFor(
      () =>
        expect(screen.queryByRole('tooltip', {hidden: true})).not.toBeNull(),
      {timeout: 8000},
    );
  }, 15000);

  it('keeps the text after a failed load and asks again on the next hover', async () => {
    const showPopover = withOverflowAndPopover();
    loads.tooltipFailures = 1;
    const {Text} = await import('./Text');
    render(
      <Text type="body" maxLines={1}>
        {LABEL}
      </Text>,
    );
    await settle();
    expect(loads.tooltip).toBe(1);
    const text = screen.getByText(LABEL);
    expect(text).toBeInTheDocument();
    fireEvent.pointerEnter(text, {pointerType: 'mouse'});
    await waitFor(() => expect(showPopover).toHaveBeenCalled(), {
      timeout: 8000,
    });
    expect(loads.tooltip).toBe(2);
  }, 15000);
});
