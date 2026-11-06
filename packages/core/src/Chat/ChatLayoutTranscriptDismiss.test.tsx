// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatLayoutTranscriptDismiss.test.tsx
 * @input vitest, jsdom, ChatLayout, the gesture host, a stand-in visual
 *   viewport and timestamped touch and pointer events
 * @output Tests that ChatLayout attaches the drag-to-dismiss to its root and
 *   composer. A touch or pen drag blurs the field as it reaches the
 *   composer's top, and the dock container bounces once. A drag down that
 *   starts on the composer blurs it too, and a drag there never scrolls the
 *   page under the keyboard. A mouse drag changes nothing. It covers a
 *   replaced row and the listeners the dismissal adds.
 * @position Unit tests for ChatLayout's use of Chat/transcriptDismiss.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {pointerQuery} from '../gestures/__tests__/pointerQuery';
import {ChatLayout} from './ChatLayout';

type FakeViewport = EventTarget & {
  height: number;
  offsetTop: number;
  scale: number;
};

const COVER = 300;
// The gesture host's clock never runs back, so each case starts later.
let clock = 0;
let viewport: FakeViewport;
let restorePointer: () => void = () => {};

function primaryPointer(kind: 'coarse' | 'fine') {
  restorePointer = pointerQuery(kind === 'coarse').restore;
}

function renderLayout() {
  render(
    <ChatLayout composer={<textarea aria-label="Message" />}>
      <p>Hello</p>
      <p>
        <span>Replaced</span>
      </p>
    </ChatLayout>,
  );
  const field = screen.getByRole('textbox', {name: 'Message'});
  // The composer's box: the field's container's container.
  const composer = field.parentElement?.parentElement as HTMLElement;
  const line = window.innerHeight - COVER - 60;
  composer.getBoundingClientRect = () => new DOMRect(0, line, 400, 60);
  return {field, composer, line, transcript: screen.getByText('Hello')};
}

function showKeyboard(field: HTMLElement) {
  act(() => field.focus());
  viewport.height = window.innerHeight - COVER;
  act(() => {
    viewport.dispatchEvent(new Event('resize'));
  });
}

// One finger on `target`, as a touch event at `time` ms into the case.
function finger(
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend',
  clientY: number,
  time: number,
): Event {
  const point = {identifier: 0, clientX: 100, clientY, target};
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'changedTouches', {value: [point]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [point],
  });
  Object.defineProperty(event, 'timeStamp', {value: clock + time});
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

// Fingers on `target` as one touch event at `time`, every one of them changed;
// returns the event, to read what it prevented.
function fingersAt(
  target: EventTarget,
  type: 'touchstart' | 'touchmove' | 'touchend',
  down: {id: number; x: number; y: number}[],
  time: number,
): Event {
  const points = down.map(({id, x, y}) => ({
    identifier: id,
    clientX: x,
    clientY: y,
    target,
  }));
  const event = new Event(type, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'changedTouches', {value: points});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : points,
  });
  Object.defineProperty(event, 'timeStamp', {value: clock + time});
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

// A finger's drag from `from` to `to`, a sample per 60 Hz frame: returns the
// time of the last sample.
function fingerDrag(target: EventTarget, from: number, to: number): number {
  finger(target, 'touchstart', from, 0);
  return moveFinger(target, from, to, 0);
}

// The finger from `from` to `to` in 8 px steps, one per 16 ms after `time`;
// returns the last step's time.
function moveFinger(
  target: EventTarget,
  from: number,
  to: number,
  time: number,
): number {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 8));
  for (let i = 1; i <= steps; i++) {
    finger(
      target,
      'touchmove',
      from + ((to - from) * i) / steps,
      time + i * 16,
    );
  }
  return time + steps * 16;
}

// jsdom has no Web Animations: records each `animate` call instead.
function recordAnimations(): {target: Element; keyframes: Keyframe[]}[] {
  const calls: {target: Element; keyframes: Keyframe[]}[] = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value(this: Element, keyframes: Keyframe[]) {
      calls.push({target: this, keyframes});
      return {} as Animation;
    },
  });
  return calls;
}

// A keyframe's vertical offset, from its `translate`.
function offsetOf(keyframe: Keyframe): number {
  const [, y = '0'] = String(keyframe.translate).split(' ');
  return Number.parseFloat(y) || 0;
}

// Reduce Motion is on until the restore runs; the primary pointer is coarse.
function reduceMotion(): () => void {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query: string) => {
    const list = matchMedia(query);
    return /prefers-reduced-motion:\s*reduce/.test(query)
      ? {...list, matches: true, media: query}
      : list;
  };
  return () => {
    window.matchMedia = matchMedia;
  };
}

// A mouse's or a pen's pointer event; returns it, to read what it prevented.
function pointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerType: 'mouse' | 'pen',
  clientY: number,
  time: number,
): Event {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: 7,
    isPrimary: true,
    pointerType,
    clientX: 100,
    clientY,
    button: type === 'pointermove' ? -1 : 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperty(event, 'timeStamp', {value: clock + time});
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

// A mouse's or a pen's drag, ending with its release: returns every event.
function pointerDrag(
  target: EventTarget,
  pointerType: 'mouse' | 'pen',
  from: number,
  to: number,
): Event[] {
  const events = [pointer(target, 'pointerdown', pointerType, from, 0)];
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 8));
  let time = 0;
  for (let i = 1; i <= steps; i++) {
    time = i * 16;
    const y = from + ((to - from) * i) / steps;
    events.push(pointer(target, 'pointermove', pointerType, y, time));
  }
  events.push(pointer(target, 'pointerup', pointerType, to, time + 100));
  return events;
}

describe('ChatLayout dismisses the keyboard from a transcript drag (FR10)', () => {
  beforeEach(() => {
    clock += 100_000;
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
    restorePointer();
    restorePointer = () => {};
    Reflect.deleteProperty(window, 'visualViewport');
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    vi.restoreAllMocks();
  });

  it('blurs the composer as a finger’s drag reaches the composer’s top, before the lift, and moves focus nowhere else', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    let last = fingerDrag(transcript, 100, line - 1);
    expect(document.activeElement).toBe(field);
    last = moveFinger(transcript, line - 1, line, last);
    expect(document.activeElement).toBe(document.body);
    finger(transcript, 'touchend', line, last + 100);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the keyboard when the drag lifts above the composer', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    const last = fingerDrag(transcript, 100, line - 1);
    finger(transcript, 'touchend', line - 1, last + 100);
    expect(document.activeElement).toBe(field);
  });

  it('reads the line from where the page draws the composer, after the browser pans to the field', () => {
    primaryPointer('coarse');
    const {field, composer, transcript} = renderLayout();
    // Mobile Safari's own pan: the composer keeps its place at the layout
    // viewport's bottom, drawn just above the keyboard.
    const top = window.innerHeight - 60;
    composer.getBoundingClientRect = () => new DOMRect(0, top, 400, 60);
    viewport.offsetTop = COVER;
    showKeyboard(field);
    let last = fingerDrag(transcript, 300, top - 1);
    finger(transcript, 'touchend', top - 1, last + 100);
    expect(document.activeElement).toBe(field);
    clock += 10_000;
    last = fingerDrag(transcript, 300, top + 4);
    finger(transcript, 'touchend', top + 4, last + 100);
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the dismissal when the finger moves back up above the composer before the lift', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    let last = fingerDrag(transcript, 100, line + 40);
    expect(document.activeElement).toBe(document.body);
    last = moveFinger(transcript, line + 40, line - 40, last);
    finger(transcript, 'touchend', line - 40, last + 100);
    expect(document.activeElement).toBe(document.body);
  });

  it('starts no drag from the lift alone: moves under the 10 px hysteresis keep the keyboard', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    finger(transcript, 'touchstart', line - 6, 0);
    finger(transcript, 'touchmove', line + 2, 16);
    // The lift reports 10 px of travel; the pan reads no travel from it.
    finger(transcript, 'touchend', line + 4, 116);
    expect(document.activeElement).toBe(field);
  });

  it('follows a drag whose row the transcript replaces before the lift', () => {
    // The browser keeps sending a touch's events to the node it began on,
    // even once that node leaves the page.
    primaryPointer('coarse');
    const {field, line} = renderLayout();
    showKeyboard(field);
    const row = screen.getByText('Replaced');
    finger(row, 'touchstart', 100, 0);
    finger(row, 'touchmove', 140, 16);
    act(() => row.replaceWith(document.createElement('span')));
    let time = 16;
    for (let y = 148; y <= line + 8; y += 8) {
      time += 16;
      finger(row, 'touchmove', y, time);
    }
    finger(row, 'touchend', line + 8, time + 100);
    expect(document.activeElement).toBe(document.body);
  });

  it('dismisses from a finger’s drag where the primary pointer is fine, as on a touch-screen laptop (spec:AST-094 FR43)', () => {
    primaryPointer('fine');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    // Such a finger sends each pointer event before its touch event.
    const both = (
      type: 'start' | 'move' | 'end',
      clientY: number,
      time: number,
    ) => {
      const pointerType = {start: 'down', move: 'move', end: 'up'}[type];
      const event = new PointerEvent(`pointer${pointerType}`, {
        bubbles: true,
        cancelable: true,
        pointerId: 3,
        isPrimary: true,
        pointerType: 'touch',
        clientX: 100,
        clientY,
        buttons: type === 'end' ? 0 : 1,
      });
      Object.defineProperty(event, 'timeStamp', {value: clock + time});
      act(() => {
        transcript.dispatchEvent(event);
      });
      finger(transcript, `touch${type}`, clientY, time);
    };
    both('start', 100, 0);
    let time = 0;
    for (let y = 108; y <= line; y += 8) {
      time += 16;
      both('move', y, time);
    }
    both('end', line, time + 100);
    expect(document.activeElement).toBe(document.body);
  });

  it('dismisses from a pen’s drag reported as pointer events (spec:AST-094 FR43)', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    pointerDrag(transcript, 'pen', 100, line + 20);
    expect(document.activeElement).toBe(document.body);
  });

  it('leaves a mouse drag to the browser: it keeps focus, prevents nothing, captures no pointer and moves nothing', () => {
    // A desktop browser: the press itself moves focus, so main's behavior is
    // the browser's, and the dismissal adds nothing to it.
    primaryPointer('fine');
    // jsdom has no pointer capture: record every call to it.
    const capture = vi.fn();
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: capture,
    });
    try {
      const {composer, field, line, transcript} = renderLayout();
      showKeyboard(field);
      const atRest = composer.className;
      const events = pointerDrag(transcript, 'mouse', 100, line + 20);
      expect(events.map(event => event.defaultPrevented)).not.toContain(true);
      expect(capture).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(field);
      // Nothing moves.
      expect(composer.style.translate).toBe('');
      expect(composer.className).toBe(atRest);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
    }
  });

  it('adds one passive pointerdown on the layout’s root and one on the composer where the primary pointer is fine, and no touch listener (spec:AST-094 FR24)', () => {
    primaryPointer('fine');
    const added: {target: EventTarget; type: string; options: unknown}[] = [];
    const add = EventTarget.prototype.addEventListener;
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
      function (this: EventTarget, ...args) {
        added.push({target: this, type: args[0], options: args[2]});
        return add.apply(this, args);
      },
    );
    const {composer, transcript} = renderLayout();
    const root = transcript.closest('[data-density]') as HTMLElement;
    const inputOn = (target: EventTarget) =>
      added.filter(
        entry =>
          entry.target === target &&
          (entry.type.startsWith('touch') || entry.type.startsWith('pointer')),
      );
    for (const element of [root, composer]) {
      expect(inputOn(element).map(entry => entry.type)).toEqual([
        'pointerdown',
      ]);
      expect(inputOn(element)[0]?.options).toMatchObject({passive: true});
    }
    expect(inputOn(window)).toEqual([]);
    expect(inputOn(document)).toEqual([]);
  });

  it('shares one window listener per touch event between two layouts where the primary pointer is coarse (spec:AST-094 FR24)', () => {
    primaryPointer('coarse');
    const windowAdd = vi.spyOn(window, 'addEventListener');
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
    const touchTypes = windowAdd.mock.calls
      .map(([type]) => type)
      .filter(type => type.startsWith('touch'));
    expect(touchTypes.filter(type => type === 'touchstart')).toHaveLength(1);
  });

  describe('the bounce at the crossing', () => {
    beforeEach(() => primaryPointer('coarse'));

    it('bounces the dock container once, which holds the scroll button, the frosted layer and the composer', () => {
      const animations = recordAnimations();
      const {composer, field, line, transcript} = renderLayout();
      composer.style.paddingBottom = '12px';
      showKeyboard(field);
      const last = fingerDrag(transcript, 100, line + 40);
      finger(transcript, 'touchend', line + 40, last + 100);
      expect(animations).toHaveLength(1);
      const [{target, keyframes}] = animations;
      // One transform for all three: the composer and the button never part.
      expect(target).toBe(composer.parentElement);
      expect(target.contains(screen.getByRole('button', {hidden: true}))).toBe(
        true,
      );
      const offsets = keyframes.map(offsetOf);
      expect(offsets[0]).toBe(0);
      expect(offsets.at(-1)).toBe(0);
      // One dip, down and back, no deeper than the composer's bottom padding.
      const deepest = Math.max(...offsets);
      expect(deepest).toBeGreaterThan(0);
      expect(deepest).toBeLessThanOrEqual(12);
      const turn = offsets.indexOf(deepest);
      offsets.forEach((offset, index) => {
        if (index > 0) {
          const step = offset - offsets[index - 1];
          expect(index <= turn ? step >= 0 : step <= 0).toBe(true);
        }
      });
    });

    it('moves nothing for a drag that stays above the composer, and nothing under Reduce Motion', () => {
      const animations = recordAnimations();
      const {composer, field, line, transcript} = renderLayout();
      composer.style.paddingBottom = '12px';
      showKeyboard(field);
      let last = fingerDrag(transcript, 100, line - 20);
      finger(transcript, 'touchend', line - 20, last + 100);
      expect(animations).toEqual([]);
      const restoreMotion = reduceMotion();
      try {
        clock += 10_000;
        last = fingerDrag(transcript, 100, line + 40);
        finger(transcript, 'touchend', line + 40, last + 100);
        expect(document.activeElement).toBe(document.body);
        expect(animations).toEqual([]);
      } finally {
        restoreMotion();
      }
    });
  });

  describe('a drag that starts on the composer', () => {
    beforeEach(() => primaryPointer('coarse'));

    // One finger from (x, y) by (dx, dy) in five 60 Hz steps, then lifted;
    // returns the moves.
    const swipe = (
      target: EventTarget,
      [x, y]: [number, number],
      [dx, dy]: [number, number],
    ): Event[] => {
      fingersAt(target, 'touchstart', [{id: 0, x, y}], 0);
      const moves: Event[] = [];
      for (let i = 1; i <= 5; i++) {
        const at = {id: 0, x: x + (dx * i) / 5, y: y + (dy * i) / 5};
        moves.push(fingersAt(target, 'touchmove', [at], i * 16));
      }
      fingersAt(target, 'touchend', [{id: 0, x: x + dx, y: y + dy}], 200);
      return moves;
    };
    const prevented = (moves: Event[]) =>
      moves.map(event => event.defaultPrevented);

    it('blurs the field once it moves down, and the page’s scroll never starts', () => {
      const {composer, field, line} = renderLayout();
      showKeyboard(field);
      // Each step clears the page hold's 5 px slop.
      const moves = swipe(composer, [100, line + 10], [0, 40]);
      expect(document.activeElement).toBe(document.body);
      expect(prevented(moves)).not.toContain(false);
    });

    it('keeps the keyboard for a drag up, and still keeps the page still under it', () => {
      const {composer, field, line} = renderLayout();
      showKeyboard(field);
      const moves = swipe(composer, [100, line + 50], [0, -40]);
      expect(document.activeElement).toBe(field);
      expect(prevented(moves)).not.toContain(false);
    });

    it('holds the page under a drag that starts on a node made in another window', () => {
      const {composer, field, line} = renderLayout();
      showKeyboard(field);
      const frame = document.createElement('iframe');
      document.body.append(frame);
      // Made by the frame's document, the node keeps that window's realm here.
      const chip = (frame.contentDocument as Document).createElement('span');
      expect(chip instanceof Node).toBe(false);
      composer.append(chip);
      const moves = swipe(chip, [100, line + 50], [0, -40]);
      expect(prevented(moves)).not.toContain(false);
      frame.remove();
    });

    it('leaves a two-finger pinch that starts on the composer to the browser (spec:AST-094 FR10)', () => {
      const {composer, field, line} = renderLayout();
      showKeyboard(field);
      const at = (i: number) => [
        {id: 0, x: 100 - i * 8, y: line + 10 - i * 8},
        {id: 1, x: 200 + i * 8, y: line + 30 + i * 8},
      ];
      fingersAt(composer, 'touchstart', at(0), 0);
      const moves: Event[] = [];
      for (let i = 1; i <= 5; i++) {
        moves.push(fingersAt(composer, 'touchmove', at(i), i * 16));
      }
      fingersAt(composer, 'touchend', at(5), 200);
      expect(prevented(moves)).not.toContain(true);
      expect(document.activeElement).toBe(field);
    });

    it('lets a drag pan a pinch-zoomed page', () => {
      const {composer, field, line} = renderLayout();
      showKeyboard(field);
      viewport.scale = 2;
      const moves = swipe(composer, [100, line + 50], [0, -40]);
      expect(prevented(moves)).not.toContain(true);
    });

    it('leaves a part of the composer that scrolls sideways its own swipe, and dismisses from a drag down on it', () => {
      render(
        <ChatLayout
          composer={
            <div>
              <div data-testid="strip" style={{overflowX: 'auto'}}>
                <span>attachment</span>
              </div>
              <textarea aria-label="Message" />
            </div>
          }>
          <p>Hello</p>
        </ChatLayout>,
      );
      const field = screen.getByRole('textbox', {name: 'Message'});
      const strip = screen.getByTestId('strip');
      Object.defineProperty(strip, 'scrollWidth', {value: 600});
      Object.defineProperty(strip, 'clientWidth', {value: 200});
      showKeyboard(field);
      const sideways = swipe(strip, [300, 600], [-80, 0]);
      expect(prevented(sideways)).not.toContain(true);
      expect(document.activeElement).toBe(field);
      // The strip cannot scroll down, so the drag is the composer's.
      clock += 10_000;
      const down = swipe(strip, [300, 600], [0, 40]);
      expect(prevented(down)).not.toContain(false);
      expect(document.activeElement).toBe(document.body);
    });

    it('holds the page under a drag up that drifts sideways on that strip, and leaves the strip a swipe at least half sideways', () => {
      render(
        <ChatLayout
          composer={
            <div>
              <div data-testid="strip" style={{overflowX: 'auto'}}>
                <span>attachment</span>
              </div>
              <textarea aria-label="Message" />
            </div>
          }>
          <p>Hello</p>
        </ChatLayout>,
      );
      const field = screen.getByRole('textbox', {name: 'Message'});
      const strip = screen.getByTestId('strip');
      Object.defineProperty(strip, 'scrollWidth', {value: 600});
      Object.defineProperty(strip, 'clientWidth', {value: 200});
      showKeyboard(field);
      // The browser locks a mostly vertical drag to the vertical axis, which
      // the strip cannot scroll: the page would.
      const drifting = swipe(strip, [300, 600], [-20, -120]);
      expect(prevented(drifting)).not.toContain(false);
      expect(document.activeElement).toBe(field);
      clock += 10_000;
      const diagonal = swipe(strip, [300, 600], [-60, -100]);
      expect(prevented(diagonal)).not.toContain(true);
    });

    it('leaves the page its scroll when no software keyboard is up, and again once it goes down', () => {
      const {composer, field, line} = renderLayout();
      act(() => field.focus());
      expect(
        prevented(swipe(composer, [100, line + 10], [0, 40])),
      ).not.toContain(true);
      expect(document.activeElement).toBe(field);
      clock += 10_000;
      showKeyboard(field);
      expect(
        prevented(swipe(composer, [100, line + 50], [0, -40])),
      ).not.toContain(false);
      viewport.height = window.innerHeight;
      act(() => {
        viewport.dispatchEvent(new Event('resize'));
      });
      clock += 10_000;
      expect(
        prevented(swipe(composer, [100, line + 50], [0, -40])),
      ).not.toContain(true);
    });
  });
});

describe('what the drag-to-dismiss loads', () => {
  it('goes through the gesture system’s pan, state checks, page hold and scroll test, with no listener of its own', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dismissal = fs.readFileSync(
      path.join(here, 'transcriptDismiss.ts'),
      'utf8',
    );
    expect(dismissal.match(/from '\.\.\/gestures\/[^']*'/g)).toEqual([
      "from '../gestures/GestureRecognizer'",
      "from '../gestures/PanGestureRecognizer'",
      "from '../gestures/nativeScroll'",
      "from '../gestures/pageHold'",
      "from '../gestures/types'",
    ]);
    expect(dismissal).not.toMatch(/addEventListener|subscribeInput/);
  });

  it('loads no animator: the bounce is one Web Animation of solved keyframes', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const file of ['ChatLayout.tsx', 'composerBounce.ts']) {
      const source = fs.readFileSync(path.join(here, file), 'utf8');
      expect(source).not.toMatch(/motion\/animator|motion\/rubberBand/);
    }
  });
});
