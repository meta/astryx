// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.truncationTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Button
 * @output Unit tests for the tooltip that shows a Button's label when it is cut
 * @position Testing; validates that a truncated label shows in full on hover
 *   and keyboard focus, adds no duplicate description, and that a label that
 *   fits shows no tooltip
 *
 * SYNC: When Button.tsx changes, update tests to match new behavior
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Button} from './Button';
// Loaded up front, so the tooltip renders at once.
import '../Tooltip/Tooltip';

const LABEL = 'Save and continue to the next step';

/** Makes every element report content wider than its box, as a cut label is. */
function withOverflow(isOverflowing: boolean) {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get: () => (isOverflowing ? 400 : 100),
  });
  Object.defineProperty(proto, 'offsetWidth', {
    configurable: true,
    get: () => 100,
  });
  return () => {
    if (original.scrollWidth) {
      Object.defineProperty(proto, 'scrollWidth', original.scrollWidth);
    }
    if (original.offsetWidth) {
      Object.defineProperty(proto, 'offsetWidth', original.offsetWidth);
    }
  };
}

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
  vi.restoreAllMocks();
});

/** Tabs to the button as a keyboard user does, with :focus-visible on. */
async function showByFocus(button: HTMLElement) {
  const realMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible'
      ? true
      : realMatches.call(this, selector);
  });
  act(() => {
    button.focus();
  });
  await waitFor(() => {
    expect(screen.queryByRole('tooltip', {hidden: true})).not.toBeNull();
  });
}

describe('Button label truncation tooltip', () => {
  it('shows the full label in a tooltip when the label is cut', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    await showByFocus(button);
    expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
      LABEL,
    );
  });

  it('shows the full label on hover from a mouse', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        LABEL,
      );
    });
  });

  it('measures nothing at rest', () => {
    restore = withOverflow(true);
    const proto = window.HTMLElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
    let reads = 0;
    Object.defineProperty(proto, 'scrollWidth', {
      configurable: true,
      get() {
        reads += 1;
        return 400;
      },
    });
    try {
      render(<Button label={LABEL} />);
      expect(reads).toBe(0);
    } finally {
      if (original) {
        Object.defineProperty(proto, 'scrollWidth', original);
      }
    }
  });

  it('closes when the pointer leaves, so crossing two cut buttons leaves none open', async () => {
    restore = withOverflow(true);
    const openLayers = new Set<HTMLElement>();
    const proto = HTMLElement.prototype;
    vi.spyOn(proto, 'showPopover').mockImplementation(function (
      this: HTMLElement,
    ) {
      openLayers.add(this);
    });
    vi.spyOn(proto, 'hidePopover').mockImplementation(function (
      this: HTMLElement,
    ) {
      openLayers.delete(this);
    });
    render(
      <>
        <Button label={LABEL} />
        <Button label="Another label that is cut short too" />
      </>,
    );
    const [first, second] = screen.getAllByRole('button');
    fireEvent.pointerEnter(first, {pointerType: 'mouse'});
    fireEvent.mouseEnter(first);
    fireEvent.pointerLeave(first, {pointerType: 'mouse'});
    fireEvent.mouseLeave(first);
    fireEvent.pointerEnter(second, {pointerType: 'mouse'});
    fireEvent.mouseEnter(second);
    fireEvent.pointerLeave(second, {pointerType: 'mouse'});
    fireEvent.mouseLeave(second);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(openLayers.size).toBe(0);
  });

  it('adds no description that repeats the name', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    await showByFocus(button);
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('shows no tooltip when the label fits', async () => {
    restore = withOverflow(false);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    act(() => {
      button.focus();
    });
    fireEvent.pointerEnter(button, {pointerType: 'mouse'});
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it("keeps a caller's own tooltip", async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} tooltip="Saves your draft" />);
    const button = screen.getByRole('button', {name: LABEL});
    await showByFocus(button);
    expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
      'Saves your draft',
    );
  });

  it('measures nothing for an icon-only button', () => {
    restore = withOverflow(true);
    render(<Button label="Settings" icon={<span>⚙</span>} isIconOnly />);
    expect(screen.getByRole('button', {name: 'Settings'})).toBeInTheDocument();
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });
});
