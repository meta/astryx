// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file arenaContinuous.test.ts
 * @input GestureArena with pans, long presses, taps, consumers and scroll
 *   probes, driven by synthetic touches with explicit timestamps
 * @output The pan's conflicts: native scrolling (failing, scroll edge,
 *   handoff), long press vs pan, nested pans, delegate hooks, two fingers on
 *   two views, delivery while moving, cancellation from code, the clock
 * @position Unit tests of packages/core/src/gestures/GestureArena.ts
 */

import {describe, expect, it} from 'vitest';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';
import {createHarness, RecordingConsumer, scrollProbe} from './harness';

describe('conflict matrix', () => {
  it('pan vs native scroll: the browser taking the touch fails a possible pan', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan', direction: 'vertical'});
    h.finger(1)
      .down(0, 100, 0, {recognizers: [pan]})
      .move(0, 105, 16);
    h.finger(1).takenByBrowser(24);
    // The touch is gone from the pan, so it is ready for the next one.
    expect(h.log).toEqual(['pan:failed@24', 'pan:possible@24']);
    expect(h.claims).toEqual([]);
  });

  it('pan at a scroll edge (scrollEdge): begins and claims when the content cannot scroll that way', () => {
    const atTop = createHarness();
    const sheet = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'down',
      scrollEdge: true,
    });
    // Content at its top: a finger moving down scrolls nothing.
    const probe = scrollProbe((_dx, dy) => dy < 0);
    atTop.finger(1).down(0, 100, 0, {recognizers: [sheet], scroll: probe});
    atTop.finger(1).drag(0, 30, 50, 5);
    expect(atTop.log[0]).toBe('sheet:began@20');
    expect(atTop.claims).toEqual([1]);

    const midContent = createHarness();
    const scrolled = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'down',
      scrollEdge: true,
    });
    const canScrollUp = scrollProbe(() => true);
    midContent.finger(1).down(0, 100, 0, {
      recognizers: [scrolled],
      scroll: canScrollUp,
    });
    midContent.finger(1).drag(0, 30, 50, 5);
    expect(midContent.log).toEqual(['sheet:failed@20']);
  });

  it("a drag that began as a scroll stays the browser's past the content's edge (spec:AST-094 FR14)", () => {
    const h = createHarness();
    const sheet = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'down',
      scrollEdge: true,
    });
    let scrollTop = 30;
    const finger = h.finger(1).down(0, 100, 0, {
      recognizers: [sheet],
      scroll: scrollProbe(() => scrollTop > 0),
    });
    // The content scrolls toward its top: the drag is the browser's.
    finger.move(0, 120, 16);
    finger.takenByBrowser(20);
    // It reaches its top mid-gesture; the finger keeps pulling.
    scrollTop = 0;
    finger.move(0, 160, 32);
    finger.move(0, 200, 48);
    finger.up(64);
    // It failed at its first move and is reset when the browser takes the
    // touch: it never begins, however far the finger pulls.
    expect(h.log).toEqual(['sheet:failed@16', 'sheet:possible@20']);
  });

  it('long press vs pan: holding still wins for the long press', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1).down(0, 0, 0, {recognizers: [press, pan]});
    h.advance(500);
    expect(h.log).toEqual(['press:began@500', 'pan:failed@500']);
    h.finger(1).move(80, 0, 600);
    expect(press.state).toBe('changed');
    expect(pan.state).toBe('failed');
    expect(h.claims).toEqual([1]);
  });

  it('long press vs pan: moving first wins for the pan', () => {
    const h = createHarness();
    const press = new LongPressGestureRecognizer({name: 'press'});
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1).down(0, 0, 0, {recognizers: [press, pan]});
    h.finger(1).move(5, 0, 100).move(12, 0, 120);
    expect(h.log).toEqual(['press:failed@120', 'pan:began@120']);
    h.advance(600);
    expect(press.state).toBe('failed');
  });

  it('nested pans that both qualify on the same move: the innermost wins', () => {
    const h = createHarness();
    const inner = new PanGestureRecognizer({name: 'inner'});
    const outer = new PanGestureRecognizer({name: 'outer'});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [inner, outer]})
      .move(20, 0, 16);
    expect(h.log).toEqual(['inner:began@16', 'outer:failed@16']);
  });

  it('honors shouldBegin and shouldReceiveTouch', () => {
    const h = createHarness();
    const refused = new PanGestureRecognizer({
      name: 'refused',
      shouldBegin: () => false,
    });
    const blind = new TapGestureRecognizer({
      name: 'blind',
      shouldReceiveTouch: () => false,
    });
    h.finger(1)
      .down(0, 0, 0, {recognizers: [refused, blind]})
      .move(30, 0, 16);
    expect(h.log).toEqual(['refused:failed@16']);
    expect(blind.numberOfTouches).toBe(0);
  });

  it('two fingers on two unrelated views drive two pans at once', () => {
    const h = createHarness();
    const left = new PanGestureRecognizer({name: 'left'});
    const right = new PanGestureRecognizer({name: 'right'});
    h.finger(1).down(50, 300, 0, {recognizers: [left]});
    h.finger(2).down(300, 300, 0, {recognizers: [right]});
    h.finger(1).move(50, 340, 16);
    h.finger(2).move(300, 260, 16);
    expect(left.state).toBe('began');
    expect(right.state).toBe('began');
  });
});

describe('delivery to the view', () => {
  it('delivers an unclaimed touch to the consumer and allows its click', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const pan = new PanGestureRecognizer({name: 'pan'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [pan], consumer});
    finger.move(3, 0, 16);
    expect(finger.up(60)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'moved:1', 'ended:1']);
  });

  it('cancels the view and swallows the click when a recognizer takes the touch', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const pan = new PanGestureRecognizer({name: 'pan'});
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [pan], consumer});
    finger.move(30, 0, 16).move(40, 0, 32);
    expect(consumer.events).toEqual(['began:1', 'cancelled:1']);
    expect(finger.up(60)).toBe('suppress');
  });

  it('keeps the view and the click with cancelsTouchesInView off', () => {
    const h = createHarness();
    const consumer = new RecordingConsumer();
    const pan = new PanGestureRecognizer({
      name: 'pan',
      cancelsTouchesInView: false,
    });
    const finger = h.finger(1).down(0, 0, 0, {recognizers: [pan], consumer});
    finger.move(30, 0, 16);
    expect(finger.up(60)).toBe('allow');
    expect(consumer.events).toEqual(['began:1', 'moved:1', 'ended:1']);
  });
});

describe('cancellation', () => {
  it('stop() cancels an active recognizer from code', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1)
      .down(0, 0, 0, {recognizers: [pan]})
      .move(30, 0, 16);
    pan.cancel();
    expect(pan.state).toBe('cancelled');
    h.finger(1).move(60, 0, 32);
    expect(pan.state).toBe('cancelled');
    h.finger(1).up(48);
    expect(pan.state).toBe('possible');
  });

  it('never moves the event clock backwards', () => {
    const h = createHarness();
    const pan = new PanGestureRecognizer({name: 'pan'});
    h.finger(1).down(0, 0, 100, {recognizers: [pan]});
    h.finger(1).move(30, 0, 90);
    expect(h.log).toEqual(['pan:began@100']);
  });
});
