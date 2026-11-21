// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file DialogHeroHeader.doc.mjs
 * @input DialogHeroHeader props and Dialog composition
 * @output Consumer documentation for the canary-only hero header
 * @position Lab component documentation consumed by the CLI and docsite
 */

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DialogHeroHeader',
  displayName: 'Dialog Hero Header',
  import: '@astryxdesign/lab',
  group: 'DialogHeroHeader',
  category: 'Overlay',
  keywords: [
    'dialog',
    'modal',
    'header',
    'hero',
    'media',
    'image',
    'illustration',
    'onboarding',
    'marketing',
    'featured',
    'close button',
    'title',
  ],
  description:
    'Experimental hero-style header for Dialog, available from @astryxdesign/lab@canary: a full-bleed media slot above the title with the close button overlaid on the media. The high-emphasis sibling of DialogHeader for featured, marketing, or onboarding dialogs.',
  props: [
    {
      name: 'title',
      type: 'string | ReactElement',
      description:
        'Dialog title. A string is wrapped in a level 2 Heading (matching DialogHeader); pass a pre-styled Heading element to customize the treatment. Provides the accessible label for the parent Dialog via aria-labelledby unless the Dialog has an explicit label. The visible title is the default initial focus target; another eligible descendant autofocus request takes priority. A custom Heading receives the label and focus on its own element; if it sets its own id, name the Dialog with aria-labelledby.',
      required: true,
    },
    {
      name: 'media',
      type: 'ReactNode',
      description:
        "Full-bleed visual rendered above the title (image, illustration, or icon). Stretches to the dialog's padded edges; the close button overlays its top-trailing corner. Size the media itself (e.g. width 100%) to fill the slot.",
      required: true,
    },
    {
      name: 'mediaMode',
      type: "'light' | 'dark'",
      description:
        "Luminance of the media surface. Composes MediaTheme under the hood so content overlaid on the media (the close button) picks up contrast-safe inverted tokens: 'dark' media gets light overlay content, 'light' media gets dark. Omit to keep ambient theme tokens.",
    },
    {
      name: 'isTitleHidden',
      type: 'boolean',
      description:
        'Visually hides the title row while keeping it available to screen readers, so the dialog stays named by the title.',
      default: 'false',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description:
        'Content placed before the title (e.g. an icon), inline with the heading.',
    },
    {
      name: 'maxLines',
      type: 'number',
      description:
        'Max lines before the title truncates with an ellipsis. Only applies when title is a string (auto-wrapped in a Heading).',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => unknown',
      description:
        'Close button callback, called with false when the close button is clicked. If not provided, no close button is rendered. Same contract as DialogHeader.',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description:
        "Adds a themed border at the bottom edge. Defaults to the parent Layout's defaultHasDividers context value.",
    },
  ],
  usage: {
    description:
      "Drop into Layout's header slot inside a Dialog, exactly like DialogHeader. Use when the dialog opens onto a featured, marketing, or onboarding moment where the compact DialogHeader is too understated. The media bleeds to the dialog's edges automatically and the close button floats over its top-trailing corner. The visible title is the default initial focus target; inline previews do not move focus. Install @astryxdesign/lab@canary with @astryxdesign/core@canary and import both packages’ CSS. Lab APIs can change between canary versions.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Set mediaMode to match the media\'s luminance so the overlaid close button stays legible: dark imagery needs mediaMode="dark".',
      },
      {
        guidance: true,
        description:
          'Size the media content to fill the slot (width 100% for images); the slot itself only positions and bleeds.',
      },
      {
        guidance: true,
        description:
          'Keep actions (CTAs) in LayoutFooter; the hero header takes no actions slot.',
      },
      {
        guidance: true,
        description:
          'Use isTitleHidden when the media already communicates the message visually; the title still names the dialog for screen readers.',
      },
      {
        guidance: false,
        description:
          'Use for routine confirmations or forms; use the compact DialogHeader instead.',
      },
      {
        guidance: false,
        description:
          'Pass decorative media without an empty alt: use alt="" on purely decorative images so screen readers skip them.',
      },
    ],
  },
  examples: [
    {
      label: 'Onboarding dialog',
      code: `import {DialogHeroHeader} from '@astryxdesign/lab';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/lab/lab.css';

const [isOpen, setIsOpen] = useState(true);
<Dialog isOpen={isOpen} onOpenChange={setIsOpen}>
  <Layout
    header={
      <DialogHeroHeader
        title="Welcome aboard"
        media={<img src={heroImage} alt="" width="100%" />}
        mediaMode="dark"
        onOpenChange={setIsOpen}
      />
    }
    content={<LayoutContent>Get started in three steps.</LayoutContent>}
    footer={
      <LayoutFooter hasDivider>
        <Button label="Get started" variant="primary" />
      </LayoutFooter>
    }
  />
</Dialog>`,
    },
    {
      label: 'Hidden title (media carries the message)',
      code: `<DialogHeroHeader
  title="Product tour"
  media={<AnnouncementIllustration />}
  isTitleHidden
  onOpenChange={setIsOpen}
/>`,
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      '像 DialogHeader 一样放入 Dialog 内 Layout 的 header 插槽。当对话框呈现精选、营销或引导场景，紧凑的 DialogHeader 不够醒目时使用。媒体自动延伸到对话框边缘，关闭按钮浮动在媒体的尾部上角。可见标题是默认的初始焦点目标；内联预览不会移动焦点。安装 @astryxdesign/lab@canary 和 @astryxdesign/core@canary，并导入两个包的 CSS。Lab API 可能在 canary 版本之间变化。',
    bestPractices: [
      {
        guidance: true,
        description:
          '让 mediaMode 与媒体的明暗匹配，保证浮动关闭按钮清晰可读：深色图片需要 mediaMode="dark"。',
      },
      {
        guidance: true,
        description:
          '让媒体内容填满插槽（图片用 width 100%）；插槽本身只负责定位和延伸。',
      },
      {
        guidance: true,
        description:
          '操作按钮（CTA）放在 LayoutFooter；hero 头部不提供操作插槽。',
      },
      {
        guidance: true,
        description:
          '当媒体已经在视觉上传达信息时使用 isTitleHidden；标题仍会为屏幕阅读器命名对话框。',
      },
      {
        guidance: false,
        description: '用于常规确认或表单；请改用紧凑的 DialogHeader。',
      },
      {
        guidance: false,
        description:
          '装饰性媒体缺少空 alt；纯装饰图片请使用 alt="" 让屏幕阅读器跳过。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'canary-only lab hero Dialog header: full-bleed media slot + title, close button overlaid on media (MediaTheme via mediaMode)',
  usage: {
    description:
      'High-emphasis sibling of DialogHeader for featured/marketing/onboarding dialogs. Drops into Layout header slot; media bleeds to dialog edges; title names the dialog; visible title is the default initial focus target. Import from @astryxdesign/lab and load core + lab CSS; install both packages at @canary.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Match mediaMode to the media luminance for close-button contrast.',
      },
      {
        guidance: true,
        description: 'Size media to fill the slot (width 100%).',
      },
      {guidance: true, description: 'Keep CTAs in LayoutFooter.'},
      {
        guidance: true,
        description:
          'Use isTitleHidden when the media carries the message; SR name is kept.',
      },
      {
        guidance: false,
        description: 'Use for routine confirmations/forms; use DialogHeader.',
      },
    ],
  },
};
