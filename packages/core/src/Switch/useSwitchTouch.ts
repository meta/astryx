// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useSwitchTouch.ts
 * @input Switch's parts (gesture surface, input, thumb and track), its value,
 *   whether it is interactive, the track's other state (switchFill.ts) and
 *   the thumb geometry (switchTouch.ts)
 * @output Exports useSwitchTouch: Switch's gestures for a mouse, a pen and a
 *   finger, and its touch presentation under a coarse primary pointer
 * @position DOM half of Switch's touch presentation, on the gesture system
 *   (../gestures) and the compositor animator (../motion/animator)
 *
 * SYNC: When modified, update switchTouch.ts, Switch.tsx
 * and __tests__/Switch.interaction.browser.spec.ts.
 */

import {useMemo, useState, type RefObject} from 'react';
import {getGestureHost} from '../gestures/GestureHost';
import {createPressTracker, type ControlEvent} from '../gestures/PressTracker';
import type {GestureTouch} from '../gestures/types';
import {isRtlElement} from '../hooks/isRtlElement';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  createMotionAnimator,
  type Animator,
  type MotionCurve,
} from '../motion/animator';
import {solveSpring, toSpring, type SpringDescription} from '../motion/spring';
import {UIKIT_GESTURES} from '../motion/uikit/gestures';
import {registerSwitchTable, switchControl} from '../motion/uikit/switch';
import {useTouchPresentation} from '../utils/touchPresentation';
import {awaitBrowserClick, clickForLift} from '../utils/browserClickWait';
import {armClickGuard} from '../utils/clickGuard';
import {
  commitOnRelease,
  dragTarget,
  settleTime,
  startFlip,
  stepFlip,
  switchTouchGeometry,
  type SwitchFlip,
  type SwitchTouchGeometry,
} from './switchTouch';
import {
  readFillOf,
  sameTrackState,
  trackStateOf,
  type TrackState,
} from './switchFill';

export interface SwitchTouchParts {
  /** Receives the touches: the input and the track. */
  readonly surface: RefObject<HTMLElement | null>;
  readonly input: RefObject<HTMLInputElement | null>;
  /** Moves: the themed thumb itself. */
  readonly thumb: RefObject<HTMLElement | null>;
  /**
   * The track: its `::after` is the fade layer over its own fill, showing
   * the fill it is leaving or heading to (switchFill.ts).
   */
  readonly track: RefObject<HTMLElement | null>;
}

export interface SwitchTouchOptions {
  readonly isOn: boolean;
  /** False while disabled or busy: no touch is tracked. */
  readonly isInteractive: boolean;
  /**
   * Disabled: the touch presentation is off and attaches nothing. A
   * busy switch stays attached, so a change that starts a busy state still
   * plays its release motion.
   */
  readonly isDisabled: boolean;
  /** The track's box, px (width × height): the thumb geometry's scale. */
  readonly trackSize: readonly [number, number];
  /**
   * The props the track renders with in its other state (its theme target
   * and fill), for the fade layer's colour.
   */
  readonly otherTrackProps: object;
}

/** The fade layer's colour, set on the track for its ::after (Switch.tsx). */
const FADE_FILL = '--_switch-fade-fill';
/** The track's own fill while a change is held (inline, over its CSS). */
const BASE_FILL = 'background-color';
const TRAVEL = switchControl.travel;
const TRACKING = switchControl.tracking;
/**
 * Horizontal travel at which the press begins if it has not (a pan
 * begins here), px.
 */
const PAN_HYSTERESIS = UIKIT_GESTURES.pan.hysteresis.value;

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

/**
 * The lift spring until `holdSeconds`, then the settle spring from where the
 * lift got to. It is one curve, so the settle starts on the compositor's
 * clock.
 */
function liftThenSettle({
  from,
  velocity,
  lifted,
  rest,
  holdSeconds,
  threshold,
  lift,
  settle,
}: {
  from: number;
  velocity: number;
  lifted: number;
  rest: number;
  holdSeconds: number;
  threshold: number;
  /** The lift and settle springs as the theme sets them. */
  lift: SpringDescription;
  settle: SpringDescription;
}): MotionCurve {
  const hold = Math.max(0, holdSeconds);
  const first = solveSpring(toSpring(lift), {from, to: lifted, velocity});
  const second = solveSpring(toSpring(settle), {
    from: first.value(hold),
    to: rest,
    velocity: first.velocity(hold),
  });
  return {
    duration: hold + second.settleTime(threshold),
    at: t => (t < hold ? first.value(t) : second.value(t - hold)),
    velocity: t => (t < hold ? first.velocity(t) : second.velocity(t - hold)),
  };
}

/**
 * The switch's presentation: the touch presentation under a coarse primary
 * pointer, or its own under a fine one.
 */
type SwitchPresentation = 'touch' | 'pointer';

interface Elements {
  surface: HTMLElement;
  input: HTMLInputElement;
  thumb: HTMLElement;
  track: HTMLElement;
}

interface Drag {
  /** The thumb's offset when the finger landed. */
  readonly start: number;
  flip: SwitchFlip;
}

/**
 * The touch presentation of one switch: animators, recognizers and the
 * gesture state. No React state: a gesture never renders. UISwitch on iOS
 * 26.2 is the reference; every number is in motion/uikit/switch.ts.
 *
 * - The thumb's resting place is CSS (its inline-start inset). So the steady
 *   state needs no script and mirrors under RTL by itself. The animator only
 *   moves the thumb by a delta from that place (`translate`). When the value
 *   moves the CSS place, the delta is rebased in the same layout effect.
 *   Nothing moves on screen, and the velocity is kept.
 * - Touches go to a press tracker, which never blocks a scroll. No
 *   recognizer claims the touch. `touch-action: pan-y` (Switch.tsx) keeps
 *   horizontal moves for the switch: a drag follows and flips it, and the
 *   release commits. A vertical drag is the page's scroll, and the switch
 *   yields.
 * - A tap, a hold or a short drag activates through the browser's own click.
 *   The browser sends no click for a finger's hold, so the switch clicks its
 *   input once the click window passes. A mouse or a pen gets a click when
 *   it is released on the input. A drag that flipped the switch gets no
 *   click, so the switch clicks its input, and the shared click guard
 *   swallows the browser's late click. A finger's press slid off and lifted
 *   outside toggles too, as UISwitch's does. Forms, `onChange` and the
 *   keyboard stay the native checkbox's.
 * - The drag never renders: each move retargets the thumb's tracking spring
 *   and steps the flip rule on the finger's travel.
 * - The thumb lifts while a finger presses, into half of the gap around it,
 *   and its shadow fades in. At the release it settles back, no sooner than
 *   the minimum lift time. The lift and the settle are one curve, built at
 *   the release, so the settle starts on time on the compositor.
 * - The track keeps its own fill in both states. A fade layer over it,
 *   painted with the track's other fill, fades the colour on the compositor.
 *   When the value changes, the layer swaps to the other fill and to the
 *   complement of its opacity. So nothing changes on screen. A change the
 *   fade already heads to swaps nothing: the track holds its previous fill
 *   inline until the fade lands. WebKit plays a curve built in a held frame
 *   only once the long task ends, so a swap there stepped the colour back.
 *   The layer is composited from the start (`will-change`, Switch.tsx), or
 *   iOS Safari runs its fade on the main thread.
 * - Under reduced motion nothing travels or springs: a change plays the
 *   animator's Reduce Motion cross-fade. A dragging finger still moves the
 *   thumb: that is direct manipulation.
 * - Under a fine primary pointer the switch keeps its own look. The same
 *   tracking, flip rule and release decide the value, with no animator, and
 *   the thumb moves when the value does. Only its press listens at rest. Its
 *   click listener comes with a press.
 */
export class SwitchTouchController {
  private elements: Elements | null = null;
  private geometry: SwitchTouchGeometry;
  private isOn: boolean;
  private isInteractive = true;
  /** The side the visuals show or head to. */
  private isVisuallyOn: boolean;
  /** +1 left-to-right, −1 right-to-left. */
  private direction = 1;
  private thumb: Animator | null = null;
  /** The fade layer: its opacity is how far the visuals are from the value. */
  private fade: Animator | null = null;
  /** The lifted shadow: the thumb's `::after`, faded in with the lift. */
  private shadow: Animator | null = null;
  /** When the thumb lifted (document timeline, ms); null while at rest. */
  private liftTime: number | null = null;
  /** When the running settle leaves the lift (settleTime), ms. */
  private settleAt: number | null = null;
  private otherTrack: TrackState | null = null;
  /**
   * A change landed mid-fade, and the fade already heads to it. The track's
   * own fill stays the previous value's (inline) until the fade lands. So the
   * change's frame builds no curve and repaints nothing. `baseHold` counts
   * holds, so a settled one ignores its late landing.
   */
  private baseHeld = false;
  private baseHold = 0;
  private detachers: (() => void)[] = [];
  /** When the press began (document timeline, ms); null with no press. */
  private pressTime: number | null = null;
  /** The thumb's offset when the current finger landed. */
  private downOffset = 0;
  private drag: Drag | null = null;
  /** The finger's last travel along x, for a lift that reports none. */
  private lastTravel = 0;
  /**
   * The press and the pan both report every touch event; the first report
   * takes the step and this skips the second (cleared after the event).
   */
  private isStepping = false;
  /** The current touch already ended in a release. */
  private released = false;
  /**
   * Reduced motion: a release changed the value. The thumb's travel waits for
   * the value to commit, so its one cross-fade lands in the new frame.
   */
  private pendingTravel = false;
  /** Passive: a finger is down on the switch. */
  private isTracking = false;
  /** Which presentation the switch has: the touch one, or its own. */
  private presentation: SwitchPresentation = 'touch';
  /** Passive: a lift is waiting for the browser's own click; this ends it. */
  private endBrowserClickWait: (() => void) | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(isOn: boolean, geometry: SwitchTouchGeometry) {
    this.isOn = isOn;
    this.isVisuallyOn = isOn;
    this.geometry = geometry;
  }

  get isAttached(): boolean {
    return this.elements != null;
  }

  attach(elements: Elements, presentation: SwitchPresentation): void {
    this.detach();
    this.elements = elements;
    this.presentation = presentation;
    this.measureGeometry();
    this.direction = isRtlElement(elements.surface) ? -1 : 1;
    this.isVisuallyOn = this.isOn;
    const host = getGestureHost(elements.surface.ownerDocument);
    if (presentation === 'pointer') {
      // The switch's own look: the gestures decide the value and the CSS
      // shows it.
      this.detachers = this.attachPassive(host, elements);
      return;
    }
    registerSwitchTable();
    this.thumb = createMotionAnimator(elements.thumb);
    // The layer rests clear (its class's opacity 0) while the visuals show
    // the value; from here its opacity is the animator's.
    this.fade = createMotionAnimator(elements.track, {
      pseudoElement: '::after',
      initial: {opacity: 0},
    });
    this.fade.set({opacity: 0});
    this.shadow = createMotionAnimator(elements.thumb, {
      pseudoElement: '::after',
      initial: {opacity: 0},
    });
    this.shadow.set({opacity: 0});
    this.paintFade();
    this.detachers = this.attachPassive(host, elements);
  }

  /**
   * Passive: UIControl's tracking, which never blocks a scroll. The press
   * begins with the touch, or with the first horizontal move a pan would
   * begin on. Inside a scroller the touch waits for the content delay. Every
   * move steps the flip rule, and the release commits. A touch the browser
   * takes for its scroll yields with no toggle.
   */
  private attachPassive(
    host: ReturnType<typeof getGestureHost>,
    elements: Elements,
  ): (() => void)[] {
    const {surface} = elements;
    const tracker = createPressTracker({
      view: surface,
      getBounds: () => surface.getBoundingClientRect(),
      isEnabled: () => this.isInteractive,
      isBraking: () => host.isScrollBraking(surface),
      // A held switch opens no menu (UISwitch shows none).
      holdsContextMenu: () => this.pressTime != null,
      onControlEvent: (event, touch) => this.onControlEvent(event, touch),
      onHighlightChange: isHighlighted => {
        if (isHighlighted && this.isTracking && this.pressTime == null) {
          this.pressBegan(now());
        }
      },
    });
    return [host.attachConsumer(surface, tracker), () => tracker.dispose()];
  }

  /** Undo everything: listeners, timers, animations and inline styles. */
  detach(): void {
    for (const detach of this.detachers) {
      detach();
    }
    this.detachers = [];
    this.clearTimers();
    for (const animator of [this.thumb, this.fade, this.shadow]) {
      const element = animator?.element;
      animator?.dispose();
      if (element != null) {
        for (const property of ['translate', 'scale', 'opacity']) {
          element.style.removeProperty(property);
        }
      }
    }
    this.elements?.track.style.removeProperty(FADE_FILL);
    this.elements?.track.style.removeProperty(BASE_FILL);
    this.baseHeld = false;
    this.baseHold++;
    this.thumb = this.fade = this.shadow = null;
    this.liftTime = null;
    this.elements = null;
    this.pressTime = null;
    this.drag = null;
    this.isTracking = false;
  }

  setInteractive(isInteractive: boolean): void {
    this.isInteractive = isInteractive;
    if (!isInteractive && this.pressTime != null) {
      this.abandon(now());
    }
  }

  /** The track's other state, re-rendered with each value. */
  setOtherTrack(otherTrack: TrackState): void {
    const previous = this.otherTrack;
    this.otherTrack = otherTrack;
    // A held fill was read from the previous other state; a re-render that
    // keeps it keeps the hold.
    if (this.baseHeld && !sameTrackState(previous, otherTrack)) {
      this.landBase(now());
    }
  }

  setGeometry(geometry: SwitchTouchGeometry): void {
    this.geometry = geometry;
    this.measureGeometry();
    this.thumb?.set({x: 0, scaleX: 1, scaleY: 1});
  }

  /**
   * The thumb geometry from the rendered boxes. The track's box lets a theme
   * resize the track. The thumb's box is the circle of the current value. It
   * rests by insets from the track's padding box, so padding does not move it.
   */
  private measureGeometry(): void {
    const track = this.elements?.track;
    const thumb = this.elements?.thumb;
    if (track == null) {
      return;
    }
    // Fractional boxes: the track's border box less its border (it has no
    // transform). The thumb's used size comes from its computed style, which
    // its scale does not change.
    const box = track.getBoundingClientRect();
    const trackWidth = box.width - 2 * track.clientLeft;
    const trackHeight = box.height - 2 * track.clientTop;
    if (trackWidth <= 0 || trackHeight <= 0) {
      return;
    }
    const style = thumb == null ? null : getComputedStyle(thumb);
    const thumbWidth = style == null ? NaN : parseFloat(style.width);
    const thumbHeight = style == null ? NaN : parseFloat(style.height);
    this.geometry = switchTouchGeometry(
      trackWidth,
      trackHeight,
      thumbWidth > 0 && thumbHeight > 0
        ? {width: thumbWidth, height: thumbHeight}
        : undefined,
    );
  }

  /**
   * The rendered value changed. The CSS has already moved the thumb's
   * resting place. So the thumb's delta is rebased first, and nothing moves on
   * screen. Then the visuals head for the new value.
   */
  setValue(isOn: boolean): void {
    if (isOn === this.isOn) {
      return;
    }
    const previous = this.isOn;
    this.isOn = isOn;
    const thumb = this.thumb;
    if (thumb == null) {
      this.isVisuallyOn = isOn;
      return;
    }
    const time = now();
    // The thumb's CSS rest moved with the value: shift it back by as much,
    // so nothing moves on screen. A spring keeps its target through the shift
    // and is sent to the new rest below. A reduced-motion dip shifts whole,
    // its end included, and keeps going.
    const springs = thumb.reducedMotion() === 'off';
    thumb.rebase({
      x: this.direction * (this.rest(previous) - this.rest(isOn)),
    });
    // Each state has its own thumb size, the circle a mouse sees. The box the
    // CSS now renders is the new value's. Its scale takes the old size over
    // and grows or shrinks it from there.
    const before = this.geometry;
    this.measureGeometry();
    if (springs) {
      this.rescaleThumb(before, this.geometry, time);
    }
    // The track now shows the new value's fill. The fade layer swaps to the
    // other fill and to the complement of its opacity. Nothing changes on
    // screen, and the fade keeps heading where the visuals head.
    const fade = this.fade;
    if (fade != null) {
      this.landBase(time);
      // Already heading here (a release, a drag that flipped). The running
      // fade carries the change over the previous fill, held as the track's
      // own until it lands. WebKit plays a curve built in a held frame only
      // once the long task ends. A swap here would step the colour back.
      if (this.isVisuallyOn !== isOn || !this.holdBase()) {
        this.swapFade(time);
      }
    }
    const wasDragging = this.drag != null && !this.released;
    if (wasDragging) {
      // The app changed the value mid-gesture: the value wins and the
      // gesture ends without committing.
      this.drag = null;
      this.released = true;
      this.pressEnded();
    }
    // A release already sent the visuals here. Any other change, the app's or
    // one mid-gesture, sends them now, and a spring heads for the new rest.
    if (
      springs ||
      wasDragging ||
      this.pendingTravel ||
      this.isVisuallyOn !== isOn
    ) {
      const touchRelease = this.pendingTravel;
      this.pendingTravel = false;
      this.showSide(isOn, time, thumb.getVelocity('x', time), touchRelease);
    }
  }

  // --- Touches ---------------------------------------------------------------

  private touchDown(time: number): void {
    this.landBase(time);
    this.released = false;
    this.pendingTravel = false;
    this.drag = null;
    this.lastTravel = 0;
    this.downOffset = this.offsetAt(time);
  }

  /** Passive: a mouse, a pen or a finger on the switch, UIControl's events. */
  private onControlEvent(event: ControlEvent, touch: GestureTouch): void {
    const travel = touch.x - touch.startX;
    // The switch reads the thumb when it handles the event. Its motion has no
    // start of its own. A call that continues motion starts then, from the
    // curve on screen. A call from rest starts at the frame that shows it, as
    // Core Animation starts an animation at its commit. A busy main thread
    // hands the switch an event late and commits its frame late. The motion
    // is delayed, never stepped back or skipped into. The event's own time is
    // the recognizers'.
    const time = now();
    switch (event) {
      case 'touchDown':
        this.isTracking = true;
        this.touchDown(time);
        return;
      case 'touchDragInside':
      case 'touchDragOutside':
        if (this.released || !this.isInteractive) {
          return;
        }
        if (this.pressTime == null) {
          if (Math.abs(travel) < PAN_HYSTERESIS) {
            return;
          }
          // A pan would begin here: the switch takes the horizontal drag.
          this.pressBegan(time);
        }
        this.move(time, travel);
        return;
      case 'touchUpInside':
      case 'touchUpOutside':
        this.isTracking = false;
        if (this.released || !this.isInteractive) {
          return;
        }
        // The finger's lift is a step of its own: a flip armed by the last
        // move happens here (a fast swipe flips on the lift).
        this.move(time, travel);
        if (this.drag?.flip.didFlip !== true && event === 'touchUpInside') {
          // A tap, a hold or a short drag: the browser's click activates it.
          // Only a finger's lift can come with no click (a hold). A mouse or a
          // pen gets one whenever it is released on the input. With no click,
          // it was released off the input, inside the tracking slop. The
          // switch is then left alone, as the native checkbox is.
          this.release(time, {
            byBrowserClick: true,
            clicksIfNoBrowserClick: touch.pointerType === 'touch',
          });
          return;
        }
        if (
          touch.pointerType !== 'touch' &&
          (event === 'touchUpOutside' || this.drag?.flip.didFlip !== true)
        ) {
          // A mouse or a pen released outside the tracking bounds, flipped or
          // not, leaves the switch alone, as the native checkbox does. So the
          // press can be taken back (WCAG 2.5.2). Only a finger's press slid
          // off toggles.
          this.released = true;
          this.abandon(time);
          return;
        }
        // A drag that flipped, or a press slid off and lifted outside, which
        // toggles as UISwitch's does. The switch decides this lift itself, so
        // the shared click guard swallows the browser's click, if one comes.
        // A drag back past the press commits nothing, and its click must not
        // toggle either.
        if (this.elements != null) {
          armClickGuard(this.elements.input.ownerDocument);
        }
        this.release(time);
        return;
      case 'touchCancel':
        // The browser took the touch for its scroll, or a recognizer above
        // took it: the switch yields.
        this.isTracking = false;
        if (!this.released) {
          this.released = true;
          this.abandon(time);
        }
        return;
      case 'touchDragEnter':
      case 'touchDragExit':
        return;
    }
  }

  /**
   * One touch event of a held or dragged switch. It retargets the thumb at the
   * finger (one style write) and steps the flip rule.
   */
  private move(time: number, travel: number | null): void {
    const thumb = this.thumb;
    if (this.isStepping) {
      return;
    }
    this.isStepping = true;
    queueMicrotask(() => {
      this.isStepping = false;
    });
    const x = this.direction * (travel ?? this.lastTravel);
    this.lastTravel = travel ?? this.lastTravel;
    const drag = (this.drag ??= {
      start: this.downOffset,
      flip: startFlip(this.isOn),
    });
    // The thumb under the finger is direct manipulation, which reduced
    // motion leaves alone. Under it the thumb is placed at once: the animator
    // would cross-fade a move. Under a fine pointer nothing follows the
    // pointer. The switch keeps its own look, and the value moves the thumb.
    if (thumb != null) {
      const target = this.toX(dragTarget(drag.start, x, this.geometry));
      if (thumb.reducedMotion() === 'off') {
        thumb.animate({x: target}, {spring: TRACKING});
      } else {
        thumb.set({x: target});
      }
    }
    drag.flip = stepFlip(drag.flip, x, this.geometry);
    if (drag.flip.isVisuallyOn !== this.isVisuallyOn) {
      this.showWell(drag.flip.isVisuallyOn, time);
    }
  }

  /**
   * The finger lifted after a tap, a hold or a drag. `byBrowserClick`: the
   * browser's own click activates the input, and the switch clicks it only
   * if that click never comes.
   */
  private release(
    time: number,
    {
      byBrowserClick = false,
      clicksIfNoBrowserClick = true,
    }: {byBrowserClick?: boolean; clicksIfNoBrowserClick?: boolean} = {},
  ): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.clearTimers();
    const commit = commitOnRelease(this.drag?.flip ?? null, this.isOn);
    this.drag = null;
    if (this.pressTime == null) {
      // A tap quicker than a scroller's content delay: the press begins now.
      this.pressBegan(time);
    }
    if (
      commit !== this.isOn &&
      this.thumb != null &&
      this.thumb.reducedMotion({touchRelease: true}) !== 'off'
    ) {
      // Under reduced motion the travel is one cross-fade, played when the
      // value commits (setValue). It lands in the new value's frame. The
      // colour starts now.
      this.pendingTravel = true;
      this.showWell(commit, time, true);
    } else {
      this.showSide(commit, time, undefined, true);
    }
    this.pressEnded(time, true);
    const surface = this.elements?.surface;
    if (byBrowserClick && surface != null) {
      // The lift's own click activates the input natively: the switch then
      // clicks nothing itself.
      this.endBrowserClickWait = awaitBrowserClick(surface, {
        onClicked: () => {
          this.endBrowserClickWait = null;
          this.scheduleReconcile();
        },
        onNoClick: () => {
          this.endBrowserClickWait = null;
          if (clicksIfNoBrowserClick && commit !== this.isOn) {
            this.clickInput();
          }
          this.scheduleReconcile();
        },
      });
      return;
    }
    if (commit !== this.isOn) {
      // No click comes from the browser for this lift; the input's own click
      // keeps every native path (form value, onChange, the label).
      this.clickInput();
    }
    this.scheduleReconcile();
  }

  /**
   * The switch's own click on its input. The shared click guard then swallows
   * the browser's late click for the same lift, so the switch toggles once.
   */
  private clickInput(): void {
    const input = this.elements?.input;
    if (input != null) {
      clickForLift(input);
    }
  }

  /** If the owner kept the old value, the visuals go back to it. */
  private scheduleReconcile(): void {
    if (this.reconcileTimer != null) {
      clearTimeout(this.reconcileTimer);
    }
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = null;
      if (this.drag == null && this.isVisuallyOn !== this.isOn) {
        this.pendingTravel = false;
        this.showSide(this.isOn, now(), undefined, true);
      }
    }, 0);
  }

  /** The touch ended without a release (cancelled, or the switch turned off). */
  private abandon(time: number): void {
    this.drag = null;
    this.showSide(this.isOn, time, undefined, true);
    this.pressEnded(time, true);
  }

  // --- Visuals ---------------------------------------------------------------

  private rest(isOn: boolean): number {
    return isOn ? this.geometry.travel : 0;
  }

  /** The animator's x for a thumb offset, relative to its CSS place. */
  private toX(offset: number): number {
    return this.direction * (offset - this.rest(this.isOn));
  }

  /** The thumb's offset on screen at `time`, from the curve. */
  private offsetAt(time: number): number {
    const x = this.thumb?.get('x', time) ?? 0;
    return this.rest(this.isOn) + this.direction * x;
  }

  private showWell(isOn: boolean, time: number, touchRelease = false): void {
    this.isVisuallyOn = isOn;
    this.paintFade();
    this.animateFade(time, undefined, touchRelease);
  }

  /**
   * The fade layer heads for the visuals, on UIKit's well springs (on:
   * 0.68 s, off: 0.40 s). It is clear when they show the value. It is opaque,
   * the other fill, when they show the other side.
   */
  private animateFade(
    time: number,
    velocity?: number,
    touchRelease = false,
  ): void {
    // Under reduced motion the animator plays this as its cross-fade.
    this.fade?.animate(
      {opacity: this.isVisuallyOn === this.isOn ? 0 : 1},
      {
        spring: this.isVisuallyOn
          ? switchControl.wellOn
          : switchControl.wellOff,
        velocity: velocity == null ? undefined : {opacity: velocity},
      },
      {touchRelease},
    );
  }

  /**
   * The track now shows the new value's fill. The fade layer swaps to the
   * other fill and to the complement of its opacity, so nothing changes on
   * screen. It keeps heading where the visuals head, on the running clock.
   */
  private swapFade(time: number): void {
    const fade = this.fade;
    if (fade == null) {
      return;
    }
    const opacity = fade.get('opacity', time);
    const fadeVelocity = fade.getVelocity('opacity', time);
    this.paintFade();
    fade.rebase({opacity: 1 - 2 * opacity});
    this.animateFade(time, -fadeVelocity);
  }

  /**
   * Holds the track's own fill at the previous value's (the other state's,
   * now) until the fade lands. False when there is nothing to read it from.
   */
  private holdBase(): boolean {
    const track = this.elements?.track;
    const fade = this.fade;
    if (track == null || fade == null || this.otherTrack == null) {
      return false;
    }
    track.style.setProperty(BASE_FILL, readFillOf(track, this.otherTrack));
    this.baseHeld = true;
    const hold = ++this.baseHold;
    void fade.atRest(['opacity']).then(() => {
      if (hold === this.baseHold) {
        this.landBase(now());
      }
    });
    return true;
  }

  /**
   * Ends a held fill: the track shows its value's fill again and the fade
   * layer swaps under it. Once the fade has landed, the layer is opaque and
   * nothing changes on screen. Called early, by a new touch, value or other
   * state, the swap keeps the picture where it is.
   */
  private landBase(time: number): void {
    if (!this.baseHeld) {
      return;
    }
    this.baseHeld = false;
    this.baseHold++;
    this.elements?.track.style.removeProperty(BASE_FILL);
    this.swapFade(time);
  }

  /** The fade layer's colour: the track's fill in its other state. */
  private paintFade(): void {
    const track = this.elements?.track;
    if (track == null || this.fade == null || this.otherTrack == null) {
      return;
    }
    track.style.setProperty(FADE_FILL, readFillOf(track, this.otherTrack));
  }

  /** Track color and thumb head for one side. */
  private showSide(
    isOn: boolean,
    time: number,
    velocity?: number,
    touchRelease = false,
  ): void {
    if (isOn !== this.isVisuallyOn) {
      this.showWell(isOn, time, touchRelease);
    }
    // Under reduced motion the animator cross-fades this travel: the thumb
    // fades out where it is and back in at its rest.
    this.thumb?.animate(
      {x: this.toX(this.rest(isOn))},
      {
        spring: TRAVEL,
        velocity: velocity == null ? undefined : {x: velocity},
      },
      {touchRelease},
    );
  }

  /** The press began: the switch holds the touch and the thumb lifts. */
  private pressBegan(time: number): void {
    this.pressTime = time;
    this.lift(time);
  }

  /** The press ended (a release, a cancel or the switch turning off). */
  private pressEnded(time: number = now(), touchRelease = false): void {
    this.pressTime = null;
    this.settle(time, touchRelease);
  }

  /**
   * The thumb grows about its center into half the gap around it, and its
   * lifted shadow fades in. Under reduced motion nothing lifts: the lift is
   * feedback with no fade of its own.
   */
  private lift(time: number): void {
    if (this.thumb == null || this.thumb.reducedMotion() !== 'off') {
      return;
    }
    this.liftTime = time;
    const lift = this.thumb.animate(
      {scaleX: this.geometry.liftScaleX, scaleY: this.geometry.liftScaleY},
      {spring: switchControl.lift},
    );
    this.shadow?.animate({opacity: 1}, {spring: switchControl.lift});
    // A lift from rest starts at the frame that shows it: the minimum lift
    // counts from there.
    void lift.started.then(start => {
      if (this.liftTime === time) {
        this.liftTime = start;
      }
    });
  }

  /**
   * The thumb settles back after the press, no sooner than the minimum lift
   * time after it lifted. One curve per property, built now, starts the
   * settle on the compositor's clock.
   */
  private settle(time: number, touchRelease: boolean): void {
    const liftTime = this.liftTime;
    if (liftTime == null) {
      return;
    }
    this.liftTime = null;
    const lift = switchControl.lift;
    const settle = switchControl.settle;
    this.settleAt = settleTime(time, liftTime);
    const hold = (this.settleAt - time) / 1000;
    const play = (
      animator: Animator | null,
      property: 'scaleX' | 'scaleY' | 'opacity',
      lifted: number,
      rest: number,
      threshold: number,
    ) => {
      if (animator == null) {
        return;
      }
      animator.play(
        {
          [property]: liftThenSettle({
            from: animator.get(property, time),
            velocity: animator.getVelocity(property, time),
            lifted,
            rest,
            holdSeconds: hold,
            threshold,
            lift,
            settle,
          }),
        },
        {touchRelease},
      );
    };
    play(this.thumb, 'scaleX', this.geometry.liftScaleX, 1, 1e-4);
    play(this.thumb, 'scaleY', this.geometry.liftScaleY, 1, 1e-4);
    play(this.shadow, 'opacity', 1, 0, 1e-3);
  }

  /**
   * The thumb's box changed size with the value: the on circle is larger.
   * Its scale carries the size it showed, so nothing jumps. Then it heads for
   * the new box through the settle, or to the lift a held press keeps.
   */
  private rescaleThumb(
    before: SwitchTouchGeometry,
    after: SwitchTouchGeometry,
    time: number,
  ): void {
    const thumb = this.thumb;
    if (
      thumb == null ||
      !(before.thumbWidth > 0 && before.thumbHeight > 0) ||
      !(after.thumbWidth > 0 && after.thumbHeight > 0) ||
      (before.thumbWidth === after.thumbWidth &&
        before.thumbHeight === after.thumbHeight)
    ) {
      return;
    }
    const held = this.liftTime != null;
    const hold =
      this.settleAt == null ? 0 : Math.max(0, this.settleAt - time) / 1000;
    for (const [property, factor, lifted] of [
      ['scaleX', before.thumbWidth / after.thumbWidth, before.liftScaleX],
      ['scaleY', before.thumbHeight / after.thumbHeight, before.liftScaleY],
    ] as const) {
      const keep = lifted * factor;
      thumb.play({
        [property]: liftThenSettle({
          from: thumb.get(property, time) * factor,
          velocity: thumb.getVelocity(property, time) * factor,
          lifted: keep,
          rest: held ? keep : 1,
          holdSeconds: held ? 0 : hold,
          threshold: 1e-4,
          lift: switchControl.lift,
          settle: switchControl.settle,
        }),
      });
    }
  }

  private clearTimers(): void {
    this.endBrowserClickWait?.();
    this.endBrowserClickWait = null;
    if (this.reconcileTimer != null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }
  }
}

/**
 * Switch's gestures, attached for every pointer, with the touch
 * presentation under a coarse primary pointer. Its parts
 * must be rendered (and styled for it) whether or not it is active; it only
 * animates and listens.
 */
export function useSwitchTouch(
  parts: SwitchTouchParts,
  {
    isOn,
    isInteractive,
    isDisabled,
    trackSize,
    otherTrackProps,
  }: SwitchTouchOptions,
): void {
  const {isTouch} = useTouchPresentation();
  const [trackWidth, trackHeight] = trackSize;
  const geometry = useMemo(
    () => switchTouchGeometry(trackWidth, trackHeight),
    [trackWidth, trackHeight],
  );
  const otherTrack = trackStateOf(otherTrackProps);
  const [controller] = useState(
    () => new SwitchTouchController(isOn, geometry),
  );

  // Syncs the touch controller's animators with the value. It runs first: the
  // thumb's CSS place and the track's fill have just changed with the value.
  useIsomorphicLayoutEffect(() => {
    controller.setOtherTrack(otherTrack);
    controller.setValue(isOn);
  });

  // Syncs the controller's thumb geometry with the track's size.
  useIsomorphicLayoutEffect(() => {
    controller.setGeometry(geometry);
  }, [controller, geometry]);

  // Syncs whether the controller's gestures take a press.
  useIsomorphicLayoutEffect(() => {
    controller.setInteractive(isInteractive);
  }, [controller, isInteractive]);

  // Attaches the controller's DOM listeners and animators to the switch's
  // parts, and detaches them on cleanup.
  useIsomorphicLayoutEffect(() => {
    const surface = parts.surface.current;
    const input = parts.input.current;
    const thumb = parts.thumb.current;
    const track = parts.track.current;
    // A disabled switch takes no press: no listener is active. A busy one
    // stays attached (setInteractive ignores its presses),
    // so the change that made it busy keeps its motion.
    if (
      isDisabled ||
      surface == null ||
      input == null ||
      thumb == null ||
      track == null
    ) {
      return undefined;
    }
    controller.attach(
      {surface, input, thumb, track},
      isTouch ? 'touch' : 'pointer',
    );
    return () => controller.detach();
  }, [controller, isTouch, isDisabled, parts]);
}
