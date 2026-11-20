// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsZh = {
  description:
    "Astryx 主题的工作方式：用主题包裹应用，用特征描述外观来创建主题（`astryx experimental theme create <name> --traits '<json>'`），然后编辑它写出的主题文件，并在每次编辑后运行 `astryx experimental theme check <name> --fix`。下面先给出步骤，然后说明如何发布主题供其他团队使用。",
  sections: [
    {
      section: 'Make or change a theme',
      title: '创建或修改主题',
      content: [
        {
          type: 'prose',
          text: "用特征描述外观并运行 `astryx experimental theme create <name> --traits '<json>'`（它的 `--help` 列出字段：look、page、surface、text、accent、bar、font、corners、density、borders、shadows、surfaces，以及优先生效的精确 `tokens` 和 `components`）。它写出完整的主题文件（每种颜色都有浅色和深色值，且可读），构建它，并设为应用的主题。之后文件归你所有：可以手动修改任何一行。要查看某一个部件读取的内容（它的令牌、状态和变体），运行 `astryx theme targets <part>`，然后在文件的 `components['<part>']` 下修改它。",
        },
      ],
    },
    {
      section: 'Check after each edit',
      title: '每次编辑后检查',
      content: [
        {
          type: 'prose',
          text: '每次编辑后运行 `astryx experimental theme check <name> --fix`。它构建主题，并在浅色和深色模式下检查用户会看到的问题：无法阅读的文字、透明的菜单、看不见的边框、一半浅一半深的页面。`--fix` 把它补全或修复的每个值作为普通的一行写入你的文件。检查通过之前，主题修改不算完成。',
        },
      ],
    },
    {
      section: 'A denser or roomier app',
      title: '更紧凑或更宽松的应用',
      content: [
        {
          type: 'prose',
          text: '更紧凑或更宽松的应用也是主题修改，而不是页面代码：使用 `density` 特征（`compact` 或 `roomy`），或修改主题文件中的间距令牌；然后再检查一次。',
        },
      ],
    },
    {
      section: 'One kind of part',
      title: '某一类部件',
      content: [
        {
          type: 'prose',
          text: "修改某一类部件（侧边栏、它的选中项、表单中的间距）也是主题修改，而不是某个页面上的属性或样式：在主题文件的 `components['<part>']` 下设置样式（`astryx theme targets` 列出各部件及其读取的内容），然后再检查一次。",
        },
      ],
    },
    {
      section: 'No app yet',
      title: '还没有应用',
      content: [
        {
          type: 'prose',
          text: '`astryx experimental theme preview app <dir>` 会创建一个展示该主题的入门应用。如何使用和创建主题：请参阅"使用主题"了解如何应用主题，参阅"创作主题"了解如何创建和自定义主题。',
        },
      ],
    },
    {
      section: 'Share a theme with other teams',
      title: '与其他团队共享主题',
      content: [
        {
          type: 'prose',
          text: '要发布主题供其他团队使用，请把它放在一个包里：包的 themes 文件夹存放主题，用 `{@command theme build}` 构建，并像其他包一样发布。其他团队安装这个包后运行 `{@command theme add <name> --package <package>}`。参见 {@link generic:add-a-theme}。',
        },
      ],
    },
    {
      section: 'Wrap your app in a theme',
      title: '为应用添加主题',
      content: [
        {
          type: 'prose',
          text: "安装主题包，用 `<Theme>`（`import {Theme} from '@astryxdesign/core/theme'`）包裹应用，选择浅色或深色模式。完整指南——可用主题、集成主题、深色模式、嵌套主题和生产构建——请参阅 {@link generic:use-a-theme}。",
        },
      ],
    },
    {
      section: 'Create a custom theme',
      title: '创建自定义主题',
      content: [
        {
          type: 'prose',
          text: "使用 `defineTheme` 进行令牌覆盖、比例配置和组件样式覆盖。新建完整调色板时，请运行 `astryx theme palette generate palette.config.json --out palette.generated.ts`，审核并提交生成的模块和收据，再使用 `import {palette} from './palette.generated';` 导入调色板，让语义令牌引用稳定的色阶，例如 `palette.neutral.light[100]` 和 `palette.neutral.dark[15]`。重新生成已接受的调色板时，所有保留这些引用的映射令牌会一并更新；生成操作不会自动修改主题。完整指南请参阅 {@link generic:author-a-theme}。",
        },
      ],
    },
    {
      section: 'Icon sizes',
      title: '图标尺寸',
      content: [
        {
          type: 'prose',
          text: "主题在样式表中设置每个 Icon 尺寸的大小：在 `components.icon['size:sm']`（或 `xsm`、`md`、`lg`）上设置 `width` 和 `height`，即可调整该尺寸的图标，语义图标名称和直接传给 `Icon` 的 SVG 组件都适用。请使用 `px` 或 `rem` 设置尺寸：语义图标会据此设置自身的字号，因此 `em` 值也会放大它的外框。主题未设置的尺寸在 16px 根字号下保持 12、16、20 或 24px（`xsm`、`sm`、`md`、`lg`），并随根字号缩放；`rem` 可保留这种缩放。四个尺寸名称是固定的。",
        },
        null,
      ],
    },
    {
      section: 'Dark mode',
      title: '深色模式',
      content: [
        {
          type: 'prose',
          text: "在令牌值中使用 [浅色, 深色] 元组来自动切换模式。在 Theme 上使用 mode='system'（默认）来跟随操作系统偏好。完整指南：{@link generic:use-a-theme}。",
        },
      ],
    },
  ],
};
