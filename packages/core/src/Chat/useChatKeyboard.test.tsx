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
import type {ReactNode} from 'react';
import {ChatComposer} from './ChatComposer';
import {ChatLayout} from './ChatLayout';
import {
  ChatComposerInput,
  type ChatComposerInputHandle,
} from './ChatComposerInput';
import {editableToClaim} from './useChatKeyboard';
import {getKeyboardLayoutGuide} from '../keyboard/keyboardLayoutGuide';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import {
  __focusTakeoverCallersForTest,
  __resetDockRevealForTest,
  isDockLeftCovered,
} from '../keyboard/keyboardHeight';

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

describe('ChatLayout in a page that scrolls the document', () => {
  beforeEach(() => {
    // The keyboard module decides a show on a settle timer: tests script it.
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    // A phone: its primary pointer is a coarse finger.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    __resetDockRevealForTest(window);
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'visualViewport');
    Reflect.deleteProperty(navigator, 'virtualKeyboard');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetDockRevealForTest(window);
  });

  // Time on the keyboard module's settle timer, with no real wait.
  function wait(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }
  // The browser pans the visual viewport, as Safari's reveal of the dock does.
  function pan(offsetTop: number) {
    viewport.offsetTop = offsetTop;
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
  }
  // A touch event as the browser raises it, at the given points.
  function touch(type: string, points: {x: number; y: number}[]) {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const list = points.map((p, identifier) => ({
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
  // A reader's drag or fling: a finger down on the page, then up.
  function drag() {
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 5}]));
      document.dispatchEvent(touch('touchend', [{x: 5, y: 50}]));
    });
  }
  // The reader's scroll comes to rest.
  function rest() {
    act(() => {
      document.dispatchEvent(new Event('scrollend'));
    });
  }
  function wheel() {
    act(() => {
      document.dispatchEvent(new Event('wheel'));
    });
  }
  // A tap on the composer's text: whether the composer claimed it.
  function tapText(field: HTMLElement): boolean {
    const end = touch('touchend', [{x: 10, y: 10}]);
    act(() => {
      field.dispatchEvent(touch('touchstart', [{x: 10, y: 10}]));
      field.dispatchEvent(end);
    });
    return end.defaultPrevented;
  }
  // A first keyboard show where the dock stays covered, then a hide. The page
  // then knows that its browser does not pan to the dock.
  function learnCovered() {
    focusComposer();
    report(window.innerHeight - 290);
    wait(800);
    report(window.innerHeight);
  }
  // The keyboard comes up for the composer's text.
  function focusComposer() {
    const field = document.querySelector<HTMLElement>(
      '[data-testid="layout"] textarea, [data-testid="layout"] [contenteditable="true"]',
    );
    act(() => {
      field?.focus();
    });
  }

  function renderDocumentLayout(
    composer: ReactNode = (
      <div data-testid="composer">
        <textarea aria-label="Message" />
      </div>
    ),
  ) {
    const result = render(
      <ChatLayout
        data-testid="layout"
        scrollRef={{current: document.documentElement}}
        composer={composer}>
        <p>Hello</p>
      </ChatLayout>,
    );
    focusComposer();
    return result;
  }

  // Android's Remove animations: the keyboard shows in one step, and reduced
  // motion applies.
  function reduceMotion() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        query === '(pointer: coarse)' ||
        query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  it('keeps a page\u2019s learned cover through a pan to the dock after the lift, under Remove animations: the pan goes back, and the next show lifts at once', () => {
    reduceMotion();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const {container} = renderDocumentLayout();
      report(window.innerHeight - 290);
      wait(700);
      expect(isDockLeftCovered(window)).toBe(true);
      expect(layoutLift(dockOf(container))).toBe(290);
      // The browser pans to the composer after the lift, before any input.
      wait(50);
      pan(290);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(layoutLift(dockOf(container))).toBe(290);
      expect(isDockLeftCovered(window)).toBe(true);
      report(window.innerHeight);
      pan(0);
      report(window.innerHeight - 290);
      expect(layoutLift(dockOf(container))).toBe(290);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('lifts the fixed dock nothing in Safari on iOS, whose reveal pans the visual viewport to it and keeps the pan', () => {
    const {container} = renderDocumentLayout();
    // Safari's reveal: the keyboard's report comes with a pan by its height.
    viewport.offsetTop = 300;
    report(window.innerHeight - 300);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(keyboardRoom(messagesOf())).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('lifts nothing while the browser may still pan, then lifts by the cover 0.7 s after the keyboard\u2019s report, as in Firefox for Android', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(650);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(50);
    expect(layoutLift(dockOf(container))).toBe(290);
    expect(keyboardRoom(messagesOf())).toBe(290);
    expect(isDockLeftCovered(window)).toBe(true);
  });

  it('keeps the 0.7 s wait through the height reports of the keyboard\u2019s slide, then follows the keyboard\u2019s height', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 50);
    wait(100);
    report(window.innerHeight - 150);
    wait(100);
    report(window.innerHeight - 250);
    wait(450);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(50);
    expect(layoutLift(dockOf(container))).toBe(250);
    report(window.innerHeight - 290);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('restarts the wait at each pan, so a pan still under way keeps the dock down', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(500);
    pan(40);
    wait(650);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(50);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('lifts nothing when the visual viewport pans to the dock within the wait, as Safari does', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(300);
    pan(337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
  });

  it('lets a pan to the dock decide only its show, as Firefox\u2019s at 108 ms: the next show it leaves covered rises at 0.7 s and teaches the page, and the one after rises at once', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
    report(window.innerHeight);
    pan(0);
    report(window.innerHeight - 290);
    wait(699);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(1);
    expect(layoutLift(dockOf(container))).toBe(290);
    expect(isDockLeftCovered(window)).toBe(true);
    report(window.innerHeight);
    report(window.innerHeight - 290);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('never lifts and never learns in Safari, which pans to the dock at every show', () => {
    const {container} = renderDocumentLayout();
    for (const panAt of [46, 0, 384]) {
      if (panAt === 0) {
        viewport.offsetTop = 337;
        report(window.innerHeight - 337);
      } else {
        report(window.innerHeight - 337);
        wait(panAt);
        pan(337);
      }
      wait(3000);
      expect(layoutLift(dockOf(container))).toBe(0);
      expect(isDockLeftCovered(window)).toBe(false);
      expect(__focusTakeoverCallersForTest(document)).toBe(0);
      report(window.innerHeight);
      pan(0);
    }
  });

  it('lifts nothing, and learns nothing, when the dock is revealed at the report with no pan', () => {
    viewport.offsetTop = 337;
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('lifts at the 3 s cap when pans keep restarting the wait, and learns nothing from that show', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    for (let i = 1; i <= 6; i += 1) {
      wait(500);
      pan(i % 2 === 1 ? 10 : 0);
    }
    // The cap takes the cover the last pan left; the next pan moves only the
    // dock's translate until the scroll rests.
    expect(layoutLift(dockOf(container))).toBe(280);
    expect(dockOf(container).style.translate).toBe('0px -10px');
    rest();
    expect(layoutLift(dockOf(container))).toBe(290);
    expect(dockOf(container).style.translate).toBe('');
    expect(isDockLeftCovered(window)).toBe(false);
    report(window.innerHeight);
    expect(layoutLift(dockOf(container))).toBe(0);
  });

  it('after a show that left the dock covered, keeps the composer above the keyboard itself: the takeover, and a lift with no wait', () => {
    const {container} = renderDocumentLayout();
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
    learnCovered();
    expect(__focusTakeoverCallersForTest(document)).toBe(1);
    report(window.innerHeight - 290);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('after a show the browser panned to, keeps leaving the reveal to it', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(50);
    pan(337);
    report(window.innerHeight);
    pan(0);
    report(window.innerHeight - 337);
    wait(50);
    pan(337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('puts back a pan to the dock that comes after the show learned the cover, with no input since the show opened, and keeps the lift', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const {container} = renderDocumentLayout();
      report(window.innerHeight - 337);
      wait(800);
      expect(layoutLift(dockOf(container))).toBe(337);
      pan(337);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(layoutLift(dockOf(container))).toBe(337);
      expect(isDockLeftCovered(window)).toBe(true);
      expect(__focusTakeoverCallersForTest(document)).toBe(1);
      // A pan smaller than the cover is no reveal: nothing goes back.
      pan(40);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('keeps the lift, and leaves the pan, for a reveal-sized pan after a touch, as a reader\u2019s fling to the end', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const {container} = renderDocumentLayout();
      report(window.innerHeight - 290);
      wait(800);
      drag();
      pan(290);
      expect(layoutLift(dockOf(container))).toBe(290);
      expect(isDockLeftCovered(window)).toBe(true);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('keeps the lift, and leaves the pan, for a reveal-sized pan after a wheel', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      const {container} = renderDocumentLayout();
      report(window.innerHeight - 290);
      wait(800);
      wheel();
      pan(290);
      expect(layoutLift(dockOf(container))).toBe(290);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('keeps the input gate closed through a report during a drag, such as a toolbar\u2019s resize', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(800);
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 5}]));
    });
    report(window.innerHeight - 280);
    pan(280);
    expect(layoutLift(dockOf(container))).toBe(280);
    expect(isDockLeftCovered(window)).toBe(true);
  });

  it('learns nothing from a show with a touch in the wait, as a second tap before Safari\u2019s pan, and keeps that pan', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(20);
    drag();
    wait(26);
    pan(337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
    report(window.innerHeight);
    pan(0);
    // The next show decides by its own pan, and learns nothing either.
    report(window.innerHeight - 337);
    wait(46);
    pan(337);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(layoutLift(dockOf(container))).toBe(0);
  });

  it('keeps Safari\u2019s pan that came before a later tap', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(46);
    pan(337);
    wait(254);
    drag();
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('lifts a dock still covered at the wait\u2019s end after a touch in the wait, and learns nothing from that show', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(100);
    drag();
    wait(599);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(1);
    expect(layoutLift(dockOf(container))).toBe(290);
    expect(isDockLeftCovered(window)).toBe(false);
    report(window.innerHeight);
    expect(layoutLift(dockOf(container))).toBe(0);
    // The next show, with no input, learns that the dock stays covered.
    report(window.innerHeight - 290);
    wait(700);
    expect(isDockLeftCovered(window)).toBe(true);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('keeps the lift for a pan smaller than the cover', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(800);
    pan(40);
    expect(layoutLift(dockOf(container))).toBe(290);
  });

  it('never flips a page that learned the dock stays covered, at a later show', () => {
    const {container} = renderDocumentLayout();
    learnCovered();
    report(window.innerHeight - 290);
    pan(290);
    expect(layoutLift(dockOf(container))).toBe(290);
    expect(isDockLeftCovered(window)).toBe(true);
  });

  it('lifts nothing at the 3 s cap when the dock is revealed by then', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    for (let i = 1; i <= 5; i += 1) {
      wait(500);
      pan(i * 10);
    }
    // Late input keeps the last pan from deciding the show at once.
    drag();
    wait(400);
    pan(290);
    wait(100);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('follows the cover the pan leaves after the cap, so a later pan to the dock takes the lift away', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    for (let i = 1; i <= 6; i += 1) {
      wait(500);
      pan(i % 2 === 1 ? 10 : 0);
    }
    rest();
    expect(layoutLift(dockOf(container))).toBe(290);
    drag();
    pan(290);
    expect(dockOf(container).style.translate).toBe('0px 290px');
    rest();
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(dockOf(container).style.translate).toBe('');
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('follows the cover the pan leaves on the dock\u2019s translate once the reader scrolls after Firefox\u2019s own pan, and lays it out when the finger lifts and when the fling rests', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    expect(layoutLift(dockOf(container))).toBe(0);
    // A drag up the page: the browser unwinds its pan as the page scrolls.
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 300}]));
    });
    const root = document.documentElement;
    const scrollTop = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollTop',
    )!;
    let scrollReads = 0;
    Object.defineProperty(root, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        scrollReads += 1;
        return scrollTop.get!.call(this) as number;
      },
      set(this: Element, value: number) {
        scrollTop.set!.call(this, value);
      },
    });
    try {
      const lifts: number[] = [];
      const rooms: number[] = [];
      for (const [panTo, translate] of [
        [200, '0px -90px'],
        [100, '0px -190px'],
        [0, '0px -290px'],
      ] as const) {
        pan(panTo);
        expect(dockOf(container).style.translate).toBe(translate);
        lifts.push(layoutLift(dockOf(container)));
        rooms.push(keyboardRoom(messagesOf()));
      }
      // While the reader scrolls, nothing is laid out and nothing is read.
      expect(lifts).toEqual([0, 0, 0]);
      expect(rooms).toEqual([0, 0, 0]);
      expect(scrollReads).toBe(0);
      act(() => {
        document.dispatchEvent(touch('touchend', [{x: 5, y: 500}]));
      });
      expect(layoutLift(dockOf(container))).toBe(290);
      expect(keyboardRoom(messagesOf())).toBe(290);
      expect(dockOf(container).style.translate).toBe('');
      // A fling's momentum follows on the translate too, and its end lays it
      // out.
      pan(150);
      expect(dockOf(container).style.translate).toBe('0px 150px');
      expect(layoutLift(dockOf(container))).toBe(290);
      rest();
      expect(layoutLift(dockOf(container))).toBe(140);
      expect(dockOf(container).style.translate).toBe('');
    } finally {
      Reflect.deleteProperty(root, 'scrollTop');
    }
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('adds no lift while Safari keeps its pan through a scroll, and fills the cover where Safari unwinds it near the top', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 337);
    wait(46);
    pan(337);
    drag();
    act(() => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(layoutLift(dockOf(container))).toBe(0);
    pan(0);
    expect(dockOf(container).style.translate).toBe('0px -337px');
    rest();
    expect(layoutLift(dockOf(container))).toBe(337);
    pan(337);
    rest();
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(dockOf(container).style.translate).toBe('');
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('holds the dock where the layout viewport follows the pan, as in Safari on iOS, through a slow scroll to the top of the page', () => {
    // The initial containing block keeps its height; the layout viewport
    // shrinks to the visual viewport while Safari pans.
    const block = 714;
    const inner = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    const setInnerHeight = (value: number) => {
      Object.defineProperty(window, 'innerHeight', {configurable: true, value});
    };
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      get: () => block,
    });
    try {
      setInnerHeight(block);
      const {container} = renderDocumentLayout();
      // Safari's reveal: a pan by the keyboard's cover, and the layout
      // viewport shrinks to the visual viewport, so nothing is covered.
      viewport.height = 377;
      viewport.offsetTop = 337;
      setInnerHeight(377);
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      expect(layoutLift(dockOf(container))).toBe(0);
      // A slow drag toward the top: Safari unwinds its pan, and the layout
      // viewport grows by the same steps, up to the page's top.
      for (let pan = 327; pan >= 7; pan -= 10) {
        viewport.offsetTop = pan;
        setInnerHeight(block - pan);
        act(() => {
          viewport.dispatchEvent(new Event('scroll'));
        });
        if (pan === 327) {
          drag();
        }
        expect(layoutLift(dockOf(container))).toBe(0);
        expect(dockOf(container).style.translate).toBe('');
      }
      viewport.offsetTop = 0;
      setInnerHeight(block);
      act(() => {
        viewport.dispatchEvent(new Event('scroll'));
      });
      expect(layoutLift(dockOf(container))).toBe(0);
      wait(3000);
      expect(layoutLift(dockOf(container))).toBe(0);
      expect(dockOf(container).style.translate).toBe('');
      expect(isDockLeftCovered(window)).toBe(false);
    } finally {
      Reflect.deleteProperty(document.documentElement, 'clientHeight');
      if (inner != null) {
        Object.defineProperty(window, 'innerHeight', inner);
      } else {
        Reflect.deleteProperty(window, 'innerHeight');
      }
    }
  });

  it('lays out a followed pan once when a fling that pans only the visual viewport comes to rest, with no touch end', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 300}]));
    });
    pan(200);
    pan(100);
    expect(dockOf(container).style.translate).toBe('0px -190px');
    expect(layoutLift(dockOf(container))).toBe(0);
    // The fling pans the visual viewport alone: no document scroll end, and
    // the finger is still down.
    act(() => {
      viewport.dispatchEvent(new Event('scrollend'));
    });
    expect(layoutLift(dockOf(container))).toBe(190);
    expect(dockOf(container).style.translate).toBe('');
    // A later report with the pan unchanged lays out nothing more.
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(layoutLift(dockOf(container))).toBe(190);
  });

  it('lays out a followed pan at the first report after the pan stops moving, once no finger is down', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 300}]));
    });
    pan(200);
    act(() => {
      document.dispatchEvent(touch('touchend', [{x: 5, y: 500}]));
    });
    expect(layoutLift(dockOf(container))).toBe(90);
    // The fling's momentum moves the pan on, then stops.
    pan(150);
    expect(layoutLift(dockOf(container))).toBe(90);
    expect(dockOf(container).style.translate).toBe('0px -50px');
    // A report with the same pan and height, as a toolbar's resize raises.
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(layoutLift(dockOf(container))).toBe(140);
    expect(dockOf(container).style.translate).toBe('');
  });

  it('forgets a finger whose lift it never heard once the keyboard hides, so a later fling still comes to rest', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    // A finger goes down, and its lift is never heard.
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 300}]));
    });
    report(window.innerHeight);
    pan(0);
    // The next show: Firefox pans, then a wheel scrolls the page.
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    wheel();
    pan(150);
    expect(dockOf(container).style.translate).toBe('0px -140px');
    // The pan's momentum ends in an exact repeat, with no finger down.
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(layoutLift(dockOf(container))).toBe(140);
    expect(dockOf(container).style.translate).toBe('');
  });

  it('lays out nothing during a slow drag, whatever the size of each step, until the finger lifts', () => {
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 290);
    wait(108);
    pan(290);
    act(() => {
      document.dispatchEvent(touch('touchstart', [{x: 5, y: 300}]));
    });
    const lifts: number[] = [];
    for (let step = 1; step <= 10; step += 1) {
      pan(290 - step * 0.3);
      // A report with the pan where it was, while the finger is still down.
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      lifts.push(layoutLift(dockOf(container)));
    }
    expect(lifts.every(lift => lift === 0)).toBe(true);
    const translateY = Number(
      /^0px (-?[\d.]+)px$/.exec(dockOf(container).style.translate)?.[1],
    );
    expect(translateY).toBeCloseTo(-3, 5);
    act(() => {
      document.dispatchEvent(touch('touchend', [{x: 5, y: 303}]));
    });
    expect(layoutLift(dockOf(container))).toBeCloseTo(3, 5);
    expect(dockOf(container).style.translate).toBe('');
  });

  it('learns nothing from a composer show under a pinch zoom, whose pan is the reader\u2019s, and lifts the dock by the cover', () => {
    const {container} = renderDocumentLayout();
    viewport.scale = 2;
    // At a 2x zoom, a 290 px cover of the layout viewport.
    report((window.innerHeight - 290) / 2);
    wait(700);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(layoutLift(dockOf(container))).toBe(290);
    report(window.innerHeight / 2);
    viewport.scale = 1;
    report(window.innerHeight);
    expect(layoutLift(dockOf(container))).toBe(0);
    // The next show at normal zoom is the browser's again: Safari pans to the
    // dock, and the dock rises nothing.
    report(window.innerHeight - 337);
    wait(46);
    pan(337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
  });

  it('holds the lift through a caret reveal while typing: a pan with no touch or wheel never starts following the cover', () => {
    const {container} = renderDocumentLayout();
    const field = screen.getByRole('textbox', {name: 'Message'});
    report(window.innerHeight - 337);
    wait(20);
    // In the browser's own reveal: a caret pan, then the pan to the dock.
    pan(120);
    pan(337);
    expect(layoutLift(dockOf(container))).toBe(0);
    // Typing raises key and input events, which are no touch or wheel.
    act(() => {
      field.dispatchEvent(
        new KeyboardEvent('keydown', {key: 'a', bubbles: true}),
      );
      field.dispatchEvent(new Event('input', {bubbles: true}));
    });
    pan(317);
    expect(layoutLift(dockOf(container))).toBe(0);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
  });

  it('decides nothing at a show for a field outside the composer, and lifts the dock by the cover the pan leaves', () => {
    const {container} = render(
      <>
        <input aria-label="Search" />
        <ChatLayout
          data-testid="layout"
          scrollRef={{current: document.documentElement}}
          composer={
            <div data-testid="composer">
              <textarea aria-label="Message" />
            </div>
          }>
          <p>Hello</p>
        </ChatLayout>
      </>,
    );
    act(() => {
      screen.getByRole('textbox', {name: 'Search'}).focus();
    });
    report(window.innerHeight - 337);
    expect(layoutLift(dockOf(container))).toBe(337);
    pan(100);
    expect(dockOf(container).style.translate).toBe('0px 100px');
    rest();
    expect(layoutLift(dockOf(container))).toBe(237);
    wait(3000);
    expect(isDockLeftCovered(window)).toBe(false);
    report(window.innerHeight);
    pan(0);
    expect(layoutLift(dockOf(container))).toBe(0);
    // The composer's own show is the browser's again: Safari pans to the dock.
    focusComposer();
    report(window.innerHeight - 337);
    wait(46);
    pan(337);
    wait(3000);
    expect(layoutLift(dockOf(container))).toBe(0);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
  });

  it('leaves the composer\u2019s tap to the browser until a show finds the dock covered, then claims it', () => {
    renderDocumentLayout();
    const field = screen.getByRole('textbox', {name: 'Message'});
    act(() => {
      field.blur();
    });
    expect(tapText(field)).toBe(false);
    learnCovered();
    act(() => {
      field.blur();
    });
    expect(tapText(field)).toBe(true);
  });

  it('keeps the browser\u2019s reveal for the input\u2019s focus() until a show finds the dock covered', () => {
    let handle: ChatComposerInputHandle | null = null;
    const {container} = renderDocumentLayout(
      <ChatComposer
        onSubmit={() => {}}
        input={
          <ChatComposerInput
            handleRef={h => {
              handle = h;
            }}
          />
        }
      />,
    );
    const editable = container.querySelector<HTMLElement>(
      '[contenteditable="true"]',
    )!;
    const focus = vi.spyOn(editable, 'focus');
    act(() => handle!.focus());
    expect(focus).toHaveBeenLastCalledWith();
    act(() => {
      editable.blur();
    });
    learnCovered();
    act(() => handle!.focus());
    expect(focus).toHaveBeenLastCalledWith({preventScroll: true});
  });

  it('leaves the browser\u2019s pan to the dock in place until a show finds the dock covered, then puts a reveal pan back', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    try {
      renderDocumentLayout();
      const field = screen.getByRole('textbox', {name: 'Message'});
      act(() => {
        field.focus();
      });
      // Safari's reveal: no put-back.
      report(window.innerHeight - 337);
      wait(50);
      pan(337);
      expect(scrollIntoView).not.toHaveBeenCalled();
      report(window.innerHeight);
      pan(0);
      // A page whose browser leaves the dock covered: a reveal pan goes back.
      __resetDockRevealForTest(window);
      learnCovered();
      report(window.innerHeight - 290);
      pan(290);
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('learns per window: what one page found never changes another', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    try {
      renderDocumentLayout();
      learnCovered();
      expect(isDockLeftCovered(window)).toBe(true);
      expect(isDockLeftCovered(frame.contentWindow!)).toBe(false);
    } finally {
      frame.remove();
    }
  });

  it('leaves the composer\u2019s focus to Safari there: no focus takeover and no composer group', () => {
    renderDocumentLayout();
    const region = screen.getByTestId('composer').parentElement!.parentElement!;
    expect(__focusTakeoverCallersForTest(document)).toBe(0);
    expect(region.getAttribute('role')).toBeNull();
  });

  it('keeps the lift and the focus takeover for a scrollRef on an inner scroller, in Safari on iOS too', () => {
    const scroller = document.createElement('div');
    document.body.append(scroller);
    try {
      const {container} = render(
        <ChatLayout
          data-testid="layout"
          scrollRef={{current: scroller}}
          composer={
            <div data-testid="composer">
              <textarea aria-label="Message" />
            </div>
          }>
          <p>Hello</p>
        </ChatLayout>,
      );
      expect(__focusTakeoverCallersForTest(document)).toBe(1);
      report(window.innerHeight - 300);
      expect(layoutLift(dockOf(container))).toBe(300);
      expect(isDockLeftCovered(window)).toBe(false);
    } finally {
      scroller.remove();
    }
  });

  it('lifts the fixed dock by the keyboard with the VirtualKeyboard API, as in Chrome on Android, and never watches the dock there', async () => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: {overlaysContent: false},
    });
    const {container} = renderDocumentLayout();
    report(window.innerHeight - 300);
    await settle();
    expect(layoutLift(dockOf(container))).toBe(300);
    expect(keyboardRoom(messagesOf())).toBe(300);
    pan(300);
    expect(isDockLeftCovered(window)).toBe(false);
    expect(__focusTakeoverCallersForTest(document)).toBe(1);
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
