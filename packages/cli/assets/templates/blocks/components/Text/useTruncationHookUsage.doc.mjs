// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTruncation',
  name: 'useTruncation — Show More on Cut-Off Text',
  displayName: 'useTruncation — Show More on Cut-Off Text',
  description:
    "A narrow table column of paths. One-line cells use Text's maxLines, whose own tooltip shows the full path only while it is cut off and adds no second description. A cell clamped to two lines uses useTruncation to show a Show more toggle only when the clamp cuts its path; the short path shows nothing extra.",
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Table', 'Text', 'Button'],
};
