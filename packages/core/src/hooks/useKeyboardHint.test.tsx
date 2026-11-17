// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useKeyboardHint.test.tsx
 * @input Uses React Testing Library, useKeyboardHint
 * @output Unit tests for keyboard hint rendering
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useKeyboardHint, type KeyboardHintOrientation} from './useKeyboardHint';
import {InternationalizationProvider} from '../i18n';

function TestHint({orientation}: {orientation?: KeyboardHintOrientation}) {
  const {hintElement} = useKeyboardHint({orientation});
  return <div>{hintElement}</div>;
}

function getKeyLabels(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('.astryx-kbd')).map(key =>
    key.getAttribute('aria-label'),
  );
}

function getKeyText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('kbd')).map(
    key => key.textContent ?? '',
  );
}

describe('useKeyboardHint', () => {
  it('renders horizontal arrow keys with Kbd', () => {
    const {container} = render(<TestHint orientation="horizontal" />);

    expect(getKeyLabels(container)).toEqual(['Left arrow', 'Right arrow']);
    expect(getKeyText(container)).toEqual(['←', '→']);
  });

  it('renders vertical arrow keys with Kbd', () => {
    const {container} = render(<TestHint orientation="vertical" />);

    expect(getKeyLabels(container)).toEqual(['Up arrow', 'Down arrow']);
    expect(getKeyText(container)).toEqual(['↑', '↓']);
  });

  it('renders all arrow keys for both-axis navigation', () => {
    const {container} = render(<TestHint orientation="both" />);

    expect(getKeyLabels(container)).toEqual([
      'Left arrow',
      'Right arrow',
      'Up arrow',
      'Down arrow',
    ]);
    expect(getKeyText(container)).toEqual(['←', '→', '↑', '↓']);
  });

  it('positions the hint farther from the anchor', () => {
    const {container} = render(<TestHint />);
    const hint = container.querySelector('[popover="manual"]') as HTMLElement;

    expect(hint.style.marginBlockStart).toBe('var(--spacing-2)');
  });

  it('keeps the hint surface padding after useLayer reset styles', () => {
    const {container} = render(<TestHint />);
    const hint = container.querySelector('[popover="manual"]') as HTMLElement;

    // The surface of the anchored hint Core's keyboard hints share.
    expect(hint.className).toContain('anchoredHint__styles.hint');
  });

  it('renders the "to navigate" label from the i18n catalog', () => {
    const {container} = render(<TestHint />);
    const hint = container.querySelector('[popover="manual"]') as HTMLElement;

    expect(hint.textContent).toContain('to navigate');
  });

  it('localizes the "to navigate" label through the i18n catalog', () => {
    const {container} = render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.keyboardHint.toNavigate': 'pour naviguer'}}}>
        <TestHint />
      </InternationalizationProvider>,
    );
    const hint = container.querySelector('[popover="manual"]') as HTMLElement;

    expect(hint.textContent).toContain('pour naviguer');
    expect(hint.textContent).not.toContain('to navigate');
  });
});

// component:Toolbar FR6: the hint follows keyboard focus entering the row.
describe('useKeyboardHint focus inside portaled children', () => {
  const originalShowPopover = HTMLElement.prototype.showPopover;

  afterEach(() => {
    vi.restoreAllMocks();
    HTMLElement.prototype.showPopover = originalShowPopover;
  });

  function Row() {
    const {hintElement, onFocus, onBlur} = useKeyboardHint({});
    return (
      <div onFocus={onFocus} onBlur={onBlur}>
        <button type="button">First</button>
        {createPortal(<input aria-label="Sheet field" />, document.body)}
        {hintElement}
      </div>
    );
  }

  it('neither shows nor spends the hint for focus in a portaled child', () => {
    // jsdom has neither :focus-visible for synthetic focus nor the Popover API.
    const matches = HTMLElement.prototype.matches;
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : matches.call(this, selector);
    });
    const showPopover = vi.fn();
    HTMLElement.prototype.showPopover = showPopover;
    render(<Row />);

    fireEvent.focus(screen.getByRole('textbox', {name: 'Sheet field'}));
    expect(showPopover).not.toHaveBeenCalled();

    // The one-time hint is still there for the row itself.
    fireEvent.focus(screen.getByRole('button', {name: 'First'}));
    expect(showPopover).toHaveBeenCalledTimes(1);
  });
});

// WCAG 1.4.13: content shown on focus stays until the person dismisses it,
// moves focus away, or no longer needs it, and Escape dismisses it.
describe('useKeyboardHint dismissal', () => {
  const originalShowPopover = HTMLElement.prototype.showPopover;
  const originalHidePopover = HTMLElement.prototype.hidePopover;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    HTMLElement.prototype.showPopover = originalShowPopover;
    HTMLElement.prototype.hidePopover = originalHidePopover;
  });

  function Row() {
    const {hintElement, onFocus, onBlur, onKeyDown} = useKeyboardHint({});
    return (
      <div onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}>
        <button type="button">First</button>
        <button type="button">Second</button>
        {hintElement}
      </div>
    );
  }

  function renderWithKeyboardFocus() {
    // jsdom has neither :focus-visible for synthetic focus nor the Popover API.
    const matches = HTMLElement.prototype.matches;
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : matches.call(this, selector);
    });
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    HTMLElement.prototype.showPopover = showPopover;
    HTMLElement.prototype.hidePopover = hidePopover;
    render(<Row />);
    const first = screen.getByRole('button', {name: 'First'});
    first.focus();
    fireEvent.focus(first);
    expect(showPopover).toHaveBeenCalledTimes(1);
    return {first, hidePopover};
  }

  it('stays shown while focus stays in the group, with no time limit', () => {
    vi.useFakeTimers();
    const {hidePopover} = renderWithKeyboardFocus();

    vi.advanceTimersByTime(60_000);

    expect(hidePopover).not.toHaveBeenCalled();
  });

  it('closes on Escape without moving focus', () => {
    const {first, hidePopover} = renderWithKeyboardFocus();

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(escape);

    expect(hidePopover).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('in a second document, Escape there closes the hint and an Escape in the page leaves it', () => {
    // A same-origin iframe stands in for any second document a row renders
    // into, Document Picture-in-Picture included.
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const secondDocument = frame.contentDocument!;
    // The frame's elements use the frame's own prototypes.
    const frameElement = (frame.contentWindow as typeof window).HTMLElement;
    const showPopover = vi.fn();
    const hidePopover = vi.fn();
    for (const Element of [HTMLElement, frameElement]) {
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
        this: HTMLElement,
        selector: string,
      ) {
        return selector === ':focus-visible'
          ? true
          : matches.call(this, selector);
      });
      Element.prototype.showPopover = showPopover;
      Element.prototype.hidePopover = hidePopover;
    }
    try {
      render(createPortal(<Row />, secondDocument.body));
      const first = within(secondDocument.body).getByRole('button', {
        name: 'First',
      });
      first.focus();
      fireEvent.focus(first);
      expect(showPopover).toHaveBeenCalledTimes(1);

      const pageEscape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(pageEscape);
      expect(hidePopover).not.toHaveBeenCalled();
      expect(pageEscape.defaultPrevented).toBe(false);

      fireEvent.keyDown(first, {key: 'Escape'});
      expect(hidePopover).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      frame.remove();
    }
  });

  it('leaves Escape alone once the hint is gone', () => {
    const {first, hidePopover} = renderWithKeyboardFocus();
    fireEvent.keyDown(first, {key: 'ArrowRight'});
    expect(hidePopover).toHaveBeenCalledTimes(1);

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
  });
});
