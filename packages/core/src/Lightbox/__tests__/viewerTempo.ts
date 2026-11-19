// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file viewerTempo.ts
 * @input themeTempo.ts, for the custom property Lightbox's motion reads its
 *   tempo from
 * @output `slowViewer`: plays the open viewer's motion at a slow tempo, 3
 *   unless a proof asks for another, until the function it returns runs
 * @position Test helper for the Lightbox interaction specs' busy-main-thread
 *   proofs
 */

import type {Page} from '@astryxdesign/a11y-spec/playwright';
import {themeTempo} from '../../motion/themeTempo';

/**
 * The custom property Lightbox's motion reads its tempo from, asked of
 * `themeTempo` itself. A rename there renames it here too.
 */
function tempoProperty(): string {
  let read = '';
  const view = {
    getComputedStyle: () => ({
      getPropertyValue: (name: string) => {
        read = name;
        return '';
      },
    }),
  };
  themeTempo({ownerDocument: {defaultView: view}} as unknown as Element);
  if (!read.startsWith('--')) {
    throw new Error(`themeTempo read no custom property: "${read}"`);
  }
  return read;
}

/**
 * Plays the open viewer's motion at `tempo`, through the property its motion
 * reads. A theme's tempo stops at 1.5, so a slower tempo is for these proofs
 * only. Every element in the viewer carries it, so no nested theme's own
 * tempo wins. Resolves with a function that puts the viewer's own tempo back.
 */
export async function slowViewer(
  page: Page,
  tempo = 3,
): Promise<() => Promise<void>> {
  const style = await page.addStyleTag({
    content: `dialog, dialog * { ${tempoProperty()}: ${tempo} !important; }`,
  });
  return async () => {
    await style.evaluate(element => {
      element.parentNode?.removeChild(element);
    });
    await style.dispose();
  };
}
