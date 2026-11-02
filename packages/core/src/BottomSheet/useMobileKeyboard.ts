// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useMobileKeyboard.ts
 * @input Uses React effects and refs supplied by BottomSheet
 * @output Exports internal useMobileKeyboard hook
 * @position Internal to BottomSheet; not exported from the core entry point
 *
 * Gives a fully expanded, explicitly Tall sheet a keyboard-aware internal
 * scroll range while leaving the sheet itself stationary. Shorter detents and
 * other heights opt out entirely. Starting Tall-sheet travel or closing the
 * sheet blurs the field and dismisses the keyboard.
 *
 * Every route into a field also has to reach it without the browser revealing
 * it for us. On iOS that reveal scrolls the DOCUMENT, and a fixed sheet travels
 * with it, so the whole page lurches. The reveal is attached to the focus
 * operation, which is where it can be refused: take the focus transition over
 * on the capture-phase blur, deliver it with preventScroll, and bring the
 * control into view with the sheet's own scroller afterwards. Every route in —
 * a tap, the keyboard's Next, Tab, a programmatic focus() — passes through that
 * one transition.
 */

import {useEffect, useRef, type RefObject} from 'react';

const MOBILE_KEYBOARD_INSET_VAR = '--_sheet-keyboard-inset';
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

interface UseMobileKeyboardOptions {
  bodyRef: RefObject<HTMLElement | null>;
  bottomClearance: number;
  isEnabled: boolean;
  isFullyExpanded: boolean;
  isPageScrollLocked: boolean;
  isSheetTraveling: boolean;
  isOpen: boolean;
  isPresented: boolean;
  sheetRef: RefObject<HTMLDivElement | null>;
}

interface KeyboardGeometry {
  bodyBottom: number;
}

function getObstructionTop(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

// The keyboard is gone once the visible band reaches the layout viewport bottom.
function isVisualViewportRecovered(): boolean {
  return getObstructionTop() >= window.innerHeight - 0.5;
}

function isIOSWebKit(): boolean {
  const userAgent = window.navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (userAgent.includes('Macintosh') && window.navigator.maxTouchPoints > 1)
  );
}

function isTextEntryControl(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLInputElement) {
    return (
      !element.disabled &&
      !element.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(
        (element.getAttribute('type') ?? 'text').toLowerCase(),
      )
    );
  }
  return (
    element instanceof HTMLElement &&
    element.matches('[contenteditable]:not([contenteditable="false"])')
  );
}

function findTextEntryControl(
  target: EventTarget | null,
  body: HTMLElement,
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const direct = target.closest(
    'input, textarea, [contenteditable]:not([contenteditable="false"])',
  );
  if (body.contains(direct) && isTextEntryControl(direct)) {
    return direct;
  }

  const label = target.closest('label');
  const control = label instanceof HTMLLabelElement ? label.control : null;
  return body.contains(control) && isTextEntryControl(control) ? control : null;
}

export function useMobileKeyboard({
  bodyRef,
  bottomClearance,
  isEnabled,
  isFullyExpanded,
  isPageScrollLocked,
  isSheetTraveling,
  isOpen,
  isPresented,
  sheetRef,
}: UseMobileKeyboardOptions): void {
  const hasKeyboardLayoutRef = useRef(false);
  const retainKeyboardLayoutRef = useRef(false);
  const isFullyExpandedRef = useRef(isFullyExpanded);
  const isOpenRef = useRef(isOpen);
  isFullyExpandedRef.current = isFullyExpanded;
  isOpenRef.current = isOpen;

  useEffect(() => {
    if (!isEnabled || !isSheetTraveling) {
      return;
    }
    const sheet = sheetRef.current;
    const activeElement = document.activeElement;
    if (
      sheet &&
      activeElement instanceof HTMLElement &&
      activeElement !== sheet &&
      sheet.contains(activeElement)
    ) {
      // Keep the current keyboard scroll range while focusing the sheet
      // dismisses the keyboard. Viewport resize events unwind that layout as
      // the visual viewport recovers, avoiding a content jump on the first
      // drag frame.
      retainKeyboardLayoutRef.current = hasKeyboardLayoutRef.current;
      sheet.focus({preventScroll: true});
    }
  }, [isEnabled, isSheetTraveling, sheetRef]);

  useEffect(() => {
    if (!isEnabled || !isPresented || isOpen) {
      return;
    }
    const sheet = sheetRef.current;
    const activeElement = document.activeElement;
    if (
      sheet &&
      activeElement instanceof HTMLElement &&
      activeElement !== sheet &&
      sheet.contains(activeElement)
    ) {
      retainKeyboardLayoutRef.current = hasKeyboardLayoutRef.current;
      activeElement.blur();
    }
  }, [isEnabled, isOpen, isPresented, sheetRef]);

  useEffect(() => {
    const body = bodyRef.current;
    const sheet = sheetRef.current;
    if (!isEnabled || !isPresented || !body) {
      return;
    }

    let keyboardGeometry: KeyboardGeometry | null = null;
    let keyboardObstructionTop: number | null = null;
    let bodyScrollTopAtKeyboard: number | null = null;
    let documentScrollAtKeyboard: {x: number; y: number} | null = null;
    const ownsFocusTransitions = isIOSWebKit();

    const clearKeyboardLayout = () => {
      body.style.setProperty(MOBILE_KEYBOARD_INSET_VAR, '0px');
      if (bodyScrollTopAtKeyboard != null) {
        body.scrollTop = bodyScrollTopAtKeyboard;
      }
      keyboardGeometry = null;
      keyboardObstructionTop = null;
      bodyScrollTopAtKeyboard = null;
      documentScrollAtKeyboard = null;
      hasKeyboardLayoutRef.current = false;
      retainKeyboardLayoutRef.current = false;
    };

    const scrollBodyBy = (distance: number, smoothly: boolean) => {
      if (typeof body.scrollBy !== 'function') {
        body.scrollTop += distance;
        return;
      }
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      body.scrollBy({
        top: distance,
        // Not 'auto': that defers to the element's computed `scroll-behavior`,
        // so a consumer's `scroll-behavior: smooth` would animate a scroll this
        // hook needs to land in the same frame.
        behavior: smoothly && !reduceMotion ? 'smooth' : 'instant',
      });
    };

    // Scroll `control` into the part of the body the keyboard leaves visible,
    // reading live geometry each time.
    const scrollControlIntoSafeArea = (
      control: HTMLElement,
      smoothly: boolean,
    ) => {
      const measuredBodyRect = body.getBoundingClientRect();
      const measuredControlRect = control.getBoundingClientRect();
      const obstructionTop = getObstructionTop();
      const overlap = Math.max(0, measuredBodyRect.bottom - obstructionTop);
      const clearance = overlap > 0 ? bottomClearance : 0;
      const safeTop = measuredBodyRect.top;
      const safeBottom = Math.min(
        measuredBodyRect.bottom,
        obstructionTop - clearance,
      );
      if (safeBottom <= safeTop) {
        return;
      }

      if (measuredControlRect.bottom > safeBottom) {
        scrollBodyBy(measuredControlRect.bottom - safeBottom, smoothly);
      } else if (measuredControlRect.top < safeTop) {
        scrollBodyBy(measuredControlRect.top - safeTop, smoothly);
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
      const overlap = Math.max(0, geometry.bodyBottom - obstructionTop);
      if (overlap === 0) {
        clearKeyboardLayout();
        return;
      }

      const inset = Math.max(
        0,
        geometry.bodyBottom - (obstructionTop - bottomClearance),
      );
      body.style.setProperty(MOBILE_KEYBOARD_INSET_VAR, `${inset}px`);
    };

    // Take the focus transition over before the browser performs it.
    //
    // `blur` is dispatched in the capture phase ahead of the browser's own
    // focus step, and it names the destination in `relatedTarget`. Focusing it
    // here with preventScroll settles the transition: the browser's step finds
    // the element already active, so it dispatches nothing further and has
    // nothing to reveal.
    const claimFocusTransition = (event: FocusEvent) => {
      if (!isFullyExpandedRef.current) {
        return;
      }
      const destination = findTextEntryControl(event.relatedTarget, body);
      if (destination) {
        if (destination !== document.activeElement) {
          // Revealing the field is not this handler's job: focusing it raises
          // focusin, and the viewport resize that follows the keyboard raises
          // another — both already schedule the reveal below, which knows the
          // safe area and scrolls only the sheet's own body.
          destination.focus({preventScroll: true});
        }
        return;
      }

      // Focus left for nothing — the keyboard's Done button parks it on the
      // body. Park it on the sheet instead, so re-tapping the same field is
      // still a transition this handler sees. Left on the body, the field is
      // already `document.activeElement` on the next tap, no blur fires, and
      // the browser reveals it its own way.
      //
      // Only while the sheet is open: closing blurs the field too, and there
      // is no next tap to keep claimable — the host restores focus to whatever
      // opened the sheet.
      const origin = findTextEntryControl(event.target, body);
      if (isOpenRef.current && origin && !event.relatedTarget) {
        sheet?.focus({preventScroll: true});
      }
    };

    const revealFocusedControl = () => {
      const obstructionTop = getObstructionTop();
      const activeElement = document.activeElement;
      const focusedControl =
        activeElement instanceof HTMLElement &&
        body.contains(activeElement) &&
        isTextEntryControl(activeElement)
          ? activeElement
          : null;
      // The keyboard may close while the text field remains focused (for
      // example, a downward keyboard dismissal gesture on iOS). Run the full
      // cleanup path so the temporary spacer and the body scroll it enabled
      // are both restored. Then reveal the still-focused control against the
      // recovered sheet, because it may not be the field that opened the
      // keyboard and therefore may sit outside the restored scroll position.
      if (hasKeyboardLayoutRef.current && isVisualViewportRecovered()) {
        clearKeyboardLayout();
        if (isFullyExpandedRef.current && focusedControl) {
          scrollControlIntoSafeArea(focusedControl, false);
        }
        return;
      }
      if (!isFullyExpandedRef.current || focusedControl == null) {
        if (retainKeyboardLayoutRef.current && keyboardGeometry) {
          applyKeyboardGeometry(keyboardGeometry);
          return;
        }
        clearKeyboardLayout();
        return;
      }

      // An interactively dismissed iOS keyboard can leave the accessory bar
      // visible, so the visual viewport grows without reaching full height.
      // Restore the pre-keyboard body position as soon as that recovery starts;
      // the ordinary safe-area pass below may still scroll a low focused field
      // just enough for whatever obstruction remains. Advance the remembered
      // obstruction so later content mutations do not repeat this recovery.
      if (
        hasKeyboardLayoutRef.current &&
        keyboardObstructionTop != null &&
        obstructionTop > keyboardObstructionTop + 0.5 &&
        bodyScrollTopAtKeyboard != null
      ) {
        body.scrollTop = bodyScrollTopAtKeyboard;
        keyboardObstructionTop = obstructionTop;
      }

      retainKeyboardLayoutRef.current = false;

      const measuredBodyRect = body.getBoundingClientRect();
      const overlap = Math.max(0, measuredBodyRect.bottom - obstructionTop);
      // The extra clearance leaves room for mobile suggestion UI, but only
      // while the visual viewport actually overlaps the sheet. With no
      // obstruction, ordinary desktop and hardware-keyboard focus must not
      // shift an already visible control.
      const clearance = overlap > 0 ? bottomClearance : 0;
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
          ? Math.max(0, measuredBodyRect.bottom - (obstructionTop - clearance))
          : 0;
      body.style.setProperty(MOBILE_KEYBOARD_INSET_VAR, `${inset}px`);

      scrollControlIntoSafeArea(focusedControl, overlap > 0);
    };

    let animationFrame = 0;
    const scheduleReveal = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(revealFocusedControl);
    };

    // Resuming the app re-reveals the focused field with no focus event to
    // claim, so the reveal above never runs and the document scrolls — taking
    // the fixed sheet with it. Put that scroll back on the event that reports
    // it and re-reveal inside the sheet.
    //
    // Only while the page is locked, which is the only state in which a
    // document scroll cannot be the user's own: behind a non-modal sheet the
    // page stays scrollable, and reverting there would fight them.
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

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleReveal);
    const refreshObservedLayout = () => {
      if (!resizeObserver) {
        return;
      }
      resizeObserver.disconnect();

      // Body/sheet box changes include public height and xstyle updates. The
      // generated inset pseudo-element changes only scroll overflow, so these
      // observations do not feed the keyboard inset back into sheet geometry.
      const targets = new Set<Element>([body]);
      if (sheet) {
        targets.add(sheet);
      }
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
        resizeObserver.observe(target);
      }
    };
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(records => {
            // Ignore the internal inset written on the body. Consumer DOM,
            // text, class, style, or visibility changes can all move the
            // focused control without a viewport event.
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

    const viewport = window.visualViewport;
    if (ownsFocusTransitions) {
      // `blur` does not bubble, so the capture phase is the only place to hear
      // every one of them — and it runs before the browser's own focus step,
      // which is the only window in which the transition can still be claimed.
      document.addEventListener('blur', claimFocusTransition, true);
    }
    body.addEventListener('focusin', handleFocusIn);
    body.addEventListener('focusout', handleFocusOut);
    sheet?.addEventListener('transitionend', handleSheetTransitionEnd);
    viewport?.addEventListener('resize', scheduleReveal);
    viewport?.addEventListener('scroll', scheduleReveal);
    window.addEventListener('scroll', handleDocumentScroll);
    window.addEventListener('resize', scheduleReveal);
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
      if (ownsFocusTransitions) {
        document.removeEventListener('blur', claimFocusTransition, true);
      }
      body.removeEventListener('focusin', handleFocusIn);
      body.removeEventListener('focusout', handleFocusOut);
      sheet?.removeEventListener('transitionend', handleSheetTransitionEnd);
      viewport?.removeEventListener('resize', scheduleReveal);
      viewport?.removeEventListener('scroll', scheduleReveal);
      window.removeEventListener('scroll', handleDocumentScroll);
      window.removeEventListener('resize', scheduleReveal);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      body.style.removeProperty(MOBILE_KEYBOARD_INSET_VAR);
      hasKeyboardLayoutRef.current = false;
      retainKeyboardLayoutRef.current = false;
    };
  }, [
    bodyRef,
    bottomClearance,
    isEnabled,
    isPageScrollLocked,
    isPresented,
    sheetRef,
  ]);
}
