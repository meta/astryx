// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file watcherRecognizer.test.ts
 * @input Uses vitest, the arena harness, GestureHost and the pan recognizer
 * @output Checks the `claimsTouches: false` watcher: it never claims or
 *   blocks a scroll, prevents nothing and is prevented by nothing, and
 *   follows a touch the browser takes for a scroll to the lift
 * @position Test for GestureRecognizerOptions.claimsTouches
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {GestureHost} from '../GestureHost';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {createHarness, ManualClock} from './harness';

describe('a recognizer that never claims (a watcher)', () => {
  let detach: (() => void)[] = [];
  afterEach(() => {
    detach.forEach(release => release());
    detach = [];
    document.body.innerHTML = '';
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
});
