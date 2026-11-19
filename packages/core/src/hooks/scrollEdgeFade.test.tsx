// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
// Table's plugin styles use this loose type, as the off style does there.
import type {StyleXStyles} from '../theme/types';
import {scrollEdgeFadeOff, scrollEdgeFadeStyles} from './scrollEdgeFade';
import type {ScrollAxisState} from './useScrollableArea';

function fadeLengths(...styles: StyleXStyles[]) {
  const {container} = render(<div {...stylex.props(...styles)} />);
  const style = getComputedStyle(container.firstElementChild!);
  return {
    mask: style.getPropertyValue('mask-image') !== '',
    start: style.getPropertyValue('--_scroll-fade-start-1'),
    end: style.getPropertyValue('--_scroll-fade-end-1'),
  };
}

const axis = (
  isScrollable: boolean,
  atStart: boolean,
  atEnd: boolean,
): ScrollAxisState => ({isScrollable, atStart, atEnd});

describe('scrollEdgeFadeStyles', () => {
  it('adds no style when the inline axis does not scroll', () => {
    expect(scrollEdgeFadeStyles(axis(false, true, true))).toBeNull();
  });

  it('fades only the end edge at the start of the content', () => {
    const lengths = fadeLengths(scrollEdgeFadeStyles(axis(true, true, false)));
    expect(lengths.start).toBe('0px');
    expect(lengths.end).not.toBe('0px');
  });

  it('fades both edges in the middle of the content', () => {
    const lengths = fadeLengths(scrollEdgeFadeStyles(axis(true, false, false)));
    expect(lengths.start).not.toBe('0px');
    expect(lengths.end).not.toBe('0px');
  });

  it('fades only the start edge at the end of the content', () => {
    const lengths = fadeLengths(scrollEdgeFadeStyles(axis(true, false, true)));
    expect(lengths.start).not.toBe('0px');
    expect(lengths.end).toBe('0px');
  });

  it('masks a viewport that hides its scrollbar with every pointer', () => {
    expect(
      fadeLengths(scrollEdgeFadeStyles(axis(true, false, false), 'hidden'))
        .mask,
    ).toBe(true);
  });

  it('leaves a viewport with its native scrollbar unmasked under a fine pointer', () => {
    expect(
      fadeLengths(scrollEdgeFadeStyles(axis(true, false, false))).mask,
    ).toBe(false);
  });

  it('lets an adopter turn off the fade on an edge it marks another way', () => {
    const lengths = fadeLengths(
      scrollEdgeFadeStyles(axis(true, false, false)),
      scrollEdgeFadeOff.start,
    );
    expect(lengths.start).toBe('0px');
    expect(lengths.end).not.toBe('0px');
  });
});
