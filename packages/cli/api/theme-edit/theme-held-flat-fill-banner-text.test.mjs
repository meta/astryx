// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A reading held back from round 15 (part 10) for a follow-up: a
 * status's banner text changes its title and description without changing
 * its buttons. The asks stand here until the follow-up makes each one pass.
 * (Surfaces flat over a part's own fill is tested in
 * theme-flat-keeps-colored.test.mjs.)
 */

import {describe, it} from 'vitest';

describe("a status's text on a banner", () => {
  it.todo(
    '"success text bold" bolds the banner title and description in the success look; the banner buttons keep their weight',
  );
  it.todo(
    '"warning text 10px" sets the banner title and description to 10px in the warning look; the banner buttons keep their label size',
  );
  it.todo(
    '"bordered strip of buttons" draws a border around the buttons, never border none --on button',
  );
});
