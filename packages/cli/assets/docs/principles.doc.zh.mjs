// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsZh = {
  description: 'Astryx 核心设计原则和规则。',
  sections: [
    { section: 'Design Philosophy', title: '设计哲学', content: [{ type: 'prose', text: '一个注重一致性、适应性和开发者体验的设计系统。核心理念：' }, { type: 'list', items: ['组件优于原始元素 — 优先使用 Astryx 组件', '语义化令牌优于硬编码值', '主题无关的代码 — 深色模式自动生效', '开放的内部机制 — 所有基础组件均可导出和组合'] }] },
    { section: 'Rules', title: '规则', content: [{ type: 'prose', text: '让应用代码保持在设计系统之内的八条规则。' }, { type: 'list', items: ['所有支持的场景都使用 Astryx 组件', '布局采用框架优先：先选定外壳并规划区域尺寸，再编写内容（见 {@link namespace:layout}）', '密集数据使用行（Table、List/Item）通栏渲染；Card 用于小部件、画廊和设置分组', '使用 StyleX 或 Tailwind 进行样式设置（见 {@link namespace:styling}）', '使用语义化令牌，不使用硬编码值（见 {@link namespace:tokens}）', '使用 CSS 变量设置颜色，不使用十六进制值', '表单输入为受控组件（value + onChange）', '使用 useLinkComponent() 进行导航'] }] },
    { section: 'Styling Approach', title: '样式方法', content: [{ type: 'prose', text: '组件覆盖使用 xstyle 属性。布局使用 StyleX 或 Tailwind。' }, { type: 'prose', text: '完整指南见 {@link namespace:styling}。' }] },
    { section: 'Anti-Patterns', title: '反模式', content: [{ type: 'prose', text: '会破坏主题、路由或布局的写法，以及应改用的做法。' }, { type: 'list', items: ['不要在原始元素上使用内联样式', '不要硬编码颜色 — 使用令牌或 Tailwind 语义类', '不要硬编码间距', '不要硬编码 <a> 元素 — 使用 useLinkComponent()', '不要把每个列表项都包在 Card 里 — 先定框架，密集数据用行渲染（见 {@link namespace:layout}）', '不要把 Badge 当装饰 — 状态请使用 StatusDot 或 Token', '不要自创属性。先阅读组件文档'] }] },
    { section: 'Design Tokens', title: '设计令牌', content: [{ type: 'prose', text: '完整令牌参考见 {@link namespace:tokens}。' }] },
  ],
};
