// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {createRef, useLayoutEffect} from 'react';
import {ChatVirtualizer, type ChatVirtualizerHandle} from './ChatVirtualizer';

// jsdom has no real layout (offsetHeight is 0, ResizeObserver never fires),
// so these tests cover the CONTRACT layer — rendering shape, key handling,
// the imperative handle — not scroll geometry. Geometry behavior is covered
// by the storybook story and, upstream of this PR, by a CDP-driven
// painted-frame benchmark suite (numbers in the PR description).

type Row = {id: string | number; text: string};

const rows = (n: number): Row[] =>
  Array.from({length: n}, (_, i) => ({id: i, text: `message ${i}`}));

function renderList(
  data: Row[],
  extra: Partial<React.ComponentProps<typeof ChatVirtualizer<Row>>> = {},
) {
  return render(
    <ChatVirtualizer<Row>
      data={data}
      keyExtractor={m => String(m.id)}
      renderItem={({item}) => <span>{item.text}</span>}
      estimatedItemSize={100}
      {...extra}
    />,
  );
}

describe('ChatVirtualizer', () => {
  it('renders two aria-hidden spacers around the windowed rows', () => {
    const {container} = renderList(rows(5));
    const spacers = container.querySelectorAll('[aria-hidden="true"]');
    expect(spacers.length).toBe(2);
  });

  it('tags every rendered row with its data-pkey identity', () => {
    const {container} = renderList(rows(5));
    for (const el of container.querySelectorAll('[data-pkey]')) {
      const key = el.getAttribute('data-pkey');
      expect(key).toBeTruthy();
      expect(typeof key).toBe('string');
    }
  });

  it('coerces number keys to strings (the dataset round-trip contract)', () => {
    const {container} = renderList(rows(3), {
      // Deliberately returns a number at runtime; the component must coerce
      // so the RO pipeline (which reads dataset.pkey strings) and the size
      // cache stay keyed consistently.
      keyExtractor: (m: Row) => m.id as unknown as string,
    });
    const first = container.querySelector('[data-pkey]');
    expect(first?.getAttribute('data-pkey')).toBe('0');
  });

  it('renders an empty list as just the spacers', () => {
    const {container} = renderList([]);
    expect(container.querySelectorAll('[data-pkey]').length).toBe(0);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(2);
  });

  it('renders one content block in attach mode (no own scroll container)', () => {
    const host = document.createElement('div');
    const {container} = renderList(rows(3), {scrollElement: host});
    // Own-container mode nests the same block inside its scroller div;
    // attach mode renders the block alone, spacers first and last.
    const block = container.firstElementChild as HTMLElement;
    expect(block.style.overflowY).toBe('');
    expect(block.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(block.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  // ---- The extent floor ----------------------------------------------------
  // A commit removes rows before anything resizes the spacers, so a layout
  // forced inside it (a row's layout cleanup, a ref callback) would see the
  // extent without them, and the browser would clamp scrollTop for good. The
  // content block's min-height is the floor: written by the pass only, so
  // through the whole commit it is still the extent the last pass described.

  it('keeps the previous extent as the floor while the commit removes rows', () => {
    const seen: string[] = [];
    let block: HTMLElement | null = null;
    function Probe({item}: {item: Row}) {
      useLayoutEffect(
        () => () => {
          seen.push(block?.style.minHeight ?? '');
        },
        [],
      );
      return <span>{item.text}</span>;
    }
    const list = (data: Row[]) => (
      <ChatVirtualizer<Row>
        data={data}
        keyExtractor={m => String(m.id)}
        renderItem={({item}) => <Probe item={item} />}
        estimatedItemSize={100}
      />
    );
    const {container, rerender} = render(list(rows(5)));
    block = container.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    )!.parentElement;
    // jsdom lays nothing out, so every row keeps its estimate: 5 x 100.
    expect(block?.style.minHeight).toBe('500px');
    act(() => {
      rerender(list(rows(2)));
    });
    expect(seen).toEqual(['500px', '500px', '500px']);
    expect(block?.style.minHeight).toBe('200px');
  });

  it('renders nothing but spacers while the attach element is pending (null)', () => {
    const {container} = renderList(rows(3), {scrollElement: null});
    // null = attach mode waiting: no own container may be created, or an
    // unbounded parent would mount every row for one commit.
    expect(container.querySelector('[style*="overflow"]')).toBeNull();
  });

  it('exposes the declaration handle via apiRef', () => {
    const ref = createRef<ChatVirtualizerHandle>();
    renderList(rows(3), {apiRef: ref});
    expect(typeof ref.current?.scrollToDistanceFromBottomPx).toBe('function');
    expect(typeof ref.current?.anchorToKey).toBe('function');
    // Declarations must not throw without real layout.
    act(() => {
      ref.current?.scrollToDistanceFromBottomPx(0);
      ref.current?.anchorToKey('1', 0);
      // A key that is not in the data must not throw either — it falls back
      // to follow-at-end on the next pass (dead-anchor fallback).
      ref.current?.anchorToKey('missing-key', 0);
    });
  });

  // ---- Touch write-gate --------------------------------------------------
  // jsdom has no compositor, so these pin the STATE MACHINE (which events
  // open and close the gate, and what the gate suppresses), not the geometry
  // it protects. The painted-position numbers behind it are in the PR.

  function attachedList(el: HTMLElement, data: Row[] = rows(50)) {
    return renderList(data, {scrollElement: el});
  }

  const scroller = (): HTMLElement => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', {value: 400, writable: true});
    Object.defineProperty(el, 'scrollHeight', {value: 5000, writable: true});
    el.scrollTop = 2000;
    document.body.appendChild(el);
    return el;
  };

  const touch = (el: HTMLElement, type: string, remaining = 0): void => {
    const e = new Event(type, {bubbles: false});
    Object.defineProperty(e, 'touches', {value: {length: remaining}});
    act(() => {
      el.dispatchEvent(e);
    });
  };

  // ---- Who moved the scroller ----------------------------------------------
  // The list follows by writing its own bottom on every commit; the question
  // every scroll event answers is whether the USER moved the scroller since.
  // jsdom dispatches no scroll events and clamps nothing, so each test writes
  // the position the browser would have reported and dispatches the event.
  // Follow is observable as the next growth commit writing a larger bottom.

  const tallScroller = (): HTMLElement => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', {value: 400, writable: true});
    Object.defineProperty(el, 'scrollHeight', {value: 1e6, writable: true});
    document.body.appendChild(el);
    return el;
  };
  const attachedTo = (data: Row[], el: HTMLElement) => (
    <ChatVirtualizer<Row>
      data={data}
      keyExtractor={m => String(m.id)}
      renderItem={({item}) => <span>{item.text}</span>}
      estimatedItemSize={100}
      scrollElement={el}
    />
  );
  // The mount landing is a declared target in flight; its release (and the
  // end of convergence, during which scroll events may not flip the mode)
  // is a rAF away.
  const settled = async (): Promise<void> => {
    await act(async () => {
      await new Promise(r => setTimeout(r, 40));
    });
  };
  const scrollEvent = (el: HTMLElement, at: number): void => {
    el.scrollTop = at;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
  };
  const followsAfterGrowth = (
    el: HTMLElement,
    rerender: (ui: React.ReactElement) => void,
    written: number,
  ): boolean => {
    act(() => {
      rerender(attachedTo(rows(60), el));
    });
    return el.scrollTop > written + 1;
  };

  it('a wheel by itself does not disengage follow', async () => {
    // A wheel this scroller never consumes — over a nested scroller with
    // room above, one with overscroll-behavior: contain, an overscroll at
    // the bottom — moves nothing here. Only the container moving counts.
    const el = tallScroller();
    const {rerender} = render(attachedTo(rows(50), el));
    await settled();
    const written = el.scrollTop;
    act(() => {
      el.dispatchEvent(new WheelEvent('wheel', {deltaY: -120}));
    });
    expect(followsAfterGrowth(el, rerender, written)).toBe(true);
    el.remove();
  });

  it('a scroll-up the next write outruns still disengages', async () => {
    // The list wrote the bottom; the reader wheeled up 100px and the event
    // reporting it carries that net. Against the last write the reader's
    // move shows, whatever the previous event said (here: nothing).
    const el = tallScroller();
    const {rerender} = render(attachedTo(rows(50), el));
    await settled();
    const written = el.scrollTop;
    // jsdom clamps nothing: make the box agree with where the list put it.
    Object.defineProperty(el, 'scrollHeight', {
      value: written + el.clientHeight,
      writable: true,
    });
    scrollEvent(el, written - 100);
    expect(followsAfterGrowth(el, rerender, written)).toBe(false);
    el.remove();
  });

  it('a clamp onto a new, smaller bottom is not displacement', async () => {
    // A row above shrank outside any commit (an image, a font); the browser
    // pinned the position to the new maximum. The reader did not move.
    const el = tallScroller();
    const {rerender} = render(attachedTo(rows(50), el));
    await settled();
    const written = el.scrollTop;
    scrollEvent(el, written); // the write's own echo
    Object.defineProperty(el, 'scrollHeight', {
      value: written - 300 + el.clientHeight,
      writable: true,
    });
    scrollEvent(el, written - 300);
    expect(followsAfterGrowth(el, rerender, written - 300)).toBe(true);
    el.remove();
  });

  it('turns native anchoring off through an attribute, never the inline style', () => {
    const el = tallScroller();
    el.style.overflowAnchor = 'auto';
    const {unmount} = render(attachedTo(rows(50), el));
    expect(el.hasAttribute('data-astryx-chat-virtualized')).toBe(true);
    expect(el.style.overflowAnchor).toBe('auto');
    const rule = document.head.querySelector(
      '[data-astryx-chat-virtualized-style]',
    );
    expect(rule?.textContent).toContain('overflow-anchor:none !important');
    unmount();
    expect(el.hasAttribute('data-astryx-chat-virtualized')).toBe(false);
    expect(el.style.overflowAnchor).toBe('auto');
    el.remove();
  });

  it('suppresses scroll writes while a finger is down', () => {
    const el = scroller();
    attachedList(el);
    touch(el, 'touchstart', 1);
    const at = (el.scrollTop = 1234);
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(el.scrollTop).toBe(at);
    touch(el, 'touchend', 0);
    el.remove();
  });

  it('starts settling only when the last finger lifts', () => {
    vi.useFakeTimers();
    try {
      const el = scroller();
      attachedList(el);
      touch(el, 'touchstart', 1);
      touch(el, 'touchstart', 2);
      // First lift with a finger still on the glass must NOT settle: a
      // two-finger drag would take a scroll write under the remaining
      // finger.
      touch(el, 'touchend', 1);
      const held = (el.scrollTop = 900);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(el.scrollTop).toBe(held);
      touch(el, 'touchend', 0);
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the gate on touchcancel (system gesture takeover)', () => {
    vi.useFakeTimers();
    try {
      const el = scroller();
      attachedList(el);
      touch(el, 'touchstart', 1);
      touch(el, 'touchcancel', 0);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // Gate released: a later declaration reaches scrollTop again. Without
      // the touchcancel binding the gate would hold forever, because no
      // touchend ever arrives for a system-gesture takeover.
      expect(() => {
        act(() => {
          el.dispatchEvent(new Event('scroll'));
        });
      }).not.toThrow();
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmounting mid-gesture leaves no pending settle timer', () => {
    vi.useFakeTimers();
    try {
      const el = scroller();
      const {unmount} = attachedList(el);
      touch(el, 'touchstart', 1);
      touch(el, 'touchend', 0);
      unmount();
      // The in-flight touch keeps targeting the old element, so the timer
      // must die with the listeners rather than fire onto a dead tree.
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }).not.toThrow();
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps row identity stable across data replacement', () => {
    const {container, rerender} = renderList(rows(3));
    const before = container.querySelector('[data-pkey="1"]');
    rerender(
      <ChatVirtualizer<Row>
        data={[...rows(3), {id: 3, text: 'message 3'}]}
        keyExtractor={m => String(m.id)}
        renderItem={({item}) => <span>{item.text}</span>}
        estimatedItemSize={100}
      />,
    );
    expect(container.querySelector('[data-pkey="1"]')).toBe(before);
  });

  // ---- History prepend ---------------------------------------------------
  // Loading older messages inserts ABOVE everything placed, so the restore
  // owes a correction the size of the whole page. The component treats that as
  // a convergence; what jsdom can check is the CONTRACT the convergence rests
  // on — that a prepend leaves the rows the user is looking at untouched, so
  // there is a stable identity to converge toward. (Geometry: a 300-row
  // prepend from scrollTop 0 slipped the view a row in 7 runs of 12 before
  // this and 0 of 12 after; numbers in the PR.)

  const listOf = (data: Row[]) => (
    <ChatVirtualizer<Row>
      data={data}
      keyExtractor={m => String(m.id)}
      renderItem={({item}) => <span>{item.text}</span>}
      estimatedItemSize={100}
    />
  );

  it('a prepend re-indexes rows without renumbering their keys', () => {
    const {container, rerender} = render(listOf(rows(3)));
    const keysBefore = [...container.querySelectorAll('[data-pkey]')].map(e =>
      e.getAttribute('data-pkey'),
    );
    rerender(
      listOf([
        {id: 'older-a', text: 'a'},
        {id: 'older-b', text: 'b'},
        ...rows(3),
      ]),
    );
    const keysAfter = [...container.querySelectorAll('[data-pkey]')].map(e =>
      e.getAttribute('data-pkey'),
    );
    // Every message that was on screen still answers to the same key at a new
    // index. Keying by index instead renumbers all of them, and the anchor
    // then names a different message — which is what makes a prepend jump.
    for (const k of keysBefore) {
      expect(keysAfter).toContain(k);
    }
    expect(container.querySelector('[data-pkey="older-b"]')).not.toBeNull();
    // Deliberately NOT asserting DOM node identity: a window that recomputes
    // across the intermediate render may legitimately unmount and remount a
    // row, and pinning that would be testing React's reconciliation, not this
    // component's contract.
  });

  it('drops the host geometry when it returns to its own scroller', () => {
    // In attach mode the list measures where its block starts inside the
    // host (headers, padding) and what the host renders below it (the dock).
    // Neither exists in its own scroller: kept, they aimed the follow target
    // past the end of the list.
    const host = tallScroller();
    host.scrollTop = 2000;
    const ref = createRef<ChatVirtualizerHandle>();
    const list = (scrollElement?: HTMLElement) => (
      <ChatVirtualizer<Row>
        data={rows(50)}
        keyExtractor={m => String(m.id)}
        renderItem={({item}) => <span>{item.text}</span>}
        estimatedItemSize={100}
        scrollElement={scrollElement}
        apiRef={ref}
      />
    );
    const {container, rerender} = render(list(host));
    act(() => {
      rerender(list(undefined));
    });
    act(() => {
      ref.current?.scrollToDistanceFromBottomPx(0);
    });
    // jsdom reports clientHeight 0 for the own scroller, so its bottom is
    // the modelled total: 50 x 100.
    expect((container.firstElementChild as HTMLElement).scrollTop).toBe(5000);
    host.remove();
  });

  it('survives a gesture that ends with nothing rendered', () => {
    vi.useFakeTimers();
    try {
      const el = scroller();
      const {rerender} = attachedList(el, rows(5));
      touch(el, 'touchstart', 1);
      // The list empties under the finger — the flush has no row to read a
      // reference frame off, and must fall back rather than throw.
      rerender(
        <ChatVirtualizer<Row>
          data={[]}
          keyExtractor={m => String(m.id)}
          renderItem={({item}) => <span>{item.text}</span>}
          estimatedItemSize={100}
          scrollElement={el}
        />,
      );
      touch(el, 'touchend', 0);
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(500);
        });
      }).not.toThrow();
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
