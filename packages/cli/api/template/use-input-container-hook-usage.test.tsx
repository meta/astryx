// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useInputContainer example puts focus in its search input when the
 * search icon or the field's padding is clicked, while the Clear button keeps
 * its own click.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseInputContainerHookUsage from '../../assets/templates/blocks/components/Hooks/useInputContainerHookUsage';

// The node project does not compile StyleX, and the field's styles are not
// under test.
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function input(): HTMLInputElement {
  const element = container.querySelector('input');
  if (element == null) {
    throw new Error('no search input rendered');
  }
  return element;
}

function field(): HTMLElement {
  const element = input().parentElement;
  if (element == null) {
    throw new Error('the search input has no field');
  }
  return element;
}

function click(target: Element): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true}),
    );
  });
}

function type(value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  act(() => {
    setValue?.call(input(), value);
    input().dispatchEvent(new Event('input', {bubbles: true}));
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseInputContainerHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe('useInputContainer example', () => {
  it('focuses the input when the search icon is clicked', () => {
    const icon = field().querySelector('svg');
    expect(icon).not.toBeNull();
    click(icon as SVGElement);
    expect(document.activeElement).toBe(input());
  });

  it("focuses the input when the field's padding is clicked", () => {
    click(field());
    expect(document.activeElement).toBe(input());
  });

  it('lets the Clear button handle its own click', () => {
    type('running shoes');
    const clear = container.querySelector('button');
    expect(clear).not.toBeNull();
    const focus = vi.spyOn(input(), 'focus');

    click(clear as HTMLButtonElement);

    expect(input().value).toBe('');
    expect(container.querySelector('button')).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
