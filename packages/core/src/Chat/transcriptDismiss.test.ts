// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file transcriptDismiss.test.ts
 * @input vitest, jsdom, a stand-in visual viewport, the arena harness and
 *   createKeyboardDismissPan with timestamped contacts
 * @output Tests the pan's one decision at the release: where the drag lifts
 *   against the line, flicks, and a release that moves back up. It covers a
 *   cancelled touch, a touch the browser scrolls with, a zoomed page and the
 *   browser's pan to the field. It also covers which contacts it follows.
 * @position Unit tests for Chat/transcriptDismiss.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PointerKind} from '../gestures/types';
import {createHarness, type Finger} from '../gestures/__tests__/harness';
import {
  createKeyboardDismissPan,
  dismissDragOf,
  dismissKeyboardAtRelease,
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

function showKeyboard() {
  viewport.height = window.innerHeight - COVER;
  viewport.dispatchEvent(new Event('resize'));
}

interface DragOptions {
  start?: number;
  pxPerFrame?: number;
  id?: number;
  pointerType?: PointerKind;
}

// A contact down at `from` on `target`, then one sample per 60 Hz frame to
// `to`.
function drag(
  target: Element,
  from: number,
  to: number,
  {start = 0, pxPerFrame = 8, id = 1, pointerType = 'touch'}: DragOptions = {},
): {finger: Finger; last: number} {
  const finger = harness
    .finger(id)
    .down(100, from, start, {recognizers: [pan], target, pointerType});
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / pxPerFrame));
  let last = start;
  for (let i = 1; i <= steps; i++) {
    last = start + i * 16;
    finger.move(100, from + ((to - from) * i) / steps, last);
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
    pan.addListener(() => dismissKeyboardAtRelease(pan));
    field.focus();
    showKeyboard();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('one decision, at the release (spec:AST-094 FR36, FR37)', () => {
    it('dismisses when a slow drag lifts past the line, and not on the move that crosses it', () => {
      const {finger, last} = drag(row, 200, TRIGGER + 20);
      // The move crossed the line, but nothing decides until the lift.
      expect(document.activeElement).toBe(field);
      finger.up(last + 8);
      expect(document.activeElement).not.toBe(field);
      // The pan watches: it never takes the touch from the browser.
      expect(harness.claims).toEqual([]);
    });

    it('keeps the keyboard for a tap that lands just above the line and drifts onto it', () => {
      // A drag begins only once it travels the pan's 10 px hysteresis. So a
      // tap that drifts 8 px across the line is still a tap.
      const finger = harness
        .finger(1)
        .down(100, TRIGGER - 4, 0, {recognizers: [pan], target: row})
        .move(100, TRIGGER + 4, 16);
      finger.up(16 + REST_MS);
      expect(document.activeElement).toBe(field);
    });

    it('dismisses once the drag has travelled the 10 px pan hysteresis', () => {
      const finger = harness
        .finger(1)
        .down(100, TRIGGER - 6, 0, {recognizers: [pan], target: row})
        .move(100, TRIGGER + 4, 16);
      finger.up(16 + REST_MS);
      expect(document.activeElement).not.toBe(field);
    });

    it('keeps the keyboard when the finger lifts at rest short of the line', () => {
      const {finger, last} = drag(row, 200, TRIGGER - 1);
      finger.up(last + REST_MS);
      expect(document.activeElement).toBe(field);
    });

    it('dismisses when the finger lifts at rest on the line', () => {
      const {finger, last} = drag(row, 200, TRIGGER);
      finger.up(last + REST_MS);
      expect(document.activeElement).not.toBe(field);
    });

    it('keeps the keyboard for a flick that lifts above the line, however fast', () => {
      // In UIKit the keyboard never moves until the finger reaches it. So a
      // fast flick that lifts above it never dismisses it.
      const {finger, last} = drag(row, 100, TRIGGER - 10, {pxPerFrame: 24});
      finger.up(last + 4);
      expect(document.activeElement).toBe(field);
    });

    it('dismisses a fast drag that lifts just past the line', () => {
      const {finger, last} = drag(row, 100, TRIGGER + 20, {pxPerFrame: 24});
      finger.up(last + 4);
      expect(document.activeElement).not.toBe(field);
    });

    it('keeps the keyboard for a release moving back up, however far the finger went', () => {
      const result = drag(row, 200, TRIGGER + 80);
      let last = result.last;
      for (let y = TRIGGER + 72; y >= TRIGGER + 40; y -= 8) {
        last += 16;
        result.finger.move(100, y, last);
      }
      result.finger.up(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('dismisses when the finger moves back up, then rests before lifting past the line', () => {
      // The release velocity is 0 after a still rest, so the release does not
      // move back up.
      const result = drag(row, 200, TRIGGER + 80);
      let last = result.last;
      for (let y = TRIGGER + 72; y >= TRIGGER + 40; y -= 8) {
        last += 16;
        result.finger.move(100, y, last);
      }
      result.finger.up(last + REST_MS);
      expect(document.activeElement).not.toBe(field);
    });

    it('decides nothing for a touch the browser cancels', () => {
      const {finger, last} = drag(row, 200, TRIGGER + 20);
      finger.cancel(last + 8);
      expect(document.activeElement).toBe(field);
    });

    it('follows a touch the browser takes for a scroll until it lifts', () => {
      const {finger, last} = drag(row, 200, 260);
      finger.takenByBrowser(last + 1);
      let time = last + 1;
      for (let y = 268; y <= TRIGGER + 20; y += 8) {
        time += 16;
        finger.move(100, y, time);
      }
      finger.up(time + 8);
      expect(document.activeElement).not.toBe(field);
    });

    it('commits at the line on a page WebKit pinch-zooms', () => {
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
      let result = drag(row, 200, TRIGGER - 1);
      result.finger.up(result.last + REST_MS);
      expect(document.activeElement).toBe(field);
      result = drag(row, 200, TRIGGER, {start: result.last + 1000});
      result.finger.up(result.last + REST_MS);
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
      let result = drag(row, 300, composerTop - 1);
      result.finger.up(result.last + REST_MS);
      expect(document.activeElement).toBe(field);
      result = drag(row, 300, composerTop + 4, {start: result.last + 1000});
      result.finger.up(result.last + REST_MS);
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

  describe('the drag the composer follows', () => {
    it('names its line and the keyboard’s height until its release, and forgets a cancelled drag', () => {
      const first = drag(row, 200, TRIGGER + 20);
      expect(dismissDragOf(pan)).toEqual({
        doc: document,
        line: TRIGGER,
        travel: COVER,
      });
      first.finger.cancel(first.last + 8);
      expect(dismissDragOf(pan)).toBeNull();
      expect(document.activeElement).toBe(field);
      line = () => TRIGGER - 40;
      const second = drag(row, 200, TRIGGER - 20, {start: first.last + 1000});
      expect(dismissDragOf(pan)?.line).toBe(TRIGGER - 40);
      second.finger.up(second.last + REST_MS);
      expect(dismissDragOf(pan)).toBeNull();
      expect(document.activeElement).not.toBe(field);
    });
  });
});
