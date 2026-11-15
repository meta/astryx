// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useOutlineFromMarkdown example builds its Outline and its article from
 * one Markdown string: each entry links to a rendered heading, and the button
 * adds a heading and an entry that link to each other.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseOutlineFromMarkdownHookUsage from '../../assets/templates/blocks/components/Outline/useOutlineFromMarkdownHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function outlineEntries(): Array<{label: string; target: string}> {
  return Array.from(container.querySelectorAll('nav a[href^="#"]')).map(
    link => ({
      label: link.textContent ?? '',
      target: (link.getAttribute('href') ?? '').slice(1),
    }),
  );
}

function headingIds(): string[] {
  return Array.from(
    container.querySelectorAll('h1, h2, h3, h4, h5, h6'),
    heading => heading.id,
  );
}

function addSection(): void {
  const button = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === 'Add section',
  );
  act(() => button?.click());
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
    root.render(<UseOutlineFromMarkdownHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useOutlineFromMarkdown example', () => {
  it('links each outline entry to a rendered heading, in order', () => {
    const entries = outlineEntries();
    expect(entries.map(entry => entry.label)).toEqual([
      'Before you start',
      'Run the upgrade',
      'Update the packages',
      'Rebuild the project',
      'Check the result',
    ]);
    expect(entries.map(entry => entry.target)).toEqual(headingIds());
  });

  it('adds a linked entry each time the button adds a section', () => {
    addSection();
    addSection();
    const added = outlineEntries().slice(-2);
    expect(added.map(entry => entry.label)).toEqual([
      'New section',
      'New section',
    ]);
    expect(added[0].target).not.toBe(added[1].target);
    expect(outlineEntries().map(entry => entry.target)).toEqual(headingIds());
  });
});
