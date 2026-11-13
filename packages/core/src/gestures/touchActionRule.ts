// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchActionRule.ts
 * @input An element and the touch-action its recognizers derive
 * @output Exports markTouchAction and unmarkTouchAction: the element carries
 *   the derived value in TOUCH_ACTION_ATTRIBUTE, and its document or shadow
 *   root holds one zero-specificity rule per value in the first cascade
 *   layer (`reset`), so any author rule, in any layer or none, or inline
 *   value outranks the host's (`spec:AST-094` FR18, DEC-8); a root's rules
 *   go with its last marked element (FR24)
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

/**
 * The cascade layer the rules sit in: the first in the order every package
 * stylesheet declares (`spec:AST-080` FR3), so an author rule in any later
 * layer, or in none, outranks them. Unlayered, they would outrank every
 * layered author rule.
 */
const RULE_LAYER = 'reset';

type RuleRoot = Document | ShadowRoot;

/**
 * Per document or shadow root: the values it has a rule for, their rules'
 * text, where that text goes (an adopted sheet, or a style element where
 * constructable sheets are missing), and the elements marked there. The
 * rules go with the root's last marked element (`spec:AST-094` FR24).
 */
const sheets = new WeakMap<
  RuleRoot,
  {
    readonly values: Set<string>;
    readonly marked: Set<Element>;
    css: string;
    write(css: string): void;
    remove(): void;
  }
>();

/** Where each marked element's rule lives, for its unmark after it leaves. */
const markedRoots = new WeakMap<Element, RuleRoot>();

function sheetOf(root: RuleRoot) {
  let entry = sheets.get(root);
  if (entry == null) {
    const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    let write: ((css: string) => void) | undefined;
    let remove: (() => void) | undefined;
    // A constructable sheet where the engine has one; a style element only
    // where it has none, so any other error from a sheet is not hidden.
    const Sheet = doc?.defaultView?.CSSStyleSheet;
    if (
      typeof Sheet === 'function' &&
      'replaceSync' in Sheet.prototype &&
      'adoptedStyleSheets' in root
    ) {
      const sheet = new Sheet();
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      write = css => sheet.replaceSync(css);
      remove = () => {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
          adopted => adopted !== sheet,
        );
      };
    } else {
      const style = doc?.createElement('style');
      const parent =
        root.nodeType === 9 ? (doc?.head ?? doc?.documentElement) : root;
      if (style != null && parent != null) {
        parent.append(style);
        write = css => {
          style.textContent = css;
        };
        remove = () => style.remove();
      }
    }
    if (write == null || remove == null) {
      return null;
    }
    entry = {values: new Set(), marked: new Set(), css: '', write, remove};
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
    entry.write(`@layer ${RULE_LAYER}{${entry.css}}`);
  }
  if (element.getAttribute(TOUCH_ACTION_ATTRIBUTE) !== value) {
    element.setAttribute(TOUCH_ACTION_ATTRIBUTE, value);
  }
  const previous = markedRoots.get(element);
  if (previous != null && previous !== root) {
    // Moved to another root: the old one lets it go.
    releaseMark(element, previous);
  }
  entry.marked.add(element);
  markedRoots.set(element, root);
  return true;
}

/** `root` no longer holds `element`'s mark; its last mark takes the rules. */
function releaseMark(element: Element, root: RuleRoot): void {
  const entry = sheets.get(root);
  if (entry == null) {
    return;
  }
  entry.marked.delete(element);
  if (entry.marked.size === 0) {
    entry.remove();
    sheets.delete(root);
  }
}

/**
 * Remove the host's mark; the element's own touch-action stands. The last
 * mark in a document or shadow root takes its rules with it.
 */
export function unmarkTouchAction(element: Element): void {
  element.removeAttribute(TOUCH_ACTION_ATTRIBUTE);
  const root = markedRoots.get(element);
  if (root == null) {
    return;
  }
  markedRoots.delete(element);
  releaseMark(element, root);
}
