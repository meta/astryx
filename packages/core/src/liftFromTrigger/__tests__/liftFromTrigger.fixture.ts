// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTrigger.fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page with a list of rows inside a clipping, transformed panel
 *   (the first row rounded by `:first-child`, the second holding twelve
 *   elements), a menu popover beside it, and `window.__lift`: lift a row,
 *   grow and close the menu, drop, end, and the backdrop taps and the
 *   clicks the page received; and a thumbnail, a hidden viewer with its
 *   photo, and `window.__zoom` (liftCopy and the rect morph) for the zoom's
 *   copy
 * @position Browser fixture of liftFromTrigger.interaction.browser.spec.ts; test-only
 */

import {createRectMorph, lerpPath} from '../../motion/rectMorph';
import {
  createLiftFromTrigger,
  liftCopy,
  type LiftFromTriggerOptions,
  type LiftFromTriggerResult,
} from '../liftFromTrigger';

interface LiftLog {
  backdropTaps: number;
  clicks: string[];
}

/** The page's handle on its lift. */
export interface LiftFixture {
  log: LiftLog;
  lift: (id: string, springResponse?: number) => LiftFromTriggerResult | null;
  presentMenu: (press: {x: number; y: number} | null) => void;
  dismissMenu: () => void;
  closeMenu: () => void;
  showMenu: () => void;
  drop: () => void;
  dispose: () => void;
  isLifted: () => boolean;
}

/** What a zoom proof drives: the copy, and the rect morph that moves it. */
export interface ZoomFixture {
  liftCopy: typeof liftCopy;
  createRectMorph: typeof createRectMorph;
  lerpPath: typeof lerpPath;
}

declare global {
  interface Window {
    __lift: LiftFixture;
    __zoom: ZoomFixture;
  }
}

document.documentElement.style.cssText =
  '--color-overlay: rgba(1, 18, 40, 0.4); --shadow-high: 0 8px 24px rgba(0, 0, 0, 0.3); --spacing-4: 16px;';
document.body.style.margin = '0';
document.body.style.font = '16px sans-serif';
const deep = Array.from(
  {length: 3},
  (_, i) =>
    `<div><span>${i * 3 + 1}</span><span>${i * 3 + 2}</span><span>${i * 3 + 3}</span></div>`,
).join('');
document.body.innerHTML = `
  <style>
    .panel { position: absolute; left: 20px; top: 120px; width: 335px; height: 250px; overflow: hidden; transform: translateX(0.5px); border-radius: 12px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { box-sizing: border-box; height: 60px; padding: 0 16px; display: flex; align-items: center; gap: 8px; background: rgb(255, 255, 255); border-bottom: 1px solid rgb(221, 221, 221); color: rgb(17, 17, 17); }
    li:first-child { border-radius: 12px 12px 0 0; }
    #menu { position: fixed; inset: auto; margin: 0; padding: 0; border: 0; left: 40px; top: 420px; width: 250px; height: 180px; background: rgb(238, 238, 238); border-radius: 16px; }
  </style>
  <div class="panel">
    <ul id="list">
      <li id="row1">Row 1</li>
      <li id="row2" style="color: rgb(0, 0, 200)">${deep}</li>
      <li id="row3">Row 3</li>
      <li id="row4">Row 4</li>
    </ul>
  </div>
  <button id="page" style="position: absolute; left: 20px; top: 640px; width: 335px; height: 120px">page</button>
  <div id="menu" popover="manual"><div role="menu" aria-label="Actions">Menu</div></div>
  <button id="thumb" type="button" style="position: absolute; left: 280px; top: 20px; width: 80px; height: 80px; padding: 0; border: 0; border-radius: 10px; overflow: hidden"><img alt="A photo" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='rgb(0,140,0)'/%3E%3C/svg%3E" style="display: block; width: 100%; height: 100%; object-fit: cover"></button>
  <div id="viewer" style="display: none; position: fixed; inset: 0; isolation: isolate; background: rgba(0, 0, 0, 0.8)">
    <div id="photo" style="position: absolute; left: 20px; top: 260px; width: 335px; height: 251px; background: rgb(200, 0, 0)"></div>
  </div>`;

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found == null) {
    throw new Error(`missing #${id}`);
  }
  return found;
}

const log: LiftLog = {backdropTaps: 0, clicks: []};
document.addEventListener(
  'click',
  event => {
    const target = event.target;
    if (target instanceof Element) {
      log.clicks.push(target.id || target.tagName.toLowerCase());
    }
  },
  true,
);

const lift = createLiftFromTrigger();

function options(response: number): LiftFromTriggerOptions {
  const spring = {response, dampingRatio: 0.9};
  return {
    motion: {
      lift: spring,
      drop: spring,
      clear: spring,
      shadowIn: spring,
      shadowOut: spring,
      surfaceIn: spring,
      surfaceOut: spring,
    },
    scale: {maxScale: 1.15, scaleUpPoints: 26},
    surfaceStartWidth: 44,
    attribute: 'data-lift',
    onBackdropTap: () => {
      log.backdropTaps += 1;
    },
  };
}

window.__zoom = {liftCopy, createRectMorph, lerpPath};

window.__lift = {
  log,
  lift: (id, springResponse = 0.3) =>
    lift.lift(element(id), options(springResponse)),
  showMenu: () => element('menu').showPopover(),
  presentMenu: press => {
    element('menu').showPopover();
    lift.presentSurface(
      element('menu').querySelector<HTMLElement>('[role="menu"]') ??
        element('menu'),
      press,
    );
  },
  dismissMenu: () => lift.dismissSurface(element('menu')),
  closeMenu: () => element('menu').hidePopover(),
  drop: () => lift.drop(),
  dispose: () => lift.dispose(),
  isLifted: () => lift.isLifted(),
};
