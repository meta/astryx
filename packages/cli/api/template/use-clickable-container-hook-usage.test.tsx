// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useClickableContainer example opens its project from anywhere on the
 * card, while the Star button, the owner link and a text selection keep their
 * own behavior. Modifier and middle clicks open the project in a new tab.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, vi} from 'vitest';
import UseClickableContainerHookUsage from '../../assets/templates/blocks/components/Hooks/useClickableContainerHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const PROJECT_HREF = '#project-design-tokens';

let root: Root | null = null;
let container: HTMLElement;

function renderExample(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseClickableContainerHookUsage />);
  });
}

function byText(text: string): HTMLElement {
  const match = Array.from(container.querySelectorAll<HTMLElement>('*')).find(
    element =>
      element.children.length === 0 && element.textContent?.includes(text),
  );
  if (match == null) {
    throw new Error(`nothing rendered "${text}"`);
  }
  return match;
}

function description(): HTMLElement {
  return byText('Color, spacing and type tokens');
}

function press(
  target: Element,
  type: 'click' | 'mouseup',
  init: MouseEventInit = {},
): void {
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, {bubbles: true, cancelable: true, ...init}),
    );
  });
}

function openedText(): string {
  return byText('Project opened').textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe('useClickableContainer example', () => {
  it('opens the project from a click anywhere on the card', () => {
    renderExample();
    press(description(), 'click');
    expect(openedText()).toBe('Project opened 1 time');
  });

  it('lets the Star button and the owner link keep their own behavior', () => {
    renderExample();
    press(byText('Star'), 'click');
    expect(byText('Starred')).toBeTruthy();

    press(byText('Design Systems'), 'click');
    expect(openedText()).toBe('Project opened 0 times');
  });

  it('does not open the project when the click ends a text selection', () => {
    renderExample();
    document.getSelection()?.selectAllChildren(description());
    press(description(), 'click');
    expect(openedText()).toBe('Project opened 0 times');
  });

  it('opens the project in a new tab on Ctrl/Cmd+click and middle-click', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderExample();
    press(description(), 'click', {ctrlKey: true});
    press(description(), 'click', {metaKey: true});
    press(description(), 'mouseup', {button: 1});
    expect(open).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledWith(PROJECT_HREF, '_blank', 'noopener');
    expect(openedText()).toBe('Project opened 0 times');
  });
});
