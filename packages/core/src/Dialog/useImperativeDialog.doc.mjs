// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useImperativeDialog',
  subComponentOf: 'Dialog',
  displayName: 'useImperativeDialog',
  description:
    'Hook for showing a dialog without managing open state. Call dialog.show(content, options) to open and dialog.hide() to close. Render dialog.element in your JSX tree.',
  props: [
    {
      name: 'show',
      type: "(content: ReactNode, options?: Omit<DialogProps, 'isOpen' | 'onOpenChange' | 'children'>) => void",
      description:
        'Show the dialog with the given content. Options are the same as Dialog props minus isOpen/onOpenChange/children.',
    },
    {
      name: 'hide',
      type: '() => void',
      description: 'Hide the dialog.',
    },
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the dialog is currently open.',
    },
    {
      name: 'element',
      type: 'ReactNode',
      description: 'The dialog element: render this in your JSX tree.',
    },
  ],
};

export const docsDense = {
  name: 'useImperativeDialog',
  description:
    'hook to show a dialog w/o managing open state; call dialog.show(content, options) to open + dialog.hide() to close; render dialog.element in your JSX tree',
  propDescriptions: {
    show: 'show the dialog with given content; options = Dialog props minus isOpen/onOpenChange/children',
    hide: 'hide the dialog',
    isOpen: 'whether the dialog is currently open',
    element: 'the dialog element: render this in your JSX tree',
  },
};
