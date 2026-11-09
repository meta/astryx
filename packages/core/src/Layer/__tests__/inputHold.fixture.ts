// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputHold.fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page whose whole area is a button (`#under`), a modal dialog
 *   (`#dialog`: text, an action, and a gesture-host tap recognizer on the
 *   dialog itself, an ancestor of the hold's shield), a light-dismissing
 *   popover (`#pop`) and a full-viewport layer (`#lift`) whose content and
 *   tint take the hits while a test may make its root take none, plus
 *   `window.__hold`: open a layer, hold and
 *   release it, read what an element at a point is and what lies past a
 *   hold's shield there, and a log of every
 *   click, tap recognition and popover toggle
 * @position Browser fixture of inputHold.interaction.browser.spec.ts;
 *   test-only
 */

import {getGestureHost} from '../../gestures/GestureHost';
import {TapGestureRecognizer} from '../../gestures/TapGestureRecognizer';
import {holdInput, isInputShield, type InputHoldScope} from '../inputHold';

type LayerId = 'dialog' | 'pop' | 'lift';

interface HoldLog {
  clicks: string[];
  taps: number;
  toggles: string[];
}

declare global {
  interface Window {
    __hold: {
      log: HoldLog;
      open: (id: LayerId) => void;
      hold: (id: LayerId, scope: InputHoldScope) => void;
      release: () => void;
      hitAt: (x: number, y: number) => string;
      hitPast: (x: number, y: number) => string;
    };
  }
}

document.body.style.margin = '0';
document.body.innerHTML = `
  <button id="under" style="position: fixed; inset: 0; width: 100vw; height: 100vh; font: 14px sans-serif">page</button>
  <dialog id="dialog" style="width: 240px; padding: 16px; font: 14px sans-serif">
    <p id="message" style="height: 48px; margin: 0 0 16px">Delete this item?</p>
    <button id="action" style="width: 200px; height: 48px">Delete</button>
  </dialog>
  <div id="pop" popover="auto" style="width: 200px; padding: 16px; font: 14px sans-serif">
    <button id="popAction" style="width: 160px; height: 48px">Copy</button>
  </div>
  <div id="lift" style="position: fixed; inset: 0; display: none; font: 14px sans-serif">
    <div id="tint" style="position: absolute; inset: 0; background: rgba(0, 0, 0, 0.2); pointer-events: auto; visibility: visible"></div>
    <button id="liftAction" style="position: absolute; top: 120px; left: 40px; width: 160px; height: 48px; pointer-events: auto; visibility: visible">Copy</button>
  </div>`;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found == null) {
    throw new Error(`missing #${id}`);
  }
  return found;
}

const log: HoldLog = {clicks: [], taps: 0, toggles: []};

document.addEventListener(
  'click',
  event => {
    const target = event.target;
    if (target instanceof Element) {
      const button = target.closest('button');
      if (button != null) {
        log.clicks.push(button.id);
      }
    }
  },
  true,
);
element('pop').addEventListener('toggle', event => {
  log.toggles.push(`pop:${event.newState}`);
});

// A recognizer on the dialog itself sees every touch inside it, the hold's
// shield included: only the gesture host's touch gate keeps it away.
const tap = new TapGestureRecognizer({name: 'dialogTap'});
tap.addTransitionListener((_current, _from, to) => {
  if (to === 'ended') {
    log.taps += 1;
  }
});
getGestureHost(document).attach(element('dialog'), tap);

let release: (() => void) | null = null;

window.__hold = {
  log,
  open(id) {
    if (id === 'dialog') {
      (element('dialog') as HTMLDialogElement).showModal();
    } else if (id === 'pop') {
      element('pop').showPopover();
    } else {
      element('lift').style.display = 'block';
    }
  },
  hold(id, scope) {
    release = holdInput(element(id), {
      until: new Promise(() => {}),
      scope,
    });
  },
  release() {
    release?.();
    release = null;
  },
  hitAt(x, y) {
    return describe(document.elementFromPoint(x, y));
  },
  hitPast(x, y) {
    return describe(
      document.elementsFromPoint(x, y).find(el => !isInputShield(el)) ?? null,
    );
  },
};

function describe(hit: Element | null): string {
  if (hit == null) {
    return 'nothing';
  }
  if (isInputShield(hit)) {
    return `shield:${hit.parentElement?.id ?? ''}`;
  }
  return hit.id !== '' ? hit.id : hit.tagName.toLowerCase();
}
