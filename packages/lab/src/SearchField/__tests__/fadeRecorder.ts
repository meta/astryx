// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fadeRecorder.ts
 * @input A Playwright page showing a SearchField story
 * @output Exports recordFades, which starts a record, kept in the page, of
 *   the animations an action starts inside the search field, and readFades,
 *   which reads it back: the properties those animations change and when the
 *   last opacity change settles, on the animations' own clock
 * @position Test helper for SearchField's Reduce Motion proofs
 *   (`design:reduced-motion`: opacity only, 200 ms or less, or no animation
 *   at all)
 *
 * The page records each animation as it is made (`Element.animate`, and the
 * CSS animation and transition events for any other) and reads its start
 * when the browser commits it. A proof that read `getAnimations()` after the
 * action instead could miss on a busy runner: by the time its read ran, an
 * animation could have finished or been replaced by the next one.
 *
 * An animation that holds each property at one value moves nothing: the
 * animator holds a pseudo-element's resting value that way (a pseudo-element
 * has no inline style), as it does for the field's background pieces. Such a
 * hold changes no property and does not start the fade's clock.
 */

import type {Page} from '@playwright/test';

/** What the animations an action started changed, from the page's record. */
export interface RecordedFades {
  /** Every property one of the recorded animations changes, sorted. */
  readonly properties: readonly string[];
  /**
   * When the last opacity change settles, ms after the first recorded
   * animation that changes something starts; 0 when nothing fades.
   */
  readonly fadeMs: number;
  /** How many of the recorded animations the browser started. */
  readonly started: number;
}

/** One recorded animation, as the page keeps it. */
interface FadeEntry {
  readonly keyframes: ComputedKeyframe[];
  readonly delay: number;
  readonly duration: number;
  /** Its start on the document timeline, once the browser committed it. */
  start: number | null;
  /** When it was cancelled (replaced by a later animation), if it was. */
  stoppedAt: number | null;
}

/** Page side: installs the recorder once per document. */
function installFadeRecorder(): void {
  const w = window as unknown as {__searchFieldFades?: {entries: FadeEntry[]}};
  if (w.__searchFieldFades != null) {
    return;
  }
  const recorder: {entries: FadeEntry[]} = {entries: []};
  w.__searchFieldFades = recorder;
  const seen = new WeakSet<Animation>();
  // A cancelled animation's `ready` rejects with an AbortError: it was never
  // shown, which the record expects. Any other rejection is a real error.
  const unlessAborted = (error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      throw error;
    }
  };
  const remember = (animation: Animation) => {
    const effect = animation.effect;
    if (seen.has(animation) || !(effect instanceof KeyframeEffect)) {
      return;
    }
    const target = effect.target;
    const root = document.querySelector('[role="search"]');
    if (target == null || root == null || !root.contains(target)) {
      return;
    }
    seen.add(animation);
    const timing = effect.getComputedTiming();
    const entry: FadeEntry = {
      keyframes: effect.getKeyframes(),
      delay: Number(timing.delay ?? 0),
      duration: Number(timing.activeDuration ?? 0),
      start: animation.startTime == null ? null : Number(animation.startTime),
      stoppedAt: null,
    };
    recorder.entries.push(entry);
    // The browser sets the start when it commits the animation. One that is
    // cancelled before then was never shown, and keeps no start.
    animation.ready.then(() => {
      if (entry.start == null && animation.startTime != null) {
        entry.start = Number(animation.startTime);
      }
    }, unlessAborted);
    animation.addEventListener('cancel', event => {
      if (entry.start != null && entry.stoppedAt == null) {
        const at = (event as AnimationPlaybackEvent).timelineTime;
        entry.stoppedAt = Number(at ?? document.timeline.currentTime ?? 0);
      }
    });
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (
    this: Element,
    ...args: Parameters<Element['animate']>
  ) {
    const animation = animate.apply(this, args);
    remember(animation);
    return animation;
  };
  for (const type of ['animationstart', 'transitionrun']) {
    document.addEventListener(
      type,
      event => {
        if (event.target instanceof Element) {
          for (const animation of event.target.getAnimations()) {
            remember(animation);
          }
        }
      },
      true,
    );
  }
}

/**
 * Starts a fresh record, before the action whose animations a proof judges.
 */
export async function recordFades(page: Page): Promise<void> {
  await page.evaluate(installFadeRecorder);
  await page.evaluate(() => {
    const w = window as unknown as {__searchFieldFades: {entries: unknown[]}};
    w.__searchFieldFades.entries = [];
  });
}

/**
 * Reads the record back once the action's motion is over. Each animation is
 * judged from its own keyframes and committed start; one replaced by a later
 * animation stops changing where it was cancelled.
 */
export async function readFades(page: Page): Promise<RecordedFades> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __searchFieldFades: {
        entries: {
          keyframes: ComputedKeyframe[];
          delay: number;
          duration: number;
          start: number | null;
          stoppedAt: number | null;
        }[];
      };
    };
    const SKIP = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    const started = w.__searchFieldFades.entries.flatMap(entry =>
      entry.start == null ? [] : [{...entry, start: entry.start}],
    );
    if (started.length === 0) {
      return {properties: [], fadeMs: 0, started: 0};
    }
    // A property held at one value does not move anything.
    const moves = (entry: {keyframes: ComputedKeyframe[]}) =>
      Object.keys(entry.keyframes[0] ?? {}).some(
        key =>
          !SKIP.has(key) &&
          new Set(entry.keyframes.map(frame => String(frame[key]))).size > 1,
      );
    const moving = started.filter(moves);
    if (moving.length === 0) {
      return {properties: [], fadeMs: 0, started: started.length};
    }
    const startedAt = Math.min(...moving.map(entry => entry.start));
    const properties = new Set<string>();
    let fadeMs = 0;
    for (const entry of moving) {
      const frames = entry.keyframes;
      const begin = entry.start + entry.delay;
      const timeOf = (i: number) =>
        begin + Number(frames[i].computedOffset) * entry.duration;
      for (const key of Object.keys(frames[0] ?? {})) {
        if (SKIP.has(key)) {
          continue;
        }
        const values = new Set(frames.map(frame => String(frame[key])));
        if (values.size > 1) {
          properties.add(key);
        }
        if (key === 'opacity') {
          // When the opacity reaches the value it ends on, for good, or
          // where a later animation replaced this one.
          const final = String(frames[frames.length - 1].opacity);
          let settles = timeOf(0);
          for (let i = 0; i < frames.length; i++) {
            if (String(frames[i].opacity) !== final) {
              settles = timeOf(Math.min(i + 1, frames.length - 1));
            }
          }
          if (entry.stoppedAt != null) {
            settles = Math.min(settles, entry.stoppedAt);
          }
          fadeMs = Math.max(fadeMs, settles - startedAt);
        }
      }
    }
    return {
      properties: [...properties].sort(),
      fadeMs,
      started: started.length,
    };
  });
}
