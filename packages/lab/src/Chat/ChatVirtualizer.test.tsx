// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest';
import {render, act, screen, waitFor} from '@testing-library/react';
import {createRef, useLayoutEffect} from 'react';
import {TOUCH_QUERY} from '@astryxdesign/core/internal/touch';
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
      getRowKey={m => String(m.id)}
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
      getRowKey: (m: Row) => m.id as unknown as string,
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
        getRowKey={m => String(m.id)}
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

  it('exposes the declaration handle via handleRef', () => {
    const ref = createRef<ChatVirtualizerHandle>();
    renderList(rows(3), {handleRef: ref});
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

  // A phone: Core's finger-scroll watch listens only where the primary
  // pointer is coarse.
  let restorePointer: () => void = () => {};
  beforeEach(() => {
    const matchMedia = window.matchMedia;
    const coarse = {
      matches: true,
      media: TOUCH_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
    window.matchMedia = (media: string) =>
      media.trim() === TOUCH_QUERY ? coarse : matchMedia(media);
    restorePointer = () => {
      window.matchMedia = matchMedia;
    };
  });
  afterEach(() => {
    restorePointer();
  });

  /** A finger landing on (`down`) or lifting from the scroller's content. */
  const finger = (el: HTMLElement, type: string, down: boolean): void => {
    const target = el.firstElementChild ?? el;
    const e = new Event(type, {bubbles: true, cancelable: true});
    const entry = {identifier: 1, clientX: 5, clientY: 5, target};
    Object.defineProperty(e, 'changedTouches', {value: [entry]});
    Object.defineProperty(e, 'touches', {value: down ? [entry] : []});
    act(() => {
      target.dispatchEvent(e);
    });
  };
  /** The finger scrolls the scroller to `at`. */
  const fingerScrollTo = (el: HTMLElement, at: number): void => {
    el.scrollTop = at;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
  };
  /** The finger lifts and its scroll (momentum included) ends. */
  const fingerScrollEnds = (el: HTMLElement): void => {
    finger(el, 'touchend', false);
    act(() => {
      el.dispatchEvent(new Event('scrollend'));
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
      getRowKey={m => String(m.id)}
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

  // ---- How often layout is read (FR4) ----------------------------------------
  // jsdom has no layout, so the trace counts what forces one in a browser: a
  // read of scroll geometry, a rect or a row size after a write to a spacer
  // or to scrollTop. Each such write-then-read turn is one forced layout.
  const traceLayout = () => {
    const ops: Array<'W' | 'R' | 'C'> = [];
    // A scroller like tallScroller whose size reads are traced.
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => {
        ops.push('C');
        return 400;
      },
    });
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => {
        ops.push('R');
        return 1e6;
      },
    });
    document.body.appendChild(el);
    const restore: Array<() => void> = [];
    const wrap = (
      target: object,
      prop: string,
      onGet: 'R' | 'C' | null,
      onSet: boolean,
    ): void => {
      let owner: object | null = target;
      let desc: PropertyDescriptor | undefined;
      while (owner !== null && desc === undefined) {
        desc = Object.getOwnPropertyDescriptor(owner, prop);
        owner = desc === undefined ? Object.getPrototypeOf(owner) : owner;
      }
      if (desc === undefined) {
        throw new Error(`no ${prop}`);
      }
      const original = desc;
      let stored = original.value;
      Object.defineProperty(target, prop, {
        configurable: true,
        get(this: unknown) {
          if (onGet !== null) {
            ops.push(onGet);
          }
          return original.get ? original.get.call(this) : stored;
        },
        set(this: unknown, value: unknown) {
          if (onSet) {
            ops.push('W');
          }
          if (original.set) {
            original.set.call(this, value);
          } else {
            stored = value;
          }
        },
      });
      restore.push(() => {
        if (Object.getOwnPropertyDescriptor(target, prop) !== undefined) {
          delete (target as Record<string, unknown>)[prop];
        }
        if (owner === target) {
          Object.defineProperty(target, prop, original);
        }
      });
    };
    wrap(el, 'scrollTop', 'R', true);
    wrap(HTMLElement.prototype, 'offsetHeight', 'R', false);
    wrap(CSSStyleDeclaration.prototype, 'height', null, true);
    wrap(CSSStyleDeclaration.prototype, 'minHeight', null, true);
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      ops.push('R');
      return rect.call(this);
    };
    restore.push(() => {
      Element.prototype.getBoundingClientRect = rect;
    });
    return {
      el,
      ops,
      /** Write-then-read turns: the layouts a browser would be forced to run. */
      forcedLayouts: (): number => {
        let turns = 0;
        let lastWasWrite = false;
        for (const op of ops) {
          if (op === 'W') {
            lastWasWrite = true;
          } else if (lastWasWrite) {
            turns++;
            lastWasWrite = false;
          }
        }
        return turns;
      },
      // One read of the scroller's size per pass or scroll event.
      sizeReads: (): number => ops.filter(op => op === 'C').length,
      stop: (): void => {
        for (const undo of restore.reverse()) {
          undo();
        }
      },
    };
  };

  it('forces at most two layouts per correction pass, and none in the scroll handler', async () => {
    const trace = traceLayout();
    const {el} = trace;
    try {
      const {rerender} = render(attachedTo(rows(60), el));
      await settled();
      trace.ops.length = 0;
      // Each correction pass reads the size once, so the passes are the size
      // reads, and each has exactly two turns: its first spacer write, then
      // its batch of reads; its last writes, then its one read back.
      const passesForceTwoLayoutsEach = (handlerSizeReads: number): void => {
        const passes = trace.sizeReads() - handlerSizeReads;
        expect(passes).toBeGreaterThan(0);
        expect(trace.forcedLayouts()).toBe(2 * passes);
        trace.ops.length = 0;
      };
      // An append while following.
      act(() => rerender(attachedTo(rows(61), el)));
      await settled();
      passesForceTwoLayoutsEach(0);
      // Scrolling up mounts other rows: one handler read, then the passes.
      // (The test's own write stands for the browser's scroll; not traced.)
      el.scrollTop = 0;
      trace.ops.length = 0;
      act(() => {
        el.dispatchEvent(new Event('scroll'));
      });
      await settled();
      passesForceTwoLayoutsEach(1);
      // An append while the reader is in history.
      act(() => rerender(attachedTo(rows(62), el)));
      await settled();
      passesForceTwoLayoutsEach(0);

      // A fling: scroll events with no commit in between. The handler reads
      // once per event and writes nothing, so it forces no layout.
      trace.ops.length = 0;
      const marks: number[] = [];
      const before = (): void => {
        marks.push(trace.ops.length);
      };
      const after = (): void => {
        marks.push(trace.ops.length);
      };
      el.addEventListener('scroll', before, {capture: true});
      el.addEventListener('scroll', after);
      try {
        for (const at of [1000, 1040, 1080, 1120]) {
          el.scrollTop = at;
          trace.ops.length = 0;
          marks.length = 0;
          act(() => {
            el.dispatchEvent(new Event('scroll'));
          });
          const inHandler = trace.ops.slice(marks[0], marks[1]);
          expect(inHandler).not.toContain('W');
          expect(inHandler.filter(op => op === 'C')).toHaveLength(1);
        }
      } finally {
        el.removeEventListener('scroll', before, {capture: true});
        el.removeEventListener('scroll', after);
      }
    } finally {
      trace.stop();
      el.remove();
    }
  });

  it('skips the correction pass for a commit that changes nothing it reads', async () => {
    const trace = traceLayout();
    const {el} = trace;
    try {
      // The same rows array: a re-render that changes nothing the list reads.
      const data = rows(60);
      const list = (label: string) => (
        <div aria-label={label}>{attachedTo(data, el)}</div>
      );
      const {rerender} = render(list('a'));
      await settled();
      await settled();
      trace.ops.length = 0;
      // A parent re-render with the same rows: its commit runs no pass.
      act(() => rerender(list('b')));
      expect(trace.sizeReads()).toBe(0);
      expect(trace.forcedLayouts()).toBe(0);
    } finally {
      trace.stop();
      el.remove();
    }
  });

  it('mounts no more than a window of rows when a large batch is appended while following', async () => {
    const el = tallScroller();
    let rendered = new Set<string>();
    const list = (data: Row[]) => (
      <ChatVirtualizer<Row>
        data={data}
        getRowKey={m => String(m.id)}
        renderItem={({item}) => {
          rendered.add(String(item.id));
          return <span>{item.text}</span>;
        }}
        estimatedItemSize={100}
        scrollElement={el}
      />
    );
    const {rerender} = render(list(rows(40)));
    await settled();
    const window = rendered.size;
    // 2,000 messages arrive at once while the list follows the newest one.
    rendered = new Set();
    act(() => rerender(list(rows(2040))));
    await settled();
    expect(rendered.size).toBeLessThanOrEqual(2 * Math.max(window, 60));
    expect(screen.getByText('message 2039')).toBeInTheDocument();
    el.remove();
  });

  it('mounts at most a window of rows when a large batch arrives while the reader is in history', async () => {
    const el = tallScroller();
    const {container, rerender} = render(attachedTo(rows(60), el));
    await settled();
    scrollEvent(el, 0);
    await settled();
    const window = container.querySelectorAll('[data-pkey]').length;
    act(() => rerender(attachedTo(rows(2060), el)));
    expect(
      container.querySelectorAll('[data-pkey]').length,
    ).toBeLessThanOrEqual(2 * window);
    // The newest message is among the ones that mount.
    expect(screen.getByText('message 2059')).toBeInTheDocument();
    // A second batch and then single arrivals, still in history: the mounted
    // arrivals stay one window's worth of the newest rows.
    act(() => rerender(attachedTo(rows(4060), el)));
    expect(
      container.querySelectorAll('[data-pkey]').length,
    ).toBeLessThanOrEqual(2 * window);
    for (const n of [4061, 4062, 4063]) {
      act(() => rerender(attachedTo(rows(n), el)));
    }
    expect(
      container.querySelectorAll('[data-pkey]').length,
    ).toBeLessThanOrEqual(2 * window);
    expect(screen.getByText('message 4062')).toBeInTheDocument();
    el.remove();
  });

  it('mounts no extra rows when another thread replaces the rows while the reader is in history', async () => {
    const el = tallScroller();
    const thread = (prefix: string, n: number): Row[] =>
      Array.from({length: n}, (_, i) => ({
        id: `${prefix}${i}`,
        text: `${prefix} message ${i}`,
      }));
    // Every row rendered, to see the largest commit.
    let rendered = new Set<string>();
    const list = (data: Row[]) => (
      <ChatVirtualizer<Row>
        data={data}
        getRowKey={m => String(m.id)}
        renderItem={({item}) => {
          rendered.add(String(item.id));
          return <span>{item.text}</span>;
        }}
        estimatedItemSize={100}
        scrollElement={el}
      />
    );
    const {container, rerender} = render(list(thread('a', 3000)));
    await settled();
    await settled();
    scrollEvent(el, 0);
    await settled();
    // The reader is in history: the thread's tail is not mounted.
    expect(screen.queryByText('a message 2999')).toBeNull();
    expect(screen.getByText('a message 0')).toBeInTheDocument();
    const mountedInHistory = container.querySelectorAll('[data-pkey]').length;
    // Another thread replaces the rows: none of it is a tail arrival, so no
    // commit renders more than a window's worth of rows, not the whole thread.
    rendered = new Set();
    act(() => rerender(list(thread('b', 3000))));
    await settled();
    expect(rendered.size).toBeLessThanOrEqual(
      2 * Math.max(mountedInHistory, 60),
    );
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
    expect(el.getAttribute('data-astryx-scroll-anchoring')).toBe('off');
    expect(el.style.overflowAnchor).toBe('auto');
    const rule = document.head.querySelector(
      '[data-astryx-scroll-anchoring="rule"]',
    );
    expect(rule?.textContent).toContain('overflow-anchor:none !important');
    unmount();
    expect(el.hasAttribute('data-astryx-scroll-anchoring')).toBe(false);
    expect(el.style.overflowAnchor).toBe('auto');
    el.remove();
  });

  it('suppresses scroll writes while a finger scrolls, momentum included', () => {
    const el = scroller();
    const handle = createRef<ChatVirtualizerHandle>();
    renderList(rows(50), {scrollElement: el, handleRef: handle});
    finger(el, 'touchstart', true);
    fingerScrollTo(el, 1234);
    // A declaration while the finger owns the viewport writes nothing.
    act(() => handle.current?.scrollToDistanceFromBottomPx(0));
    expect(el.scrollTop).toBe(1234);
    // The lift starts the momentum: still the finger's.
    finger(el, 'touchend', false);
    act(() => handle.current?.scrollToDistanceFromBottomPx(0));
    expect(el.scrollTop).toBe(1234);
    el.remove();
  });

  it('hands the viewport back when the finger scroll ends', () => {
    const el = scroller();
    const handle = createRef<ChatVirtualizerHandle>();
    renderList(rows(50), {scrollElement: el, handleRef: handle});
    finger(el, 'touchstart', true);
    fingerScrollTo(el, 1234);
    fingerScrollEnds(el);
    act(() => handle.current?.scrollToDistanceFromBottomPx(0));
    expect(el.scrollTop).not.toBe(1234);
    el.remove();
  });

  it('opens no gate for a scroll with no finger down', () => {
    const el = scroller();
    const handle = createRef<ChatVirtualizerHandle>();
    renderList(rows(50), {scrollElement: el, handleRef: handle});
    fingerScrollTo(el, 1234);
    act(() => handle.current?.scrollToDistanceFromBottomPx(0));
    expect(el.scrollTop).not.toBe(1234);
    el.remove();
  });

  it('unmounting mid-gesture leaves nothing pending', () => {
    const el = scroller();
    const {unmount} = attachedList(el);
    finger(el, 'touchstart', true);
    fingerScrollTo(el, 1500);
    unmount();
    expect(() => {
      fingerScrollEnds(el);
    }).not.toThrow();
    el.remove();
  });

  it('keeps row identity stable across data replacement', () => {
    const {container, rerender} = renderList(rows(3));
    const before = container.querySelector('[data-pkey="1"]');
    rerender(
      <ChatVirtualizer<Row>
        data={[...rows(3), {id: 3, text: 'message 3'}]}
        getRowKey={m => String(m.id)}
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
      getRowKey={m => String(m.id)}
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
        getRowKey={m => String(m.id)}
        renderItem={({item}) => <span>{item.text}</span>}
        estimatedItemSize={100}
        scrollElement={scrollElement}
        handleRef={ref}
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
      finger(el, 'touchstart', true);
      fingerScrollTo(el, 300);
      // The list empties under the finger — the flush has no row to read a
      // reference frame off, and must fall back rather than throw.
      rerender(
        <ChatVirtualizer<Row>
          data={[]}
          getRowKey={m => String(m.id)}
          renderItem={({item}) => <span>{item.text}</span>}
          estimatedItemSize={100}
          scrollElement={el}
        />,
      );
      expect(() => {
        fingerScrollEnds(el);
        act(() => {
          vi.advanceTimersByTime(500);
        });
      }).not.toThrow();
      el.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- Keyboard and assistive technology ----------------------------------

  it('names its own scroller as a group keyboard users can reach', () => {
    const {container, rerender} = renderList(rows(3));
    const own = container.firstElementChild as HTMLElement;
    expect(own.getAttribute('role')).toBe('group');
    expect(own.getAttribute('aria-label')).toBe('Messages');
    rerender(
      <ChatVirtualizer<Row>
        data={rows(3)}
        getRowKey={m => String(m.id)}
        renderItem={({item}) => <span>{item.text}</span>}
        estimatedItemSize={100}
        label="Support thread"
      />,
    );
    expect(own.getAttribute('aria-label')).toBe('Support thread');
  });

  it('keeps a focused row mounted while the window moves away from it', async () => {
    const el = tallScroller();
    const {container} = render(
      <ChatVirtualizer<Row>
        data={rows(60)}
        getRowKey={m => String(m.id)}
        renderItem={({item}) => <button type="button">{item.text}</button>}
        estimatedItemSize={100}
        scrollElement={el}
      />,
    );
    await settled();
    const button = screen.getByRole('button', {name: 'message 58'});
    act(() => button.focus());
    // Scroll to the top: row 58 leaves the window.
    scrollEvent(el, 0);
    await settled();
    expect(button.isConnected).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(screen.queryByRole('button', {name: 'message 50'})).toBeNull();
    // A blur with no next target while the row still holds focus keeps it.
    act(() => {
      button.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.isConnected).toBe(true);
    // Focus leaves the list: the row is no longer kept.
    act(() => button.blur());
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.isConnected).toBe(false);
    expect(container.querySelectorAll('[data-pkey]').length).toBeGreaterThan(0);
    el.remove();
  });

  it('delivers the first message of an empty transcript unmarked', async () => {
    const el = tallScroller();
    const list = (n: number) => <div role="log">{attachedTo(rows(n), el)}</div>;
    const {container, rerender} = render(list(0));
    await settled();
    const block = container.querySelector('[role="log"]')!
      .firstElementChild as HTMLElement;
    // The opening message arrives: news for the log, not busy.
    act(() => rerender(list(1)));
    expect(screen.getByText('message 0')).toBeInTheDocument();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    // The reply is news too.
    act(() => rerender(list(2)));
    expect(block.hasAttribute('aria-busy')).toBe(false);
    el.remove();
  });

  it('marks a thread loaded into an empty list, or replacing the rows, as busy for the log', async () => {
    const el = tallScroller();
    const thread = (prefix: string, n: number): Row[] =>
      Array.from({length: n}, (_, i) => ({
        id: `${prefix}${i}`,
        text: `${prefix} message ${i}`,
      }));
    const list = (data: Row[]) => <div role="log">{attachedTo(data, el)}</div>;
    const {container, rerender} = render(list([]));
    await settled();
    const block = container.querySelector('[role="log"]')!
      .firstElementChild as HTMLElement;
    // A thread loads into the empty list: its rows are history, not news.
    act(() => rerender(list(thread('a', 60))));
    expect(block.getAttribute('aria-busy')).toBe('true');
    await settled();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    // Another thread replaces the rows: history again.
    act(() => rerender(list(thread('b', 60))));
    expect(block.getAttribute('aria-busy')).toBe('true');
    await settled();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    el.remove();
  });

  it('marks the rows the window moves over as busy for the log, and new tail rows not', async () => {
    const el = tallScroller();
    const list = (n: number) => <div role="log">{attachedTo(rows(n), el)}</div>;
    const {container, rerender} = render(list(60));
    await settled();
    const block = container.querySelector('[role="log"]')!
      .firstElementChild as HTMLElement;
    expect(block.hasAttribute('aria-busy')).toBe(false);
    // A message appended at the tail while following: news for the log.
    act(() => rerender(list(61)));
    expect(block.hasAttribute('aria-busy')).toBe(false);
    // Scrolling up mounts history: busy for that commit and the next frame.
    scrollEvent(el, 0);
    expect(block.getAttribute('aria-busy')).toBe('true');
    await settled();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    el.remove();
  });

  it('mounts a message that arrives while the reader is in history, unmarked, so the log delivers it', async () => {
    const el = tallScroller();
    const withText = (n: number, last?: string) =>
      rows(n).map((row, i) =>
        last !== undefined && i === n - 1 ? {...row, text: last} : row,
      );
    const list = (data: Row[]) => <div role="log">{attachedTo(data, el)}</div>;
    const {container, rerender} = render(list(withText(60)));
    await settled();
    const block = container.querySelector('[role="log"]')!
      .firstElementChild as HTMLElement;
    // The reader scrolls up into history.
    scrollEvent(el, 0);
    await settled();
    expect(screen.queryByText('message 59')).toBeNull();
    // The history mount's busy mark has cleared.
    await waitFor(() => expect(block.hasAttribute('aria-busy')).toBe(false));
    // A reply arrives at the tail: it mounts now, and the commit is not busy.
    act(() => rerender(list(withText(61))));
    expect(screen.getByText('message 60')).toBeInTheDocument();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    // The reply streams: it stays mounted, and the update is not busy either.
    act(() => rerender(list(withText(61, 'message 60, streamed'))));
    expect(screen.getByText('message 60, streamed')).toBeInTheDocument();
    expect(block.hasAttribute('aria-busy')).toBe(false);
    await settled();
    // The rows between the window and the reply stay unmounted.
    expect(screen.queryByText('message 59')).toBeNull();
    el.remove();
  });

  it('announces a reply that arrives in history once, and no history, as the reader scrolls down to it', async () => {
    const el = tallScroller();
    const list = (n: number) => <div role="log">{attachedTo(rows(n), el)}</div>;
    const {container, rerender} = render(list(60));
    await settled();
    const log = container.querySelector('[role="log"]')!;
    const block = log.firstElementChild as HTMLElement;
    // The content starts at the top of the scroller: the top spacer sits one
    // scroll position above the scroller's top, so the window follows the
    // scroll position instead of re-anchoring to the first row.
    const topSpacer = block.firstElementChild as HTMLElement;
    topSpacer.getBoundingClientRect = () =>
      ({top: -el.scrollTop, bottom: -el.scrollTop, height: 0}) as DOMRect;
    // A polite log reads out each row added while its block is not busy.
    const readOut: string[] = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const text = node.textContent ?? '';
          if (/message \d+/.test(text) && !block.hasAttribute('aria-busy')) {
            readOut.push(text);
          }
        }
      }
    });
    observer.observe(log, {childList: true, subtree: true});
    const flush = async () => {
      await act(async () => {
        await Promise.resolve();
      });
    };
    // The reader scrolls up into history.
    scrollEvent(el, 0);
    await settled();
    await waitFor(() => expect(block.hasAttribute('aria-busy')).toBe(false));
    readOut.length = 0;
    // The reply arrives at the tail and is read out.
    act(() => rerender(list(61)));
    await flush();
    expect(readOut).toEqual(['message 60']);
    readOut.length = 0;
    // The reader scrolls down through history to the reply.
    for (const at of [1500, 3000, 4500, 5700]) {
      scrollEvent(el, at);
      await flush();
      await settled();
    }
    // The window reached the reply: the row before it is mounted.
    expect(screen.getByText('message 59')).toBeInTheDocument();
    expect(screen.getByText('message 60')).toBeInTheDocument();
    // Nothing was read out on the way: not the reply again, and no history.
    expect(readOut).toEqual([]);
    observer.disconnect();
    el.remove();
  });
});
