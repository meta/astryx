// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as CoreHooks from '@astryxdesign/core/hooks';
import {MediaPlayer} from './MediaPlayer';
import {useMediaPlaybackTime, useMediaPlayer} from './MediaPlayerContext';
import {
  MediaPlayButton,
  MediaPlaybackRate,
  MediaTimeSlider,
  MediaVolume,
} from './MediaPlayerControls';
import {MediaPlayerElement} from './MediaPlayerElement';

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

function renderPlayer(props: Partial<Parameters<typeof MediaPlayer>[0]> = {}) {
  const result = render(
    <MediaPlayer label="Product tour" {...props}>
      <MediaPlayerElement kind="video" src="/clip.mp4" />
      <MediaPlayButton />
      <MediaTimeSlider />
    </MediaPlayer>,
  );
  const video = result.container.querySelector('video');
  if (video == null) {
    throw new Error('MediaPlayer rendered no video element');
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

describe('MediaPlayer', () => {
  it('runs keyboard shortcuts scoped to the player and announces the change', async () => {
    const user = userEvent.setup();
    const {player, video} = renderPlayer();
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

  it('runs its shortcuts when the whole player sits inside a popover', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <div popover="manual">
        <MediaPlayer label="Clip in a popover">
          <MediaPlayerElement kind="video" src="/clip.mp4" />
        </MediaPlayer>
      </div>,
    );
    const playback = fakePlayback(container.querySelector('video')!);
    act(() =>
      screen
        .getByRole('group', {name: 'Clip in a popover', hidden: true})
        .focus(),
    );
    await user.keyboard('k');
    expect(playback.play).toHaveBeenCalledTimes(1);
  });

  it('leaves shortcut keys alone while a person types in a field inside the player', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Annotated clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <input aria-label="Note" />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('video')!);
    await user.click(screen.getByRole('textbox', {name: 'Note'}));
    await user.keyboard('k');
    expect(playback.play).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', {name: 'Note'})).toHaveValue('k');
  });

  it('reports playback through its callbacks once per change', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onEnded = vi.fn();
    const {video} = renderPlayer({onPlay, onPause, onEnded});
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
  });

  it('calls the callbacks of the latest render', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    const {video, rerender} = renderPlayer({onPlay: first});
    fakePlayback(video);
    rerender(
      <MediaPlayer label="Product tour" onPlay={second}>
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaPlayButton />
        <MediaTimeSlider />
      </MediaPlayer>,
    );
    await user.click(screen.getByRole('button', {name: 'Play'}));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('hides the controls after two idle seconds of playback and shows them on pointer movement', () => {
    vi.useFakeTimers();
    const {player, video} = renderPlayer();
    fakePlayback(video);
    expect(player).toHaveAttribute('data-controls', 'visible');
    act(() => {
      video.play();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(player).toHaveAttribute('data-controls', 'hidden');
    fireEvent.pointerMove(player, {pointerType: 'mouse'});
    expect(player).toHaveAttribute('data-controls', 'visible');
  });

  it('keeps the controls visible while paused', () => {
    vi.useFakeTimers();
    const {player, video} = renderPlayer();
    fakePlayback(video);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(player).toHaveAttribute('data-controls', 'visible');
  });

  it('keeps the controls up while keyboard focus is inside the player', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true});
    const user = userEvent.setup({advanceTimers: vi.advanceTimersByTime});
    const {player, video} = renderPlayer();
    fakePlayback(video);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', {name: 'Play'})).toHaveFocus();
    act(() => {
      void video.play();
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(player).toHaveAttribute('data-controls', 'visible');
  });

  it('hides the controls when a mouse that clicked the timeline leaves', () => {
    vi.useFakeTimers();
    const {player, video} = renderPlayer();
    fakePlayback(video);
    act(() => {
      void video.play();
    });
    const slider = screen.getByRole('slider', {name: 'Seek'});
    // A mouse click: the pointer moves focus to the slider's thumb.
    fireEvent.pointerDown(slider, {pointerType: 'mouse'});
    fireEvent.mouseDown(slider);
    act(() => slider.focus());
    fireEvent.pointerUp(slider, {pointerType: 'mouse'});
    fireEvent.pointerLeave(player, {pointerType: 'mouse'});
    expect(player).toHaveAttribute('data-controls', 'hidden');
  });
});

describe('MediaTimeSlider', () => {
  function renderTimeline() {
    const {container} = render(
      <div dir="rtl">
        <MediaPlayer label="Clip">
          <MediaPlayerElement kind="video" src="/clip.mp4" />
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

  it('speaks the time and the duration as its value', () => {
    const {slider} = renderTimeline();
    expect(slider.getAttribute('aria-valuetext')).toMatch(/ of /);
  });

  it('reads the timeline position once per hover, not on every pointer move', () => {
    const {container, slider} = renderTimeline();
    const wrapper = slider.closest('[dir="ltr"]') as HTMLElement;
    const read = vi.spyOn(wrapper, 'getBoundingClientRect');
    fireEvent.pointerEnter(wrapper, {pointerType: 'mouse'});
    for (const clientX of [10, 20, 30]) {
      fireEvent.pointerMove(wrapper, {pointerType: 'mouse', clientX});
    }
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.scroll(window);
    fireEvent.pointerMove(wrapper, {pointerType: 'mouse', clientX: 40});
    expect(read).toHaveBeenCalledTimes(2);
    expect(container).toBeTruthy();
  });

  it('removes its scroll listener when the pointer leaves', () => {
    const {slider} = renderTimeline();
    const wrapper = slider.closest('[dir="ltr"]') as HTMLElement;
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    fireEvent.pointerEnter(wrapper, {pointerType: 'mouse'});
    fireEvent.pointerMove(wrapper, {pointerType: 'mouse', clientX: 10});
    fireEvent.pointerLeave(wrapper, {pointerType: 'mouse'});
    const added = add.mock.calls.filter(([type]) => type === 'scroll');
    const removed = remove.mock.calls.filter(([type]) => type === 'scroll');
    expect(added).toHaveLength(1);
    expect(removed.some(([, listener]) => listener === added[0]![1])).toBe(
      true,
    );
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

describe('MediaPlaybackRate', () => {
  it('keeps keys typed in its open menu out of the player shortcuts', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaPlaybackRate variant="menu" />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('video')!);
    await user.click(screen.getByRole('button', {name: 'Playback speed, 1×'}));
    const item = screen.getByRole('menuitemradio', {
      name: '1.5×',
      hidden: true,
    });
    act(() => item.focus());
    await user.keyboard('k');
    await user.keyboard('1');
    expect(playback.play).not.toHaveBeenCalled();
    expect(playback.getCurrentTime()).toBe(0);
  });

  it('sets the playback speed from a menu that checks the current speed', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Episode">
        <MediaPlayerElement kind="audio" src="/episode.mp3" />
        <MediaPlaybackRate variant="menu" />
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

  it('reflects its variant and keeps the slider out of the menu variant', () => {
    const {container} = render(
      <MediaPlayer label="Episode">
        <MediaPlayerElement kind="audio" src="/episode.mp3" />
        <MediaPlaybackRate variant="menu" />
      </MediaPlayer>,
    );
    expect(
      container.querySelector('.astryx-media-playback-rate'),
    ).toHaveAttribute('data-variant', 'menu');
    expect(
      screen.queryByRole('slider', {name: 'Playback speed'}),
    ).not.toBeInTheDocument();
  });
});

describe('MediaVolume', () => {
  it('pairs Mute with a volume slider before it by default', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Episode">
        <MediaPlayerElement kind="audio" src="/episode.mp3" />
        <MediaVolume />
      </MediaPlayer>,
    );
    fakePlayback(container.querySelector('audio')!);
    const group = container.querySelector('.astryx-media-volume')!;
    const slider = within(group as HTMLElement).getByRole('slider', {
      name: 'Volume',
    });
    const mute = within(group as HTMLElement).getByRole('button', {
      name: 'Mute',
    });
    expect(
      slider.compareDocumentPosition(mute) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(mute);
    expect(
      within(group as HTMLElement).getByRole('button', {name: 'Unmute'}),
    ).toBeInTheDocument();
  });

  it('renders Mute alone without its slider', () => {
    render(
      <MediaPlayer label="Episode">
        <MediaPlayerElement kind="audio" src="/episode.mp3" />
        <MediaVolume hasSlider={false} />
      </MediaPlayer>,
    );
    expect(screen.getByRole('button', {name: 'Mute'})).toBeInTheDocument();
    expect(
      screen.queryByRole('slider', {name: 'Volume'}),
    ).not.toBeInTheDocument();
  });
});

describe('MediaPlayerElement', () => {
  it('renders the native element for its kind without the browser controls', () => {
    const {container, rerender} = render(
      <MediaPlayer label="Episode">
        <MediaPlayerElement kind="audio" src="/episode.mp3" />
      </MediaPlayer>,
    );
    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', '/episode.mp3');
    expect(audio).not.toHaveAttribute('controls');
    expect(audio).toHaveAttribute('data-kind', 'audio');
    rerender(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" poster="/clip.jpg" />
      </MediaPlayer>,
    );
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('poster', '/clip.jpg');
    expect(video).toHaveAttribute('playsinline');
    expect(video).not.toHaveAttribute('controls');
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
        <MediaPlayerElement kind="audio" src="/memo.m4a" />
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

  it('reports the playback time while paused, as the media reports it', () => {
    function Readout() {
      return <span data-testid="time">{useMediaPlaybackTime()}</span>;
    }
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <Readout />
      </MediaPlayer>,
    );
    const video = container.querySelector('video')!;
    fakePlayback(video, {duration: 60});
    act(() => {
      video.currentTime = 12;
    });
    expect(screen.getByTestId('time')).toHaveTextContent('12');
  });

  it('shows a jump in the render that reports it, not one frame later', () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const seen: number[] = [];
    function Readout() {
      const time = useMediaPlaybackTime();
      seen.push(time);
      return <span data-testid="time">{time}</span>;
    }
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <Readout />
      </MediaPlayer>,
    );
    const video = container.querySelector('video')!;
    fakePlayback(video, {duration: 60});
    act(() => {
      void video.play();
    });
    // One animation frame while playing, about a second in.
    act(() => {
      frameCallback?.(performance.now() + 1000);
    });
    seen.length = 0;
    act(() => {
      video.currentTime = 40;
    });
    expect(seen[0]).toBe(40);
  });

  it('does not count a paused interval when playback resumes', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    function Readout() {
      return <span data-testid="time">{useMediaPlaybackTime()}</span>;
    }
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <Readout />
      </MediaPlayer>,
    );
    const video = container.querySelector('video')!;
    fakePlayback(video, {duration: 60});
    // Thirty seconds pass before playback starts.
    now = 31000;
    act(() => {
      void video.play();
    });
    act(() => {
      frameCallback?.(now + 16);
    });
    expect(Number(screen.getByTestId('time').textContent)).toBeLessThan(1);
  });

  it('throws outside a MediaPlayer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMediaPlayer())).toThrow(
      /inside a MediaPlayer/,
    );
  });
});
