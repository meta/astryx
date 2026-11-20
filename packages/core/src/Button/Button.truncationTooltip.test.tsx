// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.truncationTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Button
 * @output Unit tests for the tooltip that shows a Button's label when it is cut
 * @position Testing; validates that a cut label shows in full on keyboard
 *   focus only, adds no duplicate description, and that a label that fits
 *   shows no tooltip
 *
 * SYNC: When Button.tsx changes, update tests to match new behavior
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Button} from './Button';
import {Tooltip} from '../Tooltip/Tooltip';
import {ToggleButton} from '../ToggleButton/ToggleButton';
// Loaded up front, so the tooltip renders at once.

const LABEL = 'Save and continue to the next step';

/** Makes every element report content wider than its box, as a cut label is. */
function withOverflow(
  isOverflowing: boolean | ((element: HTMLElement) => boolean),
) {
  const proto = window.HTMLElement.prototype;
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(proto, 'scrollWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(proto, 'offsetWidth'),
  };
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const isCut =
        typeof isOverflowing === 'function'
          ? isOverflowing(this)
          : isOverflowing;
      return isCut ? 400 : 100;
    },
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

// Focus counts as keyboard focus only after a key press: the modality reader
// is shared across the document, so each test starts from a keyboard press.
beforeEach(() => {
  fireEvent.keyDown(document.body, {key: 'Tab'});
});

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

  it('shows nothing on a mouse hover', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    act(() => {
      fireEvent.pointerOver(button, {pointerType: 'mouse'});
      fireEvent.pointerEnter(button, {pointerType: 'mouse'});
      fireEvent.mouseOver(button);
      fireEvent.mouseEnter(button);
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
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

  it('closes when focus leaves', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button', {name: LABEL});
    await showByFocus(button);
    act(() => {
      button.blur();
    });
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });
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

  it("lets a caller's Tooltip take precedence, so one tooltip shows", async () => {
    restore = withOverflow(true);
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(
      <Tooltip content="Saves your draft">
        <Button label={LABEL} />
      </Tooltip>,
    );
    const button = screen.getByRole('button');
    act(() => {
      button.focus();
    });
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        'Saves your draft',
      );
    });
    expect(
      screen
        .queryAllByRole('tooltip', {hidden: true})
        .filter(el => el.textContent === LABEL),
    ).toHaveLength(0);
  });

  it('shows again when a label that came to fit is cut again', async () => {
    let isCut = true;
    restore = withOverflow(() => isCut);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button');
    await showByFocus(button);
    act(() => {
      button.blur();
    });
    isCut = false;
    act(() => {
      button.focus();
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    act(() => {
      button.blur();
    });
    isCut = true;
    act(() => {
      button.focus();
    });
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        LABEL,
      );
    });
  });

  it("ignores a ToggleButton's hidden bold-width copy when the label fits", async () => {
    restore = withOverflow(
      element => element.closest('[aria-hidden="true"]') != null,
    );
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
      />,
    );
    act(() => {
      screen.getByRole('button').focus();
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it('keeps working after the Button renders a new element', async () => {
    restore = withOverflow(true);
    const {rerender} = render(<Button label={LABEL} href="/next" />);
    await showByFocus(screen.getByRole('link'));
    act(() => {
      screen.getByRole('link').blur();
    });
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });
    // A disabled link Button renders a <button> in place of the <a>.
    rerender(<Button label={LABEL} href="/next" isDisabled />);
    act(() => {
      screen.getByRole('button').focus();
    });
    await waitFor(() => {
      expect(screen.getByRole('tooltip', {hidden: true})).toHaveTextContent(
        LABEL,
      );
    });
  });

  it('shows nothing when focus comes from a mouse press', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button');
    // jsdom reports :focus-visible as false, as a browser does for a click.
    act(() => {
      fireEvent.pointerDown(button, {pointerType: 'mouse'});
      button.focus();
      fireEvent.click(button);
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it('closes when the Button is pressed', async () => {
    restore = withOverflow(true);
    render(<Button label={LABEL} />);
    const button = screen.getByRole('button');
    await showByFocus(button);
    act(() => {
      fireEvent.pointerDown(button, {pointerType: 'mouse'});
    });
    await waitFor(() => {
      expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    });
  });
});
