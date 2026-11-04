// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTreeFocus',
  name: 'useTreeFocus — Keyboard File Tree',
  displayName: 'useTreeFocus — Keyboard File Tree',
  description:
    'A custom file tree built from plain rows with tree roles. useTreeFocus gives it the WAI-ARIA tree keyboard model: ArrowUp and ArrowDown move over the visible rows, ArrowRight opens a folder or moves into it, ArrowLeft closes it or moves to its parent, Home and End jump to the ends, a typed letter jumps to a matching name, Enter opens a file, and only one row is in the tab order.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Icon', 'Text', 'Layout'],
  icons: {ChevronDownIcon: 'chevronDown', ChevronRightIcon: 'chevronRight'},
};
