// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A dialog drawn in its sheet cell is not in the top layer, so the
 * browser draws no backdrop for it. One with no background of its own (a
 * lightbox, whose close button is drawn for the dark backdrop) is drawn in
 * its backdrop's colour; one with its own background keeps it.
 */

import {describe, expect, it} from 'vitest';
import {PLACE_LAYERS} from '../../foundation/render/picture-window.mjs';

/**
 * A dialog stand-in with its own background and its backdrop's.
 * @param {string} own
 * @param {string} backdrop
 */
function dialog(own, backdrop) {
  /** @type {Record<string, string>} */
  const set = {};
  return {
    own,
    backdrop,
    set,
    getBoundingClientRect: () => ({width: 400}),
    style: {
      setProperty: (/** @type {string} */ k, /** @type {string} */ v) =>
        (set[k] = v),
    },
  };
}

describe('a dialog drawn in its cell', () => {
  it('with no background of its own is drawn in its backdrop colour', () => {
    const lightbox = dialog('rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.5)');
    const panel = dialog('rgb(255, 255, 255)', 'rgba(0, 0, 0, 0.5)');
    const bare = dialog('rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)');
    const document = {
      querySelectorAll: (/** @type {string} */ q) =>
        q.includes('dialog') ? [lightbox, panel, bare] : [],
    };
    const getComputedStyle = (
      /** @type {ReturnType<typeof dialog>} */ d,
      /** @type {string | undefined} */ pseudo,
    ) => ({backgroundColor: pseudo === '::backdrop' ? d.backdrop : d.own});
    new Function('document', 'window', 'getComputedStyle', PLACE_LAYERS)(
      document,
      {innerWidth: 1280},
      getComputedStyle,
    );
    expect(lightbox.set['background-color']).toBe('rgba(0, 0, 0, 0.5)');
    expect(panel.set['background-color']).toBeUndefined();
    expect(bare.set['background-color']).toBeUndefined();
  });
});
