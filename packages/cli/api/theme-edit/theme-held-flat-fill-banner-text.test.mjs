// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Readings held back from round 15 (part 10) for a follow-up: a fill
 * the theme sets on a surface part wins over a surface look in every way it
 * can be set, and a status's banner text changes its title and description
 * without changing its buttons. The asks stand here until the follow-up
 * makes each one pass.
 */

import {describe, it} from 'vitest';

describe('surfaces flat over a fill the theme sets on the part', () => {
  it.todo(
    'a card fill set on card, before or after `surfaces flat`, stays the card fill (no flat fill on card or its plain variants)',
  );
  it.todo(
    'a card fill set through a group (`--on containers`) wins over flat the same way',
  );
  it.todo(
    "a card fill set for one mode (`--mode dark`) keeps flat's fill in the other mode",
  );
  it.todo(
    'flat keeps the colored and status variants their own fill: a blue card stays blue',
  );
});

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
