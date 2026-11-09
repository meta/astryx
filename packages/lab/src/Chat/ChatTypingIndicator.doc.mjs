// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatTypingIndicator',
  subComponentOf: 'Chat',
  group: 'Chat',
  category: 'Chat',
  displayName: 'Chat Typing Indicator',
  description: 'Animated three-dot typing hint with a localized, grammar-aware label: "Ana is typing...", "Ana and Ben are typing...", or "Ana and 2 others are typing...". Dots bounce with staggered stylex.keyframes delays, disabled under prefers-reduced-motion. Each new label is announced once, politely, through the shared announcement channel (useAnnounce); inside a chat log the log announces it instead. The indicator itself carries no live role, so it can mount conditionally without being skipped or heard twice.',
  props: [
    {
      name: 'names',
      type: 'string[]',
      description: 'Names of people currently typing. One name renders "is typing", two render both names, more collapse to "and N others". The sentence comes from the i18n catalog and the names are joined with Intl.ListFormat, so the wording and conjunction follow the active locale. When omitted or empty, only the animated dots render.',
    },
  ],
};

export const docsZh = {
  name: 'ChatTypingIndicator',
  displayName: 'Chat Typing Indicator',
  description: '带语法感知标签的三点跳动输入提示："Ana is typing..."、"Ana and Ben are typing..." 或 "Ana and 2 others are typing..."。圆点用 stylex.keyframes 交错跳动，prefers-reduced-motion 下禁用。每个新标签通过共享播报通道（useAnnounce）礼貌播报一次；位于聊天记录（role="log"）内时由记录负责播报。指示器本身不带 live 角色，因此可按条件挂载，既不会被跳过，也不会重复播报。',
  propDescriptions: {
    names: '正在输入的人名。一个名字渲染 "is typing"，两个渲染双名，更多折叠为 "and N others"。语句取自 i18n 词条，人名由 Intl.ListFormat 按当前语言拼接，因此措辞与连接词随语言而变。省略或为空时仅渲染动画圆点。',
  },
};

export const docsDense = {
  name: 'ChatTypingIndicator',
  displayName: 'Chat Typing Indicator',
  description: 'bouncing three-dot typing hint; label grammar 1/2/N names; reduced-motion safe keyframes; announces each new label once via useAnnounce (polite), or leaves it to an enclosing role=log; no live role on the element; dots-only when names empty',
  propDescriptions: {
    names:
      "string[]; 1='X is typing', 2='X and Y', 3+='X and N others'; phrases from i18n catalog, names joined by Intl.ListFormat; empty=dots only",
  },
};
