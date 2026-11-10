// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.trackMarkers.interaction.browser.spec.ts
 * @input Real Chromium/WebKit in the interaction projects
 * @output Proof that one `trackMarkers` decode for a marker and a control
 *   finds, frame by frame, what one `trackMarker` decode per color finds.
 * @position Why a busy proof may track its subject and its control in one
 *   decode of each frame.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  CONTROL_RGB,
  MARKER_RGB,
  trackMarker,
  trackMarkers,
  type CastFrame,
} from './index';

test('one decode for a marker and a control finds what one decode per color finds', async ({
  page,
}) => {
  // Frames drawn in the page: the marker and the control apart, touching,
  // and each one missing from a frame.
  const width = 120;
  const height = 80;
  const scenes: {
    marker: [number, number, number, number] | null;
    control: [number, number, number, number] | null;
  }[] = [
    {marker: [10, 10, 20, 20], control: [70, 40, 16, 16]},
    {marker: [30, 12, 20, 20], control: [50, 12, 16, 16]},
    {marker: [50, 14, 20, 20], control: null},
    {marker: null, control: [60, 30, 16, 16]},
  ];
  const drawn = await page.evaluate(
    ({size, all, marker, control}) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (context == null) {
        throw new Error('no 2d context');
      }
      return all.map(scene => {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size.width, size.height);
        if (scene.marker != null) {
          context.fillStyle = `rgb(${marker.join(',')})`;
          context.fillRect(...scene.marker);
        }
        if (scene.control != null) {
          context.fillStyle = `rgb(${control.join(',')})`;
          context.fillRect(...scene.control);
        }
        return canvas
          .toDataURL('image/png')
          .slice('data:image/png;base64,'.length);
      });
    },
    {
      size: {width, height},
      all: scenes,
      marker: [...MARKER_RGB],
      control: [...CONTROL_RGB],
    },
  );
  const frames: CastFrame[] = drawn.map((data, index) => ({
    t: 1_000 + index * 16,
    data,
    format: 'png',
    viewportWidth: width,
    viewportHeight: height,
  }));
  const [marker, control] = await trackMarkers(page, frames, {
    colors: [MARKER_RGB, CONTROL_RGB],
  });
  expect(marker).toEqual(await trackMarker(page, frames));
  expect(control).toEqual(await trackMarker(page, frames, {rgb: CONTROL_RGB}));
  // Each decode found the boxes drawn, so equal results are not two misses.
  expect(marker.map(f => f.box?.x ?? null)).toEqual(
    scenes.map(scene => scene.marker?.[0] ?? null),
  );
  expect(control.map(f => f.box?.x ?? null)).toEqual(
    scenes.map(scene => scene.control?.[0] ?? null),
  );
  // Only the default marker carries the cast's step, in one decode as in two.
  expect(marker[0].step).toEqual({x: 1, y: 1});
  expect(control.map(f => f.step ?? null)).toEqual(scenes.map(() => null));
});
