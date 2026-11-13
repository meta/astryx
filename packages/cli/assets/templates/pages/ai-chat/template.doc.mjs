// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'AI Chat Conversation',
  displayName: 'AI Chat Conversation',
  description:
    'Transcript of alternating turns carrying mixed rich content inline (markdown, code blocks, collapsible tool-call output) beside a resizable artifact panel that holds generated output while the stream keeps scrolling.',
  keywords: [
    'chat',
    'conversation',
    'assistant',
    'messages',
    'copilot thread',
    'agent',
    'session',
    'composer',
    'questions',
    'answers with citations',
    'reasoning trace',
    'prompt playground',
  ],
  isReady: true,
  category: 'AI Chat - Conversation',
  icons: {
    AtSymbolIcon: 'mention',
    ChevronRightIcon: 'chevronRight',
    ClipboardDocumentIcon: 'clipboard',
    DocumentTextIcon: 'document',
    PaperClipIcon: 'attach',
    ShareIcon: 'share',
    XMarkIcon: 'close',
  },
  slots: [
    {
      name: 'messages',
      kind: 'chat',
      description:
        'Scrolling message list in the left chat column with user and assistant turns, tool calls, code, and system notes.',
    },
    {
      name: 'composer',
      kind: 'chat',
      description:
        'Chat composer pinned below the message list, with mention, attach, and mode controls.',
    },
    {
      name: 'artifact-toolbar',
      kind: 'toolbar',
      description:
        'Toolbar at the top of the right artifact panel with document title, version menu, copy, share, and close.',
    },
    {
      name: 'artifact',
      kind: 'panel',
      description:
        'Resizable side panel right of the chat holding the scrollable generated markdown document.',
    },
  ],
};
