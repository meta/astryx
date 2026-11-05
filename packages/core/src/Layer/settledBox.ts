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

function hasTransform(style: CSSStyleDeclaration): boolean {
  return TRANSFORM_PROPERTIES.some(name => {
    const value = style.getPropertyValue(name);
    return value !== '' && value !== 'none';
  });
}

/**
 * `rect`, the box of an element whose computed style still carries a 2D
 * transform, with that transform undone. The transformed box's centre is the
 * image of the element's centre. So undoing the transform about its origin on
 * that centre gives the untransformed box, at the element's layout size. A
 * transform this cannot undo (3D, or a rotation in another unit) leaves `rect`
 * as it is.
 */
function untransform(
  rect: DOMRect,
  layer: HTMLElement,
  style: CSSStyleDeclaration,
): DOMRect {
  const set = (value: string) => value !== '' && value !== 'none';
  if (typeof DOMMatrix === 'undefined' || layer.offsetWidth <= 0) {
    return rect;
  }
  // The individual transform properties apply before `transform`, in this
  // order (CSS Transforms 2).
  let matrix = new DOMMatrix();
  if (set(style.translate)) {
    const [x = '0', y = '0', z] = style.translate.split(' ');
    if (z != null) {
      return rect;
    }
    matrix = matrix.translate(parseFloat(x), parseFloat(y));
  }
  if (set(style.rotate)) {
    if (!/^-?[\d.]+deg$/.test(style.rotate)) {
      return rect;
    }
    matrix = matrix.rotate(parseFloat(style.rotate));
  }
  if (set(style.scale)) {
    const [x = '1', y = x, z] = style.scale.split(' ');
    if (z != null) {
      return rect;
    }
    matrix = matrix.scale(parseFloat(x), parseFloat(y));
  }
  if (set(style.transform)) {
    matrix = matrix.multiply(new DOMMatrix(style.transform));
  }
  if (!matrix.is2D) {
    return rect;
  }
  const [originX = 0, originY = 0] = style.transformOrigin
    .split(' ')
    .map(value => parseFloat(value));
  const width = layer.offsetWidth;
  const height = layer.offsetHeight;
  const centre = matrix.transformPoint(
    new DOMPoint(width / 2 - originX, height / 2 - originY),
  );
  const left = rect.left + rect.width / 2 - centre.x - originX;
  const top = rect.top + rect.height / 2 - centre.y - originY;
  return new DOMRect(left, top, width, height);
}

/**
 * The layer's box where its position option put it, without the transform an
 * entry animation (or anything else) applies to it. A Tooltip enters from a
 * few pixels toward its trigger, scaled down. So the transformed box of a
 * tooltip that fits beside its trigger can read as covering it while it
 * enters. For this one read, the layer's transforms are overridden with
 * `none !important`, which outranks an animation. They are restored in the
 * same task, so no frame paints in between and the animation keeps running.
 * Where the engine still applies an animated transform under that override
 * (WebKit), the read box has that transform undone instead (`untransform`). A
 * layer that transitions a transform property is not overridden, since
 * restoring the value would start that transition. Its box has its transform
 * undone.
 */
export function settledBox(layer: HTMLElement): DOMRect {
  const view = layer.ownerDocument.defaultView;
  const style = view?.getComputedStyle(layer);
  if (style == null || !hasTransform(style)) {
    return layer.getBoundingClientRect();
  }
  const transitions = style.transitionProperty.split(',').map(p => p.trim());
  const durations = style.transitionDuration.split(',').map(parseFloat);
  const transitioned = transitions.some(
    (name, index) =>
      (name === 'all' || TRANSFORM_PROPERTIES.includes(name)) &&
      (durations[index % durations.length] ?? 0) > 0,
  );
  if (transitioned) {
    return untransform(layer.getBoundingClientRect(), layer, style);
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
  const settled =
    under != null && hasTransform(under) ? untransform(box, layer, under) : box;
  for (const [name, value, priority] of saved) {
    if (value === '') {
      layer.style.removeProperty(name);
    } else {
      layer.style.setProperty(name, value, priority);
    }
  }
  return settled;
}
