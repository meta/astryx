// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file settledBox.test.ts
 * @input Uses vitest, settledBox, a stand-in engine for one layer's box
 * @output Unit tests for the layer box read without its transform
 * @position Testing; validates settledBox.ts
 *
 * SYNC: When settledBox.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {settledBox} from './settledBox';

type Matrix = readonly [number, number, number, number, number, number];

interface Engine {
  /** The layout box, where the position option put the layer. */
  layout: {left: number; top: number; width: number; height: number};
  /** The exact transform the engine applies. */
  matrix: Matrix;
  /** `transform-origin`, px from the box's top-left corner. */
  origin: readonly [number, number];
  transition?: {property: string; duration: string};
  /** The computed `translate`, beside the matrix the engine paints. */
  translate?: string;
  /**
   * The box read is still laid out without the transform that the computed
   * style already reports, as right after a show in Chromium.
   */
  stale?: boolean;
  /** The engine paints `matrix` from `translate` alone: `transform` is none. */
  translateOnly?: boolean;
}

/** A number as an engine serializes a computed transform: six digits. */
function serialized(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/**
 * A layer whose engine paints `engine.matrix` over its layout box, unless an
 * inline `transform: none !important` overrides it, as Chromium does.
 */
function layerIn(engine: Engine): HTMLElement {
  const layer = document.createElement('div');
  document.body.append(layer);
  const isOverridden = () =>
    layer.style.getPropertyValue('transform') === 'none';
  const applied = (): Matrix =>
    isOverridden() ? [1, 0, 0, 1, 0, 0] : engine.matrix;
  const laidOut = (): Matrix => (engine.stale ? [1, 0, 0, 1, 0, 0] : applied());
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    if (element !== layer) {
      throw new Error('read of another element');
    }
    const m = applied();
    const values: Record<string, string> = {
      transform:
        m.join() === '1,0,0,1,0,0' || engine.translateOnly
          ? 'none'
          : `matrix(${m.map(serialized).join(', ')})`,
      translate: isOverridden() ? 'none' : (engine.translate ?? 'none'),
      rotate: 'none',
      scale: 'none',
      'transform-origin': `${engine.origin[0]}px ${engine.origin[1]}px`,
      'transition-property': engine.transition?.property ?? 'all',
      'transition-duration': engine.transition?.duration ?? '0s',
      width: `${engine.layout.width}px`,
      height: `${engine.layout.height}px`,
      'box-sizing': 'border-box',
    };
    return {
      getPropertyValue: (name: string) => values[name] ?? '',
      transform: values.transform,
      translate: values.translate,
      rotate: values.rotate,
      scale: values.scale,
      transformOrigin: values['transform-origin'],
      transitionProperty: values['transition-property'],
      transitionDuration: values['transition-duration'],
    } as unknown as CSSStyleDeclaration;
  });
  layer.getBoundingClientRect = () => {
    const {left, top, width, height} = engine.layout;
    const [a, b, c, d, e, f] = laidOut();
    const [ox, oy] = engine.origin;
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) => [
      left + ox + a * (x - ox) + c * (y - oy) + e,
      top + oy + b * (x - ox) + d * (y - oy) + f,
    ]);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    return new DOMRect(
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
  };
  Object.defineProperty(layer, 'offsetWidth', {
    get: () => Math.round(engine.layout.width),
  });
  Object.defineProperty(layer, 'offsetHeight', {
    get: () => Math.round(engine.layout.height),
  });
  return layer;
}

function edges(rect: DOMRect): number[] {
  return [rect.left, rect.top, rect.right, rect.bottom];
}

/** A Tooltip's box, on the layout grid of 1/64 px. */
const LAYOUT = {
  left: 122.421875,
  top: 367.53125,
  width: 189.828125,
  height: 28.375,
};
/** Its origin at the centre of its bottom edge: it enters from below. */
const ORIGIN = [LAYOUT.width / 2, LAYOUT.height] as const;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('settledBox', () => {
  it('reads a layer with no transform as its box', () => {
    const layer = layerIn({
      layout: LAYOUT,
      matrix: [1, 0, 0, 1, 0, 0],
      origin: ORIGIN,
    });
    expect(edges(settledBox(layer))).toEqual(
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height)),
    );
  });

  it('reads an entering layer at its layout box, exactly, and writes no style', () => {
    const expected = edges(
      new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height),
    );
    // Frames of the entrance: from 8 px below at 95% to rest.
    // Frames whose scale the box size tells apart from 1.
    for (const progress of [0, 0.0159, 0.1, 0.37, 0.5, 0.75]) {
      const scale = 0.95 + 0.05 * progress;
      const layer = layerIn({
        layout: LAYOUT,
        matrix: [scale, 0, 0, scale, 0, 8 * (1 - progress)],
        origin: ORIGIN,
      });
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer)), `progress ${progress}`).toEqual(
        expected,
      );
      expect(write).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('reads a layer that scales unevenly, or mirrors, at its layout box', () => {
    const layer = layerIn({
      layout: LAYOUT,
      matrix: [-0.9, 0, 0, 0.75, -3.25, 12.5],
      origin: [10, 4],
    });
    const write = vi.spyOn(layer.style, 'setProperty');
    expect(edges(settledBox(layer))).toEqual(
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height)),
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('reads a rotated layer under a one-read override, and restores it', () => {
    const angle = (10 * Math.PI) / 180;
    const layer = layerIn({
      layout: LAYOUT,
      matrix: [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ],
      origin: ORIGIN,
    });
    expect(edges(settledBox(layer))).toEqual(
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height)),
    );
    expect(layer.style.getPropertyValue('transform')).toBe('');
  });

  it('reads a rotated layer that transitions its transform without a write, at its whole-pixel size', () => {
    const angle = (10 * Math.PI) / 180;
    const layer = layerIn({
      layout: LAYOUT,
      matrix: [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ],
      origin: ORIGIN,
      transition: {property: 'transform', duration: '0.2s'},
    });
    const write = vi.spyOn(layer.style, 'setProperty');
    const box = settledBox(layer);
    expect(write).not.toHaveBeenCalled();
    expect(box.width).toBe(Math.round(LAYOUT.width));
    expect(box.height).toBe(Math.round(LAYOUT.height));
    const centreX = LAYOUT.left + LAYOUT.width / 2;
    const centreY = LAYOUT.top + LAYOUT.height / 2;
    expect(box.left + box.width / 2).toBeCloseTo(centreX, 0);
    expect(box.top + box.height / 2).toBeCloseTo(centreY, 0);
  });

  describe('reads under the one-read override where calculation cannot undo the transform', () => {
    const entering = (): Engine => ({
      layout: LAYOUT,
      matrix: [0.95, 0, 0, 0.95, 0, 8],
      origin: ORIGIN,
    });
    const layoutEdges = () =>
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height));

    it('while its entrance is still pending', () => {
      const layer = layerIn(entering());
      layer.getAnimations = () => [{pending: true} as Animation];
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).toHaveBeenCalled();
      expect(layer.style.getPropertyValue('transform')).toBe('');
    });

    it('under a CSS zoom other than 1', () => {
      const layer = layerIn(entering());
      Object.defineProperty(layer, 'currentCSSZoom', {value: 2});
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).toHaveBeenCalled();
    });

    it('for a translate given as a percentage', () => {
      const layer = layerIn({...entering(), translate: '10% 0px'});
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).toHaveBeenCalled();
    });

    it('but not for a running entrance at a zoom of 1 with a translate in px', () => {
      const layer = layerIn({...entering(), translate: '0px 0px'});
      layer.getAnimations = () => [{pending: false} as Animation];
      Object.defineProperty(layer, 'currentCSSZoom', {value: 1});
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).not.toHaveBeenCalled();
    });
  });

  describe('reads under the override where the box read may not carry the transform', () => {
    const layoutEdges = () =>
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height));

    it('a box still laid out without the transform its computed style reports', () => {
      const layer = layerIn({
        layout: LAYOUT,
        matrix: [0.970033, 0, 0, 0.970033, 0, 4.79467],
        origin: ORIGIN,
        stale: true,
      });
      layer.getAnimations = () => [{pending: false} as Animation];
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).toHaveBeenCalled();
    });

    it('a scale too near 1 for the box size to show', () => {
      const scale = 0.95 + 0.05 * 0.999;
      const layer = layerIn({
        layout: LAYOUT,
        matrix: [scale, 0, 0, scale, 0, 8 * 0.001],
        origin: ORIGIN,
      });
      const write = vi.spyOn(layer.style, 'setProperty');
      expect(edges(settledBox(layer))).toEqual(layoutEdges());
      expect(write).toHaveBeenCalled();
    });
  });

  it('reads a transitioned layer whose only transform is a one-value translate', () => {
    // Chromium reports `translate: 8px 0px` as `8px`.
    const layer = layerIn({
      layout: LAYOUT,
      matrix: [1, 0, 0, 1, 8, 0],
      origin: ORIGIN,
      translate: '8px',
      translateOnly: true,
      transition: {property: 'transform', duration: '200ms'},
    });
    const write = vi.spyOn(layer.style, 'setProperty');
    expect(edges(settledBox(layer))).toEqual(
      edges(new DOMRect(LAYOUT.left, LAYOUT.top, LAYOUT.width, LAYOUT.height)),
    );
    expect(write).not.toHaveBeenCalled();
  });
});
