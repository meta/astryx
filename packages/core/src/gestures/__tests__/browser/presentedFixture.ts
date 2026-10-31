// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedFixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A scrim and a sheet with a Done button; `window.__dismiss()` moves
 *   the sheet down off the screen over 1.2 s with the real animator. `__offsets()`
 *   reads the animator's presented offset beside the drawn top and the top
 *   the animation started from. `__mimicIos()` makes hit tests answer where
 *   the engine last resolved the sheet (its start, until a style write), as
 *   iOS WebKit does mid-animation, and
 *   `__tap(x, y)` sends a synthetic tap whose target is what such a hit test
 *   returns; transitions and clicks go to `__log`
 * @position Browser fixture of presentedHitTesting.interaction.browser.spec.ts; test-only
 */

import {createAnimator} from '../../../motion/animator';
import {presentedOffsetOf} from '../../../motion/presentation';
import {GestureHost} from '../../GestureHost';
import {PanGestureRecognizer} from '../../PanGestureRecognizer';
import {TapGestureRecognizer} from '../../TapGestureRecognizer';

declare global {
  interface Window {
    __log: string[];
    __dismiss: () => void;
    __offsets: () => {offset: number; drawnTop: number; startTop: number};
    __mimicIos: () => void;
    __tap: (x: number, y: number) => void;
  }
}

window.__log = [];
document.body.style.cssText = 'margin:0;font:15px system-ui,sans-serif';
document.body.innerHTML = `
  <div id="scrim" style="position:fixed;inset:0;background:rgba(0,0,0,.3)"></div>
  <div id="sheet" style="position:fixed;left:0;right:0;top:400px;height:444px;background:#fff;border-radius:14px 14px 0 0">
    <button id="done" style="position:absolute;right:16px;top:12px;width:80px;height:40px">Done</button>
  </div>`;

const element = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (found == null) {
    throw new Error(`missing #${id}`);
  }
  return found;
};
const scrim = element('scrim');
const sheet = element('sheet');
const done = element('done');

const host = new GestureHost(document, {presentedHitTesting: 'always'});
const scrimTap = new TapGestureRecognizer({name: 'scrim'});
const sheetDrag = new PanGestureRecognizer({name: 'sheet', direction: 'down'});
for (const recognizer of [scrimTap, sheetDrag]) {
  recognizer.addTransitionListener((current, _from, to) => {
    window.__log.push(`${current.name}:${to}`);
  });
}
host.attach(scrim, scrimTap);
host.attach(sheet, sheetDrag);
for (const [name, target] of [
  ['scrim', scrim],
  ['done', done],
] as const) {
  target.addEventListener('click', () => window.__log.push(`click:${name}`));
}

const animator = createAnimator(sheet);
window.__dismiss = () => {
  animator.play({
    y: {duration: 1.2, at: t => (444 * t) / 1.2, velocity: () => 370},
  });
};

/** The dismissal starts from translate 0. */
const START_Y = 0;

/** Where `target`'s top is with the sheet at the translate it started from. */
const startTop = (target: HTMLElement): number => {
  let top = 0;
  for (
    let node: HTMLElement | null = target;
    node != null;
    node = node.offsetParent as HTMLElement | null
  ) {
    top += node.offsetTop;
  }
  return top + START_Y;
};

window.__offsets = () => ({
  offset: presentedOffsetOf(sheet).y,
  drawnTop: sheet.getBoundingClientRect().top,
  startTop: startTop(sheet),
});

window.__mimicIos = () => {
  // iOS keeps the transform it resolved when the animation started, until a
  // style write on the element resolves it again to the value drawn then.
  const real = Element.prototype.getBoundingClientRect;
  let resolved = {top: startTop(sheet), key: ''};
  const resolvedTop = (): number => {
    const key = sheet.style.getPropertyValue('--astryx-presented');
    if (key !== resolved.key) {
      resolved = {top: real.call(sheet).top, key};
    }
    return resolved.top;
  };
  for (const target of [sheet, done]) {
    const fromSheetTop = startTop(target) - startTop(sheet);
    const box = () => {
      const drawn = real.call(target);
      return new DOMRect(
        drawn.left,
        resolvedTop() + fromSheetTop,
        drawn.width,
        drawn.height,
      );
    };
    Object.defineProperty(target, 'getBoundingClientRect', {value: box});
  }
  const stack = (x: number, y: number): Element[] => {
    const inside = (target: HTMLElement) => {
      const box = target.getBoundingClientRect();
      return x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    };
    return [
      ...(inside(done) ? [done] : []),
      ...(inside(sheet) ? [sheet] : []),
      scrim,
      document.body,
      document.documentElement,
    ];
  };
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: stack,
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) => stack(x, y)[0],
  });
};

window.__tap = (x, y) => {
  const target = document.elementFromPoint(x, y) ?? document.body;
  const send = (type: 'touchstart' | 'touchend') => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const contact = {identifier: 1, clientX: x, clientY: y, target};
    Object.defineProperty(event, 'changedTouches', {value: [contact]});
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [contact],
    });
    target.dispatchEvent(event);
    window.__log.push(
      `${type}:${event.defaultPrevented ? 'prevented' : 'open'}`,
    );
  };
  send('touchstart');
  send('touchend');
};
