// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BaseTypeahead.incremental.test.tsx
 * @input BaseTypeahead with a source that calls `context.update` before it settles
 * @output Verification of incremental search results (spec:AST-092)
 * @position Colocated verification for BaseTypeahead partial and final lists
 */

import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {StrictMode} from 'react';
import {BaseTypeahead} from './BaseTypeahead';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {__resetDevWarnings} from '../utils/devWarning';
import type {SearchContext, SearchSource, SearchableItem} from './types';

const popoverOpenState = new WeakMap<HTMLElement, boolean>();
const originalMatchesDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'matches',
);
const originalMatches = HTMLElement.prototype.matches;

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {
    popoverOpenState.set(this, true);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  };
  HTMLElement.prototype.hidePopover = function () {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  };
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    ...originalMatchesDescriptor,
    value(this: HTMLElement, selector: string) {
      if (selector === ':popover-open') {
        return popoverOpenState.get(this) ?? false;
      }
      return originalMatches.call(this, selector);
    },
  });
});

afterAll(() => {
  if (originalMatchesDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'matches',
      originalMatchesDescriptor,
    );
  }
});

afterEach(() => {
  __resetLiveRegionsForTest();
  __resetDevWarnings();
  vi.restoreAllMocks();
});

const benOrtiz = {id: 'u2', label: 'Ben Ortiz'};
const benitaRuiz = {id: 'u3', label: 'Benita Ruiz'};
const benShah = {id: 'u7', label: 'Ben Shah'};
const bennettCole = {id: 'u8', label: 'Bennett Cole'};
const beaLin = {id: 'u1', label: 'Bea Lin'};

interface PendingSearch {
  query: string;
  context: SearchContext<SearchableItem> | undefined;
  resolve: (items: SearchableItem[]) => void;
  reject: (error: unknown) => void;
}

/**
 * A source whose every search stays pending until the test settles it. Local
 * matches, when given for a query, are shown through `update` before
 * `search()` returns, the way a source with cached results behaves.
 */
function createPendingSource(local: Record<string, SearchableItem[]> = {}) {
  const searches: PendingSearch[] = [];
  const source: SearchSource<SearchableItem> = {
    bootstrap: () => [],
    async search(query, context) {
      const localMatches = local[query];
      if (localMatches) {
        context?.update(localMatches);
      }
      return new Promise<SearchableItem[]>((resolve, reject) => {
        searches.push({query, context, resolve, reject});
      });
    },
  };
  const latest = () => searches[searches.length - 1];
  return {source, searches, latest};
}

function renderTypeahead(
  source: SearchSource<SearchableItem>,
  onChange: (item: SearchableItem | null) => void = () => {},
) {
  render(
    <BaseTypeahead
      aria-label="Assign to"
      searchSource={source}
      value={null}
      onChange={onChange}
      debounceMs={0}
    />,
  );
  return screen.getByRole('combobox', {name: 'Assign to'});
}

function optionLabels() {
  return screen
    .queryAllByRole('option', {hidden: true})
    .map(option => option.textContent);
}

function liveRegion() {
  return document.querySelector('[data-astryx-live-region="polite"]');
}

async function type(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, {target: {value}});
  });
}

async function settle(search: PendingSearch, items: SearchableItem[]) {
  await act(async () => {
    search.resolve(items);
  });
}

describe('BaseTypeahead incremental results (spec:AST-092)', () => {
  it('shows a partial list at once and stays busy until the final list (FR1, FR5)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);

    await type(input, 'ben');
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz']);
    expect(input).toHaveAttribute('aria-busy', 'true');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    expect(optionLabels()).toEqual([
      'Ben Ortiz',
      'Benita Ruiz',
      'Ben Shah',
      'Bennett Cole',
    ]);
    expect(input).not.toHaveAttribute('aria-busy');
  });

  it('keeps the highlighted item, its option id, and Enter on it when rows are appended (FR6, FR7)', async () => {
    const onChange = vi.fn();
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source, onChange);

    await type(input, 'ben');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).not.toBeNull();
    expect(document.getElementById(activeId!)).toHaveTextContent('Benita Ruiz');

    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    expect(input).toHaveAttribute('aria-activedescendant', activeId!);
    expect(document.getElementById(activeId!)).toHaveTextContent('Benita Ruiz');

    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(benitaRuiz);
  });

  it('announces the result count once per query, when it settles (FR8)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);
    const announced: string[] = [];
    let lastText = '';
    const observer = new MutationObserver(() => {
      const text = liveRegion()?.textContent ?? '';
      if (text !== lastText) {
        if (text !== '') {
          announced.push(text);
        }
        lastText = text;
      }
    });

    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    await type(input, 'ben');
    // The channel writes on the next frame; give a partial list the chance.
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(announced).toEqual([]);

    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    await waitFor(() => {
      expect(announced).toContain('4 results');
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    observer.disconnect();
    expect(announced).toEqual(['4 results']);
  });

  it('drops lists for a query that is no longer current (FR4)', async () => {
    const {source, searches} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);

    await type(input, 'be');
    const stale = searches[0];
    await type(input, 'ben');
    await act(async () => {
      stale.context?.update([beaLin]);
    });
    await settle(stale, [beaLin, benOrtiz]);
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz']);
  });

  it('ignores an update after the query settles (FR3)', async () => {
    const {source, latest} = createPendingSource();
    const input = renderTypeahead(source);

    await type(input, 'ben');
    const search = latest();
    await settle(search, [benOrtiz]);
    await act(async () => {
      search.context?.update([benOrtiz, benShah]);
    });
    expect(optionLabels()).toEqual(['Ben Ortiz']);
  });

  it('leaves rows in place on an empty update and shows the empty row only at settle (FR5)', async () => {
    const {source, latest} = createPendingSource({b: [beaLin], bz: []});
    const input = renderTypeahead(source);

    await type(input, 'b');
    await settle(latest(), [beaLin]);
    await type(input, 'bz');
    expect(optionLabels()).toEqual(['Bea Lin']);
    expect(input).toHaveAttribute('aria-busy', 'true');

    await settle(latest(), []);
    expect(optionLabels()).toEqual(['No results found']);
  });

  it('keeps the last non-empty list when the answer fails (FR9)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);

    await type(input, 'ben');
    await act(async () => {
      latest().reject(new Error('offline'));
    });
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz']);
    expect(input).not.toHaveAttribute('aria-busy');
    await waitFor(() => {
      expect(liveRegion()?.textContent).toBe('2 results');
    });
  });

  it('announces only the count when the answer fails before the busy start is written (FR9, AST-086 FR8)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);
    const announced: string[] = [];
    const observer = new MutationObserver(() => {
      const text = liveRegion()?.textContent ?? '';
      if (text !== '' && announced.at(-1) !== text) {
        announced.push(text);
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    await type(input, 'ben');
    // The busy start is queued on the polite channel a frame after the
    // partial list; the failure lands before the channel writes it.
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      latest().reject(new Error('offline'));
    });
    await waitFor(() => {
      expect(announced).toContain('2 results');
    });
    for (let frame = 0; frame < 3; frame++) {
      await act(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
    }
    observer.disconnect();
    expect(announced.join(' | ')).not.toMatch(/Loading|Searching/);
    expect(liveRegion()?.textContent).toBe('2 results');
  });

  it('settles empty, not on the previous query rows, when only empty updates preceded a failure (FR9)', async () => {
    const {source, latest} = createPendingSource({b: [beaLin], bz: []});
    const input = renderTypeahead(source);

    await type(input, 'b');
    await settle(latest(), [beaLin]);
    await type(input, 'bz');
    await act(async () => {
      latest().reject(new Error('offline'));
    });
    expect(optionLabels()).toEqual(['No results found']);
  });

  it('warns in development when a later list moves shown rows, and shows it as given (FR2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);

    await type(input, 'ben');
    await settle(latest(), [benShah, benOrtiz, benitaRuiz]);
    expect(optionLabels()).toEqual(['Ben Shah', 'Ben Ortiz', 'Benita Ruiz']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('BaseTypeahead:'),
    );
  });

  it('lets the first list of a new query replace the rows without a warning (FR2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {source, latest} = createPendingSource({be: [benitaRuiz]});
    const input = renderTypeahead(source);

    await type(input, 'b');
    await settle(latest(), [beaLin, benOrtiz, benitaRuiz]);
    await type(input, 'be');
    expect(optionLabels()).toEqual(['Benita Ruiz']);
    await settle(latest(), [benitaRuiz, beaLin]);
    expect(optionLabels()).toEqual(['Benita Ruiz', 'Bea Lin']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a row in place when its id returns with fresher data (FR2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);

    await type(input, 'ben');
    await settle(latest(), [
      {...benOrtiz, label: 'Ben Ortiz (Payments)'},
      benitaRuiz,
      benShah,
    ]);
    expect(optionLabels()).toEqual([
      'Ben Ortiz (Payments)',
      'Benita Ruiz',
      'Ben Shah',
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
  it('applies append-only to displayed order, groups included (FR2)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const people = {
      id: 'g1',
      label: 'Ben Ortiz',
      auxiliaryData: {group: 'People'},
    };
    const teams = {
      id: 'g2',
      label: 'Bento team',
      auxiliaryData: {group: 'Teams'},
    };
    const lateUngrouped = {id: 'g3', label: 'Ben (alias)'};
    const {source, latest} = createPendingSource({ben: [people]});
    const input = renderTypeahead(source);

    await type(input, 'ben');
    // A new group after the shown rows is an append.
    await act(async () => {
      latest().context?.update([people, teams]);
    });
    expect(warn).not.toHaveBeenCalled();

    // An ungrouped row displays above every group, so it breaks the rule.
    await settle(latest(), [people, teams, lateUngrouped]);
    expect(optionLabels()).toEqual(['Ben (alias)', 'Ben Ortiz', 'Bento team']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('BaseTypeahead:'),
    );
  });

  it('holds the height of a popup above the field when rows are appended (FR6)', async () => {
    const {source, latest} = createPendingSource({ben: [benOrtiz, benitaRuiz]});
    const input = renderTypeahead(source);
    await type(input, 'ben');

    const listbox = screen.getByRole('listbox', {hidden: true});
    vi.spyOn(listbox, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 20, width: 240, height: 80}),
    );
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 104, width: 240, height: 32}),
    );
    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    expect(listbox.getAttribute('style') ?? '').toContain('80px');
  });

  it('grows a popup below the field only within the room below it (FR6)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);
    await type(input, 'ben');

    const listbox = screen.getByRole('listbox', {hidden: true});
    vi.spyOn(listbox, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 140, width: 240, height: 80}),
    );
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 104, width: 240, height: 32}),
    );
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(360);
    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    // 360 px of viewport, the list starting 140 px down: 220 px of room.
    expect(listbox.getAttribute('style') ?? '').toContain('220px');
  });

  it('announces nothing for a rejection after the popup closed and cancelled (FR9)', async () => {
    const {source, latest} = createPendingSource({ben: [benOrtiz, benitaRuiz]});
    const input = renderTypeahead(source);
    await type(input, 'ben');
    fireEvent.keyDown(input, {key: 'Escape'});
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      latest().reject(new Error('aborted'));
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(input).not.toHaveAttribute('aria-busy');
    expect(liveRegion()?.textContent ?? '').not.toContain('results');
  });

  it('keeps no rows from the previous query when a cancelled search rejects before its first list (FR9)', async () => {
    const {source, latest} = createPendingSource({b: [beaLin], bz: []});
    const input = renderTypeahead(source);
    await type(input, 'b');
    await settle(latest(), [beaLin]);
    await type(input, 'bz');
    fireEvent.keyDown(input, {key: 'Escape'});
    await act(async () => {
      latest().reject(new Error('aborted'));
    });
    expect(optionLabels()).toEqual([]);
    expect(input).not.toHaveAttribute('aria-busy');
  });

  it('releases the held popup height when the query ends (FR6)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const input = renderTypeahead(source);
    await type(input, 'ben');
    const listbox = screen.getByRole('listbox', {hidden: true});
    vi.spyOn(listbox, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 20, width: 240, height: 80}),
    );
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 0, y: 104, width: 240, height: 32}),
    );
    await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
    expect(listbox.getAttribute('style') ?? '').toContain('80px');

    await type(input, '');
    expect(listbox.getAttribute('style') ?? '').not.toContain('80px');
  });

  it('does not scroll the list when a later list appends rows (FR6)', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const {source, latest} = createPendingSource({
        ben: [benOrtiz, benitaRuiz],
      });
      const input = renderTypeahead(source);
      await type(input, 'ben');
      fireEvent.keyDown(input, {key: 'ArrowDown'});
      expect(scrollIntoView).toHaveBeenCalled();

      scrollIntoView.mockClear();
      await settle(latest(), [benOrtiz, benitaRuiz, benShah, bennettCole]);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as unknown as {scrollIntoView?: unknown})
        .scrollIntoView;
    }
  });

  it('drops lists and rejections that arrive after unmount (FR4)', async () => {
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    const {unmount} = render(
      <BaseTypeahead
        aria-label="Assign to"
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    await type(screen.getByRole('combobox'), 'ben');
    const search = latest();
    unmount();
    await act(async () => {
      search.context?.update([benOrtiz]);
      search.reject(new Error('aborted'));
    });
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(liveRegion()?.textContent ?? '').not.toContain('results');
  });

  it('drops a slow bootstrap once the person types, and stays busy for the query (slow bootstrap)', async () => {
    let finishBootstrap: (items: SearchableItem[]) => void = () => {};
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    source.bootstrap = async () =>
      new Promise<SearchableItem[]>(resolve => {
        finishBootstrap = resolve;
      });
    render(
      <BaseTypeahead
        aria-label="Assign to"
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
        hasEntriesOnFocus
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-busy', 'true');

    await type(input, 'ben');
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz']);

    // The bootstrap lands late: it neither replaces nor reorders the rows.
    await act(async () => {
      finishBootstrap([beaLin, bennettCole]);
    });
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz']);
    expect(input).toHaveAttribute('aria-busy', 'true');

    await settle(latest(), [benOrtiz, benitaRuiz, benShah]);
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz', 'Ben Shah']);
    expect(input).not.toHaveAttribute('aria-busy');
  });

  it('behaves the same under StrictMode (pure updaters, no effect-driven state)', async () => {
    const onChange = vi.fn();
    const {source, latest} = createPendingSource({
      ben: [benOrtiz, benitaRuiz],
    });
    render(
      <StrictMode>
        <BaseTypeahead
          aria-label="Assign to"
          searchSource={source}
          value={null}
          onChange={onChange}
          debounceMs={0}
        />
      </StrictMode>,
    );
    const input = screen.getByRole('combobox');
    await type(input, 'ben');
    fireEvent.keyDown(input, {key: 'ArrowDown'});
    await settle(latest(), [benOrtiz, benitaRuiz, benShah]);
    expect(optionLabels()).toEqual(['Ben Ortiz', 'Benita Ruiz', 'Ben Shah']);
    fireEvent.keyDown(input, {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith(benitaRuiz);
  });
});
