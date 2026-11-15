// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file settledBox.ts
 * @input A layer element
 * @output Exports `settledBox`: the layer's box where its position option put
 *   it, without the transform an entrance (or anything else) applies to it
 * @position Layer runtime: the one box read the fallback order, the software
 *   keyboard's cap and the exit copy measure with. Its readers are listed
 *   below.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/useLayer.tsx
 * - /packages/core/src/Layer/useLayerKeyboardClearance.ts
 * - /packages/core/src/Layer/layerExitCopy.ts
 */

const TRANSFORM_PROPERTIES = ['transform', 'translate', 'scale', 'rotate'];

/** A 2D affine matrix in the order CSS `matrix()` lists it: a, b, c, d, e, f. */
type Matrix2D = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix2D = [1, 0, 0, 1, 0, 0];

/**
 * Chromium and WebKit place layout boxes on a 1/64 px grid. The computed
 * transform keeps six digits, so a derived edge can miss that grid by
 * millionths of a px. An edge that close moves onto the grid. Firefox uses a
 * 1/60 px grid, so its edges stay as derived.
 */
const LAYOUT_UNITS_PER_PX = 64;
const GRID_TOLERANCE_PX = 1 / 2048;

/** How much nearer the scaled size must be, px, for the box to carry it. */
const SCALE_TOLERANCE_PX = 1 / 32;

function hasTransform(style: CSSStyleDeclaration): boolean {
  return TRANSFORM_PROPERTIES.some(name => {
    const value = style.getPropertyValue(name);
    return value !== '' && value !== 'none';
  });
}

function isSet(value: string): boolean {
  return value !== '' && value !== 'none';
}

function multiply(m: Matrix2D, n: Matrix2D): Matrix2D {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/**
 * The element's whole 2D transform, as one matrix, or null for a transform
 * this cannot read (3D, or a rotation in another unit). The individual
 * transform properties apply before `transform`, in this order (CSS
 * Transforms 2). An engine reports a computed `transform` as `matrix()`.
 */
function transformOf(style: CSSStyleDeclaration): Matrix2D | null {
  const translate = style.getPropertyValue('translate');
  const rotate = style.getPropertyValue('rotate');
  const scale = style.getPropertyValue('scale');
  const transform = style.getPropertyValue('transform');
  let matrix = IDENTITY;
  if (isSet(translate)) {
    const [x = '0', y = '0', z] = translate.split(' ');
    // The computed `translate` keeps a percentage, which is not a length.
    if (
      z != null ||
      !translate.split(' ').every(value => value.endsWith('px'))
    ) {
      return null;
    }
    matrix = multiply(matrix, [1, 0, 0, 1, parseFloat(x), parseFloat(y)]);
  }
  if (isSet(rotate)) {
    if (!/^-?[\d.]+deg$/.test(rotate)) {
      return null;
    }
    const angle = (parseFloat(rotate) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    matrix = multiply(matrix, [cos, sin, -sin, cos, 0, 0]);
  }
  if (isSet(scale)) {
    const [x = '1', y = x, z] = scale.split(' ');
    if (z != null) {
      return null;
    }
    matrix = multiply(matrix, [parseFloat(x), 0, 0, parseFloat(y), 0, 0]);
  }
  if (isSet(transform)) {
    const listed = /^matrix\(([^)]*)\)$/.exec(transform);
    const values = listed?.[1].split(',').map(value => parseFloat(value));
    if (values?.length !== 6 || values.some(value => Number.isNaN(value))) {
      return null;
    }
    matrix = multiply(matrix, values as unknown as Matrix2D);
  }
  return matrix;
}

/**
 * Whether the matrix only translates and scales: the box keeps its edges
 * parallel to the axes, and its layout size is its transformed size over the
 * scale.
 */
function isAxisAligned([a, b, c, d]: Matrix2D): boolean {
  return b === 0 && c === 0 && a !== 0 && d !== 0;
}

/**
 * Whether the layer's transform can be taken out of its box by calculation.
 * Not while one of its animations is pending: Chromium can then report the
 * first keyframe before the box carries it. Not under a CSS zoom other than 1:
 * the computed translation and origin are then in the layer's own px, not in
 * the box's.
 */
function canUndoByCalculation(layer: HTMLElement): boolean {
  const zoom = (layer as {currentCSSZoom?: number}).currentCSSZoom ?? 1;
  if (zoom !== 1) {
    return false;
  }
  return !(layer.getAnimations?.() ?? []).some(animation => animation.pending);
}

/** The layer's border-box size in layout px, unrounded, from its used size. */
function layoutSize(style: CSSStyleDeclaration): {
  width: number;
  height: number;
} {
  const px = (name: string) => parseFloat(style.getPropertyValue(name)) || 0;
  const isContentBox = style.getPropertyValue('box-sizing') !== 'border-box';
  const extra = (sides: [string, string]) =>
    isContentBox
      ? sides.reduce(
          (sum, side) =>
            sum + px(`padding-${side}`) + px(`border-${side}-width`),
          0,
        )
      : 0;
  return {
    width: px('width') + extra(['left', 'right']),
    height: px('height') + extra(['top', 'bottom']),
  };
}

/**
 * Whether the box read carries the scale of `matrix`. Right after a layer
 * shows, Chromium can report its entrance's first frame in the computed style
 * while the box read is still laid out without it. The box carries the scale
 * only when its size is clearly nearer the layout size times the scale than
 * the layout size itself. A scale too near 1 to tell them apart does not
 * count.
 */
function carriesScale(
  rect: DOMRect,
  style: CSSStyleDeclaration,
  [a, , , d]: Matrix2D,
): boolean {
  const {width, height} = layoutSize(style);
  if (!(width > 0) || !(height > 0)) {
    return false;
  }
  const scaledError =
    Math.abs(rect.width - width * Math.abs(a)) +
    Math.abs(rect.height - height * Math.abs(d));
  const unscaledError =
    Math.abs(rect.width - width) + Math.abs(rect.height - height);
  return scaledError + SCALE_TOLERANCE_PX < unscaledError;
}

function onLayoutGrid(value: number): number {
  const snapped = Math.round(value * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX;
  return Math.abs(snapped - value) < GRID_TOLERANCE_PX ? snapped : value;
}

/**
 * `rect`, the box of an element whose computed style carries the 2D transform
 * `matrix`, with that transform undone. The transformed box's centre is the
 * image of the element's centre. So undoing the transform about its origin on
 * that centre gives the untransformed box. A box that only translates and
 * scales gets its layout size from the transformed size, exactly, and needs
 * no other read. Any other box takes its layout size from `offsetWidth` and
 * `offsetHeight`, which round to whole pixels.
 */
function untransform(
  rect: DOMRect,
  layer: HTMLElement,
  style: CSSStyleDeclaration,
  matrix: Matrix2D,
): DOMRect {
  const [a, b, c, d, e, f] = matrix;
  const isExact = isAxisAligned(matrix);
  const width = isExact ? rect.width / Math.abs(a) : layer.offsetWidth;
  const height = isExact ? rect.height / Math.abs(d) : layer.offsetHeight;
  if (!isExact && width <= 0) {
    return rect;
  }
  const [originX = 0, originY = 0] = style
    .getPropertyValue('transform-origin')
    .split(' ')
    .map(value => parseFloat(value));
  const x = width / 2 - originX;
  const y = height / 2 - originY;
  const centreX = a * x + c * y + e;
  const centreY = b * x + d * y + f;
  const left = rect.left + rect.width / 2 - centreX - originX;
  const top = rect.top + rect.height / 2 - centreY - originY;
  if (!isExact) {
    return new DOMRect(left, top, width, height);
  }
  const snappedLeft = onLayoutGrid(left);
  const snappedTop = onLayoutGrid(top);
  return new DOMRect(
    snappedLeft,
    snappedTop,
    onLayoutGrid(left + width) - snappedLeft,
    onLayoutGrid(top + height) - snappedTop,
  );
}

/**
 * The layer's box where its position option put it, without the transform an
 * entry animation (or anything else) applies to it. A Tooltip enters from a
 * few pixels toward its trigger, scaled down. So the transformed box of a
 * tooltip that fits beside its trigger can read as covering it while it
 * enters. When the transform only translates and scales, `untransform` takes
 * it out of one box read, if `canUndoByCalculation` and `carriesScale` allow
 * it. Nothing is written, so the read forces no extra style or layout work.
 * A layer that transitions a transform is also only read: restoring an
 * overridden value would start that transition. Otherwise one read overrides
 * the layer's transforms with `none !important`, which outranks an animation.
 * The same task restores them, so no frame paints in between and the
 * animation keeps running. WebKit still applies an animated transform under
 * that override, so there the read box has that transform undone instead.
 */
export function settledBox(layer: HTMLElement): DOMRect {
  const view = layer.ownerDocument.defaultView;
  const style = view?.getComputedStyle(layer);
  if (style == null || !hasTransform(style)) {
    return layer.getBoundingClientRect();
  }
  const matrix = transformOf(style);
  if (matrix != null && isAxisAligned(matrix) && canUndoByCalculation(layer)) {
    const rect = layer.getBoundingClientRect();
    if (carriesScale(rect, style, matrix)) {
      return untransform(rect, layer, style, matrix);
    }
  }
  const transitions = style
    .getPropertyValue('transition-property')
    .split(',')
    .map(p => p.trim());
  const durations = style
    .getPropertyValue('transition-duration')
    .split(',')
    .map(parseFloat);
  const transitioned = transitions.some(
    (name, index) =>
      (name === 'all' || TRANSFORM_PROPERTIES.includes(name)) &&
      (durations[index % durations.length] ?? 0) > 0,
  );
  if (transitioned) {
    const rect = layer.getBoundingClientRect();
    return matrix == null ? rect : untransform(rect, layer, style, matrix);
  }
  const saved = TRANSFORM_PROPERTIES.map(
    name =>
      [
        name,
        layer.style.getPropertyValue(name),
        layer.style.getPropertyPriority(name),
      ] as const,
  );
  for (const name of TRANSFORM_PROPERTIES) {
    layer.style.setProperty(name, 'none', 'important');
  }
  const box = layer.getBoundingClientRect();
  const under = view?.getComputedStyle(layer);
  const underMatrix =
    under != null && hasTransform(under) ? transformOf(under) : null;
  const settled =
    under != null && underMatrix != null
      ? untransform(box, layer, under, underMatrix)
      : box;
  for (const [name, value, priority] of saved) {
    if (value === '') {
      layer.style.removeProperty(name);
    } else {
      layer.style.setProperty(name, value, priority);
    }
  }
  return settled;
}
