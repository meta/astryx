// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTruncation',
  name: 'useTruncation — Cut-Off Text in a Table',
  displayName: 'useTruncation — Cut-Off Text in a Table',
  description:
    "A narrow table column of paths, cut to one line or clamped to two with Text's maxLines. Text's own tooltip, built on useTruncation, shows the full path only while it is cut off and adds no second description; the short path shows none.",
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Table', 'Text'],
};
