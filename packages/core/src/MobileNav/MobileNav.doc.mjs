// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Navigation overlay',
    required: true,
    description:
      'Full-viewport dialog overlay that hosts the mobile navigation drawer.',
  },
  {
    name: 'Drawer',
    required: true,
    description:
      'Painted panel that slides in from the resolved viewport edge.',
  },
  {
    name: 'Header',
    required: true,
    description:
      'Fixed row containing optional header content and the close button.',
  },
  {
    name: 'Content',
    required: true,
    description: 'Scrollable region containing the navigation content.',
  },
  {
    name: 'Close button',
    required: true,
    description: 'Button that closes the navigation drawer.',
  },
  {
    name: 'Toggle button',
    required: false,
    description:
      'AppShell-aware Button that opens or closes the drawer on mobile viewports.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MobileNav',
  displayName: 'Mobile Nav',
  group: 'Navigation',
  category: 'Navigation',
  isHiddenFromOverview: true,
  keywords: [
    'mobilenav',
    'drawer',
    'sidebar',
    'navigation',
    'hamburger',
    'menu',
    'offcanvas',
    'slideout',
    'navdrawer',
    'toggle',
  ],
  components: [
    {
      name: 'MobileNav',
      displayName: 'Mobile Nav',
      description:
        'A slide-out drawer for mobile navigation. Accepts SideNav children.',
      // The drawer opens via showModal() and renders nothing while closed —
      // overlay mode gives the Properties preview an open trigger instead of
      // an empty stage (#2706). Declared on this entry (not the directory
      // doc) so MobileNavToggle does not inherit it.
      playground: {
        overlay: true,
        defaults: {
          isOpen: false,
          header: 'Navigation',
          children: {
            __element: 'SideNavSection',
            props: {title: 'Main'},
            children: [
              {
                __element: 'SideNavItem',
                props: {label: 'Dashboard', isSelected: true},
              },
              {__element: 'SideNavItem', props: {label: 'Projects'}},
              {__element: 'SideNavItem', props: {label: 'Settings'}},
            ],
          },
        },
      },
      props: [
        {
          name: 'isOpen',
          type: 'boolean',
          description:
            'Whether the drawer is open. Inside AppShell, this is managed automatically via context. Outside AppShell, provide this prop to control the drawer yourself.',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description:
            'Called when the drawer visibility changes (backdrop click, Escape key, or close button). Inside AppShell, this is managed automatically via context.',
        },
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Drawer content: typically SideNavSection/SideNavItem, or any ReactNode.',
          required: true,
        },
        {
          name: 'header',
          type: 'ReactNode',
          description:
            'Header content for the drawer. Rendered next to the close button. Pass a string for a simple text heading, or a ReactNode for custom content (logo, search bar, etc.).',
        },
        {
          name: 'width',
          type: 'number',
          description:
            'Drawer width in pixels. Capped at 85vw to prevent overflow on small screens.',
          default: '320',
        },
        {
          name: 'side',
          type: "'start' | 'end' | 'auto'",
          description:
            'Which side the drawer slides from. Start is left in LTR, right in RTL. Auto picks a side based on the trigger position.',
          default: "'auto'",
        },
      ],
    },
    {
      name: 'MobileNavToggle',
      displayName: 'Mobile Nav Toggle',
      description:
        'Hamburger button that opens/closes the mobile nav drawer. Reads open state from AppShell context automatically: does NOT accept isOpen or onOpenChange props. Renders nothing above the mobile breakpoint. Host attributes and DOM handlers (id, data-*, aria-*) reach the button; its aria-expanded and aria-controls stay component-owned, and a caller onClick runs after the toggle.',
      // The toggle renders null unless AppShell mobile context reports an
      // enabled mobile viewport — the default context outside AppShell never
      // does, so the Properties preview was an empty stage. appShellMobile
      // has the preview simulate that context instead (#4983).
      playground: {
        appShellMobile: true,
      },
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Custom content to render instead of the default hamburger icon.',
        },
        {
          name: 'label',
          type: 'string',
          description: 'Accessible label for the toggle button.',
          default: "'Open navigation'",
        },
      ],
    },
  ],
  theming: {
    targets: [{className: 'astryx-mobile-nav', visualProps: ['side']}],
  },
  usage: {
    anatomy,
    description:
      'A slide-out drawer for mobile navigation. MobileNav is the mobile counterpart to SideNav and accepts the same children. Use it on narrow viewports where a persistent sidebar is not practical. Inside AppShell, use MobileNavToggle as the trigger; it reads state from context automatically.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Share the same nav items between MobileNav and SideNav by extracting them into a variable.',
      },
      {
        guidance: true,
        description:
          "Provide a header when the drawer's purpose is not obvious from its content.",
      },
      {
        guidance: true,
        description:
          'Inside AppShell, use MobileNavToggle to open the drawer; it reads state from context. Do not pass isOpen/onOpenChange to the toggle.',
      },
      {
        guidance: false,
        description:
          'Use MobileNav on desktop: use a persistent SideNav instead.',
      },
    ],
  },
};
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'MobileNav',
  displayName: 'Mobile Nav',
  props: [
    {
      name: 'isOpen',
      type: 'boolean',
      description: '抽屉是否打开。',
      required: true,
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description:
        '当抽屉可见性变化时调用（点击背景遮罩、按 Escape 键或点击关闭按钮）。',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        '抽屉内容，通常是 SideNavSection/SideNavItem 或任何 ReactNode。',
      required: true,
    },
    {
      name: 'header',
      type: 'ReactNode',
      description:
        '抽屉的头部内容。渲染在关闭按钮旁边。传入字符串作为简单文本标题，或传入 ReactNode 作为自定义内容。',
    },
    {
      name: 'width',
      type: 'number',
      description: '抽屉宽度（像素）。上限为 85vw 以防止在小屏幕上溢出。',
      default: '320',
    },
    {
      name: 'side',
      type: "'start' | 'end' | 'auto'",
      description:
        '抽屉滑出的方向。在 LTR 布局中 start 为左侧，在 RTL 布局中为右侧。auto 根据触发元素的位置自动选择方向。',
      default: "'auto'",
    },
  ],
  theming: {
    targets: [{className: 'astryx-mobile-nav', visualProps: ['side']}],
  },
  usage: {
    anatomy,
    description:
      'A slide-out drawer for mobile navigation. MobileNav is the mobile counterpart to SideNav and accepts the same children. Use it on narrow viewports where a persistent sidebar is not practical.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Share the same nav items between MobileNav and SideNav by extracting them into a variable.',
      },
      {
        guidance: true,
        description:
          "Provide a header when the drawer's purpose is not obvious from its content.",
      },
      {
        guidance: true,
        description:
          'Inside AppShell, use MobileNavToggle to open the drawer; it reads state from context. Do not pass isOpen/onOpenChange to the toggle.',
      },
      {
        guidance: false,
        description:
          'Use MobileNav on desktop: use a persistent SideNav instead.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Slide-out drawer overlay for mobile navigation. Mobile counterpart to SideNav; accepts same children (SideNavSection, SideNavItem, or any ReactNode).',
  usage: {
    anatomy,
    description:
      'A slide-out drawer for mobile navigation. MobileNav is the mobile counterpart to SideNav and accepts the same children. Use it on narrow viewports where a persistent sidebar is not practical.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Share nav items between MobileNav and SideNav by extracting into a variable.',
      },
      {
        guidance: true,
        description:
          'Provide a header when the drawer purpose is not obvious from content.',
      },
      {
        guidance: true,
        description:
          'Inside AppShell, use MobileNavToggle to open the drawer; it reads state from context. Do not pass isOpen/onOpenChange to the toggle.',
      },
      {
        guidance: false,
        description:
          'Use MobileNav on desktop; use a persistent SideNav instead.',
      },
    ],
  },
  components: [
    {
      name: 'MobileNav',
      description:
        'Slide-out drawer for mobile navigation. Accepts SideNav children.',
    },
    {
      name: 'MobileNavToggle',
      description:
        'Hamburger button that opens/closes mobile nav drawer. Reads open state from AppShell context automatically. Renders nothing above mobile breakpoint. Host attributes and handlers reach the button; aria-expanded/aria-controls stay owned.',
    },
  ],
  propDescriptions: {
    isOpen: 'whether drawer is open',
    onOpenChange:
      'called when drawer visibility changes (backdrop click, Escape, close button)',
    children:
      'drawer content; typically SideNavSection/SideNavItem or any ReactNode',
    header:
      'header content (string or ReactNode), rendered next to close button',
    width:
      'drawer width px; capped at 85vw to prevent overflow on small screens',
    side: 'slide direction; start=left LTR, right RTL',
  },
};
