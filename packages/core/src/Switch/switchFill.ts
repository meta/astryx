// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switchFill.ts
 * @input Switch's track element and the props its other state renders with
 * @output Exports TrackState, sameTrackState, trackStateOf, readInState and
 *   readFillOf: an element read in its other state, in place
 * @position Shared by Switch.tsx and useSwitchTouch.ts for the colour fade
 *   under a finger
 *
 * The colour fade needs the track's fill in its other state, as the theme
 * paints it. readFillOf swaps the track's class and attributes, reads the
 * colour and swaps back in the same task, so nothing paints in between.
 *
 * SYNC: When modified, update Switch.tsx and useSwitchTouch.ts.
 */

/** A track state: its class name and its data attributes. */
export interface TrackState {
  readonly className: string;
  readonly attributes: Readonly<Record<string, string>>;
}

/** Whether two track states render alike: the same class and attributes. */
export function sameTrackState(
  a: TrackState | null,
  b: TrackState | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null || a.className !== b.className) {
    return false;
  }
  const names = Object.keys(a.attributes);
  return (
    names.length === Object.keys(b.attributes).length &&
    names.every(name => a.attributes[name] === b.attributes[name])
  );
}

/** The track state of rendered props (`className` and `data-*` props). */
export function trackStateOf(props: object): TrackState {
  const attributes: Record<string, string> = {};
  let className = '';
  for (const [name, value] of Object.entries(props)) {
    if (name === 'className' && typeof value === 'string') {
      className = value;
    } else if (name.startsWith('data-') && value != null) {
      // As React writes a data attribute: every value but null or undefined.
      attributes[name] = String(value);
    }
  }
  return {className, attributes};
}

/**
 * Reads `element` as it renders in `state` (its class and data attributes),
 * swapping them in and back in the same task, so nothing paints between.
 */
export function readInState<T>(
  element: HTMLElement,
  state: TrackState,
  read: (element: HTMLElement) => T,
): T {
  const names = new Set(Object.keys(state.attributes));
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith('data-')) {
      names.add(attribute.name);
    }
  }
  const savedClass = element.className;
  const saved = new Map<string, string | null>();
  for (const name of names) {
    saved.set(name, element.getAttribute(name));
  }
  const apply = (
    className: string,
    valueOf: (name: string) => string | null,
  ) => {
    element.className = className;
    for (const name of names) {
      const value = valueOf(name);
      if (value == null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
    }
  };
  apply(state.className, name => state.attributes[name] ?? null);
  try {
    return read(element);
  } finally {
    apply(savedClass, name => saved.get(name) ?? null);
  }
}

/** The track's computed fill in `state`, read without a paint. */
export function readFillOf(track: HTMLElement, state: TrackState): string {
  return readInState(
    track,
    state,
    element => getComputedStyle(element).backgroundColor,
  );
}
