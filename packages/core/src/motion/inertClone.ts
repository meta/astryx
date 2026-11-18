// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inertClone.ts
 * @input The DOM
 * @output Exports `inertClone`, a deep clone that takes no part in the page,
 *   and `paintedBackground`, the background an element shows
 * @position Motion foundation, internal to core. transientCopy.ts builds the
 *   swap's and the layer exit's copies on the clone, and the List reorder
 *   builds its drag preview on it
 */

/** The listed controls a form can own. */
const FORM_CONTROLS =
  'button, fieldset, input, object, output, select, textarea';

function isFormAssociated(
  node: Element,
  registry: CustomElementRegistry | undefined,
): boolean {
  if (!node.localName.includes('-')) {
    return false;
  }
  const definition = registry?.get(node.localName) as
    {formAssociated?: boolean} | undefined;
  return definition?.formAssociated === true;
}

/**
 * Paints `canvas` with `source`'s pixels at its own size. False when they
 * read back empty: unreadable (a WebGL canvas without
 * `preserveDrawingBuffer`, a tainted one) or blank.
 */
function paintCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
): boolean {
  if (canvas.width === 0 || canvas.height === 0) {
    return true;
  }
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (context == null) {
    // No 2D canvas here (a test environment): nothing to paint or tell.
    return true;
  }
  try {
    context.drawImage(source, 0, 0);
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * A deep clone of `element` that takes no part in the page. It has no ids or
 * test ids and joins no form or radio group: a copied checked radio would
 * uncheck the live one. No copied label names a live control, copied frames
 * and media load nothing, and copied elements carry no anchor name. It is
 * inert and hidden from assistive technology. Content holding a canvas whose
 * pixels read back empty is not cloned: the result is null.
 */
export function inertClone(element: HTMLElement): HTMLElement | null {
  const copy = element.cloneNode(true) as HTMLElement;
  const sourceNodes = [element, ...element.querySelectorAll('*')];
  const copyNodes = [copy, ...copy.querySelectorAll('*')];
  for (const node of copyNodes) {
    for (const name of ['id', 'data-testid', 'name', 'for', 'autofocus']) {
      node.removeAttribute(name);
    }
  }
  // A second element with a live anchor's name makes the engine lay out
  // every frame while the copy moves.
  const view = element.ownerDocument.defaultView;
  sourceNodes.forEach((source, index) => {
    const name = view?.getComputedStyle(source).getPropertyValue('anchor-name');
    if (name != null && name !== '' && name !== 'none') {
      (copyNodes[index] as Partial<ElementCSSInlineStyle>).style?.setProperty(
        'anchor-name',
        'none',
      );
    }
  });
  // A copy laid inside a `<form>` would join it, and a copied empty
  // `required` field would block its submit. `form=""` matches no form's id,
  // so no form owns a copied control, a form-associated custom element too.
  const registry = element.ownerDocument.defaultView?.customElements;
  for (const node of copyNodes) {
    if (node.matches(FORM_CONTROLS) || isFormAssociated(node, registry)) {
      node.setAttribute('form', '');
    }
  }
  for (const node of copy.querySelectorAll(
    'iframe, video, audio, source, embed, object',
  )) {
    for (const name of ['src', 'srcdoc', 'data', 'autoplay']) {
      node.removeAttribute(name);
    }
  }
  // A clone's canvas is blank: paint each with its source's pixels. Content
  // with a canvas that reads back empty is not copied.
  const sources = element.querySelectorAll('canvas');
  const canvases = Array.from(copy.querySelectorAll('canvas'));
  if (!canvases.every((canvas, index) => paintCanvas(canvas, sources[index]))) {
    return null;
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.setAttribute('inert', '');
  copy.style.pointerEvents = 'none';
  return copy;
}

/** The background `element` shows: its own, or the nearest ancestor's. */
export function paintedBackground(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) {
      return color;
    }
  }
  return 'Canvas';
}
