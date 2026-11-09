// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file components/Text.ts
 * @input None
 * @output What @astryxdesign/native adds to the core Text contract
 * @position Native additions read by fromComponentDoc together with core's
 *   Text documentation
 */

import type {NativeAdditions} from '../contract/fromComponentDoc.js';

export const text: NativeAdditions = {
  name: 'Text',
  baseTarget: 'root',
  slots: {children: 'text'},
  sameMeaning: {children: "the component's content, as on the web"},
  webOnly: {
    display: 'CSS display; native layout places text by its container',
    wordBreak: 'CSS line breaking; native text breaks by platform rules',
    textWrap: 'CSS text wrapping; native text wraps by platform rules',
    hasCapsize: 'web text-box trimming of CSS line height',
  },
};
