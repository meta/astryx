// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listLayoutUpdates.test.tsx
 * @input vitest, List and ListItem, `useAnimatedLayout`, a stubbed layout
 *   (each row 40 px tall in DOM order) and a recording `Element.animate`
 * @output Unit proofs for List's row updates through its `animatedLayout`
 *   handle. They cover what glides and how far, which row enters, which row
 *   comes back for its exit, and when the list changes at once.
 * @position Unit tests for List/listLayoutUpdates.ts. The motion itself is
 *   proven in List/__tests__/ListUpdates.interaction.browser.spec.ts.
 */

import {StrictMode, use, useRef, useState} from 'react';
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {List} from './List';
import {ListItem} from './ListItem';
import {useAnimatedLayout} from '../hooks/useAnimatedLayout';
import {ListContext} from './ListContext';

interface Played {
  readonly element: Element;
  keyframes: Keyframe[];
  readonly animation: Animation;
  isCancelled?: boolean;
  finishers?: (() => void)[];
}

let played: Played[] = [];
const originalAnimate = Element.prototype.animate;
const originalRect = Element.prototype.getBoundingClientRect;
const originalGetAnimations = Element.prototype.getAnimations;
const offsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight',
);

const ROW = 40;

/**
 * A layout where each row is 40 px tall, in the list's current DOM order. A
 * row with a negative end margin, an exit giving up its space, keeps its
 * place but takes none.
 */
function rectOf(element: Element): DOMRect {
  if (element.id === 'area') {
    return new DOMRect(0, 0, 400, 600);
  }
  const list = document.querySelector('ul');
  if (list == null) {
    return new DOMRect(0, 0, 0, 0);
  }
  const takes = (row: Element) => {
    const {style} = row as HTMLElement;
    return style.position === 'absolute' || style.marginBlockEnd.startsWith('-')
      ? 0
      : ROW;
  };
  if (element.parentElement === list) {
    // The rows before it, summed without copying the list (the linear-work
    // case below counts copies).
    let top = 0;
    for (
      let row = list.firstElementChild;
      row != null && row !== element;
      row = row.nextElementSibling
    ) {
      top += takes(row);
    }
    // A row's own translation, such as a swipe's, moves its box sideways.
    const shift = /translate\((-?[\d.]+)px/.exec(
      (element as HTMLElement).style.transform,
    );
    return new DOMRect(Number(shift?.[1] ?? 0), top, 400, ROW);
  }
  if (element !== list && element.id !== 'after') {
    return new DOMRect(0, 0, 0, 0);
  }
  let height = 0;
  for (
    let row = list.firstElementChild;
    row != null;
    row = row.nextElementSibling
  ) {
    height += takes(row);
  }
  return element === list
    ? new DOMRect(0, 0, 400, height)
    : new DOMRect(0, height, 400, ROW);
}

beforeEach(() => {
  played = [];
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  ) {
    const entry = {
      element: this,
      keyframes: keyframes as Keyframe[],
    } as Played;
    const animation = {
      cancel: () => {
        entry.isCancelled = true;
      },
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'finish') {
          (entry.finishers ??= []).push(listener);
        }
      },
      finished: new Promise(() => undefined),
      currentTime: 0,
      effect: {
        getKeyframes: () => entry.keyframes,
        setKeyframes: (next: Keyframe[]) => {
          entry.keyframes = next;
        },
      },
    } as unknown as Animation;
    played.push(Object.assign(entry, {animation}));
    return animation;
  };
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectOf(this);
  };
  // The animations played on an element, still running (they never finish
  // here).
  Element.prototype.getAnimations = function (this: Element) {
    return played
      .filter(entry => entry.element === this)
      .map(entry => entry.animation);
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement?.tagName === 'UL' ? ROW : 0;
    },
  });
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  Element.prototype.getBoundingClientRect = originalRect;
  Element.prototype.getAnimations = originalGetAnimations;
  if (offsetHeight != null) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
  }
  vi.restoreAllMocks();
});

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** The vertical start of each glide played, by the row's text or id. */
function glides(): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of played) {
    const first = String(entry.keyframes[0]?.translate ?? '');
    const match = /^(-?[\d.e+-]+)px\s+(-?[\d.e+-]+)px/.exec(first);
    if (match == null) {
      continue;
    }
    const element = entry.element as HTMLElement;
    // A reveal's parts slide inside their row: only rows and the content
    // after the list glide.
    if (element.tagName !== 'LI' && element.id === '') {
      continue;
    }
    out.set(
      element.id !== '' ? element.id : (element.textContent ?? '').trim(),
      Math.round(Number(match[2])),
    );
  }
  return out;
}

/** Ends every motion played so far, as each one's end would. */
function endMotions(): void {
  for (const entry of [...played]) {
    for (const finish of entry.finishers ?? []) {
      finish();
    }
  }
}

/** Whether parts inside `row` play a slide. */
function slidesInside(row: Element): boolean {
  return played.some(
    entry =>
      entry.element !== row &&
      row.contains(entry.element) &&
      entry.keyframes[0]?.translate != null,
  );
}

/**
 * The rows that played an entrance (a reveal), by their text. A reveal moves
 * a clip on the row, or fades the row in while its parts slide in.
 */
function entrances(): string[] {
  return played
    .filter(
      entry =>
        entry.keyframes[0]?.clipPath != null ||
        (entry.element.tagName === 'LI' &&
          Number(entry.keyframes[0]?.opacity) === 0 &&
          slidesInside(entry.element)),
    )
    .map(entry => (entry.element.textContent ?? '').trim());
}

/**
 * Whether `row` plays a conceal: a clip that moves on it, or a fade out while
 * its parts slide out.
 */
function conceals(row: Element | undefined): boolean {
  return played.some(
    entry =>
      entry.element === row &&
      (entry.keyframes[0]?.clipPath != null ||
        (Number(entry.keyframes.at(-1)?.opacity) === 0 && slidesInside(row))),
  );
}

let setRows: (rows: string[]) => void = () => undefined;

function Demo({
  initial,
  withHandle = true,
  keyed = true,
  listStyle,
}: {
  initial: string[];
  withHandle?: boolean;
  keyed?: boolean;
  listStyle?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const [rows, set] = useState(initial);
  setRows = set;
  return (
    <div id="area" ref={containerRef}>
      <List
        animatedLayout={withHandle ? animatedLayout : undefined}
        style={listStyle}>
        {rows.map(label => (
          <ListItem
            key={label}
            itemKey={keyed ? label : undefined}
            label={label}
          />
        ))}
      </List>
      <div id="after">After</div>
    </div>
  );
}

/** Keyed rows, then one row without an itemKey. */
function Mixed({initial}: {initial: string[]}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animatedLayout = useAnimatedLayout({containerRef});
  const [rows, set] = useState(initial);
  setRows = set;
  return (
    <div id="area" ref={containerRef}>
      <List animatedLayout={animatedLayout}>
        {rows.map(label => (
          <ListItem key={label} itemKey={label} label={label} />
        ))}
        <ListItem key="note" label="Note" />
      </List>
    </div>
  );
}

async function change(rows: string[]) {
  act(() => setRows(rows));
  await flushMicrotasks();
}

describe('List row updates through animatedLayout', () => {
  it('inserting a row at the top: the old first row and every row after it glide down from their old places, the content after the list too, and the new row enters', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['New', 'Inbox', 'Sent', 'Drafts']);
    const moved = glides();
    expect(moved.get('Inbox')).toBe(-ROW);
    expect(moved.get('Sent')).toBe(-ROW);
    expect(moved.get('Drafts')).toBe(-ROW);
    expect(moved.get('after')).toBe(-ROW);
    expect(moved.has('New')).toBe(false);
    expect(entrances()).toEqual(['New']);
  });

  it('moving the last row first: it glides up from its old place riding above the rows it crosses, and they glide down', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['Drafts', 'Inbox', 'Sent']);
    const moved = glides();
    expect(moved.get('Drafts')).toBe(2 * ROW);
    expect(moved.get('Inbox')).toBe(-ROW);
    expect(moved.get('Sent')).toBe(-ROW);
    // Nothing after the list moved: its height is the same.
    expect(moved.has('after')).toBe(false);
    const drafts = [...document.querySelectorAll('li')].find(
      row => row.textContent?.trim() === 'Drafts',
    );
    expect(drafts).toHaveAttribute('data-astryx-travelling');
    expect(entrances()).toEqual([]);
  });

  it('a crossing row is marked only after the module has read the layout of the commit', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    const marked = () =>
      document.querySelector('li[data-astryx-travelling]') != null;
    const readsWhileMarked: string[] = [];
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (marked()) {
        readsWhileMarked.push(this.textContent?.trim() ?? this.tagName);
      }
      return rect.call(this);
    };
    try {
      await change(['Drafts', 'Inbox', 'Sent']);
    } finally {
      Element.prototype.getBoundingClientRect = rect;
    }
    expect(readsWhileMarked).toEqual([]);
    expect(marked()).toBe(true);
  });

  it('a second reorder while a row rides keeps it marked until its new glide ends', async () => {
    // As in a browser, a cancelled animation rejects its finished promise.
    const animate = Element.prototype.animate;
    const finishes = new Map<Animation, () => void>();
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const animation = animate.apply(this, args);
      const cancel = animation.cancel.bind(animation);
      let settle = (_isCancelled: boolean) => {};
      const finished = new Promise<Animation>((resolve, reject) => {
        settle = isCancelled =>
          isCancelled ? reject(new Error('cancelled')) : resolve(animation);
      });
      finished.catch(() => undefined);
      Object.assign(animation, {
        finished,
        cancel: () => {
          cancel();
          settle(true);
        },
      });
      finishes.set(animation, () => settle(false));
      return animation;
    };
    try {
      render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
      const drafts = () =>
        [...document.querySelectorAll('li')].find(
          row => row.textContent?.trim() === 'Drafts',
        );
      await change(['Drafts', 'Inbox', 'Sent']);
      expect(drafts()).toHaveAttribute('data-astryx-travelling');
      // Drafts crosses the same rows again, back down, while it still rides.
      await change(['Inbox', 'Sent', 'Drafts']);
      expect(drafts()).toHaveAttribute('data-astryx-travelling');
      const glide = drafts()?.getAnimations().at(-1);
      if (glide != null) {
        finishes.get(glide)?.();
      }
      await flushMicrotasks();
      expect(drafts()).not.toHaveAttribute('data-astryx-travelling');
    } finally {
      Element.prototype.animate = animate;
    }
  });

  it('moving the first row last: it glides down from its old place riding above the rows it crosses, and they glide up', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts', 'Spam', 'Archive']} />);
    await change(['Sent', 'Drafts', 'Spam', 'Archive', 'Inbox']);
    const moved = glides();
    expect(moved.get('Inbox')).toBe(-4 * ROW);
    for (const label of ['Sent', 'Drafts', 'Spam', 'Archive']) {
      expect(moved.get(label)).toBe(ROW);
    }
    const raised = [...document.querySelectorAll('li')]
      .filter(row => row.hasAttribute('data-astryx-travelling'))
      .map(row => row.textContent?.trim());
    expect(raised).toEqual(['Inbox']);
  });

  it('under StrictMode, an inserted row keeps nothing inline when React replays its cleanup, so it shows once its entrance ends', async () => {
    const animate = Element.prototype.animate;
    // As in a browser, an animation's commitStyles writes what it shows
    // inline: here, its first keyframe.
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = animate.call(this, keyframes, options);
      const [first = {}] = (keyframes ?? []) as Keyframe[];
      animation.commitStyles = () => {
        const {style} = this as HTMLElement;
        if (first.opacity != null) {
          style.opacity = String(first.opacity);
        }
        if (first.clipPath != null) {
          style.clipPath = String(first.clipPath);
        }
      };
      return animation;
    };
    render(
      <StrictMode>
        <Demo initial={['Inbox', 'Sent']} />
      </StrictMode>,
    );
    await change(['Inbox', 'New', 'Sent']);
    expect(entrances()).toEqual(['New']);
    // Once its entrance ends, nothing it showed stays written on it.
    act(() => endMotions());
    const added = [...document.querySelectorAll('li')].find(
      row => row.textContent?.trim() === 'New',
    );
    expect(added?.style.opacity).toBe('');
    expect(added?.style.clipPath).toBe('');
  });

  it('a row whose ref changes while rows glide keeps nothing written: React detaches its old ref, but the row stays', async () => {
    const animate = Element.prototype.animate;
    // As in a browser, an animation's commitStyles writes what it shows
    // inline: here, its first keyframe.
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = animate.call(this, keyframes, options);
      const [first = {}] = (keyframes ?? []) as Keyframe[];
      animation.commitStyles = () => {
        const {style} = this as HTMLElement;
        if (first.translate != null) {
          style.setProperty('translate', String(first.translate));
        }
        if (first.opacity != null) {
          style.setProperty('opacity', String(first.opacity));
        }
        if (first.clipPath != null) {
          style.setProperty('clip-path', String(first.clipPath));
        }
      };
      return animation;
    };
    let rerender: () => void = () => undefined;
    function WithRowRefs({initial}: {initial: string[]}) {
      const containerRef = useRef<HTMLDivElement>(null);
      const animatedLayout = useAnimatedLayout({containerRef});
      const [rows, set] = useState(initial);
      const [, setTick] = useState(0);
      setRows = set;
      rerender = () => setTick(tick => tick + 1);
      return (
        <div id="area" ref={containerRef}>
          <List animatedLayout={animatedLayout}>
            {rows.map(label => (
              // A callback ref written inline is a new ref on each render.
              <ListItem
                key={label}
                itemKey={label}
                label={label}
                ref={() => undefined}
              />
            ))}
          </List>
        </div>
      );
    }
    render(<WithRowRefs initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['Inbox', 'New', 'Sent', 'Drafts']);
    // The rows after the insert glide, and the new row enters.
    expect(glides().get('Sent')).toBe(-ROW);
    expect(entrances()).toEqual(['New']);
    // A re-render while they move, with the same rows. Once the motions end,
    // nothing they showed stays written on a row.
    act(() => rerender());
    await flushMicrotasks();
    act(() => endMotions());
    for (const row of document.querySelectorAll('li')) {
      const label = row.textContent?.trim() ?? '';
      expect(row.style.getPropertyValue('translate'), label).toBe('');
      expect(row.style.getPropertyValue('opacity'), label).toBe('');
      expect(row.style.getPropertyValue('clip-path'), label).toBe('');
    }
  });

  it('under StrictMode, a removed row still keeps what its parts showed for its exit', async () => {
    // jsdom has no KeyframeEffect, which the module reads off a row's own
    // animations.
    vi.stubGlobal('KeyframeEffect', class {});
    const animate = Element.prototype.animate;
    // As in a browser, an animation's commitStyles writes what it shows
    // inline: here, its first keyframe.
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = animate.call(this, keyframes, options);
      const [first = {}] = (keyframes ?? []) as Keyframe[];
      animation.commitStyles = () => {
        if (first.opacity != null) {
          (this as HTMLElement).style.opacity = String(first.opacity);
        }
      };
      return animation;
    };
    render(
      <StrictMode>
        <Demo initial={['Inbox', 'Sent', 'Drafts']} />
      </StrictMode>,
    );
    const rowOf = (label: string) =>
      [...document.querySelectorAll('li')].find(
        row => row.textContent?.trim() === label,
      );
    // The row runs an animation of its own, as a swipe's travel does.
    rowOf('Sent')?.animate([{opacity: 0.5}, {opacity: 0.5}], 1000);
    await change(['Inbox', 'Drafts']);
    const leaving = rowOf('Sent');
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    expect(leaving?.style.opacity).toBe('0.5');
    vi.unstubAllGlobals();
  });

  it('removing a row: it comes back where it was, inert and hidden from assistive technology, while the rows after it and the content after the list glide up into its place', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['Inbox', 'Drafts']);
    const leaving = [...document.querySelectorAll('li')].find(
      row => row.textContent?.trim() === 'Sent',
    );
    expect(leaving).toBeDefined();
    expect(leaving).toHaveAttribute('inert');
    expect(leaving).toHaveAttribute('aria-hidden', 'true');
    // It conceals on the shared motion.
    expect(conceals(leaving)).toBe(true);
    const moved = glides();
    expect(moved.get('Drafts')).toBe(ROW);
    expect(moved.get('after')).toBe(ROW);
    expect(moved.has('Inbox')).toBe(false);
  });

  it("keeps a caller's inline overflow-y, while a removal exits and after it", async () => {
    render(
      <Demo
        initial={['Inbox', 'Sent', 'Drafts']}
        listStyle={{overflowY: 'auto'}}
      />,
    );
    const list = () => document.querySelector('ul') as HTMLElement;
    expect(list().style.overflowY).toBe('auto');
    await change(['Inbox', 'Drafts']);
    // The removed row's exit is under way.
    expect(document.querySelector('li[data-astryx-leaving]')).not.toBeNull();
    expect(list().style.overflowY).toBe('auto');
    await change(['New', 'Inbox', 'Drafts']);
    expect(list().style.overflowY).toBe('auto');
  });

  it("puts the handle in List's context for its rows", () => {
    let seen: unknown = 'unset';
    function Probe() {
      seen = use(ListContext)?.animatedLayout;
      return null;
    }
    let handle: unknown = null;
    function WithHandle() {
      const containerRef = useRef<HTMLDivElement>(null);
      const animatedLayout = useAnimatedLayout({containerRef});
      handle = animatedLayout;
      return (
        <div ref={containerRef}>
          <List animatedLayout={animatedLayout}>
            <Probe />
          </List>
        </div>
      );
    }
    render(<WithHandle />);
    expect(handle).not.toBeNull();
    expect(seen).toBe(handle);
    render(
      <List>
        <Probe />
      </List>,
    );
    expect(seen).toBeUndefined();
  });

  it('removing two adjacent rows: both come back in their places, in order', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts', 'Archive']} />);
    await change(['Inbox', 'Archive']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Inbox', 'Sent', 'Drafts', 'Archive']);
    expect(
      [...document.querySelectorAll('li[data-astryx-leaving]')].map(row =>
        row.textContent?.trim(),
      ),
    ).toEqual(['Sent', 'Drafts']);
  });

  it('a reorder while a removed row still exits keeps that row at its place among the rows that stay', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam']} />);
    await change(['Inbox', 'Drafts', 'Archive', 'Spam']);
    // Sent still exits, before Drafts.
    expect(document.querySelector('li[data-astryx-leaving]')?.textContent).toBe(
      'Sent',
    );
    // React moves only its own rows, so moving Spam first would leave Sent at
    // the top of the list. One staying row came before it, so it stays second.
    await change(['Spam', 'Inbox', 'Drafts', 'Archive']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Spam', 'Sent', 'Inbox', 'Drafts', 'Archive']);
  });

  it('a removed row that still exits stays in its place when the row after it moves, or the row before it', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam']} />);
    await change(['Inbox', 'Drafts', 'Archive', 'Spam']);
    await change(['Drafts', 'Inbox', 'Archive', 'Spam']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Drafts', 'Sent', 'Inbox', 'Archive', 'Spam']);
    await change(['Inbox', 'Archive', 'Spam', 'Drafts']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Inbox', 'Sent', 'Archive', 'Spam', 'Drafts']);
  });

  it('a removal and a move in one update: the removed row comes back at its place among the rows that stay', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['Drafts', 'Inbox']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Drafts', 'Sent', 'Inbox']);
  });

  it('a removed last row that still exits stays last when the rows before it move, and new rows still land after it', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} />);
    await change(['Inbox', 'Sent']);
    await change(['Sent', 'Inbox']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Sent', 'Inbox', 'Drafts']);
    await change(['Sent', 'Inbox', 'New']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Sent', 'Inbox', 'Drafts', 'New']);
  });

  it('measuring a change keeps no list of the later rows per row: linear work in the row count', async () => {
    const labels = Array.from({length: 300}, (_, i) => `Row ${i}`);
    render(<Demo initial={labels} />);
    // Copies of a 300-row list made while the change is measured and played.
    const copies: number[] = [];
    const slice = Array.prototype.slice;
    const spy = vi.spyOn(Array.prototype, 'slice').mockImplementation(function (
      this: unknown[],
      ...args
    ) {
      if (this.length === labels.length) {
        copies.push(this.length);
      }
      return slice.apply(this, args);
    });
    try {
      await change(['New', ...labels]);
    } finally {
      spy.mockRestore();
    }
    expect(copies.length).toBeLessThan(3);
  });

  describe('a long list (`architecture:react-component-runtime` INV12)', () => {
    /** The places of rows read for one insert near the top of `length` rows. */
    async function rowReads(length: number): Promise<number> {
      const labels = Array.from({length}, (_, index) => `Row ${index}`);
      const {unmount} = render(<Demo initial={labels} />);
      let reads = 0;
      const stub = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.tagName === 'LI') {
          reads += 1;
        }
        return stub.call(this);
      };
      try {
        await change([labels[0], 'New', ...labels.slice(1)]);
      } finally {
        Element.prototype.getBoundingClientRect = stub;
      }
      unmount();
      return reads;
    }

    it('one update reads the places of the rows near the visible part only: as many for 300 rows as for 150', async () => {
      const short = await rowReads(150);
      const long = await rowReads(300);
      expect(short).toBeLessThan(300);
      expect(long - short).toBeLessThan(20);
    });

    it('the rows in view below an insert glide from their old places; a row far below does not move', async () => {
      const labels = Array.from({length: 300}, (_, index) => `Row ${index}`);
      render(<Demo initial={labels} />);
      await change([labels[0], 'New', ...labels.slice(1)]);
      const moved = glides();
      expect(moved.get('Row 1')).toBe(-ROW);
      expect(moved.get('Row 10')).toBe(-ROW);
      expect(moved.has('Row 200')).toBe(false);
      expect(entrances()).toEqual(['New']);
    });

    it('a removal near the top finds the rows that cross in one pass, not by comparing every moved row with every other', async () => {
      const labels = Array.from({length: 300}, (_, index) => `Row ${index}`);
      render(<Demo initial={labels} />);
      // Every check a predicate makes while the change is played.
      let checks = 0;
      const some = Array.prototype.some;
      vi.spyOn(Array.prototype, 'some').mockImplementation(function (
        this: unknown[],
        predicate,
        thisArg,
      ) {
        return some.call(
          this,
          (...args): boolean => {
            checks += 1;
            return Boolean(predicate.apply(thisArg, args));
          },
          thisArg,
        );
      });
      await change(labels.filter(label => label !== 'Row 1'));
      vi.restoreAllMocks();
      expect(checks).toBeLessThan(labels.length);
    });
  });

  /**
   * Swipes `swiped` 40 px left, then changes the rows to `next`. It logs each
   * read of a row's place or style, each settle, and the commit removing a
   * row, in order.
   */
  async function readsAndSettles(
    initial: string[],
    swiped: string[],
    next: string[],
  ): Promise<string[]> {
    // jsdom has no DOMMatrix: a 2D one, enough for a translation.
    class Matrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      is2D = true;
      constructor(init?: string) {
        const translate = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
          init ?? '',
        );
        if (translate != null) {
          this.e = Number(translate[1]);
          this.f = Number(translate[2]);
        }
      }
      translate(x: number, y: number) {
        const next = new Matrix();
        next.e = this.e + x;
        next.f = this.f + y;
        return next;
      }
      multiply(other: Matrix) {
        return this.translate(other.e, other.f);
      }
      toString() {
        return `matrix(1, 0, 0, 1, ${this.e}, ${this.f})`;
      }
    }
    vi.stubGlobal('DOMMatrix', Matrix);
    render(<Demo initial={initial} />);
    for (const label of swiped) {
      const row = [...document.querySelectorAll('li')].find(
        li => li.textContent === label,
      );
      row?.style.setProperty('transform', 'translate(-40px, 0px)');
    }
    const log: string[] = [];
    const inRow = (element: Element) => element.closest('li') != null;
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudo) => {
        if (inRow(element)) {
          log.push('read');
        }
        return getComputedStyle(element, pseudo);
      },
    );
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (inRow(this)) {
        log.push('read');
      }
      return rect.call(this);
    };
    const rows = new WeakSet<CSSStyleDeclaration>();
    for (const row of document.querySelectorAll('li')) {
      rows.add(row.style);
    }
    const removeChild = Node.prototype.removeChild;
    vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <
      T extends Node,
    >(this: Node, child: T): T {
      if ((child as unknown as Element).tagName === 'LI') {
        log.push('commit');
      }
      return removeChild.call(this, child) as T;
    });
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(
      function (this: CSSStyleDeclaration, name, value, priority) {
        // A settle turns a row's own translation off.
        if (name === 'transform' && value === 'none' && rows.has(this)) {
          log.push('settle');
        }
        setProperty.call(this, name, value, priority);
      },
    );
    try {
      await change(next);
    } finally {
      Element.prototype.getBoundingClientRect = rect;
      vi.unstubAllGlobals();
    }
    return log;
  }

  it('measuring a change with swiped rows in view only reads: a row that stays keeps its translation, and nothing is settled', async () => {
    const log = await readsAndSettles(
      ['Inbox', 'Sent', 'Drafts', 'Archive'],
      ['Inbox', 'Drafts'],
      ['Inbox', 'Sent', 'New', 'Drafts', 'Archive'],
    );
    expect(log, log.join(' ')).toContain('read');
    expect(log, log.join(' ')).not.toContain('settle');
  });

  it('a swiped row that leaves settles after the commit, before any place is read again, so it costs no layout of its own', async () => {
    const log = await readsAndSettles(
      ['Inbox', 'Sent', 'Drafts', 'Archive'],
      ['Inbox', 'Drafts'],
      ['Inbox', 'Sent', 'Archive'],
    );
    const commit = log.indexOf('commit');
    const settle = log.indexOf('settle');
    expect(commit, log.join(' ')).toBeGreaterThan(0);
    expect(log.slice(0, commit), log.join(' ')).not.toContain('settle');
    expect(
      log.filter(entry => entry === 'settle'),
      log.join(' '),
    ).toHaveLength(1);
    expect(log.slice(commit, settle), log.join(' ')).not.toContain('read');
  });

  it('a swiped row that leaves while the same update moves it up glides up with the rows around it, never sideways', async () => {
    // jsdom has no DOMMatrix: a 2D one, enough for a translation.
    class Matrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      is2D = true;
      constructor(init?: string) {
        const translate = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(
          init ?? '',
        );
        if (translate != null) {
          this.e = Number(translate[1]);
          this.f = Number(translate[2]);
        }
      }
      translate(x: number, y: number) {
        const next = new Matrix();
        next.e = this.e + x;
        next.f = this.f + y;
        return next;
      }
      multiply(other: Matrix) {
        return this.translate(other.e, other.f);
      }
      toString() {
        return `translate(${this.e}px, ${this.f}px)`;
      }
    }
    vi.stubGlobal('DOMMatrix', Matrix);
    try {
      render(<Demo initial={['Inbox', 'Sent', 'Drafts', 'Archive']} />);
      const drafts = [...document.querySelectorAll('li')].find(
        li => li.textContent === 'Drafts',
      );
      drafts?.style.setProperty('transform', 'translate(-40px, 0px)');
      // Drafts leaves, and Inbox above it leaves too, so it moves a row up.
      await change(['Sent', 'Archive']);
      const glide = played.find(
        entry =>
          entry.element === drafts &&
          String(entry.keyframes[0]?.translate ?? '') !== '',
      );
      expect(String(glide?.keyframes[0]?.translate)).toBe(`0px ${ROW}px`);
      expect(glide?.isCancelled).not.toBe(true);
      // It exits settled: its box in the list, its content still swiped.
      expect(drafts?.style.transform).toBe('none');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a re-render with the same rows in the same order plays nothing', async () => {
    render(<Demo initial={['Inbox', 'Sent']} />);
    await change(['Inbox', 'Sent']);
    // Present first: both rows, in their order.
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['Inbox', 'Sent']);
    expect(played).toEqual([]);
  });

  it('without a handle, the list changes at once', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} withHandle={false} />);
    await change(['New', 'Inbox', 'Sent', 'Drafts']);
    // Present first: the change happened, the new row first.
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['New', 'Inbox', 'Sent', 'Drafts']);
    expect(played).toEqual([]);
  });

  it('a row without an itemKey changes at once: its insertion plays no entrance and reports nothing', async () => {
    render(<Demo initial={['Inbox', 'Sent', 'Drafts']} keyed={false} />);
    await change(['New', 'Inbox', 'Sent', 'Drafts']);
    // Present first: the change happened, the new row first.
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['New', 'Inbox', 'Sent', 'Drafts']);
    expect(played).toEqual([]);
  });

  it('adding the first row to an empty list: it enters, and the content after the list glides down', async () => {
    render(<Demo initial={[]} />);
    await change(['First']);
    // Present first: the row is in the list.
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['First']);
    expect(entrances()).toEqual(['First']);
    expect(glides().get('after')).toBe(-ROW);
  });

  it('adding the first keyed row beside a row without one: it enters', async () => {
    render(<Mixed initial={[]} />);
    await change(['First']);
    expect(
      [...document.querySelectorAll('li')].map(row => row.textContent?.trim()),
    ).toEqual(['First', 'Note']);
    expect(entrances()).toEqual(['First']);
  });

  it('beside rows without one, a keyed row still enters and the rows after it glide', async () => {
    render(<Mixed initial={['Inbox', 'Sent']} />);
    await change(['Inbox', 'New', 'Sent']);
    expect(entrances()).toEqual(['New']);
    const moved = glides();
    // The unkeyed row after it is content like any other: it glides.
    expect(moved.get('Sent')).toBe(-ROW);
    expect(moved.get('Note')).toBe(-ROW);
  });
});
