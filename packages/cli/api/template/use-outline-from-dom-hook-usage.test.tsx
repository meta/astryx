// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useOutlineFromDOM example builds its Outline from the headings in the
 * article. Each entry links to a rendered heading, and the button adds a
 * heading and an entry that link to each other.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseOutlineFromDOMHookUsage from '../../assets/templates/blocks/components/Outline/useOutlineFromDOMHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function labels(): string[] {
  return Array.from(
    container.querySelectorAll('nav a[href^="#"]'),
    link => link.textContent ?? '',
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseOutlineFromDOMHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useOutlineFromDOM example', () => {
  it('links each outline entry to a rendered heading', () => {
    const entries = Array.from(container.querySelectorAll('nav a[href^="#"]'));
    expect(entries.map(link => link.textContent)).toEqual([
      'Before you start',
      'Run the upgrade',
      'Check the result',
    ]);
    expect(entries.map(link => link.getAttribute('href'))).toEqual([
      '#before-you-start',
      '#run-the-upgrade',
      '#check-the-result',
    ]);
  });

  it('adds a linked entry when the button adds a heading', async () => {
    const button = Array.from(container.querySelectorAll('button')).find(
      candidate => candidate.textContent === 'Add section',
    );
    await act(async () => {
      button?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(labels().at(-1)).toBe('New section');
    const last = container.querySelector('nav a[href="#new-section-1"]');
    expect(last?.textContent).toBe('New section');
  });
});
