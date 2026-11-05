// Copyright (c) Meta Platforms, Inc. and affiliates.

// @ts-check

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CommentComposer',
  displayName: 'Comment Composer',
  group: 'Comments',
  category: 'Chat',
  keywords: ['comment box', 'comment input', 'reply box', 'composer'],
  description:
    'A comment composer: an input that grows to five lines, with typeahead triggers and pasted or dropped images, above attach and emoji buttons and Post. Controlled: your app owns the draft.',
  usage: {
    description:
      'A comment composer writes a new comment. Use it where comments start outside a Comments panel, such as a new margin comment on a text selection. Comments and CommentThread use it for new comments, replies, and edits.',
    anatomy: [
      {
        name: 'Quoted passage',
        required: false,
        description:
          'The passage a new inline comment attaches to, in a muted card above the input.',
      },
      {
        name: 'Input',
        required: true,
        description:
          'Grows with its text to five lines. Enter posts; Shift+Enter adds a line.',
      },
      {
        name: 'Footer',
        required: true,
        description:
          'Attach images (with `onUploadImages`), Add emoji, your `controls`, then Post at the end.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Clear the draft once the comment posts, and keep it when posting fails: show `error` with `onRetry`.',
      },
      {
        guidance: true,
        description:
          'Name the input for its context with `label` when the placeholder alone would be vague, such as "Reply to Maya Chen".',
      },
      {
        guidance: false,
        description:
          'Disable the composer while posting. Pass `isSubmitting`: the input keeps focus, and Post stays focusable but refuses a second press.',
      },
      {
        guidance: false,
        description:
          'Put long instructions in the placeholder. It disappears as the viewer types; keep guidance in surrounding text.',
      },
    ],
  },
  props: [
    {
      name: 'value',
      type: 'string',
      required: true,
      description: 'The draft, controlled.',
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      required: true,
      description:
        'Called with the new draft as the viewer types, picks an emoji, or uploads an image.',
    },
    {
      name: 'onSubmit',
      type: '(value: string) => void',
      required: true,
      description:
        'Posts the draft from Enter or Post. Empty drafts never post.',
    },
    {
      name: 'placeholder',
      type: 'string',
      description:
        'Placeholder, and the input’s accessible name unless `label` is set. Defaults to the localized "Write a comment…".',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible name of the input.',
    },
    {
      name: 'isSubmitting',
      type: 'boolean',
      default: 'false',
      description:
        'Holds the attach and emoji buttons while a post is in flight, and makes Post refuse a second press. The composer reports busy.',
    },
    {
      name: 'error',
      type: 'string',
      description: 'Shows an error Banner above the composer.',
    },
    {
      name: 'onRetry',
      type: '() => void',
      description: 'Adds Retry to the `error` Banner.',
    },
    {
      name: 'anchor',
      type: 'CommentAnchor',
      description:
        'The passage a new inline comment attaches to, quoted above the input.',
    },
    {
      name: 'onAnchorDismiss',
      type: '() => void',
      description:
        'Adds Remove quoted text to the quoted passage; clear `anchor` when it is called.',
    },
    {
      name: 'highlightColor',
      type: "'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
      default: "'yellow'",
      description:
        'The palette color your app highlights passages in; the quote draws its rule in it.',
    },
    {
      name: 'onUploadImages',
      type: '(files: readonly File[]) => CommentUploadedImage[] | Promise<CommentUploadedImage[]>',
      description:
        'Uploads attached, pasted, or dropped images and appends them to the draft as Markdown. Adds the attach button.',
    },
    {
      name: 'triggers',
      type: 'readonly ChatComposerTrigger[]',
      description: 'Typeahead triggers, such as an `@` people search.',
    },
    {
      name: 'agentCommands',
      type: 'readonly CommentAgentCommand[]',
      description: 'Agents the comment can address: typing `/` lists them.',
    },
    {
      name: 'hasEmojiPicker',
      type: 'boolean',
      default: 'true',
      description: 'Whether the Add emoji button shows.',
    },
    {
      name: 'controls',
      type: 'ReactNode',
      description: 'Product-owned controls after the attach and emoji buttons.',
    },
  ],
  examples: [
    {
      label: 'New comment',
      code: `import {useState} from 'react';
import {CommentComposer} from '@astryxdesign/lab';

export default function Example() {
  const [draft, setDraft] = useState('');
  return (
    <CommentComposer
      value={draft}
      onChange={setDraft}
      onSubmit={body => {
        post(body);
        setDraft('');
      }}
    />
  );
}`,
    },
  ],
};
