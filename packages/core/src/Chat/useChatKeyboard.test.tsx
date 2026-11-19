// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useChatKeyboard.test.tsx
 * @input vitest, Testing Library, ChatLayout, a stand-in visual viewport
 * @output Tests ChatLayout's keyboard behavior in jsdom. It covers the dock's
 *   lift, the message area's room and the dock's ride down at a blur. It
 *   also covers the touches the composer claims, focus moves and Done's park
 *   on the composer group
 * @position Unit tests for Chat/useChatKeyboard.ts; the browser spec proves
 *   Chrome's ride
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {ChatComposer} from './ChatComposer';
import {ChatLayout} from './ChatLayout';
import {editableToClaim} from './useChatKeyboard';
import {getKeyboardLayoutGuide} from '../keyboard/keyboardLayoutGuide';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {__focusTakeoverCallersForTest} from '../keyboard/keyboardHeight';

// jsdom dates events on the epoch clock, but a browser dates them on
// performance.now()'s, which the keyboard guide reads them against.
let eventTime: {mockRestore: () => void} | null = null;

beforeEach(() => {
  eventTime = vi
    .spyOn(Event.prototype, 'timeStamp', 'get')
    .mockImplementation(() => performance.now());
});

afterEach(() => {
  eventTime?.mockRestore();
  eventTime = null;
});

type FakeViewport = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
  width?: number;
};

let viewport: FakeViewport;

function report(height: number) {
  viewport.height = height;
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
}

function dockOf(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>('[data-testid="composer"]')!
    .parentElement!.parentElement!.parentElement!;
}

function messagesOf(): HTMLElement {
  return screen.getByTestId('layout').firstElementChild as HTMLElement;
}

// The room the message area's end padding makes for the keyboard, CSS px: the
// `+ Npx` its functional style adds to the density's own padding.
function keyboardRoom(element: HTMLElement): number {
  const match = /--[\w-]+:\s*calc\([^;]*\+\s*(-?[\d.]+)px\)/.exec(
    element.getAttribute('style') ?? '',
  );
  return match == null ? 0 : Number(match[1]);
}

// The lift an element is laid out with: the value its functional style
// (a StyleX dynamic style, an inline custom property) carries, CSS px.
function layoutLift(element: HTMLElement): number {
  const match = /--[\w-]+:\s*(-?[\d.]+)px/.exec(
    element.getAttribute('style') ?? '',
  );
  return match == null ? 0 : Number(match[1]);
}

// Lets the ride end (the animator's clock) and its end reach the layout.
async function settle() {
  await act(async () => {
    const sleep = async (ms: number) =>
      new Promise(resolve => setTimeout(resolve, ms));
    // The guide publishes a report's transition within a few frames, then
    // checks it a while after its curve ends: the ride is over by then.
    await sleep(200);
    const {start, curve} = getKeyboardLayoutGuide(window).transition;
    const checked = start + (curve?.durationMs ?? 0) + 200;
    await vi.waitFor(
      () => {
        if (document.getAnimations?.().some(a => a.playState === 'running')) {
          throw new Error('still riding');
        }
        if (performance.now() < checked) {
          throw new Error('still riding');
        }
      },
      {timeout: 3000, interval: 20},
    );
    await sleep(50);
  });
}

function renderLayout() {
  const result = render(
    <ChatLayout
      data-testid="layout"
      composer={
        <div data-testid="composer">
          <textarea aria-label="Message" />
        </div>
      }>
      <p>Hello</p>
    </ChatLayout>,
  );
  // jsdom has no layout: the root fills the viewport, as a full-page chat does.
  screen.getByTestId('layout').getBoundingClientRect = () =>
    new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  return result;
}

describe('ChatLayout and the software keyboard', () => {
  // A phone: its primary pointer is a coarse finger.
  const stubPointer = (pointer: 'coarse' | 'fine') => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === `(pointer: ${pointer})`,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  };

  beforeEach(() => {
    stubPointer('coarse');
    viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    Reflect.deleteProperty(navigator, 'virtualKeyboard');
    vi.unstubAllGlobals();
  });

  // Chrome on Android: the guide publishes Gboard's slides where the
  // browser has the VirtualKeyboard API.
  const stubChromeKeyboard = () => {
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: {overlaysContent: false},
    });
  };

  it('rides nothing without the VirtualKeyboard API, as in Safari on iOS: the layout follows the height alone', async () => {
    const guide = getKeyboardLayoutGuide(window);
    const subscribe = vi.spyOn(guide, 'subscribe');
    const {container} = renderLayout();
    report(window.innerHeight - 300);
    expect(dockOf(container).style.translate).toBe('');
    await settle();
    expect(layoutLift(dockOf(container))).toBe(300);
    expect(subscribe).not.toHaveBeenCalled();
    subscribe.mockRestore();
  });

  it('attaches nothing of the ride under a fine pointer: the layout follows the height alone', async () => {
    stubPointer('fine');
    const guide = getKeyboardLayoutGuide(window);
    const subscribe = vi.spyOn(guide, 'subscribe');
    const {container} = renderLayout();
    report(window.innerHeight - 300);
    await settle();
    expect(layoutLift(dockOf(container))).toBe(300);
    expect(dockOf(container).style.translate).toBe('');
    // Nothing subscribed the keyboard layout guide.
    expect(subscribe).not.toHaveBeenCalled();
    subscribe.mockRestore();
  });

  it('lays the dock and the room after the messages out from the keyboard height', async () => {
    const {container} = renderLayout();
    report(window.innerHeight - 300);
    await settle();
    // The layout is right with no animation running. The ride's translate is
    // handed back to it: back at identity, the animator takes it off.
    expect(layoutLift(dockOf(container))).toBe(300);
    expect(keyboardRoom(messagesOf())).toBe(300);
    expect(dockOf(container).style.translate).toBe('');
  });

  it('adds no element for the keyboard: the root holds the message area and the dock', async () => {
    renderLayout();
    report(window.innerHeight - 300);
    await settle();
    // The room is the message area's end padding, not an element of its own.
    expect(screen.getByTestId('layout').children).toHaveLength(2);
  });

  it('keeps a transcript at its newest message there', async () => {
    renderLayout();
    // Past the mount's own first-frame scroll to the end.
    await settle();
    const root = screen.getByTestId('layout');
    let scrollTop = 1000 - 600;
    Object.defineProperties(root, {
      clientHeight: {configurable: true, get: () => 600},
      scrollHeight: {
        configurable: true,
        get: () => 1000 + keyboardRoom(messagesOf()),
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    report(window.innerHeight - 300);
    await settle();
    expect(scrollTop).toBe(1300 - 600);
  });

  // A transcript of 1,000 px in a 600 px root, plus the keyboard's room, that
  // the reader scrolls to `top`. The stream scroll hears each scroll.
  function scrolledTranscript(top: number) {
    const root = screen.getByTestId('layout');
    let scrollTop = 1000 - 600;
    Object.defineProperties(root, {
      clientHeight: {configurable: true, get: () => 600},
      offsetHeight: {configurable: true, get: () => 600},
      scrollHeight: {
        configurable: true,
        get: () => 1000 + keyboardRoom(messagesOf()),
      },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
    });
    // From the end, up to `top`, as a reader scrolls.
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    scrollTop = top;
    act(() => {
      root.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      root.dispatchEvent(new Event('scrollend'));
    });
    return {
      get scrollTop() {
        return scrollTop;
      },
    };
  }

  it('leaves a transcript the reader scrolled up where it is', async () => {
    renderLayout();
    // Past the mount's own first-frame scroll to the end.
    await settle();
    const transcript = scrolledTranscript(100);
    report(window.innerHeight - 300);
    await settle();
    expect(transcript.scrollTop).toBe(100);
  });

  it('keeps a reader the stream scroll still follows, 5 px above the end, at the newest message', async () => {
    renderLayout();
    await settle();
    // Within the stream scroll's lock distance, so it still follows.
    const transcript = scrolledTranscript(1000 - 600 - 5);
    report(window.innerHeight - 300);
    await settle();
    expect(transcript.scrollTop).toBe(1300 - 600);
  });

  it('rides the dock down from the blur, ahead of the layout, which follows the keyboard', async () => {
    stubChromeKeyboard();
    const {container} = renderLayout();
    const field = screen.getByRole('textbox', {name: 'Message'});
    act(() => field.focus());
    report(window.innerHeight - 300);
    await settle();
    act(() => field.blur());
    await settle();
    // The keyboard is still up (no report yet): the layout keeps its lift,
    // and the ride has taken the dock down on top of it.
    expect(layoutLift(dockOf(container))).toBe(300);
    expect(dockOf(container).style.translate).toBe('0px 300px');
    report(window.innerHeight);
    await settle();
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(keyboardRoom(messagesOf())).toBe(0);
    expect(dockOf(container).style.translate).toBe('');
  });

  it('keeps the lift when the page is pinch-zoomed past 2x with the keyboard up', async () => {
    // WebKit reports innerWidth and innerHeight in the zoomed visual
    // viewport's px. At 2x, innerHeight alone reads no keyboard, and the dock
    // would drop under it.
    try {
      vi.stubGlobal('innerHeight', 714);
      vi.stubGlobal('innerWidth', 402);
      Object.assign(viewport, {width: 402});
      const {container} = renderLayout();
      screen.getByTestId('layout').getBoundingClientRect = () =>
        new DOMRect(0, 0, 402, 714);
      report(714 - 337);
      await settle();
      expect(layoutLift(dockOf(container))).toBe(337);

      vi.stubGlobal('innerHeight', 357);
      vi.stubGlobal('innerWidth', 201);
      Object.assign(viewport, {scale: 2, width: 201});
      report((714 - 337) / 2);
      await settle();
      expect(layoutLift(dockOf(container))).toBe(337);
      expect(keyboardRoom(messagesOf())).toBe(337);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('moves nothing while no keyboard is up', async () => {
    const {container} = renderLayout();
    report(window.innerHeight);
    await settle();
    expect(dockOf(container).style.translate).toBe('');
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(keyboardRoom(messagesOf())).toBe(0);
  });
});

describe('focus moves into the composer (spec:AST-099 FR4)', () => {
  // The primary pointer `matchMedia` reports: a touch screen's coarse finger,
  // or a desktop's fine mouse.
  function primaryPointer(pointer: 'coarse' | 'fine') {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === `(pointer: ${pointer})`,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  function renderWithSearch(composerText: 'textarea' | 'contenteditable') {
    render(
      <>
        <input aria-label="Search" />
        <ChatLayout
          data-testid="layout"
          composer={
            composerText === 'textarea' ? (
              <textarea aria-label="Message" />
            ) : (
              <div
                aria-label="Message"
                contentEditable
                role="textbox"
                suppressContentEditableWarning
              />
            )
          }>
          <p>Hello</p>
        </ChatLayout>
      </>,
    );
    return {
      search: screen.getByRole('textbox', {name: 'Search'}),
      message: screen.getByRole('textbox', {name: 'Message'}),
    };
  }

  beforeEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        height: window.innerHeight,
        offsetTop: 0,
        scale: 1,
      }),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('delivers a move from another field into the composer without the browser\u2019s reveal', () => {
    primaryPointer('coarse');
    const {search, message} = renderWithSearch('textarea');
    act(() => search.focus());
    const focus = vi.spyOn(message, 'focus');
    // The keyboard's next button, Tab, or a script moving focus.
    act(() => message.focus());
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(document.activeElement).toBe(message);
  });

  it('delivers a move into contenteditable composer text the same way', () => {
    primaryPointer('coarse');
    const {search, message} = renderWithSearch('contenteditable');
    act(() => search.focus());
    const focus = vi.spyOn(message, 'focus');
    act(() => message.focus());
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
  });

  it('leaves focus moves to the browser under a mouse', () => {
    primaryPointer('fine');
    const {search, message} = renderWithSearch('textarea');
    act(() => search.focus());
    const focus = vi.spyOn(message, 'focus');
    act(() => message.focus());
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
  });

  it('moves focus to the composer group when the keyboard\u2019s Done ends entry', () => {
    primaryPointer('coarse');
    const {message} = renderWithSearch('textarea');
    const region = screen.getByRole('group');
    act(() => message.focus());
    const focus = vi.spyOn(region, 'focus');
    // Done blurs the composer's text, and focus goes to nothing.
    act(() => message.blur());
    expect(document.activeElement).toBe(region);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
  });

  it('shows the parked group\u2019s focus ring only after keyboard input (architecture:interaction-modality INV1)', () => {
    primaryPointer('coarse');
    __resetInteractionModalityForTest();
    const {message} = renderWithSearch('textarea');
    const region = screen.getByRole('group');
    // A tap on the text, then Done with nothing typed: no ring.
    fireEvent.pointerDown(message);
    act(() => message.focus());
    act(() => message.blur());
    expect(document.activeElement).toBe(region);
    expect(region.style.getPropertyValue('outline')).toBe('none');
    // The override leaves with the focus stop.
    act(() => message.focus());
    expect(region.style.getPropertyValue('outline')).toBe('');
    // Typed, then Done: the shared ring applies.
    fireEvent.keyDown(message, {key: 'a'});
    act(() => message.blur());
    expect(document.activeElement).toBe(region);
    expect(region.style.getPropertyValue('outline')).toBe('');
    __resetInteractionModalityForTest();
  });

  it('gives the composer group no name and no landmark, so two layouts on a page repeat none', () => {
    primaryPointer('coarse');
    render(
      <>
        <ChatLayout composer={<textarea aria-label="First" />}>
          <p>One</p>
        </ChatLayout>
        <ChatLayout composer={<textarea aria-label="Second" />}>
          <p>Two</p>
        </ChatLayout>
      </>,
    );
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    // The layout names none of the caller's regions.
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.hasAttribute('aria-label')).toBe(false);
      expect(group.hasAttribute('aria-labelledby')).toBe(false);
    }
  });

  it('adds no tab stop for the composer region: it takes focus only for Done\u2019s park, and gives the focus stop up as focus leaves (spec:AST-017 FR59)', () => {
    primaryPointer('coarse');
    const {message} = renderWithSearch('textarea');
    const region = screen.getByRole('group');
    // No focus target until Done parks focus there, so a tap or a click
    // beside the composer never focuses the region.
    expect(region.hasAttribute('tabindex')).toBe(false);
    act(() => message.focus());
    act(() => message.blur());
    expect(document.activeElement).toBe(region);
    expect(region.tabIndex).toBe(-1);
    act(() => message.focus());
    expect(document.activeElement).toBe(message);
    expect(region.hasAttribute('tabindex')).toBe(false);
  });

  it('leaves the composer region a plain container under a mouse: no group, no name and no focus target (spec:AST-017 FR59)', () => {
    primaryPointer('fine');
    const {message} = renderWithSearch('textarea');
    expect(screen.queryByRole('group')).toBeNull();
    const layout = screen.getByTestId('layout');
    // The composer's containers inside the layout, the region among them.
    const containers = () => {
      const list: Element[] = [];
      for (
        let element = message.parentElement;
        element != null && element !== layout;
        element = element.parentElement
      ) {
        list.push(element);
      }
      return list;
    };
    expect(
      containers().filter(
        element =>
          element.hasAttribute('role') ||
          element.hasAttribute('aria-label') ||
          element.hasAttribute('tabindex'),
      ),
    ).toEqual([]);
    act(() => message.focus());
    act(() => message.blur());
    expect(
      containers().filter(element => element.hasAttribute('tabindex')),
    ).toEqual([]);
  });

  it('leaves focus where the browser puts it when it moves on to another field', () => {
    primaryPointer('coarse');
    const {search, message} = renderWithSearch('textarea');
    act(() => message.focus());
    act(() => search.focus());
    expect(document.activeElement).toBe(search);
  });

  it('leaves a blur to nothing to the browser under a mouse', () => {
    primaryPointer('fine');
    const {message} = renderWithSearch('textarea');
    act(() => message.focus());
    act(() => message.blur());
    expect(document.activeElement).toBe(document.body);
  });

  it('registers no touch listener and installs no focus takeover under a mouse (architecture INV13, spec:AST-094 FR24)', () => {
    primaryPointer('fine');
    const touchTargets: EventTarget[] = [];
    const addEventListener = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
      function (this: EventTarget, type, listener, options) {
        if (type.startsWith('touch')) {
          touchTargets.push(this);
        }
        addEventListener.call(this, type, listener, options);
      },
    );
    renderWithSearch('textarea');
    const layout = screen.getByTestId('layout');
    // React's own root listeners sit outside the layout.
    expect(
      touchTargets.filter(
        target => target instanceof Node && layout.contains(target),
      ),
    ).toEqual([]);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
  });

  it('installs the focus takeover for each ChatLayout under a finger, through the keyboard module\u2019s one listener (spec:AST-094 FR24)', () => {
    primaryPointer('coarse');
    render(
      <>
        <ChatLayout composer={<textarea aria-label="First" />}>
          <p>Hello</p>
        </ChatLayout>
        <ChatLayout composer={<textarea aria-label="Second" />}>
          <p>Hi</p>
        </ChatLayout>
      </>,
    );
    expect(__focusTakeoverCallersForTest(document)).toBe(2);
  });
});

describe('the taps the composer claims', () => {
  // jsdom has no isContentEditable: the nearest contenteditable decides.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get(this: HTMLElement) {
        const host = this.closest('[contenteditable]');
        return host != null && host.getAttribute('contenteditable') !== 'false';
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'isContentEditable');
    document.body.innerHTML = '';
  });

  it('claims a touch on unfocused contenteditable text', () => {
    document.body.innerHTML =
      '<div contenteditable="true" id="editor"><p><span id="word">Hello</span></p></div>';
    expect(editableToClaim(document.getElementById('word'))).toBe(
      document.getElementById('editor'),
    );
  });

  it('leaves a control inside a token its own tap', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><p>Hi <span contenteditable="false" data-astryx-token=""><button id="remove">×</button><span id="label">@Ada</span></span></p></div>';
    expect(editableToClaim(document.getElementById('remove'))).toBeNull();
    expect(editableToClaim(document.getElementById('label'))).toBeNull();
  });

  it('claims an unfocused text control too, whose own tap focus the browser would reveal (FR4)', () => {
    document.body.innerHTML =
      '<textarea id="draft">A long draft</textarea><input id="line" value="One line"><input id="box" type="checkbox"><textarea id="still" inputmode="none"></textarea>';
    const draft = document.getElementById('draft');
    expect(editableToClaim(draft)).toBe(draft);
    const line = document.getElementById('line');
    expect(editableToClaim(line)).toBe(line);
    // Nothing that brings up no keyboard.
    expect(editableToClaim(document.getElementById('box'))).toBeNull();
    expect(editableToClaim(document.getElementById('still'))).toBeNull();
    // A focused one keeps its own taps: the browser moves the caret.
    draft?.focus();
    expect(editableToClaim(draft)).toBeNull();
  });

  it('claims nothing that already has focus', () => {
    document.body.innerHTML =
      '<div contenteditable="true" id="editor"><p id="text">Hello</p></div>';
    document.getElementById('editor')!.focus();
    expect(editableToClaim(document.getElementById('text'))).toBeNull();
  });
});

describe('a text control composer tapped with nothing focused (spec:AST-099 FR4)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: Object.assign(new EventTarget(), {
        height: window.innerHeight,
        offsetTop: 0,
        scale: 1,
      }),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A touch event as the browser raises it, at the given points.
  function touch(type: string, touches: {x: number; y: number}[]) {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const list = touches.map((p, identifier) => ({
      identifier,
      clientX: p.x,
      clientY: p.y,
    }));
    Object.assign(event, {
      touches: type === 'touchend' ? [] : list,
      changedTouches: list,
    });
    return event;
  }

  it('is focused without the browser\u2019s reveal, as a contenteditable composer is', () => {
    render(
      <ChatLayout
        composer={
          <ChatComposer
            onSubmit={() => {}}
            input={<textarea aria-label="Message" />}
          />
        }>
        <p>Hello</p>
      </ChatLayout>,
    );
    const textarea = screen.getByRole('textbox', {name: 'Message'});
    expect(document.activeElement).not.toBe(textarea);
    const focus = vi.spyOn(textarea, 'focus');
    const end = touch('touchend', [{x: 10, y: 10}]);
    // The tap focuses the composer, which re-renders it.
    act(() => {
      textarea.dispatchEvent(touch('touchstart', [{x: 10, y: 10}]));
      textarea.dispatchEvent(end);
    });
    expect(end.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledWith({preventScroll: true});
    expect(document.activeElement).toBe(textarea);
  });

  it('raises the claimed tap\u2019s click once, so a caller\u2019s onClick still runs', () => {
    const onClick = vi.fn();
    render(
      <ChatLayout
        composer={
          <ChatComposer
            onSubmit={() => {}}
            input={<textarea aria-label="Message" onClick={onClick} />}
          />
        }>
        <p>Hello</p>
      </ChatLayout>,
    );
    const textarea = screen.getByRole('textbox', {name: 'Message'});
    // The route cancels the tap's touchend, so the browser raises no click.
    const end = touch('touchend', [{x: 10, y: 10}]);
    act(() => {
      textarea.dispatchEvent(touch('touchstart', [{x: 10, y: 10}]));
      textarea.dispatchEvent(end);
    });
    expect(end.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('inside an iframe (spec:AST-099 FR7)', () => {
  let frame: HTMLIFrameElement | null = null;

  afterEach(() => {
    frame?.remove();
    frame = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // A touch event as the browser raises it, in the frame's own window.
  function touchEvent(
    win: Window & typeof globalThis,
    type: string,
    points: {x: number; y: number}[],
    changed = points,
  ) {
    const event = new win.Event(type, {bubbles: true, cancelable: true});
    const list = (ps: {x: number; y: number}[]) =>
      ps.map((p, identifier) => ({identifier, clientX: p.x, clientY: p.y}));
    Object.assign(event, {
      touches: list(points),
      changedTouches: list(changed),
    });
    return event;
  }

  it('leaves the composer\u2019s taps, focus and region to the browser, under a finger too', () => {
    frame = document.createElement('iframe');
    document.body.append(frame);
    const inner = frame.contentWindow as Window & typeof globalThis;
    // A touch screen: the top window has a coarse pointer too.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // A visual viewport, in a document that is not the top one; jsdom has no
    // isContentEditable, so the nearest contenteditable decides.
    Object.defineProperty(inner, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    Object.defineProperty(inner, 'visualViewport', {
      configurable: true,
      value: Object.assign(new inner.EventTarget(), {
        height: inner.innerHeight,
        offsetTop: 0,
        scale: 1,
      }),
    });
    Object.defineProperty(inner.HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get(this: HTMLElement) {
        const host = this.closest('[contenteditable]');
        return host != null && host.getAttribute('contenteditable') !== 'false';
      },
    });
    const host = inner.document.createElement('div');
    inner.document.body.append(host);
    render(
      <ChatLayout composer={<ChatComposer onSubmit={() => {}} />}>
        <p>Hello</p>
      </ChatLayout>,
      {container: host},
    );
    const editable = host.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    // The region is a plain container: Done parks nothing here.
    expect(host.querySelector('[role="group"]')).toBeNull();
    // A tap on the composer's text: the browser focuses it itself.
    editable.dispatchEvent(touchEvent(inner, 'touchstart', [{x: 10, y: 10}]));
    const end = touchEvent(inner, 'touchend', [], [{x: 10, y: 10}]);
    editable.dispatchEvent(end);
    expect(end.defaultPrevented).toBe(false);
    // The shell's empty-space tap focuses with the browser's reveal.
    const focus = vi.spyOn(editable, 'focus');
    fireEvent.click(editable.parentElement!);
    expect(focus).toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalledWith({preventScroll: true});
  });
});

describe('the ChatLayout stories', () => {
  it('give a full-page layout the dynamic viewport\u2019s height, so the composer starts on screen', () => {
    // Where a phone browser's toolbar collapses, 100vh is the viewport with
    // the toolbar hidden: 859 px for 796 visible in Firefox for Android. That
    // puts the composer under the window's bottom edge.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const stories = fs.readFileSync(
      path.join(
        here,
        '../../../../apps/storybook/stories/ChatLayout.stories.tsx',
      ),
      'utf8',
    );
    // Storybook's preview pads every story by 16 px on each side.
    expect(stories).not.toMatch(/height: '100vh'/);
    expect(stories).not.toMatch(/height: '100dvh'/);
    expect(stories).toMatch(/height: 'calc\(100dvh - 32px\)'/);
  });
});

describe('what ChatLayout loads for the keyboard', () => {
  it('imports no gesture system: the composer tap is the keyboard module\u2019s focus route', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ['ChatLayout.tsx', 'useChatKeyboard.ts']) {
      const source = fs.readFileSync(path.join(here, file), 'utf8');
      expect(source, file).not.toMatch(/from '\.\.\/gestures/);
    }
  });
});
