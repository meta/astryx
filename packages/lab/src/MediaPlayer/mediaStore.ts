// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mediaStore.ts
 * @input One HTMLMediaElement and the player container element
 * @output createMediaStore: playback state as an external store, plus the
 *   actions that drive the media element; MediaPlayerState and its types
 * @position Internal to MediaPlayer; MediaPlayer.tsx owns one store per player
 */

/** One caption or subtitle track the media element offers. */
export interface MediaTextTrackInfo {
  /** Stable identity: the track's `id`, or its language, label, and position. */
  id: string;
  label: string;
  language: string;
  kind: 'captions' | 'subtitles';
}

/** A playback failure the media element reported. */
export interface MediaPlayerError {
  /** The MediaError code: 1 aborted, 2 network, 3 decode, 4 unsupported source. */
  code: number;
  message: string;
}

/** Playback state of one player. Every value comes from the media element. */
export interface MediaPlayerState {
  isPaused: boolean;
  isEnded: boolean;
  /** Playback waits for data. */
  isWaiting: boolean;
  /** Playback started at least once since the source loaded. */
  hasStarted: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds. 0 before metadata loads; Infinity for a live stream. */
  duration: number;
  /** End, in seconds, of the buffered range that holds the playhead. */
  bufferedEnd: number;
  /** 0 to 1. */
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  /** The player or its video can go fullscreen. */
  canFullscreen: boolean;
  /** Script can set the volume. iOS Safari keeps volume under hardware control. */
  canSetVolume: boolean;
  textTracks: readonly MediaTextTrackInfo[];
  activeTextTrackId: string | null;
  error: MediaPlayerError | null;
}

/** Actions that drive the media element. */
export interface MediaPlayerActions {
  /** Starts playback. Resolves after the browser accepts or refuses it. */
  play: () => Promise<void>;
  pause: () => void;
  togglePaused: () => void;
  /** Moves the playhead to a time in seconds, clamped to the media. */
  seek: (time: number) => void;
  /** Moves the playhead by an offset in seconds. */
  seekBy: (offset: number) => void;
  /** Sets the volume from 0 to 1. A volume above 0 also unmutes. */
  setVolume: (volume: number) => void;
  setMuted: (isMuted: boolean) => void;
  toggleMuted: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleFullscreen: () => void;
  /** Shows one caption or subtitle track, or none with `null`. */
  setTextTrack: (id: string | null) => void;
  toggleCaptions: () => void;
  /** Loads the source again, for example after a network error. */
  reload: () => void;
}

export interface MediaStore {
  getState: () => MediaPlayerState;
  subscribe: (listener: () => void) => () => void;
  attachMedia: (media: HTMLMediaElement | null) => void;
  attachContainer: (container: HTMLElement | null) => void;
  actions: MediaPlayerActions;
}

export const INITIAL_MEDIA_STATE: MediaPlayerState = {
  isPaused: true,
  isEnded: false,
  isWaiting: false,
  hasStarted: false,
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  isFullscreen: false,
  canFullscreen: false,
  canSetVolume: true,
  textTracks: [],
  activeTextTrackId: null,
  error: null,
};

const MEDIA_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'timeupdate',
  'progress',
  'play',
  'playing',
  'pause',
  'ended',
  'waiting',
  'canplay',
  'seeking',
  'seeked',
  'volumechange',
  'ratechange',
  'error',
  'emptied',
  'webkitbeginfullscreen',
  'webkitendfullscreen',
] as const;

interface WebKitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
}

interface WebKitElement extends HTMLElement {
  webkitRequestFullscreen?: () => void;
}

interface WebKitVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
}

let volumeProbeResult: boolean | null = null;

/**
 * iOS Safari ignores script writes to `volume`, so a probe element shows
 * whether the platform lets script set it.
 */
function canScriptSetVolume(): boolean {
  if (volumeProbeResult != null) {
    return volumeProbeResult;
  }
  if (typeof document === 'undefined') {
    return true;
  }
  try {
    const probe = document.createElement('audio');
    probe.volume = 0.5;
    volumeProbeResult = probe.volume === 0.5;
  } catch {
    volumeProbeResult = false;
  }
  return volumeProbeResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readTextTracks(media: HTMLMediaElement): {
  textTracks: MediaTextTrackInfo[];
  activeTextTrackId: string | null;
} {
  const list = media.textTracks;
  const textTracks: MediaTextTrackInfo[] = [];
  let activeTextTrackId: string | null = null;
  if (list == null) {
    return {textTracks, activeTextTrackId};
  }
  for (let index = 0; index < list.length; index++) {
    const track = list[index];
    if (
      track == null ||
      (track.kind !== 'captions' && track.kind !== 'subtitles')
    ) {
      continue;
    }
    const id = track.id || `${track.language}:${track.label}:${index}`;
    textTracks.push({
      id,
      label: track.label,
      language: track.language,
      kind: track.kind,
    });
    if (track.mode === 'showing') {
      activeTextTrackId = id;
    }
  }
  return {textTracks, activeTextTrackId};
}

function readBufferedEnd(media: HTMLMediaElement): number {
  const ranges = media.buffered;
  if (ranges == null) {
    return 0;
  }
  let end = 0;
  for (let index = 0; index < ranges.length; index++) {
    // Half a second of tolerance keeps the range that starts at the playhead.
    if (ranges.start(index) <= media.currentTime + 0.5) {
      end = Math.max(end, ranges.end(index));
    }
  }
  return end;
}

function sameTracks(
  a: readonly MediaTextTrackInfo[],
  b: readonly MediaTextTrackInfo[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (track, index) =>
        track.id === b[index]?.id &&
        track.label === b[index]?.label &&
        track.language === b[index]?.language,
    )
  );
}

export function createMediaStore(): MediaStore {
  let state: MediaPlayerState = INITIAL_MEDIA_STATE;
  let media: HTMLMediaElement | null = null;
  let container: HTMLElement | null = null;
  let detachMedia: (() => void) | null = null;
  let lastTextTrackId: string | null = null;
  const listeners = new Set<() => void>();

  function setState(patch: Partial<MediaPlayerState>) {
    let hasChange = false;
    for (const key of Object.keys(patch) as (keyof MediaPlayerState)[]) {
      const next = patch[key];
      const previous = state[key];
      if (key === 'textTracks') {
        if (
          !sameTracks(
            previous as MediaTextTrackInfo[],
            next as MediaTextTrackInfo[],
          )
        ) {
          hasChange = true;
        } else {
          delete patch[key];
        }
      } else if (!Object.is(previous, next)) {
        hasChange = true;
      }
    }
    if (!hasChange) {
      return;
    }
    state = {...state, ...patch};
    for (const listener of listeners) {
      listener();
    }
  }

  function readFullscreen(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    const doc = document as WebKitDocument;
    const element =
      doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    if (element != null && container != null && element === container) {
      return true;
    }
    return Boolean(
      (media as WebKitVideoElement | null)?.webkitDisplayingFullscreen,
    );
  }

  function readCanFullscreen(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    const doc = document as WebKitDocument;
    const element = container as WebKitElement | null;
    const canFullscreenContainer =
      element != null &&
      Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled) &&
      (typeof element.requestFullscreen === 'function' ||
        typeof element.webkitRequestFullscreen === 'function');
    // iPhone has no element fullscreen. Its video goes fullscreen in the
    // system player instead.
    const canFullscreenVideo =
      typeof (media as WebKitVideoElement | null)?.webkitEnterFullscreen ===
      'function';
    return canFullscreenContainer || canFullscreenVideo;
  }

  function readAll(element: HTMLMediaElement): Partial<MediaPlayerState> {
    const {textTracks, activeTextTrackId} = readTextTracks(element);
    const duration = element.duration;
    return {
      isPaused: element.paused,
      isEnded: element.ended,
      currentTime: element.currentTime,
      duration: Number.isNaN(duration) ? 0 : duration,
      bufferedEnd: readBufferedEnd(element),
      volume: element.volume,
      isMuted: element.muted,
      playbackRate: element.playbackRate,
      isFullscreen: readFullscreen(),
      canFullscreen: readCanFullscreen(),
      canSetVolume: canScriptSetVolume(),
      textTracks,
      activeTextTrackId,
    };
  }

  function handleMediaEvent(event: Event) {
    const element = media;
    if (element == null) {
      return;
    }
    const patch = readAll(element);
    switch (event.type) {
      case 'loadstart':
      case 'emptied':
        patch.hasStarted = false;
        patch.isWaiting = false;
        patch.error = null;
        break;
      case 'play':
        patch.hasStarted = true;
        break;
      case 'waiting':
        patch.isWaiting = true;
        break;
      case 'playing':
      case 'canplay':
      case 'pause':
      case 'seeked':
      case 'ended':
        patch.isWaiting = false;
        break;
      case 'error':
        patch.isWaiting = false;
        patch.error = {
          code: element.error?.code ?? 0,
          message: element.error?.message ?? '',
        };
        break;
    }
    setState(patch);
  }

  function handleTrackChange() {
    if (media != null) {
      const tracks = readTextTracks(media);
      if (tracks.activeTextTrackId != null) {
        lastTextTrackId = tracks.activeTextTrackId;
      }
      setState(tracks);
    }
  }

  function handleFullscreenChange() {
    setState({isFullscreen: readFullscreen()});
  }

  function attachMedia(element: HTMLMediaElement | null) {
    if (element === media) {
      return;
    }
    detachMedia?.();
    detachMedia = null;
    media = element;
    if (element == null) {
      setState({...INITIAL_MEDIA_STATE, canFullscreen: readCanFullscreen()});
      return;
    }
    for (const type of MEDIA_EVENTS) {
      element.addEventListener(type, handleMediaEvent);
    }
    const list = element.textTracks as TextTrackList | undefined;
    // Some DOM implementations expose a track list that is not an EventTarget.
    const tracks = typeof list?.addEventListener === 'function' ? list : null;
    tracks?.addEventListener('addtrack', handleTrackChange);
    tracks?.addEventListener('removetrack', handleTrackChange);
    tracks?.addEventListener('change', handleTrackChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    detachMedia = () => {
      for (const type of MEDIA_EVENTS) {
        element.removeEventListener(type, handleMediaEvent);
      }
      tracks?.removeEventListener('addtrack', handleTrackChange);
      tracks?.removeEventListener('removetrack', handleTrackChange);
      tracks?.removeEventListener('change', handleTrackChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange,
      );
    };
    setState({
      ...readAll(element),
      hasStarted: !element.paused || element.currentTime > 0,
      error: null,
    });
  }

  function attachContainer(element: HTMLElement | null) {
    container = element;
    setState({
      canFullscreen: readCanFullscreen(),
      isFullscreen: readFullscreen(),
    });
  }

  function setTextTrack(id: string | null) {
    const list = media?.textTracks;
    if (media == null || list == null) {
      return;
    }
    const {textTracks} = readTextTracks(media);
    let position = 0;
    for (let index = 0; index < list.length; index++) {
      const track = list[index];
      if (
        track == null ||
        (track.kind !== 'captions' && track.kind !== 'subtitles')
      ) {
        continue;
      }
      track.mode = textTracks[position]?.id === id ? 'showing' : 'disabled';
      position++;
    }
    if (id != null) {
      lastTextTrackId = id;
    }
    setState({activeTextTrackId: id});
  }

  const actions: MediaPlayerActions = {
    play: async () => {
      if (media == null) {
        return;
      }
      try {
        await media.play();
      } catch {
        // The browser refused playback, for example by its autoplay policy.
        // The state stays paused, so the play control stays available.
      }
    },
    pause: () => {
      media?.pause();
    },
    togglePaused: () => {
      if (media == null) {
        return;
      }
      if (media.paused || media.ended) {
        void actions.play();
      } else {
        media.pause();
      }
    },
    seek: time => {
      if (media == null || Number.isNaN(time)) {
        return;
      }
      const duration = media.duration;
      const end = Number.isFinite(duration) ? duration : Math.max(time, 0);
      const target = clamp(time, 0, end);
      media.currentTime = target;
      setState({currentTime: target, isEnded: media.ended});
    },
    seekBy: offset => {
      if (media != null) {
        actions.seek(media.currentTime + offset);
      }
    },
    setVolume: volume => {
      if (media == null) {
        return;
      }
      const next = clamp(volume, 0, 1);
      media.volume = next;
      if (next > 0 && media.muted) {
        media.muted = false;
      }
      setState({volume: media.volume, isMuted: media.muted});
    },
    setMuted: isMuted => {
      if (media == null) {
        return;
      }
      media.muted = isMuted;
      if (!isMuted && media.volume === 0) {
        media.volume = 1;
      }
      setState({volume: media.volume, isMuted: media.muted});
    },
    toggleMuted: () => {
      if (media != null) {
        actions.setMuted(!media.muted);
      }
    },
    setPlaybackRate: rate => {
      if (media != null && rate > 0) {
        media.playbackRate = rate;
        setState({playbackRate: media.playbackRate});
      }
    },
    toggleFullscreen: () => {
      if (typeof document === 'undefined') {
        return;
      }
      const doc = document as WebKitDocument;
      const video = media as WebKitVideoElement | null;
      if (readFullscreen()) {
        if (doc.fullscreenElement != null) {
          void doc.exitFullscreen?.().catch(() => {});
        } else if (doc.webkitFullscreenElement != null) {
          doc.webkitExitFullscreen?.();
        } else {
          video?.webkitExitFullscreen?.();
        }
        return;
      }
      const element = container as WebKitElement | null;
      const isEnabled = Boolean(
        doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled,
      );
      if (
        element != null &&
        isEnabled &&
        typeof element.requestFullscreen === 'function'
      ) {
        void element.requestFullscreen().catch(() => {});
      } else if (
        element != null &&
        isEnabled &&
        element.webkitRequestFullscreen
      ) {
        element.webkitRequestFullscreen();
      } else {
        video?.webkitEnterFullscreen?.();
      }
    },
    setTextTrack,
    toggleCaptions: () => {
      if (state.activeTextTrackId != null) {
        setTextTrack(null);
        return;
      }
      const tracks = state.textTracks;
      const next =
        tracks.find(track => track.id === lastTextTrackId) ?? tracks[0] ?? null;
      if (next != null) {
        setTextTrack(next.id);
      }
    },
    reload: () => {
      media?.load();
    },
  };

  return {
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attachMedia,
    attachContainer,
    actions,
  };
}
