// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PresentedHitTestingLab.test.tsx
 * @input Uses PresentedHitTestingLab, stubMatchMedia and Testing Library
 * @output Tests for the device-check harness's readouts
 * @position The harness measures every touch at the page root, because on
 *   iOS WebKit a touch on the moving sheet targets the scrim.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import {PresentedHitTestingLab} from './PresentedHitTestingLab';
import {stubMatchMedia} from './stubMatchMedia';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PresentedHitTestingLab', () => {
  it('logs and measures a touch that the engine sends to the scrim', () => {
    stubMatchMedia({reduceMotion: false, matches: false});
    render(<PresentedHitTestingLab />);
    // The scrim sits just before the sheet.
    const scrim = screen.getByRole('region', {
      name: 'Sheet',
    }).previousElementSibling;
    if (scrim == null) {
      throw new Error('no scrim');
    }
    fireEvent.touchStart(scrim, {touches: [{clientX: 10, clientY: 10}]});
    fireEvent.touchEnd(scrim, {touches: []});
    expect(
      screen.getByText(/touch-down: the engine hit-tested the scrim/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/page scrolled 0 px in the last touch/),
    ).toBeInTheDocument();
  });

  it('says when Reduce Motion is on, since the sheet then does not move', () => {
    stubMatchMedia({reduceMotion: true, matches: false});
    render(<PresentedHitTestingLab />);
    expect(screen.getByText(/Reduce Motion is on/)).toBeInTheDocument();
  });
});
