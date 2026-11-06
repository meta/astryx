// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transcriptDismiss.test.ts
 * @input vitest, jsdom, a stand-in visual viewport, the arena harness and the
 *   dismissal pans with timestamped contacts
 * @output Tests that a transcript drag dismisses the keyboard as it reaches
 *   the line, once, before its lift, and that flicks above it do not. It
 *   covers a cancelled touch, a touch the browser scrolls with and a zoomed
 *   page. It also covers the browser's pan to the field and which contacts
 *   each pan follows. A drag down that starts on the composer dismisses too.
 *   A drag up or across, or one in a part that scrolls on its own, keeps the
 *   keyboard.
 * @position Unit tests for Chat/transcriptDismiss.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PointerKind} from '../gestures/types';
import type {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {createHarness, type Finger} from '../gestures/__tests__/harness';
import {
  createComposerDismissPan,
  createKeyboardDismissPan,
  dismissKeyboardAtCrossing,
  dismissKeyboardOnComposerDrag,
} from './transcriptDismiss';

type FakeViewport = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
  width?: number;
};

const COVER = 300;
const COMPOSER = 60;
// jsdom's layout viewport is 768 px tall: the keyboard's top edge is at 468.
// The composer on it is 60 px tall, so its top, the line, is at 408.
const TRIGGER = 768 - COVER - COMPOSER;
// Longer than the velocity tracker's stillness (40 ms): a lift after it
// releases at 0, so the finger's own position decides.
const REST_MS = 100;

let viewport: FakeViewport;
let field: HTMLTextAreaElement;
let row: HTMLElement;
let bar: HTMLElement;
let harness: ReturnType<typeof createHarness>;
let line: () => number;
let pan: ReturnType<typeof createKeyboardDismissPan>;
let dismissals: number[];

function showKeyboard() {
  viewport.height = window.innerHeight - COVER;
  viewport.dispatchEvent(new Event('resize'));
}

interface DragOptions {
  start?: number;
  pxPerFrame?: number;
  id?: number;
  pointerType?: PointerKind;
  x?: number;
  toX?: number;
  recognizer?: PanGestureRecognizer;
}

// A contact down at `from` on `target`, then one sample per 60 Hz frame to
// `to`.
function drag(
  target: Element,
  from: number,
  to: number,
  {
    start = 0,
    pxPerFrame = 8,
    id = 1,
    pointerType = 'touch',
    x = 100,
    toX = x,
    recognizer = pan,
  }: DragOptions = {},
): {finger: Finger; last: number} {
  const finger = harness
    .finger(id)
    .down(x, from, start, {recognizers: [recognizer], target, pointerType});
  const distance = Math.max(Math.abs(to - from), Math.abs(toX - x));
  const steps = Math.max(1, Math.ceil(distance / pxPerFrame));
  let last = start;
  for (let i = 1; i <= steps; i++) {
    last = start + i * 16;
    finger.move(
      x + ((toX - x) * i) / steps,
      from + ((to - from) * i) / steps,
      last,
    );
  }
  return {finger, last};
}

describe('createKeyboardDismissPan', () => {
  beforeEach(() => {
    viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    document.body.innerHTML =
      '<div id="row">message</div><div id="bar"><textarea id="field"></textarea></div>';
    row = document.getElementById('row')!;
    bar = document.getElementById('bar')!;
    field = document.getElementById('field') as HTMLTextAreaElement;
    harness = createHarness();
    line = () => TRIGGER;
    pan = createKeyboardDismissPan(() => line());
    dismissals = [];
    pan.addListener(() =>
      dismissKeyboardAtCrossing(pan, speed => dismissals.push(speed)),
    );
    field.focus();
    showKeyboard();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('one decision, as the finger reaches the line (FR10)', () => {
    it('dismisses on the move that reaches the line, before the lift', () => {
      const {finger, last} = drag(row, 200, TRIGGER + 20);
      expect(document.activeElement).not.toBe(field);
      expect(dismissals).toHaveLength(1);
      finger.up(last + 8);
      expect(dismissals).toHaveLength(1);
      // The pan watches: it never takes the touch from the browser.
      expect(harness.claims).toEqual([]);
    });

    it('keeps the keyboard while the drag stays above the line, and after its lift there', () => {
      const {finger, last} = drag(row, 200, TRIGGER - 1);
      expect(document.activeElement).toBe(field);
      finger.up(last + REST_MS);
      expect(document.activeElement).toBe(field);
      expect(dismissals).toEqual([]);
    });

    it('dismisses when the finger reaches the line itself', () => {
      drag(row, 200, TRIGGER);
      expect(document.activeElement).not.toBe(field);
    });

    it('dismisses when the lift itself is the first contact on the line', () => {
      const {finger, last} = drag(row, 200, TRIGGER - 4);
      expect(document.activeElement).toBe(field);
      finger.up(last + 8, 100, TRIGGER + 4);
      expect(document.activeElement).not.toBe(field);
    });

    it('keeps the keyboard for a tap that lands just above the line and drifts onto it', () => {
      // A drag begins only once it travels the pan's 10 px hysteresis. So a
      // tap that drifts 8 px across the line is still a tap.
      const finger = harness
        .finger(1)
        .down(100, TRIGGER - 4, 0, {recognizers: [pan], target: row})
        .move(100, TRIGGER + 4, 16);
      expect(document.activeElement).toBe(field);
      finger.up(16 + REST_MS);
      expect(document.activeElement).toBe(field);
    });

    it('dismisses on the move that completes the 10 px pan hysteresis past the line', () => {
      harness
        .finger(1)
        .down(100, TRIGGER - 6, 0, {recognizers: [pan], target: row})
        .move(100, TRIGGER + 4, 16);
      expect(document.activeElement).not.toBe(field);
    });

    it('keeps the keyboard for a flick that lifts above the line, however fast', () => {
      // Only where the finger is decides: nothing projects the drag past its
      // lift.
      const {finger, last} = drag(row, 100, TRIGGER - 10, {pxPerFrame: 24});
      finger.up(last + 4);
      expect(document.activeElement).toBe(field);
      expect(dismissals).toEqual([]);
    });

    it('hands over the finger’s downward speed, in px/s', () => {
      // 8 px a 16 ms frame is 500 px/s.
      drag(row, 200, TRIGGER + 20);
      expect(dismissals[0]).toBeGreaterThan(400);
      expect(dismissals[0]).toBeLessThan(600);
    });

    it('dismisses once per drag, however often the finger crosses the line', () => {
      const result = drag(row, 200, TRIGGER + 40);
      expect(dismissals).toHaveLength(1);
      // The field takes focus again while the finger stays down.
      field.focus();
      let last = result.last;
      for (const y of [TRIGGER - 40, TRIGGER + 40]) {
        last += 16;
        result.finger.move(100, y, last);
      }
      expect(document.activeElement).toBe(field);
      result.finger.up(last + 8);
      expect(dismissals).toHaveLength(1);
    });

    it('decides nothing for a touch the browser cancels short of the line', () => {
      const {finger, last} = drag(row, 200, TRIGGER - 20);
      finger.cancel(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('follows a touch the browser takes for a scroll until it reaches the line', () => {
      const {finger, last} = drag(row, 200, 260);
      finger.takenByBrowser(last + 1);
      let time = last + 1;
      for (let y = 268; y <= TRIGGER + 20; y += 8) {
        time += 16;
        finger.move(100, y, time);
      }
      expect(document.activeElement).not.toBe(field);
    });

    it('dismisses at the line on a page WebKit pinch-zooms', () => {
      // WebKit reports innerWidth and innerHeight in the zoomed visual
      // viewport's px. clientY and the composer's box stay in layout px, and
      // the keyboard still reads as up.
      vi.stubGlobal('innerHeight', 384);
      vi.stubGlobal('innerWidth', 512);
      Object.assign(viewport, {
        scale: 2,
        width: 512,
        height: (768 - COVER) / 2,
      });
      viewport.dispatchEvent(new Event('resize'));
      const result = drag(row, 200, TRIGGER - 1);
      expect(document.activeElement).toBe(field);
      result.finger.up(result.last + REST_MS);
      drag(row, 200, TRIGGER, {start: result.last + 1000});
      expect(document.activeElement).not.toBe(field);
    });

    it('decides against the composer where the page draws it, after the browser pans to the focused field', () => {
      // Mobile Safari pans the visual viewport to a field near the bottom.
      // The composer keeps its place at the layout viewport's bottom, drawn
      // just above the keyboard.
      Object.assign(viewport, {offsetTop: COVER});
      viewport.dispatchEvent(new Event('scroll'));
      const composerTop = 768 - COMPOSER;
      line = () => composerTop;
      const result = drag(row, 300, composerTop - 1);
      expect(document.activeElement).toBe(field);
      result.finger.up(result.last + REST_MS);
      drag(row, 300, composerTop + 4, {start: result.last + 1000});
      expect(document.activeElement).not.toBe(field);
    });
  });

  describe('the contacts it follows', () => {
    it('ignores a drag that starts in the bar on the keyboard', () => {
      const {finger, last} = drag(bar, TRIGGER + 10, TRIGGER + 120);
      finger.up(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('ignores a drag in the focused text (moving the caret, selecting)', () => {
      const {finger, last} = drag(field, 200, TRIGGER + 20);
      finger.up(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('ignores two fingers that land together', () => {
      harness.arena.began(
        [1, 2].map(id => ({
          id,
          x: 100 + id * 40,
          y: 200,
          time: 0,
          pointerType: 'touch' as const,
          target: row,
          scroll: null,
          recognizers: [pan],
          consumer: null,
        })),
      );
      harness.arena.moved([
        {id: 1, x: 140, y: TRIGGER + 20, time: 16},
        {id: 2, x: 180, y: TRIGGER + 20, time: 16},
      ]);
      harness.arena.ended([
        {id: 1, x: 140, y: TRIGGER + 20, time: 24},
        {id: 2, x: 180, y: TRIGGER + 20, time: 24},
      ]);
      expect(document.activeElement).toBe(field);
    });

    it('fails when a second finger lands before the drag begins, so two fingers stay the browser’s pinch', () => {
      const first = harness
        .finger(1)
        .down(100, 200, 0, {recognizers: [pan], target: row});
      harness
        .finger(2)
        .down(200, 200, 8, {recognizers: [pan], target: row})
        .up(12);
      expect(pan.state).toBe('failed');
      first.move(100, TRIGGER + 20, 16).up(16 + REST_MS);
      expect(document.activeElement).toBe(field);
    });

    it('does nothing while the keyboard module measures none (a hardware keyboard, or Chrome under resizes-content)', () => {
      viewport.height = window.innerHeight;
      viewport.dispatchEvent(new Event('resize'));
      const {finger, last} = drag(row, 200, 760);
      finger.up(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('does nothing in a frame, where the keyboard module measures nothing', () => {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const frameWindow = frame.contentWindow as Window & typeof globalThis;
      const frameDocument = frameWindow.document;
      frameDocument.body.innerHTML =
        '<div id="row">message</div><textarea id="field"></textarea>';
      const frameField = frameDocument.getElementById(
        'field',
      ) as HTMLTextAreaElement;
      frameField.focus();
      // The frame's own viewport reads as covered by a keyboard.
      Object.defineProperty(frameWindow, 'visualViewport', {
        configurable: true,
        value: Object.assign(new EventTarget(), {
          height: frameWindow.innerHeight - COVER,
          offsetTop: 0,
          scale: 1,
        }),
      });
      const {finger, last} = drag(
        frameDocument.getElementById('row')!,
        200,
        TRIGGER + 20,
      );
      finger.up(last + 8);
      expect(frameDocument.activeElement).toBe(frameField);
    });

    it('takes a pen, and a mouse never reaches it (spec:AST-094 FR43)', () => {
      let result = drag(row, 200, TRIGGER + 20, {pointerType: 'mouse'});
      expect(pan.numberOfTouches).toBe(0);
      result.finger.up(result.last + REST_MS);
      expect(document.activeElement).toBe(field);
      result = drag(row, 200, TRIGGER + 20, {
        pointerType: 'pen',
        start: result.last + 1000,
      });
      result.finger.up(result.last + REST_MS);
      expect(document.activeElement).not.toBe(field);
    });
  });
});

describe('createComposerDismissPan', () => {
  let composer: HTMLElement;
  let composerPan: ReturnType<typeof createComposerDismissPan>;

  beforeEach(() => {
    viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    });
    document.body.innerHTML =
      '<div id="row">message</div><div id="composer"><button id="send">Send</button><textarea id="field"></textarea></div>';
    row = document.getElementById('row')!;
    composer = document.getElementById('composer')!;
    field = document.getElementById('field') as HTMLTextAreaElement;
    harness = createHarness();
    composerPan = createComposerDismissPan(() => composer);
    composerPan.addListener(() => dismissKeyboardOnComposerDrag(composerPan));
    field.focus();
    showKeyboard();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    document.body.innerHTML = '';
  });

  // The drag options for a contact the composer's pan receives.
  const onComposer = () => ({recognizer: composerPan});

  it('dismisses once a drag down that starts on the composer travels the 10 px pan hysteresis', () => {
    const finger = harness
      .finger(1)
      .down(100, TRIGGER + 20, 0, {
        recognizers: [composerPan],
        target: composer,
      })
      .move(100, TRIGGER + 26, 16);
    expect(document.activeElement).toBe(field);
    finger.move(100, TRIGGER + 31, 32);
    expect(document.activeElement).not.toBe(field);
    // The pan watches: the composer's scroll hold keeps the page still.
    expect(harness.claims).toEqual([]);
  });

  it('keeps the keyboard for a drag down that starts after a press held for a long press (the caret loupe)', () => {
    // UIKit's long press takes 500 ms.
    harness
      .finger(1)
      .down(100, TRIGGER + 20, 0, {recognizers: [composerPan], target: field})
      .move(100, TRIGGER + 20, 300)
      .move(100, TRIGGER + 32, 520)
      .move(100, TRIGGER + 60, 536);
    expect(document.activeElement).toBe(field);
  });

  it('dismisses a drag down that starts before the long press', () => {
    harness
      .finger(1)
      .down(100, TRIGGER + 20, 0, {recognizers: [composerPan], target: field})
      .move(100, TRIGGER + 32, 480);
    expect(document.activeElement).not.toBe(field);
  });

  it('dismisses from a drag down that starts on the focused text or a button', () => {
    const first = drag(field, TRIGGER + 20, TRIGGER + 60, onComposer());
    expect(document.activeElement).not.toBe(field);
    first.finger.up(first.last + 8);
    field.focus();
    const send = document.getElementById('send')!;
    drag(send, TRIGGER + 20, TRIGGER + 60, {
      ...onComposer(),
      start: first.last + 1000,
    });
    expect(document.activeElement).not.toBe(field);
  });

  it('keeps the keyboard for a drag up or across that starts on the composer', () => {
    let result = drag(composer, TRIGGER + 60, TRIGGER + 10, onComposer());
    result.finger.up(result.last + REST_MS);
    expect(document.activeElement).toBe(field);
    result = drag(composer, TRIGGER + 30, TRIGGER + 40, {
      ...onComposer(),
      x: 100,
      toX: 160,
      start: result.last + 1000,
    });
    result.finger.up(result.last + REST_MS);
    expect(document.activeElement).toBe(field);
  });

  it('leaves a drag down to a long draft that can scroll down, and dismisses one at the draft’s top', () => {
    field.style.overflowY = 'auto';
    Object.defineProperty(field, 'scrollHeight', {value: 400});
    Object.defineProperty(field, 'clientHeight', {value: 100});
    field.scrollTop = 120;
    const first = drag(field, TRIGGER + 20, TRIGGER + 60, onComposer());
    first.finger.up(first.last + REST_MS);
    expect(document.activeElement).toBe(field);
    // At its top the draft has no room to scroll down, so the page would.
    field.scrollTop = 0;
    drag(field, TRIGGER + 20, TRIGGER + 60, {
      ...onComposer(),
      start: first.last + 1000,
    });
    expect(document.activeElement).not.toBe(field);
  });

  it('leaves a drag down to a long draft made in another window, which can scroll down', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    // Made by the frame's document, the draft keeps that window's realm here.
    const draft = (frame.contentDocument as Document).createElement('div');
    expect(draft instanceof Element).toBe(false);
    draft.style.overflowY = 'auto';
    Object.defineProperty(draft, 'scrollHeight', {value: 400});
    Object.defineProperty(draft, 'clientHeight', {value: 100});
    draft.scrollTop = 120;
    composer.append(draft);
    drag(draft, TRIGGER + 20, TRIGGER + 60, onComposer());
    expect(document.activeElement).toBe(field);
  });

  it('dismisses from a drag down on a strip of attachments, which scrolls only sideways', () => {
    const strip = document.createElement('div');
    strip.style.overflowX = 'auto';
    Object.defineProperty(strip, 'scrollWidth', {value: 600});
    Object.defineProperty(strip, 'clientWidth', {value: 200});
    composer.prepend(strip);
    drag(strip, TRIGGER + 20, TRIGGER + 60, onComposer());
    expect(document.activeElement).not.toBe(field);
  });

  it('dismisses from a drag down on that strip that drifts a little sideways, as the browser locks to the major axis', () => {
    const strip = document.createElement('div');
    strip.style.overflowX = 'auto';
    Object.defineProperty(strip, 'scrollWidth', {value: 600});
    Object.defineProperty(strip, 'clientWidth', {value: 200});
    composer.prepend(strip);
    // One move past the hysteresis, 30 px down and 12 px across: the pan
    // reads it as mostly down.
    drag(strip, TRIGGER + 20, TRIGGER + 50, {
      ...onComposer(),
      x: 100,
      toX: 88,
      pxPerFrame: 40,
    });
    expect(document.activeElement).not.toBe(field);
  });

  it('ignores a contact outside the composer', () => {
    drag(row, 200, 260, onComposer());
    expect(document.activeElement).toBe(field);
  });

  it('does nothing while the keyboard module measures none (a hardware keyboard)', () => {
    viewport.height = window.innerHeight;
    viewport.dispatchEvent(new Event('resize'));
    drag(composer, TRIGGER + 20, TRIGGER + 60, onComposer());
    expect(document.activeElement).toBe(field);
  });

  it('takes a pen, and a mouse never reaches it (spec:AST-094 FR43)', () => {
    const result = drag(composer, TRIGGER + 20, TRIGGER + 60, {
      ...onComposer(),
      pointerType: 'mouse',
    });
    expect(composerPan.numberOfTouches).toBe(0);
    result.finger.up(result.last + REST_MS);
    expect(document.activeElement).toBe(field);
    drag(composer, TRIGGER + 20, TRIGGER + 60, {
      ...onComposer(),
      pointerType: 'pen',
      start: result.last + 1000,
    });
    expect(document.activeElement).not.toBe(field);
  });
});
