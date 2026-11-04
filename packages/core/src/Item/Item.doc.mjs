// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Item',
  displayName: 'Item',
  group: 'Item',
  category: 'Table & List',
  isHiddenFromOverview: true,
  keywords: [
    'item',
    'list-item',
    'media-object',
    'row',
    'cell',
    'entity',
    'contact',
    'notification',
    'preview',
  ],
  playground: {
    defaults: {
      label: 'Item label',
      description: 'Supporting text',
    },
  },
  theming: {
    targets: [
      {className: 'astryx-item', visualProps: ['density', 'align']},
      {className: 'astryx-item-swipe-panel', visualProps: ['side']},
      {className: 'astryx-item-swipe-action', visualProps: ['variant']},
    ],
    vars: [
      {
        name: '--_item-label-color',
        description:
          'Color of the label line. Unset by default (the label uses the primary text token); a parent sets it to recolor the label it renders, as the destructive dropdown/context menu item does.',
        default: 'var(--color-text-primary)',
        private: true,
      },
      {
        name: '--_item-description-color',
        description:
          'Companion to --_item-label-color for the secondary description line.',
        default: 'var(--color-text-secondary)',
        private: true,
      },
      {
        name: '--_item-inset-inline',
        description:
          'Inline inset of the row. Item derives its paddingInline from this variable, and List reads it to place rows for its edge treatments (edge="flush", "outset", and "bleed"). Set paddingInline on `item` in a theme and both stay in sync.',
        default: 'var(--spacing-2) (var(--spacing-3) for density="spacious")',
        private: true,
      },
    ],
    derived: [{property: 'paddingInline', vars: ['--_item-inset-inline']}],
  },
  components: [
    {
      name: 'Item',
      displayName: 'Item',
      description:
        'A universal item primitive that unifies the "start content + label + description + end content" layout pattern. Use as a building block for list items, menu items, contact rows, notifications, and more.',
      props: [
        {
          name: 'label',
          type: 'ReactNode',
          description:
            'Primary text identifying this item. Accepts string (auto-truncated) or ReactNode (for rich content).',
          required: true,
        },
        {
          name: 'marker',
          type: 'ReactNode',
          description:
            'Marker rendered before startContent as a direct flex child. Use for list bullets/counters that need custom baseline alignment.',
        },
        {
          name: 'startContent',
          type: 'ReactNode',
          description:
            'Content rendered before the label/description area, such as an icon, avatar, or checkbox.',
          slotElements: [
            {__element: 'Avatar', props: {name: 'Ada Lovelace', size: 'sm'}},
            {
              __element: 'Icon',
              props: {icon: 'info', size: 'sm', color: 'secondary'},
            },
          ],
        },
        {
          name: 'description',
          type: 'ReactNode',
          description:
            'Secondary text: subtitle, description, or supporting info.',
        },
        {
          name: 'endContent',
          type: 'ReactNode',
          description:
            'Content rendered after the label/description area, such as badges, metadata, timestamps, or action buttons.',
          slotElements: [
            {__element: 'Badge', props: {label: 3}},
            {
              __element: 'Text',
              props: {color: 'secondary'},
              children: '2h ago',
            },
          ],
        },
        {
          name: 'as',
          type: "'div' | 'li' | 'span' | ElementType",
          description:
            "What the root renders as: an HTML element, or a component for a caller that needs the root to be something else. A menu row that navigates passes the application's link component here, so the row's root IS the anchor. Give a component only when the row carries a role, and only when no interactive node sits in startContent or endContent.",
          default: "'div'",
        },
        {
          name: 'align',
          type: "'center' | 'start' | 'first-line'",
          description:
            "Vertical alignment of start/end content slots. 'center' centers each slot on the whole text block; 'start' lines up slot tops with the text's top; 'first-line' centers each slot on the label's first line, so a small mark stays level with the first line of a wrapped label. A slot taller than that line moves the text down. The `item` theme target reflects the value as `align`.",
          default: "'center'",
        },
        {
          name: 'density',
          type: "'compact' | 'balanced' | 'spacious'",
          description:
            'Spacing density. "compact" uses 4px block padding, "balanced" uses 8px, and "spacious" uses 12px block and inline padding.',
          default: "'balanced'",
        },
        {
          name: 'labelLines',
          type: 'number',
          description: 'Max lines before label truncates with ellipsis.',
        },
        {
          name: 'descriptionLines',
          type: 'number',
          description: 'Max lines before description truncates with ellipsis.',
        },
        {
          name: 'layout',
          type: "'stacked' | 'inline'",
          description:
            'How the label and description sit together. stacked puts the description on its own line below the label; inline keeps both on one line, description ellipsizing first, so the row fits a fixed-height host.',
          default: "'stacked'",
        },
        {
          name: 'onClick',
          type: '(event: MouseEvent) => void',
          description:
            'Click handler. Makes the item clickable with button semantics.',
        },
        {
          name: 'interactiveRef',
          type: 'RefObject<HTMLElement | null>',
          description:
            "Ref to a nested control (e.g. a checkbox in startContent) that owns the item's keyboard access and action. The row becomes an enlarged click/tap target that delegates surface clicks to it (useClickableContainer) and renders no invisible button/anchor, so the row adds no second tab stop (WCAG 4.1.2). Mutually exclusive with onClick/href; those are ignored when set.",
        },
        {
          name: 'href',
          type: 'string',
          description:
            'Link URL. Makes the item a link via an invisible anchor element. A row whose root is already a link component (see `as`) carries the address on that root instead, and no invisible anchor is rendered.',
        },
        {
          name: 'target',
          type: "'_blank' | '_self'",
          description:
            'Link target. Only used with href. target="_blank" automatically adds noopener noreferrer.',
        },
        {
          name: 'rel',
          type: 'string',
          description:
            'Link relationship tokens. noopener noreferrer are merged automatically for target="_blank".',
        },
        {
          name: 'isHighlighted',
          type: 'boolean',
          description: 'Highlighted state (hover/keyboard focus appearance).',
          default: 'false',
        },
        {
          name: 'isSelected',
          type: 'boolean',
          description: 'Selected state.',
          default: 'false',
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          description: 'Disabled state.',
          default: 'false',
        },
        {
          name: 'swipeActions',
          type: '{leading?: ItemSwipeAction[]; trailing?: ItemSwipeAction[]}',
          description:
            "Swipe actions for touch: the verbs a sideways drag uncovers on each side, outermost last, each `{id?, label, icon?, onActivate, isDisabled?, variant?: 'neutral' | 'accent' | 'destructive', hasRemoval?}`. `leading` is uncovered by a drag toward the inline end, `trailing` toward the inline start. A mouse never starts the drag and a mostly vertical drag stays the scroller's. The gesture is a touch accelerator and never a row's only path to a verb: a verb reachable only by swipe is unreachable by keyboard and by mouse, so every entry must also be reachable through the row's own content. Served on a row whose role permits interactive descendants (a listitem, a row with no role) and not on an option, a menu item, or a row that is the enlarged target of a native radio. The element containing the rows clips in the inline axis with overflow-inline: clip — List does; any other host does it once. `hasRemoval` only says the row holds out after the action fires instead of springing back. The gesture and its panels are loaded on demand the first time a row has swipe actions, so a row without them ships none of it.",
        },
        {
          name: 'swipeBehavior',
          type: "'reveal' | 'commit'",
          description:
            'What a swipe does. `reveal` rests the row open with every entry a real button and fires the outermost on a long drag or a fling; `commit` slides the row out and fires the outermost on release, with nothing resting and a presentational panel. `commit` fits one entry per side.',
          default: "'reveal'",
        },
        {
          name: 'ref',
          type: 'React.Ref<HTMLDivElement>',
          description: 'Ref forwarded to the root element.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization. Must be a stylex.create() value.',
        },
        {
          name: 'data-testid',
          type: 'string',
          description: 'Test selector for automated testing frameworks.',
        },
      ],
    },
  ],
  usage: {
    description:
      'A single, flexible item primitive that unifies the "start content + label + description + end content" pattern across Astryx. Use it wherever you need a structured row: dropdown menus, selectors, contact lists, notifications, file browsers, and activity feeds.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use named slots (startContent, label, description, endContent) for the common layout. These cover the 80% case.',
      },
      {
        guidance: true,
        description:
          'Use density="compact" for menus and dense lists, "balanced" for standard rows, and "spacious" for roomier layouts.',
      },
      {
        guidance: true,
        description:
          'Set labelLines and descriptionLines to control truncation when content length varies.',
      },
      {
        guidance: true,
        description:
          'Use align="first-line" when a wrapping label sits beside a small mark (a status dot, a radio, a timestamp) that belongs to its first line. Use align="start" to line up the tops of a tall slot and the text.',
      },
      {
        guidance: true,
        description:
          'Give a swipe action a second home in the row (a menu or a button in endContent): the swipe is a touch accelerator, and a verb reachable only by swipe is unreachable by keyboard and by mouse.',
      },
      {
        guidance: false,
        description:
          "Don't nest interactive elements (buttons, links) inside an interactive Item; it creates confusing focus and click targets.",
      },
      {
        guidance: false,
        description:
          "Don't use Item for navigation between views; use proper navigation components instead.",
      },
      {
        guidance: false,
        description:
          "Don't add read/unread or inbox-specific behavior directly; compose a thin wrapper like PreviewItem instead.",
      },
    ],
    anatomy: [
      {
        name: 'Marker',
        required: false,
        description:
          'Optional list bullet/counter rendered before start content.',
      },
      {
        name: 'Start content',
        required: false,
        description: 'Leading visual: avatar, icon, image, or checkbox.',
      },
      {
        name: 'Label',
        required: true,
        description: 'Primary text identifying the item.',
      },
      {
        name: 'Description',
        required: false,
        description: 'Secondary supporting text below the label.',
      },
      {
        name: 'End content',
        required: false,
        description:
          'End-aligned content: badges, timestamps, or action buttons.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  components: [
    {
      name: 'Item',
      displayName: 'Item',
      description:
        '通用项目原语，统一 "起始内容 + 标签 + 描述 + 结束内容" 布局模式。用作列表项、菜单项、联系人行、通知等的构建块。',
      propDescriptions: {
        label:
          '标识此项目的主要文本。接受字符串（自动截断）或 ReactNode（用于富内容）。',
        marker:
          '在 startContent 之前渲染的标记，作为直接 flex 子元素。用于需要自定义基线对齐的列表项目符号/计数器。',
        startContent: '在标签/描述区域之前渲染的内容，例如图标、头像或复选框。',
        description: '次要文本：副标题、描述或辅助信息。',
        endContent:
          '在标签/描述区域之后渲染的内容，例如徽章、元数据、时间戳或操作按钮。',
        as: '根元素的 HTML 元素。',
        align:
          "起始/结束内容插槽的垂直对齐方式：'center'（默认）、'start'（顶部对齐）或 'first-line'（以标签第一行为中心）。",
        density:
          '间距密度。"compact" 使用 4px 块内距，"balanced" 使用 8px，"spacious" 使用 12px 块内距和内联内距。',
        labelLines: '标签截断前的最大行数。',
        descriptionLines: '描述截断前的最大行数。',
        onClick: '点击处理函数。使项目可点击，具有按钮语义。',
        interactiveRef:
          '指向嵌套控件（如 startContent 中的复选框）的 ref，该控件承载项目的键盘访问和操作。行成为更大的点击/触摸目标，将表面点击委托给该控件（useClickableContainer），且不渲染不可见按钮/锚点，因此行不会增加第二个 Tab 停留点（WCAG 4.1.2）。与 onClick/href 互斥——设置后二者将被忽略。',
        href: '链接 URL。通过不可见锚点元素使项目成为链接。',
        target:
          '链接目标。仅与 href 一起使用。target="_blank" 会自动添加 noopener noreferrer。',
        rel: '链接关系标记。target="_blank" 会自动合并 noopener noreferrer。',
        isHighlighted: '高亮状态（悬停/键盘焦点外观）。',
        isSelected: '选中状态。',
        isDisabled: '禁用状态。',
        ref: '转发到根元素的引用。',
        xstyle: 'StyleX 样式，用于布局自定义。必须是 stylex.create() 的值。',
        'data-testid': '自动化测试的选择器。',
      },
    },
  ],
  usage: {
    description:
      '通用项目原语，统一 Astryx 中 "起始内容 + 标签 + 描述 + 结束内容" 的布局模式。适用于下拉菜单、选择器、联系人列表、通知、文件浏览器和活动流等场景。',
    bestPractices: [
      {
        guidance: true,
        description:
          '使用命名插槽（startContent、label、description、endContent）处理常见布局。',
      },
      {
        guidance: true,
        description:
          '菜单和密集列表使用 density="compact"，标准行使用 "balanced"，宽松布局使用 "spacious"。',
      },
      {
        guidance: true,
        description:
          '设置 labelLines 和 descriptionLines 控制内容长度不定时的截断。',
      },
      {
        guidance: true,
        description:
          '当换行标签旁边是属于其第一行的小标记（状态点、单选按钮、时间戳）时，使用 align="first-line"。使用 align="start" 让较高插槽与文本顶部对齐。',
      },
      {
        guidance: false,
        description: '不要在交互式 Item 内嵌套交互元素（按钮、链接）。',
      },
      {
        guidance: false,
        description: '不要使用 Item 进行视图间导航：使用适当的导航组件。',
      },
      {
        guidance: false,
        description:
          '不要直接添加已读/未读行为：组合一个薄包装器如 PreviewItem。',
      },
    ],
    anatomy: [
      {
        name: '标记',
        required: false,
        description: '在起始内容之前渲染的可选列表项目符号/计数器。',
      },
      {
        name: '起始内容',
        required: false,
        description: '前导视觉：头像、图标、图片或复选框。',
      },
      {name: '标签', required: true, description: '标识项目的主要文本。'},
      {name: '描述', required: false, description: '标签下方的次要辅助文本。'},
      {
        name: '结束内容',
        required: false,
        description: '末端对齐内容：徽章、时间戳或操作按钮。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'universal item primitive w/ startContent+label+description+endContent layout. building block for list items, menu items, contacts, notifications',
  usage: {
    description:
      'Flexible item primitive unifying the "start content + label + description + end content" pattern. Use for structured rows in menus, lists, contacts, notifications, file browsers.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Named slots (startContent, label, description, endContent) for the 80% case.',
      },
      {
        guidance: true,
        description:
          'density="compact" for menus/dense lists, "balanced" for standard rows, "spacious" for roomier layouts.',
      },
      {
        guidance: true,
        description: 'labelLines/descriptionLines for truncation control.',
      },
      {
        guidance: true,
        description:
          'align="first-line" for a small mark beside a wrapping label; align="start" to top-align a tall slot with the text.',
      },
      {
        guidance: false,
        description: "Don't nest interactive elements inside interactive Item.",
      },
      {
        guidance: false,
        description: "Don't use for view navigation; use nav components.",
      },
      {
        guidance: false,
        description: "Don't add inbox-specific behavior; compose a wrapper.",
      },
    ],
  },
  components: [
    {
      name: 'Item',
      displayName: 'Item',
      description:
        'universal item primitive w/ startContent+label+description+endContent layout',
      propDescriptions: {
        label:
          'Primary text. String auto-truncates; ReactNode for rich content.',
        marker: 'List bullet/counter before startContent as direct flex child.',
        startContent:
          'Content before label/description: avatar, icon, checkbox, ReactNode.',
        description: 'Secondary text below label.',
        endContent:
          'Content after label/description: badges, timestamps, actions.',
        as: 'Root HTML element.',
        align:
          "Start/end slot alignment: 'center' (default), 'start' (tops), or 'first-line' (centered on the label's first line).",
        density:
          'Spacing: "compact" (4px), "balanced" (8px), or "spacious" (12px).',
        labelLines: 'Max label lines before truncation.',
        descriptionLines: 'Max description lines before truncation.',
        onClick: 'Click handler; enables button semantics.',
        interactiveRef:
          "Ref to a nested control that owns the item's keyboard access/action; row delegates surface clicks to it (useClickableContainer), no invisible button/anchor, no second tab stop (WCAG 4.1.2). Mutually exclusive with onClick/href.",
        href: 'Link URL; enables anchor semantics. Follows the shared navigation rule (see Link href).',
        target:
          'Link target, only with href. target="_blank" auto-adds noopener noreferrer.',
        rel: 'Link relationship tokens. noopener noreferrer are merged for target="_blank".',
        isHighlighted: 'Highlighted state.',
        isSelected: 'Selected state.',
        isDisabled: 'Disabled state.',
        xstyle: 'StyleX layout styles; must be stylex.create() value.',
        'data-testid': 'Test selector.',
      },
    },
  ],
};
