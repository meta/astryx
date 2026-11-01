// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useKeyboardHint.test.tsx
 * @input Uses React Testing Library, useKeyboardHint
 * @output Unit tests for keyboard hint rendering
 */

import {fireEvent, render, screen} from '@testing-library/react';
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

    expect(hint.className).toContain('useKeyboardHint__styles.hint');
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
