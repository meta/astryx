// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sliderTouchController.ts
 * @input The slider's control (and its size), thumbs, fill parts and value
 *   model; the gesture recognizers, the animator and the UIKit slider table
 * @output Exports `SliderTouchController`, `sliderCoastCurve` and the
 *   `SliderTouchModel` and `SliderTouchParts` types
 * @position Internal to Slider: useSliderTouch attaches it while enabled.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Slider/useSliderTouch.ts
 * - /packages/core/src/Slider/Slider.tsx
 * - /packages/core/src/Slider/useSliderTouch.test.tsx
 */

import {getGestureHost} from '../gestures/GestureHost';
import type {GestureRecognizer} from '../gestures/GestureRecognizer';
import {playHaptic} from '../gestures/haptics';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {
  PRESS_PROFILES,
  createPressTracker,
  type ControlEvent,
} from '../gestures/PressTracker';
import type {SwipeGestureRecognizer} from '../gestures/SwipeGestureRecognizer';
import {lockSelection} from '../gestures/selectionLock';
import {TapGestureRecognizer} from '../gestures/TapGestureRecognizer';
import type {PointerKind} from '../gestures/types';
import {isRtlElement} from '../hooks/isRtlElement';
import {
  createMotionAnimator,
  type Animator,
  type MotionCurve,
  type MotionHandle,
} from '../motion/animator';
import {projectDistance} from '../motion/projection';
import {resolveMotion} from '../motion/resolveMotion';
import {solveSpring, toSpring, type SpringDescription} from '../motion/spring';
import {
  SLIDER_DROP_SPRING,
  SLIDER_LIFT_SPRING,
  SLIDER_RELEASE_SPRING,
  registerSpringsTable,
} from '../motion/uikit/springs';
import {UIKIT_CONTROL, UIKIT_PAN} from '../motion/uikit/gestures';
import {slider as UIKIT_SLIDER} from '../motion/uikit/slider';
import {observeResize} from '../utils/sharedResizeObserver';

/** Frames of a coast before it reports values (the touch hand-off limit). */
const HAND_OFF_FRAMES = 3;

/** A coast shorter than this (px) and slower than 1 px/s is not played. */
const MIN_COAST_PX = 0.5;

/** The parts the controller moves. */
export interface SliderTouchParts {
  readonly control: HTMLElement;
  readonly thumbs: ReadonlyArray<HTMLElement>;
  /** The fill's mover (a range's start) and the fill itself. */
  readonly fillMover: HTMLElement | null;
  readonly fill: HTMLElement | null;
}

/** What the controller needs from Slider. Read fresh on every use. */
export interface SliderTouchModel {
  readonly min: number;
  readonly max: number;
  readonly isRange: boolean;
  readonly isHorizontal: boolean;
  readonly isDisabled: boolean;
  /** The thumb's size along the travel, px: the travel is inset by half of it. */
  readonly thumbSize: number;
  /** The values the owner rendered. */
  values(): ReadonlyArray<number>;
  /** What thumb `index` becomes for `raw`: snapped, clamped, kept apart. */
  constrain(index: number, raw: number): number;
  /** The range thumb `index` may cover, unsnapped (its ends and the gap). */
  bounds(index: number): readonly [number, number];
  /**
   * `onChange` for thumb `index`. `from` holds the start values when one
   * move changes both range thumbs, as a drag passed between coincident
   * thumbs does.
   */
  change(index: number, value: number, from?: ReadonlyArray<number>): void;
  /** Thumb `index` is under a finger (pressed paint, focus, tooltip), or none. */
  press(index: number | null): void;
  /**
   * The interaction ended. Report thumb `index`'s last `value` through
   * `onChange`, or null when the interaction ends on no value of its own.
   * Report it even when a frame's report already carried it: these handlers
   * run outside React's events, so that report's render can be pending.
   * Release the pressed paint. Then have the owner render it all now, so the
   * parts can return to the stylesheet and `onChangeEnd` carries what the
   * owner rendered.
   */
  commit(index: number, value: number | null): void;
  /** `onChangeEnd`, with the values the owner rendered. */
  reportEnd(): void;
  /**
   * The value a press at client point (`x`, `y`) on the track means: a
   * mark's value on a mark, else the point along the travel.
   */
  valueAt(x: number, y: number): number;
  /** The thumb a track press at `value` moves. */
  thumbFor(value: number): number;
}

/** The travel's geometry, read once when a finger lands. */
interface Geometry {
  /** The track's length along the travel, CSS px. */
  readonly length: number;
  /** The thumb's travel: the track minus one thumb. */
  readonly travel: number;
  readonly axis: 'x' | 'y';
  /** Screen direction of increasing value along `axis`. */
  readonly sign: 1 | -1;
  /** The control's client rect, for the release's inside test. */
  readonly rect: DOMRect;
}

interface Coast {
  handles: ReadonlyArray<MotionHandle>;
  readonly target: number;
  frames: number;
  raf: number;
  /** The coast in the thumb's px along `travel`, from `at`. */
  curve: MotionCurve;
  travel: number;
  readonly at: number;
  readonly touchRelease: boolean;
}

interface Interaction {
  /** The thumb whose touch target holds the finger. */
  readonly owner: number;
  /** The thumb whose value moves (a coincident pair may hand it over). */
  index: number;
  /** The track as last measured: its length can change mid-gesture. */
  geometry: Geometry;
  /** The value when the pan began. Null until it does. */
  startValue: number | null;
  /**
   * Where the pan's threshold lies along the axis, px from the touch-down
   * point. For a finger, it is the hysteresis on the side the pan began. For
   * a mouse, whose pan begins in any direction, it is the threshold's
   * projection on the axis.
   */
  beganOffset: number;
  /** The last value reported (or rendered when the finger landed). */
  value: number;
  /** Whether the finger is inside the control's tracking bounds. */
  isInside: boolean;
  /** The end the value sits at, for the once-per-entry haptic. */
  atEnd: 'min' | 'max' | null;
  /** The value changed during this interaction. */
  changed: boolean;
  coast: Coast | null;
  /** The pan ended or was cancelled (the release is under way or done). */
  released: boolean;
  /**
   * A mouse holds the thumb: it pans as a finger does, with no lift and no
   * coast, as a mouse drag behaved before.
   */
  readonly isMouse: boolean;
  /**
   * A finger's release coasts. A mouse's or a pen's drag ends at its release,
   * with no coast.
   */
  readonly coasts: boolean;
  /**
   * The drag began on two range thumbs that share a value. It picks its
   * thumb by its first movement and may pass to the other thumb.
   */
  readonly beganCoincident: boolean;
}

/**
 * The release coast as a curve in the thumb's own px, clamped to the
 * thumb's range. It is a spring from `from` to `to` with `velocity` (px/s).
 * Its value stops at an end instead of passing it, as UISlider clamps its
 * value and the thumb follows it.
 */
export function sliderCoastCurve({
  from,
  to,
  velocity,
  lower,
  upper,
  spring: description = SLIDER_RELEASE_SPRING,
}: {
  from: number;
  to: number;
  velocity: number;
  lower: number;
  upper: number;
  /** The release spring, as the thumb's theme resolves it. */
  spring?: SpringDescription;
}): MotionCurve {
  const spring = solveSpring(toSpring(description), {
    from,
    to,
    velocity,
  });
  const lo = Math.min(lower, upper);
  const hi = Math.max(lower, upper);
  const duration = Math.min(Math.max(spring.settleTime(0.05), 1 / 120), 3);
  return {
    duration,
    at: t => (t >= duration ? to : Math.min(Math.max(spring.value(t), lo), hi)),
    velocity: t => {
      if (t >= duration) {
        return 0;
      }
      const value = spring.value(t);
      return value <= lo || value >= hi ? 0 : spring.velocity(t);
    },
  };
}

/**
 * Where the browser draws an element's translate on one axis in this frame,
 * px: its computed style, which follows the running animation. Null when it
 * draws none.
 */
function drawnTranslate(element: HTMLElement, axis: 'x' | 'y'): number | null {
  const translate =
    element.ownerDocument.defaultView?.getComputedStyle(element).translate ??
    '';
  if (translate === '' || translate === 'none') {
    return null;
  }
  const [x = '0', y = '0'] = translate.split(' ');
  const px = parseFloat(axis === 'x' ? x : y);
  return Number.isFinite(px) ? px : null;
}

/** UISlider's touch tracking for one Slider (both thumbs of a range). */
export class SliderTouchController {
  private model: SliderTouchModel;
  private readonly getParts: () => SliderTouchParts | null;
  private readonly interactions = new Map<number, Interaction>();
  private readonly animators = new Map<HTMLElement, Animator>();
  /** The owner unmounted the slider: a cancel reports nothing then. */
  private disposed = false;
  /** Thumbs whose current touch is a mouse: Slider's own handlers take it. */
  private readonly mouseOwners = new Set<number>();
  /** The track's tap (see handleTrackTap). Null while detached. */
  private trackTap: TapGestureRecognizer | null = null;

  constructor(
    model: SliderTouchModel,
    getParts: () => SliderTouchParts | null,
  ) {
    this.model = model;
    this.getParts = getParts;
  }

  setModel(model: SliderTouchModel): void {
    this.model = model;
  }

  /**
   * Attaches the recognizers to the thumbs for every pointer. Under a
   * coarse primary pointer each thumb's `::before` is its touch target.
   */
  attach(): () => void {
    this.disposed = false;
    const parts = this.getParts();
    const targets = parts?.thumbs ?? [];
    if (parts == null || targets.length === 0) {
      return () => {};
    }
    // The coast plays a motion role: register the springs table, once.
    registerSpringsTable();
    const host = getGestureHost(parts.control.ownerDocument);
    const detachers: (() => void)[] = [];
    targets.forEach((hit, owner) => {
      const tracker = createPressTracker({
        getBounds: () =>
          this.getParts()?.control.getBoundingClientRect() ?? null,
        view: hit,
        highlightDelay: PRESS_PROFILES.control.highlightDelay,
        quickTapFlash: PRESS_PROFILES.control.quickTapFlash,
        onControlEvent: (event, touch) =>
          this.handleControlEvent(owner, event, touch.pointerType),
        onHighlightChange: isHighlighted =>
          this.handleHighlight(owner, isHighlighted),
        vetoesAncestorRecognizer: recognizer => this.vetoes(recognizer),
        isEnabled: () => !this.model.isDisabled,
      });
      const pan = new PanGestureRecognizer({
        name: `slider-thumb-${owner}`,
        direction: this.model.isHorizontal ? 'horizontal' : 'vertical',
        maximumNumberOfTouches: 1,
        cancelsTouchesInView: false,
        allowedPointerTypes: ['touch', 'pen'],
        // A held thumb does something, so a held finger never starts a text
        // selection or the callout on it. The gesture host takes this lock
        // for each held press and releases it on the lift.
        selectionLock: lockSelection,
      });
      // A mouse drag on a thumb is a pan too, claimed after the same
      // hysteresis but in any direction. A mouse has no page scroll to yield
      // to, so a drag that starts off the travel still moves the thumb.
      const mousePan = new PanGestureRecognizer({
        name: `slider-thumb-${owner}-mouse`,
        maximumNumberOfTouches: 1,
        cancelsTouchesInView: false,
        allowedPointerTypes: ['mouse'],
      });
      const removeListener = pan.addListener(current =>
        this.handlePan(owner, current),
      );
      const removeMouseListener = mousePan.addListener(current =>
        this.handlePan(owner, current),
      );
      detachers.push(
        host.attachConsumer(hit, tracker),
        host.attach(hit, pan),
        host.attach(hit, mousePan),
        removeListener,
        removeMouseListener,
        () => tracker.dispose(),
      );
    });
    // A tap on the track (or a mark) sets the value when it lifts. So a drag
    // is not the only pointer way to operate the slider (WCAG 2.2 SC 2.5.7).
    // UISlider ignores track taps. This departs from it.
    // A touch that moves past the tap's allowance, or that the page takes to
    // scroll, is no tap.
    const tap = new TapGestureRecognizer({
      name: 'slider-track-tap',
      allowedPointerTypes: ['touch', 'pen'],
      cancelsTouchesInView: false,
      // A touch that travels as far as a thumb's pan needs to begin is a
      // swipe, not a tap (UITapGestureRecognizer would allow 45 pt).
      allowableMovement: UIKIT_PAN.hysteresis.value,
      // A finger held on the track does nothing. So the tap takes no
      // selection lock: the control's own `user-select: none` already keeps
      // its text unselectable.
    });
    this.trackTap = tap;
    const removeTapListener = tap.addListener(current => {
      if (current.state === 'ended') {
        this.handleTrackTap(current);
      }
    });
    detachers.push(host.attach(parts.control, tap), removeTapListener, () => {
      this.trackTap = null;
    });
    // A layout can change the track's length mid-gesture, as when a value
    // label beside it takes a digit. The drawn parts follow before the next
    // paint, so nothing jumps at the hand-back.
    detachers.push(
      observeResize(parts.control, () => this.followTrackLength()),
    );
    return () => {
      // Interactions end first, so the cancel the recognizers send as they
      // detach finds nothing left to report.
      const ended = this.endSilently();
      for (const detach of detachers) {
        detach();
      }
      this.cancelLater(ended);
    };
  }

  /** Stops every interaction and animation without reporting (unmount). */
  dispose(): void {
    this.disposed = true;
    this.endSilently();
    for (const animator of this.animators.values()) {
      animator.dispose();
    }
    this.animators.clear();
  }

  /**
   * Ends every live interaction without a word to the owner, and returns
   * them. It runs from an Effect cleanup, where `onChange`, `onChangeEnd` and
   * a synchronous render have no place. A coast stops where it is drawn, and
   * the parts return to the stylesheet at the value the owner last rendered.
   */
  private endSilently(): ReadonlyArray<Interaction> {
    if (this.interactions.size === 0) {
      return [];
    }
    const ended = [...this.interactions.values()];
    const view = this.getParts()?.control.ownerDocument.defaultView;
    for (const interaction of this.interactions.values()) {
      const coast = interaction.coast;
      if (coast != null) {
        interaction.coast = null;
        view?.cancelAnimationFrame(coast.raf);
        for (const handle of coast.handles) {
          handle.stop();
        }
      }
      interaction.released = true;
    }
    this.interactions.clear();
    this.mouseOwners.clear();
    this.handBack();
    return ended;
  }

  /**
   * Ends the interactions a detach cancelled while the slider stays mounted,
   * as when it is disabled mid-drag. Each releases its pressed paint. If any
   * changed the value, `onChangeEnd` reports once. This waits until the
   * cleanup's task ends, and an unmount in the same commit drops it.
   */
  private cancelLater(ended: ReadonlyArray<Interaction>): void {
    if (ended.length === 0) {
      return;
    }
    queueMicrotask(() => {
      if (this.disposed) {
        return;
      }
      for (const interaction of ended) {
        this.model.commit(interaction.index, null);
      }
      if (ended.some(interaction => interaction.changed)) {
        this.model.reportEnd();
      }
    });
  }

  /**
   * After the owner rendered an ended interaction's final value, the thumb
   * and the fill go back to the positions Slider's CSS gives them. Parts that
   * a coast of another thumb still drives stay with it.
   */
  private handBack(): void {
    for (const [element, animator] of this.animators) {
      if (
        [...this.interactions.values()].some(
          interaction =>
            (interaction.coast != null || !interaction.released) &&
            this.partsOf(interaction).has(element),
        )
      ) {
        continue;
      }
      // Ends the animator's translate at identity, then removes the inline
      // property. So the class's progress-driven translate shows again.
      animator.set({x: 0, y: 0});
      element.style.removeProperty('translate');
      // A Reduced Motion cross-fade wrote the opacity: end it at 1 and hand it
      // back too (a caught fade stops part-way).
      if (element.style.getPropertyValue('opacity') !== '') {
        animator.set({opacity: 1});
        element.style.removeProperty('opacity');
      }
    }
  }

  // -- events ----------------------------------------------------------------

  private handleControlEvent(
    owner: number,
    event: ControlEvent,
    pointerType: PointerKind,
  ): void {
    if (event === 'touchDown') {
      // A mouse press holds the thumb too. Its highlight never lifts
      // the thumb (handleHighlight).
      const isMouse = pointerType === 'mouse';
      if (isMouse) {
        this.mouseOwners.add(owner);
      } else {
        this.mouseOwners.delete(owner);
      }
      this.begin(owner, isMouse, pointerType === 'touch');
      return;
    }
    const interaction = this.interactions.get(owner);
    if (interaction == null) {
      return;
    }
    switch (event) {
      case 'touchDragInside':
      case 'touchDragEnter':
        interaction.isInside = true;
        return;
      case 'touchDragOutside':
      case 'touchDragExit':
        interaction.isInside = false;
        return;
      case 'touchUpInside':
      case 'touchUpOutside':
        interaction.isInside = event === 'touchUpInside';
        // A press that never became a pan ends here (a tap or a hold).
        if (interaction.startValue == null) {
          this.finish(interaction, true);
        }
        return;
      case 'touchCancel':
        // The browser took the touch to scroll, or the press was cancelled
        // before the pan began. A begun pan reports its own cancel.
        if (interaction.startValue == null) {
          this.finish(interaction, false);
        }
        return;
      default:
        return;
    }
  }

  private handleHighlight(owner: number, isHighlighted: boolean): void {
    if (this.mouseOwners.has(owner)) {
      return;
    }
    const interaction = this.interactions.get(owner);
    const index = interaction?.index ?? owner;
    if (isHighlighted && interaction != null && !interaction.released) {
      this.lift(index);
    } else if (!isHighlighted && interaction == null) {
      this.drop(index);
    }
  }

  private handlePan(owner: number, pan: PanGestureRecognizer): void {
    const interaction = this.interactions.get(owner);
    if (interaction == null || interaction.released) {
      return;
    }
    switch (pan.state) {
      case 'began':
        interaction.startValue = interaction.value;
        {
          const total = pan.totalTranslation();
          const along = total[interaction.geometry.axis];
          const distance = Math.hypot(total.x, total.y);
          interaction.beganOffset = interaction.isMouse
            ? distance > 0
              ? (pan.hysteresis * along) / distance
              : 0
            : (along < 0 ? -1 : 1) * pan.hysteresis;
        }
        if (!interaction.isMouse) {
          this.lift(interaction.index);
        }
        this.track(interaction, pan);
        return;
      case 'changed':
        this.track(interaction, pan);
        return;
      case 'ended':
        interaction.released = true;
        this.release(interaction, pan);
        return;
      case 'cancelled':
        interaction.released = true;
        this.finish(interaction, true);
        return;
      case 'possible':
      case 'failed':
        return;
    }
  }

  /** UISlider's veto: an ancestor's pan or swipe along the travel. */
  private vetoes(recognizer: GestureRecognizer): boolean {
    // A touch on a thumb is the thumb's: a tap there changes nothing.
    if (recognizer === this.trackTap) {
      return true;
    }
    const horizontal = this.model.isHorizontal;
    // Told apart by kind, never by class: a screen-edge pan is a pan.
    if (recognizer.kind === 'swipe') {
      return (recognizer as SwipeGestureRecognizer).directions.some(
        direction =>
          horizontal
            ? direction === 'left' || direction === 'right'
            : direction === 'up' || direction === 'down',
      );
    }
    if (recognizer.kind === 'pan' || recognizer.kind === 'screenEdgePan') {
      const {x, y} = (recognizer as PanGestureRecognizer).translation();
      return horizontal
        ? Math.abs(x) >= Math.abs(y)
        : Math.abs(y) >= Math.abs(x);
    }
    return false;
  }

  // -- the interaction -------------------------------------------------------

  private begin(owner: number, isMouse = false, coasts = false): void {
    const parts = this.getParts();
    if (parts == null || this.model.isDisabled) {
      return;
    }
    // A finger on a coasting thumb stops it where it is: the coast ends on
    // that value, which the owner renders and onChangeEnd reports.
    for (const other of [...this.interactions.values()]) {
      if (other.coast != null) {
        this.finish(other, true, this.stopCoast(other));
      }
    }
    const geometry = this.measure(parts);
    const values = this.model.values();
    const value = values[owner] ?? this.model.min;
    this.interactions.set(owner, {
      owner,
      index: owner,
      geometry,
      startValue: null,
      beganOffset: 0,
      value,
      isInside: true,
      atEnd: this.endOf(value),
      changed: false,
      coast: null,
      released: false,
      isMouse,
      coasts,
      beganCoincident: this.model.isRange && values[0] === values[1],
    });
    this.model.press(owner);
  }

  private track(interaction: Interaction, pan: PanGestureRecognizer): void {
    const {geometry} = interaction;
    const {min, max, isRange} = this.model;
    // A collapsed track has no length to map the travel onto.
    if (geometry.length <= 0) {
      return;
    }
    // UISlider counts the translation from the threshold itself (the
    // touch-down point plus the hysteresis, taken along the axis). So the
    // travel of the event that crossed it already counts.
    const translation =
      (pan.totalTranslation()[geometry.axis] - interaction.beganOffset) *
      geometry.sign;
    const startValue = interaction.startValue ?? interaction.value;
    const raw =
      startValue +
      (translation / geometry.length) * (max - min) * UIKIT_SLIDER.trackingGain;
    // A drag that began on two range thumbs sharing a value: its first
    // movement, which crosses the threshold, picks the thumb that can follow
    // it. The thumb on top cannot pass the other. Coming back past the other
    // thumb's value hands the drag to that thumb, which moves on. A drag that
    // began apart stops at the other thumb.
    let from: ReadonlyArray<number> | undefined;
    if (isRange && interaction.beganCoincident && raw !== startValue) {
      const values = this.model.values();
      const current = interaction.index;
      const index =
        values[0] === values[1] && !interaction.changed
          ? raw < startValue
            ? 0
            : 1
          : current === 1 && raw < (values[0] ?? raw)
            ? 0
            : current === 0 && raw > (values[1] ?? raw)
              ? 1
              : current;
      if (index !== current) {
        // Passing back over the other thumb leaves this one against it,
        // however far the move went, and the other moves on: one change
        // reports both.
        if (interaction.changed) {
          const against = this.model.constrain(current, values[index] ?? raw);
          interaction.value = against;
          this.place(interaction);
          const next = [...values];
          next[current] = against;
          from = next;
        }
        this.drop(current);
        interaction.index = index;
        interaction.value = values[index] ?? interaction.value;
        if (!interaction.isMouse) {
          this.lift(index);
        }
        this.model.press(index);
      }
    }
    this.record(interaction, this.model.constrain(interaction.index, raw), {
      from,
    });
    this.place(interaction);
  }

  /**
   * Writes the moving thumb's and the fill's positions for the
   * interaction's value straight to their translates: one visual update per
   * move, with no component render. The parts go back to
   * the stylesheet when the interaction ends (`handBack`).
   */
  private place(interaction: Interaction): void {
    const {geometry} = interaction;
    const {min, max} = this.model;
    const range = max - min;
    const pxPerValue = range > 0 ? geometry.travel / range : 0;
    const px = (interaction.value - min) * pxPerValue;
    for (const {element, at} of this.partMaps(interaction)) {
      this.animatorFor(element).set({[geometry.axis]: geometry.sign * at(px)});
    }
  }

  /**
   * Records a new value and plays the end haptic on entering an end.
   * Reports it through `onChange` unless the interaction's end commits it.
   * Returns whether the value changed.
   */
  private record(
    interaction: Interaction,
    value: number,
    {
      commits = false,
      from,
    }: {commits?: boolean; from?: ReadonlyArray<number>} = {},
  ): boolean {
    if (value === interaction.value) {
      return false;
    }
    interaction.value = value;
    interaction.changed = true;
    if (!commits) {
      this.model.change(interaction.index, value, from);
    }
    const end = this.endOf(value);
    // UISlider's end haptic belongs to a finger's or a pen's drag and its
    // coast. A mouse and a track tap play none.
    if (
      end != null &&
      end !== interaction.atEnd &&
      !interaction.isMouse &&
      interaction.startValue != null
    ) {
      playHaptic(UIKIT_SLIDER.endHaptic);
    }
    interaction.atEnd = end;
    return true;
  }

  private report(interaction: Interaction, value: number): void {
    this.record(interaction, value);
  }

  private release(interaction: Interaction, pan: PanGestureRecognizer): void {
    // A mouse's or a pen's drag ends at its release, where the pointer lets
    // go: only a finger's release coasts. A pen's
    // thumb, lifted while held, drops back first.
    if (!interaction.coasts) {
      if (!interaction.isMouse) {
        this.drop(interaction.index);
      }
      this.model.press(null);
      this.finish(interaction, true);
      return;
    }
    const {geometry, index} = interaction;
    const {min, max} = this.model;
    const range = max - min;
    this.drop(index);
    this.model.press(null);
    const location = pan.location();
    const expansion = UIKIT_CONTROL.trackingExpansion.value;
    const inside =
      location.x >= geometry.rect.left - expansion &&
      location.x <= geometry.rect.right + expansion &&
      location.y >= geometry.rect.top - expansion &&
      location.y <= geometry.rect.bottom + expansion;
    interaction.isInside = inside;
    // Finger velocity along increasing value, px/s.
    const velocity = pan.velocity()[geometry.axis] * geometry.sign;
    const projected = inside
      ? UIKIT_SLIDER.releaseProjectionShare *
        projectDistance(velocity, UIKIT_SLIDER.releaseProjectionRate)
      : 0;
    const from = interaction.value;
    // Value per px of finger travel. A collapsed track maps none, so it
    // coasts nowhere.
    const valuePerPx =
      geometry.length > 0
        ? (range * UIKIT_SLIDER.trackingGain) / geometry.length
        : 0;
    const target = this.model.constrain(index, from + projected * valuePerPx);
    // In the thumb's px: the value's velocity mapped onto the travel.
    const pxPerValue = range > 0 ? geometry.travel / range : 0;
    const valueVelocity = velocity * valuePerPx;
    this.coastTo(interaction, target, valueVelocity * pxPerValue, true);
  }

  /**
   * A tap on the track: the thumb the tap's value picks springs there, on
   * the release spring from rest. It reports as a coast does, and
   * `onChangeEnd` follows. A tap on the thumb's own value changes nothing.
   */
  private handleTrackTap(tap: TapGestureRecognizer): void {
    const parts = this.getParts();
    if (parts == null || this.model.isDisabled || this.interactions.size > 0) {
      return;
    }
    const {x, y} = tap.location();
    const raw = this.model.valueAt(x, y);
    const index = this.model.thumbFor(raw);
    const target = this.model.constrain(index, raw);
    const value = this.model.values()[index] ?? this.model.min;
    if (target === value) {
      return;
    }
    const interaction: Interaction = {
      owner: index,
      index,
      geometry: this.measure(parts),
      startValue: null,
      beganOffset: 0,
      value,
      isInside: true,
      atEnd: this.endOf(value),
      changed: false,
      coast: null,
      released: true,
      isMouse: false,
      coasts: false,
      beganCoincident: false,
    };
    this.interactions.set(index, interaction);
    // A tap's value change happens in place. So under Reduce Motion it
    // applies at once, with no spring and no cross-fade.
    const thumb = parts.thumbs[index];
    if (thumb != null && this.animatorFor(thumb).reducedMotion() !== 'off') {
      this.finish(interaction, true, target);
      return;
    }
    this.coastTo(interaction, target, 0, false);
  }

  /**
   * Springs the interaction's thumb from its value to `target`, on the
   * compositor and clamped, starting at `velocityPx` (px/s along the
   * travel). `onChange` follows from the coast's fourth frame, and the
   * interaction ends (`onChangeEnd`) on its last. `touchRelease` means a
   * finger's release started it. Then the coast continues the throw and
   * keeps moving under Reduce Motion. A tap's spring never runs there
   * (`handleTrackTap` sets the value at once).
   */
  private coastTo(
    interaction: Interaction,
    target: number,
    velocityPx: number,
    touchRelease: boolean,
  ): void {
    const {geometry, index} = interaction;
    const {min, max} = this.model;
    const range = max - min;
    const pxPerValue = range > 0 ? geometry.travel / range : 0;
    const from = interaction.value;
    const fromPx = (from - min) * pxPerValue;
    const toPx = (target - min) * pxPerValue;
    const [lowerValue, upperValue] = this.model.bounds(index);
    const curve = sliderCoastCurve({
      from: fromPx,
      to: toPx,
      velocity: velocityPx,
      lower: (lowerValue - min) * pxPerValue,
      upper: (upperValue - min) * pxPerValue,
      // The coast plays the `springs.sliderRelease` role, resolved as it
      // starts.
      spring: resolveMotion(this.getParts()?.control, SLIDER_RELEASE_SPRING),
    });
    const moves =
      Math.abs(toPx - fromPx) >= MIN_COAST_PX ||
      Math.max(Math.abs(curve.at(0.05) - fromPx), 0) >= MIN_COAST_PX;
    if (!moves) {
      this.finish(interaction, true, target);
      return;
    }
    const at = performance.now();
    const handles = this.playCoast(interaction, curve, touchRelease, at);
    if (handles.length === 0) {
      this.finish(interaction, true, target);
      return;
    }
    const coast: Coast = {
      handles,
      target,
      frames: 0,
      raf: 0,
      curve,
      travel: geometry.travel,
      at,
      touchRelease,
    };
    interaction.coast = coast;
    const view = this.getParts()?.control.ownerDocument.defaultView;
    const step = () => {
      if (interaction.coast !== coast) {
        return;
      }
      coast.frames += 1;
      if (coast.frames > HAND_OFF_FRAMES) {
        const {axis, travel} = interaction.geometry;
        const px = Math.abs(coast.handles[0]?.value(axis) ?? 0);
        const value =
          range > 0 && travel > 0
            ? min + (px / travel) * range
            : interaction.value;
        this.report(interaction, this.model.constrain(index, value));
      }
      coast.raf = view?.requestAnimationFrame(step) ?? 0;
    };
    coast.raf = view?.requestAnimationFrame(step) ?? 0;
    this.endCoastWithThumb(interaction, coast);
  }

  /** Ends the coast when its thumb's motion finishes, not when it stops. */
  private endCoastWithThumb(interaction: Interaction, coast: Coast): void {
    const thumbHandle = coast.handles[0];
    void thumbHandle?.finished.then(finished => {
      if (
        interaction.coast !== coast ||
        coast.handles[0] !== thumbHandle ||
        !finished
      ) {
        return;
      }
      this.getParts()?.control.ownerDocument.defaultView?.cancelAnimationFrame(
        coast.raf,
      );
      interaction.coast = null;
      this.finish(interaction, true, coast.target);
    });
  }

  /**
   * After the track's length changed: every live interaction measures it
   * again. A drag writes its parts for the new length, and a coast plays
   * on from where its curve is now, scaled to the new travel.
   */
  private followTrackLength(): void {
    const parts = this.getParts();
    if (parts == null || this.interactions.size === 0) {
      return;
    }
    for (const interaction of this.interactions.values()) {
      const geometry = this.measure(parts);
      if (geometry.length === interaction.geometry.length) {
        continue;
      }
      interaction.geometry = geometry;
      const {coast} = interaction;
      if (coast != null) {
        const scale = coast.travel > 0 ? geometry.travel / coast.travel : 1;
        const {curve} = coast;
        coast.curve = {
          duration: curve.duration,
          at: t => curve.at(t) * scale,
          velocity: t => curve.velocity(t) * scale,
        };
        coast.travel = geometry.travel;
        coast.handles = this.playCoast(
          interaction,
          coast.curve,
          coast.touchRelease,
          coast.at,
        );
        this.endCoastWithThumb(interaction, coast);
      } else if (!interaction.released) {
        this.place(interaction);
      }
    }
  }

  /**
   * Plays the coast on the thumb and the fill parts, on one clock that
   * started at `at`. A re-mapped coast plays on from where its curve is.
   */
  private playCoast(
    interaction: Interaction,
    curve: MotionCurve,
    touchRelease: boolean,
    at: number,
  ): MotionHandle[] {
    const {axis, sign} = interaction.geometry;
    const handles: MotionHandle[] = [];
    for (const {element, at: position, slope} of this.partMaps(interaction)) {
      const partCurve: MotionCurve = {
        duration: curve.duration,
        at: t => sign * position(curve.at(t)),
        velocity: t => sign * slope * curve.velocity(t),
      };
      const animator = this.animatorFor(element);
      animator.set({[axis]: partCurve.at(0)});
      // A release's coast continues the throw: momentum, which keeps moving
      // under Reduce Motion. A tap's spring is a
      // transition.
      handles.push(
        touchRelease
          ? animator.decay({[axis]: partCurve}, {at, touchRelease})
          : animator.play({[axis]: partCurve}, {at}),
      );
    }
    return handles;
  }

  /**
   * The parts that move with the interaction's thumb. Each has its translate
   * as a function of the thumb's px along the travel (`p`), and that
   * function's slope. The formulas are the same as Slider's CSS.
   */
  private partMaps(interaction: Interaction): {
    element: HTMLElement;
    at: (p: number) => number;
    slope: number;
  }[] {
    const parts = this.getParts();
    if (parts == null) {
      return [];
    }
    const {geometry, index} = interaction;
    const {length, travel} = geometry;
    const inset = this.model.thumbSize / 2;
    const values = this.model.values();
    const {min, max, isRange} = this.model;
    const range = max - min;
    const pxPerValue = range > 0 ? travel / range : 0;
    const otherPx = ((values[index === 0 ? 1 : 0] ?? min) - min) * pxPerValue;
    const maps: {
      element: HTMLElement;
      at: (p: number) => number;
      slope: number;
    }[] = [];
    const add = (
      element: HTMLElement | null | undefined,
      at: (p: number) => number,
      slope: number,
    ) => {
      if (element != null) {
        maps.push({element, at, slope});
      }
    };
    add(parts.thumbs[index], p => p, 1);
    if (isRange) {
      if (index === 0) {
        add(parts.fillMover, p => inset + p, 1);
        add(parts.fill, p => otherPx - p - length, -1);
      } else {
        add(parts.fill, p => p - otherPx - length, 1);
      }
    } else {
      add(parts.fill, p => inset + p - length, 1);
    }
    return maps;
  }

  /**
   * Stops a coast where the browser draws the thumb in this frame. Returns
   * the value there for `finish` to end on, or null when the travel has no
   * length. The animator's own reading can run a frame ahead of or behind
   * what is drawn, and a finger stops what it sees.
   */
  private stopCoast(interaction: Interaction): number | null {
    const coast = interaction.coast;
    if (coast == null) {
      return null;
    }
    interaction.coast = null;
    this.getParts()?.control.ownerDocument.defaultView?.cancelAnimationFrame(
      coast.raf,
    );
    const {geometry, index} = interaction;
    const {min, max} = this.model;
    const thumb = this.getParts()?.thumbs[index];
    const drawn = thumb == null ? null : drawnTranslate(thumb, geometry.axis);
    const px = Math.abs(drawn ?? coast.handles[0]?.value(geometry.axis) ?? 0);
    for (const handle of coast.handles) {
      handle.stop();
    }
    const range = max - min;
    return range > 0 && geometry.travel > 0
      ? this.model.constrain(index, min + (px / geometry.travel) * range)
      : null;
  }

  /**
   * Ends an interaction from the handler that ends it: the lift, the cancel
   * or the coast's last frame. The owner renders the last value at once, and
   * the parts return to the stylesheet. `onChangeEnd` then reports what the
   * owner rendered, unless the browser took the touch before any drag
   * (`report` false).
   */
  private finish(
    interaction: Interaction,
    report: boolean,
    finalValue: number | null = null,
  ): void {
    if (this.interactions.get(interaction.owner) !== interaction) {
      return;
    }
    this.interactions.delete(interaction.owner);
    if (!interaction.released) {
      this.drop(interaction.index);
    }
    interaction.released = true;
    if (finalValue != null) {
      this.record(interaction, finalValue, {commits: true});
    }
    // The owner renders the final value from this handler even when a
    // frame's report already carried it: these handlers run outside React's
    // events. So that report's render can still be pending, and onChangeEnd
    // reads what the owner rendered.
    this.model.commit(interaction.index, finalValue);
    this.handBack();
    if (report) {
      this.model.reportEnd();
    }
  }

  // -- the thumb's lift --------------------------------------------------------

  private lift(index: number): void {
    const thumb = this.getParts()?.thumbs[index];
    if (thumb == null) {
      return;
    }
    const animator = this.animatorFor(thumb);
    // The lift is feedback with no fade of its own. Under Reduce Motion the
    // press shows in the pressed paint alone, and a change of state never
    // scales.
    if (animator.reducedMotion() !== 'off') {
      return;
    }
    animator.animate(
      {scale: UIKIT_SLIDER.liftScale},
      {spring: resolveMotion(this.getParts()?.control, SLIDER_LIFT_SPRING)},
    );
  }

  private drop(index: number): void {
    const thumb = this.getParts()?.thumbs[index];
    if (thumb == null) {
      return;
    }
    const animator = this.animators.get(thumb);
    if (animator == null || animator.get('scale') === 1) {
      return;
    }
    animator.animate(
      {scale: 1},
      {spring: resolveMotion(this.getParts()?.control, SLIDER_DROP_SPRING)},
    );
  }

  // -- helpers -----------------------------------------------------------------

  private measure(parts: SliderTouchParts): Geometry {
    const {control} = parts;
    const horizontal = this.model.isHorizontal;
    // The layout size (unrounded, untransformed): the size the CSS's
    // container units resolve against.
    const style = control.ownerDocument.defaultView?.getComputedStyle(control);
    const rect = control.getBoundingClientRect();
    const used = (horizontal ? style?.width : style?.height) ?? '';
    const length = used.endsWith('px')
      ? parseFloat(used)
      : horizontal
        ? rect.width
        : rect.height;
    return {
      length,
      travel: Math.max(0, length - this.model.thumbSize),
      axis: horizontal ? 'x' : 'y',
      sign: horizontal ? (isRtlElement(control) ? -1 : 1) : -1,
      rect,
    };
  }

  private endOf(value: number): 'min' | 'max' | null {
    if (value <= this.model.min) {
      return 'min';
    }
    if (value >= this.model.max) {
      return 'max';
    }
    return null;
  }

  private animatorFor(element: HTMLElement): Animator {
    let animator = this.animators.get(element);
    if (animator == null) {
      animator = createMotionAnimator(element);
      this.animators.set(element, animator);
    }
    return animator;
  }

  private partsOf(interaction: Interaction): Set<HTMLElement> {
    const parts = this.getParts();
    const set = new Set<HTMLElement>();
    if (parts == null) {
      return set;
    }
    const thumb = parts.thumbs[interaction.index];
    for (const element of [thumb, parts.fillMover, parts.fill]) {
      if (element != null) {
        set.add(element);
      }
    }
    return set;
  }
}
