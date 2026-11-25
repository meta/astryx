// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'RichTextEditorAutoLinkPlugin',
  subComponentOf: 'RichTextEditor',
  description:
    'Turns typed and pasted URLs and email addresses into links, in the plugins slot of RichTextEditor.',
  displayName: 'Rich Text Editor Auto-Link Plugin',
  keywords: ['richtext', 'autolink', 'link', 'url', 'email', 'plugin'],
  props: [
    {
      name: 'matchers',
      type: 'LinkMatcher[]',
      description:
        'Link matchers to use. The default recognizes URLs and email addresses and opens the links in a new tab. An array you pass replaces the default: spread DEFAULT_LINK_MATCHERS, exported by @astryxdesign/richtext, into it to keep URL and email links. Build extra matchers with createLinkMatcherWithRegExp from @lexical/react/LexicalAutoLinkPlugin; their links open in the same tab unless the matcher returns NEW_TAB_LINK_ATTRIBUTES as attributes.',
      default: 'DEFAULT_LINK_MATCHERS',
    },
    {
      name: 'onChange',
      type: '(url: string | null, prevUrl: string | null) => void',
      description:
        'Called when auto-linking creates, updates or removes a link. It gets the new URL, or null when the link is removed, and the previous URL.',
    },
  ],
  usage: {
    description:
      "Turns typed and pasted URLs and email addresses into links. Text inside a code block stays code and is never linked. Render it in RichTextEditor's plugins slot; it reaches the editor through the editor's Lexical composer and uses AutoLinkNode, which the editor registers by default.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass it as plugins={<RichTextEditorAutoLinkPlugin />}. Its links open in a new tab, with target="_blank" and rel="noopener noreferrer" in the node.',
      },
      {
        guidance: true,
        description:
          'To link another pattern as well, pass matchers={[...DEFAULT_LINK_MATCHERS, myMatcher]}. Passing matchers={[myMatcher]} alone stops URL and email links.',
      },
      {
        guidance: false,
        description:
          "Render it outside RichTextEditor's plugins slot: it needs the editor's Lexical composer.",
      },
    ],
  },
};
