// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TopNavMegaMenuItem',
  subComponentOf: 'TopNav',
  displayName: 'Top Nav Mega Menu Item',
  isHiddenFromOverview: true,
  description:
    'An individual item inside an TopNavMegaMenu. Renders itself in both desktop (popover grid) and mobile drawer modes via render mode context.',
  props: [
    {
      name: 'title',
      type: 'string',
      description: 'Display title for the menu item.',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: 'Optional description text displayed below the title.',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Optional icon element displayed to the left.',
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
      name: 'href',
      type: 'string',
      description: 'URL to navigate to when clicked.',
    },
    {
      name: 'onClick',
      type: '() => void',
      description: 'Callback when item is clicked.',
    },
    {
      name: 'hasCloseOnSelect',
      type: 'boolean',
      description:
        'Whether picking the item with the keyboard, a finger or a pen closes the mega menu panel and returns focus to its trigger (a mouse pick leaves it open). Set false for an action that reports its result on the item itself.',
      default: 'true',
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description:
        'Custom component to render instead of <a> for link items. Overrides the provider-level default set by LinkProvider.',
    },
  ],
};

export const docsZh = {
  name: 'TopNavMegaMenuItem',
  isHiddenFromOverview: true,
  displayName: 'Top Nav Mega Menu Item',
  description:
    '超级菜单中的单个项目。在桌面端（弹出层网格）和移动抽屉模式中都会自行渲染。',
  props: [
    {
      name: 'title',
      type: 'string',
      description: '菜单项的显示标题。',
      required: true,
    },
    {
      name: 'description',
      type: 'string',
      description: '标题下方的可选描述文本。',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: '左侧显示的可选图标元素。',
    },
    {
      name: 'href',
      type: 'string',
      description: '点击时导航的 URL。',
    },
    {
      name: 'onClick',
      type: '() => void',
      description: '点击项目时的回调。',
    },
    {
      name: 'hasCloseOnSelect',
      type: 'boolean',
      description:
        '用键盘、手指或触控笔选择该项时是否关闭大型菜单面板并把焦点还给触发按钮（鼠标选择则保持打开）。若操作在项目本身显示结果，设为 false。',
      default: 'true',
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description:
        '用于替代 <a> 的自定义链接组件。覆盖 LinkProvider 设置的默认组件。',
    },
  ],
};

export const docsDense = {
  name: 'TopNavMegaMenuItem',
  isHiddenFromOverview: true,
  displayName: 'Top Nav Mega Menu Item',
  description:
    'Individual mega menu item. Renders in desktop popover grid + mobile drawer modes via context.',
  propDescriptions: {
    title: 'Display title.',
    description: 'Description below title.',
    icon: 'Left icon element.',
    href: 'Navigation URL.',
    onClick: 'Click callback.',
    hasCloseOnSelect:
      'Keyboard/finger/pen pick closes panel, focus to trigger. Default true.',
    as: 'Custom link component, overrides LinkProvider default.',
  },
};
