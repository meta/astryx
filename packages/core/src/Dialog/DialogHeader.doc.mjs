// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DialogHeader',
  subComponentOf: 'Dialog',
  displayName: 'Dialog Header',
  isHiddenFromOverview: true,
  description: 'Header for dialogs with a title, optional subtitle, close button, and start/end content slots.',
  usage: {
    description: 'Use DialogHeader to give a dialog a labelled title area and optional close control.',
    anatomy: [
      {name: 'Header row', required: true, description: 'Arranges the title block, optional start/end content, and close control.'},
      {name: 'Start content', required: false, description: 'Wraps optional leading content.'},
      {name: 'Title block', required: true, description: 'Groups the title and optional subtitle.'},
      {name: 'End content', required: false, description: 'Groups optional trailing content with the optional close control.'},
      {name: 'Close icon', required: false, description: 'Visual close glyph inside the close button.'},
    ],
  },
  props: [
    {
      name: 'title',
      type: 'ReactNode',
      description: 'Dialog title, rendered inside the focusable h2 (receives focus on open; its text content labels the dialog via aria-labelledby unless the Dialog has an explicit aria-label/aria-labelledby). Keep it inline, non-interactive, and non-empty.',
    },
    {
      name: 'subtitle',
      type: 'ReactNode',
      description: 'Subtitle below the title. Accepts inline content such as a Link; avoid block elements.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => unknown',
      description: 'Close button callback (no button if omitted).',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description: 'Content before the title (e.g., a back button).',
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
      name: 'endContent',
      type: 'ReactNode',
      description: 'Content after the title, before close button.',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'chevronDown',
            size: 'sm',
          },
        },
        {
          __element: 'Badge',
          props: {
            label: '3',
          },
        },
      ],
    },
    {
      name: 'endContentEdgeCompensation',
      type: "'inline' | 'block' | 'all'",
      description: 'Selects compensation axes for the end-content slot. Omit to preserve automatic close-action compensation.',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description: 'Adds border at the bottom edge.',
      default: 'true',
    },
  ],
  playground: {
    defaults: {
      title: 'Delete file?',
      subtitle: 'This action cannot be undone.',
      hasDivider: true,
    },
  },
  theming: {
    targets: [
      {className: 'astryx-dialog-header'},
      {className: 'astryx-dialog-header-start-content'},
      {className: 'astryx-dialog-header-title-block'},
      {className: 'astryx-dialog-header-end-content'},
      {className: 'astryx-dialog-header-close-icon'},
    ],
  },
  examples: [
    {
      label: 'Basic',
      code: `
import {DialogHeader} from '@astryxdesign/core/Dialog';

<DialogHeader title="Delete file?" subtitle="This action cannot be undone." />;
`,
    },
    {
      label: 'With close button',
      code: `
import {useState} from 'react';
import {DialogHeader} from '@astryxdesign/core/Dialog';

function Header() {
  const [, setIsOpen] = useState(true);

  // Passing onOpenChange renders a close button that calls it with false.
  return <DialogHeader title="Settings" onOpenChange={setIsOpen} />;
}
`,
    },
    {
      label: 'With a link in the subtitle',
      code: `
import {DialogHeader} from '@astryxdesign/core/Dialog';
import {Link} from '@astryxdesign/core/Link';

<DialogHeader
  title="Share conversation"
  subtitle={
    <>
      Anyone with the link can view it. Review the{' '}
      <Link href="#sharing-policy">sharing policy</Link> first.
    </>
  }
/>;
`,
    },
    {
      label: 'With start and end content',
      code: `
import {DialogHeader} from '@astryxdesign/core/Dialog';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';

<DialogHeader
  title="Notifications"
  startContent={<Icon icon="chevronLeft" size="sm" />}
  endContent={<Badge label="3" />}
/>;
`,
    },
  ],
};

export const docsZh = {
  name: 'DialogHeader',
  isHiddenFromOverview: true,
  displayName: 'Dialog Header',
  description: '对话框头部，包含标题、可选副标题、关闭按钮以及首尾内容插槽。',
  usage: {
    description: '使用 DialogHeader 为对话框提供带标签的标题区和可选的关闭控件。',
    anatomy: [
      {name: 'Header row', required: true, description: '排列标题区、可选的首尾内容和关闭控件。'},
      {name: 'Start content', required: false, description: '包装可选的首部内容。'},
      {name: 'Title block', required: true, description: '组合标题和可选副标题。'},
      {name: 'End content', required: false, description: '组合可选尾部内容和可选关闭控件。'},
      {name: 'Close icon', required: false, description: '关闭按钮内的关闭图标。'},
    ],
  },
  props: [
    {
      name: 'title',
      type: 'ReactNode',
      description: '对话框标题，渲染在可聚焦的 h2 中（打开时获得焦点，其文本内容通过 aria-labelledby 为对话框命名）。请使用非空、非交互的行内内容。',
    },
    {
      name: 'subtitle',
      type: 'ReactNode',
      description: '标题下方的副标题，可包含链接等行内内容；避免使用块级元素。',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => unknown',
      description: '关闭按钮的回调（省略时不显示按钮）。',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description: '标题之前的内容（例如返回按钮）。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '标题之后、关闭按钮之前的内容。',
    },
    {
      name: 'endContentEdgeCompensation',
      type: "'inline' | 'block' | 'all'",
      description: '选择尾部内容插槽的补偿轴；省略时保留关闭操作的自动补偿。',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description: '在底部边缘添加分隔线。',
      default: 'true',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-dialog-header'},
      {className: 'astryx-dialog-header-start-content'},
      {className: 'astryx-dialog-header-title-block'},
      {className: 'astryx-dialog-header-end-content'},
      {className: 'astryx-dialog-header-close-icon'},
    ],
  },
};

export const docsDense = {
  name: 'DialogHeader',
  isHiddenFromOverview: true,
  displayName: 'Dialog Header',
  description: 'dialog header w/ title, optional subtitle, close button, start/end content slots',
  usage: {
    description: 'labelled dialog title area + optional close control',
    anatomy: [
      {name: 'Header row', required: true, description: 'arranges title block, optional start/end content, close control'},
      {name: 'Start content', required: false, description: 'wraps optional leading content'},
      {name: 'Title block', required: true, description: 'groups title + optional subtitle'},
      {name: 'End content', required: false, description: 'groups optional trailing content + optional close control'},
      {name: 'Close icon', required: false, description: 'close glyph inside close button'},
    ],
  },
  propDescriptions: {
    title: 'dialog title node inside focusable h2 (focused on open; text content labels dialog via aria-labelledby); inline, non-interactive, non-empty',
    subtitle: 'subtitle node below title; inline content ok (e.g. Link), no block elements',
    onOpenChange: 'close button callback (omit=no button)',
    startContent: 'content before title (e.g. back button)',
    endContent: 'content after title, before close button',
    endContentEdgeCompensation:
      'end-content slot axes: inline | block | all; omit=automatic close-action compensation',
    hasDivider: 'bottom border',
  },
};
