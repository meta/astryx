// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curves.ts
 * @input Uses a Playwright `Page`, a `Locator` for the animated element, and
 *   the Web Animations API in the page (CSS transitions and CSS animations are
 *   Web Animations too)
 * @output `holdAnimations` (pause every running animation and describe it),
 *   `armHold` (the page holds what an action starts, as soon as it runs,
 *   and checks that it took the motion the test judges),
 *   `seekAnimations` (move them to t ms from the held origin, each keeping
 *   its offset), `sampleCurve` (the presented
 *   transform/opacity at each t, with the individual `translate`, `rotate` and
 *   `scale` properties composed in), `releaseAnimations`, `curveOf`, which
 *   picks one channel out of the samples for ./math's `compareCurve`, and the
 *   animation-state waits `waitForAnimation`, `watchAnimations` and
 *   `waitForRest`.
 * @position Curve sampling: the exact presented value of an animation at a
 *   fixed time, independent of frame timing, so a curve can be compared with
 *   the UIKit reference to a fraction of a pixel. A paused animation's effect
 *   is applied at its current time and `getComputedStyle` reads it.
 *
 * SYNC: Keep ./storyboard.ts using these for its animation filmstrips.
 */

import type {Locator, Page} from '@playwright/test';
import {defineCurveEnd} from './curve-end';
import {FRAME_STARVATION_MS, FrameStarvationError} from './frames';
import {parseTransform, type TimedValue, type Transform2D} from './math';

/** How far inside its end a seek past an animation's end lands, ms. */
export const END_INSET_MS = 0.5;

/**
 * Page side: records every animation the document runs, from its first frame
 * or its creation (a frame loop on the page's real requestAnimationFrame, and
 * the CSS animation and transition events), so an animation that starts and
 * ends before a test looks is still seen, with the time it finished (from its
 * finish event, or from a CSS run's end event when the page cancels it there
 * before the finish event comes). Each
 * entry keeps the animation's start time too: a page that cancels a finished
 * animation (an entrance whose class is removed on `animationend`) nulls its
 * `startTime`.
 *
 * A run that the page cancels while it plays is dated at the cancel.
 */
function animationRecorder(): void {
  const w = window as unknown as {__harnessAnimations?: unknown};
  if (w.__harnessAnimations) {
    return;
  }
  // The run a CSS animation or transition event names.
  const cssRunName = (event: Event) =>
    event.type.startsWith('animation')
      ? (event as AnimationEvent).animationName
      : (event as TransitionEvent).propertyName;
  // The page's real frames, even when a timer gate already holds its callbacks.
  const frame = (
    (
      window as unknown as {
        __harnessTimerGate?: {frame: typeof requestAnimationFrame};
      }
    ).__harnessTimerGate?.frame ?? window.requestAnimationFrame
  ).bind(window);
  const log: {
    animation: Animation;
    seenAt: number;
    finishedAt: number | null;
    startedAt: number | null;
    // Where the run began, as the engine had it when it finished.
    finishStart: number | null;
    // When the page cancelled the run while it played, and how much of its
    // curve it had presented by then (see the cancel wrapper below).
    cancelledAt: number | null;
    playedMs: number | null;
  }[] = [];
  // Start events that found no animation to record (see `onStart`), with
  // the target's ancestors as they were: an exit the page removes at its end
  // is still named for the container it left.
  const unread: {
    at: number;
    target: EventTarget | null;
    ancestors: Element[];
    type: string;
    name: string;
  }[] = [];
  // Each recorded animation's entry.
  const entries = new WeakMap<Animation, (typeof log)[number]>();
  // The times kept below are real: a page time plus the span a page freeze
  // stood still so far. A later freeze then leaves them where they were.
  const span = () =>
    (window as unknown as {__harnessFreeze?: {offset: number}}).__harnessFreeze
      ?.offset ?? 0;
  const real = (time: number | null) => (time == null ? null : time + span());
  // Entries whose start time has not resolved yet (still pending when seen).
  let unstarted: (typeof log)[number][] = [];
  let armedAt = performance.now();
  // When the animation began to play, on the document timeline. A run going
  // backward reports as its startTime the moment its current time would
  // reach 0, a whole run after it began (it begins at its end).
  const playStart = (animation: Animation): number | null => {
    if (animation.startTime == null) {
      return null;
    }
    const rate = animation.playbackRate;
    if (rate >= 0) {
      return Number(animation.startTime);
    }
    const end = Number(
      (animation.effect as KeyframeEffect | null)?.getComputedTiming()
        .endTime ?? 0,
    );
    return Number(animation.startTime) - end / Math.abs(rate);
  };
  // Dates a recorded run's finish as the engine has it now. Its start time is
  // usually still set (the finish listener, added as the animation was made,
  // runs before the page's own, and the end-event listener below runs in the
  // capture phase), and the run ended where that start puts its end, through
  // the rate. Without one, the start the recorder holds stands in, kept as
  // the run ran (after a pause, a seek or a rate change). A run that ends as
  // it starts (one reversed from rest) can finish before any start resolves:
  // it then began where the finish event's timeline time `at` puts its start.
  // Read later, the start time can say otherwise (WebKit resolves or moves it
  // a frame later), and the finish event itself arrives late (a frame or more
  // after a finish() call).
  const dateFinish = (
    entry: {
      animation: Animation;
      finishedAt: number | null;
      startedAt: number | null;
      finishStart: number | null;
    },
    at: number | null,
  ) => {
    const animation = entry.animation;
    const end = Number(
      (animation.effect as KeyframeEffect | null)?.getComputedTiming()
        .endTime ?? 0,
    );
    const speed = Math.abs(animation.playbackRate || 1);
    // The finish event's timeline time is the engine's own, already real.
    entry.finishStart =
      real(playStart(animation)) ??
      entry.startedAt ??
      (at == null ? null : at - end / speed);
    entry.finishedAt =
      entry.finishStart == null
        ? performance.now() + span()
        : entry.finishStart + end / speed;
    if (entry.startedAt == null) {
      // Cancelled before a frame read its start: back from where it ended.
      entry.startedAt = entry.finishStart ?? entry.finishedAt - end / speed;
    }
  };
  const remember = (animation: Animation) => {
    const recorded = entries.get(animation);
    if (recorded != null) {
      // A run paused and resumed (by the page, or by a hold and its release),
      // seeked, or given another rate runs on a new start time: the start
      // kept is the one it runs on, which its finish falls back to once the
      // page has cancelled it.
      if (animation.playState === 'running' && animation.startTime != null) {
        recorded.startedAt = real(playStart(animation));
      }
      return;
    }
    // A running animation is recorded while still pending: on a cold page the
    // next frame can come only after a short animation has finished.
    if (animation.playState !== 'running') {
      return;
    }
    // The target's ancestors as recorded: an exit whose element the page
    // removes at its end is still reported for the container it left.
    const ancestors: Element[] = [];
    for (
      let node = (animation.effect as KeyframeEffect | null)?.target ?? null;
      node != null;
      node = node.parentElement
    ) {
      ancestors.push(node);
    }
    const entry = {
      animation,
      seenAt: performance.now(),
      finishedAt: null as number | null,
      startedAt: real(playStart(animation)),
      finishStart: null as number | null,
      cancelledAt: null as number | null,
      playedMs: null as number | null,
      ancestors,
    };
    entries.set(animation, entry);
    if (entry.startedAt == null) {
      unstarted.push(entry);
    }
    animation.addEventListener('finish', event => {
      const at = (event as AnimationPlaybackEvent).timelineTime;
      dateFinish(entry, at == null ? null : Number(at));
    });
    log.push(entry);
    if (log.length > 5000) {
      log.splice(0, log.length - 5000);
    }
  };
  const record = () => {
    for (const animation of document.getAnimations()) {
      remember(animation);
    }
    unstarted = unstarted.filter(entry => {
      if (entry.startedAt == null && entry.animation.startTime != null) {
        entry.startedAt = real(playStart(entry.animation));
      }
      return entry.startedAt == null && entry.animation.playState !== 'idle';
    });
  };
  // While a rendering trace runs (traceRendering sets
  // `__harnessRenderingTrace`), the recorder stands down. Its per-frame
  // callback would make every frame a main-thread frame, in which Blink
  // restyles each running animation's target, a composited one included (and
  // lays out an anchored one), and document.getAnimations() flushes style:
  // exactly what the trace counts. So it runs no frame callback, and a CSS
  // animation or transition event reads only the animations of the element it
  // names, once, at that animation's start (one that ends inside the trace is
  // otherwise never seen). The animate() wrapper below still records script
  // animations (it reads no style), and traceRendering resumes the recorder
  // once the trace ends.
  const tracing = () =>
    (window as unknown as {__harnessRenderingTrace?: boolean})
      .__harnessRenderingTrace === true;
  let looping = false;
  const tick = () => {
    if (tracing()) {
      looping = false;
      return;
    }
    record();
    frame(tick);
  };
  const loop = () => {
    if (!looping) {
      looping = true;
      frame(tick);
    }
  };
  // What already runs when the recorder starts (a spinner on a page the
  // harness touches for the first time) is seen now, before any watch arms;
  // first seen a frame later, it would read as started by the watched action.
  // (A recorder that starts during a trace reads once here, then waits.)
  record();
  loop();
  // A start event with nothing left to read: a CSS animation shorter than the
  // gap between two of the page's frames can start and finish inside it, and
  // WebKit sends its start event only at the next frame, when
  // `getAnimations()` no longer lists a finished animation that fills
  // nothing. No object is left to record, so the event is kept: a wait that
  // finds nothing names what it missed.
  // Whether a recorded entry is the run a CSS animation or transition event
  // is about: the same element (and pseudo-element) and name.
  const isRunOf = (entry: {animation: Animation}, event: Event) => {
    const effect = entry.animation.effect as KeyframeEffect | null;
    const a = entry.animation as unknown as {
      animationName?: string;
      transitionProperty?: string;
    };
    return (
      effect?.target === event.target &&
      (effect?.pseudoElement || '') ===
        ((event as AnimationEvent).pseudoElement || '') &&
      (a.animationName ?? a.transitionProperty) === cssRunName(event)
    );
  };
  const onStart = (event: Event) => {
    if (tracing()) {
      // Inside a trace, read only the element the event names, once: a
      // document-wide read flushes style.
      const target = event.target;
      if (target instanceof Element) {
        // A pseudo-element's animation (`::backdrop`) is in the subtree.
        const pseudo = (event as AnimationEvent | TransitionEvent)
          .pseudoElement;
        for (const animation of target.getAnimations({subtree: !!pseudo})) {
          remember(animation);
        }
      }
      return;
    }
    record();
    // Only a live run answers: a replay of an animation that finished on the
    // same element is a new run, and missed if nothing recorded it. A run the
    // document still lists, running or paused, answers too: one that starts
    // paused is never recorded, and one replayed with play() keeps the
    // finish of its first run.
    const live =
      log.some(
        entry =>
          entry.finishedAt == null &&
          entry.animation.playState !== 'idle' &&
          isRunOf(entry, event),
      ) ||
      document
        .getAnimations()
        .some(
          animation =>
            (animation.playState === 'running' ||
              animation.playState === 'paused') &&
            isRunOf({animation}, event),
        );
    if (!live) {
      const ancestors: Element[] = [];
      for (
        let node = event.target instanceof Element ? event.target : null;
        node != null;
        node = node.parentElement
      ) {
        ancestors.push(node);
      }
      unread.push({
        at: performance.now(),
        target: event.target,
        ancestors,
        type: event.type,
        name: cssRunName(event),
      });
      if (unread.length > 500) {
        unread.splice(0, unread.length - 500);
      }
    }
  };
  for (const type of ['animationstart', 'transitionrun', 'transitionstart']) {
    document.addEventListener(type, onStart, true);
  }
  // Whether a run stands at its end in the direction it plays: finished, or
  // still reading `running` with its current time there, to a microsecond
  // (Chromium read 0.00000003 ms for a reversed run at its start). Chromium
  // can send a CSS run's end event a frame before the run itself finishes.
  const atEnd = (animation: Animation) => {
    if (animation.playState === 'finished') {
      return true;
    }
    if (animation.playState !== 'running' || animation.currentTime == null) {
      return false;
    }
    const time = Number(animation.currentTime);
    const end = Number(
      (animation.effect as KeyframeEffect | null)?.getComputedTiming()
        .endTime ?? 0,
    );
    return animation.playbackRate < 0 ? time <= 0.001 : time >= end - 0.001;
  };
  // A CSS run's end event, read before the page's own listeners (this one is
  // on the document, in the capture phase), while the run still has its start
  // time. A page that removes the element at its end cancels a run whose end
  // event came before it finished, and a cancelled run never finishes: under
  // load, a CSS exit reversed partway sent `transitionend` at current time 0,
  // still `running`, and was cancelled a frame later with no finish event.
  const onEnd = (event: Event) => {
    for (const entry of log) {
      if (
        entry.finishedAt == null &&
        atEnd(entry.animation) &&
        isRunOf(entry, event)
      ) {
        dateFinish(entry, null);
      }
    }
  };
  for (const type of ['animationend', 'transitionend']) {
    document.addEventListener(type, onEnd, true);
  }
  // A script animation is recorded as it is made: WebKit can start and finish
  // a short one between two frames of a fresh page.
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (
    this: Element,
    ...args: Parameters<Element['animate']>
  ) {
    const animation = animate.apply(this, args);
    remember(animation);
    return animation;
  };
  // A run that the page cancels while it plays ended there, and no finish
  // event comes. Core's motion animator retires each run so: once the curve
  // ends, it writes the end inline and cancels the run. The run's finish
  // would come only after a long end-state tail. So the run's start and how
  // much of its curve it presented are read here, before the cancel clears
  // them. A run cancelled before its first frame has no start, and it
  // presented nothing. The state of a CSS run is read only outside a
  // rendering trace, because those reads flush style.
  const cancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function (this: Animation) {
    const entry = entries.get(this);
    const isCss = 'animationName' in this || 'transitionProperty' in this;
    if (
      entry != null &&
      entry.finishedAt == null &&
      !(isCss && tracing()) &&
      this.playState === 'running' &&
      this.startTime != null
    ) {
      // The specified timing: a script animation's computed timing can
      // restyle its target, which a rendering trace counts.
      const timing = this.effect?.getTiming();
      const delay = Number(timing?.delay ?? 0);
      const endDelay = Number(timing?.endDelay ?? 0);
      const duration =
        typeof timing?.duration === 'number' ? timing.duration : 0;
      const end = delay + duration * Number(timing?.iterations ?? 1) + endDelay;
      const rate = this.playbackRate;
      const speed = Math.abs(rate || 1);
      const time = Number(this.currentTime ?? 0);
      // A run going backward began at its end.
      if (rate >= 0 || Number.isFinite(end)) {
        entry.finishStart = real(
          rate < 0
            ? Number(this.startTime) - end / speed
            : Number(this.startTime),
        );
        entry.cancelledAt = performance.now() + span();
        // Negative while the run is still in its start delay: it presented
        // nothing, as the live check reads it.
        entry.playedMs =
          (rate < 0 ? end - endDelay - time : time - delay) / speed;
      }
    }
    return cancel.call(this);
  };
  w.__harnessAnimations = {
    log,
    unread,
    // A read from outside the recorder (a wait's poll) stands down while a
    // trace runs, as the frame loop does: document.getAnimations() flushes
    // style. CSS start events and the animate() wrapper still log what
    // starts, and resume() catches up.
    record: () => {
      if (!tracing()) {
        record();
      }
    },
    // Catches up on what started during a trace, then runs its frames again.
    resume: () => {
      record();
      loop();
    },
    // Record first, then stamp strictly after the newest entry: a step that
    // changed style just before has its transition created by that read,
    // and it started before the arm. While a trace runs the page-wide read
    // stands down, as record() does; the watched element's own animations
    // are still read, which resolves its pending style change. That read
    // restyles the element (and lays out an anchored one) in the task that
    // takes the watch, so a traced proof takes its watch before the window
    // it counts (README: No Layout / Paint).
    arm: (element?: Element) => {
      if (!tracing()) {
        record();
      } else if (element != null) {
        for (const animation of element.getAnimations({subtree: true})) {
          remember(animation);
        }
      }
      const newest = log.length === 0 ? 0 : log[log.length - 1].seenAt;
      armedAt = Math.max(performance.now(), newest + 0.001);
      return armedAt;
    },
    armedAt: () => armedAt,
    // Drops every animation the log holds, with the elements and ancestors
    // they keep alive; later waits record afresh.
    release: () => {
      log.length = 0;
      unread.length = 0;
      unstarted = [];
    },
  };
}

const recordingPages = new WeakSet<Page>();

/** Starts the recorder now and on every later document of the page. */
async function installRecorder(page: Page): Promise<void> {
  if (!recordingPages.has(page)) {
    recordingPages.add(page);
    await page.addInitScript(animationRecorder);
  }
  await page.evaluate(animationRecorder);
}

/**
 * Installs `window.__harnessCurveEnd(animation)`: the local time (ms, delay
 * included) where the animation's effect stops changing. An animation whose
 * keyframes end in a run of identical values (an end value held so that a
 * later interruption can read it) ends where that run starts, when it plays
 * forward under a linear or cubic-bézier effect easing (the time the run
 * starts is solved from the curve); any other ends at its end time. The same
 * evaluate installs `window.__harnessHold(root)`, which holds every running
 * animation on the document timeline (only those whose target is `root` or
 * inside it, when `root` is set) and returns what it held (see
 * `holdAnimations`), so `holdAnimations` and `armHold` hold the same way.
 */
async function installCurveEnd(page: Page): Promise<void> {
  await installRecorder(page);
  // The hold, installed with the curve end it reads: one round trip installs
  // both, so a hold sent from the test costs no extra one.
  await page.evaluate(
    `(${defineCurveEnd.toString()})();(${defineHold.toString()})();`,
  );
}

/**
 * Installs `window.__harnessHold(root)` in the page, once (see
 * `installCurveEnd`). A page function: it closes over nothing, and reads the
 * curve end `defineCurveEnd` installs.
 */
function defineHold(): void {
  const w = window as unknown as {
    __harnessHold?: (
      root: Element | null,
      skip?: ReadonlySet<Animation>,
    ) => unknown[];
  };
  if (w.__harnessHold) {
    return;
  }
  w.__harnessHold = (root: Element | null, skip?: ReadonlySet<Animation>) => {
    const curveEnd = (
      window as unknown as {__harnessCurveEnd: (a: Animation) => number}
    ).__harnessCurveEnd;
    const describe = (node: Element | null) =>
      node == null
        ? null
        : node.tagName.toLowerCase() +
          (node.id ? `#${node.id}` : '') +
          (node.classList.length
            ? `.${[...node.classList].slice(0, 2).join('.')}`
            : '');
    const now = Number(document.timeline.currentTime ?? performance.now());
    const all = document.getAnimations().filter(animation => {
      const target =
        (animation.effect as KeyframeEffect | null)?.target ?? null;
      return (
        animation.playState === 'running' &&
        animation.timeline instanceof DocumentTimeline &&
        !(skip?.has(animation) ?? false) &&
        (root == null ||
          (target != null && (root === target || root.contains(target))))
      );
    });
    // Seeking and sampling run a curve forward: an animation running
    // backward (`reverse()`, a negative playback rate) cannot be held and
    // read, so it is refused rather than misread.
    const backward = all.find(animation => animation.playbackRate < 0);
    if (backward != null) {
      throw new Error(
        `holdAnimations: ${describe((backward.effect as KeyframeEffect | null)?.target ?? null) ?? 'an animation'} runs backward (reverse() or a negative playback rate); hold and sample a forward run instead`,
      );
    }
    // Each animation's start on the document timeline, read before the pause
    // clears it. A pending play has no start time yet: it starts now, as far
    // back as its current time reaches through its playback rate (at rate 2,
    // a run covers its curve in half the timeline), as seeking reads it.
    const starts = all.map(animation =>
      animation.startTime != null
        ? Number(animation.startTime)
        : now -
          Number(animation.currentTime ?? 0) / (animation.playbackRate || 1),
    );
    const held = all.map(animation => {
      animation.pause();
      // `pause()` only schedules the pause: the engine takes the hold time at
      // its next frame, a frame past where this read it. Setting the current
      // time completes a pending pause at once, here.
      // eslint-disable-next-line no-self-assign
      animation.currentTime = animation.currentTime;
      return animation;
    });
    // A later hold adds to the held set: what an earlier one held stays held
    // (it is paused, so it is not taken again above) until released.
    const w = window as unknown as {
      __harnessHeld?: Animation[];
      __harnessHeldStarts?: number[];
      __harnessHeldOrigin?: number;
    };
    w.__harnessHeld = [...(w.__harnessHeld ?? []), ...held];
    w.__harnessHeldStarts = [...(w.__harnessHeldStarts ?? []), ...starts];
    // Times count from the origin the first hold set (its earliest start)
    // until the release: a later hold, even of an animation that started
    // earlier (its offset is then negative), and dropping one never move it,
    // so every offsetMs already returned stays true.
    const origin = Number.isFinite(w.__harnessHeldOrigin ?? Number.NaN)
      ? (w.__harnessHeldOrigin as number)
      : Math.min(...starts);
    w.__harnessHeldOrigin = origin;
    const offsets = starts.map(start => start - origin);
    return held.map((animation, index) => {
      const effect = animation.effect as KeyframeEffect | null;
      const timing = effect?.getComputedTiming();
      const cssName =
        'transitionProperty' in animation
          ? (animation as unknown as {transitionProperty: string})
              .transitionProperty
          : 'animationName' in animation
            ? (animation as unknown as {animationName: string}).animationName
            : null;
      return {
        index,
        kind: animation.constructor.name,
        name: cssName,
        target: describe((effect?.target as Element | null) ?? null),
        durationMs: Number(timing?.duration ?? 0),
        delayMs: Number(timing?.delay ?? 0),
        curveEndMs: curveEnd(animation),
        easing: String(effect?.getTiming().easing ?? 'linear'),
        keyframes: (effect?.getKeyframes() ?? []).map(
          (k): Record<string, unknown> => ({...k}),
        ),
        heldAtMs:
          animation.currentTime == null ? null : Number(animation.currentTime),
        offsetMs: offsets[index],
      };
    });
  };
}

export interface HeldAnimation {
  readonly index: number;
  /** `CSSTransition`, `CSSAnimation` or `Animation` (script-created). */
  readonly kind: string;
  /** Transitioned property or animation name, when CSS made it. */
  readonly name: string | null;
  readonly target: string | null;
  readonly durationMs: number;
  readonly delayMs: number;
  /**
   * Where its curve ends, ms from its start (delay included): before a held
   * end value, if its keyframes end in one and it plays forward under a
   * linear or cubic-bézier effect easing; otherwise its end time.
   */
  readonly curveEndMs: number;
  readonly easing: string;
  readonly keyframes: readonly Record<string, unknown>[];
  /** Where it was when held, ms. */
  readonly heldAtMs: number | null;
  /**
   * How much later than the held origin (the earliest start among the
   * animations the first hold took) it started, ms; negative for an earlier
   * start held by a later hold. A seek to t moves it to its own t - offsetMs,
   * so staggered starts stay staggered.
   */
  readonly offsetMs: number;
}

/**
 * Pauses every running animation in the document (optionally only those whose
 * target is inside `scope`) and returns what was held. Finished animations,
 * animations the page paused, and animations on a scroll or view timeline are
 * left as they are. Later `seekAnimations` calls move exactly the held set,
 * each by its offset from the held origin, and `releaseAnimations` resumes
 * only it. A second call adds to the held set: what the first held stays held
 * until the release, and offsets keep counting from the origin the first call
 * set (the earliest start it took), so offsets already returned stay true.
 * An animation the page cancels after the hold (retargeting a CSS transition
 * cancels it) leaves the held set: seeking, sampling and releasing skip it
 * rather than revive it.
 *
 * `judges` names the motion that the test reads from the hold, as for
 * `armHold`. A hold sent from the test takes what runs when it reaches the
 * page: the judged motion can still be to come, or already over on a busy
 * runner, while other animations under the scope run. So the call rejects
 * when it took no animation of each judged motion.
 */
export async function holdAnimations(
  page: Page,
  scope: Locator | undefined,
  options: HoldOptions,
): Promise<HeldAnimation[]> {
  const motions = judgedMotions('holdAnimations', options?.judges);
  const scopeHandle = scope ? await scope.elementHandle() : null;
  await installCurveEnd(page);
  holdKeys += 1;
  const key = holdKeys;
  const held = await page.evaluate(
    ([root, id, judged]) => {
      const w = window as unknown as {
        __harnessHold: (root: Element | null) => HeldAnimation[];
        __harnessHeld?: Animation[];
        __harnessTook?: Record<number, Animation[]>;
      };
      const took = w.__harnessHold(root);
      // The hold appends what it took to the held set. The judged-motion
      // check reads these animations.
      if (judged && took.length > 0) {
        w.__harnessTook = {
          ...w.__harnessTook,
          [id]: (w.__harnessHeld ?? []).slice(-took.length),
        };
      }
      return took;
    },
    [scopeHandle, key, motions.length > 0] as const,
  );
  await expectJudgedMotionsHeld(page, key, motions, {
    caller: 'holdAnimations',
    cause:
      'The judged motion did not run when the hold reached the page (not started yet, or already over)',
    remedy:
      'Arm the hold before the action that starts the motion (armHold), so the page holds it as it starts.',
  });
  return held;
}

/** An armed hold (`armHold`): the page holds on its own; read what it held. */
export interface ArmedHold {
  /**
   * What the page held, once an animation under the scope ran. Rejects when
   * the hold took no animation of a judged motion.
   */
  held(): Promise<HeldAnimation[]>;
}

/**
 * A motion that a test judges from an armed hold: an animation of `property`
 * on `target`.
 */
export interface JudgedMotion {
  readonly target: Locator;
  /**
   * The animated property, as CSS names it (`translate`, `background-color`,
   * `--press-strength`).
   */
  readonly property: string;
  /** The pseudo-element that runs the motion, when the target's own does. */
  readonly pseudoElement?: '::before' | '::after';
}

/**
 * The motions an armed hold must take. `'count-only'` checks none: it marks a
 * call site whose hold does not yet take the motion that the test judges.
 */
export type HoldJudges = JudgedMotion | readonly JudgedMotion[] | 'count-only';

/** What a hold must take (`holdAnimations`). */
export interface HoldOptions {
  readonly judges: HoldJudges;
}

/** How an armed hold waits (`armHold`), and what it must take. */
export interface ArmHoldOptions extends HoldOptions {
  readonly count?: number;
  readonly minProgressMs?: number;
  readonly newOnly?: boolean;
  readonly timeout?: number;
}

/** Keys each hold's record of what it took, for the judged-motion check. */
let holdKeys = 0;

/**
 * The judged motions as a list: empty for `'count-only'`. Throws when the
 * caller names none.
 */
function judgedMotions(
  caller: string,
  judges: HoldJudges | undefined,
): readonly JudgedMotion[] {
  if (judges == null) {
    throw new Error(
      `${caller}: name the motion that the test judges ({judges: {target, property}}). Other animations can be what the hold takes while that motion does not run. Pass 'count-only' only for a call site that does not hold its judged motion yet.`,
    );
  }
  return judges === 'count-only' ? [] : 'target' in judges ? [judges] : judges;
}

/**
 * Arms the page to hold every running animation under `scope` (the whole
 * document without one) itself, as soon as one of them runs (and has run
 * `minProgressMs`, 0 by default; or as soon as `count` of them run, for parts
 * that start apart; with `newOnly`, only animations that start after the arm
 * count and are held, so a turn that starts mid-motion is held while the
 * motion goes on), and resolves once it is armed: await it
 * before the action that starts the animation, then read `held()` after. A
 * hold sent from the test once the animation runs (`holdAnimations`) reaches
 * the page later the busier the machine is, and a short animation can end
 * first; the page itself looks on every frame and every 4 ms between them and
 * holds it as soon as it runs, which a starved page only delays, as it delays
 * the animation's own start. What it
 * holds joins the held set as `holdAnimations`' does, so `seekAnimations`,
 * `sampleCurve` and `releaseAnimations` read it the same way, and a later
 * hold adds to it. Arm it while nothing under `scope` runs, or pass
 * `newOnly`: otherwise an animation already running counts. The busy-window control's own animation
 * (`startBusyControl`) never counts, but an unscoped hold, which takes every
 * running animation, pauses it too: scope the hold in a busy-window proof.
 * `held()` rejects when nothing under the scope runs within `timeout` ms of
 * arming.
 *
 * `judges` names the motion that the test reads from the hold. Other
 * animations under the scope (a press, a colour change) can meet the count
 * before that motion starts, and a hold that took only them proves nothing
 * about it. So `held()` also rejects when the hold took no animation of
 * each judged motion.
 *
 * @example
 * ```
 * const hold = await armHold(page, row, {
 *   judges: {target: row, property: 'opacity'},
 * });
 * await driver.play(tap(center, {holdMs: 400}));
 * const [release] = await hold.held();
 * ```
 */
export async function armHold(
  page: Page,
  scope: Locator | undefined,
  options: ArmHoldOptions,
): Promise<ArmedHold> {
  const {
    judges,
    count = 1,
    minProgressMs = 0,
    newOnly = false,
    timeout = 5_000,
  } = options ?? ({} as Partial<ArmHoldOptions>);
  const motions = judgedMotions('armHold', judges);
  const scopeHandle = scope ? await scope.elementHandle() : null;
  await installCurveEnd(page);
  holdKeys += 1;
  const id = holdKeys;
  await page.evaluate(
    ([root, needed, minProgress, fresh, wait, key, judged]) => {
      const w = window as unknown as {
        __harnessHold: (
          root: Element | null,
          skip?: ReadonlySet<Animation>,
        ) => unknown[];
        __harnessHeld?: Animation[];
        __harnessTimerGate?: {
          frame?: typeof requestAnimationFrame;
          now?: () => number;
          timeout?: typeof setTimeout;
        };
        __harnessArmed?: Record<number, Promise<unknown[]>>;
        __harnessTook?: Record<number, Animation[]>;
      };
      // The harness's own waits run on the real timers: a frozen timer gate
      // (story.ts) holds only the page's.
      const frame =
        w.__harnessTimerGate?.frame ??
        window.requestAnimationFrame.bind(window);
      const later =
        w.__harnessTimerGate?.timeout ?? window.setTimeout.bind(window);
      // The deadline reads the real clock, which a page freeze does not stop.
      const realNow = w.__harnessTimerGate?.now ?? (() => performance.now());
      const deadline = realNow() + wait;
      // With `newOnly`, what the document has when armed neither counts nor
      // joins the hold: a motion already running goes on, and the page holds
      // the one that starts after it.
      const before = fresh ? new Set(document.getAnimations()) : undefined;
      const counts = (animation: Animation) => {
        const target =
          (animation.effect as KeyframeEffect | null)?.target ?? null;
        return (
          animation.playState === 'running' &&
          animation.timeline instanceof DocumentTimeline &&
          !(before?.has(animation) ?? false) &&
          (root == null ||
            (target != null && (root === target || root.contains(target)))) &&
          !(
            target instanceof Element &&
            target.closest('[data-harness-control]') != null
          ) &&
          Number(animation.currentTime ?? 0) /
            Math.abs(animation.playbackRate || 1) >=
            minProgress
        );
      };
      const held = new Promise<unknown[]>((resolve, reject) => {
        // Looked for on every frame and every 4 ms between them: WebKit can
        // present no frame for about 70 ms while it first composites a newly
        // animated layer (longer on a loaded runner), and its animations and
        // timers run on meanwhile, so a look between frames holds a short one
        // that much earlier.
        let done = false;
        let round = 0;
        const schedule = () => {
          const mine = ++round;
          const run = () => {
            // Of the frame and the timer a round schedules, the first runs.
            if (mine === round) {
              tick();
            }
          };
          frame(run);
          later(run, 4);
        };
        const tick = () => {
          if (done) {
            return;
          }
          if (document.getAnimations().filter(counts).length >= needed) {
            done = true;
            try {
              const took = w.__harnessHold(root, before);
              // The hold appends what it took to the held set. `held()` reads
              // these animations to find the judged motions.
              if (judged && took.length > 0) {
                w.__harnessTook = {
                  ...w.__harnessTook,
                  [key]: (w.__harnessHeld ?? []).slice(-took.length),
                };
              }
              resolve(took);
            } catch (error) {
              reject(error);
            }
          } else if (realNow() > deadline) {
            done = true;
            reject(
              new Error(
                `armHold: no animation under the scope ran within ${wait} ms`,
              ),
            );
          } else {
            schedule();
          }
        };
        schedule();
      });
      // Read by `held()`; a rejection nobody reads yet is not the page's.
      held.catch(() => undefined);
      w.__harnessArmed = {...w.__harnessArmed, [key]: held};
    },
    [
      scopeHandle,
      Math.max(count, 1),
      Math.max(minProgressMs, 0),
      newOnly,
      timeout,
      id,
      motions.length > 0,
    ] as const,
  );
  return {
    held: async () => {
      const held = await page.evaluate(key => {
        const w = window as unknown as {
          __harnessArmed?: Record<number, Promise<HeldAnimation[]>>;
        };
        const armed = w.__harnessArmed?.[key];
        if (armed == null) {
          throw new Error('armHold: this hold was never armed on this page');
        }
        delete w.__harnessArmed?.[key];
        return armed;
      }, id);
      await expectJudgedMotionsHeld(page, id, motions, {
        caller: 'armHold',
        cause: `Other animations met its count of ${Math.max(count, 1)} first`,
        remedy:
          'Arm the hold so that it waits for the judged motion (count, newOnly, minProgressMs, scope).',
      });
      return held;
    },
  };
}

/**
 * Throws unless the hold `key` took an animation of each judged motion. The
 * targets resolve only now: the action that an armed hold waits for can add
 * them to the page. `cause` and `remedy` complete the error for the caller.
 */
async function expectJudgedMotionsHeld(
  page: Page,
  key: number,
  motions: readonly JudgedMotion[],
  failure: {caller: string; cause: string; remedy: string},
): Promise<void> {
  if (motions.length === 0) {
    return;
  }
  const targets = await Promise.all(
    motions.map(motion =>
      motion.target.elementHandle({timeout: 5_000}).catch(() => {
        throw new Error(
          `${failure.caller}: the judged target ${motion.target.toString()} is not on the page`,
        );
      }),
    ),
  );
  const {missing, took} = await page.evaluate(
    ([armed, elements, wanted]) => {
      const w = window as unknown as {
        __harnessTook?: Record<number, Animation[]>;
      };
      const animations = w.__harnessTook?.[armed] ?? [];
      delete w.__harnessTook?.[armed];
      // `getKeyframes()` names a property in camel case, except a custom
      // property.
      const keyframeName = (property: string) =>
        property.startsWith('--')
          ? property
          : property.replace(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            );
      // Chromium's `getKeyframes()` leaves out a custom property that a CSS
      // animation animates. The `@keyframes` rule of that name lists it. The
      // rule can sit inside a grouping rule (`@layer`, `@media`).
      const keyframesRules = (rules: readonly CSSRule[]): CSSKeyframesRule[] =>
        rules.flatMap(rule =>
          rule instanceof CSSKeyframesRule
            ? [rule]
            : rule instanceof CSSGroupingRule
              ? keyframesRules([...rule.cssRules])
              : [],
        );
      const ruleProperties = (name: string) =>
        [...document.styleSheets, ...document.adoptedStyleSheets].flatMap(
          sheet => {
            let rules: CSSRule[] = [];
            try {
              rules = [...sheet.cssRules];
            } catch {
              // A cross-origin sheet does not expose its rules.
            }
            return keyframesRules(rules)
              .filter(rule => rule.name === name)
              .flatMap(rule =>
                [...rule.cssRules].flatMap(keyframe => [
                  ...(keyframe as CSSKeyframeRule).style,
                ]),
              );
          },
        );
      const properties = (animation: Animation) => [
        ...new Set([
          ...((animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [])
            .flatMap(keyframe => Object.keys(keyframe))
            .filter(
              name =>
                !['offset', 'computedOffset', 'easing', 'composite'].includes(
                  name,
                ),
            ),
          ...(animation instanceof CSSAnimation
            ? ruleProperties(animation.animationName).map(keyframeName)
            : []),
        ]),
      ];
      const describe = (animation: Animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target ?? null;
        const name =
          target == null
            ? 'no target'
            : target.tagName.toLowerCase() +
              (target.id ? `#${target.id}` : '') +
              (target.classList.length
                ? `.${[...target.classList].slice(0, 2).join('.')}`
                : '');
        return `${name}${effect?.pseudoElement ?? ''} ${properties(animation).join(' ')}`;
      };
      return {
        missing: wanted.flatMap((motion, index) =>
          animations.some(animation => {
            const effect = animation.effect as KeyframeEffect | null;
            return (
              effect != null &&
              effect.target === elements[index] &&
              (effect.pseudoElement ?? null) === motion.pseudoElement &&
              properties(animation).includes(keyframeName(motion.property))
            );
          })
            ? []
            : [index],
        ),
        took: animations.map(describe),
      };
    },
    [
      key,
      targets,
      motions.map(motion => ({
        property: motion.property,
        pseudoElement: motion.pseudoElement ?? null,
      })),
    ] as const,
  );
  if (missing.length > 0) {
    const judged = missing
      .map(index => {
        const motion = motions[index];
        return `${motion.property} on ${motion.target.toString()}${motion.pseudoElement ?? ''}`;
      })
      .join(', ');
    throw new Error(
      `${failure.caller}: the hold took no animation of the judged motion (${judged}). ` +
        `${failure.cause}; it took: ` +
        `${took.length > 0 ? took.join('; ') : 'nothing'}. ` +
        failure.remedy,
    );
  }
}

/**
 * Moves every held animation to `timeMs` from the held origin (delay
 * included): each to its own `timeMs - offsetMs`. A time at or past an
 * animation's end is clamped to END_INSET_MS before it: an animation without
 * `fill` stops applying its effect exactly at the end, and the frame wanted
 * there is the last one it presents. (Half a millisecond, not less: engines
 * round `currentTime` writes to their timer resolution.) Returns the time the
 * page then presents: `timeMs`, or the latest clamped end when every held
 * animation was clamped.
 */
export async function seekAnimations(
  page: Page,
  timeMs: number,
): Promise<number> {
  return page.evaluate(
    ({t, inset}) => {
      const w = window as unknown as {
        __harnessHeld?: Animation[];
        __harnessHeldStarts?: number[];
        __harnessHeldOrigin?: number;
      };
      // An animation the page cancelled since the hold (a CSS transition is
      // cancelled whenever the page retargets its property) leaves the held set:
      // applying or playing it again would revive what the page dropped.
      const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
        animation.playState === 'idle'
          ? []
          : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
      );
      w.__harnessHeld = kept.map(k => k.animation);
      w.__harnessHeldStarts = kept.map(k => k.start);
      const origin = w.__harnessHeldOrigin ?? 0;
      let presented = -Infinity;
      kept.forEach(({animation, start}) => {
        const offset = start - origin;
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        // A faster rate runs more curve per timeline ms.
        const rate = animation.playbackRate || 1;
        const local = Math.min((t - offset) * rate, end - inset);
        animation.currentTime = local;
        presented = Math.max(presented, local / rate + offset);
      });
      return Number.isFinite(presented) ? presented : t;
    },
    {t: timeMs, inset: END_INSET_MS},
  );
}

/**
 * Resumes (default) or finishes every held animation: only those
 * `holdAnimations` paused, so an animation the page paused stays paused. An
 * animation that repeats forever has no end to finish at, so `finish`
 * resumes it instead. The held set is cleared even if one throws.
 */
export async function releaseAnimations(
  page: Page,
  {finish = false}: {finish?: boolean} = {},
): Promise<void> {
  await page.evaluate(shouldFinish => {
    const w = window as unknown as {
      __harnessHeld?: Animation[];
      __harnessHeldStarts?: number[];
      __harnessHeldOrigin?: number;
    };
    // An animation the page cancelled since the hold (a CSS transition is
    // cancelled whenever the page retargets its property) leaves the held set:
    // applying or playing it again would revive what the page dropped.
    const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
      animation.playState === 'idle'
        ? []
        : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
    );
    w.__harnessHeld = kept.map(k => k.animation);
    w.__harnessHeldStarts = kept.map(k => k.start);
    try {
      for (const {animation} of kept) {
        const end = Number(
          animation.effect?.getComputedTiming().endTime ?? Infinity,
        );
        if (shouldFinish && Number.isFinite(end)) {
          animation.finish();
        } else {
          animation.play();
        }
      }
    } finally {
      w.__harnessHeld = [];
      w.__harnessHeldStarts = [];
      w.__harnessHeldOrigin = undefined;
    }
  }, finish);
}

export interface CurveSample {
  /** The requested time. */
  readonly t: number;
  /**
   * The time the sampled element presents: `t`, or just inside the end of
   * its own animations when the sample was taken at or past it (see
   * `seekAnimations`). Read from the element's own animations only (from
   * every held one if none targets it); when sampling a pseudo-element, from
   * that pseudo-element's.
   */
  readonly presentedAt: number;
  /**
   * The same per channel group, from the element's animations of those
   * properties: a 300 ms move beside a 400 ms fade on one element is read
   * just inside 300 ms for the transform and at the requested time for the
   * opacity. `curveOf` reads oracles here.
   */
  readonly presentedAtFor: {
    readonly transform: number;
    readonly opacity: number;
  };
  /**
   * The presented 2D transform: `translate` · `rotate` · `scale` ·
   * `transform`, composed in the order CSS applies them.
   */
  readonly transform: Transform2D;
  readonly opacity: number;
  /** Raw computed values, for the JSON trace. */
  readonly raw: {
    readonly transform: string;
    readonly translate: string;
    readonly rotate: string;
    readonly scale: string;
    readonly opacity: string;
  };
}

/**
 * The presented transform and opacity of `locator` at each time (ms from the
 * held origin, as for `seekAnimations`). Hold the animations first. An animation of the
 * individual `translate`, `rotate` or `scale` properties is included: they
 * are composed with `transform` into one matrix.
 *
 * `pseudoElement` samples the element's `::before` or `::after` instead:
 * its presented values, labelled by its own animations (those whose effect
 * targets the element with that pseudo-element), as a component that animates
 * a pseudo-element (`element.animate(keyframes, {pseudoElement})`) draws it.
 */
export async function sampleCurve(
  locator: Locator,
  times: readonly number[],
  {pseudoElement}: {pseudoElement?: '::before' | '::after'} = {},
): Promise<CurveSample[]> {
  const raw = await locator.evaluate(
    (element, {ts, inset, pseudo}) => {
      const w = window as unknown as {
        __harnessHeld?: Animation[];
        __harnessHeldStarts?: number[];
        __harnessHeldOrigin?: number;
      };
      // An animation the page cancelled since the hold (a CSS transition is
      // cancelled whenever the page retargets its property) leaves the held set:
      // applying or playing it again would revive what the page dropped.
      const kept = (w.__harnessHeld ?? []).flatMap((animation, index) =>
        animation.playState === 'idle'
          ? []
          : [{animation, start: (w.__harnessHeldStarts ?? [])[index] ?? 0}],
      );
      w.__harnessHeld = kept.map(k => k.animation);
      w.__harnessHeldStarts = kept.map(k => k.start);
      const held = kept.map(k => k.animation);
      const origin = w.__harnessHeldOrigin ?? 0;
      if (held.length === 0) {
        throw new Error(
          'sampleCurve: no held animations (call holdAnimations first)',
        );
      }
      // The properties each held animation of the sampled box animates: the
      // element's own, or its pseudo-element's when one is sampled. Another
      // box's animation (the element's `::before` when the element is
      // sampled) is not its own: its clock would label the samples with
      // another box's time.
      const own = held.map(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        if (
          effect?.target !== element ||
          (effect.pseudoElement ?? null) !== pseudo
        ) {
          return null;
        }
        const properties = new Set<string>();
        for (const keyframe of effect.getKeyframes()) {
          for (const key of Object.keys(keyframe)) {
            properties.add(key);
          }
        }
        return properties;
      });
      const TRANSFORM = ['transform', 'translate', 'rotate', 'scale'];
      return ts.map(t => {
        let presented = -Infinity;
        let presentedOwn = -Infinity;
        let presentedTransform = -Infinity;
        let presentedOpacity = -Infinity;
        held.forEach((animation, index) => {
          // Each at its own offset, just inside its end: see seekAnimations.
          const offset = kept[index].start - origin;
          const end = Number(
            animation.effect?.getComputedTiming().endTime ?? Infinity,
          );
          // A faster rate runs more curve per timeline ms.
          const rate = animation.playbackRate || 1;
          const local = Math.min((t - offset) * rate, end - inset);
          animation.currentTime = local;
          presented = Math.max(presented, local / rate + offset);
          const properties = own[index];
          if (properties == null) {
            return;
          }
          presentedOwn = Math.max(presentedOwn, local / rate + offset);
          if (TRANSFORM.some(p => properties.has(p))) {
            presentedTransform = Math.max(
              presentedTransform,
              local / rate + offset,
            );
          }
          if (properties.has('opacity')) {
            presentedOpacity = Math.max(
              presentedOpacity,
              local / rate + offset,
            );
          }
        });
        const or = (value: number, fallback: number) =>
          Number.isFinite(value) ? value : fallback;
        const presentedAt = or(presentedOwn, or(presented, t));
        const style =
          pseudo == null
            ? getComputedStyle(element)
            : getComputedStyle(element, pseudo);
        // translate · rotate · scale · transform, as CSS applies them (all
        // about the same transform origin, which `transform` excludes too).
        // A percentage resolves against the border box, unrounded
        // (`offsetWidth` rounds it); anything else it cannot resolve (a
        // `calc()`) is an error, not a guess.
        const px = (value: string) => parseFloat(value) || 0;
        const borderBox =
          style.boxSizing === 'border-box'
            ? {width: px(style.width), height: px(style.height)}
            : {
                width:
                  px(style.width) +
                  px(style.paddingLeft) +
                  px(style.paddingRight) +
                  px(style.borderLeftWidth) +
                  px(style.borderRightWidth),
                height:
                  px(style.height) +
                  px(style.paddingTop) +
                  px(style.paddingBottom) +
                  px(style.borderTopWidth) +
                  px(style.borderBottomWidth),
              };
        const length = (value: string, size: number) => {
          const match = /^(-?[\d.]+(?:e-?\d+)?)(px|%)$/.exec(value);
          if (match == null) {
            throw new Error(
              `sampleCurve: cannot resolve translate ${JSON.stringify(style.translate)}`,
            );
          }
          const amount = Number(match[1]);
          return match[2] === '%' ? (amount / 100) * size : amount;
        };
        const matrix = new DOMMatrix();
        if (style.translate !== 'none') {
          // "x", "x y" or "x y z"; a calc() holds spaces, so split at the
          // top level only.
          const parts = style.translate.match(/(?:calc\([^)]*\)|\S)+/g) ?? [];
          const [x = '0px', y = '0px'] = parts;
          matrix.translateSelf(
            length(x, borderBox.width),
            length(y, borderBox.height),
          );
        }
        if (style.rotate !== 'none') {
          // "45deg", "x 45deg" (or y, z) or "1 0 0 45deg": the angle is the
          // last token, the axis what comes before it (z when none).
          const tokens = style.rotate.split(' ');
          const angle = tokens.at(-1) ?? '0deg';
          const turns: Record<string, number> = {
            deg: 1,
            rad: 180 / Math.PI,
            grad: 0.9,
            turn: 360,
          };
          const unit = /[a-z]+$/.exec(angle)?.[0] ?? 'deg';
          const named: Record<string, [number, number, number]> = {
            x: [1, 0, 0],
            y: [0, 1, 0],
            z: [0, 0, 1],
          };
          const axis: [number, number, number] =
            tokens.length === 1
              ? [0, 0, 1]
              : tokens.length === 2 && named[tokens[0]] != null
                ? named[tokens[0]]
                : tokens.length === 4
                  ? [Number(tokens[0]), Number(tokens[1]), Number(tokens[2])]
                  : [Number.NaN, Number.NaN, Number.NaN];
          if (!axis.every(Number.isFinite)) {
            throw new Error(
              `sampleCurve: cannot resolve rotate ${JSON.stringify(style.rotate)}`,
            );
          }
          matrix.rotateAxisAngleSelf(
            ...axis,
            parseFloat(angle) * (turns[unit] ?? 1),
          );
        }
        if (style.scale !== 'none') {
          const [sx = 1, sy = sx] = style.scale.split(' ').map(Number);
          matrix.scaleSelf(sx, sy);
        }
        if (style.transform !== 'none') {
          matrix.multiplySelf(new DOMMatrix(style.transform));
        }
        const {a, b, c, d, e, f} = matrix;
        return {
          t,
          presentedAt,
          presentedAtFor: {
            transform: or(presentedTransform, presentedAt),
            opacity: or(presentedOpacity, presentedAt),
          },
          matrix: `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`,
          transform: style.transform,
          translate: style.translate,
          rotate: style.rotate,
          scale: style.scale,
          opacity: style.opacity,
        };
      });
    },
    {ts: [...times], inset: END_INSET_MS, pseudo: pseudoElement ?? null},
  );
  return raw.map(r => ({
    t: r.t,
    presentedAt: r.presentedAt,
    presentedAtFor: r.presentedAtFor,
    transform: parseTransform(r.matrix),
    opacity: Number(r.opacity),
    raw: {
      transform: r.transform,
      translate: r.translate,
      rotate: r.rotate,
      scale: r.scale,
      opacity: r.opacity,
    },
  }));
}

export type Channel =
  'translateX' | 'translateY' | 'scaleX' | 'scaleY' | 'rotate' | 'opacity';

/** One channel of a sampled curve, ready for `compareCurve`. */
export function curveOf(
  samples: readonly CurveSample[],
  channel: Channel,
): TimedValue[] {
  return samples.map(s => ({
    t:
      channel === 'opacity'
        ? s.presentedAtFor.opacity
        : s.presentedAtFor.transform,
    value: channel === 'opacity' ? s.opacity : s.transform[channel],
  }));
}

export interface ActiveAnimation {
  readonly kind: string;
  readonly name: string | null;
  /**
   * Epoch ms (page clock) when the animation's curve starts and ends. A held
   * end value (see `HeldAnimation.curveEndMs`, which says when one is read)
   * is not part of the curve. A finished run is dated from its start as the
   * engine had it when it finished.
   */
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly easing: string;
  readonly keyframes: readonly Record<string, unknown>[];
  /**
   * Epoch ms (page clock) when it finished, if it had already finished when
   * it was reported (where its start put its end, by the engine's clock, not
   * when the finish event arrived); null while it runs. A run that the page
   * cancelled while it played reports when the page cancelled it, which can
   * be before `to`.
   */
  readonly finishedAt: number | null;
}

/**
 * Runs `fn` on `locator`'s element: through the locator, or, `quietly`,
 * through a handle to the element it matches now (none yet: `[]`). Each
 * locator.evaluate makes a main-thread frame, which a trace counts;
 * `elementHandles()` and a handle's evaluate make none.
 */
async function readElement<A, R>(
  locator: Locator,
  quietly: boolean,
  fn: (element: Element, arg: A) => R[],
  arg: A,
  timeout: number,
): Promise<R[]> {
  const run = fn as unknown as (element: Element, arg: unknown) => R[];
  if (!quietly) {
    return locator.evaluate(run, arg as unknown, {timeout});
  }
  const handles = await locator.elementHandles();
  try {
    if (handles.length > 1) {
      throw new Error(
        `waitForAnimation: ${String(locator)} matches ${handles.length} elements`,
      );
    }
    return handles.length === 0
      ? []
      : await handles[0].evaluate(run, arg as unknown);
  } finally {
    await Promise.all(handles.map(handle => handle.dispose()));
  }
}

/** The rejection for a wait whose element is not in the document. */
function notInDocument(name: string, cause?: unknown): Error {
  return new Error(
    `${name}: the element is not in the document. An exit that removes ` +
      'its element is read through its container (watch the parent).',
    cause === undefined ? undefined : {cause},
  );
}

/**
 * Runs a locator read within the wait's own deadline. A locator waits for
 * its element with no timeout of its own, so one the page removed (an exit
 * at its end) or never mounted would hold the wait to the test's timeout;
 * this turns that into the wait's own rejection. A read that runs out of time
 * on an element still present returns null: the caller's own deadline
 * message applies.
 */
async function withinTimeout<T>(
  name: string,
  locator: Locator,
  deadline: number,
  read: (timeout: number) => Promise<T>,
): Promise<T | null> {
  try {
    return await read(Math.max(1, deadline - Date.now()));
  } catch (error) {
    if ((error as Error | null)?.name === 'TimeoutError') {
      if ((await locator.count()) > 0) {
        return null;
      }
      throw notInDocument(name, error);
    }
    throw error;
  }
}

/**
 * Waits until an animation is running on `locator`'s element (or inside it)
 * and has presented `minProgressMs` of its curve (after any delay), and
 * returns its active
 * interval on the page clock. Use it before blocking the main thread: an
 * animation that has not started yet cannot start while the thread is blocked.
 *
 * It does not race a short animation: the page records every animation from
 * its first frame (from the first call into this module on the page: this,
 * `waitForRest`, `watchAnimations`, sampling or holding), so one that started
 * after the last `waitForRest`, `waitForAnimation` or `watchAnimations` and has already
 * finished is reported too, with `finishedAt` set. So is one that the page
 * cancelled while it played, once it presented `minProgressMs`. Core's motion
 * animator retires each run so, at the end of its curve. For an action that
 * may be the page's first contact with this module, take
 * `watchAnimations(locator)` before the action instead.
 *
 * In WebKit a CSS animation shorter than a gap between two of the page's
 * frames can start and finish inside it: its start event comes at the next
 * frame, when nothing is left to record, and the wait's error names it (a
 * starved page's frames can come a second apart).
 *
 * A run going backward is read when it was reversed before it started. The
 * recorder keeps one entry per `Animation` object, so an animation reversed
 * or replayed mid-run is misread: a watch taken before the reversal rejects,
 * and an unwatched wait returns at once with a curve dated before it.
 *
 * Started inside a `traceRendering` body, it stands down as the recorder
 * does, so it adds no frame the trace counts: it takes the element's
 * animations from the recorder's log, judges a started one by its own times,
 * and reaches the element through a handle to what the locator matches at
 * each look. That holds for script animations and CSS transitions. On a CSS
 * `@keyframes` animation (and, unwatched, a cancelled CSS transition) it reads
 * the animation's timing, which flushes its style and adds Layouts to the
 * trace: wait on one with `waitForRest`, or after the trace.
 */
export async function waitForAnimation(
  locator: Locator,
  {
    timeout = 5_000,
    minProgressMs = 1,
    since,
  }: {
    timeout?: number;
    minProgressMs?: number;
    /** Page-clock ms (performance.now): only animations first seen after it. */
    since?: number;
  } = {},
): Promise<ActiveAnimation[]> {
  const deadline = Date.now() + timeout;
  const page = locator.page();
  await installCurveEnd(page);
  // Inside a rendering trace the wait stands down (see the page function),
  // and it reads the element through handles: each locator.evaluate makes a
  // main-thread frame (a Layout of an anchored element), where a handle's
  // evaluate adds none.
  const traced = await page.evaluate(
    () =>
      (window as unknown as {__harnessRenderingTrace?: boolean})
        .__harnessRenderingTrace === true,
  );
  for (;;) {
    const read = await withinTimeout(
      'waitForAnimation',
      locator,
      deadline,
      evaluateTimeout =>
        readElement(
          locator,
          traced,
          (element, {minProgress, since: watchedFrom}) => {
            // The harness's own read: a trace sets it apart (trace.ts HARNESS_READ).
            console.timeStamp('harness-read');
            const w = window as unknown as {
              __harnessCurveEnd: (a: Animation) => number;
              __harnessTiming: (
                effect: AnimationEffect | null | undefined,
              ) => ComputedEffectTiming | null;
              __harnessAnimations: {
                log: {
                  animation: Animation;
                  seenAt: number;
                  finishedAt: number | null;
                  startedAt: number | null;
                  finishStart: number | null;
                  cancelledAt: number | null;
                  playedMs: number | null;
                  ancestors: Element[];
                }[];
                record: () => void;
                armedAt: () => number;
              };
            };
            const curveEnd = w.__harnessCurveEnd;
            const recorder = w.__harnessAnimations;
            // Inside a rendering trace the wait stands down as the recorder does:
            // record() reads nothing, the animations come from the recorder's log
            // rather than getAnimations(), and a started one runs by its own
            // times, since playState flushes a CSS animation's style.
            const traced =
              (window as unknown as {__harnessRenderingTrace?: boolean})
                .__harnessRenderingTrace === true;
            recorder.record();
            // The recorder keeps real times. A live start time is a page time.
            // It trails real time by the span a page freeze stood still, so it
            // takes that span as it stands now. The stamps then share the trace's
            // clock.
            const span =
              (window as unknown as {__harnessFreeze?: {offset: number}})
                .__harnessFreeze?.offset ?? 0;
            const describe = (
              a: Animation,
              finishedAt: number | null,
              recordedStart: number | null,
              finishStart: number | null = null,
            ) => {
              const effect = a.effect as KeyframeEffect | null;
              const timing = w.__harnessTiming(effect);
              // A finished run is dated from its start as its finish recorded
              // it: a later startTime read can say otherwise. The recorded
              // start stands in once the page has cancelled it. A run going
              // backward began at its end: its startTime is where its current
              // time would reach 0, a whole run later.
              const rate = a.playbackRate;
              const speed = Math.abs(rate || 1);
              const endTime = Number(timing?.endTime ?? 0);
              const delay = Number(timing?.delay ?? 0);
              const start =
                finishStart != null
                  ? finishStart
                  : a.startTime == null
                    ? recordedStart
                    : span +
                      (rate < 0
                        ? Number(a.startTime) - endTime / speed
                        : Number(a.startTime));
              const startedAt =
                performance.timeOrigin + Number(start ?? Number.NaN);
              const name =
                'transitionProperty' in a
                  ? (a as unknown as {transitionProperty: string})
                      .transitionProperty
                  : 'animationName' in a
                    ? (a as unknown as {animationName: string}).animationName
                    : null;
              return {
                kind: a.constructor.name,
                name,
                // Through the playback rate's speed: at rate 2 a curve runs in half
                // its duration. Backward, the end delay plays first and the start
                // delay last.
                from:
                  rate < 0
                    ? startedAt + Number(timing?.endDelay ?? 0) / speed
                    : startedAt + delay / speed,
                to:
                  rate < 0
                    ? startedAt + (endTime - delay) / speed
                    : startedAt + curveEnd(a) / speed,
                durationMs: Number(timing?.duration ?? 0),
                easing: String(effect?.getTiming().easing ?? 'linear'),
                keyframes: (effect?.getKeyframes() ?? []).map(
                  (k): Record<string, unknown> => ({...k}),
                ),
                finishedAt:
                  finishedAt == null
                    ? null
                    : performance.timeOrigin + finishedAt,
              };
            };
            const inside = (a: Animation) => {
              const target =
                (a.effect as KeyframeEffect | null)?.target ?? null;
              return (
                target != null &&
                (target === element || element.contains(target))
              );
            };
            // The busy-window control (busy.ts) animates on its own, inside a
            // dialog with `within`: it never answers for the component.
            const isControl = (a: Animation) => {
              const target =
                (a.effect as KeyframeEffect | null)?.target ?? null;
              return (
                target instanceof Element &&
                target.closest('[data-harness-control]') != null
              );
            };
            const after = watchedFrom ?? recorder.armedAt();
            // Document-timeline animations only, as for holdAnimations: a scroll-
            // or view-timeline one that reached its end is not a finished curve.
            const recorded = recorder.log.filter(
              e =>
                e.seenAt >= after &&
                !isControl(e.animation) &&
                (inside(e.animation) || e.ancestors.includes(element)) &&
                e.animation.timeline instanceof DocumentTimeline,
            );
            // Running: since the watch, or (without one) any on the element. A
            // pending one (no start time yet) counts too: the action's animation
            // may still be pending at the first look, and an earlier one that
            // finished must not answer for it. Only document-timeline animations
            // count, as for holdAnimations: a scroll- or view-timeline one moves
            // only when something scrolls and never progresses on its own.
            const runs = (a: Animation) => {
              if (!(a.timeline instanceof DocumentTimeline)) {
                return false;
              }
              if (!traced || a.startTime == null) {
                return a.playState === 'running';
              }
              const time = Number(a.currentTime ?? 0);
              return a.playbackRate < 0
                ? time > 0
                : time < Number(w.__harnessTiming(a.effect)?.endTime ?? 0);
            };
            const onElement = () =>
              recorder.log.filter(
                e => inside(e.animation) || e.ancestors.includes(element),
              );
            const live = (
              watchedFrom == null && !traced
                ? element.getAnimations({subtree: true})
                : (watchedFrom == null ? onElement() : recorded)
                    .filter(e => e.finishedAt == null)
                    .map(e => e.animation)
            ).filter(a => !isControl(a) && runs(a));
            const running = live.filter(a => a.startTime != null);
            // Progress along the curve, on the timeline: a delay presents nothing
            // (going backward, the end delay plays first), a run going backward
            // (`reverse()`) progresses from its end, and a faster rate presents
            // more curve per ms.
            const progressed = running.filter(a => {
              const timing = w.__harnessTiming(a.effect);
              const time = Number(a.currentTime ?? 0);
              const local =
                a.playbackRate < 0
                  ? Number(timing?.endTime ?? 0) -
                    Number(timing?.endDelay ?? 0) -
                    time
                  : time - Number(timing?.delay ?? 0);
              return local / Math.abs(a.playbackRate || 1) >= minProgress;
            });
            if (progressed.length > 0) {
              return progressed.map(a => describe(a, null, null));
            }
            if (live.length > 0) {
              return [];
            }
            // Finished: as its finish event recorded it (where its start then put
            // its end), or by its state when the event has not been delivered yet
            // (then at its scheduled end, through the rate's speed; a run going
            // backward ends at its startTime, where its current time reaches 0).
            const finishedAt = (e: (typeof recorded)[number]) => {
              if (e.finishedAt != null) {
                return e.finishedAt;
              }
              // The page cancelled it while it played: it ended there, once
              // it presented `minProgress` of its curve.
              if (e.cancelledAt != null) {
                return (e.playedMs ?? 0) >= minProgress ? e.cancelledAt : null;
              }
              const a = e.animation;
              if (a.startTime == null) {
                return null;
              }
              const end = Number(w.__harnessTiming(a.effect)?.endTime ?? 0);
              // Traced, by its own times; otherwise by its state.
              const time = Number(a.currentTime ?? 0);
              const done = traced
                ? a.playbackRate < 0
                  ? time <= 0
                  : time >= end
                : a.playState === 'finished';
              if (!done) {
                return null;
              }
              return (
                span +
                (a.playbackRate < 0
                  ? Number(a.startTime)
                  : Number(a.startTime) + end / Math.abs(a.playbackRate || 1))
              );
            };
            return recorded
              .filter(e => finishedAt(e) != null)
              .map(e =>
                describe(
                  e.animation,
                  finishedAt(e),
                  e.startedAt,
                  e.finishStart,
                ),
              );
          },
          {minProgress: minProgressMs, since: since ?? null},
          evaluateTimeout,
        ),
    );
    const found = read ?? [];
    if (found.length > 0) {
      await armRecorder(locator.page());
      return found;
    }
    if (Date.now() > deadline) {
      // A traced read goes through handles, which find no element rather
      // than wait for one: a missing element is reported as missing, as the
      // untraced read reports it.
      if (traced && (await locator.count()) === 0) {
        throw notInDocument('waitForAnimation');
      }
      // Start events on the element that found nothing to read: animations
      // that started and finished between two of the page's frames.
      const missed = await locator
        .evaluate(
          (element, watchedFrom) => {
            const recorder = (
              window as unknown as {
                __harnessAnimations: {
                  unread: {
                    at: number;
                    ancestors: Element[];
                    name: string;
                  }[];
                  armedAt: () => number;
                };
              }
            ).__harnessAnimations;
            const after = watchedFrom ?? recorder.armedAt();
            // Matched through the ancestors kept at the event, as the log is:
            // an exit the page removed is still named for its container. A
            // missed transition sends two start events; it is named once.
            return [
              ...new Set(
                recorder.unread
                  .filter(u => u.at >= after && u.ancestors.includes(element))
                  .map(u => u.name),
              ),
            ];
          },
          since ?? null,
          {timeout: 1_000},
        )
        .catch(() => [] as string[]);
      throw new Error(
        missed.length > 0
          ? `waitForAnimation: the element's ${missed.join(', ')} started and finished between two of the page's frames: its start event came after it had finished, with nothing left to read (WebKit sends it at the next frame; README: engine limits). Make the animation last longer than the page's frame gaps under load.`
          : 'waitForAnimation: no animation started on the element, none running ' +
              'and none recorded since the last wait. If the action is the ' +
              "page's first contact with the harness, take " +
              'watchAnimations(locator) before it.',
      );
    }
    await new Promise(resolve => setTimeout(resolve, 4));
  }
}

/**
 * Empties the page's animation log, so a count taken next (heap size, event
 * listeners, DOM nodes) reads the page's own objects and not the animations,
 * elements and ancestors the recorder kept. Waits after it record afresh; a
 * page the recorder never ran on is left alone.
 */
export async function releaseAnimationLog(page: Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as {__harnessAnimations?: {release: () => void}}
    ).__harnessAnimations?.release(),
  );
}

/**
 * Marks now as the point later waits count animations from. With a locator,
 * its element's pending style change is resolved first, also inside a trace
 * (reached through a handle, which adds no main-thread frame).
 */
async function armRecorder(page: Page, locator?: Locator): Promise<number> {
  const handles = locator == null ? [] : await locator.elementHandles();
  try {
    if (handles.length === 1) {
      return await handles[0].evaluate(element =>
        (
          window as unknown as {
            __harnessAnimations: {arm: (element?: Element) => number};
          }
        ).__harnessAnimations.arm(element as Element),
      );
    }
    return await page.evaluate(() =>
      (
        window as unknown as {__harnessAnimations: {arm: () => number}}
      ).__harnessAnimations.arm(),
    );
  } finally {
    await Promise.all(handles.map(handle => handle.dispose()));
  }
}

export interface AnimationWatch {
  /**
   * Resolves with the animations on the element that started after the watch
   * was taken: running ones once they have presented `minProgressMs`, or,
   * when none runs, those that already finished.
   */
  started(options?: {
    timeout?: number;
    minProgressMs?: number;
  }): Promise<ActiveAnimation[]>;
}

/**
 * Starts watching `locator`'s element before an action, so the animation the
 * action starts is caught even when it ends before the test looks (a short
 * entrance on a cold page). Taking the watch reads the element's animations,
 * which restyles it, inside a rendering trace too: take a traced watch before
 * the window the proof counts:
 *
 *   const watch = await watchAnimations(sheet);
 *   await driver.play(tap(button));
 *   const [entrance] = await watch.started();
 */
export async function watchAnimations(
  locator: Locator,
): Promise<AnimationWatch> {
  await installCurveEnd(locator.page());
  const since = await armRecorder(locator.page(), locator);
  return {
    started: options => waitForAnimation(locator, {...options, since}),
  };
}

/**
 * Resolves once `locator`'s element is at rest: no animation on it (or inside
 * it) is pending or still before the end of its curve, and its presented
 * `transform`, `translate`, `rotate`, `scale` and `opacity` (and `::backdrop`
 * opacity) have held still for `frames` consecutive frames.
 *
 * It judges curves and presented values, not `playState`: an animation that
 * holds its end value (a run of identical final keyframes kept so a later
 * interruption can read it) still reports `running` while nothing moves.
 * A hold is read as such only where `HeldAnimation.curveEndMs` reads it (a
 * forward run under a linear or cubic-bézier effect easing); under any other
 * easing or direction, waitForRest waits the hold out, and a hold longer than
 * `timeout` rejects with "still moving".
 *
 * It throws `FrameStarvationError` instead when the page drew too few frames
 * to tell. Then, since the element last moved, no frame came for longer than
 * `FRAME_STARVATION_MS`. It held still in its last frame, or no frame came
 * after the deadline. So the still frames must come by `timeout` plus
 * `FRAME_STARVATION_MS`.
 *
 * While a rendering trace runs (`traceRendering`), it stands down as the
 * animation recorder does: a per-frame callback would make every frame a
 * main-thread frame, which the trace counts. It then waits on timers for the
 * scheduled ends of the curves on the element instead (a run going backward,
 * until it finishes), so motion that no animation drives (a script writing
 * styles) is not seen until the trace ends. Its one read of the element's
 * animations, as it is called, restyles the element (and lays out an anchored
 * one) when an animation is already running there: await it right after the
 * action that starts the motion, before the window a proof counts, not in its
 * middle (README: No Layout / Paint). Finding no animation, it looks again `frames` times a frame
 * apart before settling, so one the action starts a few frames later is
 * waited for.
 */
export async function waitForRest(
  locator: Locator,
  {timeout = 5_000, frames = 3}: {timeout?: number; frames?: number} = {},
): Promise<void> {
  await installCurveEnd(locator.page());
  // The page-side wait rejects at its own deadline; the read gets a second
  // more, so only an element that is gone runs it out.
  const rested = await withinTimeout(
    'waitForRest',
    locator,
    Date.now() + timeout + 1_000,
    async evaluateTimeout => {
      const starved = await locator.evaluate(
        (element, {ms, need, starvationMs}) =>
          new Promise<{
            frames: number;
            spanMs: number;
            longestGapMs: number;
          } | null>((resolve, reject) => {
            // The deadline reads the real clock, which a page freeze does not
            // stop.
            const realNow =
              (
                window as unknown as {
                  __harnessTimerGate?: {now?: () => number};
                }
              ).__harnessTimerGate?.now ?? (() => performance.now());
            const deadline = realNow() + ms;
            const curveEnd = (
              window as unknown as {__harnessCurveEnd: (a: Animation) => number}
            ).__harnessCurveEnd;
            const read = () => {
              const style = getComputedStyle(element);
              const backdrop = getComputedStyle(element, '::backdrop').opacity;
              return [
                style.transform,
                style.translate,
                style.rotate,
                style.scale,
                style.opacity,
                backdrop,
              ].join(' | ');
            };
            // The page's real frames and timers, even while a timer gate holds
            // its callbacks: a frozen gate never holds the wait itself.
            const gate = (
              window as unknown as {
                __harnessTimerGate?: {
                  frame: typeof requestAnimationFrame;
                  timeout?: typeof setTimeout;
                  clearTimeout?: typeof clearTimeout;
                };
              }
            ).__harnessTimerGate;
            const frame = gate?.frame ?? requestAnimationFrame;
            const timeout = gate?.timeout ?? setTimeout;
            const clearTimer = gate?.clearTimeout ?? clearTimeout;
            // Set by traceRendering while it traces (see the recorder above).
            const tracing = () =>
              (window as unknown as {__harnessRenderingTrace?: boolean})
                .__harnessRenderingTrace === true;
            // The deadline timer below holds this wait's scope, the element
            // too, until it fires: every ending clears it.
            const end = () => clearTimer(deadlineTimer);
            const settle = () => {
              end();
              // Later waits count animations from here.
              (
                window as unknown as {__harnessAnimations?: {arm: () => number}}
              ).__harnessAnimations?.arm();
              resolve(null);
            };
            let last = '';
            let still = 0;
            // When each frame of the per-frame check came since the element
            // last moved, on the real clock: only those can show it at rest.
            let watchedFrom = realNow();
            const drawn: number[] = [];
            const shortfall = () => {
              const times = [watchedFrom, ...drawn, realNow()];
              let longestGapMs = 0;
              for (let i = 1; i < times.length; i += 1) {
                longestGapMs = Math.max(longestGapMs, times[i] - times[i - 1]);
              }
              return {
                frames: drawn.length,
                spanMs: realNow() - watchedFrom,
                longestGapMs,
              };
            };
            const frames = () => {
              last = read();
              still = 0;
              watchedFrom = realNow();
              drawn.length = 0;
              frame(tick);
            };
            // A frame that never comes cannot reach the deadline check in
            // `tick`: a starved page is caught here.
            let starvedOut = false;
            const deadlineTimer = timeout(
              () => {
                const lastFrame = drawn[drawn.length - 1] ?? watchedFrom;
                if (!tracing() && realNow() - lastFrame > starvationMs) {
                  starvedOut = true;
                  resolve(shortfall());
                }
              },
              ms + starvationMs + 1,
            );
            // While traced: one look at the animations, then a timer to the latest
            // scheduled curve end. One not started yet is looked at again a frame
            // later; a trace that has ended hands over to the per-frame check.
            // Finding nothing settles only after `frames` looks a frame apart, as
            // the per-frame check needs `frames` still frames: an animation the
            // action starts a frame or two later is still waited for.
            let idle = 0;
            const scheduled = () => {
              let wait = 0;
              for (const a of element.getAnimations({subtree: true})) {
                // A scroll- or view-timeline animation moves only when something
                // scrolls: it has no scheduled end to wait for (holdAnimations
                // skips it the same way).
                if (!(a.timeline instanceof DocumentTimeline)) {
                  continue;
                }
                if (
                  a.pending ||
                  (a.playState === 'running' && a.startTime == null)
                ) {
                  wait = Math.max(wait, 16);
                } else if (a.playState === 'running') {
                  // The curve's time left through the playback rate: forward, to
                  // its (held) end; backward (`reverse()`), to local time 0,
                  // where it finishes, as the untraced path waits it out.
                  const rate = a.playbackRate || 1;
                  const at = Number(a.currentTime ?? 0);
                  const left =
                    rate > 0 ? (curveEnd(a) - at) / rate : at / -rate;
                  wait = Math.max(wait, left);
                }
              }
              if (wait <= 0) {
                idle += 1;
                if (idle >= need) {
                  settle();
                  return;
                }
                wait = 16;
              } else {
                idle = 0;
              }
              const room = deadline - realNow();
              timeout(
                () => {
                  if (realNow() > deadline) {
                    end();
                    reject(
                      new Error('waitForRest: still moving at the deadline'),
                    );
                  } else if (tracing()) {
                    scheduled();
                  } else {
                    frames();
                  }
                },
                Math.min(wait, Math.max(0, room)) + 1,
              );
            };
            const tick = () => {
              if (starvedOut) {
                return;
              }
              const now = read();
              const moving = element.getAnimations({subtree: true}).some(
                a =>
                  a.pending ||
                  (a.playState === 'running' &&
                    // Going backward the curve ends at the start delay, after
                    // the end delay (which plays first) and the curve itself.
                    (a.playbackRate < 0
                      ? Number(a.currentTime ?? 0) >
                        Number(a.effect?.getComputedTiming().delay ?? 0)
                      : Number(a.currentTime ?? 0) < curveEnd(a))),
              );
              const resting = !moving && now === last;
              if (resting) {
                drawn.push(realNow());
              } else {
                watchedFrom = realNow();
                drawn.length = 0;
              }
              still = resting ? still + 1 : 0;
              last = now;
              if (still >= need) {
                settle();
              } else if (realNow() > deadline) {
                const short = shortfall();
                end();
                if (resting && short.longestGapMs > starvationMs) {
                  resolve(short);
                } else {
                  reject(new Error(`waitForRest: still moving (${now})`));
                }
              } else if (tracing()) {
                scheduled();
              } else {
                frame(tick);
              }
            };
            if (tracing()) {
              scheduled();
            } else {
              frames();
            }
          }),
        {ms: timeout, need: frames, starvationMs: FRAME_STARVATION_MS},
        {timeout: evaluateTimeout},
      );
      if (starved != null) {
        throw new FrameStarvationError({
          by: 'waitForRest',
          frames: starved.frames,
          during: `it waited ${Math.round(starved.spanMs)} ms for the element to rest`,
          min: frames,
          longestGapMs: starved.longestGapMs,
        });
      }
      return true;
    },
  );
  if (rested == null) {
    throw new Error('waitForRest: still moving at the deadline');
  }
}
