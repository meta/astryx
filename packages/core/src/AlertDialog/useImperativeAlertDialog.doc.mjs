// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useImperativeAlertDialog',
  subComponentOf: 'AlertDialog',
  displayName: 'useImperativeAlertDialog',
  description:
    'Hook for showing an alert dialog without managing open state. Call alert.show(options) to open and alert.hide() to close. Render alert.element in your JSX tree.',
  props: [
    {
      name: 'show',
      type: "(options: Omit<AlertDialogProps, 'isOpen' | 'onOpenChange'>) => void",
      description:
        'Show the alert dialog with the given options. Options are the same as AlertDialog props minus isOpen/onOpenChange.',
    },
    {
      name: 'hide',
      type: '() => void',
      description: 'Hide the alert dialog.',
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
  name: 'useImperativeAlertDialog',
  description:
    'Hook to show alert dialog w/o managing open state. Call alert.show(options) to open, alert.hide() to close; render alert.element in JSX tree.',
  propDescriptions: {
    show: 'show dialog w/ options; same as AlertDialog props minus isOpen/onOpenChange',
    hide: 'hide dialog',
    isOpen: 'dialog currently open?',
    element: 'dialog element: render in JSX tree',
  },
};
