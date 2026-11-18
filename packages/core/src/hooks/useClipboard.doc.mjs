// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useClipboard',
  displayName: 'useClipboard',
  keywords: [
    'clipboard', 'copy', 'copied', 'paste', 'writeText', 'copy-to-clipboard',
    'copy button', 'announce', 'a11y',
  ],
  params: [
    {
      name: 'options',
      type: 'UseClipboardOptions',
      description: 'Configuration object.',
      required: false,
    },
    {
      name: 'options.announce',
      type: 'string',
      description:
        'Message announced to a polite live region on a successful copy. A swapped aria-label alone is not reliably announced, so pass the localized confirmation (e.g. "Copied") to have it spoken. Omit to skip the announcement.',
      required: false,
    },
    {
      name: 'options.resetAfterMs',
      type: 'number',
      description:
        'Milliseconds isCopied stays true after a successful copy before reverting.',
      default: '2000',
      required: false,
    },
  ],
  returns: [
    {
      name: 'copy',
      type: '(text: string) => Promise<boolean>',
      description:
        'Writes text to the clipboard. On success flips isCopied to true, announces the configured message, restarts the reset timer, and resolves true. Where the frame refuses the async Clipboard API (a sandboxed viewer or an embed whose permissions policy does not allow `clipboard-write`), the text is copied with the browser copy command instead, inside the reader\u2019s click or key press; it resolves true only when the browser copied the text. A failed write is a silent no-op that leaves the copied state unchanged and resolves false.',
    },
    {
      name: 'isCopied',
      type: 'boolean',
      description:
        'True for resetAfterMs after the most recent successful copy, then reverts. Drive the copied confirmation (e.g. a copy → check icon flip) off this.',
    },
  ],
  usage: {
    description:
      'Copy-to-clipboard behavior: the clipboard write, a transient isCopied flag with its own reset timer, and an optional polite screen-reader announcement. Extracted so every copy affordance is a thin control over one implementation instead of re-deriving the timer and announcement. Rapid re-copies restart the reset timer so the confirmation always lasts the full duration, and the timer is cleaned up on unmount. It also copies inside a sandboxed frame that refuses the async Clipboard API, with the browser copy command, inside the reader\u2019s click or key press. CodeBlock and Timestamp build their built-in copy buttons on it; reach for it directly when building a copy affordance that is not a plain icon button (a menu item, a labeled text button, a copy-on-click value chip).',
    bestPractices: [
      { guidance: true, description: 'Drive the copied confirmation (copy → check icon, label swap) off the returned isCopied flag rather than tracking your own state.' },
      { guidance: true, description: 'Pass a localized announce message so the copy is spoken by screen readers; swapping the button aria-label alone is not reliably announced.' },
      { guidance: true, description: 'For the common compact icon copy button, render a ghost IconButton with a "Copy" tooltip and wire onClick to copy(); the tooltip stays "Copy" and the icon flip is the confirmation.' },
      { guidance: false, description: 'Track a separate copied useState alongside the hook; isCopied already reflects the copied window and resets itself.' },
    ],
  },
  relatedComponents: ['CodeBlock', 'Timestamp', 'IconButton'],
  relatedHooks: ['useAnnounce'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Copy-to-clipboard behavior: clipboard write + transient isCopied flag with reset timer + optional polite SR announcement. One implementation shared by copy affordances instead of re-deriving timer/announce. Rapid re-copies restart the timer; timer cleaned up on unmount. CodeBlock/Timestamp build their copy buttons on it.',
  paramDescriptions: {
    options: 'config object.',
    'options.announce': 'polite live-region message on successful copy (e.g. "Copied"); aria-label swap alone is not reliably announced. Omit to skip.',
    'options.resetAfterMs': 'ms isCopied stays true after a copy before reverting.',
  },
  returnDescriptions: {
    copy: '(text) => Promise<boolean>: writes text, flips isCopied, announces, restarts reset timer, resolves true; silent no-op resolving false on rejection.',
    isCopied: 'true for resetAfterMs after the last successful copy; drive the copy → check confirmation off it.',
  },
  usage: {
    description:
      'Copy-to-clipboard behavior (write + isCopied flag with reset timer + optional polite SR announce). Thin controls over one implementation. Rapid re-copies restart the timer; cleaned up on unmount. Use directly for copy affordances that are not plain icon buttons (menu item, labeled text button, value chip).',
    bestPractices: [
      { guidance: true, description: 'Drive the copy → check confirmation off the returned isCopied, not your own state.' },
      { guidance: true, description: 'Pass a localized announce so the copy is spoken (aria-label swap alone is not reliably announced).' },
      { guidance: true, description: 'For a compact icon copy button, use a ghost IconButton with a "Copy" tooltip and wire onClick to copy(); the tooltip stays "Copy" and the icon flip is the confirmation.' },
      { guidance: false, description: 'Track a separate copied useState alongside the hook.' },
    ],
  },
};
