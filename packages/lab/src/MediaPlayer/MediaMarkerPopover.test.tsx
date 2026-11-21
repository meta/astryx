// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MediaMarkerPopover.test.tsx
 * @input MediaPlayer, MediaPlayerElement and MediaTimeSlider with a marker
 *   that has content, and a popover module whose first load fails
 * @output Regression coverage for a marker popover that loads on demand: the
 *   marker button renders once, a press before the load opens the popover
 *   when it lands, and a failed load leaves the player and the marker working
 * @position Its own file so the popover module starts unloaded
 */

import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MediaPlayer} from './MediaPlayer';
import {MediaTimeSlider} from './MediaPlayerControls';
import {MediaPlayerElement} from './MediaPlayerElement';

const popoverLoad = vi.hoisted(() => ({failures: 0, attempts: 0}));

vi.mock('./MediaMarkerPopover', async importOriginal => {
  popoverLoad.attempts++;
  if (popoverLoad.failures > 0) {
    popoverLoad.failures--;
    throw new Error('Failed to fetch dynamically imported module');
  }
  return importOriginal();
});

/** Gives the video a duration and a current time, as a loaded clip has. */
function fakeClip(video: HTMLVideoElement) {
  let currentTime = 0;
  Object.defineProperties(video, {
    duration: {configurable: true, get: () => 60},
    paused: {configurable: true, get: () => true},
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
        video.dispatchEvent(new Event('timeupdate'));
      },
    },
  });
  act(() => {
    video.dispatchEvent(new Event('loadedmetadata'));
  });
  return {getCurrentTime: () => currentTime};
}

function renderMarker() {
  const {container} = render(
    <MediaPlayer label="Clip">
      <MediaPlayerElement kind="video" src="/clip.mp4" />
      <MediaTimeSlider
        markers={[{time: 20, label: 'Lin: hold on this', content: 'Nice cut'}]}
      />
    </MediaPlayer>,
  );
  const clip = fakeClip(container.querySelector('video')!);
  return {container, clip};
}

describe('marker popover loaded on demand', () => {
  beforeEach(() => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
  });

  it('keeps the player and the marker working when the load fails, and loads on the next press', async () => {
    // Every load fails until the connection comes back.
    popoverLoad.failures = Infinity;
    const user = userEvent.setup();
    const {container, clip} = renderMarker();
    const marker = screen.getByRole('button', {name: 'Lin: hold on this'});
    // The button carries its popover contract before the popover loads.
    expect(marker).toHaveAttribute('aria-haspopup', 'dialog');
    expect(marker).toHaveAttribute('aria-expanded', 'false');
    expect(marker).not.toHaveAttribute('aria-controls');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await user.click(marker);
    expect(clip.getCurrentTime()).toBe(20);
    await waitFor(() => expect(popoverLoad.attempts).toBeGreaterThan(0));
    await act(async () => {});
    // Development builds warn once, however many loads failed.
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("A marker's popover did not load"),
      ),
    ).toHaveLength(1);
    warn.mockRestore();
    // The failed load left the player and its marker in place.
    expect(container.querySelector('video')).not.toBeNull();
    expect(screen.getByRole('button', {name: 'Lin: hold on this'})).toBe(
      marker,
    );
    expect(marker).toHaveAttribute('aria-expanded', 'false');

    // The next press asks again; the popover opens once it loads, from the
    // same button.
    popoverLoad.failures = 0;
    const failedAttempts = popoverLoad.attempts;
    await user.click(marker);
    expect(await screen.findByText('Nice cut')).toBeInTheDocument();
    expect(popoverLoad.attempts).toBeGreaterThan(failedAttempts);
    expect(screen.getByRole('button', {name: 'Lin: hold on this'})).toBe(
      marker,
    );
    await waitFor(() =>
      expect(marker).toHaveAttribute('aria-expanded', 'true'),
    );

    // Closed again, the loaded marker carries the same ARIA as before the
    // load: no reference to the closed popover.
    await user.click(marker);
    await waitFor(() =>
      expect(marker).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(marker).toHaveAttribute('aria-haspopup', 'dialog');
    expect(marker).not.toHaveAttribute('aria-controls');
  });
});
