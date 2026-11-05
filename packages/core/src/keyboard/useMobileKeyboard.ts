// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMobileKeyboard.ts
 * @input A target element and its scroll area, the keyboard module's reports
 *   and focus claim, and the layout guide
 * @output useMobileKeyboard, which keeps a focused field in the target above
 *   the on-screen keyboard and returns the inset and a dismiss
 * @position Keyboard module, internal to core. BottomSheet passes its panel.
 *
 * SYNC: When modified, update /packages/core/src/keyboard/README.md
 */

import {useCallback, useEffect, useRef, useState, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {useAttachment} from '../hooks/useAttachment';
import {useMediaQuery} from '../hooks/useMediaQuery';
import {animatorFor, type Animator} from '../motion/animator';
import {subscribeInput} from '../utils/inputStream';
import {layoutViewportHeight} from '../utils/layoutViewport';
import {observeResize} from '../utils/sharedResizeObserver';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import {
  KEYBOARD_EPSILON,
  findTextEntryControl,
  getKeyboardHeight,
  isKeyboardMeasurable,
  isNodeTarget,
  isTextEntryControl,
  refuseFocusReveal,
  subscribeKeyboardHeight,
  watchRevealPan,
} from './keyboardHeight';
import {getKeyboardLayoutGuide, keyboardProfileOf} from './keyboardLayoutGuide';
import type {KeyboardTransition} from './keyboardModel';
import {rideKeyboard} from './rideKeyboard';

// Chrome on Android pans the page itself if the keyboard still covers the
// focused field about 100 to 170 ms after the report. A field a fraction of a
// pixel under the keyboard's top still counts as covered. So the reveal sets
// the field 4 px above that top in the report's own commit, and only the rest
// rides.
const FIELD_CLEARANCE_AT_REPORT = 4;

/** How a target keeps a focused field above the on-screen keyboard. */
export interface MobileKeyboardOptions {
  /**
   * How the target moves the field: `'ride'` reveals it with the scroller
   * and rides the scroller's content on the keyboard's slide.
   */
  move: 'ride';
  /**
   * Reserves the keyboard's inset at the end of the target's scroll area,
   * the first element inside it that `useScrollableArea` marks with
   * `data-scroll-axis`.
   */
  inset?: boolean;
  /** The gap kept between the focused field and the keyboard, CSS px. */
  offset: number;
  /** Whether the target follows the keyboard at all. */
  isEnabled: boolean;
  /** Whether the target is at its full height, where it reveals fields. */
  isExpanded: boolean;
  /** Whether the target is open. Focus that leaves for nothing parks on it. */
  isOpen: boolean;
  /** Whether the page's own scroll is locked under the target. */
  isPageScrollLocked: boolean;
}

/** What useMobileKeyboard returns. */
export interface MobileKeyboard {
  /** The inset the target lays out at its scroller's content end, CSS px. */
  readonly inset: number;
  /**
   * Dismisses the keyboard, keeping the inset while the keyboard goes. The
   * focused field blurs, or `focusTarget` takes focus.
   */
  readonly dismiss: (focusTarget?: HTMLElement) => void;
}

interface KeyboardGeometry {
  bodyBottom: number;
}

function getObstructionTop(): number {
  return layoutViewportHeight(window) - getKeyboardHeight(window);
}

// Windows whose browser revealed a focused field itself right after the
// keyboard's report, by panning the visual viewport to it. Firefox for
// Android does so 54 to 143 ms after the report while the field is under the
// keyboard. The module learns this from the behavior, never from the user
// agent.
// From then on, a sheet there reveals its field at once, in the report's own
// frame.
let revealsAtReport = new WeakSet<Window>();

/** Forgets every window's recorded reveal, for tests. */
export function __resetRevealsAtReportForTest(): void {
  revealsAtReport = new WeakSet<Window>();
}

// How far the body runs under the keyboard's top, CSS px. The keyboard's top
// comes from `innerHeight`, a whole number of CSS px, but the visual viewport
// and element rects are fractional. On the Android emulator, Chrome's visual
// viewport is 754.3 px over a 754 px layout viewport. A sheet sized to it
// then ends 0.3 px below `innerHeight` with no keyboard up. So an overlap
// under one CSS px is `innerHeight`'s precision, not an obstruction.
function overlapOf(bodyBottom: number, obstructionTop: number): number {
  const overlap = bodyBottom - obstructionTop;
  return overlap > KEYBOARD_EPSILON ? overlap : 0;
}

// Under half a pixel is rounding, not a keyboard.
function isVisualViewportRecovered(): boolean {
  return getKeyboardHeight(window) <= 0.5;
}

/**
 * Keeps a focused field in `targetRef`'s element above the on-screen
 * keyboard (see README.md). A sheet passes its panel, and the hook reserves
 * the inset in the panel's scroll area. Returns the inset the keyboard takes
 * at the end of that area's content, CSS px, or 0 without a keyboard, and a
 * dismiss.
 *
 * @example
 * ```
 * const keyboard = useMobileKeyboard(panelRef, {move: 'ride', inset: true, offset: 48, isEnabled, isExpanded, isOpen, isPageScrollLocked});
 * ```
 */
export function useMobileKeyboard(
  targetRef: RefObject<HTMLElement | null>,
  {
    inset: reservesInset = false,
    offset,
    isEnabled,
    isExpanded,
    isOpen,
    isPageScrollLocked,
  }: MobileKeyboardOptions,
): MobileKeyboard {
  // The inset the keyboard takes at the end of the body's content, CSS px.
  // The target lays it out after its content box's children, through a
  // functional style.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const hasKeyboardLayoutRef = useRef(false);
  const retainKeyboardLayoutRef = useRef(false);
  const isEnabledRef = useRef(isEnabled);
  const isExpandedRef = useRef(isExpanded);
  const isOpenRef = useRef(isOpen);
  isEnabledRef.current = isEnabled;
  isExpandedRef.current = isExpanded;
  isOpenRef.current = isOpen;
  // Touch-only work, the ride and the reveal-pan watch, attaches only under a
  // coarse primary pointer (the touch query). Under a fine one, the hook
  // registers no touch listener.
  const isTouch = useMediaQuery(TOUCH_QUERY, false);

  const dismiss = useCallback(
    (focusTarget?: HTMLElement) => {
      const target = targetRef.current;
      const activeElement = document.activeElement;
      if (
        !isEnabledRef.current ||
        target == null ||
        !(activeElement instanceof HTMLElement) ||
        activeElement === target ||
        !target.contains(activeElement)
      ) {
        return;
      }
      // Keep the current keyboard scroll range while the keyboard goes.
      // Viewport resize events unwind that layout as the visual viewport
      // recovers, avoiding a content jump on the first drag frame.
      retainKeyboardLayoutRef.current = hasKeyboardLayoutRef.current;
      if (focusTarget == null) {
        activeElement.blur();
      } else {
        focusTarget.focus({preventScroll: true});
      }
    },
    [targetRef],
  );

  // Syncs the on-screen keyboard with closing: a target that closes blurs its
  // focused field, which dismisses the keyboard.
  useEffect(() => {
    if (isEnabled && !isOpen) {
      dismiss();
    }
  }, [dismiss, isEnabled, isOpen]);

  useAttachment(
    targetRef,
    sheet => {
      const body = sheet.querySelector<HTMLElement>('[data-scroll-axis]');
      if (!isEnabled || !reservesInset || body == null) {
        return () => {};
      }

      let keyboardGeometry: KeyboardGeometry | null = null;
      // Where a smooth reveal under way is taking the body's scrollTop.
      let smoothTarget: number | null = null;
      // The inset laid out at the end of the body's content, CSS px, and the
      // scroll range it adds there. The inset's drop takes that range back. The
      // two can differ: Chrome 124 added 344 px of range for a 360 px inset.
      let laidOutInset = 0;
      let insetRange = 0;
      // Where the keyboard layout guide publishes the keyboard's own slide, as
      // Gboard's in Chrome on Android, the sheet's content rides it. This needs
      // a coarse primary pointer and Chrome's schedule. Under a fine pointer
      // nothing of the ride attaches. In a browser without the VirtualKeyboard
      // API, such as iOS Safari or Firefox for Android, the guide never starts.
      // There the inset follows the reports. The hook subscribes to the guide
      // before the keyboard module below, so the guide publishes a report's
      // transition before the reveal reads it.
      const guide =
        isTouch && keyboardProfileOf(window) === 'chromium'
          ? getKeyboardLayoutGuide(window)
          : null;
      const contentAnimator = (): Animator | null => {
        const content = body.firstElementChild;
        return guide != null && content instanceof HTMLElement
          ? animatorFor(content)
          : null;
      };
      // How far a ride has moved the content from where its layout puts it, as
      // the page draws it now. The reveal reads a control's rect in the same
      // frame.
      const rideOffset = () => {
        const content = body.firstElementChild;
        if (!(content instanceof HTMLElement)) {
          return 0;
        }
        const translate = getComputedStyle(content).translate;
        return parseFloat(translate.split(' ')[1] ?? '') || 0;
      };
      // The keyboard's show the guide plays on its slide right now, if any. At
      // a report, a show whose slide has ended counts too. A busy page can read
      // the report that late, and the ride then lands at once.
      const showOnSlide = (atReport: boolean): KeyboardTransition | null => {
        const transition = guide?.transition;
        return transition != null &&
          transition.kind === 'show' &&
          transition.animated &&
          transition.curve != null &&
          (atReport ||
            performance.now() < transition.start + transition.curve.durationMs)
          ? transition
          : null;
      };
      // A hide the hook holds the inset through (see holdInsetThrough).
      let heldHide: {readonly release: () => void} | null = null;
      let documentScrollAtKeyboard: {x: number; y: number} | null = null;
      // The keyboard's top and the body's scroll when the keyboard came up. A
      // keyboard that closes puts the body back at that scroll.
      let keyboardObstructionTop: number | null = null;
      let bodyScrollTopAtKeyboard: number | null = null;
      // The hook takes focus moves over where this window measures the
      // keyboard, never by user agent, and only under a coarse primary pointer.
      // Under a fine one, it registers no touch-only listener.
      // Desktop Safari and Firefox measure too, but show no on-screen keyboard
      // and keep the browser's own focus. The effect runs again when the
      // pointer changes, so a tablet that docks a mouse drops the claim.
      const ownsFocusTransitions = isTouch && isKeyboardMeasurable(window);

      // Lays the inset out before anything measures or scrolls the body: the
      // reveal scrolls into the inset it adds in the same frame.
      const writeInset = (inset: number) => {
        const changes = inset !== laidOutInset;
        const rangeBefore = changes ? body.scrollHeight : 0;
        laidOutInset = inset;
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the reveal scrolls into this inset in the same frame, so it must be laid out before the reveal measures
        flushSync(() => setKeyboardInset(inset));
        if (changes) {
          insetRange =
            inset === 0
              ? 0
              : Math.max(0, insetRange + body.scrollHeight - rangeBefore);
        }
      };

      const clearKeyboardLayout = () => {
        writeInset(0);
        if (bodyScrollTopAtKeyboard != null) {
          smoothTarget = null;
          body.scrollTop = bodyScrollTopAtKeyboard;
        }
        keyboardGeometry = null;
        keyboardObstructionTop = null;
        bodyScrollTopAtKeyboard = null;
        documentScrollAtKeyboard = null;
        hasKeyboardLayoutRef.current = false;
        retainKeyboardLayoutRef.current = false;
      };

      // `within` is how far below its resting place the control can sit and
      // still clear the keyboard.
      const scrollBodyBy = (
        distance: number,
        smoothly: boolean,
        ride: KeyboardTransition | null = null,
        within: number | null = null,
      ) => {
        smoothTarget = null;
        const animator = ride == null ? null : contentAnimator();
        if (ride != null && animator != null) {
          // The body lands at once, and its content rides the keyboard's slide
          // up from the slide's start. The content starts no lower than
          // `within`, so the control clears the keyboard in this commit. Content
          // that joins the slide late is where the keyboard is (rideKeyboard). A
          // further scroll during the slide adds to the same ride.
          const before = body.scrollTop;
          body.scrollTop = before + distance;
          const moved = body.scrollTop - before;
          // Only what the body actually scrolled rides. A remainder under the
          // scroll position's precision moves nothing, so the ride under way
          // stays on its curve.
          if (moved !== 0) {
            const from = animator.get('y', ride.start) + moved;
            animator.set({y: within == null ? from : Math.min(from, within)});
            rideKeyboard(animator, {y: 0}, ride, {entrance: within != null});
          }
          return;
        }
        if (typeof body.scrollBy !== 'function') {
          body.scrollTop += distance;
          return;
        }
        // Reduce Motion applies on any pointer.
        const reduceMotion =
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior = smoothly && !reduceMotion ? 'smooth' : 'instant';
        if (behavior === 'smooth') {
          smoothTarget = body.scrollTop + distance;
        }
        body.scrollBy({
          top: distance,
          // Not 'auto', which defers to the element's computed
          // `scroll-behavior`. A consumer's `scroll-behavior: smooth` would then
          // animate a scroll this hook needs to land in the same frame.
          behavior,
        });
      };

      // The distance a smooth reveal under way has still to scroll, as far as
      // the body can scroll. It is 0 once it has landed, or with none under way.
      const smoothDistanceLeft = () => {
        if (smoothTarget == null) {
          return 0;
        }
        const maxScroll = Math.max(
          body.scrollTop,
          body.scrollHeight - body.clientHeight,
        );
        const target = Math.min(smoothTarget, maxScroll);
        const left = target - body.scrollTop;
        return Math.abs(left) < 1 ? 0 : left;
      };

      // Scroll `control` into the part of the body the keyboard leaves visible,
      // reading live geometry each time.
      const scrollControlIntoSafeArea = (
        control: HTMLElement,
        smoothly: boolean,
        ride: KeyboardTransition | null = null,
      ) => {
        const measuredBodyRect = body.getBoundingClientRect();
        const measuredControlRect = control.getBoundingClientRect();
        const obstructionTop = getObstructionTop();
        // Under a pixel of overhang is `innerHeight`'s precision, not a
        // keyboard: no suggestion clearance then (overlapOf).
        const overlap = overlapOf(measuredBodyRect.bottom, obstructionTop);
        const clearance = overlap > 0 ? offset : 0;
        const safeTop = measuredBodyRect.top;
        const safeBottom = Math.min(
          measuredBodyRect.bottom,
          obstructionTop - clearance,
        );
        if (safeBottom <= safeTop) {
          return;
        }

        // Where the control will be once a smooth reveal under way lands. If
        // that lands the control, a second scroll would overshoot in Firefox.
        // Firefox keeps adding a smooth scrollBy's distance after another
        // scroll. A ride's translate is not where the layout puts the control
        // either.
        const pending = smoothDistanceLeft() + rideOffset();
        const controlBottom = measuredControlRect.bottom - pending;
        const controlTop = measuredControlRect.top - pending;
        if (controlBottom > safeBottom) {
          scrollBodyBy(
            controlBottom - safeBottom,
            smoothly,
            ride,
            Math.max(
              0,
              obstructionTop - safeBottom - FIELD_CLEARANCE_AT_REPORT,
            ),
          );
        } else if (controlTop < safeTop) {
          scrollBodyBy(controlTop - safeTop, smoothly, ride);
        }
      };

      const applyKeyboardGeometry = (geometry: KeyboardGeometry) => {
        const obstructionTop = getObstructionTop();
        // A collapsed detent can extend the body below the layout viewport even
        // after the keyboard closes, so body overlap alone cannot identify
        // recovery. Once the visual viewport is full height again, release the
        // retained keyboard layout unconditionally.
        if (isVisualViewportRecovered()) {
          clearKeyboardLayout();
          return;
        }
        const overlap = overlapOf(geometry.bodyBottom, obstructionTop);
        if (overlap === 0) {
          clearKeyboardLayout();
          return;
        }

        const inset = Math.max(
          0,
          geometry.bodyBottom - (obstructionTop - offset),
        );
        writeInset(inset);
      };

      // Take every focus move into a field over before the browser performs it
      // (refuseFocusReveal). That handler does not reveal the field. Focusing
      // it raises focusin, and the viewport report that follows the keyboard
      // raises another. Both schedule the reveal below, which knows the safe
      // area and scrolls only the sheet's own body.
      //
      // The keyboard's Done button parks focus on the body. The handler parks
      // focus that leaves for nothing on the sheet instead. Then a second tap on
      // the same field is still a move the handler sees. Left on the body, the field
      // is already `document.activeElement` on the next tap. Then no blur fires,
      // and the browser reveals the field its own way. This applies only while
      // the sheet is open. Closing blurs the field too, and no next tap needs a
      // claim. The host restores focus to whatever opened the sheet.
      const claimFocusTransitions = () =>
        refuseFocusReveal(document, {
          isActive: () => isExpandedRef.current,
          claim: destination => findTextEntryControl(destination, body),
          park: origin => {
            if (isOpenRef.current && findTextEntryControl(origin, body)) {
              sheet.focus({preventScroll: true});
            }
          },
        });

      const revealFocusedControl = (atReport = false) => {
        // Through a hide the sheet rides, its layout holds until the end.
        if (heldHide != null) {
          return;
        }
        const obstructionTop = getObstructionTop();
        const activeElement = document.activeElement;
        const focusedControl =
          activeElement instanceof HTMLElement &&
          body.contains(activeElement) &&
          isTextEntryControl(activeElement)
            ? activeElement
            : null;
        // The keyboard can close while its field keeps focus, as a downward
        // dismissal does on iOS. The full clear puts back the inset and the
        // body's scroll. The hook then reveals the field still focused in the
        // restored body, because it may not be the field that opened the
        // keyboard.
        if (hasKeyboardLayoutRef.current && isVisualViewportRecovered()) {
          clearKeyboardLayout();
          if (isExpandedRef.current && focusedControl != null) {
            scrollControlIntoSafeArea(focusedControl, false);
          }
          return;
        }
        if (!isExpandedRef.current || focusedControl == null) {
          if (retainKeyboardLayoutRef.current && keyboardGeometry) {
            applyKeyboardGeometry(keyboardGeometry);
            return;
          }
          clearKeyboardLayout();
          return;
        }

        // An iOS keyboard dismissed by a drag can leave its accessory bar, so
        // the visual viewport grows short of full height. The body goes back
        // to its scroll from before the keyboard as soon as that starts. The
        // reveal below still clears what covers a low field. The new top is
        // kept, so a later content change does not repeat this.
        if (
          hasKeyboardLayoutRef.current &&
          keyboardObstructionTop != null &&
          obstructionTop > keyboardObstructionTop + 0.5 &&
          bodyScrollTopAtKeyboard != null
        ) {
          smoothTarget = null;
          body.scrollTop = bodyScrollTopAtKeyboard;
          keyboardObstructionTop = obstructionTop;
        }

        retainKeyboardLayoutRef.current = false;

        const measuredBodyRect = body.getBoundingClientRect();
        const overlap = overlapOf(measuredBodyRect.bottom, obstructionTop);
        // The extra clearance leaves space for mobile suggestion UI, but only
        // while the visual viewport actually overlaps the sheet. With no
        // obstruction, ordinary desktop and hardware-keyboard focus must not
        // shift an already visible control.
        const clearance = overlap > 0 ? offset : 0;
        keyboardGeometry =
          overlap > 0
            ? {
                bodyBottom: measuredBodyRect.bottom,
              }
            : null;
        // Where the document sits with the keyboard up and nothing yet shifted:
        // the position handleDocumentScroll returns to. Captured on the
        // transition only — a reveal that runs after the browser has already
        // scrolled would otherwise record the shifted position as correct.
        if (overlap > 0 && !hasKeyboardLayoutRef.current) {
          keyboardObstructionTop = obstructionTop;
          bodyScrollTopAtKeyboard = body.scrollTop;
          if (isPageScrollLocked) {
            documentScrollAtKeyboard = {x: window.scrollX, y: window.scrollY};
          }
        }
        hasKeyboardLayoutRef.current = overlap > 0;

        const inset =
          overlap > 0
            ? Math.max(
                0,
                measuredBodyRect.bottom - (obstructionTop - clearance),
              )
            : 0;
        writeInset(inset);

        scrollControlIntoSafeArea(
          focusedControl,
          overlap > 0 && !revealsAtReport.has(window),
          overlap > 0 ? showOnSlide(atReport) : null,
        );
      };

      // Where the body's scroll rests once the keyboard is gone, as
      // revealFocusedControl leaves it. The clear puts back the scroll from
      // before the keyboard, within the range left once the inset drops. The
      // reveal then brings a field that keeps focus into the body's view.
      const restingScrollTop = (): number => {
        const scrollTop = body.scrollTop;
        const maxAtRest = Math.max(
          0,
          body.scrollHeight - insetRange - body.clientHeight,
        );
        let resting = Math.min(maxAtRest, bodyScrollTopAtKeyboard ?? scrollTop);
        const active = document.activeElement;
        if (
          isExpandedRef.current &&
          active instanceof HTMLElement &&
          body.contains(active) &&
          isTextEntryControl(active)
        ) {
          const bodyRect = body.getBoundingClientRect();
          const rect = active.getBoundingClientRect();
          // Where the layout puts the control at the resting scroll.
          const shift = scrollTop - resting - rideOffset();
          if (rect.bottom + shift > bodyRect.bottom) {
            resting += rect.bottom + shift - bodyRect.bottom;
          } else if (rect.top + shift < bodyRect.top) {
            resting += rect.top + shift - bodyRect.top;
          }
          resting = Math.min(maxAtRest, Math.max(0, resting));
        }
        return resting;
      };

      // Through a hide on the keyboard's slide, the inset stays, so nothing
      // drops while the keyboard still covers the sheet's bottom. The content
      // rides down on the hide's curve by the scroll the body drops at rest. At
      // rest, the inset drops, the scroll goes back, and the translate clears in
      // one commit.
      const holdInsetThrough = (transition: KeyboardTransition) => {
        heldHide?.release();
        const animator = contentAnimator();
        const drop = body.scrollTop - restingScrollTop();
        const handle =
          animator != null && drop !== 0
            ? rideKeyboard(animator, {y: drop}, transition)
            : null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const hold = {
          release: () => {
            clearTimeout(timer);
            if (heldHide === hold) {
              heldHide = null;
            }
          },
        };
        heldHide = hold;
        const commit = () => {
          if (heldHide !== hold) {
            return;
          }
          heldHide = null;
          revealFocusedControl();
          animator?.set({y: 0});
        };
        if (handle == null) {
          const end = transition.start + (transition.curve?.durationMs ?? 0);
          timer = setTimeout(commit, Math.max(0, end - performance.now()));
        } else {
          void handle.finished.then(commit);
        }
      };
      const unsubscribeGuide = guide?.subscribe(transition => {
        // A jump lands with the reports: only a slide rides.
        if (transition.curve == null) {
          return;
        }
        if (transition.kind === 'hide') {
          if (hasKeyboardLayoutRef.current && transition.animated) {
            holdInsetThrough(transition);
          }
          return;
        }
        if (heldHide != null) {
          // The keyboard comes back before it is down (focus returns): the
          // inset never left, so the content rides back to its place with it.
          heldHide.release();
          const animator = contentAnimator();
          if (animator != null) {
            rideKeyboard(animator, {y: 0}, transition);
          }
        }
      });

      let animationFrame = 0;
      const scheduleReveal = () => {
        cancelAnimationFrame(animationFrame);
        animationFrame = requestAnimationFrame(() => revealFocusedControl());
      };

      // Resuming the app re-reveals the focused field with no focus event to
      // claim. The reveal above never runs, and the document scrolls with the
      // fixed sheet. Put that scroll back on the event that reports it, and
      // reveal again inside the sheet.
      //
      // This applies only while the page is locked. Only then can a document
      // scroll not be the user's own. Behind a non-modal sheet the page stays
      // scrollable, and a revert there would fight the user.
      const handleDocumentScroll = () => {
        const expected = documentScrollAtKeyboard;
        if (
          expected == null ||
          (window.scrollX === expected.x && window.scrollY === expected.y)
        ) {
          return;
        }
        window.scrollTo(expected.x, expected.y);
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          body.contains(activeElement) &&
          isTextEntryControl(activeElement)
        ) {
          scrollControlIntoSafeArea(activeElement, false);
        }
      };

      let stopObserving: (() => void)[] = [];
      const refreshObservedLayout = () => {
        if (typeof ResizeObserver === 'undefined') {
          return;
        }
        for (const stop of stopObserving) {
          stop();
        }
        stopObserving = [];

        // Body and sheet box changes include public height and xstyle updates.
        // The inset pseudo-element is the content box's last box. Where the
        // content grows with it, the observation runs the reveal again. The
        // reveal computes the same inset from the body's unchanged box, so
        // nothing feeds back into the sheet's geometry.
        const targets = new Set<Element>([body, sheet]);
        for (const child of body.children) {
          targets.add(child);
        }
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          body.contains(activeElement)
        ) {
          for (
            let element: HTMLElement | null = activeElement;
            element && element !== body;
            element = element.parentElement
          ) {
            targets.add(element);
          }
        }
        for (const target of targets) {
          stopObserving.push(observeResize(target, scheduleReveal));
        }
      };
      const mutationObserver =
        typeof MutationObserver === 'undefined'
          ? null
          : new MutationObserver(records => {
              // Skip the sheet's own attribute writes on the body. Consumer
              // DOM, text, class, style, or visibility changes can all move the
              // focused control without a viewport event. The inset's write on
              // the content box schedules one more reveal, which finds the same
              // inset and settles.
              if (
                records.every(
                  record =>
                    record.type === 'attributes' && record.target === body,
                )
              ) {
                return;
              }
              refreshObservedLayout();
              scheduleReveal();
            });
      const handleFocusIn = () => {
        refreshObservedLayout();
        scheduleReveal();
      };
      const handleFocusOut = () => {
        // Keep the added scroll range while the keyboard animates away. A focus
        // transition to another text-entry control cancels this in focusin.
        retainKeyboardLayoutRef.current = hasKeyboardLayoutRef.current;
        scheduleReveal();
      };
      const handleSheetTransitionEnd = (event: TransitionEvent) => {
        if (event.target === sheet && event.propertyName === 'transform') {
          scheduleReveal();
        }
      };

      const stopClaiming = ownsFocusTransitions
        ? claimFocusTransitions()
        : null;
      // The hook reveals a keyboard report in its own frame, not the next. A browser
      // that reveals a focused field itself pans the visual viewport to it a few
      // frames after the report. It does so if the keyboard still covers the
      // field. Such a pan moves the visual viewport down within the layout
      // viewport, with no touch, document scroll or zoom since the report. Once
      // the sheet lands the field itself, the hook puts the pan back: it scrolls
      // the full-viewport dialog's top into view. On every later report, the field
      // lands at once.
      let lastHeight = getKeyboardHeight(window);
      // Under a coarse primary pointer only: the watch reads touches, and an
      // on-screen keyboard's pan comes with a touch screen.
      const revealPan = isTouch
        ? watchRevealPan(window, {
            owns: focused =>
              hasKeyboardLayoutRef.current && body.contains(focused),
            // The reader's own scroll may stop a smooth reveal short: forget
            // where it was going.
            onTouch: () => {
              smoothTarget = null;
            },
          })
        : null;
      // Every keyboard report reaches the reveal through the keyboard module's
      // one set of listeners.
      const unsubscribe = subscribeKeyboardHeight(window, event => {
        if (event.type !== 'viewport') {
          return;
        }
        if (event.height !== lastHeight) {
          lastHeight = event.height;
          revealPan?.report();
          cancelAnimationFrame(animationFrame);
          revealFocusedControl(true);
          return;
        }
        if (revealPan?.isRevealPan(event.height) === true) {
          revealsAtReport.add(window);
          cancelAnimationFrame(animationFrame);
          // A smooth reveal still under way lands the field where it is going.
          // Another scroll on top of it would overshoot in Firefox, which keeps
          // adding a smooth scrollBy's distance after an instant scroll. The
          // field ended 244 px too high there. With none under way, the field
          // lands at once.
          const distanceLeft = smoothDistanceLeft();
          if (distanceLeft === 0) {
            revealFocusedControl();
          }
          // The hook puts the pan back only if the sheet holds the field above
          // the keyboard with its own scroller. Rects are in layout-viewport
          // coordinates, which the pan does not move. A ride still draws the
          // field lower than its layout, so its offset does not count. A field
          // the sheet cannot bring up keeps the browser's reveal.
          const activeElement = document.activeElement;
          const dialog = sheet.closest('dialog');
          if (
            dialog != null &&
            activeElement instanceof HTMLElement &&
            activeElement.getBoundingClientRect().bottom -
              rideOffset() -
              distanceLeft <=
              getObstructionTop()
          ) {
            // The full-viewport dialog is fixed at the layout viewport's top.
            revealPan?.putBack(dialog);
          }
          return;
        }
        scheduleReveal();
      });
      body.addEventListener('focusin', handleFocusIn);
      body.addEventListener('focusout', handleFocusOut);
      sheet.addEventListener('transitionend', handleSheetTransitionEnd);
      // The window's capture phase hears every element's scroll too, and only
      // the page's own scroll moves the document.
      const stopDocumentScroll = subscribeInput(window, 'scroll', event => {
        const target = event.target;
        if (!isNodeTarget(target) || (target as Node).nodeType === 9) {
          handleDocumentScroll();
        }
      });
      mutationObserver?.observe(body, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
      refreshObservedLayout();
      // The dialog enters the top layer in a later effect. Wait until the next
      // frame so flex geometry is final before measuring the body.
      scheduleReveal();

      return () => {
        cancelAnimationFrame(animationFrame);
        stopClaiming?.();
        unsubscribe();
        unsubscribeGuide?.();
        heldHide?.release();
        contentAnimator()?.set({y: 0});
        revealPan?.stop();
        body.removeEventListener('focusin', handleFocusIn);
        body.removeEventListener('focusout', handleFocusOut);
        sheet.removeEventListener('transitionend', handleSheetTransitionEnd);
        stopDocumentScroll();
        for (const stop of stopObserving) {
          stop();
        }
        mutationObserver?.disconnect();
        setKeyboardInset(0);
        hasKeyboardLayoutRef.current = false;
        retainKeyboardLayoutRef.current = false;
      };
    },
    `${isEnabled}|${reservesInset}|${isPageScrollLocked}|${isTouch}|${offset}`,
  );
  return {inset: keyboardInset, dismiss};
}
