// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CopyToClipboard',
  displayName: 'Copy To Clipboard',
  group: 'Button',
  category: 'Action',
  keywords: [
    'copy',
    'clipboard',
    'copytoclipboard',
    'copy button',
    'icon button',
    'duplicate',
    'install command',
    'check',
  ],
  description:
    'An icon-only button that writes text to the clipboard and flips its icon from copy to check while the copied confirmation is active. Thin wrapper over IconButton and the useClipboard hook, which owns the clipboard write, the transient copied flag with its reset timer, and the polite screen-reader announcement.',
  usage: {
    description:
      'CopyToClipboard copies a fixed string to the clipboard when activated. Use it wherever people need the exact text — an install command, an invitation code, a share link — without selecting it manually. The copy behavior itself lives in the useClipboard hook; this control is a thin shell over it.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give the control a specific label when several copy controls share a page (for example, "Copy install command"), so assistive technology can tell them apart.',
      },
      {
        guidance: true,
        description:
          'Render the copied confirmation through the icon flip and the built-in announcement; do not replace the tooltip text after a copy.',
      },
      {
        guidance: false,
        description:
          'Use CopyToClipboard for long dynamic content people may want to edit before copying. Render the content in an editable field and let people copy from there.',
      },
    ],
    anatomy: [
      {
        name: 'IconButton',
        required: true,
        description:
          'The icon-only button root. Renders the copy icon in the default state and the check icon while the copied confirmation is active.',
      },
    ],
  },
  props: [
    {
      name: 'text',
      type: 'string',
      description: 'The text written to the clipboard when the control is activated.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label and tooltip override for the default state. Defaults to the localized "Copy to clipboard".',
    },
    {
      name: 'onCopy',
      type: 'function',
      description: 'Called after the clipboard write succeeds. A rejected write is a silent no-op that never calls this.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Icon-only button that copies text to the clipboard. Icon flips copy to check while the copied confirmation is active.',
  usage: {
    description:
      'Copies a fixed string on activation. Behavior lives in the useClipboard hook; this control is a thin shell over it.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use a specific label when several copy controls share a page.',
      },
      {
        guidance: true,
        description: 'Show confirmation through the icon flip and built-in announcement, not a tooltip change.',
      },
      {
        guidance: false,
        description: 'Not for long dynamic content people may edit before copying.',
      },
    ],
  },
  propDescriptions: {
    text: 'text written to the clipboard on activation.',
    label: 'accessible label and tooltip override; defaults to the localized "Copy to clipboard".',
    onCopy: 'called after the clipboard write succeeds.',
  },
};
