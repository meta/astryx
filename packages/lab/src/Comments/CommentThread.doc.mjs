// Copyright (c) Meta Platforms, Inc. and affiliates.

// @ts-check

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CommentThread',
  displayName: 'Comment Thread',
  group: 'Comments',
  category: 'Chat',
  keywords: [
    'comment',
    'comment thread',
    'thread',
    'replies',
    'margin comment',
    'annotation',
  ],
  description:
    'One comment thread on its own: its first comment, one level of replies, reactions, edit history, controlled typing and seen metadata, and a reply composer. For a margin comment beside a document, a popover under a highlight, or any surface that shows a single thread.',
  usage: {
    description:
      'A comment thread shows one conversation: its first comment and the replies under it. Use it where a surface shows a single thread, such as a margin card beside a document or a popover opened from a highlight. To show many threads with a composer for new ones, use Comments.',
    anatomy: [
      {
        name: 'Surface',
        required: true,
        description:
          'An outlined Card on a page, or a Section without outer rules inside a card or popover. A press anywhere on it opens the thread; a visually hidden toggle carries its name and focus.',
      },
      {
        name: 'Quoted passage',
        required: false,
        description:
          'The passage an inline comment discusses, as an italic blockquote ruled in the highlight color, with an Outdated badge once the passage is edited away.',
      },
      {
        name: 'First comment',
        required: true,
        description:
          'Avatar, header (name, time, Edited, Resolved, and the actions shown on hover or focus), Markdown body clamped to three lines until the thread opens, and reactions.',
      },
      {
        name: 'Replies',
        required: false,
        description:
          'One level of replies behind View replies, joined to the first comment by an avatar rail while the thread is open. A host-marked unread reply reveals without selecting the thread, moving focus, or opening the reply composer.',
      },
      {
        name: 'Live state',
        required: false,
        description:
          'Controlled typing state follows the conversation while the thread is open, with its pulsing dots in the avatar column and its label on the comment-text line. Controlled `seenBy` metadata remains available to comment render callbacks but has no default presentation.',
      },
      {
        name: 'Reply composer',
        required: false,
        description:
          'A CommentComposer that opens with the thread, beside the viewer’s avatar.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Inside a card or popover, set `container="card"` and give the card no padding: the thread supplies its own insets and draws no outer rules.',
      },
      {
        guidance: true,
        description:
          'Control `isSelected` when the thread opens from elsewhere, such as its highlight in a document. Controlled selection reveals the body and replies without moving focus or opening the reply composer.',
      },
      {
        guidance: true,
        description:
          'In a Popover over a document, pass `onDismiss` and pair it with `hasLightDismiss={false}` and `hasEscapeDismiss={false}` on the host Popover. A press outside the thread or Escape then closes it, except that the first one over an unsaved reply or edit shakes the thread and keeps the draft.',
      },
      {
        guidance: true,
        description:
          'Map your collaboration state to `typingUsers` and `seenBy`, then publish local reply and edit activity with `onComposerDraftChange`. `seenBy` stays hidden unless a comment render callback presents it. The thread never opens a connection or expires participants.',
      },
      {
        guidance: false,
        description:
          'Stack several CommentThreads with a composer to build a discussion. Use Comments, which keeps one thread open at a time and orders threads with activity.',
      },
      {
        guidance: false,
        description:
          'Wrap the thread in your own button or link to open it. The thread is already one toggle; a second control nests interactive elements.',
      },
      {
        guidance: false,
        description:
          'Leave the host Popover’s light dismiss on while passing `onDismiss`. The browser closes the Popover before the thread can keep a draft.',
      },
    ],
    accessibility: [
      {
        name: 'Escape',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'With `onDismiss`, Escape dismisses the thread only when no layer inside it is open. An open emoji picker, menu, or dialog closes first, one Escape at a time.',
      },
      {
        name: 'Unsaved draft warning',
        category: 'Semantics',
        criterion: '4.1.3 Status Messages',
        description:
          'When a dismissal would discard an unsaved reply or edit, the thread stays open, focus returns to the draft, and a polite live region says the draft is unsaved and that dismissing again discards it. The shake is never the only signal.',
      },
      {
        name: 'Reduced motion',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'Under `prefers-reduced-motion: reduce` the thread does not shake. Focus and the announcement still mark the kept draft.',
      },
    ],
  },
  props: [
    {
      name: 'comment',
      type: 'CommentThreadData',
      required: true,
      description:
        'The thread: its first comment, carrying its replies, reactions, optional anchor, transient `typingUsers`, and per-comment `seenBy` metadata. `seenBy` is not rendered by default but remains available to comment render callbacks.',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description:
        'Whether the thread is open, controlled: body unclamped and replies shown. Omit it to let the thread own selection. Host-controlled selection never moves focus or opens the reply composer; a viewer Reply action does.',
    },
    {
      name: 'onSelectedChange',
      type: '(isSelected: boolean) => void',
      description: 'Called when the viewer opens or closes the thread.',
    },
    {
      name: 'onDismiss',
      type: '() => void',
      description:
        'Hands the thread its anchored host’s light dismissal. A press outside the thread, or an Escape no layer inside it handled, calls it. While a reply or edit holds unsaved text, the first request instead shakes the thread, returns focus to the draft, and announces; the next consecutive request dismisses, and typing or pressing inside the thread re-arms the warning. Pair it with `hasLightDismiss={false}` and `hasEscapeDismiss={false}` on the host Popover. Omit it and the thread never dismisses anything.',
    },
    {
      name: 'currentUser',
      type: 'CommentUser',
      description: 'The viewer, for own-comment actions and the reply avatar.',
    },
    {
      name: 'mode',
      type: "'interactive' | 'non-editable' | 'read-only'",
      default: "'interactive'",
      description: 'Which actions show, as on Comments.',
    },
    {
      name: 'container',
      type: "'section' | 'card'",
      default: "'section'",
      description:
        'The parent surface: an outlined Card on a page, or a Section without outer rules inside a card or popover.',
    },
    {
      name: 'onSubmit',
      type: '(content: string, parentCommentId?: string) => void | Promise<void>',
      description:
        'Posts a reply, always with the thread’s first comment as the parent. A rejected Promise restores the draft and shows an error with Retry.',
    },
    {
      name: 'onComposerDraftChange',
      type: '(value: string, context: CommentComposerContext) => void',
      description:
        'Reports internally owned reply and edit drafts, including seeds and an empty value after submit, cancel, or a target switch. Route updates by `context` and own transport timing in your app.',
    },
    {
      name: 'onSaveEdit',
      type: '(commentId: string, content: string) => void | Promise<void>',
      description:
        'Adds Edit to the viewer’s own comments and saves the new Markdown.',
    },
    {
      name: 'onDelete',
      type: '(commentId: string) => void | Promise<void>',
      description:
        'Adds Delete to the viewer’s own comments, confirmed in a dialog first.',
    },
    {
      name: 'onReact',
      type: '(commentId: string, reactionKey: string, option?: CommentReactionOption) => void | Promise<void>',
      description: 'Toggles the viewer’s reaction by its stable key.',
    },
    {
      name: 'onRetryComment',
      type: '(commentId: string) => void | Promise<void>',
      description: 'Adds Retry to a comment whose `status` is `error`.',
    },
    {
      name: 'onResolveThread',
      type: '(commentId: string) => void | Promise<void>',
      description: 'Adds Mark as resolved to an open thread.',
    },
    {
      name: 'onReopenThread',
      type: '(commentId: string) => void | Promise<void>',
      description: 'Adds Reopen to a resolved thread.',
    },
    {
      name: 'loadVersions',
      type: '(commentId: string) => Promise<readonly CommentVersion[]>',
      description: 'Loads a comment’s edit history, newest first.',
    },
    {
      name: 'onUploadImages',
      type: '(files: readonly File[], context: CommentComposerContext) => CommentUploadedImage[] | Promise<CommentUploadedImage[]>',
      description:
        'Uploads images attached, pasted, or dropped in the reply composer and appends them as Markdown images.',
    },
    {
      name: 'isSubmitting',
      type: 'boolean',
      default: 'false',
      description: 'Host-controlled pending state for the reply composer.',
    },
    {
      name: 'composerPlaceholder',
      type: 'string',
      description:
        'Placeholder of the reply composer. Defaults to the localized "Reply to <name>…".',
    },
    {
      name: 'highlightColor',
      type: "'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
      default: "'yellow'",
      description:
        'The palette color your app highlights the thread’s passage in.',
    },
    {
      name: 'reactionOptions',
      type: 'readonly CommentReactionOption[]',
      default: 'DEFAULT_COMMENT_REACTIONS',
      description: 'The reactions Add reaction offers.',
    },
    {
      name: 'agentCommands',
      type: 'readonly CommentAgentCommand[]',
      description: 'Agents a reply can address with a `/` command.',
    },
    {
      name: 'composerTriggers',
      type: 'readonly ChatComposerTrigger[]',
      description:
        'Typeahead triggers for the reply composer, such as an `@` people search.',
    },
    {
      name: 'markdownPlugins',
      type: 'readonly MarkdownPluginEntry[]',
      description: 'Block Markdown plugins for comment bodies.',
    },
    {
      name: 'markdownInlinePlugins',
      type: 'readonly MarkdownInlinePlugin[]',
      description:
        'Inline Markdown plugins for comment bodies, such as mentions.',
    },
    {
      name: 'getReplyMention',
      type: '(author: CommentUser) => string | undefined',
      description: 'Seeds a reply to a reply with a mention of its author.',
    },
    {
      name: 'hasEmojiPicker',
      type: 'boolean',
      default: 'true',
      description: 'Whether the reply composer offers the emoji picker.',
    },
    {
      name: 'renderAnchor',
      type: '(comment: CommentThreadData, defaultAnchor: ReactNode) => ReactNode',
      description: 'Replaces the thread’s quoted passage.',
    },
    {
      name: 'renderBody',
      type: '(comment: CommentData) => ReactNode',
      description: 'Replaces a comment’s Markdown body.',
    },
    {
      name: 'renderVersionBody',
      type: '(version: CommentVersion) => ReactNode',
      description: 'Replaces the body of a version in the edit history.',
    },
    {
      name: 'renderAdditionalActions',
      type: '(comment: CommentData) => ReactNode',
      description: 'Adds product actions to a comment’s header.',
    },
    {
      name: 'renderComposer',
      type: '(props: CommentComposerRenderProps) => ReactNode',
      description:
        'Replaces the reply composer’s input while the thread keeps its draft and state.',
    },
  ],
  examples: [
    {
      label: 'Margin comment',
      code: `import {Card} from '@astryxdesign/core/Card';
import {CommentThread} from '@astryxdesign/lab';

<Card padding={0} width={320}>
  <CommentThread
    comment={{
      id: 'margin',
      author: {id: 'maya', name: 'Maya Chen'},
      body: 'Should this say three days? The dry run adds one.',
      createdAt: '2026-09-30T19:00:00Z',
      anchor: {quote: 'The final cohort completes rollout in two days.'},
    }}
    currentUser={{id: 'avery', name: 'Avery Kim'}}
    container="card"
    onSubmit={(body, parentId) => postReply(parentId, body)}
  />
</Card>`,
    },
    {
      label: 'In a popover that keeps unsaved drafts',
      code: `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Popover} from '@astryxdesign/core/Popover';
import {CommentThread} from '@astryxdesign/lab';

function CommentPopover({thread, viewer}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      hasLightDismiss={false}
      hasEscapeDismiss={false}
      label="Comment"
      padding={0}
      width={340}
      content={
        <CommentThread
          comment={thread}
          currentUser={viewer}
          container="card"
          isSelected
          onSubmit={(body, parentId) => postReply(parentId, body)}
          onDismiss={() => setIsOpen(false)}
        />
      }>
      <Button label="1 comment" variant="secondary" />
    </Popover>
  );
}`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  description:
    '单独呈现的一个评论线程：首条评论、一级回复、表情回应、编辑历史、受控的输入中与已读元数据，以及回复输入框。适用于文档旁的边注、高亮下方的弹出层，或任何只显示单个线程的界面。',
  usage: {
    description:
      '评论线程展示一段对话：首条评论及其下的回复。用于只显示单个线程的界面，例如文档旁的边注卡片，或从高亮处打开的弹出层。要显示多个线程并提供新评论输入框，请使用 Comments。',
    bestPractices: [
      {
        guidance: true,
        description:
          '放在卡片或弹出层中时，设置 `container="card"` 并去掉卡片的内边距：线程自带内边距，且不绘制外框线。',
      },
      {
        guidance: true,
        description:
          '当线程从其他位置打开（例如文档中的高亮）时，控制 `isSelected`。受控选中会展开正文和回复，但不会移动焦点或打开回复输入框。',
      },
      {
        guidance: true,
        description:
          '在覆盖文档的 Popover 中，传入 `onDismiss`，并在宿主 Popover 上设置 `hasLightDismiss={false}` 和 `hasEscapeDismiss={false}`。这样在线程外按下或按 Escape 会关闭线程；但若回复或编辑中有未保存的文字，第一次只会抖动线程并保留草稿。',
      },
      {
        guidance: true,
        description:
          '将协作状态映射到 `typingUsers` 和 `seenBy`，再通过 `onComposerDraftChange` 发布本地的回复和编辑动态。`seenBy` 默认不显示，除非评论渲染回调展示它。线程从不建立连接，也不会让参与者过期。',
      },
      {
        guidance: false,
        description:
          '把多个 CommentThread 与输入框堆叠成讨论区。请使用 Comments，它一次只展开一个线程，并按动态排序线程。',
      },
      {
        guidance: false,
        description:
          '用自己的按钮或链接包裹线程来打开它。线程本身已是一个切换控件；再加一个控件会嵌套交互元素。',
      },
      {
        guidance: false,
        description:
          '传入 `onDismiss` 时仍保留宿主 Popover 的轻触关闭。浏览器会在线程保留草稿之前关闭 Popover。',
      },
    ],
    accessibility: [
      {
        name: 'Escape',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          '传入 `onDismiss` 后，只有当线程内没有打开的图层时，Escape 才会关闭线程。打开的表情选择器、菜单或对话框会先关闭，每次 Escape 只关闭一层。',
      },
      {
        name: '未保存草稿提示',
        category: 'Semantics',
        criterion: '4.1.3 Status Messages',
        description:
          '当关闭会丢弃未保存的回复或编辑时，线程保持打开，焦点回到草稿，礼貌型实时区域会说明草稿尚未保存，再次关闭将丢弃它。抖动从来不是唯一的提示。',
      },
      {
        name: '减少动态效果',
        criterion: '2.3.3 Animation from Interactions',
        description:
          '在 `prefers-reduced-motion: reduce` 下线程不会抖动。焦点移动和播报仍会提示草稿已保留。',
      },
    ],
  },
  propDescriptions: {
    comment:
      '线程：首条评论，携带其回复、表情回应、可选锚点、临时的 `typingUsers`，以及每条评论的 `seenBy` 元数据。`seenBy` 默认不渲染，但评论渲染回调可以使用。',
    isSelected:
      '线程是否展开（受控）：正文不截断并显示回复。省略时由线程自行管理选中。宿主控制的选中从不移动焦点或打开回复输入框；查看者点击“回复”才会。',
    onSelectedChange: '查看者展开或收起线程时调用。',
    onDismiss:
      '把锚定宿主的轻触关闭交给线程处理。在线程外按下，或线程内没有图层处理的 Escape，都会调用它。若回复或编辑中有未保存的文字，第一次请求改为抖动线程、把焦点移回草稿并播报；紧接着的下一次请求才会关闭，输入或在线程内按下会重新启用提示。请在宿主 Popover 上同时设置 `hasLightDismiss={false}` 和 `hasEscapeDismiss={false}`。省略时线程不会关闭任何东西。',
    currentUser: '查看者，用于本人评论的操作和回复头像。',
    mode: '显示哪些操作，与 Comments 相同。',
    container:
      '父级界面：页面上的描边 Card，或卡片、弹出层中不带外框线的 Section。',
    onSubmit:
      '发布回复，父级始终是线程的首条评论。被拒绝的 Promise 会恢复草稿，并显示带“重试”的错误。',
    onComposerDraftChange:
      '报告线程内部管理的回复和编辑草稿，包括预填内容，以及提交、取消或切换目标后的空值。请按 `context` 分发更新，并在应用中自行控制传输时机。',
    onSaveEdit: '为查看者自己的评论添加“编辑”，并保存新的 Markdown。',
    onDelete: '为查看者自己的评论添加“删除”，先在对话框中确认。',
    onReact: '按稳定的键切换查看者的表情回应。',
    onRetryComment: '为 `status` 为 `error` 的评论添加“重试”。',
    onResolveThread: '为未解决的线程添加“标记为已解决”。',
    onReopenThread: '为已解决的线程添加“重新打开”。',
    loadVersions: '加载评论的编辑历史，最新的在前。',
    onUploadImages:
      '上传在回复输入框中附加、粘贴或拖入的图片，并以 Markdown 图片追加。',
    isSubmitting: '宿主控制的回复输入框等待状态。',
    composerPlaceholder: '回复输入框的占位文字。默认为本地化的“回复 <name>…”。',
    highlightColor: '应用中高亮该线程所引用段落的调色板颜色。',
    reactionOptions: '“添加表情回应”提供的选项。',
    agentCommands: '回复可以通过 `/` 命令呼叫的智能体。',
    composerTriggers: '回复输入框的联想触发器，例如 `@` 人员搜索。',
    markdownPlugins: '评论正文的块级 Markdown 插件。',
    markdownInlinePlugins: '评论正文的行内 Markdown 插件，例如提及。',
    getReplyMention: '回复某条回复时，用提及其作者的内容预填。',
    hasEmojiPicker: '回复输入框是否提供表情选择器。',
    renderAnchor: '替换线程引用的段落。',
    renderBody: '替换评论的 Markdown 正文。',
    renderVersionBody: '替换编辑历史中某个版本的正文。',
    renderAdditionalActions: '向评论标题栏添加产品操作。',
    renderComposer: '替换回复输入框的输入区域，线程仍保留其草稿和状态。',
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'One comment thread alone: first comment, one reply level, reactions, edit history, controlled typing/seen metadata, reply composer. For margin comments, highlight popovers, any single-thread surface.',
  usage: {
    description:
      'One conversation: first comment plus replies. For margin cards or highlight popovers. Many threads with a new-comment composer: use Comments.',
    bestPractices: [
      {
        guidance: true,
        description:
          'In a card or popover: `container="card"`, card padding 0. Thread owns insets, draws no outer rules.',
      },
      {
        guidance: true,
        description:
          'Control `isSelected` when opened from elsewhere (a document highlight). Reveals body and replies without moving focus or opening the composer.',
      },
      {
        guidance: true,
        description:
          'In a Popover over a document: pass `onDismiss`, set `hasLightDismiss={false}` and `hasEscapeDismiss={false}` on the host. Outside press or Escape closes; the first over an unsaved reply/edit shakes and keeps the draft.',
      },
      {
        guidance: true,
        description:
          'Map collaboration state to `typingUsers`/`seenBy`; publish local drafts via `onComposerDraftChange`. `seenBy` hidden unless a render callback shows it. No connections, no participant expiry.',
      },
      {
        guidance: false,
        description:
          'Stack CommentThreads plus a composer as a discussion. Use Comments.',
      },
      {
        guidance: false,
        description:
          'Wrap the thread in your own button/link. It is already one toggle.',
      },
      {
        guidance: false,
        description:
          'Keep host Popover light dismiss on with `onDismiss`. The browser closes it before the thread can keep a draft.',
      },
    ],
    accessibility: [
      {
        name: 'Escape',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'With `onDismiss`, Escape dismisses only when no inner layer is open. Picker, menu, or dialog closes first, one per Escape.',
      },
      {
        name: 'Unsaved draft warning',
        category: 'Semantics',
        criterion: '4.1.3 Status Messages',
        description:
          'A dismissal over an unsaved reply/edit keeps the thread open, refocuses the draft, and announces politely. Shake is never the only signal.',
      },
      {
        name: 'Reduced motion',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'No shake under `prefers-reduced-motion: reduce`; focus and announcement remain.',
      },
    ],
  },
  propDescriptions: {
    comment:
      'The thread: first comment with replies, reactions, optional anchor, transient `typingUsers`, per-comment `seenBy` (not rendered by default).',
    isSelected:
      'Controlled open state. Omit for uncontrolled. Never moves focus or opens the composer.',
    onSelectedChange: 'Viewer opened or closed the thread.',
    onDismiss:
      'Thread owns its anchored host’s light dismissal: outside press or unhandled Escape calls it. Over an unsaved reply/edit, the first request shakes, refocuses the draft, announces; the next consecutive one dismisses. Typing or pressing inside re-arms. Pair with host `hasLightDismiss={false}` and `hasEscapeDismiss={false}`.',
    currentUser: 'Viewer: own-comment actions, reply avatar.',
    mode: 'Which actions show, as on Comments.',
    container:
      'Parent surface: outlined Card on a page, or rule-less Section in a card/popover.',
    onSubmit:
      'Posts a reply; parent is always the first comment. Rejection restores the draft with Retry.',
    onComposerDraftChange:
      'Reports reply/edit drafts, seeds, and empty values after submit, cancel, or target switch. Route by `context`.',
    onSaveEdit: 'Adds Edit to own comments; saves new Markdown.',
    onDelete: 'Adds Delete to own comments, confirmed in a dialog.',
    onReact: 'Toggles the viewer’s reaction by stable key.',
    onRetryComment: 'Adds Retry to `status: error` comments.',
    onResolveThread: 'Adds Mark as resolved to an open thread.',
    onReopenThread: 'Adds Reopen to a resolved thread.',
    loadVersions: 'Loads edit history, newest first.',
    onUploadImages: 'Uploads composer images; appends Markdown images.',
    isSubmitting: 'Host pending state for the reply composer.',
    composerPlaceholder:
      'Reply placeholder. Default: localized "Reply to <name>…".',
    highlightColor: 'Palette color of the passage highlight.',
    reactionOptions: 'Reactions Add reaction offers.',
    agentCommands: 'Agents a reply can address with `/`.',
    composerTriggers: 'Reply typeahead triggers, e.g. `@` people search.',
    markdownPlugins: 'Block Markdown plugins for bodies.',
    markdownInlinePlugins: 'Inline Markdown plugins for bodies, e.g. mentions.',
    getReplyMention: 'Seeds a reply-to-reply with an author mention.',
    hasEmojiPicker: 'Whether the reply composer offers the emoji picker.',
    renderAnchor: 'Replaces the quoted passage.',
    renderBody: 'Replaces a comment’s Markdown body.',
    renderVersionBody: 'Replaces a history version’s body.',
    renderAdditionalActions: 'Adds product actions to a comment header.',
    renderComposer: 'Replaces the reply input; thread keeps draft and state.',
  },
};
