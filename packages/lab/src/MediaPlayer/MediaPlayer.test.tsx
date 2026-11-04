// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as CoreHooks from '@astryxdesign/core/hooks';
import {AudioPlayer} from './AudioPlayer';
import {MediaPlayer} from './MediaPlayer';
import {useMediaPlayer} from './MediaPlayerContext';
import {MediaPlaybackRateMenu, MediaTimeSlider} from './MediaPlayerControls';
import {MediaPlayerAudio, MediaPlayerVideo} from './MediaPlayerMedia';
import {VideoPlayer} from './VideoPlayer';

const announce = vi.hoisted(() => vi.fn());

vi.mock('@astryxdesign/core/hooks', async importOriginal => {
  const actual = await importOriginal<typeof CoreHooks>();
  return {...actual, useAnnounce: () => announce};
});

interface FakeTrack {
  id: string;
  kind: string;
  label: string;
  language: string;
  mode: string;
}

/**
 * jsdom has no playback. This gives one media element playback state that
 * dispatches the events a browser would.
 */
function fakePlayback(
  element: HTMLMediaElement,
  {duration = 120, tracks = []}: {duration?: number; tracks?: FakeTrack[]} = {},
) {
  let paused = true;
  let ended = false;
  let currentTime = 0;
  let volume = 1;
  let muted = false;
  let playbackRate = 1;
  const fire = (type: string) => element.dispatchEvent(new Event(type));
  const textTracks = Object.assign(
    new EventTarget(),
    {length: tracks.length},
    tracks,
  );
  const play = vi.fn(() => {
    paused = false;
    ended = false;
    fire('play');
    fire('playing');
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    paused = true;
    fire('pause');
  });
  Object.defineProperties(element, {
    paused: {configurable: true, get: () => paused},
    ended: {configurable: true, get: () => ended},
    duration: {configurable: true, get: () => duration},
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
        fire('timeupdate');
      },
    },
    volume: {
      configurable: true,
      get: () => volume,
      set: (value: number) => {
        volume = value;
        fire('volumechange');
      },
    },
    muted: {
      configurable: true,
      get: () => muted,
      set: (value: boolean) => {
        muted = value;
        fire('volumechange');
      },
    },
    playbackRate: {
      configurable: true,
      get: () => playbackRate,
      set: (value: number) => {
        playbackRate = value;
        fire('ratechange');
      },
    },
    textTracks: {configurable: true, get: () => textTracks},
    play: {configurable: true, value: play},
    pause: {configurable: true, value: pause},
    load: {configurable: true, value: vi.fn()},
  });
  act(() => {
    fire('loadedmetadata');
  });
  return {
    play,
    pause,
    getCurrentTime: () => currentTime,
    getPlaybackRate: () => playbackRate,
    end: () =>
      act(() => {
        paused = true;
        ended = true;
        currentTime = duration;
        fire('ended');
      }),
  };
}

function renderVideoPlayer(
  props: Partial<Parameters<typeof VideoPlayer>[0]> = {},
) {
  const result = render(
    <VideoPlayer src="/clip.mp4" label="Product tour" {...props} />,
  );
  const video = result.container.querySelector('video');
  if (video == null) {
    throw new Error('VideoPlayer rendered no video element');
  }
  return {
    ...result,
    video,
    player: screen.getByRole('group', {name: 'Product tour'}),
  };
}

beforeEach(() => {
  announce.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('VideoPlayer', () => {
  it('renders a named, focusable group around the native video without its controls', () => {
    const {player, video} = renderVideoPlayer({poster: '/poster.jpg'});
    expect(player).toHaveAttribute('tabindex', '0');
    expect(player.classList.contains('astryx-media-player')).toBe(true);
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('poster', '/poster.jpg');
  });

  it('plays from the play button and then offers Pause', () => {
    const {video} = renderVideoPlayer();
    const playback = fakePlayback(video);
    fireEvent.click(screen.getAllByRole('button', {name: 'Play'})[0]!);
    expect(playback.play).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByRole('button', {name: 'Pause'}).length,
    ).toBeGreaterThan(0);
  });

  it('offers Replay after the media ends', () => {
    const {video} = renderVideoPlayer();
    const playback = fakePlayback(video);
    playback.end();
    expect(
      screen.getAllByRole('button', {name: 'Replay'}).length,
    ).toBeGreaterThan(0);
  });

  it('runs keyboard shortcuts scoped to the player and announces the change', async () => {
    const user = userEvent.setup();
    const {player, video} = renderVideoPlayer();
    const playback = fakePlayback(video);
    act(() => player.focus());
    await user.keyboard('k');
    expect(playback.play).toHaveBeenCalledTimes(1);
    await user.keyboard('m');
    expect(video.muted).toBe(true);
    expect(announce).toHaveBeenLastCalledWith('Muted');
    await user.keyboard('{ArrowRight}');
    expect(playback.getCurrentTime()).toBe(5);
    await user.keyboard('l');
    expect(playback.getCurrentTime()).toBe(15);
    await user.keyboard('5');
    expect(playback.getCurrentTime()).toBe(60);
    await user.keyboard('>');
    expect(playback.getPlaybackRate()).toBe(1.25);
  });

  it('leaves shortcut keys alone while a person types in a field inside the player', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Annotated clip">
        <MediaPlayerVideo src="/clip.mp4" />
        <input aria-label="Note" />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('video')!);
    await user.click(screen.getByRole('textbox', {name: 'Note'}));
    await user.keyboard('k');
    expect(playback.play).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', {name: 'Note'})).toHaveValue('k');
  });

  it('keeps the large play button out of the tab order and moves focus to the player when it starts playback', async () => {
    const user = userEvent.setup();
    const {player, video, container} = renderVideoPlayer();
    const playback = fakePlayback(video);
    await user.tab();
    expect(player).toHaveFocus();
    await user.tab();
    expect(document.activeElement).toHaveAccessibleName('Play');
    expect(document.activeElement).not.toHaveAttribute('aria-hidden');
    const largePlay = container.querySelector('button[aria-hidden="true"]');
    expect(largePlay).toHaveAttribute('tabindex', '-1');
    await user.click(largePlay!);
    expect(playback.play).toHaveBeenCalledTimes(1);
    expect(player).toHaveFocus();
    await user.keyboard('k');
    expect(playback.pause).toHaveBeenCalledTimes(1);
  });

  it('reports playback through its callbacks once per change', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onEnded = vi.fn();
    const onError = vi.fn();
    const {video} = renderVideoPlayer({onPlay, onPause, onEnded, onError});
    const playback = fakePlayback(video);
    await user.click(screen.getByRole('button', {name: 'Play'}));
    expect(onPlay).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', {name: 'Pause'}));
    expect(onPause).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', {name: 'Play'}));
    playback.end();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(2);
    act(() => {
      video.dispatchEvent(new Event('error'));
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading spinner out of the accessibility tree', () => {
    const {video} = renderVideoPlayer();
    fakePlayback(video);
    const statusCount = screen.queryAllByRole('status').length;
    act(() => {
      void video.play();
      video.dispatchEvent(new Event('waiting'));
    });
    expect(screen.queryAllByRole('status')).toHaveLength(statusCount);
    expect(screen.queryAllByRole('status', {hidden: true}).length).toBe(
      statusCount + 1,
    );
  });

  it('hides the controls after two idle seconds of playback and shows them on pointer movement', () => {
    vi.useFakeTimers();
    const {player, video, container} = renderVideoPlayer();
    fakePlayback(video);
    const bar = () => container.querySelector('[data-visible]');
    expect(bar()).toHaveAttribute('data-visible', 'true');
    act(() => {
      video.play();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bar()).toHaveAttribute('data-visible', 'false');
    expect(player).toHaveAttribute('data-controls', 'hidden');
    fireEvent.pointerMove(player, {pointerType: 'mouse'});
    expect(bar()).toHaveAttribute('data-visible', 'true');
  });

  it('keeps the controls visible while paused', () => {
    vi.useFakeTimers();
    const {video, container} = renderVideoPlayer();
    fakePlayback(video);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector('[data-visible]')).toHaveAttribute(
      'data-visible',
      'true',
    );
  });

  it('shows a retry action and announces a playback failure once', () => {
    const {video} = renderVideoPlayer();
    const playback = fakePlayback(video);
    act(() => {
      video.dispatchEvent(new Event('error'));
    });
    expect(announce).toHaveBeenCalledWith(
      "This media can't be played.",
      'assertive',
    );
    expect(announce).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
    expect(video.load).toHaveBeenCalledTimes(1);
    expect(playback.play).not.toHaveBeenCalled();
    expect(screen.getByRole('group', {name: 'Product tour'})).toHaveFocus();
  });

  it('on touch, shows the controls on a tap and hides them on the next tap only', () => {
    vi.useFakeTimers();
    const {player, video, container} = renderVideoPlayer();
    fakePlayback(video);
    const bar = () => container.querySelector('[data-visible]');
    const surface = player.querySelector(':scope > div[aria-hidden="true"]')!;
    const tap = () => {
      fireEvent.pointerDown(surface, {pointerType: 'touch'});
      fireEvent.click(surface);
    };
    act(() => {
      void video.play();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bar()).toHaveAttribute('data-visible', 'false');
    tap();
    expect(bar()).toHaveAttribute('data-visible', 'true');
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(bar()).toHaveAttribute('data-visible', 'true');
    tap();
    expect(bar()).toHaveAttribute('data-visible', 'false');
  });

  it('shows the captions toggle only when the media has a caption track', () => {
    const {video} = renderVideoPlayer();
    expect(screen.queryByRole('button', {name: 'Captions'})).toBeNull();
    const track: FakeTrack = {
      id: '',
      kind: 'captions',
      label: 'English',
      language: 'en',
      mode: 'disabled',
    };
    fakePlayback(video, {tracks: [track]});
    const toggle = screen.getByRole('button', {name: 'Captions'});
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(track.mode).toBe('showing');
    expect(screen.getByRole('button', {name: 'Captions'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('MediaTimeSlider', () => {
  function renderTimeline() {
    const {container} = render(
      <div dir="rtl">
        <MediaPlayer label="Clip">
          <MediaPlayerVideo src="/clip.mp4" />
          <MediaTimeSlider />
        </MediaPlayer>
      </div>,
    );
    const playback = fakePlayback(container.querySelector('video')!);
    return {
      container,
      playback,
      slider: screen.getByRole('slider', {name: 'Seek'}),
    };
  }

  it('runs left to right inside a right-to-left page', () => {
    const {slider} = renderTimeline();
    expect(slider.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });

  it('keeps the control row and the time readout left to right in a right-to-left page', () => {
    const {container} = render(
      <div dir="rtl">
        <VideoPlayer src="/clip.mp4" label="Clip" />
      </div>,
    );
    expect(container.querySelector('[data-visible]')).toHaveAttribute(
      'dir',
      'ltr',
    );
    expect(container.querySelector('.astryx-media-time')).toHaveAttribute(
      'dir',
      'ltr',
    );
  });

  it('speaks the time and the duration as its value', () => {
    const {slider} = renderTimeline();
    expect(slider.getAttribute('aria-valuetext')).toMatch(/ of /);
  });

  it('skips five seconds per arrow key and ten per page key', async () => {
    const user = userEvent.setup();
    const {slider, playback} = renderTimeline();
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}');
    expect(playback.getCurrentTime()).toBe(5);
    await user.keyboard('{PageUp}');
    expect(playback.getCurrentTime()).toBe(15);
    await user.keyboard('{ArrowLeft}');
    expect(playback.getCurrentTime()).toBe(10);
  });
});

describe('AudioPlayer', () => {
  function renderAudioPlayer() {
    const result = render(
      <AudioPlayer
        src="/episode.mp3"
        title="Designing for every screen"
        subtitle="The Interface Show"
        artworkSrc="/cover.jpg"
      />,
    );
    const audio = result.container.querySelector('audio');
    if (audio == null) {
      throw new Error('AudioPlayer rendered no audio element');
    }
    return {...result, audio};
  }

  it('names the player by its title and shows the subtitle', () => {
    renderAudioPlayer();
    const player = screen.getByRole('group', {
      name: 'Designing for every screen',
    });
    expect(within(player).getByText('The Interface Show')).toBeInTheDocument();
  });

  it('sits in a Section container and offers a volume slider', () => {
    const {container} = renderAudioPlayer();
    const player = screen.getByRole('group', {
      name: 'Designing for every screen',
    });
    expect(container.querySelector('.astryx-section')).toContainElement(player);
    expect(screen.getByRole('slider', {name: 'Volume'})).toBeInTheDocument();
  });

  it('skips back 15 seconds and forward 30 seconds by default', () => {
    const {audio} = renderAudioPlayer();
    const playback = fakePlayback(audio, {duration: 600});
    fireEvent.click(screen.getByRole('button', {name: 'Forward 30 seconds'}));
    expect(playback.getCurrentTime()).toBe(30);
    fireEvent.click(screen.getByRole('button', {name: 'Back 15 seconds'}));
    expect(playback.getCurrentTime()).toBe(15);
  });

  it('switches between normal speed and the chosen speed with its speed button and slider', async () => {
    const user = userEvent.setup();
    const {audio} = renderAudioPlayer();
    const playback = fakePlayback(audio, {duration: 600});
    const slider = screen.getByRole('slider', {name: 'Playback speed'});
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}');
    expect(playback.getPlaybackRate()).toBe(1.25);
    await user.click(
      screen.getByRole('button', {name: 'Playback speed, 1.25×'}),
    );
    expect(playback.getPlaybackRate()).toBe(1);
    await user.click(screen.getByRole('button', {name: 'Playback speed, 1×'}));
    expect(playback.getPlaybackRate()).toBe(1.25);
  });

  it('hands its metadata to the system media controls once it plays', () => {
    const setActionHandler = vi.fn();
    const session: Record<string, unknown> = {metadata: null, setActionHandler};
    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: session,
    });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public init: Record<string, unknown>) {}
      },
    );
    try {
      const {audio, unmount} = renderAudioPlayer();
      fakePlayback(audio, {duration: 600});
      expect(session.metadata).toBeNull();
      act(() => {
        void audio.play();
      });
      expect(
        (session.metadata as {init: Record<string, unknown>}).init,
      ).toMatchObject({
        title: 'Designing for every screen',
        artist: 'The Interface Show',
      });
      expect(setActionHandler).toHaveBeenCalledWith(
        'seekforward',
        expect.any(Function),
      );
      unmount();
      expect(session.metadata).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'mediaSession');
    }
  });
});

describe('MediaPlaybackRateMenu', () => {
  it('sets the playback speed from a menu that checks the current speed', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Episode">
        <MediaPlayerAudio src="/episode.mp3" />
        <MediaPlaybackRateMenu />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('audio')!, {
      duration: 600,
    });
    await user.click(screen.getByRole('button', {name: 'Playback speed, 1×'}));
    expect(
      screen.getByRole('menuitemradio', {name: '1×', hidden: true}),
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(
      screen.getByRole('menuitemradio', {name: '1.5×', hidden: true}),
    );
    expect(playback.getPlaybackRate()).toBe(1.5);
    expect(
      screen.getByRole('button', {name: 'Playback speed, 1.5×'}),
    ).toBeInTheDocument();
  });
});

describe('useMediaPlayer', () => {
  function Readout() {
    const {state, seek, setVolume, togglePaused} = useMediaPlayer();
    return (
      <>
        <output aria-label="Position">{Math.round(state.currentTime)}</output>
        <output aria-label="Level">{state.volume}</output>
        <output aria-label="Status">
          {state.isPaused ? 'paused' : 'playing'}
        </output>
        <button type="button" onClick={() => seek(42)}>
          Jump
        </button>
        <button type="button" onClick={() => setVolume(0.5)}>
          Half
        </button>
        <button type="button" onClick={() => togglePaused()}>
          Toggle
        </button>
      </>
    );
  }

  it('reads the player state and drives the player through its actions', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Memo">
        <MediaPlayerAudio src="/memo.m4a" />
        <Readout />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('audio')!);
    await user.click(screen.getByRole('button', {name: 'Jump'}));
    expect(screen.getByLabelText('Position')).toHaveTextContent('42');
    await user.click(screen.getByRole('button', {name: 'Half'}));
    expect(screen.getByLabelText('Level')).toHaveTextContent('0.5');
    await user.click(screen.getByRole('button', {name: 'Toggle'}));
    expect(playback.play).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Status')).toHaveTextContent('playing');
  });

  it('throws outside a MediaPlayer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMediaPlayer())).toThrow(
      /inside a MediaPlayer/,
    );
  });
});
