// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pseudoParts.ts
 * @input A Playwright page showing a SearchField story, and the interaction
 *   harness's held animations (`holdAnimations`, `seekAnimations`)
 * @output The field's background pieces as parts a browser proof reads:
 *   their presented translate, scale and opacity now (`readPart`), at each
 *   held time (`samplePart`: a seek, then the pseudo-element's computed
 *   style), their box on the page (`partBox`), and a wait until one stops
 *   moving (`waitForPartRest`)
 * @position Testing helper for SearchField's browser proofs. The harness
 *   reads an element's own presented style, and the field's rounded ends and
 *   scaling middle are pseudo-elements
 *   (architecture:component-style-authoring INV7), so they are read through
 *   `getComputedStyle(host, pseudo)`
 */

import type {Page} from '@playwright/test';
import {seekAnimations} from '@astryxdesign/interaction-harness';

/** One background piece: its host element and its pseudo-element. */
export interface Part {
  /**
   * `field`: the box around the input (the search landmark's first child,
   * in every placement); `end`: the trailing part.
   */
  readonly host: 'field' | 'end';
  readonly pseudo: '::before' | '::after';
}

/** The leading rounded end: the field's ::before. */
export const START: Part = {host: 'field', pseudo: '::before'};
/** The middle that scales: the field's ::after. */
export const MIDDLE: Part = {host: 'field', pseudo: '::after'};
/** The trailing rounded end: the trailing part's ::before. */
export const END_CAP: Part = {host: 'end', pseudo: '::before'};

/** A piece's presented translate, scale and opacity. */
export interface PartSample {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly opacity: number;
}

/** A piece's box on the page, px, as it is presented. */
export interface PartBox {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The piece's presented values, read in the page. */
export function readPart(page: Page, part: Part): Promise<PartSample> {
  return page.evaluate(
    ({host, pseudo}) => {
      const field = document.querySelector('[role="search"]')
        ?.firstElementChild as HTMLElement | null | undefined;
      const element =
        host === 'field'
          ? field
          : document.querySelector<HTMLElement>('[data-search-field-end]');
      if (element == null) {
        throw new Error(`readPart: no ${host} element`);
      }
      const style = getComputedStyle(element, pseudo);
      const translate =
        style.translate === 'none'
          ? [0, 0]
          : style.translate.split(' ').map(value => Number.parseFloat(value));
      const scale =
        style.scale === 'none'
          ? [1, 1]
          : style.scale.split(' ').map(value => Number(value));
      return {
        translateX: translate[0] ?? 0,
        translateY: translate[1] ?? 0,
        scaleX: scale[0] ?? 1,
        // One value scales both axes.
        scaleY: scale[1] ?? scale[0] ?? 1,
        opacity: Number(style.opacity),
      };
    },
    {host: part.host, pseudo: part.pseudo},
  );
}

/**
 * The piece's presented values at each time (ms from the held origin, as for
 * `seekAnimations`): hold the animations first. Each time seeks every held
 * animation, the pseudo-element's included, then reads the piece.
 */
export async function samplePart(
  page: Page,
  part: Part,
  times: readonly number[],
): Promise<PartSample[]> {
  const samples: PartSample[] = [];
  for (const t of times) {
    await seekAnimations(page, t);
    samples.push(await readPart(page, part));
  }
  return samples;
}

/**
 * The piece's box on the page as presented: its used box inside its host,
 * moved and scaled about its own transform origin.
 */
export function partBox(page: Page, part: Part): Promise<PartBox> {
  return page.evaluate(
    ({host, pseudo}) => {
      const field = document.querySelector('[role="search"]')
        ?.firstElementChild as HTMLElement | null | undefined;
      const element =
        host === 'field'
          ? field
          : document.querySelector<HTMLElement>('[data-search-field-end]');
      if (element == null) {
        throw new Error(`partBox: no ${host} element`);
      }
      const style = getComputedStyle(element, pseudo);
      const rect = element.getBoundingClientRect();
      const translate =
        style.translate === 'none'
          ? [0, 0]
          : style.translate.split(' ').map(value => Number.parseFloat(value));
      const scale =
        style.scale === 'none'
          ? [1, 1]
          : style.scale.split(' ').map(value => Number(value));
      const scaleX = scale[0] ?? 1;
      const scaleY = scale[1] ?? scale[0] ?? 1;
      const [originX, originY] = style.transformOrigin
        .split(' ')
        .map(value => Number.parseFloat(value));
      const left = rect.left + Number.parseFloat(style.left);
      const top = rect.top + Number.parseFloat(style.top);
      const width = Number.parseFloat(style.width);
      const height = Number.parseFloat(style.height);
      const x = left + (translate[0] ?? 0) + originX * (1 - scaleX);
      const y = top + (translate[1] ?? 0) + originY * (1 - scaleY);
      return {
        left: x,
        right: x + width * scaleX,
        top: y,
        bottom: y + height * scaleY,
      };
    },
    {host: part.host, pseudo: part.pseudo},
  );
}

/**
 * Resolves once the piece's presented translate, scale and opacity have held
 * still for `frames` consecutive frames; rejects after `timeout` ms.
 */
export async function waitForPartRest(
  page: Page,
  part: Part,
  {timeout = 5_000, frames = 3}: {timeout?: number; frames?: number} = {},
): Promise<void> {
  await page.evaluate(
    ({host, pseudo, ms, need}) =>
      new Promise<void>((resolve, reject) => {
        const field = document.querySelector('[role="search"]')
          ?.firstElementChild as HTMLElement | null | undefined;
        const element =
          host === 'field'
            ? field
            : document.querySelector<HTMLElement>('[data-search-field-end]');
        if (element == null) {
          reject(new Error(`waitForPartRest: no ${host} element`));
          return;
        }
        const deadline = performance.now() + ms;
        const read = () => {
          const style = getComputedStyle(element, pseudo);
          return [style.translate, style.scale, style.opacity].join(' | ');
        };
        let last = read();
        let still = 0;
        const tick = () => {
          const now = read();
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= need) {
            resolve();
          } else if (performance.now() > deadline) {
            reject(new Error(`waitForPartRest: ${host}${pseudo} still moving`));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    {host: part.host, pseudo: part.pseudo, ms: timeout, need: frames},
  );
}
