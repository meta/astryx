// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file freeze.ts
 * @input A Playwright `Page`, before the page under test loads
 * @output `installPageFreeze`, `freezePage`, `thawPage`, `freezePageOn`,
 *   `freezePageWhen` and `advanceFrozenPage`. Stop a scene (its animations,
 *   frames, timeouts and every time it reads), step it by its own clock, and
 *   start it again. An interval skips its ticks while frozen.
 * @position Input timed by the scene, not by the test process: a proof freezes
 *   the scene where it wants to act, acts, and thaws. The README's "Page
 *   freeze" section says what a freeze holds and why it lives in script.
 */

import type {Page} from '@playwright/test';

const FREEZE_SCRIPT = `(() => {
  if (window.__harnessFreeze) return;
  if (window.__harnessTimerGate) {
    throw new Error('installPageFreeze: install it before installTimerGate (and before the page loads)');
  }
  const perf = window.performance;
  const nativeNow = Performance.prototype.now;
  const rawNow = () => nativeNow.call(perf);
  const nativeDateNow = Date.now;
  const state = {offset: 0, frozenAt: null, dateFrozenAt: 0, timelineFrozenAt: null, held: new Set(), deferred: new Map(), watching: false, atFreeze: new WeakMap()};
  // Real time minus every frozen span so far; the freeze instant while frozen.
  const now = real => (state.frozenAt != null && real >= state.frozenAt ? state.frozenAt : real) - state.offset;
  Performance.prototype.now = function () { return now(nativeNow.call(this)); };
  Date.now = () => (state.frozenAt != null ? state.dateFrozenAt : nativeDateNow()) - state.offset;
  const define = (proto, name, make) => {
    const own = Object.getOwnPropertyDescriptor(proto, name);
    if (own) Object.defineProperty(proto, name, Object.assign({}, own, make(own)));
  };
  define(Event.prototype, 'timeStamp', d => ({get() { return now(d.get.call(this)); }}));
  // Only the document's timeline is re-timed. A scroll or view timeline
  // reads its scroller, not time, so it keeps its own getter.
  const timelineDescriptor = Object.getOwnPropertyDescriptor(DocumentTimeline.prototype, 'currentTime') || Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, 'currentTime');
  const timelineTime = timelineDescriptor.get;
  // The timeline's time is its last frame's: frozen, it stays what it was.
  // Never back: after a thaw the timeline's last frame can sit a little
  // before the frozen frame on the shifted clock.
  let last = -Infinity;
  Object.defineProperty(DocumentTimeline.prototype, 'currentTime', {
    configurable: true,
    enumerable: timelineDescriptor.enumerable,
    get() {
      if (state.frozenAt != null) {
        last = Math.max(last, state.frozenAt - state.offset);
        return last;
      }
      const real = timelineTime.call(this);
      if (real == null) return real;
      last = Math.max(last, Number(real) - state.offset);
      return last;
    },
  });
  // A freeze holds the document timeline's animations only: one on a scroll
  // or view timeline follows its scroller, frozen or not.
  const isTimed = animation => animation.timeline === document.timeline;
  const startTime = Object.getOwnPropertyDescriptor(Animation.prototype, 'startTime');
  const currentTime = Object.getOwnPropertyDescriptor(Animation.prototype, 'currentTime');
  const playState = Object.getOwnPropertyDescriptor(Animation.prototype, 'playState');
  const nativePause = Animation.prototype.pause;
  const nativePlay = Animation.prototype.play;
  const nativeCancel = Animation.prototype.cancel;
  const nativeFinish = Animation.prototype.finish;
  // Paused exactly where it stands: a pause alone completes on the next frame
  // (Chromium advances one more frame first. WebKit lost a time set by script).
  const hold = animation => {
    if (!isTimed(animation) || state.held.has(animation)) return;
    const at = currentTime.get.call(animation);
    nativePause.call(animation);
    if (at != null) currentTime.set.call(animation, at);
    state.held.add(animation);
  };
  const release = animation => { state.held.delete(animation); state.deferred.delete(animation); };
  Object.defineProperty(Animation.prototype, 'startTime', Object.assign({}, startTime, {
    get() {
      if (!isTimed(this)) return startTime.get.call(this);
      if (state.deferred.has(this)) return state.deferred.get(this);
      if (state.held.has(this)) {
        // Held, it reads as running: the start it had, on the page's clock.
        const at = currentTime.get.call(this);
        return at == null || this.playbackRate === 0 ? null : state.frozenAt - state.offset - Number(at) / this.playbackRate;
      }
      const real = startTime.get.call(this);
      return real == null ? real : Number(real) - state.offset;
    },
    set(value) {
      if (!isTimed(this)) { startTime.set.call(this, value); return; }
      if (value == null) { state.deferred.delete(this); startTime.set.call(this, value); return; }
      if (state.frozenAt != null) {
        // Held where it would stand at the frozen instant; the thaw starts it.
        hold(this);
        state.deferred.set(this, Number(value));
        currentTime.set.call(this, (state.frozenAt - state.offset - Number(value)) * this.playbackRate);
        return;
      }
      startTime.set.call(this, Number(value) + state.offset);
    },
  }));
  Object.defineProperty(Animation.prototype, 'playState', Object.assign({}, playState, {
    get() { return state.held.has(this) ? 'running' : playState.get.call(this); },
  }));
  Animation.prototype.play = function () {
    if (state.frozenAt != null && isTimed(this)) { hold(this); return; }
    return nativePlay.call(this);
  };
  Animation.prototype.pause = function () { release(this); return nativePause.call(this); };
  Animation.prototype.cancel = function () { release(this); return nativeCancel.call(this); };
  Animation.prototype.finish = function () { release(this); return nativeFinish.call(this); };
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...args) {
    const animation = nativeAnimate.apply(this, args);
    if (state.frozenAt != null) hold(animation);
    return animation;
  };
  // Frame callbacks get the page's time; the timer gate, installed after
  // this, holds them while frozen.
  const nativeFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => nativeFrame(time => callback(now(time)));
  // A CSS animation or transition the page starts while frozen: held at its
  // start on the next frame. One that existed at the freeze and that the page
  // resumes is held where it stood at the freeze.
  const watch = () => {
    if (state.frozenAt == null) { state.watching = false; return; }
    for (const animation of document.getAnimations()) {
      if (isTimed(animation) && !state.held.has(animation) && playState.get.call(animation) === 'running') {
        nativePause.call(animation);
        currentTime.set.call(animation, state.atFreeze.get(animation) ?? 0);
        state.held.add(animation);
      }
    }
    nativeFrame(watch);
  };
  // One capture listener on the window for each input a freeze can be armed on,
  // added before any page script runs. An armed freeze then lands before every
  // page listener for that input, in the input's own task.
  const ARMABLE = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'click', 'keydown', 'keyup', 'wheel', 'scroll'];
  const armed = new Set();
  for (const type of ARMABLE) {
    window.addEventListener(type, () => {
      if (!armed.delete(type)) return;
      window.__harnessFreeze.freeze();
      if (window.__harnessTimerGate) window.__harnessTimerGate.freeze(true);
    }, {capture: true, passive: true});
  }
  window.__harnessFreeze = {
    // The real frames, for the harness's own waits while frozen.
    frame: nativeFrame,
    // The real clock, for the harness's own deadlines while frozen.
    realNow: rawNow,
    // Arms a one-shot freeze on the next event of this type.
    arm(type) {
      if (!ARMABLE.includes(type)) {
        throw new Error('freezePageOn: a freeze arms only on ' + ARMABLE.join(', ') + '; got ' + type);
      }
      armed.add(type);
    },
    get frozen() { return state.frozenAt != null; },
    // The frozen span so far. Once thawed, a page time plus it is real time.
    get offset() { return state.offset; },
    freeze() {
      if (state.frozenAt != null) return;
      state.frozenAt = rawNow();
      state.dateFrozenAt = nativeDateNow();
      const timeline = timelineTime.call(document.timeline);
      state.timelineFrozenAt = timeline == null ? null : Number(timeline);
      // Each running animation is held at the freeze instant, not at the last
      // frame's time. The page's clock and its animations then agree exactly
      // (the screen moves on by less than a frame as the freeze lands).
      const ahead = state.timelineFrozenAt == null ? 0 : state.frozenAt - state.timelineFrozenAt;
      state.atFreeze = new WeakMap(document.getAnimations().map(animation => [animation, currentTime.get.call(animation)]));
      for (const animation of document.getAnimations()) {
        if (!isTimed(animation) || playState.get.call(animation) !== 'running') continue;
        const at = currentTime.get.call(animation);
        hold(animation);
        if (at != null) currentTime.set.call(animation, Number(at) + ahead * animation.playbackRate);
      }
      if (!state.watching) { state.watching = true; nativeFrame(watch); }
    },
    // Moves the frozen scene on by ms: the page's clock and every held
    // animation together, timers and frames still held.
    advance(ms) {
      if (state.frozenAt == null) throw new Error('advanceFrozenPage: the page is not frozen');
      state.offset -= ms;
      for (const animation of state.held) {
        if (state.deferred.has(animation)) {
          currentTime.set.call(animation, (state.frozenAt - state.offset - state.deferred.get(animation)) * animation.playbackRate);
        } else {
          const at = currentTime.get.call(animation);
          if (at != null) currentTime.set.call(animation, Number(at) + ms * animation.playbackRate);
        }
      }
    },
    thaw() {
      if (state.frozenAt == null) return;
      // The held runs restart from the timeline's last frame time below. The
      // frozen span ends at that same instant, so the page's clock and its
      // runs stay together.
      const frame = timelineTime.call(document.timeline);
      state.offset += (frame == null ? rawNow() : Number(frame)) - state.frozenAt;
      state.frozenAt = null;
      const held = [...state.held];
      state.held.clear();
      for (const animation of held) {
        const deferred = state.deferred.has(animation);
        const value = state.deferred.get(animation);
        state.deferred.delete(animation);
        // On from where it stood, dated on the timeline's own time. A plain
        // play() resolves its start later, and WebKit then resumed at the start
        // it had before the pause. A start the page wrote while frozen resumes
        // the same way, from the time it held. The timeline reads the current
        // frame's time, which trails the page's clock by however far into the
        // frame the thaw runs. So a start dated from now would sit before its
        // start for the rest of that frame.
        const at = currentTime.get.call(animation);
        const timeline = timelineTime.call(document.timeline);
        if (playState.get.call(animation) === 'idle') {
          // A run the page cancelled while frozen (a CSS transition it
          // reversed, a CSS animation it removed) stays cancelled.
        } else if (at != null && timeline != null && animation.playbackRate !== 0) {
          startTime.set.call(animation, Number(timeline) - Number(at) / animation.playbackRate);
        } else if (deferred) {
          startTime.set.call(animation, value + state.offset);
        } else {
          nativePlay.call(animation);
        }
      }
    },
  };
})()`;

/**
 * Installs the page clock a freeze needs, for this page and every document it
 * loads from now on. Opt-in: a page without it is untouched. Call it before
 * the page under test loads, and before `installTimerGate`.
 */
export async function installPageFreeze(page: Page): Promise<void> {
  await page.addInitScript(FREEZE_SCRIPT);
  await page.evaluate(FREEZE_SCRIPT);
}

/**
 * Freezes the scene in one page task. Every animation pauses where it stands,
 * the timer gate holds timers and frame callbacks, and every time the page
 * reads stands still. Needs `installPageFreeze` before the page loaded and
 * `installTimerGate` after.
 */
export async function freezePage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __harnessFreeze?: {freeze(): void};
      __harnessTimerGate?: {freeze(isClockStopped: boolean): void};
    };
    if (w.__harnessFreeze == null || w.__harnessTimerGate == null) {
      throw new Error(
        'freezePage: call installPageFreeze before the page loads, then installTimerGate',
      );
    }
    w.__harnessFreeze.freeze();
    w.__harnessTimerGate.freeze(true);
  });
}

/**
 * Arms a one-shot freeze on the page's next `type` event (a `touchstart`, a
 * `touchend`, a `scroll`). The scene freezes in the event's own task, before
 * any page listener for it runs. So what the page starts for that input is held
 * at its start however late the test process reacts. Pointer, touch, mouse,
 * key, wheel and scroll events can arm a freeze; any other type throws.
 */
export async function freezePageOn(page: Page, type: string): Promise<void> {
  await page.evaluate(eventType => {
    const w = window as unknown as {
      __harnessFreeze?: {arm(type: string): void};
      __harnessTimerGate?: {freeze(isClockStopped: boolean): void};
    };
    if (w.__harnessFreeze == null || w.__harnessTimerGate == null) {
      throw new Error(
        'freezePageOn: call installPageFreeze before the page loads, then installTimerGate',
      );
    }
    w.__harnessFreeze.arm(eventType);
  }, type);
}

/**
 * Freezes the scene in the first frame where `predicate(arg)` holds in the
 * page, checked on every real frame. The scene stops where the proof wants it
 * however late the test process reacts. `predicate` runs in the page (it is
 * serialized, as for `page.waitForFunction`); it may read layout. Rejects past
 * `timeout` ms without freezing.
 */
export async function freezePageWhen<A>(
  page: Page,
  predicate: (arg: A) => boolean,
  arg: A,
  {timeout = 5_000}: {timeout?: number} = {},
): Promise<void> {
  await page.evaluate(
    ([source, value, wait]) =>
      new Promise<void>((resolve, reject) => {
        const w = window as unknown as {
          __harnessFreeze?: {
            freeze(): void;
            frame: (callback: () => void) => number;
            realNow: () => number;
          };
          __harnessTimerGate?: {freeze(isClockStopped: boolean): void};
        };
        const freeze = w.__harnessFreeze;
        const gate = w.__harnessTimerGate;
        if (freeze == null || gate == null) {
          reject(
            new Error(
              'freezePageWhen: call installPageFreeze before the page loads, then installTimerGate',
            ),
          );
          return;
        }
        const check = new Function(`return (${source});`)() as (
          value: unknown,
        ) => boolean;
        // The real clock: the page's own stands still while it is frozen.
        const deadline = freeze.realNow() + wait;
        const tick = () => {
          let isMet: boolean;
          try {
            isMet = check(value);
          } catch (error) {
            reject(error);
            return;
          }
          if (isMet) {
            freeze.freeze();
            gate.freeze(true);
            resolve();
          } else if (freeze.realNow() > deadline) {
            reject(
              new Error(
                `freezePageWhen: the condition did not hold within ${wait} ms`,
              ),
            );
          } else {
            freeze.frame(tick);
          }
        };
        freeze.frame(tick);
      }),
    [predicate.toString(), arg, timeout] as const,
  );
}

/**
 * Moves a frozen scene on by `ms`. The page's clock and every held animation
 * advance together, as if `ms` had passed, while timers and frame callbacks
 * stay held for the thaw. A proof steps the scene to the instant it wants (a
 * lens mid-slide) by the scene's own time, however loaded the runner is.
 */
export async function advanceFrozenPage(page: Page, ms: number): Promise<void> {
  await page.evaluate(step => {
    const w = window as unknown as {
      __harnessFreeze?: {advance(ms: number): void};
      __harnessTimerGate?: {catchUp(): void};
    };
    if (w.__harnessFreeze == null) {
      throw new Error('advanceFrozenPage: call installPageFreeze first');
    }
    w.__harnessFreeze.advance(step);
    // Timeouts the page's clock reached are held for the thaw.
    w.__harnessTimerGate?.catchUp();
  }, ms);
}

/**
 * Thaws the scene in one page task. Every animation held by the freeze plays on
 * from where it stood, one the page started while frozen from its start. The
 * page's time runs again, and the held timers and frame callbacks run in the
 * order they came due.
 */
export async function thawPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __harnessFreeze?: {thaw(): void};
      __harnessTimerGate?: {thaw(): void};
    };
    w.__harnessFreeze?.thaw();
    w.__harnessTimerGate?.thaw();
  });
}
