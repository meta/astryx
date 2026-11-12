// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liftFromTrigger.fixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page with a list of rows in a clipping, transformed panel, and a
 *   menu popover beside it. The first row is rounded by `:first-child`, and
 *   the second holds twelve elements. `window.__lift` lifts a row, fades the
 *   menu in and closes it, drops and ends, and logs taps and clicks
 * @position Browser fixture of liftFromTrigger.interaction.browser.spec.ts; test-only
 */

import {
  createLiftFromTrigger,
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
  presentMenu: () => void;
  closeMenu: () => void;
  showMenu: () => void;
  drop: () => void;
  dispose: () => void;
  isLifted: () => boolean;
}

declare global {
  interface Window {
    __lift: LiftFixture;
  }
}

document.documentElement.style.cssText =
  '--color-overlay: rgba(1, 18, 40, 0.4); --spacing-4: 16px;';
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
    li:last-child { border-radius: 0 0 12px 12px; }
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
  <div id="chip" style="position: absolute; left: 20px; top: 40px; width: 100.4px; line-height: 20px; background: rgb(255, 255, 255)"><span id="chip-a" style="display: inline-block; width: 50.2px; height: 20px"></span><span id="chip-b" style="display: inline-block; width: 50.2px; height: 20px"></span></div>
  <div id="menu" popover="manual"><div role="menu" aria-label="Actions">Menu</div></div>`;

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
      surfaceIn: spring,
    },
    scale: {maxScale: 1.15, scaleUpPoints: 26},
    attribute: 'data-lift',
    onBackdropTap: () => {
      log.backdropTaps += 1;
    },
  };
}

window.__lift = {
  log,
  lift: (id, springResponse = 0.3) =>
    lift.lift(element(id), options(springResponse)),
  showMenu: () => element('menu').showPopover(),
  presentMenu: () => {
    element('menu').showPopover();
    lift.presentSurface(
      element('menu').querySelector<HTMLElement>('[role="menu"]') ??
        element('menu'),
    );
  },
  closeMenu: () => element('menu').hidePopover(),
  drop: () => lift.drop(),
  dispose: () => lift.dispose(),
  isLifted: () => lift.isLifted(),
};
