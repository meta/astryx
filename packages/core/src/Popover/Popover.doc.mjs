// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Popover',
  displayName: 'Popover',
  group: 'Popover',
  category: 'Overlay',
  keywords: [
    'popover',
    'popup',
    'dropdown',
    'tooltip',
    'overlay',
    'flyout',
    'callout',
    'popper',
    'anchor',
    'floating',
    'bubble',
  ],
  components: [
    {
      name: 'Popover',
      displayName: 'Popover',
      description:
        'A click-triggered popover for displaying interactive content anchored to a trigger element.',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Trigger element. Must contain a <button> or [role="button"] element.',
        },
        {
          name: 'anchorRef',
          type: 'React.RefObject<HTMLElement>',
          description:
            'External ref to use as the popover anchor in sibling mode.',
        },
        {
          name: 'content',
          type: 'ReactNode',
          description: 'Content to display inside the popover.',
          required: true,
          slotElements: [
            {
              __element: 'Text',
              props: {type: 'body'},
              children: 'Content text',
            },
          ],
        },
        {
          name: 'placement',
          type: "'above' | 'below' | 'start' | 'end'",
          description:
            "Position placement relative to the trigger. Logical: start/end resolve against the popover's own inherited direction, so RTL contexts mirror automatically in pure CSS.",
          default: "'below'",
        },
        {
          name: 'alignment',
          type: "'start' | 'center' | 'end'",
          description:
            "Alignment along the placement axis. Logical: start/end follow the popover's own inherited direction (RTL mirrors).",
          default: "'start'",
        },
        {
          name: 'isOpen',
          type: 'boolean',
          description: 'Whether the popover is shown in controlled mode.',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description: 'Callback fired when the popover visibility changes.',
        },
        {
          name: 'isEnabled',
          type: 'boolean',
          description: 'When false, trigger interactions are ignored.',
          default: 'true',
        },
        {
          name: 'width',
          type: 'number | string',
          description:
            'Width of the popover container. The layer still caps to the viewport with alignment-aware safe-area gutters before scrolling long content.',
          default: "'auto'",
        },
        {
          name: 'padding',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            'Inner padding of the popover surface on the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10), matching the padding prop on Card and Stack. Pass 0 for a flush surface when the content owns its own edges, such as a list of rows or a header with a rule, and pad the content itself. The padding sits on the painted popover target, so a theme padding on that target replaces it.',
          default: '3',
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Accessible label for the popover dialog. A sheet without one is named by the trigger\u2019s text.',
        },
        {
          name: 'role',
          type: "'dialog' | 'none'",
          description:
            'ARIA role for the popover wrapper. Use dialog for dialog-style popovers; use none when content provides its own role, like menu or listbox.',
          default: "'dialog'",
        },
        {
          name: 'isModal',
          type: 'boolean',
          description:
            'Whether a dialog-style popover sets aria-modal. Only applies when role is dialog.',
          default: 'true',
        },
        {
          name: 'hasCloseButton',
          type: 'boolean',
          description:
            'Whether to include a hidden close button for accessibility.',
          default: 'true',
        },
        {
          name: 'closeButtonLabel',
          type: 'string',
          description: 'Label for the hidden close button.',
          default: "'Close popover'",
        },
        {
          name: 'hasAutoFocus',
          type: 'boolean',
          description:
            'Whether to move focus into the popover when it opens. Focus enters the first genuine content control; dialogs with none fall back to the labeled surface. The generated fallback close control stays hidden until reached through keyboard navigation. Set to false for input-owned focus, inline showcases, or documentation previews.',
          default: 'true',
        },
        {
          name: 'hasLightDismiss',
          type: 'boolean',
          description:
            'Whether clicking outside dismisses the popover. Set to false for surfaces that stay open until explicitly dismissed, like onboarding coachmarks.',
          default: 'true',
        },
        {
          name: 'hasEscapeDismiss',
          type: 'boolean',
          description:
            'Whether pressing Escape dismisses the popover. Only takes full effect together with hasLightDismiss={false}, since native light dismiss also closes on Escape.',
          default: 'true',
        },
        {
          name: 'presentation',
          type: "'popover' | 'bottom-sheet' | 'adaptive'",
          description:
            "The surface that holds the content. 'popover' anchors it to the trigger, 'bottom-sheet' presents it in a modal BottomSheet labeled by label, and 'adaptive' uses the BottomSheet on a compact touch screen (a coarse pointer on a screen the theme counts as compact: narrower than its md width point or shorter than 500 px, so a phone in either orientation) and the anchored popover elsewhere. In a sheet, placement, alignment, width, role, isModal and hasAutoFocus do not apply, and xstyle, className and style style the sheet's panel; the sheet always light-dismisses (a tap outside it or a swipe down closes it, whatever hasLightDismiss says), Escape follows hasEscapeDismiss, and the fallback close stays hidden. The surface is chosen as it opens and kept until it closes.",
          default: "'popover'",
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
      ],
    },
  ],
  examples: [
    {
      label: 'Flush surface for a list of rows',
      code: `<Popover
  label="Recent files"
  padding={0}
  content={
    <List>
      <ListItem label="Quarterly report.pdf" />
      <ListItem label="Roadmap.key" />
    </List>
  }>
  <Button label="Recent" variant="secondary" />
</Popover>`,
    },
    {
      label: 'Roomier surface for a form',
      code: `<Popover
  label="Save search"
  padding={4}
  content={<SaveSearchForm />}>
  <Button label="Save search" variant="secondary" />
</Popover>`,
    },
  ],
  playground: {
    defaults: {
      content: {
        __element: 'Text',
        props: {type: 'body'},
        children: 'Popover content goes here.',
      },
      children: {
        __element: 'Button',
        props: {label: 'Open popover', variant: 'secondary'},
      },
    },
  },
  theming: {
    targets: [
      // Canonical broad target for the painted Popover surface.
      {className: 'astryx-popover'},
    ],
    vars: [
      {
        name: '--_popover-radius',
        description: 'Border radius of the popover surface',
        default: 'var(--radius-container)',
        private: true,
      },
    ],
    derived: [{property: 'borderRadius', vars: ['--_popover-radius']}],
  },
  usage: {
    description:
      'A click-triggered overlay anchored to a button or trigger element. Use it for secondary actions, inline confirmations, or supplementary information that does not warrant a full dialog. For hover previews use HoverCard, for brief helper text use Tooltip.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep popover content focused on a single task or piece of information.',
      },
      {
        guidance: true,
        description:
          'Provide a clear way to close: either by clicking outside or with an explicit close button.',
      },
      {
        guidance: true,
        description:
          'Theme the painted surface through the canonical popover target.',
      },
      {
        guidance: false,
        description:
          'Nest popovers inside other popovers; it creates confusing focus and navigation.',
      },
      {
        guidance: false,
        description:
          "Assume input complexity alone determines the presentation; evaluate the task's focus, space, and interaction requirements.",
      },
      {
        guidance: false,
        description:
          'Assume scrolling alone means Popover is the wrong component; a bounded Popover may scroll while a focused anchored interaction remains appropriate.',
      },
    ],
    anatomy: [
      {
        name: 'Trigger element',
        required: true,
        description:
          'Caller-supplied or externally referenced control that anchors and toggles the popover.',
      },
      {
        name: 'Popover surface',
        required: true,
        description:
          'Painted surface owned and themed by Popover through the canonical popover target.',
      },
      {
        name: 'Touch sheet',
        required: false,
        description:
          'BottomSheet surface that holds the same content in place of the popover surface for presentation="bottom-sheet", or "adaptive" on a compact touch screen; themed through the bottom-sheet target.',
      },
      {
        name: 'Popover content',
        required: true,
        description: 'Caller-supplied content rendered inside the surface.',
      },
      {
        name: 'Fallback close control',
        required: false,
        description:
          'Keyboard-reachable close affordance appended by usePopover when enabled.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Popover',
  displayName: 'Popover',
  components: [
    {
      name: 'Popover',
      displayName: 'Popover',
      description: '一个点击触发的弹出框，用于显示锚定到触发元素的交互式内容。',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description:
            '触发元素。必须包含一个 <button> 或 [role="button"] 元素。',
        },
        {
          name: 'anchorRef',
          type: 'React.RefObject<HTMLElement>',
          description: '在兄弟模式下用作弹出框锚点的外部 ref。',
        },
        {
          name: 'content',
          type: 'ReactNode',
          description: '在弹出框内显示的内容。',
          required: true,
        },
        {
          name: 'placement',
          type: "'above' | 'below' | 'start' | 'end'",
          description:
            '相对于触发器的位置放置方式。逻辑值：start/end 根据弹出层自身继承的方向解析，RTL 环境通过纯 CSS 自动镜像。',
          default: "'below'",
        },
        {
          name: 'alignment',
          type: "'start' | 'center' | 'end'",
          description:
            '沿放置轴的对齐方式。逻辑值：start/end 跟随弹出层自身继承的方向（RTL 镜像）。',
          default: "'start'",
        },
        {
          name: 'isOpen',
          type: 'boolean',
          description: '在受控模式下弹出框是否显示。',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description: '弹出框可见性变化时触发的回调。',
        },
        {
          name: 'isEnabled',
          type: 'boolean',
          description: '设为 false 时，忽略触发器交互。',
          default: 'true',
        },
        {
          name: 'width',
          type: 'number | string',
          description:
            '弹出框容器的宽度。弹出层仍会限制在视口和安全区域留白内，长内容再滚动。',
          default: "'auto'",
        },
        {
          name: 'padding',
          type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
          description:
            '弹出框表面的内边距，使用间距刻度（0、0.5、1、1.5、2、3、4、5、6、8、10），与 Card 和 Stack 的 padding 属性一致。当内容自行管理边缘（如行列表或带分隔线的标题）时传入 0 使表面无内边距，并由内容自行设置内边距。',
          default: '3',
        },
        {
          name: 'label',
          type: 'string',
          description:
            '弹出框对话框的无障碍标签。没有标签的底部面板以触发器的文本命名。',
        },
        {
          name: 'role',
          type: "'dialog' | 'none'",
          description:
            '弹出框包装器的 ARIA 角色。对话框式弹出框使用 dialog；当内容提供自己的角色（如 menu 或 listbox）时使用 none。',
          default: "'dialog'",
        },
        {
          name: 'isModal',
          type: 'boolean',
          description:
            '对话框式弹出框是否设置 aria-modal。仅在 role 为 dialog 时适用。',
          default: 'true',
        },
        {
          name: 'hasCloseButton',
          type: 'boolean',
          description: '是否包含用于无障碍访问的隐藏关闭按钮。',
          default: 'true',
        },
        {
          name: 'closeButtonLabel',
          type: 'string',
          description: '隐藏关闭按钮的标签。',
          default: "'Close popover'",
        },
        {
          name: 'hasAutoFocus',
          type: 'boolean',
          description:
            '弹出框打开时是否将焦点移入其中。优先聚焦调用方内容中的第一个控件；若对话框没有此类控件，则聚焦带标签的表面。生成的关闭按钮仅在键盘导航到达时显示。',
          default: 'true',
        },
        {
          name: 'hasLightDismiss',
          type: 'boolean',
          description:
            '点击外部是否关闭弹出框。需要显式关闭的界面（如新手引导提示）设为 false。',
          default: 'true',
        },
        {
          name: 'hasEscapeDismiss',
          type: 'boolean',
          description:
            '按 Escape 是否关闭弹出框。仅在 hasLightDismiss={false} 时生效，因为原生 light dismiss 行为同样响应 Escape。',
          default: 'true',
        },
        {
          name: 'presentation',
          type: "'popover' | 'bottom-sheet' | 'adaptive'",
          description:
            "承载内容的界面。'popover' 锚定在触发器上，'bottom-sheet' 以模态 BottomSheet 呈现（由 label 命名），'adaptive' 在紧凑触屏（粗指针，且屏幕按主题定义为紧凑：宽度小于其 md 断点或高度小于 500 px，即任意方向的手机）上使用 BottomSheet，在其他设备上使用锚定的弹出框。在底部面板中，placement、alignment、width、role、isModal 和 hasAutoFocus 不生效，xstyle、className 和 style 作用于面板；底部面板始终支持轻触关闭（点按面板外部或向下轻扫即可关闭，不受 hasLightDismiss 影响），Escape 遵循 hasEscapeDismiss，后备关闭按钮保持隐藏。界面在打开时选定，并保持到关闭。",
          default: "'popover'",
        },
      ],
    },
  ],
  theming: {
    targets: [
      // Canonical broad target for the painted Popover surface.
      {className: 'astryx-popover'},
    ],
    vars: [
      {
        name: '--_popover-radius',
        description: 'Border radius of the popover surface',
        default: 'var(--radius-container)',
        private: true,
      },
    ],
    derived: [{property: 'borderRadius', vars: ['--_popover-radius']}],
  },
  usage: {
    description:
      'A click-triggered overlay anchored to a button or trigger element. Use it for secondary actions, inline confirmations, or supplementary information that does not warrant a full dialog. For hover previews use HoverCard, for brief helper text use Tooltip.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep popover content focused on a single task or piece of information.',
      },
      {
        guidance: true,
        description:
          'Provide a clear way to close: either by clicking outside or with an explicit close button.',
      },
      {
        guidance: true,
        description:
          'Theme the painted surface through the canonical popover target.',
      },
      {
        guidance: false,
        description:
          'Nest popovers inside other popovers; it creates confusing focus and navigation.',
      },
      {
        guidance: false,
        description:
          "Assume input complexity alone determines the presentation; evaluate the task's focus, space, and interaction requirements.",
      },
      {
        guidance: false,
        description:
          'Assume scrolling alone means Popover is the wrong component; a bounded Popover may scroll while a focused anchored interaction remains appropriate.',
      },
    ],
    anatomy: [
      {
        name: 'Trigger element',
        required: true,
        description:
          'Caller-supplied or externally referenced control that anchors and toggles the popover.',
      },
      {
        name: 'Popover surface',
        required: true,
        description:
          'Painted surface owned and themed by Popover through the canonical popover target.',
      },
      {
        name: 'Touch sheet',
        required: false,
        description:
          'BottomSheet surface that holds the same content in place of the popover surface for presentation="bottom-sheet", or "adaptive" on a compact touch screen; themed through the bottom-sheet target.',
      },
      {
        name: 'Popover content',
        required: true,
        description: 'Caller-supplied content rendered inside the surface.',
      },
      {
        name: 'Fallback close control',
        required: false,
        description:
          'Keyboard-reachable close affordance appended by usePopover when enabled.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Click-triggered popover displaying interactive content anchored to trigger element; implements button+dialog ARIA pattern.',
  usage: {
    description:
      'A click-triggered overlay anchored to a button or trigger element. Use it for secondary actions, inline confirmations, or supplementary information that does not warrant a full dialog. For hover previews use HoverCard, for brief helper text use Tooltip.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep popover content focused on a single task or piece of information.',
      },
      {
        guidance: true,
        description:
          'Provide a clear way to close: either by clicking outside or with an explicit close button.',
      },
      {
        guidance: true,
        description:
          'Theme the painted surface through the canonical popover target.',
      },
      {
        guidance: false,
        description:
          'Nest popovers inside other popovers; it creates confusing focus and navigation.',
      },
      {
        guidance: false,
        description:
          "Assume input complexity alone determines the presentation; evaluate the task's focus, space, and interaction requirements.",
      },
      {
        guidance: false,
        description:
          'Assume scrolling alone means Popover is the wrong component; a bounded Popover may scroll while a focused anchored interaction remains appropriate.',
      },
    ],
    anatomy: [
      {
        name: 'Trigger element',
        required: true,
        description:
          'Caller-supplied or externally referenced control that anchors and toggles the popover.',
      },
      {
        name: 'Popover surface',
        required: true,
        description:
          'Painted surface owned and themed by Popover through the canonical popover target.',
      },
      {
        name: 'Touch sheet',
        required: false,
        description:
          'BottomSheet surface that holds the same content in place of the popover surface for presentation="bottom-sheet", or "adaptive" on a compact touch screen; themed through the bottom-sheet target.',
      },
      {
        name: 'Popover content',
        required: true,
        description: 'Caller-supplied content rendered inside the surface.',
      },
      {
        name: 'Fallback close control',
        required: false,
        description:
          'Keyboard-reachable close affordance appended by usePopover when enabled.',
      },
    ],
  },
  components: [
    {
      name: 'Popover',
      displayName: 'Popover',
      description:
        'Click-triggered popover for interactive content anchored to trigger element.',
      propDescriptions: {
        children:
          'Trigger element. Must contain <button> or [role="button"] element.',
        anchorRef: 'External ref for popover anchor in sibling mode.',
        content: 'Content displayed inside popover.',
        placement:
          "Position relative to trigger. Logical: start/end resolve against the popover's inherited direction (RTL mirrors).",
        alignment:
          "Alignment along placement axis. Logical: start/end follow the popover's inherited direction (RTL mirrors).",
        isOpen: 'Whether popover shown in controlled mode.',
        onOpenChange: 'Callback fired when popover visibility changes.',
        isEnabled: 'When false, trigger interactions ignored.',
        width:
          'Popover container width; capped to alignment-aware viewport/safe-area gutters before long content scrolls.',
        label: 'Accessible label for popover dialog.',
        hasCloseButton:
          'Whether to include hidden close button for accessibility.',
        closeButtonLabel: 'Label for hidden close button.',
        hasAutoFocus:
          'Move focus into genuine popover content on open, with a labeled-surface fallback; the generated close control stays hidden until reached by keyboard.',
        hasLightDismiss:
          'Outside click dismisses; false for explicit-dismiss surfaces (coachmarks).',
        hasEscapeDismiss:
          'Escape dismisses; full effect only with hasLightDismiss=false.',
        presentation:
          "Surface: 'popover' (anchored), 'bottom-sheet' (modal BottomSheet), or 'adaptive' (BottomSheet on a coarse pointer on a compact screen, popover elsewhere); chosen on open, kept until close.",
      },
    },
  ],
};
