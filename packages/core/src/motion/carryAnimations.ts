// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file carryAnimations.ts
 * @input The CSS animations and transitions of an element and its subtree,
 *   read before the browser starts them afresh
 * @output Exports `saveAnimations` and `carryAnimations`, which carry them on
 *   in a clone of the element. Also `saveAnimation` and `restoreAnimations`,
 *   which put them back after a display reset
 * @position Motion foundation; the transient copy (transientCopy.ts) and the
 *   layer runtime's re-placement (Layer/preserveAnimations.ts) use it
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

/** One animation's state, read before the browser starts it afresh. */
export interface SavedAnimation {
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

/**
 * Reads one animation's state generically, from what the platform exposes.
 * That is every accessor with a setter on the animation's and its effect's
 * prototype chains, every field of the effect's timing, and its keyframes. Only values
 * that differ from the recreated animation's are written back, so a value the
 * stylesheet controls stays under its control. A few members are not plain
 * state and are written in their own step (`ORDERED`). The Animation and
 * effect objects themselves cannot be carried over: the old ones keep their
 * listeners and promises.
 */
export function saveAnimation(animation: Animation): SavedAnimation {
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
function restoreEffect(next: KeyframeEffect, saved: SavedAnimation): void {
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
function restore(next: Animation, saved: SavedAnimation): void {
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
function resumeTransition(saved: SavedAnimation): void {
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

function isCssAnimation(animation: Animation): animation is CSSAnimation {
  return (
    typeof CSSAnimation !== 'undefined' && animation instanceof CSSAnimation
  );
}

/**
 * Finishes an animation that ends: an infinite one cannot be finished, and is
 * left as it runs.
 */
function finishIfItEnds(animation: Animation): void {
  const end = animation.effect?.getComputedTiming().endTime;
  if (
    end != null &&
    Number.isFinite(Number(end)) &&
    animation.playbackRate !== 0
  ) {
    animation.finish();
  }
}

/** The members a copy's animation does not take: its element's keep them. */
const IDENTITY_MEMBERS = new Set(['id', 'onfinish', 'oncancel', 'onremove']);

/**
 * `saved` for an animation that carries on on the copy of its element:
 * aimed at the copy, without the element's id and event handlers.
 */
function retarget(
  saved: SavedAnimation,
  copyOf: (element: Element) => Element | null,
): SavedAnimation | null {
  const target = saved.target == null ? null : copyOf(saved.target);
  if (target == null) {
    return null;
  }
  const values: Writable = Object.fromEntries(
    Object.entries(saved.values).filter(
      ([name]) => !IDENTITY_MEMBERS.has(name),
    ),
  );
  const effectValues: Writable = {...saved.effectValues};
  if ('target' in effectValues) {
    effectValues.target = target;
  }
  return {...saved, target, values, effectValues};
}

/**
 * Puts each state `saved` holds on the CSS animations and transitions of
 * `root` and its subtree that are not among `survivors`. Each CSS animation
 * the browser started afresh takes the state of the one it replaces. It is
 * matched by element, pseudo-element and name, in order, and then by name
 * alone (an effect script moved to another element or pseudo-element). Each
 * transition whose animation no longer runs resumes as a script animation in
 * its state. One started afresh that replaces none is finished: an entrance
 * that had played and been dropped, or a transition from `@starting-style`.
 * Script animations are left as they are.
 */
export function restoreAnimations(
  root: Element,
  saved: ReadonlyArray<SavedAnimation>,
  survivors: ReadonlySet<Animation>,
): void {
  const after = root.getAnimations({subtree: true});
  const current = new Set(after);
  const cancelled: SavedAnimation[] = [];
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
  const recreated = after.filter(
    animation =>
      (isCssAnimation(animation) || isTransition(animation)) &&
      !survivors.has(animation),
  );
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
      finishIfItEnds(animation);
    } else {
      restore(animation, cancelled.splice(index, 1)[0]);
    }
  }
}

/** The CSS animations and transitions `saveAnimations` read. */
export type SavedAnimations = ReadonlyArray<SavedAnimation>;

/**
 * Reads the state of every CSS animation and transition of `root` and its
 * subtree, for `carryAnimations` to give a copy of it.
 */
export function saveAnimations(root: Element): SavedAnimations {
  if (typeof root.getAnimations !== 'function') {
    return [];
  }
  return root
    .getAnimations({subtree: true})
    .filter(animation => isCssAnimation(animation) || isTransition(animation))
    .map(saveAnimation);
}

/**
 * Carries on in `copy`, a clone of the root `saved` was read from, now laid
 * out, the CSS animations and transitions its element ran. A clone starts
 * each CSS animation again and runs no transition but a `@starting-style`
 * one. So each CSS animation the clone started takes the state of its
 * element's, and each transition runs on as a script animation. One the
 * clone started that its element no longer ran is finished: an entrance that
 * had played, or a `@starting-style` transition. `copyOf` maps each element
 * of the cloned subtree to its copy. The element's own animations keep
 * running, so the copy's take no id or event handler.
 */
export function carryAnimations(
  saved: SavedAnimations,
  copy: Element,
  copyOf: (element: Element) => Element | null,
): void {
  if (typeof copy.getAnimations !== 'function') {
    return;
  }
  restoreAnimations(
    copy,
    saved.flatMap(state => retarget(state, copyOf) ?? []),
    new Set(),
  );
}
