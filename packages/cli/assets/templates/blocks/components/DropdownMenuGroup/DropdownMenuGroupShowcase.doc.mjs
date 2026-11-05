// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'DropdownMenuGroup',
  name: 'DropdownMenuGroup',
  displayName: 'Dropdown Menu Group',
  description:
    'A compound-mode menu whose rows are titled in groups. Each DropdownMenuGroup renders a role="group" named by its heading; arrow keys and typeahead skip the heading.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['DropdownMenu', 'DropdownMenuGroup', 'DropdownMenuItem'],
};
