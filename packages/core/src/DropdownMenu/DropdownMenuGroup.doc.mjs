// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenuGroup',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Group',
  isHiddenFromOverview: true,
  playground: {
    // A standalone group has no required props, so the properties-tab preview
    // would render an empty box. Seed a title so the heading shows.
    defaults: {title: 'Version history'},
  },
  description:
    'A group of rows in a compound menu. A visible title names role="group" through aria-labelledby; an omitted title leaves the group unnamed. The heading is not a menuitem, so arrow keys and typeahead skip it. Keep title content non-interactive and place controls in DropdownMenu header or footer. The data-driven equivalent is the `{type: "section", title, items}` entry in `items`; both forms share the heading treatment and theme target. Host attributes and DOM handlers (id, data-*, aria-*) reach the group element; its role, and its name while it has a title, stay component-owned.',
  usage: {
    description:
      'Use DropdownMenuGroup to give related compound-menu rows one visible and programmatic name. Use an untitled group only when a separate name would not help people understand the rows.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use short, descriptive title content that explains what the grouped rows have in common.',
      },
      {
        guidance: true,
        description:
          'Keep the title non-interactive so every available action remains in the menu arrow-key order.',
      },
      {
        guidance: false,
        description:
          'Place buttons, links, fields, or other controls in title. Put them in DropdownMenu header or footer instead.',
      },
      {
        guidance: false,
        description:
          'Wrap rows that do not form a meaningful set; a group adds structure only when its relationship helps users.',
      },
    ],
    anatomy: [
      {
        name: 'Group',
        required: true,
        description:
          'The role="group" wrapper containing the heading and menu rows.',
      },
      {
        name: 'Heading',
        required: false,
        description:
          'Visible non-interactive title content that names the group and carries the dropdown-menu-section-heading theme target.',
      },
      {
        name: 'Rows',
        required: false,
        description:
          'Menu items, selectable items, radio groups, or submenus owned by DropdownMenu.',
      },
    ],
  },
  props: [
    {
      name: 'title',
      type: 'ReactNode',
      description:
        "Non-interactive heading content shown above the rows and used as the group's accessible name. Omit for an unnamed group; place controls in DropdownMenu header or footer.",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'The grouped rows: DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, or DropdownMenuSubMenu.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied to the role="group" wrapper. Must be a stylex.create() value, not an inline style object.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name applied to the role="group" wrapper.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: 'Inline styles applied to the role="group" wrapper.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the role="group" wrapper.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-dropdown-menu-section-heading'}],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'DropdownMenuGroup',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Group',
  isHiddenFromOverview: true,
  description:
    '复合菜单中的一组菜单行。可见标题通过 aria-labelledby 为 role="group" 命名；省略标题时该组没有名称。标题不是 menuitem，因此方向键和预输入会跳过它。标题内容应保持非交互；控件应放在 DropdownMenu 的 header 或 footer 中。宿主属性和 DOM 事件处理函数（id、data-*、aria-*）会传到分组元素上；其 role 以及有标题时的名称由组件控制。',
  usage: {
    description:
      '使用 DropdownMenuGroup 为相关的复合菜单行提供同一个可见名称和无障碍名称。只有当名称能帮助理解这些菜单行时才使用分组。',
    bestPractices: [
      {guidance: true, description: '使用简短且能说明菜单行关系的标题。'},
      {
        guidance: true,
        description: '保持标题非交互，让所有操作都位于菜单的方向键顺序中。',
      },
      {
        guidance: false,
        description:
          '在标题中放置按钮、链接或输入控件；应改用 DropdownMenu 的 header 或 footer。',
      },
      {guidance: false, description: '对没有共同含义的菜单行进行分组。'},
    ],
    anatomy: [
      {
        name: '组',
        required: true,
        description: '包含标题和菜单行的 role="group" 包装元素。',
      },
      {
        name: '标题',
        required: false,
        description: '用于命名分组的可见非交互标题内容。',
      },
      {
        name: '菜单行',
        required: false,
        description: '由 DropdownMenu 持有的菜单项、可选项、单选组或子菜单。',
      },
    ],
  },
  props: [
    {
      name: 'title',
      type: 'ReactNode',
      description:
        '显示在菜单行上方并作为分组无障碍名称的非交互标题内容。省略时分组无名称；控件应放在 DropdownMenu 的 header 或 footer 中。',
    },
    {name: 'children', type: 'ReactNode', description: '该分组中的菜单行。'},
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '应用于 role="group" 包装元素的 StyleX 样式。',
    },
    {
      name: 'className',
      type: 'string',
      description: '应用于 role="group" 包装元素的 CSS 类名。',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: '应用于 role="group" 包装元素的内联样式。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: '转发到 role="group" 包装元素的 ref。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-dropdown-menu-section-heading'}],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'named role="group" of compound-menu rows; compound peer of the data API\'s {type: "section"}',
  usage: {
    description:
      'Use to give related compound-menu rows one visible and programmatic name.',
    bestPractices: [
      {
        guidance: true,
        description: "Short title that explains the rows' relationship.",
      },
      {
        guidance: true,
        description:
          'Non-interactive title keeps every action in menu arrow navigation.',
      },
      {
        guidance: false,
        description:
          'Controls in title. Put them in DropdownMenu header or footer instead.',
      },
      {guidance: false, description: 'Group unrelated rows.'},
    ],
  },
  propDescriptions: {
    title: 'non-interactive heading above the rows; names the group',
    children: 'the grouped menu rows',
    xstyle: 'StyleX styles on the role="group" wrapper',
    className: 'CSS class on the role="group" wrapper',
    style: 'inline styles on the role="group" wrapper',
    ref: 'ref forwarded to the role="group" wrapper',
  },
};
