// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as CoreHooks from '@astryxdesign/core/hooks';
import {
  colorVars,
  sizeVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {AudioPlayer} from './AudioPlayer';
import {MediaPlayer} from './MediaPlayer';
import {useMediaPlaybackTime, useMediaPlayer} from './MediaPlayerContext';
import {
  MediaPlaybackRate,
  MediaTimeSlider,
  MediaVolume,
} from './MediaPlayerControls';
import {MediaPlayerElement} from './MediaPlayerElement';
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

// jsdom lays out nothing and matches no container query. So these probes
// check the declarations that make the compact bar and its track color.
// StyleX gives a declaration the same atomic classes in every file. Thus an
// element carries the classes of a probe when it has that declaration. The
// browser spec measures the painted result.
const COMPACT_PLAYER = '@container (max-width: 360px)';

const probe = stylex.create({
  barInset: {
    '--_media-bar-inset': {
      default: spacingVars['--spacing-2'],
      [COMPACT_PLAYER]: spacingVars['--spacing-1'],
    },
  },
  insetFromBarInset: {
    insetInlineStart: 'var(--_media-bar-inset)',
    insetInlineEnd: 'var(--_media-bar-inset)',
    insetBlockEnd: 'var(--_media-bar-inset)',
  },
  barGap: {
    gap: {
      default: spacingVars['--spacing-2'],
      [COMPACT_PLAYER]: spacingVars['--spacing-1'],
    },
  },
  barPadding: {
    padding: {
      default: spacingVars['--spacing-1'],
      [COMPACT_PLAYER]: `calc(${spacingVars['--spacing-1']} / 2)`,
    },
  },
  dropByBarInset: {
    translate: '0 var(--_media-bar-inset)',
  },
  smallControl: {
    '--size-element-md': {
      default: null,
      [COMPACT_PLAYER]: sizeVars['--size-element-sm'],
    },
  },
  frostedTrack: {
    '--_media-timeline-track': `color-mix(in srgb, ${colorVars['--color-accent']} 24%, transparent)`,
  },
  trackFromSurface: {
    backgroundColor: `var(--_media-timeline-track, ${colorVars['--color-track']})`,
  },
});

type Probe = (typeof probe)[keyof typeof probe];

function atomicClasses(style: Probe): string[] {
  const {className = ''} = stylex.props(style);
  // The dev runtime adds a debug class that names the source file.
  const classes = className
    .split(' ')
    .filter(name => name !== '' && !name.includes('__'));
  // A probe with no classes would make every assertion on it vacuous.
  expect(classes.length).toBeGreaterThan(0);
  return classes;
}

function hasDeclaration(element: Element, style: Probe): boolean {
  return atomicClasses(style).every(name => element.classList.contains(name));
}

/** The element and its ancestors up to `root` that carry the declaration. */
function declaringAncestors(
  element: Element,
  root: Element,
  style: Probe,
): Element[] {
  const found: Element[] = [];
  for (
    let node: Element | null = element;
    node != null && root.contains(node);
    node = node.parentElement
  ) {
    if (hasDeclaration(node, style)) {
      found.push(node);
    }
  }
  return found;
}

/** Lets jsdom report element fullscreen, so the fullscreen control renders. */
function allowFullscreen() {
  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  return () => {
    Reflect.deleteProperty(document, 'fullscreenEnabled');
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen');
  };
}

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
    // Before playback, the bar sits behind the large play control, so the
    // bar's Play is reached with the keyboard.
    act(() => screen.getByRole('button', {name: 'Play'}).focus());
    await user.keyboard('{Enter}');
    expect(onPlay).toHaveBeenCalledTimes(1);
    // The same toggle keeps focus, so the keyboard drives each change. A
    // pointer click could land after the 2 s idle hide on a slow run, when
    // the hidden bar refuses pointer input.
    await user.keyboard('{Enter}');
    expect(onPause).toHaveBeenCalledTimes(1);
    await user.keyboard('{Enter}');
    playback.end();
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(2);
    act(() => {
      video.dispatchEvent(new Event('error'));
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the bar behind the large play control until playback starts, in reach of the keyboard', async () => {
    const user = userEvent.setup();
    const {video, player} = renderVideoPlayer();
    fakePlayback(video);
    const barPlay = screen.getByRole('button', {name: 'Play'});
    await expect(user.click(barPlay)).rejects.toThrow(/pointer-events/);
    act(() => barPlay.focus());
    await user.keyboard('{Enter}');
    // A person moves the pointer to the bar before clicking, which shows it
    // again if a slow run has passed the 2 s idle hide.
    fireEvent.pointerMove(player, {pointerType: 'mouse'});
    await user.click(screen.getByRole('button', {name: 'Pause'}));
    expect(screen.getByRole('button', {name: 'Play'})).toBeInTheDocument();
  });

  it('shows the bar beside the replay control after the end', async () => {
    const user = userEvent.setup();
    const {video} = renderVideoPlayer();
    const playback = fakePlayback(video);
    act(() => screen.getByRole('button', {name: 'Play'}).focus());
    await user.keyboard('{Enter}');
    act(() => {
      playback.end();
    });
    await user.click(screen.getByRole('button', {name: 'Replay'}));
    expect(screen.getByRole('button', {name: 'Pause'})).toBeInTheDocument();
  });

  it('keeps the loading spinner out of the accessibility tree', () => {
    const {video, container} = renderVideoPlayer();
    fakePlayback(video);
    const announcedCount = () =>
      screen.queryAllByRole('status').length +
      screen.queryAllByRole('progressbar').length;
    const countBefore = announcedCount();
    act(() => {
      void video.play();
      video.dispatchEvent(new Event('waiting'));
    });
    const spinner = container.querySelector('.astryx-spinner');
    expect(spinner).not.toBeNull();
    expect(spinner?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(announcedCount()).toBe(countBefore);
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

  it('lets a mouse that leaves the player hide the controls after a click gave the timeline focus', async () => {
    // A browser can draw a focus ring after this click, such as after
    // autoplay. The last input decides the hold, not the ring.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? this === document.activeElement
        : matches.call(this, selector);
    });
    const user = userEvent.setup();
    const {player, video, container} = renderVideoPlayer();
    fakePlayback(video, {duration: 60});
    act(() => {
      void video.play();
    });
    const bar = () => container.querySelector('[data-visible]');
    await user.click(screen.getByRole('slider', {name: 'Seek'}));
    expect(screen.getByRole('slider', {name: 'Seek'})).toHaveFocus();
    fireEvent.pointerLeave(player, {pointerType: 'mouse'});
    expect(bar()).toHaveAttribute('data-visible', 'false');
  });

  it('holds the controls while keyboard focus is inside the player', async () => {
    const user = userEvent.setup();
    const {player, video, container} = renderVideoPlayer();
    fakePlayback(video, {duration: 60});
    act(() => {
      void video.play();
    });
    await user.keyboard('{Tab}');
    await user.tab();
    expect(player.contains(document.activeElement)).toBe(true);
    fireEvent.pointerLeave(player, {pointerType: 'mouse'});
    expect(container.querySelector('[data-visible]')).toHaveAttribute(
      'data-visible',
      'true',
    );
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

describe('VideoPlayer control bar', () => {
  const captionTrack: FakeTrack = {
    id: '',
    kind: 'captions',
    label: 'English',
    language: 'en',
    mode: 'disabled',
  };
  let restoreFullscreen: () => void = () => {};

  beforeEach(() => {
    restoreFullscreen = allowFullscreen();
  });

  afterEach(() => {
    restoreFullscreen();
  });

  function renderBar() {
    const result = renderVideoPlayer();
    fakePlayback(result.video, {tracks: [{...captionTrack}]});
    const bar = result.container.querySelector('[data-visible]');
    if (bar == null) {
      throw new Error('VideoPlayer rendered no control bar');
    }
    return {...result, bar};
  }

  it('narrows its inset, gap, and padding in a player 360px wide or narrower', () => {
    const {bar} = renderBar();
    expect(hasDeclaration(bar, probe.barInset)).toBe(true);
    expect(hasDeclaration(bar, probe.insetFromBarInset)).toBe(true);
    expect(hasDeclaration(bar, probe.barGap)).toBe(true);
    expect(hasDeclaration(bar, probe.barPadding)).toBe(true);
  });

  it('keeps the controls through two idle seconds of playback while a marker popover opened from the keyboard is open', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup({
      advanceTimers: ms => vi.advanceTimersByTime(ms),
    });
    vi.useFakeTimers({shouldAdvanceTime: true});
    const {video, container} = renderVideoPlayer({
      markers: [
        {
          time: 20,
          label: 'Lin: hold on this',
          content: <input aria-label="Reply" />,
        },
      ],
    });
    fakePlayback(video, {duration: 60});
    const bar = () => container.querySelector('[data-visible]');
    act(() => {
      void video.play();
    });
    const marker = screen.getByRole('button', {name: 'Lin: hold on this'});
    act(() => marker.focus());
    await user.keyboard('{Enter}');
    const reply = await screen.findByRole('textbox', {
      name: 'Reply',
      hidden: true,
    });
    act(() => reply.focus());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bar()).toHaveAttribute('data-visible', 'true');
  });

  it('lets the controls idle-hide again after a marker is removed while its popover is open', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup({
      advanceTimers: ms => vi.advanceTimersByTime(ms),
    });
    vi.useFakeTimers({shouldAdvanceTime: true});
    const marker = {
      time: 20,
      label: 'Lin: hold on this',
      content: <input aria-label="Reply" />,
    };
    const {video, container, rerender} = renderVideoPlayer({
      markers: [marker],
    });
    fakePlayback(video, {duration: 60});
    const bar = () => container.querySelector('[data-visible]');
    act(() => {
      void video.play();
    });
    await user.click(screen.getByRole('button', {name: marker.label}));
    await screen.findByRole('textbox', {name: 'Reply', hidden: true});
    // The host removes the marker while its popover is open.
    rerender(<VideoPlayer src="/clip.mp4" label="Product tour" markers={[]} />);
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bar()).toHaveAttribute('data-visible', 'false');
  });

  it('drops by its own inset while hidden, so a compact bar drops less', () => {
    vi.useFakeTimers();
    const {bar, video} = renderBar();
    act(() => {
      void video.play();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bar).toHaveAttribute('data-visible', 'false');
    expect(hasDeclaration(bar, probe.dropByBarInset)).toBe(true);
  });

  it('gives each of its buttons the small element size in a compact player, on the button itself', () => {
    const {bar, container} = renderBar();
    const controls = [
      within(bar as HTMLElement).getByRole('button', {name: 'Play'}),
      within(bar as HTMLElement).getByRole('button', {name: 'Captions'}),
      within(bar as HTMLElement).getByRole('button', {name: 'Full screen'}),
    ];
    // The volume control leaves the bar at 480px, before the bar compacts.
    const shownButtons = Array.from(
      bar.querySelectorAll('.astryx-button'),
    ).filter(button => button.closest('.astryx-media-volume') == null);
    expect(shownButtons).toHaveLength(controls.length);
    for (const control of controls) {
      expect(shownButtons).toContain(control);
      expect(hasDeclaration(control, probe.smallControl)).toBe(true);
    }
    // Tooltips open beside each button, and marker popovers open inside the
    // timeline. Neither the bar nor the timeline may carry the small size.
    expect(declaringAncestors(bar, container, probe.smallControl)).toEqual([]);
    const timeline = within(bar as HTMLElement).getByRole('slider', {
      name: 'Seek',
    });
    expect(declaringAncestors(timeline, container, probe.smallControl)).toEqual(
      [],
    );
  });

  it('paints the empty part of its timeline in its own accent color at 24 percent', () => {
    const {bar} = renderBar();
    expect(hasDeclaration(bar, probe.frostedTrack)).toBe(true);
    const [trackClass] = atomicClasses(probe.trackFromSurface);
    expect(bar.querySelectorAll(`.${trackClass}`).length).toBeGreaterThan(0);
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

  it('speaks the chapter and the marker at the position with the time', () => {
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaTimeSlider
          chapters={[
            {start: 0, title: 'Intro'},
            {start: 20, title: 'Pollen'},
          ]}
          markers={[{time: 25, label: 'Lin: hold on this'}]}
        />
      </MediaPlayer>,
    );
    const video = container.querySelector('video')!;
    fakePlayback(video, {duration: 60});
    const slider = screen.getByRole('slider', {name: 'Seek'});
    act(() => {
      video.currentTime = 25;
    });
    expect(slider.getAttribute('aria-valuetext')).toMatch(
      /, Pollen, Lin: hold on this$/,
    );
    act(() => {
      video.currentTime = 5;
    });
    expect(slider.getAttribute('aria-valuetext')).toMatch(/, Intro$/);
  });

  it('leaves arrow keys typed in a marker popover to the popover', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaTimeSlider
          markers={[
            {
              time: 20,
              label: 'Lin: hold on this',
              content: <input aria-label="Reply" />,
            },
          ]}
        />
      </MediaPlayer>,
    );
    const playback = fakePlayback(container.querySelector('video')!, {
      duration: 60,
    });
    await user.click(screen.getByRole('button', {name: 'Lin: hold on this'}));
    expect(playback.getCurrentTime()).toBe(20);
    const reply = await screen.findByRole('textbox', {
      name: 'Reply',
      hidden: true,
    });
    act(() => reply.focus());
    await user.keyboard('{ArrowRight}{PageUp}');
    expect(playback.getCurrentTime()).toBe(20);
  });

  it('leaves shortcut keys pressed on a button in a marker popover to that button', async () => {
    // jsdom has no popover API.
    vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(() => {});
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaTimeSlider
          markers={[
            {
              time: 20,
              label: 'Lin: hold on this',
              content: <button type="button">Reply</button>,
            },
          ]}
        />
      </MediaPlayer>,
    );
    const video = container.querySelector('video')!;
    const playback = fakePlayback(video, {duration: 60});
    await user.click(screen.getByRole('button', {name: 'Lin: hold on this'}));
    expect(playback.getCurrentTime()).toBe(20);
    const reply = await screen.findByRole('button', {
      name: 'Reply',
      hidden: true,
    });
    act(() => reply.focus());
    await user.keyboard('{ArrowRight}{ArrowLeft}jl5{ArrowUp}{ArrowDown}mk');
    expect(playback.getCurrentTime()).toBe(20);
    expect(video.volume).toBe(1);
    expect(video.muted).toBe(false);
  });

  it('speaks a marker with the time when an arrow step lands within half a step of it', async () => {
    const user = userEvent.setup();
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaTimeSlider markers={[{time: 22, label: 'Ana: love this shot'}]} />
      </MediaPlayer>,
    );
    fakePlayback(container.querySelector('video')!, {duration: 60});
    const slider = screen.getByRole('slider', {name: 'Seek'});
    act(() => slider.focus());
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('Ana: love this shot'),
    );
  });

  it('reads the timeline position once per hover, not on every pointer move', () => {
    const {container} = render(
      <MediaPlayer label="Clip">
        <MediaPlayerElement kind="video" src="/clip.mp4" />
        <MediaTimeSlider />
      </MediaPlayer>,
    );
    fakePlayback(container.querySelector('video')!, {duration: 60});
    const timeline = screen
      .getByRole('slider', {name: 'Seek'})
      .closest('[dir="ltr"]')!;
    const read = vi.spyOn(timeline, 'getBoundingClientRect');
    fireEvent.pointerEnter(timeline, {pointerType: 'mouse'});
    for (const clientX of [10, 20, 30]) {
      fireEvent.pointerMove(timeline, {pointerType: 'mouse', clientX});
    }
    expect(read).toHaveBeenCalledTimes(1);
    fireEvent.scroll(window);
    fireEvent.pointerMove(timeline, {pointerType: 'mouse', clientX: 40});
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('draws a dot for each marker once the duration is known', () => {
    const {container} = render(
      <VideoPlayer
        src="/clip.mp4"
        label="Clip"
        markers={[
          {time: 10, label: 'Ana: love this'},
          {time: 30, label: 'Lin: hold on this'},
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-media-marker]')).toHaveLength(0);
    fakePlayback(container.querySelector('video')!, {duration: 60});
    expect(container.querySelectorAll('[data-media-marker]')).toHaveLength(2);
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

  it('shows an audio file icon in front of the title when there is no artwork', () => {
    const {container} = render(
      <AudioPlayer src="/episode.mp3" title="Voice memo" />,
    );
    const artwork = container.querySelector('.astryx-media-artwork');
    expect(artwork).not.toBeNull();
    expect(artwork?.querySelector('img')).toBeNull();
    expect(artwork?.querySelector('svg')).not.toBeNull();
  });

  it('shows the artwork image when there is one', () => {
    const {container} = renderAudioPlayer();
    expect(
      container.querySelector('.astryx-media-artwork img'),
    ).toHaveAttribute('src', '/cover.jpg');
  });

  it('offers previous and next track controls only when their handlers are set', async () => {
    const user = userEvent.setup();
    const onPreviousTrack = vi.fn();
    const onNextTrack = vi.fn();
    const {rerender} = render(
      <AudioPlayer src="/episode.mp3" title="Episode" />,
    );
    expect(
      screen.queryByRole('button', {name: 'Previous track'}),
    ).not.toBeInTheDocument();
    rerender(
      <AudioPlayer
        src="/episode.mp3"
        title="Episode"
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Previous track'}));
    await user.click(screen.getByRole('button', {name: 'Next track'}));
    expect(onPreviousTrack).toHaveBeenCalledTimes(1);
    expect(onNextTrack).toHaveBeenCalledTimes(1);
  });

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

  it('keeps the theme track color on its timeline', () => {
    const {container} = renderAudioPlayer();
    const [frostedClass] = atomicClasses(probe.frostedTrack);
    expect(screen.getByRole('slider', {name: 'Seek'})).toBeInTheDocument();
    expect(container.querySelector(`.${frostedClass}`)).toBeNull();
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

describe('MediaPlaybackRate', () => {
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

  it('reports a seek in the same render while the media plays', () => {
    const seen: [reported: number, time: number][] = [];
    function Readout() {
      const {state} = useMediaPlayer();
      const time = useMediaPlaybackTime();
      seen.push([state.currentTime, time]);
      return null;
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
    act(() => {
      video.currentTime = 30;
    });
    expect(seen.find(([reported]) => reported === 30)?.[1]).toBe(30);
  });

  it('checks whether script can set the volume once, not on every media event', () => {
    const {container} = render(
      <MediaPlayer label="Memo">
        <MediaPlayerElement kind="audio" src="/memo.m4a" />
      </MediaPlayer>,
    );
    const audio = container.querySelector('audio')!;
    fakePlayback(audio, {duration: 60});
    act(() => {
      audio.dispatchEvent(new Event('timeupdate'));
    });
    const create = vi.spyOn(document, 'createElement');
    act(() => {
      for (let index = 0; index < 5; index++) {
        audio.dispatchEvent(new Event('timeupdate'));
      }
    });
    expect(create.mock.calls.filter(([tag]) => tag === 'audio')).toHaveLength(
      0,
    );
  });

  it('throws outside a MediaPlayer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useMediaPlayer())).toThrow(
      /inside a MediaPlayer/,
    );
  });
});
