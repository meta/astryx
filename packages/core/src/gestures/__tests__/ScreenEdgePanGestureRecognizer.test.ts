// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScreenEdgePanGestureRecognizer.test.ts
 * @input Synthetic touches with explicit timestamps through a GestureArena
 * @output ScreenEdgePanGestureRecognizer's state machine (the edge band, RTL edges, inward movement) and its edge-zone touch-action
 * @position Unit tests of packages/core/src/gestures/ScreenEdgePanGestureRecognizer.ts
 */

import {describe, expect, it} from 'vitest';
import {UIKIT_SCREEN_EDGE_PAN} from '../../motion/uikit/gestures';
import {ALL_NATIVE_TOUCH} from '../GestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {createHarness} from './harness';

describe('ScreenEdgePanGestureRecognizer', () => {
  it('begins from the leading band and fails elsewhere at touch-down', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(40, 4, 50);
    expect(h.log[0]).toMatch(/^edge:began@/);
    expect(edge.activeEdge).toBe('left');

    const middle = createHarness();
    const miss = new ScreenEdgePanGestureRecognizer({name: 'miss'});
    middle.finger(1).down(60, 300, 0, {recognizers: [miss]});
    expect(middle.log).toEqual(['miss:failed@0']);
  });

  it('resolves the leading edge under RTL and requires inward movement', () => {
    const h = createHarness();
    h.environment.rtl = true;
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(385, 300, 0, {recognizers: [edge]})
      .drag(-40, 2, 50);
    expect(edge.activeEdge).toBe('right');
    expect(h.log[0]).toMatch(/^edge:began@/);

    const outward = createHarness();
    const back = new ScreenEdgePanGestureRecognizer({name: 'back'});
    outward
      .finger(1)
      .down(10, 300, 0, {recognizers: [back]})
      .drag(-8, 30, 50);
    expect(back.state).toBe('failed');
  });

  it('a drag 5 pt inward and then down the edge is the page\u2019s scroll: it fails and claims nothing (spec:AST-094 FR19)', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(5, 0, 30)
      .drag(0, 20, 50);
    expect(edge.state).toBe('failed');
    expect(h.claims).toEqual([]);
  });

  it('leaves a view wider than the edge zone every touch behavior, so its scrolling is untouched (spec:AST-094 FR18)', () => {
    expect(new ScreenEdgePanGestureRecognizer().nativeTouchBehavior).toEqual(
      ALL_NATIVE_TOUCH,
    );
    const page = new ScreenEdgePanGestureRecognizer();
    page.view = viewOfSize(390, 844);
    expect(page.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
    // A pan from several edges too, off their zones.
    expect(
      new ScreenEdgePanGestureRecognizer({edges: ['left', 'right']})
        .nativeTouchBehavior,
    ).toEqual(ALL_NATIVE_TOUCH);
  });

  it('takes the axis across its edge in the edge zone, a view no wider than the edge region (spec:AST-094 FR18)', () => {
    const leading = new ScreenEdgePanGestureRecognizer();
    leading.view = viewOfSize(leading.edgeRegion, 844);
    expect(leading.nativeTouchBehavior).toEqual({
      panX: false,
      panY: true,
      pinchZoom: true,
      doubleTapZoom: false,
    });
    const bottom = new ScreenEdgePanGestureRecognizer({edges: ['bottom']});
    bottom.view = viewOfSize(390, 12);
    expect(bottom.nativeTouchBehavior).toEqual({
      panX: true,
      panY: false,
      pinchZoom: true,
      doubleTapZoom: false,
    });
    // One pixel wider than the band is not the edge zone.
    const wide = new ScreenEdgePanGestureRecognizer();
    wide.view = viewOfSize(wide.edgeRegion + 1, 844);
    expect(wide.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
  });

  it('takes a strip authored at the edge region as the edge zone though layout lays it out at 40.203 px', () => {
    const strip = new ScreenEdgePanGestureRecognizer();
    // 40.2 px snapped to layout's 1/64 px.
    strip.view = viewOfSize(Math.ceil(strip.edgeRegion * 64) / 64, 844);
    expect(strip.nativeTouchBehavior).toEqual({
      panX: false,
      panY: true,
      pinchZoom: true,
      doubleTapZoom: false,
    });
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.environment.view = {width: 40.203, height: 844};
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(2, 0, 50);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });

  it('in the edge zone, still decides at its hysteresis', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.environment.view = {width: edge.edgeRegion, height: 844};
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(2, 0, 50);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });
});

describe('an in-band touch on a wider element (spec:AST-094 FR18, DEC-13)', () => {
  it('decides at 15 px whatever the element\u2019s width, and tracks the travel past it', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    // A stack container: as wide as the screen, the touch 4 px from its edge.
    h.environment.view = {width: 390, height: 844};
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30, 14);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(1, 0, 10, 1);
    expect(h.log[0]).toMatch(/^edge:began@/);
    h.finger(1).drag(25, 0, 50, 5);
    expect(edge.translation().x).toBeCloseTo(40 - hysteresis, 5);
  });

  it('from several edges too', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['left', 'right'],
    });
    h.environment.view = {width: 390, height: 844};
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30, 14);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(1, 0, 10, 1);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });
});

describe('a pan from several edges (spec:AST-094 FR18)', () => {
  it('outside every edge zone leaves the browser every touch behavior', () => {
    const edge = new ScreenEdgePanGestureRecognizer({
      edges: ['left', 'bottom'],
    });
    edge.view = viewOfSize(390, 844);
    expect(edge.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
  });

  it('inside a side edge zone claims pan-x only', () => {
    const edge = new ScreenEdgePanGestureRecognizer({
      edges: ['left', 'bottom'],
    });
    edge.view = viewOfSize(edge.edgeRegion, 844);
    expect(edge.nativeTouchBehavior).toEqual({
      panX: false,
      panY: true,
      pinchZoom: true,
      doubleTapZoom: false,
    });
  });

  it('inside a bottom edge zone claims pan-y only', () => {
    const edge = new ScreenEdgePanGestureRecognizer({
      edges: ['left', 'bottom'],
    });
    edge.view = viewOfSize(390, edge.edgeRegion);
    expect(edge.nativeTouchBehavior).toEqual({
      panX: true,
      panY: false,
      pinchZoom: true,
      doubleTapZoom: false,
    });
  });
});

/** An element whose box has `width` × `height`, as layout would give it. */
function viewOfSize(width: number, height: number): HTMLElement {
  const view = document.createElement('div');
  view.getBoundingClientRect = () =>
    ({width, height, top: 0, left: 0, right: width, bottom: height}) as DOMRect;
  return view;
}
