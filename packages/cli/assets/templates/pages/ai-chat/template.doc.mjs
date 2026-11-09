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
};
