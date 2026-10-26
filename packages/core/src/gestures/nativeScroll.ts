// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nativeScroll.ts
 * @input An element a touch landed on
 * @output Exports createNativeScrollProbe (the NativeScrollProbe a host gives
 *   each touch) and parseTouchAction
 * @position DOM half of the scroll coordination in packages/core/src/gestures
 *
 * Answers one question for a recognizer without letting it touch the DOM:
 * would the browser scroll something if this finger moved that way?
 *
 * The browser scrolls the innermost scroller that has room, then chains
 * outward, so the answer is "yes" while ANY scroller under the touch can
 * still move in that direction, with three narrowings that match the
 * browser's own:
 *
 * - `touch-action` between the touch target and a scroller must allow the
 *   axis, or the browser will not pan that scroller with a finger;
 * - an `overscroll-behavior` other than `auto` on the axis stops the chain at
 *   that scroller (a sheet body with `contain` never scrolls the page);
 * - a finger moving down scrolls content toward its START (scrollTop
 *   decreasing), and horizontally the range follows the writing direction
 *   (RTL `scrollLeft` runs from minus the overflow to zero).
 *
 * Styles are read once per touch, on the first question; scroll offsets are
 * read fresh on every question, since a native scroll moves them.
 */

import type {NativeScrollProbe} from './types';

export interface AllowedPans {
  readonly x: boolean;
  readonly y: boolean;
}

/** Which pans a `touch-action` value lets the browser perform. */
export function parseTouchAction(value: string): AllowedPans {
  const tokens = value.trim().split(/\s+/);
  if (tokens.includes('auto') || tokens.includes('manipulation')) {
    return {x: true, y: true};
  }
  if (tokens.includes('none')) {
    return {x: false, y: false};
  }
  return {
    x: tokens.some(
      token =>
        token === 'pan-x' || token === 'pan-left' || token === 'pan-right',
    ),
    y: tokens.some(
      token => token === 'pan-y' || token === 'pan-up' || token === 'pan-down',
    ),
  };
}

interface ChainEntry {
  readonly element: Element;
  readonly x: boolean;
  readonly y: boolean;
  readonly isRtl: boolean;
  readonly stopsX: boolean;
  readonly stopsY: boolean;
  /**
   * The scroller sits beyond a `position: fixed` ancestor of the touch: it
   * still scrolls under the finger, but it does not carry the touched
   * element, so the element is not inside a scroll view (spec:AST-094 FR11).
   */
  readonly isBeyondFixed: boolean;
}

const SCROLLABLE = new Set(['auto', 'scroll', 'overlay']);
const EDGE_TOLERANCE = 1;

/**
 * The node's parent in the flat tree: a slotted node's slot, then out of
 * shadow roots to their hosts, so a scroller inside a shadow tree around the
 * slot is found.
 */
export function parentAcrossShadow(node: Node): Node | null {
  const slot =
    node instanceof Element || node instanceof Text ? node.assignedSlot : null;
  if (slot != null) {
    return slot;
  }
  if (node.parentNode != null) {
    return node.parentNode instanceof ShadowRoot
      ? node.parentNode.host
      : node.parentNode;
  }
  return null;
}

interface Chain {
  readonly entries: ChainEntry[];
  /** touch-action allows some pan all the way up. */
  readonly allowsPan: boolean;
}

function buildChain(target: Element): Chain {
  const doc = target.ownerDocument;
  const view = doc.defaultView;
  if (view == null) {
    return {entries: [], allowsPan: false};
  }
  const root = doc.scrollingElement ?? doc.documentElement;
  const chain: ChainEntry[] = [];
  let allowX = true;
  let allowY = true;
  let reachedRoot = false;
  let isBeyondFixed = false;
  for (
    let node: Node | null = target;
    node != null;
    node = parentAcrossShadow(node)
  ) {
    if (!(node instanceof Element)) {
      continue;
    }
    const style = view.getComputedStyle(node);
    const pans = parseTouchAction(style.touchAction || 'auto');
    allowX &&= pans.x;
    allowY &&= pans.y;
    const isRoot = node === root || node === doc.documentElement;
    if (isRoot) {
      reachedRoot = true;
    }
    const overflowX = isRoot ? rootOverflow(doc, 'x') : style.overflowX;
    const overflowY = isRoot ? rootOverflow(doc, 'y') : style.overflowY;
    const scrollsX = SCROLLABLE.has(overflowX);
    const scrollsY = SCROLLABLE.has(overflowY);
    if (scrollsX || scrollsY) {
      const element = isRoot ? root : node;
      const [behaviorX, behaviorY] = overscrollBehavior(style);
      chain.push({
        element,
        x: scrollsX && allowX,
        y: scrollsY && allowY,
        isRtl: style.direction === 'rtl',
        stopsX: behaviorX !== 'auto',
        stopsY: behaviorY !== 'auto',
        isBeyondFixed,
      });
    }
    if (isRoot) {
      break;
    }
    if (style.position === 'fixed') {
      isBeyondFixed = true;
    }
  }
  if (!reachedRoot && root instanceof Element) {
    chain.push({
      element: root,
      x: allowX && SCROLLABLE.has(rootOverflow(doc, 'x')),
      y: allowY && SCROLLABLE.has(rootOverflow(doc, 'y')),
      isRtl: false,
      stopsX: false,
      stopsY: false,
      isBeyondFixed,
    });
  }
  return {entries: chain, allowsPan: allowX || allowY};
}

/** `overscroll-behavior` per axis, from the longhands or the shorthand. */
function overscrollBehavior(style: CSSStyleDeclaration): [string, string] {
  const x = style.overscrollBehaviorX;
  const y = style.overscrollBehaviorY;
  if (x !== '' && y !== '' && x != null && y != null) {
    return [x, y];
  }
  const [first = 'auto', second = first] = (
    style.getPropertyValue('overscroll-behavior') || 'auto'
  )
    .trim()
    .split(/\s+/);
  return [x || first, y || second];
}

/**
 * The viewport scrolls unless the root or the body clips it (a scroll lock
 * sets `overflow: hidden` on one of them).
 */
function rootOverflow(doc: Document, axis: 'x' | 'y'): string {
  const view = doc.defaultView;
  if (view == null) {
    return 'hidden';
  }
  for (const element of [doc.documentElement, doc.body]) {
    if (element == null) {
      continue;
    }
    const style = view.getComputedStyle(element);
    const value = axis === 'x' ? style.overflowX : style.overflowY;
    if (value === 'hidden' || value === 'clip') {
      return 'hidden';
    }
  }
  return 'auto';
}

function canMoveY(element: Element, dy: number): boolean {
  if (element.scrollHeight - element.clientHeight <= EDGE_TOLERANCE) {
    return false;
  }
  return dy > 0
    ? element.scrollTop > EDGE_TOLERANCE - 0.5
    : element.scrollTop <
        element.scrollHeight - element.clientHeight - EDGE_TOLERANCE + 0.5;
}

function canMoveX(entry: ChainEntry, dx: number): boolean {
  const {element} = entry;
  const overflow = element.scrollWidth - element.clientWidth;
  if (overflow <= EDGE_TOLERANCE) {
    return false;
  }
  const min = entry.isRtl ? -overflow : 0;
  const max = entry.isRtl ? 0 : overflow;
  // A finger moving right drags the content right: scrollLeft decreases.
  return dx > 0
    ? element.scrollLeft > min + EDGE_TOLERANCE - 0.5
    : element.scrollLeft < max - EDGE_TOLERANCE + 0.5;
}

/** A probe of the native scrollers under `target`. */
export function createNativeScrollProbe(target: unknown): NativeScrollProbe {
  let chain: Chain | null = null;
  const getChain = (): ChainEntry[] => {
    chain ??=
      target instanceof Element
        ? buildChain(target)
        : {entries: [], allowsPan: false};
    return chain.entries;
  };
  return {
    canScroll(dx: number, dy: number): boolean {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // The minor axis of a mostly-straight drag is the hand's wobble, not
      // a direction: the browser locks to the major one.
      const considerX = ax > 0 && ax >= ay / 2;
      const considerY = ay > 0 && ay >= ax / 2;
      for (const entry of getChain()) {
        if (considerY && entry.y && canMoveY(entry.element, dy)) {
          return true;
        }
        if (considerX && entry.x && canMoveX(entry, dx)) {
          return true;
        }
        const stops =
          (!considerX || entry.stopsX) && (!considerY || entry.stopsY);
        if (stops && (entry.stopsX || entry.stopsY)) {
          return false;
        }
      }
      return false;
    },
    get allowsNativePan(): boolean {
      getChain();
      return chain?.allowsPan === true;
    },
    get isInsideScroller(): boolean {
      return getChain().some(
        entry =>
          !entry.isBeyondFixed &&
          ((entry.y &&
            entry.element.scrollHeight - entry.element.clientHeight >
              EDGE_TOLERANCE) ||
            (entry.x &&
              entry.element.scrollWidth - entry.element.clientWidth >
                EDGE_TOLERANCE)),
      );
    },
  };
}
