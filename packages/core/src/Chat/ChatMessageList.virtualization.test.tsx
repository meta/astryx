// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageList.virtualization.test.tsx
 * @input ChatMessageList's item model and windowing capability inside
 *   ChatLayout, over a scripted layout: a scroller, row sizes, a resize
 *   observer and animation frames the test controls
 * @output Window, end-anchor, row-anchor, growth, new-message, prepend,
 *   reveal, busy, focus, sentinel and scroll-in-motion assertions
 * @position Colocated tests for ChatMessageList windowing
 */
import {act, render, screen} from '@testing-library/react';
import {useRef, useState} from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {ChatLayout} from './ChatLayout';
import {ChatMessage} from './ChatMessage';
import {ChatMessageList, type ChatMessageListHandle} from './ChatMessageList';
import {useChatMessageListVirtualization} from './useChatMessageListVirtualization';
import {isFollowingNewest} from './useChatStreamScroll';

// ---------------------------------------------------------------------------
// A scripted layout. jsdom lays nothing out, so the scroller, the windowed
// body and each row report the sizes below. Rows stack in DOM order.
// ---------------------------------------------------------------------------

const layout = {
  viewport: 600,
  /** The windowed body's top in the scroller's content. */
  listTop: 40,
  /** Content after the list: its padding, the end padding and the dock. */
  trailing: 120,
  sizes: new Map<string, number>(),
  defaultSize: 100,
};
const scrollTops = new WeakMap<Element, number>();

const isScroller = (el: Element) => el.classList.contains('astryx-chat-layout');
const isBody = (el: Element) =>
  typeof el.className === 'string' &&
  el.className.includes('ChatMessageListWindow__styles.body');
const isRow = (el: Element) =>
  el.parentElement != null && isBody(el.parentElement);

function heightOf(el: Element): number {
  if (isBody(el)) {
    let total = 0;
    for (const child of el.children) {
      const gap = (child as HTMLElement).style.getPropertyValue('--x-height');
      total += gap === '' ? heightOf(child) : Number.parseFloat(gap);
    }
    return total;
  }
  if (isRow(el)) {
    const id = el.firstElementChild?.getAttribute('data-testid') ?? '';
    return layout.sizes.get(id) ?? layout.defaultSize;
  }
  return 0;
}

function body(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[class*="ChatMessageListWindow__styles.body"]',
  );
}

function scrollHeightOf(): number {
  const windowed = body();
  return (
    layout.listTop +
    (windowed == null ? 0 : heightOf(windowed)) +
    layout.trailing
  );
}

function maxScroll(): number {
  return Math.max(0, scrollHeightOf() - layout.viewport);
}

function rowTop(row: Element): number {
  let top = layout.listTop;
  let sibling = row.previousElementSibling;
  while (sibling != null) {
    const gap = (sibling as HTMLElement).style.getPropertyValue('--x-height');
    top += gap === '' ? heightOf(sibling) : Number.parseFloat(gap);
    sibling = sibling.previousElementSibling;
  }
  return top;
}

function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

const saved = new Map<string, PropertyDescriptor | undefined>();
function override(name: string, descriptor: PropertyDescriptor) {
  saved.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    ...descriptor,
  });
}

// One shared resize observer serves Core; the test delivers its entries.
const resizeCallbacks: ResizeObserverCallback[] = [];
class ScriptedResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

let intersections: {
  callback: IntersectionObserverCallback;
  targets: Element[];
}[] = [];
class ScriptedIntersectionObserver {
  readonly entry: {callback: IntersectionObserverCallback; targets: Element[]};
  constructor(callback: IntersectionObserverCallback) {
    this.entry = {callback, targets: []};
    intersections.push(this.entry);
  }
  observe(target: Element) {
    this.entry.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
}

let frames: FrameRequestCallback[] = [];

beforeAll(() => {
  override('clientHeight', {
    get(this: HTMLElement) {
      return isScroller(this) ? layout.viewport : 0;
    },
  });
  override('offsetHeight', {
    get(this: HTMLElement) {
      return isScroller(this) ? layout.viewport : 0;
    },
  });
  override('scrollHeight', {
    get(this: HTMLElement) {
      return isScroller(this) ? scrollHeightOf() : 0;
    },
  });
  override('scrollTop', {
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      if (isScroller(this)) {
        scrollTops.set(this, Math.min(maxScroll(), Math.max(0, value)));
      }
    },
  });
  override('getBoundingClientRect', {
    value(this: HTMLElement) {
      const scroller = this.closest('.astryx-chat-layout');
      const scrolled = scroller == null ? 0 : (scrollTops.get(scroller) ?? 0);
      if (isScroller(this)) {
        return rect(0, layout.viewport);
      }
      if (isBody(this)) {
        return rect(layout.listTop - scrolled, heightOf(this));
      }
      if (isRow(this)) {
        return rect(rowTop(this) - scrolled, heightOf(this));
      }
      return rect(0, 0);
    },
  });
  vi.stubGlobal('ResizeObserver', ScriptedResizeObserver);
});

afterAll(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor == null) {
      Reflect.deleteProperty(HTMLElement.prototype, name);
    } else {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
  vi.unstubAllGlobals();
});

beforeEach(() => {
  layout.viewport = 600;
  layout.sizes.clear();
  frames = [];
  intersections = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('IntersectionObserver', ScriptedIntersectionObserver);
  // Reduced motion: every follow is one jump the test can read at once.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.stubGlobal('ResizeObserver', ScriptedResizeObserver);
});

// ---------------------------------------------------------------------------
// The app under test.
// ---------------------------------------------------------------------------

interface Message {
  id: string;
}

const messages = (count: number, from = 0): Message[] =>
  Array.from({length: count}, (_, index) => ({id: `m${from + index}`}));

const renderMessage = (message: Message) => (
  <ChatMessage sender="assistant" data-testid={message.id}>
    <button type="button">{message.id}</button>
  </ChatMessage>
);
const keyOf = (message: Message) => message.id;

const controls: {
  setItems: (update: (items: Message[]) => Message[]) => void;
  handle: {current: ChatMessageListHandle | null};
} = {setItems: () => {}, handle: {current: null}};

function App({
  initial,
  scrollToTopAction,
}: {
  initial: Message[];
  scrollToTopAction?: () => Promise<void>;
}) {
  const virtualization = useChatMessageListVirtualization();
  const [items, setItems] = useState(initial);
  const handleRef = useRef<ChatMessageListHandle>(null);
  controls.setItems = setItems;
  controls.handle = handleRef;
  return (
    <ChatLayout composer={<div>composer</div>}>
      <ChatMessageList
        items={items}
        getItemKey={keyOf}
        renderItem={renderMessage}
        estimateItemSize={96}
        gap={0}
        virtualization={virtualization}
        handleRef={handleRef}
        scrollToTopAction={scrollToTopAction}
      />
    </ChatLayout>
  );
}

async function flushMicrotasks() {
  await act(async () => {});
}

async function mount(
  initial: Message[],
  scrollToTopAction?: () => Promise<void>,
) {
  const utils = render(
    <App initial={initial} scrollToTopAction={scrollToTopAction} />,
  );
  await flushMicrotasks();
  const scroller = document.querySelector<HTMLElement>('.astryx-chat-layout')!;
  return {...utils, scroller};
}

function flushFrame() {
  const pending = frames;
  frames = [];
  act(() => {
    for (const callback of pending) {
      callback(performance.now());
    }
  });
}

/** The browser's scroll event after a position change. */
async function scrolled(scroller: HTMLElement) {
  await act(async () => {
    scroller.dispatchEvent(new Event('scroll'));
  });
}

/** The reader moves the position, and the scroll ends. */
async function readerScrollsTo(scroller: HTMLElement, top: number) {
  await readerIsScrolling(scroller, top);
  await act(async () => {
    scroller.dispatchEvent(new Event('scrollend'));
  });
}

/** The reader moves the position, and the scroll goes on. */
async function readerIsScrolling(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
  await scrolled(scroller);
}

/** The browser reports new sizes for these rows. */
async function resized(ids: string[]) {
  const entries = ids.map(id => {
    const row = screen.getByTestId(id).parentElement!;
    return {
      target: row,
      borderBoxSize: [{blockSize: heightOf(row), inlineSize: 0}],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
      contentRect: rect(0, heightOf(row)),
    };
  });
  await act(async () => {
    for (const callback of resizeCallbacks) {
      callback(entries, {} as ResizeObserver);
    }
  });
}

const mountedIds = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid^="m"]')].map(
    element => element.dataset.testid,
  );

const screenTop = (id: string) =>
  screen.getByTestId(id).parentElement!.getBoundingClientRect().top;

const distanceFromEnd = (scroller: HTMLElement) =>
  scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** The first mounted row whose bottom is below the scrollport's top. */
function firstVisibleId(): string {
  for (const id of mountedIds()) {
    const top = screenTop(id!);
    if (top + heightOf(screen.getByTestId(id!).parentElement!) > 0) {
      return id!;
    }
  }
  throw new Error('no row is visible');
}

// ---------------------------------------------------------------------------

describe('ChatMessageList item model', () => {
  it('renders every item in order without virtualization, and the empty state for no items', () => {
    const {rerender} = render(
      <ChatMessageList
        items={messages(3)}
        getItemKey={keyOf}
        renderItem={renderMessage}
        emptyState="Nothing yet"
      />,
    );
    expect(mountedIds()).toEqual(['m0', 'm1', 'm2']);
    rerender(
      <ChatMessageList
        items={[] as Message[]}
        getItemKey={keyOf}
        renderItem={renderMessage}
        emptyState="Nothing yet"
      />,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });

  it('keeps the log semantics in item mode', async () => {
    await mount(messages(50));
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('tabindex', '0');
  });

  it('renders every item outside ChatLayout and warns in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Standalone() {
      const virtualization = useChatMessageListVirtualization();
      return (
        <ChatMessageList
          items={messages(30)}
          getItemKey={keyOf}
          renderItem={renderMessage}
          virtualization={virtualization}
        />
      );
    }
    render(<Standalone />);
    expect(mountedIds()).toHaveLength(30);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('only inside a ChatLayout'),
    );
    warn.mockRestore();
  });
});

describe('ChatMessageList windowing', () => {
  it('mounts about one screen of a 5,000-message conversation and opens at its end', async () => {
    const {scroller} = await mount(messages(5000));
    const ids = mountedIds();
    expect(ids.length).toBeLessThan(40);
    expect(ids.at(-1)).toBe('m4999');
    expect(distanceFromEnd(scroller)).toBe(0);
    // The scroll range stands for every message: each row that measured adds
    // its 4 px over the estimate, the rest count at the estimate.
    const measured =
      (scroller.scrollHeight - layout.listTop - layout.trailing - 5000 * 96) /
      4;
    expect(Number.isInteger(measured)).toBe(true);
    expect(measured).toBeGreaterThanOrEqual(ids.length);
    expect(measured).toBeLessThan(40);
  });

  it('keeps the end at the bottom when the scrollport gets shorter', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    layout.viewport = 420;
    await act(async () => {
      for (const callback of resizeCallbacks) {
        callback(
          [
            {
              target: scroller,
              borderBoxSize: [{blockSize: 420, inlineSize: 0}],
            } as unknown as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      }
    });
    expect(distanceFromEnd(scroller)).toBe(0);
  });

  it('opens a replaced conversation at its end', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, 2000);
    await flushMicrotasks();
    act(() => controls.setItems(() => messages(3000, 10_000)));
    await flushMicrotasks();
    expect(mountedIds().at(-1)).toBe('m12999');
    expect(distanceFromEnd(scroller)).toBe(0);
  });

  it('keeps the end in place while a row above the last one changes size', async () => {
    const {scroller} = await mount(messages(5000));
    const before = scroller.scrollTop;
    const lastTop = screenTop('m4999');
    layout.sizes.set('m4996', 300);
    await resized(['m4996']);
    expect(scroller.scrollTop).toBe(before + 200);
    expect(screenTop('m4999')).toBe(lastTop);
    expect(distanceFromEnd(scroller)).toBe(0);
  });

  it('is the stream scroll that moves: a correction never reads as the reader scrolling', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    layout.sizes.set('m4995', 40);
    await resized(['m4995']);
    await scrolled(scroller);
    expect(distanceFromEnd(scroller)).toBe(0);
    expect(isFollowingNewest(scroller)).toBe(true);
  });

  it('follows a streaming last message as it grows', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    layout.sizes.set('m4999', 420);
    await resized(['m4999']);
    expect(distanceFromEnd(scroller)).toBe(0);
  });

  it('follows an appended message while it follows the newest one', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    act(() => controls.setItems(items => [...items, {id: 'm5000'}]));
    await flushMicrotasks();
    expect(mountedIds()).toContain('m5000');
    expect(distanceFromEnd(scroller)).toBe(0);
    expect(screen.queryByRole('button', {name: 'New messages'})).toBeNull();
    // A new message is news: its commit is not marked busy.
    expect(body()).not.toHaveAttribute('aria-busy');
  });

  it('keeps the reader in history when a message arrives, and offers New messages', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 1500);
    await flushMicrotasks();
    expect(isFollowingNewest(scroller)).toBe(false);
    const reading = firstVisibleId();
    const top = screenTop(reading);
    act(() => controls.setItems(items => [...items, {id: 'm5000'}]));
    await flushMicrotasks();
    expect(screenTop(reading)).toBe(top);
    expect(
      screen.getByRole('button', {name: 'New messages'}),
    ).toBeInTheDocument();
  });

  it('keeps the reader’s row in place while a row above it changes size', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 1500);
    await flushMicrotasks();
    const reading = firstVisibleId();
    const top = screenTop(reading);
    const index = Number(reading.slice(1));
    const above = `m${index - 2}`;
    expect(mountedIds()).toContain(above);
    layout.sizes.set(above, 260);
    await resized([above]);
    expect(screenTop(reading)).toBe(top);
    expect(isFollowingNewest(scroller)).toBe(false);
    expect(screen.queryByRole('button', {name: 'New messages'})).toBeNull();
  });

  it('keeps the reader’s row in place when older messages load above it', async () => {
    const {scroller} = await mount(messages(200, 100));
    flushFrame();
    await readerScrollsTo(scroller, 3000);
    await flushMicrotasks();
    const reading = firstVisibleId();
    const top = screenTop(reading);
    const before = scroller.scrollTop;
    act(() => controls.setItems(items => [...messages(100), ...items]));
    await flushMicrotasks();
    expect(screenTop(reading)).toBe(top);
    expect(scroller.scrollTop).toBe(before + 100 * 96);
  });

  it('keeps the next message in place when the reader’s message is removed', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 1500);
    await flushMicrotasks();
    const reading = firstVisibleId();
    const top = screenTop(reading);
    const next = `m${Number(reading.slice(1)) + 1}`;
    act(() => controls.setItems(items => items.filter(m => m.id !== reading)));
    await flushMicrotasks();
    expect(mountedIds()).not.toContain(reading);
    expect(screenTop(next)).toBe(top);
  });

  it('marks rows mounted over history busy until the next frame', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 3000);
    await flushMicrotasks();
    expect(body()).toHaveAttribute('aria-busy', 'true');
    flushFrame();
    await flushMicrotasks();
    expect(body()).not.toHaveAttribute('aria-busy');
  });

  it('keeps a focused row mounted when the window moves away from it', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    const button = screen.getByRole('button', {name: 'm4999'});
    act(() => button.focus());
    await readerScrollsTo(scroller, 0);
    await flushMicrotasks();
    expect(mountedIds()).toContain('m0');
    expect(mountedIds()).toContain('m4999');
    expect(document.activeElement).toBe(button);
  });

  it('still loads older messages through the top sentinel', async () => {
    const action = vi.fn(async () => {});
    await mount(messages(5000), action);
    const sentinel = intersections.at(-1)!;
    expect(sentinel.targets).toHaveLength(1);
    await act(async () => {
      sentinel.callback(
        [{isIntersecting: true} as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe('ChatMessageList scrollToItem', () => {
  it('reveals a message that is not mounted and stops following', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    expect(mountedIds()).not.toContain('m100');
    let found = false;
    act(() => {
      found = controls.handle.current!.scrollToItem('m100');
    });
    await flushMicrotasks();
    expect(found).toBe(true);
    expect(mountedIds()).toContain('m100');
    expect(screenTop('m100')).toBe(0);
    expect(isFollowingNewest(scroller)).toBe(false);
  });

  it('keeps the revealed message at its place while the rows around it measure', async () => {
    await mount(messages(5000));
    flushFrame();
    act(() => {
      controls.handle.current!.scrollToItem('m200', {align: 'end'});
    });
    await flushMicrotasks();
    expect(screenTop('m200') + 100).toBe(layout.viewport);
    layout.sizes.set('m198', 400);
    layout.sizes.set('m200', 150);
    await resized(['m198', 'm200']);
    expect(screenTop('m200') + 150).toBe(layout.viewport);
  });

  it('returns false for a key no item has', async () => {
    await mount(messages(50));
    expect(controls.handle.current!.scrollToItem('nope')).toBe(false);
  });
});

describe('ChatMessageList windowing while the reader scrolls', () => {
  beforeEach(() => {
    // The fallback end of a scroll is a timer; the tests advance it.
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The reader scrolls into history; a row above them grows by 200 px. */
  async function growAboveWhileScrolling() {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 1500);
    await flushMicrotasks();
    const reading = firstVisibleId();
    const index = Number(reading.slice(1));
    await readerIsScrolling(scroller, scroller.scrollTop - 10);
    await flushMicrotasks();
    const top = screenTop(reading);
    const position = scroller.scrollTop;
    const above = `m${index - 2}`;
    layout.sizes.set(above, 300);
    await resized([above]);
    return {scroller, reading, top, position};
  }

  it('moves the gap instead of the position while the reader scrolls, and writes it when the scroll ends', async () => {
    const {scroller, reading, top, position} = await growAboveWhileScrolling();
    // The scroll keeps its position and momentum; the gap above took the change.
    expect(scroller.scrollTop).toBe(position);
    expect(screenTop(reading)).toBe(top);
    await act(async () => {
      scroller.dispatchEvent(new Event('scrollend'));
    });
    await flushMicrotasks();
    expect(scroller.scrollTop).toBe(position + 200);
    expect(screenTop(reading)).toBe(top);
  });

  it('writes the held change 150 ms after the last scroll event where no scrollend fires', async () => {
    const {scroller, reading, top, position} = await growAboveWhileScrolling();
    await act(async () => {
      vi.advanceTimersByTime(149);
    });
    expect(scroller.scrollTop).toBe(position);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flushMicrotasks();
    expect(scroller.scrollTop).toBe(position + 200);
    expect(screenTop(reading)).toBe(top);
  });

  it('writes a change at once when the scroll has ended', async () => {
    const {scroller} = await mount(messages(5000));
    flushFrame();
    await readerScrollsTo(scroller, scroller.scrollTop - 1500);
    await flushMicrotasks();
    const reading = firstVisibleId();
    const top = screenTop(reading);
    const position = scroller.scrollTop;
    const above = `m${Number(reading.slice(1)) - 2}`;
    layout.sizes.set(above, 300);
    await resized([above]);
    expect(scroller.scrollTop).toBe(position + 200);
    expect(screenTop(reading)).toBe(top);
  });
});
