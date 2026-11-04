// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drawer.doc.mjs
 * @input Drawer props, panel anatomy, DrawerHeader composition, overlay playground config, and story-aligned examples
 * @output Consumer documentation and examples for Drawer
 * @position CLI and docsite metadata; runnable docsite demos live in packages/cli/assets/templates/blocks/components/Drawer
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Panel',
    required: true,
    description:
      'The root <dialog> element: a full-height surface anchored to the inline start or end edge, flush with three viewport edges (square corners).',
  },
  {
    name: 'Content area',
    required: true,
    description:
      'Scrollable container that receives children; compose the header, body, and footer inside it with a Layout, as in Dialog. Inset by --spacing-4 (16px) by default; the padding prop or a theme sets a different container inset.',
  },
  {
    name: 'Header',
    required: false,
    description:
      'DrawerHeader, composed in a Layout header slot as DialogHeader is in Dialog: a title row with optional subtitle and start/end content. Pass it onOpenChange to show a close button, as with DialogHeader.',
  },
  {
    name: 'Scrim',
    required: false,
    description:
      'Backdrop that dims and blocks the page behind a modal drawer (hasScrim, the default); a non-modal drawer renders none.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Drawer',
  displayName: 'Drawer',
  // Keeps the registry route Drawer had as a canary-only Lab component.
  registry: {aliases: ['lab/drawer']},
  group: 'Drawer',
  category: 'Overlay',
  keywords: [
    'drawer',
    'side panel',
    'panel',
    'inspector',
    'detail view',
    'overlay',
    'slide',
    'sidebar',
    'dialog',
    'side drawer',
    'sidesheet',
  ],
  // No isInline docs-preview prop (the drawer has no inline containment), so
  // this is the overlay preview: closed on load with an open trigger, knobs
  // live, and opening renders the real top-layer drawer — see
  // ComponentPlaygroundConfig.overlay (#3657).
  playground: {
    overlay: true,
    defaults: {
      isOpen: false,
      label: 'Details',
      children: {
        __element: 'Section',
        props: {padding: 4},
        children: {
          __element: 'VStack',
          props: {gap: 2},
          children: [
            {__element: 'Heading', props: {level: 3}, children: 'Details'},
            {
              __element: 'Text',
              props: {type: 'body'},
              children: 'Adjust the properties below, then open the preview.',
            },
          ],
        },
      },
    },
  },
  theming: {
    container: true,
    targets: [
      {className: 'astryx-drawer', visualProps: ['side']},
      {className: 'astryx-drawer-header'},
      {className: 'astryx-drawer-header-start-content'},
      {className: 'astryx-drawer-header-title-block'},
      {className: 'astryx-drawer-header-end-content'},
      {className: 'astryx-drawer-header-close-icon'},
    ],
    derived: [{property: 'padding', expand: 'container'}],
  },
  description:
    "Side panel that floats above page content, using the native <dialog> element. Slides in from the inline start or end edge; full height, never reflows the layout underneath. Like Dialog, it is a container: set padding (or a theme's drawer padding) and a lone Section child or bleed children such as Table and Divider align against that inset. The default inset is --spacing-4 (16px), as in Dialog.",
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description:
        'Whether the drawer is open. Fully controlled; pair with onOpenChange.',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description:
        'Called when the drawer requests an open-state change. Escape and a scrim click call it with false as purpose allows; a DrawerHeader given the same callback calls it from its close button. The caller owns the open state. With sibling drawers open, Escape only closes the last-opened one.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the drawer. Required; the drawer has no built-in heading to derive a name from.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Drawer content, rendered inside a full-height scrollable area. Compose your own header/body/footer; an element with data-autofocus is focused on open. Children stay mounted during the exit animation; keep the last-selected item rendered instead of nulling content on close.',
      required: true,
    },
    {
      name: 'side',
      type: "'start' | 'end'",
      description:
        "Edge the drawer slides from: 'end' is right in LTR (the inspector convention), 'start' is left. Inline axis only; for a bottom sheet use BottomSheet.",
      default: "'end'",
    },
    {
      name: 'width',
      type: 'number | string',
      description:
        "Desktop width budget. A number is pixels; a string is any CSS length ('50%', '32rem'). Below the 640px mobile breakpoint this remains the maximum while the drawer preserves a 56px reveal of the page behind.",
      default: '400',
    },
    {
      name: 'experimental',
      type: '{isFullWidthOnMobile?: boolean}',
      stability: 'experimental',
      description:
        'Experimental options: anything in this object may change or be removed in a patch release, and omitting it keeps the stable behavior. isFullWidthOnMobile (default false) covers the full viewport width below the 640px mobile breakpoint instead of preserving the default 56px reveal of the page behind, which makes the drawer read as an overlay, not a navigation.',
    },
    {
      name: 'hasScrim',
      type: 'boolean',
      description:
        'Modal scrim behind the drawer. true uses showModal() (top layer, focus trap, scroll lock; clicking the scrim closes unless purpose prevents it; modal only); false uses the manual Popover API for a non-modal top-layer overlay that does NOT trap focus and keeps the page behind interactive.',
      default: 'true',
    },
    {
      name: 'purpose',
      type: "'required' | 'form' | 'info'",
      description:
        'Configures implicit dismissal, matching Dialog. info: Escape and a scrim click close. form: Escape closes, a scrim click does not. required: neither closes (Escape is consumed) and a modal drawer is exposed as an alertdialog, so give its content a way out. A non-modal drawer has no scrim, so form and info behave the same.',
      default: "'info'",
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        "Internal padding of the drawer content using the spacing scale, matching Dialog. When omitted, uses the theme default for drawers: --spacing-4 (16px) unless the theme sets padding on drawer. Pass 0 for a full-bleed content area. A lone Section child escapes the padding, bleed children such as Table and Divider compensate against it, and a Layout picks it up for its regions. The content area's block-end edge adds the home-indicator safe area on top in every mode.",
    },
  ],
  usage: {
    anatomy,
    description:
      'A side panel that floats above page content for inspectors and detail views: the "click a table row, see its details" pattern. Unlike a docked panel it overlays the layout instead of reflowing it. Works on desktop and touch: the width budget applies on desktop and the panel preserves a 56px page reveal below 640px without exceeding the width budget. Escape closes the drawer (unless purpose is required) and focus returns to the element that opened it. Entry/exit slide animation respects prefers-reduced-motion. Stacking contract: sibling drawers stack last-opened on top, Escape closes only the topmost, and closing peels innermost-first; render them as siblings, never nested.\n\nLike Dialog, the drawer is a container: its content area is inset by --spacing-4 (16px) by default, by the padding prop, or by a theme\'s padding on drawer. Compose the header, body, and footer the way Dialog does, with a Layout: DrawerHeader in the header slot (it shows a close button when you pass it onOpenChange, like DialogHeader), the body in LayoutContent, and actions in LayoutFooter. The Layout redistributes the inset to those regions so they line up on one content line, and the header is not inset twice. A lone Section child also escapes the inset. Drawer renders no close button of its own, so give every drawer a visible way to close, especially a non-modal one, which has no scrim to click. Put data-autofocus on the control that should receive focus on open.\n\nChoosing a surface: use Dialog for a centered decision or short form, Drawer for full-height side detail that keeps the page in sight, BottomSheet for block-axis sheets on touch, and a docked panel (a layout column) when content should reflow the page instead of floating over it.\n\nTheming: the panel is the single stable target (astryx-drawer, with data-side reflecting side), and the scrim is the panel\'s native ::backdrop. DrawerHeader exposes astryx-drawer-header targets for its row, slots, and close icon.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for contextual detail views (row inspectors, entity details) where the user should keep the underlying list in sight.',
      },
      {
        guidance: true,
        description:
          'Keep the caller as the source of truth: derive isOpen from selection state and clear the selection in onOpenChange.',
      },
      {
        guidance: true,
        description:
          'Use hasScrim={false} for master-detail flows; non-modal drawers do not trap focus and the page behind stays interactive.',
      },
      {
        guidance: true,
        description:
          'Keep the last-selected item rendered on close: children stay mounted during the exit animation, so nulling content mid-close blanks the panel while it slides out.',
      },
      {
        guidance: true,
        description:
          'Give every drawer a visible close action, usually DrawerHeader with onOpenChange; a non-modal drawer has no scrim to click.',
      },
      {
        guidance: true,
        description:
          'Use purpose="form" when a stray scrim click would discard unsaved input.',
      },
      {
        guidance: false,
        description:
          'Use a Drawer for short confirmations or small forms; use Dialog or AlertDialog instead.',
      },
      {
        guidance: false,
        description:
          'Reach for a Drawer when the content should push the page aside; a Drawer floats over content, so use a docked panel or layout column instead.',
      },
      {
        guidance: false,
        description:
          'Use a Drawer as a bottom or top sheet; it is inline-axis only, so use BottomSheet for block-axis sheets.',
      },
      {
        guidance: false,
        description:
          'Nest a Drawer inside another Drawer; render drawers as siblings; the last-opened stacks on top and Escape closes it first.',
      },
    ],
  },
  // CLI snippets. The docsite renders the paired Drawer blocks in ../../blocks.
  examples: [
    {
      label: 'Basic',
      code: `const [isOpen, setIsOpen] = useState(false);
<>
  <Button label="Open drawer" onClick={() => setIsOpen(true)} />
  <Drawer
    isOpen={isOpen}
    onOpenChange={setIsOpen}
    label="Details"
    width={360}>
    <Layout
      header={<DrawerHeader title="Details" onOpenChange={setIsOpen} />}
      content={
        <LayoutContent>
          <Text type="body">Close with Escape, the scrim, or the close button.</Text>
        </LayoutContent>
      }
    />
  </Drawer>
</>
// Modal by default: the scrim dims the page and focus is trapped. Escape, a
// scrim click, or the header's close button closes it, and focus returns to
// the trigger.`,
    },
    {
      label: 'Modal or non-modal (hasScrim)',
      code: `const [openModal, setOpenModal] = useState(false);
const [openPanel, setOpenPanel] = useState(false);
<>
  {/* Modal (default): the scrim dims the page, focus is trapped, and a
      scrim click closes. */}
  <Drawer isOpen={openModal} onOpenChange={setOpenModal} label="Edit details">
    <EditForm />
  </Drawer>
  {/* Non-modal: no scrim, no focus trap; the page behind stays interactive.
      With no scrim to click, the header's close button is the visible exit. */}
  <Drawer
    isOpen={openPanel}
    onOpenChange={setOpenPanel}
    label="Details"
    hasScrim={false}>
    <Layout
      header={<DrawerHeader title="Details" onOpenChange={setOpenPanel} />}
      content={<LayoutContent><DetailsPanel /></LayoutContent>}
    />
  </Drawer>
</>`,
    },
    {
      label: 'Edit form with footer actions',
      code: `const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Edit host"
  purpose="form">
  <Layout
    header={<DrawerHeader title="Edit host" onOpenChange={setIsOpen} />}
    content={<LayoutContent><HostFields /></LayoutContent>}
    footer={
      <LayoutFooter>
        <HStack gap={2} hAlign="end">
          <Button label="Cancel" variant="secondary" onClick={() => setIsOpen(false)} />
          <Button label="Save" variant="primary" onClick={save} />
        </HStack>
      </LayoutFooter>
    }
  />
</Drawer>
// purpose="form" keeps Escape but ignores scrim clicks, so a stray click
// outside does not discard edits. The footer stays pinned while the fields
// scroll.`,
    },
    {
      label: 'Slide in from the start edge',
      code: `const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Navigation"
  side="start">
  <NavPanel />
</Drawer>
// 'start' is left in LTR and mirrors under RTL; 'end' (the default) is the
// inspector convention.`,
    },
    {
      label: 'Width budget: pixels or any CSS length',
      code: `const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Details"
  width="50%">
  <DetailsPanel />
</Drawer>
// A number is pixels (width={320}); a string is any CSS length ('32rem',
// '50%'). The budget also caps the drawer on mobile.`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    anatomy: [
      {
        name: 'Panel',
        required: true,
        description:
          '根 <dialog> 元素：锚定于行内起始或结束边缘的全高表面，与三个视口边缘齐平（直角）。',
      },
      {
        name: 'Content area',
        required: true,
        description:
          '承载 children 的可滚动容器；像 Dialog 一样在其中用 Layout 组合页眉、正文和页脚。默认带有 --spacing-4（16px）的内边距；padding 属性或主题的 drawer padding 可设置其他容器内边距。',
      },
      {
        name: 'Header',
        required: false,
        description:
          'DrawerHeader，像 Dialog 中的 DialogHeader 一样放在 Layout 的 header 插槽：包含标题，以及可选的副标题和首尾内容。传入 onOpenChange 即显示关闭按钮，与 DialogHeader 相同。',
      },
      {
        name: 'Scrim',
        required: false,
        description:
          '模态抽屉（hasScrim，默认开启）背后调暗并阻止页面交互的背景层；非模态抽屉没有。',
      },
    ],
    description:
      '浮在页面内容之上的侧边面板，用于检查器和详情视图——"点击表格行查看详情"的模式。与停靠面板不同，它覆盖在布局之上，不会挤压页面。桌面端按 width 设定宽度，宽度小于 640px 时保留 56px 的底层页面，并且不超过 width 上限。按 Escape 关闭抽屉（purpose 为 required 时除外），焦点返回到打开它的元素。滑入/滑出动画遵循 prefers-reduced-motion。堆叠约定：同级抽屉后开的在上层，Escape 只关闭最上层的，关闭顺序由内向外——请以同级方式渲染，切勿嵌套。\n\n与 Dialog 一样，Drawer 是一个容器：内容区域默认带有 --spacing-4（16px）的内边距，也可以由 padding 属性或主题中 drawer 的 padding 设置。像 Dialog 一样用 Layout 组合页眉、正文和页脚：DrawerHeader 放在 header 插槽（传入 onOpenChange 时显示关闭按钮，与 DialogHeader 相同），正文放在 LayoutContent，操作放在 LayoutFooter。Layout 会把内边距分配给这些区域，使它们对齐在同一条内容线上，页眉也不会被重复缩进。作为唯一子元素的 Section 同样会越出该内边距。Drawer 本身不渲染关闭按钮，所以每个抽屉都要提供可见的关闭方式，非模态抽屉尤其如此，因为它没有可点击的遮罩。在打开时应获得焦点的控件上加 data-autofocus。\n\n如何选择：居中的决定或短表单用 Dialog；保持页面可见的全高侧边详情用 Drawer；触屏上的块轴面板用 BottomSheet；内容应当把页面挤开重排时用停靠面板（布局分栏），而不是浮层。\n\n主题化：面板是唯一的稳定目标（astryx-drawer，data-side 反映 side 值），遮罩是面板的原生 ::backdrop。DrawerHeader 为其标题行、插槽和关闭图标提供 astryx-drawer-header 系列目标。',
    bestPractices: [
      {
        guidance: true,
        description:
          '用于上下文详情视图（行检查器、实体详情），让用户保持对底层列表的可见性。',
      },
      {
        guidance: true,
        description:
          '让调用方作为唯一数据源：从选中状态派生 isOpen，并在 onOpenChange 中清除选中。',
      },
      {
        guidance: true,
        description:
          '在主从流程中使用 hasScrim={false}——非模态抽屉不捕获焦点，抽屉后面的页面保持可交互。',
      },
      {
        guidance: true,
        description:
          '关闭时保留最后选中的内容：退出动画期间子内容仍然挂载，中途置空会让面板在滑出时变为空白。',
      },
      {
        guidance: true,
        description:
          '为每个抽屉提供可见的关闭操作，通常是带 onOpenChange 的 DrawerHeader；非模态抽屉没有可点击的遮罩。',
      },
      {
        guidance: true,
        description: '误点遮罩会丢失未保存的输入时，使用 purpose="form"。',
      },
      {
        guidance: false,
        description:
          '用 Drawer 做简短确认或小表单——请改用 Dialog 或 AlertDialog。',
      },
      {
        guidance: false,
        description:
          '需要把页面内容挤开时不要用 Drawer——它浮在内容之上，请改用停靠面板或布局分栏。',
      },
      {
        guidance: false,
        description:
          '不要把 Drawer 当作底部/顶部面板使用——它只支持行内轴，块轴面板请用 BottomSheet。',
      },
      {
        guidance: false,
        description:
          '在 Drawer 中嵌套另一个 Drawer；应以同级方式渲染——后开的堆叠在上层，Escape 先关闭它。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'side panel floating over content (native <dialog>): start/end edge, full height, Dialog-like container padding (--spacing-4 by default; padding prop or theme drawer padding)',
  usage: {
    anatomy,
    description:
      "Overlay side panel for inspectors and detail views; floats over content, never reflows it. width = desktop budget; 56px page reveal below 640px, capped by width. Escape closes topmost (not when purpose=required); focus restores to the opener. Siblings stack last-opened on top; never nest. Slide animation respects prefers-reduced-motion. Dialog-like container: content area inset = --spacing-4 (16px) by default, or the padding prop / a theme's drawer padding (padding={0} = full bleed). Compose like Dialog: Layout with DrawerHeader in the header slot (close button only when given onOpenChange), LayoutContent, LayoutFooter; Layout redistributes the inset so regions line up and the header is not inset twice; a lone Section escapes the inset. No built-in close button, so every drawer needs a visible exit; data-autofocus picks the focus target. purpose matches Dialog: info = Escape + scrim click, form = Escape only, required = neither (modal → alertdialog). Choose: Dialog for centered decisions/short forms, Drawer for full-height side detail, BottomSheet for block-axis sheets, docked layout column to reflow instead of float. Theming: single target astryx-drawer (data-side); scrim is its ::backdrop; DrawerHeader has astryx-drawer-header targets.",
    bestPractices: [
      {
        guidance: true,
        description: 'Use for row inspectors and entity detail views.',
      },
      {
        guidance: true,
        description:
          'Derive isOpen from selection state; clear it in onOpenChange.',
      },
      {
        guidance: true,
        description:
          'Use hasScrim={false} for non-modal master-detail flows (no focus trap, page stays interactive).',
      },
      {
        guidance: true,
        description:
          'Keep last-selected content rendered on close (children stay mounted during exit).',
      },
      {
        guidance: true,
        description:
          'Give every drawer a visible close action (DrawerHeader + onOpenChange); non-modal has no scrim.',
      },
      {
        guidance: true,
        description:
          'Use purpose="form" when a stray scrim click would lose input.',
      },
      {
        guidance: false,
        description:
          'Use for confirmations or small forms; use Dialog instead.',
      },
      {
        guidance: false,
        description:
          'Use when content should push the page aside (it floats over) or as a bottom sheet (use BottomSheet).',
      },
      {
        guidance: false,
        description:
          'Nest Drawers: render as siblings; Escape closes the last-opened first.',
      },
    ],
  },
};
