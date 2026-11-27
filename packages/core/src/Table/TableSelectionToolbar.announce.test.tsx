// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableSelectionToolbar.announce.test.tsx
 * @input A fresh TableSelectionToolbar module with the document's load held
 *   back, and the shared polite live region
 * @output Tests that the selected count is announced as it changes
 *   (spec:AST-020 SC 4.1.3, spec:AST-086 FR9 and FR11)
 * @position Component test for TableSelectionToolbar's count announcement
 */

import {act, useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import type {TableSelectionState} from './plugins/selection/useTableSelectionState';

// The document is "loading" until `paint()`; a render before it is part of the
// page load, one after it is inserted later (spec:AST-086 FR11).
async function importToolbar() {
  let readyState: DocumentReadyState = 'loading';
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
  const {TableSelectionToolbar} = await import('./TableSelectionToolbar');
  return {TableSelectionToolbar, paint: () => (readyState = 'complete')};
}

const nextFrame = async () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const settle = async () => {
  await act(nextFrame);
  await act(nextFrame);
};

const POLITE = '[data-astryx-live-region="polite"]';

/** Every write to the shared polite region, one entry per write. */
function recordPolite() {
  const spoken: string[] = [];
  const observer = new MutationObserver(records => {
    for (const {target, addedNodes} of records) {
      const text = addedNodes.length ? target.textContent?.trim() : '';
      if (text && (target as Element).matches?.(POLITE)) {
        spoken.push(text);
      }
    }
  });
  observer.observe(document.body, {subtree: true, childList: true});
  return {spoken, stop: () => observer.disconnect()};
}

function selectionOf(keys: ReadonlyArray<string>): TableSelectionState {
  const selectedKeys = new Set(keys);
  return {
    selectedKeys,
    selectedCount: selectedKeys.size,
    hasSelection: selectedKeys.size > 0,
    clearSelection: () => {},
  };
}

const mount = () =>
  createRoot(document.body.appendChild(document.createElement('div')));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('TableSelectionToolbar count announcement', () => {
  it('announces the count as the selection appears and changes, and again after it is cleared', async () => {
    const {TableSelectionToolbar, paint} = await importToolbar();
    paint();
    let select!: (keys: ReadonlyArray<string>) => void;
    function Rows() {
      const [keys, setKeys] = useState<ReadonlyArray<string>>([]);
      select = setKeys;
      return <TableSelectionToolbar selection={selectionOf(keys)} />;
    }
    const polite = recordPolite();
    const root = mount();
    await act(async () => root.render(<Rows />));
    await act(async () => select(['a']));
    await settle();
    await act(async () => select(['a', 'b']));
    await settle();
    await act(async () => select([]));
    await settle();
    await act(async () => select(['c']));
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual(['1 selected', '2 selected', '1 selected']);
    await act(async () => root.unmount());
  });

  it('speaks only the latest count of changes made together', async () => {
    const {TableSelectionToolbar, paint} = await importToolbar();
    paint();
    let select!: (keys: ReadonlyArray<string>) => void;
    function Rows() {
      const [keys, setKeys] = useState<ReadonlyArray<string>>(['a']);
      select = setKeys;
      return <TableSelectionToolbar selection={selectionOf(keys)} />;
    }
    const root = mount();
    await act(async () => root.render(<Rows />));
    await settle();
    const polite = recordPolite();
    await act(async () => select(['a', 'b']));
    await act(async () => select(['a', 'b', 'c']));
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual(['3 selected']);
    await act(async () => root.unmount());
  });

  it('announces nothing for a selection rendered with the page, or a custom count that renders nothing', async () => {
    const {TableSelectionToolbar, paint} = await importToolbar();
    const polite = recordPolite();
    const root = mount();
    await act(async () =>
      root.render(
        <>
          <TableSelectionToolbar selection={selectionOf(['a', 'b'])} />
          <TableSelectionToolbar
            label="Other"
            selection={selectionOf(['a'])}
            renderSelectionLabel={() => null}
          />
        </>,
      ),
    );
    paint();
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual([]);
    await act(async () => root.unmount());
  });
});
