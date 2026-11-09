// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableScrollRegionPlugin.test.tsx
 * @input Uses vitest, @testing-library/react, RichTextView, RichTextEditor and
 *   the Markdown serializer, with a controllable ResizeObserver
 * @output Tests that a table's scroll wrapper in RichTextView is a named group
 *   that takes a tab stop only while the table overflows it, and that the
 *   editor's wrapper is left alone
 * @position Testing; validates TableScrollRegionPlugin.tsx through RichTextView
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, waitFor} from '@testing-library/react';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

const TABLE = markdownToEditorStateJSON(
  '| Name | Role |\n| --- | --- |\n| Ada | Engineer |',
);

/** jsdom has no ResizeObserver; this one lets a test fire a resize. */
const observers: Array<{callback: () => void; targets: Set<Element>}> = [];

class TestResizeObserver {
  private readonly entry: {callback: () => void; targets: Set<Element>};
  constructor(callback: () => void) {
    this.entry = {callback, targets: new Set()};
    observers.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.add(target);
  }
  unobserve(target: Element) {
    this.entry.targets.delete(target);
  }
  disconnect() {
    this.entry.targets.clear();
  }
}

function resize(element: Element) {
  act(() => {
    for (const observer of observers) {
      if (observer.targets.has(element)) {
        observer.callback();
      }
    }
  });
}

/** jsdom lays nothing out, so widths are set by hand. */
function setWidths(element: Element, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: clientWidth,
  });
}

async function scrollWrapper(container: HTMLElement): Promise<HTMLElement> {
  // TablePlugin re-renders existing tables into the wrapper after mount.
  let wrapper: HTMLElement | null = null;
  await waitFor(() => {
    wrapper = container.querySelector('table')?.parentElement ?? null;
    expect(wrapper?.tagName).toBe('DIV');
    expect(wrapper?.getAttribute('contenteditable')).toBeNull();
  });
  return wrapper as unknown as HTMLElement;
}

describe('table scroll regions', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the table scroll region in RichTextView like core Table', async () => {
    const {container} = render(<RichTextView value={TABLE} />);
    const wrapper = await scrollWrapper(container);
    await waitFor(() => {
      expect(wrapper.getAttribute('role')).toBe('group');
    });
    expect(wrapper.getAttribute('aria-label')).toBe('Table');
  });

  it('adds a tab stop only while the table overflows its region', async () => {
    const {container} = render(<RichTextView value={TABLE} />);
    const wrapper = await scrollWrapper(container);
    await waitFor(() => {
      expect(wrapper.getAttribute('role')).toBe('group');
    });
    // A table that fits adds no stop.
    expect(wrapper.hasAttribute('tabindex')).toBe(false);

    setWidths(wrapper, 900, 340);
    resize(wrapper);
    expect(wrapper.getAttribute('tabindex')).toBe('0');

    setWidths(wrapper, 340, 340);
    resize(wrapper);
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
  });

  it('follows a table whose content grows', async () => {
    const {container} = render(<RichTextView value={TABLE} />);
    const wrapper = await scrollWrapper(container);
    await waitFor(() => {
      expect(wrapper.getAttribute('role')).toBe('group');
    });
    const table = wrapper.querySelector('table');
    expect(table).not.toBeNull();

    setWidths(wrapper, 900, 340);
    resize(table as HTMLTableElement);
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });

  it('leaves the editor’s table wrapper alone, so Escape then Tab still leaves the editor', async () => {
    const {container} = render(
      <RichTextEditor label="Notes" defaultValue={TABLE} />,
    );
    const wrapper = await scrollWrapper(container);
    setWidths(wrapper, 900, 340);
    resize(wrapper);
    expect(wrapper.hasAttribute('role')).toBe(false);
    expect(wrapper.hasAttribute('aria-label')).toBe(false);
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
  });
});
