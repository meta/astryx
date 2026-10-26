// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file watcherRecognizer.test.ts
 * @input Uses vitest, the arena harness, GestureHost and the pan recognizer
 * @output Checks the `claimsTouches: false` watcher: it never claims or
 *   blocks a scroll, prevents nothing and is prevented by nothing, and
 *   follows a touch the browser takes for a scroll to the lift
 * @position Test for GestureRecognizerOptions.claimsTouches
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {createHarness, ManualClock, RecordingConsumer} from './harness';
import {coarsePrimaryPointer} from './pointerQuery';

describe('a recognizer that never claims (a watcher)', () => {
  let detach: (() => void)[] = [];
  // A phone: the host attaches only where the primary pointer is coarse.
  let restorePointer: () => void;
  beforeEach(() => {
    restorePointer = coarsePrimaryPointer();
  });
  afterEach(() => {
    detach.forEach(release => release());
    detach = [];
    document.body.innerHTML = '';
    restorePointer();
  });

  it('runs alongside a claiming pan on the same touch, and claims nothing', () => {
    const h = createHarness();
    const watcher = new PanGestureRecognizer({
      name: 'watcher',
      direction: 'vertical',
      claimsTouches: false,
    });
    const sheet = new PanGestureRecognizer({
      name: 'sheet',
      direction: 'vertical',
    });
    const finger = h
      .finger(1)
      .down(0, 100, 0, {recognizers: [sheet, watcher]})
      .move(0, 115, 16);
    expect(watcher.state).toBe('began');
    expect(sheet.state).toBe('began');
    expect(h.claims).toEqual([1]);
    finger.up(32);
  });

  it('cancels no press under it when it begins: a held control keeps its touch (spec:AST-094 FR15, FR19)', () => {
    const h = createHarness();
    const watcher = new PanGestureRecognizer({
      name: 'watcher',
      direction: 'vertical',
      claimsTouches: false,
    });
    const press = new RecordingConsumer();
    const finger = h
      .finger(1)
      .down(0, 100, 0, {recognizers: [watcher], consumer: press})
      .move(0, 130, 16);
    expect(watcher.state).toBe('began');
    expect(press.events).not.toContain('cancelled:1');
    finger.up(32);
    expect(press.events).toContain('ended:1');
  });

  it('follows a touch the browser took for a scroll until the lift', () => {
    const h = createHarness();
    const watcher = new PanGestureRecognizer({
      name: 'watcher',
      direction: 'vertical',
      claimsTouches: false,
    });
    const finger = h
      .finger(1)
      .down(0, 100, 0, {recognizers: [watcher]})
      .move(0, 115, 16);
    expect(watcher.state).toBe('began');
    finger.takenByBrowser(20);
    finger.move(0, 160, 32);
    expect(watcher.state).toBe('changed');
    finger.up(48);
    expect(h.log).toContain('watcher:ended@48');
  });

  it('gets only passive touchmove listeners from the host', () => {
    document.body.innerHTML = '<div id="page"></div>';
    const page = document.getElementById('page') as HTMLElement;
    const host = new GestureHost(document, {clock: new ManualClock()});
    const added = vi.spyOn(page, 'addEventListener');
    detach.push(
      host.attach(
        page,
        new PanGestureRecognizer({
          name: 'watcher',
          direction: 'vertical',
          claimsTouches: false,
        }),
        {manageStyle: false},
      ),
    );
    const event = new Event('touchstart', {bubbles: true, cancelable: true});
    const entry = {identifier: 1, clientX: 10, clientY: 10, target: page};
    Object.defineProperty(event, 'changedTouches', {value: [entry]});
    Object.defineProperty(event, 'touches', {value: [entry]});
    page.dispatchEvent(event);
    const blocking = added.mock.calls.filter(
      ([type, , options]) =>
        type === 'touchmove' &&
        (options as AddEventListenerOptions | undefined)?.passive === false,
    );
    expect(blocking).toHaveLength(0);
  });

  it('leaves the browser every touch behavior: its direction writes no touch-action', () => {
    document.body.innerHTML = '<div id="list"></div><div id="row"></div>';
    const list = document.getElementById('list') as HTMLElement;
    const row = document.getElementById('row') as HTMLElement;
    const host = new GestureHost(document, {clock: new ManualClock()});
    const listStyle = vi.spyOn(list.style, 'setProperty');
    detach.push(
      host.attach(
        list,
        new PanGestureRecognizer({
          name: 'watcher',
          direction: 'vertical',
          claimsTouches: false,
        }),
      ),
      host.attach(
        row,
        new PanGestureRecognizer({
          name: 'watcher',
          direction: 'vertical',
          claimsTouches: false,
        }),
      ),
      // A claiming pan beside it on the same element keeps its own.
      host.attach(
        row,
        new PanGestureRecognizer({name: 'swipe', direction: 'horizontal'}),
      ),
    );
    expect(list.hasAttribute('data-astryx-touch-action')).toBe(false);
    expect(row.getAttribute('data-astryx-touch-action')).toBe(
      'pan-y pinch-zoom',
    );
    expect(listStyle).not.toHaveBeenCalledWith(
      'touch-action',
      expect.anything(),
    );
  });
});
