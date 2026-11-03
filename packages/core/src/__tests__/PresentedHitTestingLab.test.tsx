// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PresentedHitTestingLab.test.tsx
 * @input Uses PresentedHitTestingLab, stubMatchMedia and Testing Library
 * @output Tests for the device-check harness's readouts
 * @position The harness measures every touch at the page root, because on
 *   iOS WebKit a touch on the moving sheet targets the scrim.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {coarsePrimaryPointer} from '../gestures/__tests__/pointerQuery';
import {registerPresentedOffset} from '../motion/presentation';
import {PresentedHitTestingLab} from './PresentedHitTestingLab';
import {stubMatchMedia} from './stubMatchMedia';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const rect = ({left, top, right, bottom}: Box): DOMRect => ({
  left,
  top,
  right,
  bottom,
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
  toJSON: () => ({}),
});

const inside = (box: Box, x: number, y: number) =>
  x >= box.left && x < box.right && y >= box.top && y < box.bottom;

/** A touch the engine sends to `target`, at `at`. */
function touch(
  type: 'touchstart' | 'touchend',
  target: EventTarget,
  at: {x: number; y: number},
  time: number,
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const contact = {identifier: 1, clientX: at.x, clientY: at.y, target};
  Object.defineProperty(event, 'changedTouches', {value: [contact]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [contact],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  target.dispatchEvent(event);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementsFromPoint');
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('PresentedHitTestingLab', () => {
  it('logs and measures a touch that the engine sends to the scrim', () => {
    stubMatchMedia({reduceMotion: false, matches: false});
    render(<PresentedHitTestingLab />);
    // The scrim sits just before the sheet.
    const scrim = screen.getByRole('region', {
      name: 'Sheet',
    }).previousElementSibling;
    if (scrim == null) {
      throw new Error('no scrim');
    }
    fireEvent.touchStart(scrim, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchEnd(scrim, {touches: []});
    expect(
      screen.getByText(/touch-down: the engine hit-tested the scrim/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/page scrolled 0 px in the last touch/),
    ).toBeInTheDocument();
  });

  it('says when Reduce Motion is on, since the sheet then does not move', () => {
    stubMatchMedia({reduceMotion: true, matches: false});
    render(<PresentedHitTestingLab />);
    expect(screen.getByText(/Reduce Motion is on/)).toBeInTheDocument();
  });

  it('with the correction on in iOS WebKit, a tap on the drawn Done clicks it, though the engine hit-tests the scrim', () => {
    const restorePointer = coarsePrimaryPointer();
    vi.stubGlobal('CSS', {
      ...globalThis.CSS,
      supports: (query: string) => query === '(-webkit-touch-callout: none)',
    });
    render(<PresentedHitTestingLab />);
    const sheet = screen.getByRole('region', {name: 'Sheet'});
    const done = screen.getByRole('button', {name: 'Done'});
    const scrim = sheet.previousElementSibling;
    if (scrim == null) {
      throw new Error('no scrim');
    }
    // The sheet's motion started below the screen, where iOS WebKit still
    // hit-tests it, and it is drawn 544 px higher.
    const sheetBox: Box = {left: 0, top: 844, right: 390, bottom: 1244};
    const doneBox: Box = {left: 300, top: 854, right: 380, bottom: 894};
    let resolvedY = 0;
    const moved = (box: Box): Box => ({
      ...box,
      top: box.top + resolvedY,
      bottom: box.bottom + resolvedY,
    });
    vi.spyOn(sheet, 'getBoundingClientRect').mockImplementation(() =>
      rect(moved(sheetBox)),
    );
    vi.spyOn(done, 'getBoundingClientRect').mockImplementation(() =>
      rect(moved(doneBox)),
    );
    const stack = (x: number, y: number): Element[] => [
      ...(inside(moved(doneBox), x, y) ? [done] : []),
      ...(inside(moved(sheetBox), x, y) ? [sheet] : []),
      scrim,
      document.body,
      document.documentElement,
    ];
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: stack,
    });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) => stack(x, y)[0],
    });
    const unregister = registerPresentedOffset(sheet, {
      offset: () => ({x: 0, y: -544 - resolvedY}),
      resolve: () => {
        resolvedY = -544;
      },
    });
    const onDrawnDone = {x: 340, y: 330};
    act(() => {
      touch('touchstart', scrim, onDrawnDone, 0);
      touch('touchend', scrim, onDrawnDone, 80);
    });
    unregister();
    restorePointer();
    expect(
      screen.getByText(/Done clicked 1 · scrim took 0/),
    ).toBeInTheDocument();
  });
});
