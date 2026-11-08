// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsZh = {
  description: '如何使用和创建主题：请参阅"使用主题"了解如何应用主题，参阅"创作主题"了解如何创建和自定义主题。',
  sections: [
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
          text: '使用 `defineTheme` 进行令牌覆盖、比例配置和组件样式覆盖。新建完整调色板时，请运行 `astryx theme palette generate palette.config.json --out palette.generated.ts`，审核并提交生成的模块和收据，再使用 `import {palette} from \'./palette.generated\';` 导入调色板，让语义令牌引用稳定的色阶，例如 `palette.neutral.light[100]` 和 `palette.neutral.dark[15]`。重新生成已接受的调色板时，所有保留这些引用的映射令牌会一并更新；生成操作不会自动修改主题。完整指南请参阅 {@link generic:author-a-theme}。',
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
          text: '在令牌值中使用 [浅色, 深色] 元组来自动切换模式。在 Theme 上使用 mode=\'system\'（默认）来跟随操作系统偏好。完整指南：{@link generic:use-a-theme}。',
        },
      ],
    },
  ],
};
