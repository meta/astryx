// Copyright (c) Meta Platforms, Inc. and affiliates.

// @ts-check

/**
 * @file MediaPlayer.doc.mjs
 * @input MediaPlayer family API, anatomy, keyboard shortcuts, and examples
 * @output Consumer documentation for the Lab video and audio players
 * @position CLI and docsite metadata for packages/lab/src/MediaPlayer
 */

const sizeProp = {
  name: 'size',
  type: "'sm' | 'md' | 'lg'",
  description:
    'Control height on the element-size scale: 28, 32, or 36px. Without it, the part follows the surrounding size.',
  default: "'md'",
};

const styleProps = [
  {
    name: 'xstyle',
    type: 'StyleXStyles',
    description:
      'StyleX styles for the part’s root element: a `stylex.create()` value, not an inline style object.',
  },
  {
    name: 'className',
    type: 'string',
    description: 'Class names for the part’s root element.',
  },
  {
    name: 'style',
    type: 'CSSProperties',
    description: 'Inline styles for the part’s root element.',
  },
];

const playbackCallbacks = [
  {
    name: 'onPlay',
    type: '() => void',
    description: 'Called when playback starts or resumes.',
  },
  {
    name: 'onPause',
    type: '() => void',
    description: 'Called when playback pauses.',
  },
  {
    name: 'onEnded',
    type: '() => void',
    description: 'Called when playback reaches the end.',
  },
  {
    name: 'onError',
    type: '(error: MediaPlayerError) => void',
    description:
      'Called when the browser cannot load or play the media. `error.code` is the MediaError code.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'MediaPlayer',
  displayName: 'Media Player',
  group: 'Media',
  category: 'Content',
  keywords: [
    'video',
    'audio',
    'media player',
    'video player',
    'audio player',
    'podcast',
    'playback',
    'controls',
    'scrubber',
    'timeline',
    'captions',
    'subtitles',
    'fullscreen',
  ],
  description:
    'Video and audio players with themed controls over the browser’s native media element. VideoPlayer and AudioPlayer are ready-made layouts; MediaPlayer, its parts, and useMediaPlayer build custom ones. The native element plays the media, so formats the browser plays need no extra library.',
  usage: {
    description:
      'Use VideoPlayer for a video with controls, and AudioPlayer for an episode, recording, or track. For a different layout, put a MediaPlayerVideo or MediaPlayerAudio and the control parts you need inside a MediaPlayer; every part reads the player around it. Keyboard shortcuts work while focus is inside the player: Space or K plays and pauses, M mutes, F toggles fullscreen, C toggles captions, the arrow keys skip 5 seconds and change the volume, J and L skip 10 seconds, 0 to 9 jump to that tenth of the media, and < and > change the speed. Shortcut changes are announced to screen readers. The timeline and volume follow the WAI-ARIA Slider pattern and its Media Seek Slider example; the buttons follow the Button pattern, Captions is a toggle button, and the speed control follows the Menu Button pattern. Streaming formats the browser cannot play, such as DASH, need a streaming library; that library is not part of Lab.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give every player a label that names the media, and give a video caption tracks when it has speech.',
      },
      {
        guidance: true,
        description:
          'Use a poster so the video has a stable first frame and size before it loads.',
      },
      {
        guidance: true,
        description:
          'Keep autoplay for muted, short, or ambient video, and keep a visible pause control for anything that moves longer than five seconds.',
      },
      {
        guidance: true,
        description:
          'Put the control parts in their own MediaPlayer for a custom layout, and keep one play control in the tab order; a second, pointer-only play control takes `tabIndex={-1}` and `aria-hidden`.',
      },
      {
        guidance: false,
        description:
          'Turn on the browser’s own `controls` on the media part, or put two players’ parts in one MediaPlayer.',
      },
      {
        guidance: false,
        description:
          'Rebuild queues, shuffle, or playlists inside the player; compose them in the product around an AudioPlayer.',
      },
    ],
    anatomy: [
      {
        name: 'Player root',
        required: true,
        description:
          'A focusable group named by `label`. It scopes keyboard shortcuts, goes fullscreen with its controls, and decides when the controls show.',
      },
      {
        name: 'Media element',
        required: true,
        description:
          'The native video or audio element with the browser’s controls off. It holds the source, poster, and caption tracks.',
      },
      {
        name: 'Control bar',
        required: false,
        description:
          'In VideoPlayer, a frosted bar 8px from the edges of the video that holds play, the timeline, time, volume, captions, and fullscreen. It shows on hover, pointer movement, and keyboard focus, and hides after two idle seconds while the video plays. On touch, a tap shows it and the next tap hides it. The volume slider appears while the volume control is hovered or focused, and always on touch.',
      },
      {
        name: 'Timeline',
        required: false,
        description:
          'A slider for the playback position. It runs left to right in every direction, because it shows the direction of the media.',
      },
      {
        name: 'Status layer',
        required: false,
        description:
          'In VideoPlayer, the large play button before playback and after the end, a spinner while playback waits for data, and an error message with Try again.',
      },
    ],
  },
  theming: {
    targets: [
      {className: 'astryx-media-player', visualProps: ['controls']},
      {className: 'astryx-media-player-video'},
      {className: 'astryx-media-player-audio'},
      {className: 'astryx-media-play-button'},
      {className: 'astryx-media-seek-button'},
      {className: 'astryx-media-mute-button'},
      {className: 'astryx-media-volume-slider'},
      {className: 'astryx-media-time-slider'},
      {className: 'astryx-media-time', visualProps: ['display']},
      {className: 'astryx-media-captions-button'},
      {className: 'astryx-media-fullscreen-button'},
      {className: 'astryx-media-playback-rate-button'},
      {className: 'astryx-media-playback-rate-slider'},
      {className: 'astryx-media-playback-rate-menu'},
    ],
  },
  components: [
    {
      name: 'VideoPlayer',
      displayName: 'Video Player',
      description:
        'A ready-made video player. Controls float in a frosted bar inset over the video, whose corners nest around the bar. A click plays and pauses; on touch, a tap shows the controls and the next tap hides them.',
      props: [
        {
          name: 'src',
          type: 'string',
          description: 'URL of the video.',
          required: true,
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Accessible name of the player, such as the title of the video.',
          required: true,
        },
        {
          name: 'poster',
          type: 'string',
          description: 'Image shown before playback starts.',
        },
        {
          name: 'captions',
          type: 'readonly VideoPlayerCaptionTrack[]',
          description:
            'WebVTT caption and subtitle files: `{src, label, language, kind?, isDefault?}`. The captions toggle appears when there is at least one.',
        },
        {
          name: 'aspectRatio',
          type: 'number',
          description: 'Width divided by height.',
          default: '16 / 9',
        },
        {
          name: 'hasAutoPlay',
          type: 'boolean',
          description:
            'Starts playback on load, muted, because browsers block autoplay with sound. The play control stays available if the browser still refuses.',
          default: 'false',
        },
        {
          name: 'isLooping',
          type: 'boolean',
          description: 'Starts again from the beginning at the end.',
          default: 'false',
        },
        {
          name: 'preload',
          type: "'none' | 'metadata' | 'auto'",
          description: 'How much to load before playback.',
          default: "'metadata'",
        },
        {
          name: 'crossOrigin',
          type: "'anonymous' | 'use-credentials'",
          description: 'CORS mode for the video and its caption files.',
        },
        ...playbackCallbacks,
        ...styleProps,
      ],
    },
    {
      name: 'AudioPlayer',
      displayName: 'Audio Player',
      description:
        'A ready-made player for episodes, recordings, and music: title and artwork, a timeline, skip back and forward, a speed button with a speed slider, and volume. The speed and volume sliders appear while their buttons are hovered or focused, and always on touch. It sits in a Section container, so its background and padding follow the theme, and `xstyle`, `className`, and `style` style that container. It hands its title and artwork to the system media controls once it plays.',
      props: [
        {
          name: 'src',
          type: 'string',
          description: 'URL of the audio.',
          required: true,
        },
        {
          name: 'title',
          type: 'string',
          description:
            'Title of the episode or track. It also names the player.',
          required: true,
        },
        {
          name: 'subtitle',
          type: 'string',
          description: 'Show, artist, or other supporting line.',
        },
        {
          name: 'artworkSrc',
          type: 'string',
          description: 'Square artwork URL.',
        },
        {
          name: 'label',
          type: 'string',
          description: 'Accessible name of the player.',
          default: 'title',
        },
        {
          name: 'skipBackSeconds',
          type: 'number',
          description: 'Seconds the skip-back control moves.',
          default: '15',
        },
        {
          name: 'skipForwardSeconds',
          type: 'number',
          description: 'Seconds the skip-forward control moves.',
          default: '30',
        },
        {
          name: 'preload',
          type: "'none' | 'metadata' | 'auto'",
          description: 'How much to load before playback.',
          default: "'metadata'",
        },
        {
          name: 'crossOrigin',
          type: "'anonymous' | 'use-credentials'",
          description: 'CORS mode for the audio.',
        },
        ...playbackCallbacks,
        ...styleProps,
      ],
    },
    {
      name: 'MediaPlayer',
      displayName: 'Media Player',
      description:
        'The root of a custom player. It owns the playback state of the media part inside it, scopes keyboard shortcuts, and decides when the controls show.',
      props: [
        {
          name: 'label',
          type: 'string',
          description: 'Accessible name of the player.',
          required: true,
        },
        {
          name: 'children',
          type: 'ReactNode',
          description: 'One media part and any control parts.',
        },
        ...playbackCallbacks,
        ...styleProps,
      ],
    },
    {
      name: 'MediaPlayerVideo',
      displayName: 'Media Player Video',
      description:
        'The native video element of a MediaPlayer. It takes the native video attributes except `controls`; pass `<track>` elements as children.',
      props: [
        {name: 'src', type: 'string', description: 'URL of the video.'},
        {
          name: 'poster',
          type: 'string',
          description: 'Image shown before playback starts.',
        },
        {
          name: 'playsInline',
          type: 'boolean',
          description:
            'Plays inside the page on iPhone instead of opening the system player.',
          default: 'true',
        },
        ...styleProps,
      ],
    },
    {
      name: 'MediaPlayerAudio',
      displayName: 'Media Player Audio',
      description:
        'The native audio element of a MediaPlayer. It renders nothing visible and takes the native audio attributes except `controls`.',
      props: [{name: 'src', type: 'string', description: 'URL of the audio.'}],
    },
    {
      name: 'MediaPlayButton',
      displayName: 'Media Play Button',
      description:
        'Plays and pauses. After the end it shows Replay and plays from the start.',
      props: [
        sizeProp,
        {
          name: 'variant',
          type: "'primary' | 'secondary' | 'ghost'",
          description: 'Button emphasis.',
          default: "'ghost'",
        },
        ...styleProps,
      ],
    },
    {
      name: 'MediaSeekButton',
      displayName: 'Media Seek Button',
      description:
        'Skips back or forward by a fixed number of seconds, shown on its icon.',
      props: [
        {
          name: 'offset',
          type: 'number',
          description:
            'Seconds to move: negative skips back, positive skips forward.',
          required: true,
        },
        sizeProp,
        ...styleProps,
      ],
    },
    {
      name: 'MediaMuteButton',
      displayName: 'Media Mute Button',
      description: 'Mutes and unmutes. Its icon follows the volume.',
      props: [sizeProp, ...styleProps],
    },
    {
      name: 'MediaVolumeSlider',
      displayName: 'Media Volume Slider',
      description:
        'Sets the volume. It renders nothing where script cannot set the volume, such as iOS Safari, where the hardware buttons own it.',
      props: [
        {
          name: 'width',
          type: 'number | string',
          description: 'Slider width.',
          default: '88',
        },
        ...styleProps,
      ],
    },
    {
      name: 'MediaTimeSlider',
      displayName: 'Media Time Slider',
      description:
        'The timeline. Dragging previews the time and seeks on release; arrow keys skip 5 seconds and Page Up and Page Down skip 10. It runs left to right in every direction.',
      props: styleProps,
    },
    {
      name: 'MediaTime',
      displayName: 'Media Time',
      description:
        'Shows playback time as m:ss or h:mm:ss. A live stream shows “Live”.',
      props: [
        {
          name: 'display',
          type: "'current' | 'duration' | 'remaining' | 'current-duration'",
          description: 'Which time to show.',
          default: "'current-duration'",
        },
        ...styleProps,
      ],
    },
    {
      name: 'MediaCaptionsButton',
      displayName: 'Media Captions Button',
      description:
        'Turns captions on and off. It renders nothing when the media has no caption or subtitle track.',
      props: [sizeProp, ...styleProps],
    },
    {
      name: 'MediaFullscreenButton',
      displayName: 'Media Fullscreen Button',
      description:
        'Enters and exits fullscreen with the player’s own element, so the controls come along. iPhone shows the system player instead. It renders nothing where fullscreen is not available.',
      props: [sizeProp, ...styleProps],
    },
    {
      name: 'MediaPlaybackRateButton',
      displayName: 'Media Playback Rate Button',
      description:
        'Shows the playback speed. A press switches between normal speed and the last other speed, the way the mute button switches the sound off and on; from normal speed with no other speed yet, it steps up one speed.',
      props: [sizeProp, ...styleProps],
    },
    {
      name: 'MediaPlaybackRateSlider',
      displayName: 'Media Playback Rate Slider',
      description:
        'Sets the playback speed in steps and shows the speed in a tooltip while it is hovered, dragged, or focused. AudioPlayer reveals it beside the speed button.',
      props: [
        {
          name: 'rates',
          type: 'readonly number[]',
          description:
            'Speeds the slider steps through, in order. The `<` and `>` shortcuts step through the default list.',
          default: '[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]',
        },
        {
          name: 'width',
          type: 'number | string',
          description: 'Slider width.',
          default: '88',
        },
        ...styleProps,
      ],
    },
    {
      name: 'MediaPlaybackRateMenu',
      displayName: 'Media Playback Rate Menu',
      description:
        'Shows the playback speed and opens a menu of speeds with the current one checked. It keeps the controls visible while the menu is open.',
      props: [
        {
          name: 'rates',
          type: 'readonly number[]',
          description:
            'Speeds the menu offers, in order. The `<` and `>` shortcuts step through the default list.',
          default: '[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]',
        },
        sizeProp,
        ...styleProps,
      ],
    },
    {
      name: 'useMediaPlayer',
      displayName: 'Use Media Player',
      description:
        'Reads the nearest MediaPlayer’s playback state and returns the actions that drive it, for custom controls inside a MediaPlayer.',
      returns: [
        {
          name: 'state',
          type: 'MediaPlayerState',
          description:
            'isPaused, isEnded, isWaiting, hasStarted, currentTime, duration (0 before metadata, Infinity when live), bufferedEnd, volume, isMuted, playbackRate, isFullscreen, canFullscreen, canSetVolume, textTracks, activeTextTrackId, and error.',
        },
        {
          name: 'play / pause / togglePaused',
          type: '() => void',
          description:
            'Start and stop playback. `play` resolves after the browser accepts or refuses.',
        },
        {
          name: 'seek / seekBy',
          type: '(seconds: number) => void',
          description:
            'Move the playhead to a time, or by an offset, clamped to the media.',
        },
        {
          name: 'setVolume / setMuted / toggleMuted',
          type: '(value) => void',
          description: 'Change the volume (0 to 1) and mute state.',
        },
        {
          name: 'setPlaybackRate',
          type: '(rate: number) => void',
          description: 'Change the speed.',
        },
        {
          name: 'toggleFullscreen / setTextTrack / toggleCaptions / reload',
          type: 'function',
          description:
            'Fullscreen, caption track selection, and loading the source again after an error.',
        },
      ],
      relatedComponents: ['MediaPlayer'],
    },
  ],
  examples: [
    {
      label: 'Video player',
      code: `<VideoPlayer
  src="/media/flower.webm"
  label="Bee on a flower"
/>`,
    },
    {
      label: 'Muted autoplay loop',
      code: `<VideoPlayer
  src="/media/flower.webm"
  label="Bee on a flower"
  hasAutoPlay
  isLooping
/>`,
    },
    {
      label: 'Video with captions',
      code: `<VideoPlayer
  src="/media/product-tour.mp4"
  poster="/media/product-tour.jpg"
  label="Product tour"
  captions={[
    {src: '/media/product-tour.en.vtt', label: 'English', language: 'en', isDefault: true},
  ]}
/>`,
    },
    {
      label: 'Podcast episode',
      code: `<AudioPlayer
  src="/media/episode-12.mp3"
  title="Designing for every screen"
  subtitle="The Interface Show · Episode 12"
  artworkSrc="/media/show-cover.jpg"
/>`,
    },
    {
      label: 'Voice memo',
      code: `<AudioPlayer
  src="/media/memo.mp3"
  title="Voice memo"
  skipBackSeconds={5}
  skipForwardSeconds={10}
/>`,
    },
    {
      label: 'Inline voice note',
      code: `<MediaPlayer label="Voice note">
  <MediaPlayerAudio src="/media/note.mp3" />
  <HStack gap={1} vAlign="center">
    <MediaPlayButton size="sm" />
    <MediaTime display="remaining" />
  </HStack>
</MediaPlayer>`,
    },
    {
      label: 'Custom layout',
      code: `function CompactPlayer({src}: {src: string}) {
  return (
    <MediaPlayer label="Voice memo">
      <MediaPlayerAudio src={src} />
      <HStack gap={2} vAlign="center">
        <MediaPlayButton />
        <MediaTimeSlider />
        <MediaTime display="remaining" />
        <ElapsedPercent />
      </HStack>
    </MediaPlayer>
  );
}

function ElapsedPercent() {
  const {state} = useMediaPlayer();
  const percent = state.duration > 0 ? state.currentTime / state.duration : 0;
  return <Text type="supporting">{Math.round(percent * 100)}%</Text>;
}`,
    },
  ],
};
