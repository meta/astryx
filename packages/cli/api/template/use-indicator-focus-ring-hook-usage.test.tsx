// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useIndicatorFocusRing example backs a CheckboxIndicator with a visually
 * hidden native checkbox input: keyboard focus matching :focus-visible paints
 * the outline onto the indicator element inside containerRef and clears it on
 * blur, pointer focus stays quiet, and disabling the control skips the ring.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseIndicatorFocusRingHookUsage from '../../assets/templates/blocks/components/Hooks/useIndicatorFocusRingHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;
let isFocusVisible = true;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseIndicatorFocusRingHookUsage />);
  });
}

function getCheckbox(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!input) {
    throw new Error('Expected checkbox input');
  }
  return input;
}

function getIndicatorElement(): HTMLElement {
  const wrapper = container.querySelector<HTMLElement>(
    '[data-testid="indicator-ring-wrapper"]',
  );
  const indicator = wrapper?.firstElementChild;
  if (!(indicator instanceof HTMLElement)) {
    throw new Error('Expected indicator root element');
  }
  return indicator;
}

beforeEach(() => {
  isFocusVisible = true;
  const originalMatches = HTMLElement.prototype.matches;
  vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
    this: HTMLElement,
    selector: string,
  ) {
    return selector === ':focus-visible'
      ? isFocusVisible
      : originalMatches.call(this, selector);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
});

describe('useIndicatorFocusRingHookUsage example', () => {
  it('paints the focus ring onto the indicator on :focus-visible and clears on blur', () => {
    renderExample();
    const input = getCheckbox();
    const indicator = getIndicatorElement();

    expect(indicator.style.outlineStyle).toBe('');

    act(() => {
      input.focus();
    });
    expect(indicator.style.outlineStyle).not.toBe('');
    expect(indicator.style.outlineStyle).not.toBe('none');
    expect(indicator.style.outlineWidth).not.toBe('');

    act(() => {
      input.blur();
    });
    expect(indicator.style.outlineStyle).toBe('');
  });

  it('keeps pointer focus quiet when :focus-visible does not match', () => {
    renderExample();
    const input = getCheckbox();
    const indicator = getIndicatorElement();

    isFocusVisible = false;
    act(() => {
      input.focus();
    });

    expect(indicator.style.outlineStyle).toBe('');
  });

  it('toggles checked state cleanly and skips the focus ring when disabled', () => {
    renderExample();
    const input = getCheckbox();
    const indicator = getIndicatorElement();

    expect(input.checked).toBe(true);
    act(() => {
      input.click();
    });
    expect(input.checked).toBe(false);

    const disableButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent === 'Disable');
    expect(disableButton).toBeDefined();

    act(() => {
      disableButton?.click();
    });
    expect(input.disabled).toBe(true);

    act(() => {
      input.dispatchEvent(new FocusEvent('focus', {bubbles: true}));
    });
    expect(indicator.style.outlineStyle).toBe('');
  });
});
