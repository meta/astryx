// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatLayoutTranscriptDismiss.test.tsx
 * @input vitest, jsdom, ChatLayout, the gesture host, a stand-in visual
 *   viewport and timestamped touch and pointer events
 * @output Tests that ChatLayout attaches the drag-to-dismiss to its root. A
 *   touch or pen drag lifted at or past the composer's top blurs the field,
 *   and a mouse drag changes nothing. It covers a replaced row and the
 *   listeners the dismissal adds.
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
) {
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

// The composer's offset as its inline `translate` shows it. jsdom has no Web
// Animations, so the animator writes each target at once.
function composerOffset(composer: HTMLElement): number {
  const [, y = '0'] = composer.style.translate.split(' ');
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
    vi.restoreAllMocks();
  });

  it('blurs the composer when a finger’s drag lifts at the composer’s top, and moves focus nowhere else', () => {
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    const last = fingerDrag(transcript, 100, line);
    // The drag decides at the lift (spec:AST-094 FR36).
    expect(document.activeElement).toBe(field);
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

  it('dismisses when the finger moves back up, then rests before lifting past the composer’s top', () => {
    // After a still rest the release velocity is 0, as every pan reads it.
    primaryPointer('coarse');
    const {field, line, transcript} = renderLayout();
    showKeyboard(field);
    let last = fingerDrag(transcript, 100, line + 80);
    for (let y = line + 72; y >= line + 40; y -= 8) {
      last += 16;
      finger(transcript, 'touchmove', y, last);
    }
    finger(transcript, 'touchend', line + 40, last + 100);
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
      // Nothing moves, and no armed cue shows.
      expect(composer.style.translate).toBe('');
      expect(composer.className).toBe(atRest);
    } finally {
      Reflect.deleteProperty(Element.prototype, 'setPointerCapture');
    }
  });

  it('adds one passive pointerdown on the layout’s root where the primary pointer is fine, and nothing on the composer (spec:AST-094 FR24)', () => {
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
    expect(inputOn(root).map(entry => entry.type)).toEqual(['pointerdown']);
    expect(inputOn(root)[0]?.options).toMatchObject({passive: true});
    expect(inputOn(composer)).toEqual([]);
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

  describe('the composer follows the drag', () => {
    beforeEach(() => primaryPointer('coarse'));

    it('stays at rest above the composer, follows past its top, and returns to rest on a move back up and a lift there', () => {
      const {composer, field, line, transcript} = renderLayout();
      showKeyboard(field);
      let last = fingerDrag(transcript, 100, line - 20);
      expect(composerOffset(composer)).toBe(0);
      last = moveFinger(transcript, line - 20, line + 40, last);
      // Past the top the composer moves down, slower than the finger, and the
      // frosted layer under it moves with it.
      const armed = composerOffset(composer);
      expect(armed).toBeGreaterThan(0);
      expect(armed).toBeLessThan(40);
      const edge = composer.previousElementSibling as HTMLElement;
      expect(composerOffset(edge)).toBe(armed);
      last = moveFinger(transcript, line + 40, line - 20, last);
      expect(composerOffset(composer)).toBe(0);
      expect(composerOffset(edge)).toBe(0);
      finger(transcript, 'touchend', line - 20, last + 100);
      expect(composerOffset(composer)).toBe(0);
      expect(document.activeElement).toBe(field);
    });

    it('returns the composer to rest when an armed lift dismisses the keyboard', () => {
      const {composer, field, line, transcript} = renderLayout();
      showKeyboard(field);
      const last = fingerDrag(transcript, 100, line + 40);
      expect(composerOffset(composer)).toBeGreaterThan(0);
      finger(transcript, 'touchend', line + 40, last + 100);
      expect(document.activeElement).toBe(document.body);
      expect(composerOffset(composer)).toBe(0);
    });

    it('moves nothing under Reduce Motion and shows the pressed overlay while the drag is armed', () => {
      const restoreMotion = reduceMotion();
      try {
        const {composer, field, line, transcript} = renderLayout();
        showKeyboard(field);
        const atRest = composer.className;
        let last = fingerDrag(transcript, 100, line + 40);
        expect(composerOffset(composer)).toBe(0);
        const armed = composer.className;
        expect(armed).not.toBe(atRest);
        last = moveFinger(transcript, line + 40, line - 20, last);
        expect(composer.className).toBe(atRest);
        last = moveFinger(transcript, line - 20, line + 40, last);
        expect(composer.className).toBe(armed);
        finger(transcript, 'touchend', line + 40, last + 100);
        expect(composer.className).toBe(atRest);
        expect(composerOffset(composer)).toBe(0);
        expect(document.activeElement).toBe(document.body);
      } finally {
        restoreMotion();
      }
    });

    it('leaks nothing between drags: ten drags, alternating armed lifts and lifts above, each start from rest', () => {
      const {composer, field, line, transcript} = renderLayout();
      for (let cycle = 0; cycle < 10; cycle++) {
        clock += 10_000;
        showKeyboard(field);
        const isArmed = cycle % 2 === 0;
        const end = isArmed ? line + 40 : line - 20;
        const last = fingerDrag(transcript, 100, end);
        expect(composerOffset(composer) > 0).toBe(isArmed);
        finger(transcript, 'touchend', end, last + 100);
        expect(composerOffset(composer)).toBe(0);
        expect(document.activeElement).toBe(isArmed ? document.body : field);
      }
    });
  });
});

describe('what the drag-to-dismiss loads', () => {
  it('goes through the gesture system’s pan, with no listener of its own', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dismissal = fs.readFileSync(
      path.join(here, 'transcriptDismiss.ts'),
      'utf8',
    );
    expect(dismissal.match(/from '\.\.\/gestures\/[^']*'/g)).toEqual([
      "from '../gestures/PanGestureRecognizer'",
      "from '../gestures/types'",
    ]);
    expect(dismissal).not.toMatch(/addEventListener|subscribeInput/);
  });
});
