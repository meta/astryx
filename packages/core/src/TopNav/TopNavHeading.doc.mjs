// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TopNavHeading',
  subComponentOf: 'TopNav',
  displayName: 'Top Nav Heading',
  isHiddenFromOverview: true,
  description: 'Product/suite/account heading for the TopNav heading slot. Supports smart interaction boundary logic: logo, heading text, superheading/subheading with independent links, and an optional menu popover with automatic chevron indicator.',
  playground: {
    defaults: {superheading: 'Acme Suite', heading: 'Acme Console'},
  },
  props: [
    {
      name: 'logo',
      type: 'ReactNode',
      description: 'Logo element to display before the heading text. Can be an image, NavIcon, or any ReactNode.',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'heading',
      type: 'string',
      description: 'Product/app name displayed as the primary heading text.',
    },
    {
      name: 'headingHref',
      type: 'string',
      description: 'Link for the heading text (e.g. product home). When no menu is present and this is the only href, the whole heading becomes one clickable link.',
    },
    {
      name: 'superheading',
      type: 'string',
      description: 'Text above the heading (e.g. suite name). Rendered in a smaller secondary style.',
    },
    {
      name: 'superheadingHref',
      type: 'string',
      description: 'Link for the superheading text (e.g. suite home). When provided alongside a menu, renders as an independent inline link.',
    },
    {
      name: 'subheading',
      type: 'string',
      description: 'Text below the heading (e.g. account context). Rendered in a smaller secondary style.',
    },
    {
      name: 'subheadingHref',
      type: 'string',
      description: 'Link for the subheading text. When provided alongside a menu, renders as an independent inline link.',
    },
    {
      name: 'headerEndContent',
      type: 'ReactNode',
      description: 'Content rendered at the trailing edge of the heading row (e.g. a badge or status indicator).',
      slotElements: [
        {
          __element: 'Button',
          props: {
            label: 'Action',
            variant: 'ghost',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'menu',
      type: 'ReactNode',
      description: 'Menu content shown in a popover dropdown. When provided, a chevron indicator appears automatically. Interaction boundary is determined by the presence of hrefs: no hrefs means the whole header is the trigger; with hrefs, links are independent and the chevron area is the trigger.',
      slotElements: [
        {
          __element: 'Button',
          props: {
            label: 'Action',
            variant: 'ghost',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description: 'Custom component to render instead of <a>. Overrides the provider-level default set by LinkProvider. Must accept href, className, style, and children props.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization. Must be a stylex.create() value.',
    },
  ],
};

export const docsZh = {
  name: 'TopNavHeading',
  isHiddenFromOverview: true,
  displayName: 'Top Nav Heading',
  description: 'TopNav 标题插槽的产品/套件/账户标题组件。支持智能交互边界逻辑：标志、标题文本、独立链接的上标题/下标题，以及带自动箭头指示器的可选菜单弹出层。',
  props: [
    {
      name: 'logo',
      type: 'ReactNode',
      description: '在标题文本前显示的标志元素。可以是图片、NavIcon 或任何 ReactNode。',
    },
    {
      name: 'heading',
      type: 'string',
      description: '作为主标题文本显示的产品/应用名称。',
    },
    {
      name: 'headingHref',
      type: 'string',
      description: '标题文本的链接（如产品首页）。当没有菜单且这是唯一的 href 时，整个标题变为一个可点击链接。',
    },
    {
      name: 'superheading',
      type: 'string',
      description: '标题上方的文本（如套件名称）。以较小的次要样式渲染。',
    },
    {
      name: 'superheadingHref',
      type: 'string',
      description: '上标题文本的链接（如套件首页）。与菜单一起提供时，渲染为独立的内联链接。',
    },
    {
      name: 'subheading',
      type: 'string',
      description: '标题下方的文本（如账户上下文）。以较小的次要样式渲染。',
    },
    {
      name: 'subheadingHref',
      type: 'string',
      description: '下标题文本的链接。与菜单一起提供时，渲染为独立的内联链接。',
    },
    {
      name: 'headerEndContent',
      type: 'ReactNode',
      description: '在标题行尾部渲染的内容（如徽章或状态指示器）。',
    },
    {
      name: 'menu',
      type: 'ReactNode',
      description: '在弹出层下拉菜单中显示的菜单内容。提供时自动显示箭头指示器。交互边界由 href 的存在决定：没有 href 时整个标题为触发器；有 href 时链接独立，箭头区域为触发器。',
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description: '用于替代 <a> 的自定义链接组件。覆盖 LinkProvider 设置的默认组件。必须接受 href、className、style 和 children 属性。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '用于布局自定义的 StyleX 样式。必须是 stylex.create() 的值。',
    },
  ],
};

export const docsDense = {
  name: 'TopNavHeading',
  isHiddenFromOverview: true,
  displayName: 'Top Nav Heading',
  description: 'Product/suite heading for TopNav; logo+heading text w/ smart interaction boundaries, optional menu popover, superheading/subheading w/ independent links.',
  propDescriptions: {
    logo: 'Logo before heading text. Image, NavIcon, or ReactNode.',
    heading: 'Product/app name.',
    headingHref: 'Link for heading (product home). Only href + no menu → whole heading is link.',
    superheading: 'Text above heading (suite name). Smaller secondary style.',
    superheadingHref: 'Link for superheading. Independent inline link when menu present.',
    subheading: 'Text below heading (account context). Smaller secondary style.',
    subheadingHref: 'Link for subheading. Independent inline link when menu present.',
    headerEndContent: 'Trailing edge content (badge, status indicator).',
    menu: 'Popover dropdown content. Shows chevron auto. No hrefs → whole header triggers; with hrefs → chevron area triggers.',
    as: 'Custom link component. Overrides LinkProvider default. Must accept href, className, style, children.',
    xstyle: 'StyleX layout styles. Must be stylex.create() value.',
  },
};
