// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatComposerTokenElement',
  subComponentOf: 'Chat',
  displayName: 'Chat Composer Token Element',
  isHiddenFromOverview: true,
  description: 'Renders a single token chip outside the contentEditable input. Wraps a badge config or custom render function in the correct data-astryx-token span so the token serializes properly and stays visually consistent with tokens inside the composer.',
  playground: {
    defaults: {
      token: {value: '@astryx', label: '@astryx', variant: 'blue'},
    },
  },
  props: [
    {
      name: 'token',
      type: 'ChatComposerToken',
      description: 'The token to render. Pass a badge config ({ value, label, variant?, icon? }) for the common case, or a custom render ({ value, render }) for full control.',
      required: true,
    },
  ],
};

export const docsZh = {
  name: 'ChatComposerTokenElement',
  isHiddenFromOverview: true,
  displayName: 'Chat Composer Token Element',
  description: '在 contentEditable 外部渲染标记芯片。',
  propDescriptions: {
    token: '徽章配置或自定义渲染。',
  },
};

export const docsDense = {
  name: 'ChatComposerTokenElement',
  isHiddenFromOverview: true,
  displayName: 'Chat Composer Token Element',
  description: 'token chip outside contentEditable; badge config or custom render in data-astryx-token span',
  propDescriptions: {
    token: 'badge config or custom render',
  },
};
