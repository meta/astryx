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

  it("is a finger's only: a mouse or a pen dragging from the band never begins it, even when the options list them (spec:AST-094 FR43)", () => {
    for (const pointerType of ['mouse', 'pen'] as const) {
      const h = createHarness();
      const options = {
        name: 'edge',
        allowedPointerTypes: ['touch', 'mouse', 'pen'],
      } as ConstructorParameters<typeof ScreenEdgePanGestureRecognizer>[0];
      const edge = new ScreenEdgePanGestureRecognizer(options);
      h.finger(1)
        .down(10, 300, 0, {recognizers: [edge], pointerType})
        .drag(40, 4, 50);
      expect(edge.state).toBe('possible');
      expect(h.log).toEqual([]);
    }
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge], pointerType: 'touch'})
      .drag(40, 4, 50);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });

  it('forgets the edge a gesture started from once it ends', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.finger(1)
      .down(10, 300, 0, {recognizers: [edge]})
      .drag(40, 4, 50);
    expect(edge.activeEdge).toBe('left');
    h.finger(1).up(80);
    expect(edge.activeEdge).toBeNull();
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
      new ScreenEdgePanGestureRecognizer({edges: ['leading', 'trailing']})
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

describe('where an in-band touch decides (spec:AST-094 FR18, DEC-22)', () => {
  it('on an element that reaches beyond the band, at 10 px, before the browser commits to a scroll', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    // A stack container: as wide as the screen, the touch 4 px from its edge.
    h.environment.view = {width: 390, height: 844};
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(9, 0, 30, 9);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(1, 0, 10, 1);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });

  it('on an element within the band, at 15 px', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    h.environment.view = {width: edge.edgeRegion, height: 844};
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30, 14);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(1, 0, 10, 1);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });

  it('from several edges, at 10 px on an element beyond their bands', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['leading', 'trailing'],
    });
    h.environment.view = {width: 390, height: 844};
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(9, 0, 30, 9);
    expect(edge.state).toBe('possible');
    h.finger(1).drag(1, 0, 10, 1);
    expect(h.log[0]).toMatch(/^edge:began@/);
  });
});

describe('a pan from both edges (spec:AST-094 FR18)', () => {
  it('outside every edge zone leaves the browser every touch behavior', () => {
    const edge = new ScreenEdgePanGestureRecognizer({
      edges: ['leading', 'trailing'],
    });
    edge.view = viewOfSize(390, 844);
    expect(edge.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
  });

  it('inside either edge zone claims pan-x only', () => {
    const leading = new ScreenEdgePanGestureRecognizer({
      edges: ['leading', 'trailing'],
    });
    leading.view = viewOfSize(leading.edgeRegion, 844);
    const trailing = new ScreenEdgePanGestureRecognizer({
      edges: ['leading', 'trailing'],
    });
    trailing.view = viewAt(window.innerWidth - 20, 20, 844);
    for (const edge of [leading, trailing]) {
      expect(edge.nativeTouchBehavior).toEqual({
        panX: false,
        panY: true,
        pinchZoom: true,
        doubleTapZoom: false,
      });
    }
  });
});

describe('the edge zone (spec:AST-094 FR18, FR19, DEC-22)', () => {
  it('is a view that lies within the band at its edge, not merely a thin one', () => {
    const claim = {
      panX: false,
      panY: true,
      pinchZoom: true,
      doubleTapZoom: false,
    };
    // Thin, but in the middle of the screen.
    const middle = new ScreenEdgePanGestureRecognizer();
    middle.view = viewAt(200, 20, 844);
    expect(middle.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
    // Thin and at the leading edge.
    const atLeading = new ScreenEdgePanGestureRecognizer();
    atLeading.view = viewAt(0, 20, 844);
    expect(atLeading.nativeTouchBehavior).toEqual(claim);
    // At the trailing edge, for a trailing pan only.
    const trailing = new ScreenEdgePanGestureRecognizer({edges: ['trailing']});
    trailing.view = viewAt(window.innerWidth - 20, 20, 844);
    expect(trailing.nativeTouchBehavior).toEqual(claim);
    const wrongEdge = new ScreenEdgePanGestureRecognizer({edges: ['trailing']});
    wrongEdge.view = viewAt(0, 20, 844);
    expect(wrongEdge.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
  });

  it('is measured once for both touch-action and the touch-down decision, and again on a layout change, which says so', () => {
    const h = createHarness();
    const edge = new ScreenEdgePanGestureRecognizer({name: 'edge'});
    let changes = 0;
    edge.onTouchBehaviorChange = () => {
      changes += 1;
    };
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.environment.view = {left: 0, top: 0, width: edge.edgeRegion, height: 844};
    h.finger(1)
      .down(4, 300, 0, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30, hysteresis - 1);
    expect(edge.state).toBe('possible');
    h.finger(1).up(40);
    expect(edge.nativeTouchBehavior.panX).toBe(false);
    // The view grows with no layout change reported: touch-action and the
    // next touch-down still share the answer in force.
    h.environment.view = {left: 0, top: 0, width: 390, height: 844};
    expect(edge.nativeTouchBehavior.panX).toBe(false);
    h.finger(2)
      .down(4, 300, 100, {recognizers: [edge]})
      .drag(hysteresis - 1, 0, 30, hysteresis - 1);
    expect(edge.state).toBe('possible');
    h.finger(2).up(140);
    expect(changes).toBe(0);
    // Reported: measured again, the change is announced, and both follow.
    edge.layoutChanged();
    expect(changes).toBe(1);
    expect(edge.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
    h.finger(3)
      .down(4, 300, 200, {recognizers: [edge]})
      .drag(9, 0, 30, 9);
    expect(edge.state).toBe('possible');
    h.finger(3).drag(1, 0, 10, 1);
    expect(edge.state).toBe('began');
    // A layout change that leaves the answer as it was says nothing.
    edge.layoutChanged();
    expect(changes).toBe(1);
  });
});

describe('what the host watches for the edge zone (spec:AST-094 FR19, FR24)', () => {
  it('needs the viewport only for a pan that watches the right side, whose band moves with it', () => {
    const cases: [
      ReadonlyArray<'leading' | 'trailing'>,
      'ltr' | 'rtl',
      boolean,
    ][] = [
      [['leading'], 'ltr', false],
      [['trailing'], 'ltr', true],
      [['leading'], 'rtl', true],
      [['trailing'], 'rtl', false],
      [['leading', 'trailing'], 'ltr', true],
    ];
    for (const [edges, direction, expected] of cases) {
      const pan = new ScreenEdgePanGestureRecognizer({edges});
      pan.view = viewAt(0, 20, 844, direction);
      expect([edges.join('+'), direction, pan.watchesViewport]).toEqual([
        edges.join('+'),
        direction,
        expected,
      ]);
    }
  });
});

describe('a writing direction switched in place (design:bidirectionality DR13)', () => {
  it('measures its edges again at touch-down when the view turns RTL with no resize, and announces the change', () => {
    const width = window.innerWidth;
    const h = createHarness();
    h.environment.width = width;
    h.environment.view = {left: 0, top: 0, width, height: 844};
    const pan = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['leading'],
    });
    const view = viewAt(0, width, 844, 'ltr');
    pan.view = view;
    let announced = 0;
    pan.onTouchBehaviorChange = () => {
      announced += 1;
    };
    // Measured under LTR: the leading edge is the left one, so a touch in
    // the right band fails at once.
    expect(pan.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
    h.finger(1)
      .down(width - 4, 300, 0, {recognizers: [pan]})
      .drag(-20, 0, 40);
    expect(h.log.some(line => line.startsWith('edge:began'))).toBe(false);
    h.finger(1).up(60);
    expect(announced).toBe(0);
    // The page turns RTL in place: no resize, so no layout report.
    view.style.direction = 'rtl';
    h.environment.rtl = true;
    const before = h.log.length;
    h.finger(2)
      .down(width - 4, 300, 200, {recognizers: [pan]})
      .drag(-20, 0, 40);
    expect(
      h.log.slice(before).some(line => line.startsWith('edge:began')),
    ).toBe(true);
    expect(pan.activeEdge).toBe('right');
    expect(announced).toBe(1);
    h.finger(2).up(260);
  });

  it("decides the touch that measures again at FR19's 10 px when the touch-action in force left the browser the axis, and the next at UIKit's 15 px (spec:AST-094 FR19)", () => {
    const width = window.innerWidth;
    const h = createHarness();
    h.environment.width = width;
    const pan = new ScreenEdgePanGestureRecognizer({
      name: 'edge',
      edges: ['leading'],
    });
    const region = pan.edgeRegion;
    // A strip at the right edge: under LTR the leading edge is the left one,
    // so the strip is out of the zone and its touch-action leaves the
    // browser pan-x.
    const view = viewAt(width - region, region, 844, 'ltr');
    pan.view = view;
    h.environment.view = {
      left: width - region,
      top: 0,
      width: region,
      height: 844,
    };
    expect(pan.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
    // The page turns RTL in place: the strip is in the leading band now.
    view.style.direction = 'rtl';
    h.environment.rtl = true;
    // This touch landed under the touch-action from before the switch, with
    // pan-x the browser's: it decides at 10 px, before the browser commits.
    h.finger(1)
      .down(width - 4, 300, 0, {recognizers: [pan]})
      .drag(-9, 0, 30, 9);
    expect(pan.state).toBe('possible');
    h.finger(1).drag(-1, 0, 10, 1);
    expect(pan.state).toBe('began');
    h.finger(1).up(60);
    // The change was announced, so the next touch lands under pan-x
    // claimed: UIKit's 15 px.
    expect(pan.nativeTouchBehavior.panX).toBe(false);
    const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
    h.finger(2)
      .down(width - 4, 300, 200, {recognizers: [pan]})
      .drag(-(hysteresis - 1), 0, 30, hysteresis - 1);
    expect(pan.state).toBe('possible');
    h.finger(2).drag(-1, 0, 10, 1);
    expect(pan.state).toBe('began');
    h.finger(2).up(260);
  });
});

describe('each writing direction and edge, before a touch, at touch-down and after a resize (spec:AST-094 FR18, FR19, DEC-13, DEC-22)', () => {
  const claim = {
    panX: false,
    panY: true,
    pinchZoom: true,
    doubleTapZoom: false,
  };
  const hysteresis = UIKIT_SCREEN_EDGE_PAN.hysteresis.value;
  for (const rtl of [false, true]) {
    for (const edge of ['leading', 'trailing'] as const) {
      const physical = (edge === 'leading') !== rtl ? 'left' : 'right';
      it(`${rtl ? 'RTL' : 'LTR'} ${edge}, the ${physical} edge: touch-action and the touch-down decision agree`, () => {
        const width = window.innerWidth;
        const h = createHarness();
        h.environment.rtl = rtl;
        h.environment.width = width;
        const left = physical === 'left' ? 0 : width - 20;
        h.environment.view = {left, top: 0, width: 20, height: 844};
        const pan = new ScreenEdgePanGestureRecognizer({
          name: 'edge',
          edges: [edge],
        });
        // The element a host gives it, laid out with its own direction.
        pan.view = viewAt(left, 20, 844, rtl ? 'rtl' : 'ltr');
        // Before any touch, as the host derives touch-action: pan-x is taken.
        expect(pan.nativeTouchBehavior).toEqual(claim);
        // At touch-down, a touch in that band decides at 15 px, as the claim
        // allows.
        const x = physical === 'left' ? 4 : width - 4;
        const inward = physical === 'left' ? 1 : -1;
        h.finger(1)
          .down(x, 300, 0, {recognizers: [pan]})
          .drag(inward * (hysteresis - 1), 0, 30, hysteresis - 1);
        expect(pan.state).toBe('possible');
        h.finger(1).drag(inward * 2, 0, 20, 2);
        expect(['began', 'changed']).toContain(pan.state);
        h.finger(1).up(80);
        // After a resize past the band: no claim, and the next touch decides
        // at 10 px.
        h.environment.view = {left: 0, top: 0, width, height: 844};
        pan.view = viewAt(0, width, 844, rtl ? 'rtl' : 'ltr');
        pan.layoutChanged();
        expect(pan.nativeTouchBehavior).toEqual(ALL_NATIVE_TOUCH);
        h.finger(2)
          .down(x, 300, 200, {recognizers: [pan]})
          .drag(inward * 9, 0, 30, 9);
        expect(pan.state).toBe('possible');
        h.finger(2).drag(inward, 0, 10, 1);
        expect(['began', 'changed']).toContain(pan.state);
        h.finger(2).up(280);
      });
    }
  }
});

/** An element whose box has `width` × `height`, as layout would give it. */
function viewOfSize(width: number, height: number): HTMLElement {
  const view = document.createElement('div');
  view.getBoundingClientRect = () =>
    ({width, height, top: 0, left: 0, right: width, bottom: height}) as DOMRect;
  return view;
}

/**
 * An element whose box starts `left` px from the viewport's left edge, in
 * the document with the writing direction given.
 */
function viewAt(
  left: number,
  width: number,
  height: number,
  direction: 'ltr' | 'rtl' = 'ltr',
): HTMLElement {
  const view = document.createElement('div');
  view.style.direction = direction;
  document.body.append(view);
  view.getBoundingClientRect = () =>
    ({
      width,
      height,
      top: 0,
      left,
      right: left + width,
      bottom: height,
      x: left,
      y: 0,
    }) as DOMRect;
  return view;
}
