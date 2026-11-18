// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.trackMarkers.interaction.browser.spec.ts
 * @input Real Chromium/WebKit in the interaction projects
 * @output Proof that one `trackMarkers` decode for a marker and a control
 *   finds, frame by frame, what one `trackMarker` decode per color finds. A
 *   color with its own region is searched only there.
 * @position Why a busy proof may track its subject and its controls in one
 *   decode of each frame.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  CONTROL_RGB,
  CONTROL_SIDE,
  controlColor,
  markElement,
  MARKER_RGB,
  startBusyControl,
  startScreencast,
  trackControl,
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
  // Each call gets its own copy of the frames.
  const [marker, control] = await trackMarkers(page, [...frames], {
    colors: [MARKER_RGB, CONTROL_RGB],
  });
  expect(marker).toEqual(await trackMarker(page, [...frames]));
  expect(control).toEqual(
    await trackMarker(page, [...frames], {rgb: CONTROL_RGB}),
  );
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

test('a color with its own region is searched only there, in the same decode', async ({
  page,
}) => {
  // Frames drawn in the page: the marker below the strips, the control in
  // its strip, and a control-colored decoy outside it.
  const width = 300;
  const height = 90;
  const scenes: {
    marker: [number, number, number, number];
    control: [number, number, number, number] | null;
    decoy: [number, number, number, number] | null;
  }[] = [
    {
      marker: [20, 50, 16, 16],
      control: [10, 0, 12, 12],
      decoy: [200, 60, 20, 20],
    },
    {
      marker: [40, 52, 16, 16],
      control: [60, 0, 12, 12],
      decoy: [180, 40, 20, 20],
    },
    {marker: [60, 54, 16, 16], control: [110, 0, 12, 12], decoy: null},
    {marker: [80, 56, 16, 16], control: null, decoy: [160, 70, 12, 12]},
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
        context.fillStyle = `rgb(${marker.join(',')})`;
        context.fillRect(...scene.marker);
        context.fillStyle = `rgb(${control.join(',')})`;
        if (scene.control != null) {
          context.fillRect(...scene.control);
        }
        if (scene.decoy != null) {
          context.fillRect(...scene.decoy);
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
  const [marker, control] = await trackMarkers(page, [...frames], {
    colors: [MARKER_RGB, controlColor()],
  });
  expect(marker).toEqual(await trackMarker(page, [...frames]));
  expect(control).toEqual(await trackControl(page, [...frames]));
  // The control's region skips the decoy: its boxes are the ones drawn in
  // the strip, and a frame without the control finds none.
  expect(control.map(f => f.box)).toEqual(
    scenes.map(scene =>
      scene.control == null
        ? null
        : {
            x: scene.control[0],
            y: scene.control[1],
            width: scene.control[2],
            height: scene.control[3],
          },
    ),
  );
  expect(
    control.every(f => f.box == null || f.box.y + f.box.height <= CONTROL_SIDE),
  ).toBe(true);
  // The same color searched in the whole frame finds the decoy too.
  const anywhere = await trackMarker(page, [...frames], {rgb: CONTROL_RGB});
  expect(anywhere.map(f => f.box != null)).toEqual(
    scenes.map(scene => scene.control != null || scene.decoy != null),
  );
  expect(anywhere[0].box?.height).toBeGreaterThan(CONTROL_SIDE);
});

test('one decode for a marker and both controls in a recorded cast finds what one decode each finds', async ({
  page,
}) => {
  // A viewport meta, or the mobile viewport lays the page out wider and
  // shrinks it, and the controls leave their strips.
  await page.setContent(
    '<meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fff}</style><div id="subject" style="position:fixed;left:20px;top:60px;width:200px;height:60px;background:#fff"></div>',
  );
  const subject = page.locator('#subject');
  await markElement(subject);
  const first = await startBusyControl(page);
  const ahead = await startBusyControl(page, {ahead: true});
  await subject.evaluate(element => {
    element.animate(
      [{transform: 'translateX(0)'}, {transform: 'translateX(160px)'}],
      {duration: 600, iterations: Infinity, direction: 'alternate'},
    );
  });
  const cast = await startScreencast(page);
  await page.waitForTimeout(800);
  const frames = await cast.stop();
  await first.remove();
  await ahead.remove();
  // Each call gets its own copy of the frames.
  const [marker, control, controlAhead] = await trackMarkers(
    page,
    [...frames],
    {colors: [MARKER_RGB, controlColor(), controlColor({ahead: true})]},
  );
  expect(marker).toEqual(await trackMarker(page, [...frames]));
  expect(control).toEqual(await trackControl(page, [...frames]));
  expect(controlAhead).toEqual(
    await trackControl(page, [...frames], {ahead: true}),
  );
  // Equal tracks are not misses: each found its box in most frames.
  for (const track of [marker, control, controlAhead]) {
    expect(track.filter(f => f.box != null).length).toBeGreaterThan(
      frames.length / 2,
    );
  }
});
