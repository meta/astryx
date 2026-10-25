// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file EmptyState.announce.test.tsx
 * @input A fresh EmptyState module with the document's load held back
 * @output spec:AST-086 FR11/FR12 tests for EmptyState's announcement
 * @position Component test for EmptyState's announcement
 */

import {act, StrictMode, useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {renderedText} from '../hooks/useAnnounceRenderedText';

// The document is "loading" until `paint()`; a render before it is part of the
// page load, one after it is inserted later (spec:AST-086 FR11).
async function importEmptyState() {
  let readyState: DocumentReadyState = 'loading';
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState);
  const {EmptyState} = await import('./EmptyState');
  return {EmptyState, paint: () => (readyState = 'complete')};
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

const mount = () =>
  createRoot(document.body.appendChild(document.createElement('div')));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('EmptyState announcement (spec:AST-086 FR2)', () => {
  it('announces nothing when it renders with the page', async () => {
    const {EmptyState, paint} = await importEmptyState();
    const polite = recordPolite();
    const root = mount();
    await act(async () => {
      root.render(<EmptyState title="No projects" description="Create one." />);
    });
    paint();
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual([]);
    await act(async () => root.unmount());
  });

  it('announces its message once when it appears later', async () => {
    const {EmptyState, paint} = await importEmptyState();
    paint();
    let showEmpty!: () => void;
    function Results() {
      const [isEmpty, setIsEmpty] = useState(false);
      showEmpty = () => setIsEmpty(true);
      return isEmpty ? (
        <EmptyState
          icon={<span>icon</span>}
          title="No results"
          description="Try another search."
          actions={<button type="button">Clear filters</button>}
        />
      ) : (
        <p>Searching</p>
      );
    }
    const polite = recordPolite();
    const root = mount();
    await act(async () => {
      root.render(
        <StrictMode>
          <Results />
        </StrictMode>,
      );
    });
    await act(async () => showEmpty());
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual(['No results Try another search.']);
    await act(async () => root.unmount());
  });

  it('leaves an empty state inside a live container to that container (spec:AST-086 FR4)', async () => {
    const {EmptyState, paint} = await importEmptyState();
    paint();
    let showEmpty!: () => void;
    function Log() {
      const [isEmpty, setIsEmpty] = useState(false);
      showEmpty = () => setIsEmpty(true);
      return (
        <div role="log" aria-live="polite">
          {isEmpty ? <EmptyState title="No messages yet" /> : null}
        </div>
      );
    }
    const polite = recordPolite();
    const root = mount();
    await act(async () => root.render(<Log />));
    await act(async () => showEmpty());
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual([]);
    await act(async () => root.unmount());
  });

  it('announces once when the message changes after the page loaded, not while it loads', async () => {
    const {EmptyState, paint} = await importEmptyState();
    let setTitle!: (title: string) => void;
    function Search() {
      const [title, set] = useState('No saved searches');
      setTitle = set;
      return <EmptyState title={title} />;
    }
    const polite = recordPolite();
    const root = mount();
    await act(async () => root.render(<Search />));
    await act(async () => setTitle('No matches yet'));
    paint();
    await act(async () => setTitle('No results'));
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual(['No results']);
    await act(async () => root.unmount());
  });

  it('announces nothing from a server render or its hydration (FR12)', async () => {
    const {EmptyState, paint} = await importEmptyState();
    const tree = <EmptyState title="No projects" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);
    paint();
    const polite = recordPolite();
    const root = await act(async () => hydrateRoot(container, tree));
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual([]);
    await act(async () => root.unmount());
  });

  it('reads blocks apart and leaves hidden text out of the message', () => {
    const element = document.createElement('div');
    element.innerHTML = '<p>Try again.</p><p>Later.</p><b hidden>No</b>';
    expect(renderedText(element)).toBe('Try again. Later.');
  });

  it('stays silent while hidden (attribute or CSS) or revealed during load; announces once when shown later (FR12)', async () => {
    const {EmptyState, paint} = await importEmptyState();
    // jsdom has no checkVisibility; this one honors an inline display: none.
    HTMLElement.prototype.checkVisibility = function (this: HTMLElement) {
      return this.closest('[style*="none"]') == null;
    };
    const polite = recordPolite();
    const root = mount();
    const show = async (hidden: boolean, display?: string) =>
      act(async () =>
        root.render(
          <div style={{display}}>
            <EmptyState title="No results" hidden={hidden} />
          </div>,
        ),
      );
    await show(true);
    await show(false);
    paint();
    await show(true);
    await show(false, 'none');
    await act(nextFrame);
    expect(polite.spoken).toEqual([]);
    await show(false);
    await settle();
    polite.stop();
    expect(polite.spoken).toEqual(['No results']);
    delete (HTMLElement.prototype as Partial<HTMLElement>).checkVisibility;
    await act(async () => root.unmount());
  });
});
