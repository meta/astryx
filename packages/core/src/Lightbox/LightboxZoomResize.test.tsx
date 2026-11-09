// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxZoomResize.test.tsx
 * @input Lightbox with `hasZoom`, mounted closed with no media, given its
 *   photos, then opened; the shared resize observer watched
 * @output Pins that the zoom follows a resize of its stage however the viewer
 *   first rendered. A stage that mounts after the viewer is subscribed once
 *   it exists
 * @position Unit test for useZoomCore.ts's resize subscription
 */

import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {observeResize} from '../utils/sharedResizeObserver';
import type * as SharedResizeObserver from '../utils/sharedResizeObserver';
import {Lightbox} from './Lightbox';

vi.mock('../utils/sharedResizeObserver', async importOriginal => {
  const actual = await importOriginal<typeof SharedResizeObserver>();
  return {...actual, observeResize: vi.fn(actual.observeResize)};
});

// The native dialog for jsdom, as Lightbox.test.tsx stubs it.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('Lightbox zoom and resizes', () => {
  it('subscribes its stage to resizes when it opens on photos that arrived after it mounted', () => {
    const photos = [{src: '/photo.jpg', alt: 'Photo'}];
    // Mounted closed while its photos load, as a gallery page does.
    const {rerender} = render(
      <Lightbox isOpen={false} onOpenChange={() => {}} media={[]} hasZoom />,
    );
    rerender(
      <Lightbox
        isOpen={false}
        onOpenChange={() => {}}
        media={photos}
        hasZoom
      />,
    );
    rerender(
      <Lightbox isOpen={true} onOpenChange={() => {}} media={photos} hasZoom />,
    );
    // The zoom target is the stage: a rotation while zoomed keeps the same
    // photo point centred only if its resizes reach the zoom.
    const stage = screen.getByRole('button', {name: 'Zoom'});
    const observed = vi
      .mocked(observeResize)
      .mock.calls.map(([element]) => element);
    expect(observed).toContain(stage);
  });
});
