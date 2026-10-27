// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webInput.ts
 * @input Uses a Playwright `Page` (Chromium or WebKit)
 * @output `webInputDriver(page)`: a wheel step (`wheel({x, y, dx, dy, ctrl})`)
 *   and a pen stroke (`pen(points)`) as REAL engine input, for the proofs that
 *   a gesture works for every pointer (`spec:AST-094` FR43), not only a
 *   finger.
 * @position The non-touch half of the input drivers; touch.ts is the touch
 *   half and owns the input log both are read through. Untrusted DOM events
 *   are not input (a component can tell them apart with `isTrusted`), so both
 *   go through the engine's own input pipeline.
 *
 * Chromium: CDP `Input.dispatchMouseEvent`.
 * - A wheel step is a `mouseWheel` event at (x, y). Chromium divides the
 *   deltas it delivers by the device scale factor times the visual viewport's
 *   scale, so the driver multiplies them back: the page receives exactly `dx`
 *   and `dy` CSS px, in pixel mode (`deltaMode` 0). `ctrl` holds Control, as a
 *   trackpad pinch arrives; Chromium delivers such a step only to a page with
 *   a non-passive wheel listener (otherwise it zooms the page), as a component
 *   that takes trackpad pinches has.
 * - A pen stroke is pressed at its first point, moved through every point and
 *   released at the last, with `pointerType: 'pen'`, a pressure and an
 *   optional tilt, each event stamped with its scripted time: the page
 *   receives trusted pen pointer events (and the compatibility mouse events)
 *   with those timestamps.
 *
 * WebKit (Playwright's Linux build): `page.mouse.wheel` in a desktop context
 * (`isMobile: false`, `hasTouch: false`). WebKit's mobile emulation has no
 * wheel input, and Playwright has no pen for WebKit: both throw, naming the
 * reason, so a proof skips on the driver's flags instead.
 *
 * SYNC: Keep the engine limits above equal to the README's table and to the
 *   harness self-test (../src/harness.interaction.browser.spec.ts).
 */

import type {CDPSession, Page} from '@playwright/test';
import type {Engine} from './touch';

/** One wheel step: the page receives exactly `dx`, `dy` CSS px. */
export interface WheelInput {
  readonly x: number;
  readonly y: number;
  readonly dx?: number;
  readonly dy?: number;
  /** Hold Control during the step (a trackpad pinch arrives as a ctrl wheel). */
  readonly ctrl?: boolean;
}

/** A point of a pen stroke. */
export interface PenPoint {
  readonly x: number;
  readonly y: number;
  /** Ms after the stroke's first point. */
  readonly t: number;
  /** 0–1 (default 0.5) while the pen touches. */
  readonly pressure?: number;
  /** Degrees, -90–90 (default 0). */
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface WebInputDriver {
  readonly engine: Engine;
  /** Whether `wheel` works in this page (WebKit's mobile emulation has none). */
  readonly wheels: boolean;
  /** Whether `pen` works in this page (Chromium only). */
  readonly pens: boolean;
  wheel(input: WheelInput): Promise<void>;
  /** Presses at the first point, moves through all of them, releases at the last; paced on the wall clock. */
  pen(points: readonly PenPoint[]): Promise<void>;
}

/** Why a proof skips when the driver has no wheel in this page. */
export const WHEEL_SKIP =
  "WebKit's mobile emulation has no wheel input: run wheel proofs in a desktop context";
/** Why a proof skips when the driver has no pen. */
export const PEN_SKIP =
  'Playwright has no pen input for WebKit: pen proofs run in Chromium';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function chromiumWebInput(page: Page): Promise<WebInputDriver> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return {
    engine: 'chromium',
    wheels: true,
    pens: true,
    async wheel({x, y, dx = 0, dy = 0, ctrl = false}) {
      const scale = await page.evaluate(
        () => window.devicePixelRatio * (window.visualViewport?.scale ?? 1),
      );
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x,
        y,
        deltaX: dx * scale,
        deltaY: dy * scale,
        modifiers: ctrl ? 2 : 0,
      });
    },
    async pen(points) {
      if (points.length === 0) {
        return;
      }
      const startWall = Date.now();
      const startStamp = Date.now() / 1000;
      const events = [
        {type: 'mousePressed' as const, point: points[0]},
        ...points.slice(1).map(point => ({type: 'mouseMoved' as const, point})),
        {type: 'mouseReleased' as const, point: points[points.length - 1]},
      ];
      for (const {type, point} of events) {
        const wait = startWall + point.t - Date.now();
        if (wait > 0) {
          await sleep(wait);
        }
        await cdp.send('Input.dispatchMouseEvent', {
          type,
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: type === 'mouseReleased' ? 0 : 1,
          clickCount: type === 'mouseMoved' ? 0 : 1,
          pointerType: 'pen',
          force: type === 'mouseReleased' ? 0 : (point.pressure ?? 0.5),
          tiltX: point.tiltX ?? 0,
          tiltY: point.tiltY ?? 0,
          timestamp: startStamp + point.t / 1000,
        });
      }
    },
  };
}

async function webkitWebInput(page: Page): Promise<WebInputDriver> {
  // Playwright refuses a wheel in a WebKit context that emulates a phone: read
  // the option it reads, the context's `isMobile`.
  const mobile =
    (page.context() as unknown as {_options?: {isMobile?: boolean}})._options
      ?.isMobile === true;
  return {
    engine: 'webkit',
    wheels: !mobile,
    pens: false,
    async wheel({x, y, dx = 0, dy = 0, ctrl = false}) {
      if (mobile) {
        throw new Error(`webInputDriver: ${WHEEL_SKIP}`);
      }
      await page.mouse.move(x, y);
      if (ctrl) {
        await page.keyboard.down('Control');
      }
      try {
        await page.mouse.wheel(dx, dy);
      } finally {
        if (ctrl) {
          await page.keyboard.up('Control');
        }
      }
    },
    async pen() {
      throw new Error(`webInputDriver: ${PEN_SKIP}`);
    },
  };
}

/** Wheel and pen input for the page's engine. Firefox is not supported (no project). */
export async function webInputDriver(page: Page): Promise<WebInputDriver> {
  const name = page.context().browser()?.browserType().name();
  if (name === 'chromium') {
    return chromiumWebInput(page);
  }
  if (name === 'webkit') {
    return webkitWebInput(page);
  }
  throw new Error(
    `webInputDriver: no wheel or pen input path for ${name ?? 'this browser'}`,
  );
}
