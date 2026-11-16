// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils/pressLayerBox.ts
 * @input A pressable control, the point where a press on it starts, and the
 *   press's pointer type
 * @output setPressLayerBox, which makes a press on a static control tint the
 *   surface it starts on: the control's own box, or the row around it
 * @position Button calls it at each press's start. `controlPressLayerStyles`
 *   (privateAttributes/press.stylex.ts) reads the custom properties it sets.
 */

import {PRESSED_ATTRIBUTE} from './pressFeedback';

/** Under a coarse primary pointer: the press layer's box. */
const LAYER_INSET = '--_press-layer-inset';
/** Under any other pointer: the row's tint, and the control's own tint. */
const ROW_TINT = '--_press-row-tint';
const OWN_TINT = '--_press-own-tint';

/**
 * A caller can make a control static, with no transform, so that its
 * `::after` covers a row as its tap target. Its press layers then have the
 * row as their containing block too: the row is the control's nearest
 * positioned ancestor. A press that starts on the row presses the row, so the
 * row tints as one surface. The control then shows no tint of its own. A press
 * that starts on the control's own box presses the control, so only that box
 * tints. The box is measured once, at the press's start, against the row's
 * padding box. The reads change no layout and no hit-testing. A positioned
 * control reads only its computed position: it is its own layers' containing
 * block.
 */
export function setPressLayerBox(
  control: HTMLElement,
  x: number,
  y: number,
  pointerType: string,
): void {
  const row =
    getComputedStyle(control).position === 'static'
      ? control.offsetParent
      : null;
  if (!(row instanceof HTMLElement)) {
    clear(control, LAYER_INSET);
    return;
  }
  const box = control.getBoundingClientRect();
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
    clear(control, LAYER_INSET);
    holdRowTint(control, pointerType);
    return;
  }
  clear(control, ROW_TINT);
  clear(control, OWN_TINT);
  const top = control.offsetTop;
  const left = control.offsetLeft;
  const bottom = row.clientHeight - top - control.offsetHeight;
  const right = row.clientWidth - left - control.offsetWidth;
  control.style.setProperty(
    LAYER_INSET,
    `${top}px ${right}px ${bottom}px ${left}px`,
  );
}

/**
 * Shows the row's tint until the press ends, as `:active` does, and keeps the
 * control's own tint off. The press controller paints a finger's press on the
 * control through its fade. So after a finger lifts, the control's own tint
 * stays off until the controller ends that press.
 */
function holdRowTint(control: HTMLElement, pointerType: string): void {
  const view = control.ownerDocument.defaultView;
  if (view == null) {
    return;
  }
  control.style.setProperty(ROW_TINT, '""');
  control.style.setProperty(OWN_TINT, 'none');
  const end = () => {
    view.removeEventListener('pointerup', end, true);
    view.removeEventListener('pointercancel', end, true);
    clear(control, ROW_TINT);
    if (pointerType !== 'touch' || !control.hasAttribute(PRESSED_ATTRIBUTE)) {
      clear(control, OWN_TINT);
      return;
    }
    const press = new MutationObserver(() => {
      if (!control.hasAttribute(PRESSED_ATTRIBUTE)) {
        press.disconnect();
        clear(control, OWN_TINT);
      }
    });
    press.observe(control, {
      attributes: true,
      attributeFilter: [PRESSED_ATTRIBUTE],
    });
  };
  view.addEventListener('pointerup', end, true);
  view.addEventListener('pointercancel', end, true);
}

function clear(control: HTMLElement, name: string): void {
  if (control.style.getPropertyValue(name) !== '') {
    control.style.removeProperty(name);
  }
}
