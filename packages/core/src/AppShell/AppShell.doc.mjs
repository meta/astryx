// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AppShell',
  displayName: 'App Shell',
  group: 'AppShell',
  category: 'Layout',
  keywords: [
    'appshell',
    'layout',
    'scaffold',
    'sidebar',
    'sidenav',
    'topnav',
    'header',
    'navigation',
    'dashboard',
    'shell',
    'page',
    'frame',
  ],
  usage: {
    description:
      'AppShell is the page shell for an application. It provides slots for top navigation, side navigation, banners, and main content. Use it as the root wrapper for every page. It handles responsive mobile navigation and skip-to-content automatically. Configure side nav collapse on SideNav with its collapsible prop.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right height: use "fill" for dashboards with internal scrolling and "auto" for pages that grow with content.',
      },
      {
        guidance: true,
        description:
          'Set `contentPadding` based on content type: 4 for forms and settings, 0 for tables and dashboards.',
      },
      {
        guidance: true,
        description:
          'Give every nav slot an accessible name. AppShell renders TopNav and SideNav as separate navigation landmarks, and a screen reader lists them by name, so pass `label` to each one.',
      },
      {
        guidance: true,
        description:
          'Start the page heading inside `children`. AppShell owns the skip link, the banner landmark and the main landmark, but it renders no heading, so the first heading in the content area is the page h1.',
      },
      {
        guidance: false,
        description:
          "Nest one AppShell inside another; it's the outermost layout frame.",
      },
      {
        guidance: false,
        description:
          'Use for sub-page layouts; use Layout for content areas within AppShell.',
      },
      {
        guidance: false,
        description:
          'Add your own skip link or <main> element. AppShell already renders both, and a second main landmark makes the first ambiguous.',
      },
    ],
    anatomy: [
      {
        name: 'Page shell',
        required: true,
        description:
          'Outermost application frame that owns page-level navigation, responsive shell behavior, and the main content landmark.',
      },
      {
        name: 'Skip link',
        required: true,
        description:
          'First focusable element on the page. Visually hidden until focused, then moves focus to the main content area.',
      },
      {
        name: 'Banner',
        required: false,
        description:
          'The banner slot, for system-wide announcements. Renders above the top nav, inside the banner landmark.',
      },
      {
        name: 'Top navigation',
        required: false,
        description:
          'The topNav slot, typically TopNav. Below the mobile breakpoint it becomes a compact bar carrying the nav toggle.',
      },
      {
        name: 'Side navigation',
        required: false,
        description:
          'The sideNav slot, typically SideNav. Inline above the breakpoint, moved into the mobile drawer below it.',
      },
      {
        name: 'Main content',
        required: true,
        description:
          'children, rendered in the main landmark. Scrolls internally when height is fill, and with the page when it is auto. While it scrolls content that overflows, it is a stop in the tab order; Tab entry moves on when its first focusable element is a plain link or button, and otherwise main is one stop before it.',
      },
      {
        name: 'Mobile nav drawer',
        required: false,
        description:
          'Generated below the breakpoint from the nav slots unless mobileNav disables or replaces it. A modal dialog: it traps focus and returns focus to the toggle on close.',
      },
    ],
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Main content area, rendered inside a <main> element.',
    },
    {
      name: 'contentPadding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Padding for the main content area. Set based on the dominant content pattern: 4 (16px) for forms/settings/text, 0 for dashboards/maps/tables. Override individual sections with Section.',
      default: '0',
    },
    {
      name: 'topNav',
      type: 'ReactNode',
      description: 'Top navigation slot, typically TopNav.',
      slotElements: [{__element: 'TopNav', props: {label: 'Navigation'}}],
    },
    {
      name: 'sideNav',
      type: 'ReactNode',
      description: 'Side navigation slot, typically SideNav.',
      slotElements: [{__element: 'SideNav', props: {}}],
    },
    {
      name: 'mobileNav',
      // Kept as the bare `ReactNode`, not widened to the true
      // `false | MobileNavConfig | ReactNode`: the docsite playground hides a
      // prop by exact-matching the type string against UNSUPPORTED_PROP_TYPES,
      // and widening drops that match. This prop's slotElements happen to hide
      // it a second way today, but the hide should not rest on that
      // coincidence. The legal values live in the description instead (#1645).
      type: 'ReactNode',
      description:
        "Mobile navigation configuration. Accepts false (disable), a config object (tune auto behavior), or ReactNode (full custom drawer). The config object is {hasToggle?: boolean, isOpen?: boolean, onOpenChange?: (isOpen: boolean) => void, content?: ReactNode, breakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'none', defaultIsMobile?: boolean}; breakpoint defaults to 'md', resolves through the nearest Theme's widthBreakpoints, and switches to the wider layout at equality. 'none' is always non-mobile and ignores defaultIsMobile.",
      slotElements: [{__element: 'MobileNav', props: {}}],
    },
    {
      name: 'banner',
      type: 'ReactNode',
      description:
        'Banner slot for system-wide announcements, placed above the topNav.',
      slotElements: [
        {
          __element: 'Banner',
          props: {title: 'Info', status: 'info', container: 'section'},
        },
      ],
    },
    {
      name: 'height',
      type: "'fill' | 'auto'",
      description:
        "Height behavior: 'fill' makes the shell fill the viewport (100dvh) with independent scroll containers; 'auto' lets the shell grow with content and uses sticky positioning for nav.",
      default: "'fill'",
    },
    {
      name: 'variant',
      type: "'wash' | 'surface' | 'section' | 'elevated'",
      description:
        "Navigation background style controlling how nav areas contrast with content. 'wash' uses wash background, 'surface' uses surface background, 'section' adds dividers between nav and content, 'elevated' uses wash nav with elevated surface content and border radius.",
      default: "'elevated'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  playground: {
    defaults: {
      variant: 'surface',
      contentPadding: 4,
      topNav: {
        __element: 'TopNav',
        props: {
          label: 'Navigation',
          heading: {__element: 'TopNavHeading', props: {heading: 'My App'}},
        },
      },
      sideNav: {
        __element: 'SideNav',
        props: {},
        children: [
          {
            __element: 'SideNavItem',
            props: {label: 'Dashboard', isSelected: true},
          },
          {__element: 'SideNavItem', props: {label: 'Settings'}},
          {__element: 'SideNavItem', props: {label: 'Help'}},
        ],
      },
      children: {
        __element: 'VStack',
        props: {gap: 3},
        children: [
          {__element: 'Heading', props: {level: 2}, children: 'Dashboard'},
          {
            __element: 'Text',
            props: {type: 'body', color: 'secondary'},
            children: 'Welcome back. Here is an overview of your workspace.',
          },
        ],
      },
    },
  },
  theming: {
    targets: [
      {className: 'astryx-app-shell', visualProps: ['variant']},
      {className: 'astryx-app-shell-header', visualProps: ['variant']},
      {className: 'astryx-app-shell-sidenav', visualProps: ['variant']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'AppShell',
  displayName: 'App Shell',
  usage: {
    description:
      'AppShell is the page shell for an application. It provides slots for top navigation, side navigation, banners, and main content. Use it as the root wrapper for every page. It handles responsive mobile navigation and skip-to-content automatically. Configure side nav collapse on SideNav with its collapsible prop.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right height: use "fill" for dashboards with internal scrolling and "auto" for pages that grow with content.',
      },
      {
        guidance: true,
        description:
          'Set `contentPadding` based on content type: 4 for forms and settings, 0 for tables and dashboards.',
      },
      {
        guidance: false,
        description:
          "Nest one AppShell inside another; it's the outermost layout frame.",
      },
      {
        guidance: false,
        description:
          'Use for sub-page layouts; use Layout for content areas within AppShell.',
      },
    ],
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '主内容区域，渲染在 <main> 元素内部。',
    },
    {
      name: 'contentPadding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        '主内容区域的内边距。根据页面主要内容模式设置：4（16px）适用于表单/设置/文本页面，0 适用于仪表盘/地图/表格。可通过 Section 覆盖个别区域。',
      default: '0',
    },
    {
      name: 'topNav',
      type: 'ReactNode',
      description: '顶部导航插槽，通常为 TopNav。',
    },
    {
      name: 'sideNav',
      type: 'ReactNode',
      description: '侧边导航插槽，通常为 SideNav。',
    },
    {
      name: 'mobileNav',
      type: 'ReactNode',
      description:
        "移动端导航配置。接受 false（禁用）、配置对象（调整自动行为）或 ReactNode（完全自定义抽屉）。配置对象为 {hasToggle?, isOpen?, onOpenChange?, content?, breakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'none', defaultIsMobile?}；breakpoint 默认为 'md'，从最近 Theme 的 widthBreakpoints 解析，并在等于断点时切换到较宽布局；'none' 始终使用非移动端布局并忽略 defaultIsMobile。",
    },
    {
      name: 'banner',
      type: 'ReactNode',
      description: '横幅插槽，用于全局公告，放置在 topNav 上方。',
    },
    {
      name: 'height',
      type: "'fill' | 'auto'",
      description:
        "高度行为：'fill' 使外壳填满视口（100dvh），各区域拥有独立的滚动容器；'auto' 使外壳随内容增长，导航使用 sticky 定位。",
      default: "'fill'",
    },
    {
      name: 'variant',
      type: "'wash' | 'surface' | 'section' | 'elevated'",
      description:
        "导航背景样式，控制导航区域与内容之间的对比。'wash' 使用 wash 背景，'surface' 使用 surface 背景，'section' 在导航和内容之间添加分隔线，'elevated' 使用 wash 导航配合凸起的 surface 内容区域和圆角。",
      default: "'elevated'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，不能是 style={{}} 形式的内联样式对象。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-app-shell',
        visualProps: ['variant'],
      },
      {className: 'astryx-app-shell-header', visualProps: ['variant']},
      {className: 'astryx-app-shell-sidenav', visualProps: ['variant']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'app-level layout shell w/ header, side nav, main content; composes Layout internally, replaces Page+PageLayout',
  usage: {
    description:
      'AppShell is the page shell for an application. It provides slots for top navigation, side navigation, banners, and main content. Use it as the root wrapper for every page. It handles responsive mobile navigation and skip-to-content automatically. Configure side nav collapse on SideNav with its collapsible prop.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose the right height: use "fill" for dashboards with internal scrolling and "auto" for pages that grow with content.',
      },
      {
        guidance: true,
        description:
          'Set `contentPadding` based on content type: 4 for forms and settings, 0 for tables and dashboards.',
      },
      {
        guidance: true,
        description:
          'Give every nav slot an accessible name: TopNav and SideNav are separate navigation landmarks, so pass `label` to each.',
      },
      {
        guidance: true,
        description:
          'Start the page heading inside `children`: AppShell owns the skip link, banner, and main landmarks but renders no heading, so the first content heading is the page h1.',
      },
      {
        guidance: false,
        description:
          "Nest one AppShell inside another; it's the outermost layout frame.",
      },
      {
        guidance: false,
        description:
          'Use for sub-page layouts; use Layout for content areas within AppShell.',
      },
      {
        guidance: false,
        description:
          'Add your own skip link or <main>; AppShell renders both, and a second main landmark makes the first ambiguous.',
      },
    ],
  },
  propDescriptions: {
    children: 'main content area, rendered inside <main>',
    topNav: 'top nav slot, typically TopNav',
    sideNav: 'side nav slot, typically SideNav',
    mobileNav:
      'mobile nav config: false | ReactNode | config with theme-resolved sm|md|lg|xl|2xl|none breakpoint (exclusive upper edge); none is always non-mobile and ignores defaultIsMobile',
    banner: 'slot for system-wide announcements above topNav',
    height:
      'fill=viewport 100dvh w/ independent scroll; auto=content-driven w/ sticky nav',
    variant:
      'nav bg style: wash=wash bg, surface=surface bg, section=dividers, elevated=wash nav w/ elevated surface content+radius',
    contentPadding:
      'main content area padding. 4 (16px) for forms/settings/text, 0 for dashboards/maps/tables. Override per-section via Section.',
    xstyle: 'StyleX layout customization via stylex.create()',
  },
};
