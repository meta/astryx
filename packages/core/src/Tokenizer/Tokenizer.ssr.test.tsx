// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file Tokenizer.ssr.test.tsx
 * @input Uses vitest, react-dom/server, react-dom/client, Tokenizer
 * @output Proof of component:Tokenizer FR16's server and hydration path for
 *   `adaptive`: the server renders the inline combobox, the client hydrates
 *   it without a recoverable error, a coarse-pointer client swaps to the
 *   trigger in the first post-hydration render, and focus is undisturbed
 * @position Core Tokenizer tests
 */
import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import type {SearchableItem, SearchSource} from '../Typeahead/types';

const ITEMS: SearchableItem[] = [
  {id: 'design', label: 'Design'},
  {id: 'eng', label: 'Eng'},
];
const source: SearchSource<SearchableItem> = {
  search: q =>
    ITEMS.filter(item => item.label.toLowerCase().includes(q.toLowerCase())),
  bootstrap: () => ITEMS,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function stubCoarsePointer(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matches && query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function serverRenderThenHydrate(
  isCoarsePointer: boolean,
  options: {
    hasAutoFocus?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
  } = {},
) {
  vi.resetModules();
  const {Tokenizer} = await import('./Tokenizer');
  const tree = (
    <Tokenizer
      label="Tags"
      searchSource={source}
      value={[ITEMS[0]]}
      onChange={() => {}}
      hasAutoFocus={options.hasAutoFocus}
      onFocus={options.onFocus}
      onBlur={options.onBlur}
      experimental={{presentation: 'adaptive'}}
    />
  );
  // The server has no matchMedia: the resolver answers `popover`.
  const html = renderToString(tree);
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  // The browser honours the server markup's `autofocus` on load, before any
  // script runs; jsdom does not, so stand in for it.
  if (options.hasAutoFocus) {
    container.querySelector<HTMLElement>('[autofocus]')?.focus();
  }

  stubCoarsePointer(isCoarsePointer);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  const result = {
    html,
    recoverableErrors,
    combobox: container.querySelector('[role="combobox"]'),
    trigger: container.querySelector('button[aria-haspopup="dialog"]'),
    activeElement: document.activeElement,
  };
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return result;
}

describe('Tokenizer — SSR with experimental.presentation: adaptive (FR16)', () => {
  it('server-renders the inline combobox, hydrates it without a recoverable error, and swaps to the trigger on a coarse-pointer client with focus undisturbed', async () => {
    const result = await serverRenderThenHydrate(true);
    // The server markup is the inline field: a combobox input, no trigger.
    expect(result.html).toContain('role="combobox"');
    expect(result.html).not.toContain('aria-haspopup="dialog"');
    // Hydration matches that markup, then the first client render after it
    // resolves `bottom-sheet` and renders the trigger in the field's place.
    expect(result.recoverableErrors).toEqual([]);
    expect(result.trigger).not.toBeNull();
    expect(result.combobox).toBeNull();
    // Nothing was focused before interaction, and the swap moves no focus.
    expect(result.activeElement).toBe(document.body);
  }, 30000);

  it("with hasAutoFocus, moves the autofocused inline input's focus to the trigger at the swap, reporting no onBlur/onFocus pair", async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const result = await serverRenderThenHydrate(true, {
      hasAutoFocus: true,
      onFocus,
      onBlur,
    });
    expect(result.html).toContain('autofocus=""');
    expect(result.recoverableErrors).toEqual([]);
    expect(result.trigger).not.toBeNull();
    expect(result.combobox).toBeNull();
    // The same element and visit: the trigger holds the focus the input had.
    expect(result.activeElement).toBe(result.trigger);
    expect(onBlur).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
  }, 30000);

  it('keeps the inline combobox after hydration on a fine-pointer client', async () => {
    const result = await serverRenderThenHydrate(false);
    expect(result.recoverableErrors).toEqual([]);
    expect(result.combobox).not.toBeNull();
    expect(result.trigger).toBeNull();
    expect(result.activeElement).toBe(document.body);
  }, 30000);
});
