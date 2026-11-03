// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import {useEffect, useState} from 'react';
import {
  AudioPlayer,
  MediaPlayButton,
  MediaPlayer,
  MediaPlayerAudio,
  MediaTime,
  MediaTimeSlider,
  VideoPlayer,
  useMediaPlayer,
} from '@astryxdesign/lab';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

// CC0 sample media.
const VIDEO_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
const AUDIO_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';

const CAPTIONS_VTT = `WEBVTT

00:00.000 --> 00:02.500
A bee lands on a pink flower.

00:02.500 --> 00:05.000
It gathers pollen and flies away.
`;

/** Serves the sample captions from a same-origin blob URL. */
function useCaptionsUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(
      new Blob([CAPTIONS_VTT], {type: 'text/vtt'}),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, []);
  return url;
}

const meta: Meta<typeof VideoPlayer> = {
  title: 'Lab/MediaPlayer',
  component: VideoPlayer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 720, maxWidth: '100%'}}>
        <Story />
      </div>
    ),
  ],
  args: {
    src: VIDEO_SRC,
    label: 'Bee on a flower',
  },
};

export default meta;

type Story = StoryObj<typeof VideoPlayer>;

export const Video: Story = {};

export const VideoWithCaptions: Story = {
  render: args => {
    const captionsUrl = useCaptionsUrl();
    if (captionsUrl == null) {
      return <div />;
    }
    return (
      <VideoPlayer
        {...args}
        captions={[
          {src: captionsUrl, label: 'English', language: 'en', isDefault: true},
        ]}
      />
    );
  },
};

export const MutedAutoplayLoop: Story = {
  args: {
    hasAutoPlay: true,
    isLooping: true,
  },
};

export const RightToLeft: Story = {
  render: args => (
    <div dir="rtl">
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          The page reads right to left; the timeline still runs left to right
        </Text>
        <VideoPlayer {...args} />
      </VStack>
    </div>
  ),
};

export const Audio: Story = {
  render: () => (
    <AudioPlayer
      src={AUDIO_SRC}
      title="Designing for every screen"
      subtitle="The Interface Show · Episode 12"
    />
  ),
};

function ElapsedPercent() {
  const {state} = useMediaPlayer();
  const percent = state.duration > 0 ? state.currentTime / state.duration : 0;
  return (
    <Text type="supporting" color="secondary">
      {Math.round(percent * 100)}%
    </Text>
  );
}

export const CustomLayout: Story = {
  render: () => (
    <MediaPlayer label="Voice memo">
      <MediaPlayerAudio src={AUDIO_SRC} />
      <HStack gap={2} vAlign="center">
        <MediaPlayButton />
        <MediaTimeSlider />
        <MediaTime display="remaining" />
        <ElapsedPercent />
      </HStack>
    </MediaPlayer>
  ),
};
