// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file presentedFixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A scrim and a sheet with a Done button. `window.__move('up')`
 *   springs the sheet up into place from below the screen and
 *   `__move('down')` springs it down off it, with Core's animator and a
 *   critically damped spring (the sheet's shape, slowed to a 6 s response so
 *   a test can act while it moves, even on a loaded machine). `__offsets()`
 *   reads the animator's presented offset beside the drawn top, the top the
 *   motion started from, the velocity, and how far the page's clock is past
 *   the frame the drawn top belongs to. `__springSpeeds()` reads the
 *   spring's speed 0.3, 1.5 and 4.5 s into the motion from the animator's
 *   own curve. `__mimicIos()` makes hit tests answer where the engine
 *   last resolved the sheet (where the motion started, until a style write),
 *   as iOS WebKit does mid-animation. `__act('tap')` taps the drawn Done and
 *   `__act('drag')` drags the drawn sheet 120 px down, in the first frame
 *   where that target is drawn on screen and still moving (restarting the
 *   motion, up to four times, when a busy machine shows no such frame before
 *   it settles), with synthetic touches whose target is what such a hit test
 *   returns. A drag that
 *   begins the sheet's pan stops the spring where the sheet is drawn, and
 *   the sheet then follows the finger. Transitions and clicks go to `__log`.
 * @position Browser fixture of presentedHitTesting.interaction.browser.spec.ts; test-only
 */

import {createAnimator} from '../../../motion/animator';
import {presentedOffsetOf} from '../../../motion/presentation';
import {GestureHost} from '../../GestureHost';
import {PanGestureRecognizer} from '../../PanGestureRecognizer';
import {TapGestureRecognizer} from '../../TapGestureRecognizer';

/** What a tap or a drag found and did, for the test to check. */
interface Act {
  /** The presented offset (px) and the velocity (px/s) at touch-down. */
  readonly offset: number;
  readonly velocity: number;
  /** Motions it took to find a frame that drew the target while moving. */
  readonly attempts: number;
  /** What the hit test under the finger returned at touch-down. */
  readonly engineTarget: string;
  /** Drag only: each `touchmove`'s `defaultPrevented`, in order. */
  readonly movesPrevented: ReadonlyArray<boolean>;
  /** Drag only: the sheet's drawn top when its pan began, or null. */
  readonly caughtTop: number | null;
  /** Drag only: the sheet's drawn top and the pan's translation at the lift. */
  readonly topAtLift: number;
  readonly translationAtLift: number;
}

declare global {
  interface Window {
    __log: string[];
    __move: (direction: 'up' | 'down') => void;
    __offsets: () => {
      offset: number;
      drawnTop: number;
      startTop: number;
      velocity: number;
      lag: number;
    };
    __springSpeeds: () => number[];
    __mimicIos: () => void;
    __act: (kind: 'tap' | 'drag') => Promise<Act>;
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

/** How far the sheet travels: from its rest to below the screen. */
const TRAVEL = 444;

/**
 * The sheet's spring shape (critically damped, as UIKit's sheet spring
 * renders), slowed so the motion lasts long enough to act on mid-flight.
 */
const SPRING = {response: 6, dampingRatio: 1} as const;

const animator = createAnimator(sheet);
const drawn = (target: Element): DOMRect =>
  Element.prototype.getBoundingClientRect.call(target);

/** The current motion's direction and the translate it started from. */
let direction: 'up' | 'down' = 'down';
let startY = 0;
/** Where the engine last resolved the sheet's top; reset by each motion. */
let resolved: {top: number; key: string} | null = null;

window.__move = towards => {
  direction = towards;
  startY = towards === 'up' ? TRAVEL : 0;
  resolved = null;
  animator.set({y: startY});
  animator.animate({y: TRAVEL - startY}, {spring: SPRING});
};

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
  return top + startY;
};

window.__offsets = () => ({
  offset: presentedOffsetOf(sheet).y,
  drawnTop: drawn(sheet).top,
  startTop: startTop(sheet),
  velocity: animator.getVelocity('y'),
  lag: performance.now() - Number(document.timeline.currentTime ?? 0),
});

window.__springSpeeds = () =>
  [0.3, 1.5, 4.5].map(seconds =>
    animator.getVelocity('y', performance.now() + seconds * 1000),
  );

/**
 * Where the compositor draws the sheet's top now: its layout top plus the
 * spring's value at this moment. On a starved machine the page's own box can
 * trail the motion or, after a style write, jump ahead of it.
 */
const drawnTopNow = (time = performance.now()): number =>
  startTop(sheet) - startY + animator.get('y', time);

window.__mimicIos = () => {
  // iOS keeps the transform it resolved when the motion started, until a
  // style write on the element resolves it again to the value drawn at that
  // moment (the animator's resolve writes a custom property for it).
  const write = sheet.style.setProperty.bind(sheet.style);
  sheet.style.setProperty = (name, value, priority) => {
    write(name, value, priority);
    if (name === '--astryx-presented') {
      resolved = {top: drawnTopNow(), key: value ?? ''};
    }
  };
  const resolvedTop = (): number => {
    const key = sheet.style.getPropertyValue('--astryx-presented');
    if (resolved == null) {
      resolved = {top: startTop(sheet), key};
    } else if (key !== resolved.key) {
      resolved = {top: drawnTopNow(), key};
    }
    return resolved.top;
  };
  for (const target of [sheet, done]) {
    const fromSheetTop = startTop(target) - startTop(sheet);
    const box = () => {
      const now = drawn(target);
      return new DOMRect(
        now.left,
        resolvedTop() + fromSheetTop,
        now.width,
        now.height,
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

/** The drawn top when the sheet's pan began, and the translate it froze at. */
let caught: {top: number; y: number} | null = null;
sheetDrag.addListener(recognizer => {
  if (recognizer.state === 'began') {
    const y = animator.get('y');
    animator.set({y});
    caught = {top: drawn(sheet).top, y};
  } else if (recognizer.state === 'changed' && caught != null) {
    animator.set({y: caught.y + recognizer.translation().y});
  }
});

const touch = (
  type: 'touchstart' | 'touchmove' | 'touchend',
  target: Element,
  x: number,
  y: number,
  time = performance.now(),
): boolean => {
  const event = new Event(type, {bubbles: true, cancelable: true});
  // When the finger landed or moved, whenever the main thread gets to it.
  Object.defineProperty(event, 'timeStamp', {value: time});
  const contact = {identifier: 1, clientX: x, clientY: y, target};
  Object.defineProperty(event, 'changedTouches', {value: [contact]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [contact],
  });
  target.dispatchEvent(event);
  if (type !== 'touchmove') {
    window.__log.push(
      `${type}:${event.defaultPrevented ? 'prevented' : 'open'}`,
    );
  }
  return event.defaultPrevented;
};

const nextFrame = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
};

/** The catch the sheet's pan listener recorded, read past the awaits. */
const currentCatch = (): {top: number; y: number} | null => caught;

/** Acts in the first frame that draws the target on screen while it moves. */
const tryAct = async (
  kind: 'tap' | 'drag',
  attempts: number,
): Promise<Act | null> => {
  for (;;) {
    await nextFrame();
    // Aim where the compositor draws the target now, as a finger does; the
    // touch carries this moment as its timestamp. Reading the offset first
    // brings in the browser's start for the curve, which a busy page learns
    // late, so the aim and the host read the same curve.
    const landedAt = performance.now();
    const offset = presentedOffsetOf(sheet, landedAt).y;
    const velocity = animator.getVelocity('y', landedAt);
    const target = kind === 'tap' ? done : sheet;
    const box = drawn(target);
    const top = drawnTopNow(landedAt) + startTop(target) - startTop(sheet);
    const x = kind === 'tap' ? box.left + box.width / 2 : box.left + 60;
    const y = kind === 'tap' ? top + box.height / 2 : top + 24;
    if (
      y > 8 &&
      y < window.innerHeight - 8 &&
      Math.abs(offset) > 30 &&
      Math.abs(velocity) > 20
    ) {
      const landed = document.elementFromPoint(x, y) ?? document.body;
      const found = {offset, velocity, attempts, engineTarget: landed.id};
      caught = null;
      touch('touchstart', landed, x, y, landedAt);
      const movesPrevented: boolean[] = [];
      if (kind === 'drag') {
        for (let step = 1; step <= 10; step++) {
          await nextFrame();
          movesPrevented.push(touch('touchmove', landed, x, y + 12 * step));
        }
      }
      const translationAtLift = sheetDrag.translation().y;
      touch('touchend', landed, x, kind === 'drag' ? y + 120 : y);
      return {
        ...found,
        movesPrevented,
        caughtTop: currentCatch()?.top ?? null,
        topAtLift: drawn(sheet).top,
        translationAtLift,
      };
    }
    // Settled, slowed past use, or (springing down) gone below the screen
    // without a usable frame: the caller starts the motion again.
    const settled = animator.get('y') === TRAVEL - startY;
    const slowed = Math.abs(velocity) <= 20 && Math.abs(offset) > 30;
    const gone = direction === 'down' && y >= window.innerHeight - 8;
    if (settled || slowed || gone) {
      return null;
    }
  }
};

window.__act = async kind => {
  for (let attempts = 1; attempts <= 4; attempts++) {
    const act = await tryAct(kind, attempts);
    if (act != null) {
      return act;
    }
    window.__move(direction);
  }
  throw new Error(`no frame drew the ${kind} target on screen while moving`);
};
