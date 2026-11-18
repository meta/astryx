// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file press.test.ts
 * @input PRESS_BELIEVED_SELECTOR and hand-built press markup.
 * @output Which elements a believed press reaches under a coarse pointer.
 * @position Unit tests for the private press attribute's selector.
 */

import {afterEach, describe, expect, it} from 'vitest';
import {PRESS_BELIEVED_SELECTOR} from './press';

function mount(html: string) {
  document.body.innerHTML = html;
  return (id: string) =>
    document.getElementById(id)!.matches(PRESS_BELIEVED_SELECTOR);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PRESS_BELIEVED_SELECTOR', () => {
  it('reaches the pressed element and the themed parts inside it', () => {
    // Switch marks its unclassed row; the themed track and thumb sit inside.
    const matches = mount(`
      <div id="row" data-astryx-pressable data-astryx-press="on">
        <span id="track" class="astryx-switch"><span id="thumb"></span></span>
      </div>`);
    expect(matches('row')).toBe(true);
    expect(matches('track')).toBe(true);
    expect(matches('thumb')).toBe(true);
  });

  it('does not reach a control inside a pressed row', () => {
    const matches = mount(`
      <div id="row" data-astryx-pressable data-astryx-press="on">
        <span id="label">Label</span>
        <button id="button" data-astryx-pressable><span id="icon"></span></button>
      </div>`);
    expect(matches('row')).toBe(true);
    expect(matches('label')).toBe(true);
    expect(matches('button')).toBe(false);
    expect(matches('icon')).toBe(false);
  });

  it('does not reach a pressable row around a pressed control', () => {
    const matches = mount(`
      <div id="row" data-astryx-pressable>
        <button id="button" data-astryx-pressable data-astryx-press="on"></button>
      </div>`);
    expect(matches('button')).toBe(true);
    expect(matches('row')).toBe(false);
  });

  it('reaches a non-pressable themed element around the pressed one', () => {
    const matches = mount(`
      <span id="wrapper" class="astryx-checkbox">
        <input id="input" data-astryx-pressable data-astryx-press="on" />
      </span>`);
    expect(matches('wrapper')).toBe(true);
  });

  it('matches nothing while no press is believed', () => {
    const matches = mount(`
      <div id="row" data-astryx-pressable>
        <button id="button" data-astryx-pressable></button>
      </div>`);
    expect(matches('row')).toBe(false);
    expect(matches('button')).toBe(false);
  });
});
