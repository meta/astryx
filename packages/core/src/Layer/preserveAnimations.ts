// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preserveAnimations.ts
 * @input An element whose subtree is about to leave rendering for one forced
 *   layout, and the function that does it
 * @output The same CSS animations and transitions afterwards, in the state
 *   they were in before
 * @position Layer runtime; the re-placement of a layer that keeps its anchor
 *   clear (spec:AST-059 FR4)
 *
 * Taking an element out of rendering cancels every CSS animation and
 * transition of it and its subtree. When it returns, the browser creates the
 * animations again from the stylesheet, at their start, and the transitions
 * not at all; script-created animations are untouched. `preserveAnimations`
 * reads every animation's state first and, afterwards, gives each recreated
 * CSS animation that state and resumes each cancelled transition with a
 * script animation at the same point.
 *
 * The state is read generically, from what the platform exposes: every
 * accessor with a setter on the animation's and its effect's prototype
 * chains, every field of the effect's timing, and its keyframes. Only values
 * that differ from the recreated animation's are written, so a value the
 * stylesheet controls stays under its control. A few members are not plain
 * state and are handled in their own step (`ORDERED`); the rest need no
 * handling (`DERIVED`). What cannot be carried over is the Animation and
 * effect objects themselves: the old ones are idle, their `addEventListener`
 * listeners and `finished`/`ready` promises stay with them, and the browser
 * fires `animationcancel`/`transitioncancel` for them and `animationstart`
 * for the new ones.
 */

/**
 * Animation members written in a fixed order rather than generically: the
 * timeline before the range that is measured on it, the rate before the
 * time, and the start time (or, for a paused animation, the current time)
 * last, once the play state is set. `effect` is not
 * replaced, because a CSS animation whose effect script replaces leaves the
 * stylesheet's control; its state is copied onto the new effect instead.
 */
const ORDERED = new Set([
  'effect',
  'timeline',
  'rangeStart',
  'rangeEnd',
  'playbackRate',
  'startTime',
  'currentTime',
]);

type Writable = Record<string, unknown>;

/** Every accessor with a setter on `object`'s prototype chain. */
function writableAccessors(object: object): string[] {
  const names = new Set<string>();
  for (
    let proto: object | null = Object.getPrototypeOf(object);
    proto != null && proto !== Object.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(proto),
    )) {
      if (descriptor.set != null) {
        names.add(name);
      }
    }
  }
  return [...names];
}

/**
 * A textual form of a value that is compared by content rather than by
 * identity: a CSS numeric value (as in a timeline range offset) through its
 * serialization, a plain object (a range) through its members. Anything else
 * is compared by identity (`null`).
 */
function contentOf(value: unknown): string | null {
  if (
    typeof CSSNumericValue !== 'undefined' &&
    value instanceof CSSNumericValue
  ) {
    return value.toString();
  }
  if (
    value != null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.entries(value)
      .map(([key, inner]) => `${key}:${contentOf(inner) ?? String(inner)}`)
      .join(';');
  }
  return null;
}

function differs(a: unknown, b: unknown): boolean {
  if (a === b) {
    return false;
  }
  const textA = contentOf(a);
  return textA == null || textA !== contentOf(b);
}

interface Saved {
  animation: Animation;
  name: string;
  target: Element | null;
  pseudoElement: string | null;
  values: Writable;
  effectValues: Writable;
  timing: EffectTiming | null;
  keyframes: ComputedKeyframe[] | null;
  playState: AnimationPlayState;
  replaceState: AnimationReplaceState;
}

function save(animation: Animation): Saved {
  const effect = animation.effect as KeyframeEffect | null;
  const values: Writable = {};
  for (const name of writableAccessors(animation)) {
    values[name] = (animation as unknown as Writable)[name];
  }
  const effectValues: Writable = {};
  if (effect != null) {
    for (const name of writableAccessors(effect)) {
      effectValues[name] = (effect as unknown as Writable)[name];
    }
  }
  return {
    animation,
    name:
      (animation as Animation & {animationName?: string}).animationName ?? '',
    target: effect?.target ?? null,
    pseudoElement: effect?.pseudoElement ?? null,
    values,
    effectValues,
    timing: effect?.getTiming() ?? null,
    keyframes: effect?.getKeyframes() ?? null,
    playState: animation.playState,
    replaceState: animation.replaceState,
  };
}

function write(object: object, name: string, value: unknown): void {
  (object as Writable)[name] = value;
}

/** Give `next` the effect state `saved` had: every writable member. */
function restoreEffect(next: KeyframeEffect, saved: Saved): void {
  for (const name of writableAccessors(next)) {
    if (
      name in saved.effectValues &&
      differs(saved.effectValues[name], (next as unknown as Writable)[name])
    ) {
      write(next, name, saved.effectValues[name]);
    }
  }
  if (saved.timing != null) {
    const timing = next.getTiming() as unknown as Writable;
    const changed: Writable = {};
    for (const [field, value] of Object.entries(saved.timing)) {
      if (differs(value, timing[field])) {
        changed[field] = value;
      }
    }
    if (Object.keys(changed).length > 0) {
      next.updateTiming(changed);
    }
  }
  if (
    saved.keyframes != null &&
    JSON.stringify(saved.keyframes) !== JSON.stringify(next.getKeyframes())
  ) {
    next.setKeyframes(saved.keyframes);
  }
}

/** Give `next` the state `saved` had, member by member. */
function restore(next: Animation, saved: Saved): void {
  const effect = next.effect as KeyframeEffect | null;
  if (effect != null) {
    restoreEffect(effect, saved);
  }
  const current = next as unknown as Writable;
  for (const name of ['timeline', 'rangeStart', 'rangeEnd']) {
    if (name in saved.values && differs(saved.values[name], current[name])) {
      write(next, name, saved.values[name]);
    }
  }
  for (const name of writableAccessors(next)) {
    if (
      !ORDERED.has(name) &&
      name in saved.values &&
      differs(saved.values[name], current[name])
    ) {
      write(next, name, saved.values[name]);
    }
  }
  if (saved.replaceState === 'persisted' && next.replaceState !== 'persisted') {
    next.persist();
  }
  const rate = saved.values.playbackRate;
  if (typeof rate === 'number' && rate !== next.playbackRate) {
    next.playbackRate = rate;
  }
  if (saved.playState === 'paused' && next.playState !== 'paused') {
    next.pause();
  } else if (saved.playState !== 'paused' && next.playState === 'paused') {
    next.play();
  }
  // A running animation is anchored to its timeline by its start time, which
  // carries its current time on exactly. A paused one has none and keeps its
  // current time. A finished one holds its end: finishing it again holds the
  // same time, though its start time is then counted from now, since script
  // cannot set a start time and a held time together.
  const start = saved.values.startTime as CSSNumberish | null | undefined;
  const time = saved.values.currentTime as CSSNumberish | null | undefined;
  if (saved.playState === 'finished') {
    next.finish();
  } else if (start != null) {
    next.startTime = start;
  } else if (time != null) {
    next.currentTime = time;
  }
}

/** Resume a cancelled CSS transition with a script animation in its state. */
function resumeTransition(saved: Saved): void {
  if (saved.target == null || saved.keyframes == null) {
    return;
  }
  const replacement = saved.target.animate(saved.keyframes, {
    pseudoElement: saved.pseudoElement ?? undefined,
  });
  restore(replacement, saved);
}

function isTransition(animation: Animation): boolean {
  return (
    typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition
  );
}

/**
 * Run `reset`, which takes `root` out of rendering and back, and put every
 * CSS animation and transition of `root` and its subtree back in the state it
 * was in before. Recreated animations are matched to the ones they replace by
 * element, pseudo-element and name, in order, and then by name alone (an
 * effect script moved to another element or pseudo-element); a recreated
 * animation with no predecessor (an entry animation that had already played
 * and been dropped) is finished.
 */
export function preserveAnimations(root: Element, reset: () => void): void {
  if (typeof root.getAnimations !== 'function') {
    reset();
    return;
  }
  const before = root.getAnimations({subtree: true});
  const saved = before.map(save);
  reset();
  const after = root.getAnimations({subtree: true});
  const current = new Set(after);
  const survivors = new Set(before);
  const cancelled: Saved[] = [];
  for (const state of saved) {
    if (current.has(state.animation)) {
      continue;
    }
    if (isTransition(state.animation)) {
      resumeTransition(state);
    } else {
      cancelled.push(state);
    }
  }
  const recreated = after.filter(animation => !survivors.has(animation));
  const unmatched: Animation[] = [];
  for (const animation of recreated) {
    const effect = animation.effect as KeyframeEffect | null;
    const name =
      (animation as Animation & {animationName?: string}).animationName ?? '';
    const index = cancelled.findIndex(
      state =>
        state.name === name &&
        state.target === (effect?.target ?? null) &&
        state.pseudoElement === (effect?.pseudoElement ?? null),
    );
    if (index === -1) {
      unmatched.push(animation);
    } else {
      restore(animation, cancelled.splice(index, 1)[0]);
    }
  }
  for (const animation of unmatched) {
    const name =
      (animation as Animation & {animationName?: string}).animationName ?? '';
    const index = cancelled.findIndex(state => state.name === name);
    if (index === -1) {
      animation.finish();
    } else {
      restore(animation, cancelled.splice(index, 1)[0]);
    }
  }
}
