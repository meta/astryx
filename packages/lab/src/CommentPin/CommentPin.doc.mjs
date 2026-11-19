// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommentPin.doc.mjs
 * @input CommentPin API, anatomy, ownership boundaries, and examples
 * @output Consumer documentation for the Lab comment pin
 * @position CLI and docsite metadata; the runnable showcase lives in packages/lab/blocks
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Marker surface',
    required: true,
    description:
      'The compact speech-bubble button surface, with a fixed 2px logical bottom-start corner, 28, 32, or 36px tall by size and padded equally on every side. It owns selected, resolved, disabled, hover, press, focus-visible, and grouped presentation, but no coordinates.',
  },
  {
    name: 'Representative avatars',
    required: true,
    description:
      'One Avatar for a single thread. A group shows its distinct participants as an AvatarGroup capped at three circles: up to three Avatars, or two Avatars plus the overflow indicator when more than three people participate. Avatars are decorative inside the marker; the button label owns accessibility.',
  },
  {
    name: 'Overflow indicator',
    required: false,
    description:
      'An ellipsis AvatarGroupOverflow circle that takes the third position when a group has more than three distinct participants. It shows no number, so the group count stays the pin’s only number. Decorative and non-interactive inside the pin.',
  },
  {
    name: 'Group count',
    required: false,
    description:
      'Exact total number of represented threads. Appears when threadCount is greater than one, before the unread dot when there is one; it is a quantity, not ordinal identity. Extra end padding keeps it clear of the pin’s edge.',
  },
  {
    name: 'Unread dot',
    required: false,
    description:
      'An accent StatusDot at the end of the pin that marks unread activity whenever unreadCount is above zero: after the group count, or after the participant on a single-thread pin. It adds no second number; decorative inside the pin.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'CommentPin',
  displayName: 'Comment Pin',
  group: 'Comments',
  category: 'Chat',
  keywords: [
    'annotation',
    'marker',
    'pin',
    'comment',
    'thread',
    'anchor',
    'avatar',
    'grouped comments',
    'image annotation',
    'margin comment',
  ],
  description:
    'Avatar-first button for opening one anchored annotation thread or a caller-defined group. A single marker shows its lead participant; a grouped marker shows up to three participant circles (two plus an ellipsis beyond three) and the total thread count. Whenever any represented thread is unread, an accent status dot appears after the count. Three sizes follow the element-size scale. The host owns anchors, coordinates, grouping, collision handling, and the comments surface.',
  props: [
    {
      name: 'label',
      type: 'string',
      description:
        'Required accessible action name and hover/focus tooltip. Include grouped, unread, or resolved context when it changes the action meaning, for example “Open 4 grouped annotations from Ada and Lin, 2 unread”.',
      required: true,
    },
    {
      name: 'participants',
      type: 'readonly [CommentPinParticipant, ...CommentPinParticipant[]]',
      description:
        'Non-empty ordered participants, lead first. A single pin renders the first. A grouped pin renders distinct IDs as an AvatarGroup of at most three circles: every participant when three or fewer are distinct, otherwise the first two plus an ellipsis overflow circle. Pass every distinct participant so the overflow appears exactly when more than three people participate. Each record has id, name, and optional avatarSrc.',
      required: true,
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description:
        'Pin height on the element-size scale: sm 28px, md 32px, lg 36px, with 22px, 24px, and 28px participant circles. Padding is equal on every side, so the avatars and overflow sit the same distance from each edge; the trailing count or unread dot adds a little end padding so it never crowds the edge.',
      default: "'sm'",
    },
    {
      name: 'threadCount',
      type: 'number',
      description:
        'Total represented threads. A finite positive integer above one switches to grouped presentation and displays the exact count. The host still owns the clustering policy.',
      default: '1',
    },
    {
      name: 'unreadCount',
      type: 'number',
      description:
        'Represented threads with unread activity. When above zero, an accent status dot appears at the end of the pin, after the thread total or the single participant; the number itself is not shown. Invalid values are ignored and values above threadCount are capped. Repeat the unread context in label.',
      default: '0',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description:
        'Whether the pin is the active annotation target. Draws a solid 2px accent outline outside the pin, keeping its elevation, plus aria-pressed; the shared offset focus outline remains farther outside for keyboard focus. Follow aria-pressed toggle semantics: activating the selected pin again should clear the host selection.',
      default: 'false',
    },
    {
      name: 'isDimmed',
      type: 'boolean',
      description:
        'Whether another pin is selected. Lowers this pin’s opacity without disabling it, so it remains available to switch selection. Leave it false on every pin when nothing is selected. Selected presentation wins if both are true.',
      default: 'false',
    },
    {
      name: 'isResolved',
      type: 'boolean',
      description:
        'Whether every represented thread is resolved. A resolved pin renders nothing unless it is selected: resolved discussion leaves the content, while a thread the reader opened (or resolved from its popover) keeps its anchor, with the selected treatment, until the host clears the selection.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables activation: the pin exposes aria-disabled, keeps its tab stop, and blocks every activation path. Useful for a pending anchor before its thread exists.',
      default: 'false',
    },
    {
      name: 'onClick',
      type: 'MouseEventHandler<HTMLButtonElement>',
      description:
        'Product-owned activation handler. Open or select the represented thread/group here; CommentPin owns no comments or popover state.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX layout customization for the button root. Hosts may position it over content or in a margin; absolute anchors map to the logical bottom-start corner by placing the inline-start edge at the anchor and translating the pin upward by its full height.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-comment-pin',
        visualProps: [
          'size',
          'grouped',
          'unread',
          'selected',
          'dimmed',
          'resolved',
          'disabled',
        ],
      },
    ],
  },
  usage: {
    anatomy,
    description:
      'Use CommentPin as the interactive anchor for comments attached to images, documents, canvases, table regions, or content margins. Pass the distinct participants (lead first), the total number of threads the host grouped at that anchor, and how many of them are unread. The component intentionally has no coordinates, anchor IDs, thread IDs, clustering algorithm, popover, or Comments dependency: those stay with the product so the same marker can sit over transformed media or in normal document layout. Participant Avatars and the overflow circle suppress their own tooltips and interaction; the pin is the only button and its label is the complete action name.',
    accessibility: [
      {
        name: 'Native button activation',
        category: 'Keyboard',
        criterion: '2.1.1 Keyboard',
        description:
          'CommentPin is one native button. Tab reaches an enabled pin; Enter and Space activate it. A disabled pin stays in the tab order and is announced as disabled through aria-disabled, and every activation path is blocked.',
      },
      {
        name: 'Selected state and name',
        category: 'Semantics',
        criterion: '4.1.2 Name, Role, Value',
        description:
          'The required label is the button name and tooltip. aria-pressed communicates controlled selection; participant Avatars, the overflow circle, the visible thread total, and the unread dot remain decorative, so repeat grouped and unread context in label.',
      },
      {
        name: 'Selection and focus',
        category: 'Color contrast',
        criterion: '1.4.11 Non-text Contrast',
        description:
          'The solid 2px accent outline hugs the pin while the shared focus-visible outline sits farther outside it, so selection and keyboard focus remain distinguishable; forced colors uses the platform Highlight treatment. Verify both selected and selected-plus-focused states against the host surface.',
      },
    ],
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the lead commenter first. For a group, pass every distinct participant ordered by how well they help users recognize the cluster; the pin shows up to three circles and summarizes the rest with an ellipsis.',
      },
      {
        guidance: true,
        description:
          'Write a complete label that names the action and relevant context, such as “Open 4 grouped annotations from Ada and Lin”.',
      },
      {
        guidance: true,
        description:
          'Keep coordinates, zoom/rotation transforms, collision handling, group membership, and thread selection in the host; position the pin with layout composition or xstyle.',
      },
      {
        guidance: true,
        description:
          'Map an absolute anchor coordinate to the pin’s logical bottom-start corner, not its center. Place the pin’s inline-start edge at the anchor and translate it upward by its full height.',
      },
      {
        guidance: true,
        description:
          'When one pin is selected, pass isDimmed to the other pins instead of disabling them. They stay available to switch selection while the active pin holds visual focus. When nothing is selected, no pin dims.',
      },
      {
        guidance: true,
        description:
          'Treat selection as an aria-pressed toggle: when the selected pin is activated again, clear the host selection.',
      },
      {
        guidance: true,
        description:
          'Treat threadCount as quantity only. The Avatar identities stay primary even when the total is large.',
      },
      {
        guidance: true,
        description:
          'Pass unreadCount whenever represented threads have unread activity. Its accent dot keeps unread work visible beside the total; repeat the unread count in label.',
      },
      {
        guidance: false,
        description:
          'Use an ordinal number as the marker identity. Numbering becomes unstable and hard to scan as annotations are inserted, removed, filtered, or grouped.',
      },
      {
        guidance: false,
        description:
          'Put interactive Avatar links or buttons inside the marker. The marker root owns the one action and accessible name.',
      },
      {
        guidance: false,
        description:
          'Slice participants yourself to control the overflow. Pass every distinct participant so the ellipsis appears exactly when more than three people participate, and name the hidden people in label.',
      },
    ],
  },
  examples: [
    {
      label: 'Single thread',
      code: `<CommentPin
  label="Open annotation from Ada"
  participants={[{id: 'ada', name: 'Ada Lovelace', avatarSrc: '/ada.jpg'}]}
  onClick={() => openThread('thread-1')}
/>`,
    },
    {
      label: 'Grouped threads',
      code: `<CommentPin
  label="Open 4 grouped annotations from Ada and Lin"
  participants={[
    {id: 'ada', name: 'Ada Lovelace', avatarSrc: '/ada.jpg'},
    {id: 'lin', name: 'Lin Chen', avatarSrc: '/lin.jpg'},
  ]}
  threadCount={4}
  isSelected={selectedCluster === 'cluster-1'}
  onClick={() => setSelectedCluster('cluster-1')}
/>`,
    },
    {
      label: 'Unread threads with participant overflow',
      code: `// Five distinct people: two Avatars plus an ellipsis circle.
// Two unread threads: an accent dot after the total.
<CommentPin
  label="Open 6 grouped annotations from Ada, Lin, and 3 others, 2 unread"
  participants={[ada, lin, mira, noah, sam]}
  threadCount={6}
  unreadCount={2}
  onClick={() => setSelectedCluster('cluster-2')}
/>`,
    },
    {
      label: 'Sizes',
      code: `<HStack gap={3}>
  <CommentPin size="sm" label="Open annotation from Ada" participants={[ada]} />
  <CommentPin size="md" label="Open annotation from Ada" participants={[ada]} />
  <CommentPin size="lg" label="Open annotation from Ada" participants={[ada]} />
</HStack>`,
    },
    {
      label: 'Host-owned placement',
      code: `const positions = stylex.create({
  marker: {
    position: 'absolute',
    insetInlineStart: '42%',
    insetBlockStart: '28%',
    transform: 'translateY(-100%)',
  },
});

<div className="annotated-content">
  <img src="/diagram.png" alt="System diagram" />
  <CommentPin
    label="Open annotation from Mira"
    participants={[{id: 'mira', name: 'Mira Patel'}]}
    xstyle={positions.marker}
    onClick={openAnnotation}
  />
</div>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  description:
    '用于打开单个锚定批注线程或调用方定义线程组的头像优先按钮。单线程显示主要参与者头像；分组标记最多显示三个圆形（超过三人时显示两个头像和省略号圆形），并显示线程总数；有未读线程时在末尾（总数或单个头像之后）显示强调色状态点。三种尺寸遵循元素尺寸刻度。',
  propDescriptions: {
    label:
      '必填的无障碍操作名称及悬停/聚焦提示；包含分组、未读或已解决上下文。',
    participants:
      '有序参与者列表（主要参与者在前）；单线程显示第一个；分组最多显示三个圆形，超过三位不同参与者时显示前两个头像和省略号溢出圆形。',
    size: '标记高度：sm 28px、md 32px、lg 36px，参与者头像分别为 22px、24px、28px；四边内边距相等。',
    threadCount: '所代表的线程总数；大于 1 时使用分组样式并显示准确数量。',
    unreadCount:
      '有未读活动的线程数；大于 0 时在总数之后（单线程时在头像之后）显示强调色状态点，不显示该数字。',
    isSelected:
      '标记是否为当前批注目标；再次激活已选中的标记时，宿主应清除选择（aria-pressed 切换语义）。',
    isDimmed:
      '其他标记被选中时降低此标记的视觉突出度，但不禁用操作；未选中任何标记时不应降低。',
    isResolved: '所代表的线程是否都已解决；已解决的标记除非被选中否则不渲染。',
    isDisabled:
      '通过 aria-disabled 禁用激活：保留 Tab 焦点，拦截所有激活路径。',
    onClick: '由产品拥有的激活处理函数。',
    xstyle: '根按钮的 StyleX 布局样式；由宿主决定内容上方或边距中的位置。',
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'avatar-first annotation anchor; 1 lead Avatar for one thread; groups show max 3 circles (2 Avatars + ellipsis beyond 3) + exact total; accent StatusDot after the total (or the avatar on a single pin) when unreadCount > 0; sm/md/lg = 28/32/36px; host owns placement/grouping',
  usage: {
    description:
      'Interactive anchor for comments over content or in margins. Pass every distinct participant, the total thread count, and the unread thread count; keep coordinates, clustering, collisions, thread state, and opened UI in the host. Absolute coordinates map to the logical bottom-start corner, while another pin is selected its siblings use isDimmed and remain interactive, and activating the selected pin again clears the host selection.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass the lead commenter first and write a complete action label, including unread context.',
      },
      {
        guidance: true,
        description:
          'Use threadCount as quantity, never ordinal identity; pass unreadCount so an accent dot marks unread work.',
      },
      {
        guidance: false,
        description:
          'Nest interactive Avatars, slice participants to fake the overflow, or pass coordinates/grouping logic into the marker.',
      },
    ],
  },
  propDescriptions: {
    label:
      'required action name + hover/focus tooltip; include grouped/unread context',
    participants:
      'non-empty ordered tuple of {id,name,avatarSrc?}; single renders 1; groups render ≤3 circles (2 + ellipsis overflow beyond 3 distinct)',
    size: "'sm' | 'md' | 'lg' = 28/32/36px height, 22/24/28px avatars, equal padding; default 'sm'",
    threadCount:
      'positive integer total; >1 selects grouped presentation; default 1',
    unreadCount:
      'unread represented threads; >0 shows an accent dot after the total (or the avatar on a single pin); capped at threadCount; default 0',
    isSelected:
      'controlled active pin; solid 2px accent outline outside the pin + aria-pressed; host clears it when the selected pin is activated again',
    isDimmed:
      'controlled de-emphasis for non-selected siblings only while another pin is selected; remains interactive',
    isResolved: 'resolved pins render nothing unless selected',
    isDisabled:
      'disabled marker: aria-disabled, keeps its tab stop, blocks every activation path',
    onClick: 'host activation handler',
    xstyle: 'root layout/positioning styles; marker owns no coordinates',
  },
};
