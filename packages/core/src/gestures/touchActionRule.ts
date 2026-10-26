// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchActionRule.ts
 * @input An element and the touch-action its recognizers derive
 * @output Exports markTouchAction and unmarkTouchAction: the element carries
 *   the derived value in TOUCH_ACTION_ATTRIBUTE, and its document or shadow
 *   root holds one zero-specificity rule per value, so any author rule or
 *   inline value outranks the host's (`spec:AST-094` FR18, DEC-8)
 * @position The gesture host's touch-action writer (GestureHost.ts)
 *
 * The mark is set as a recognizer attaches, so a subtree that mounts with
 * it is styled once with its touch-action: a value written after that first
 * styling restyles every descendant (each one's effective touch-action
 * changes). Until the host reads the element's own value, the value in
 * force is the author's where the author sets one, and the derived value
 * elsewhere: never wider than the author's.
 *
 * SYNC: When modified, update GestureHost.ts.
 */

/** The attribute that carries the host's derived touch-action. */
export const TOUCH_ACTION_ATTRIBUTE = 'data-astryx-touch-action';

type RuleRoot = Document | ShadowRoot;

/**
 * Per document or shadow root: the values it has a rule for, their rules'
 * text, and where that text goes (an adopted sheet, or a style element where
 * constructable sheets are missing). Rules are never removed: there are only
 * a few values.
 */
const sheets = new WeakMap<
  RuleRoot,
  {readonly values: Set<string>; css: string; write(css: string): void}
>();

function sheetOf(root: RuleRoot) {
  let entry = sheets.get(root);
  if (entry == null) {
    const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    let write: ((css: string) => void) | undefined;
    try {
      const sheet = new (
        doc?.defaultView as Window & typeof globalThis
      ).CSSStyleSheet();
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      write = css => sheet.replaceSync(css);
    } catch {
      const style = doc?.createElement('style');
      const parent =
        root.nodeType === 9 ? (doc?.head ?? doc?.documentElement) : root;
      if (style != null && parent != null) {
        parent.append(style);
        write = css => {
          style.textContent = css;
        };
      }
    }
    if (write == null) {
      return null;
    }
    entry = {values: new Set(), css: '', write};
    sheets.set(root, entry);
  }
  return entry;
}

/**
 * Give `element` the derived touch-action under a rule any author rule
 * outranks. Returns false where no rule can hold it (a detached element):
 * the caller writes nothing until the element is in a document.
 */
export function markTouchAction(element: Element, value: string): boolean {
  const root = element.getRootNode() as RuleRoot;
  const entry =
    element.isConnected && (root.nodeType === 9 || 'host' in root)
      ? sheetOf(root)
      : null;
  if (entry == null) {
    return false;
  }
  if (!entry.values.has(value)) {
    entry.values.add(value);
    entry.css += `:where([${TOUCH_ACTION_ATTRIBUTE}="${value}"]){touch-action:${value}}`;
    entry.write(entry.css);
  }
  if (element.getAttribute(TOUCH_ACTION_ATTRIBUTE) !== value) {
    element.setAttribute(TOUCH_ACTION_ATTRIBUTE, value);
  }
  return true;
}

/** Remove the host's mark; the element's own touch-action stands. */
export function unmarkTouchAction(element: Element): void {
  element.removeAttribute(TOUCH_ACTION_ATTRIBUTE);
}
