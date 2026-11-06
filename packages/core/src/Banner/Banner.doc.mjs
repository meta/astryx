// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Banner',
  displayName: 'Banner',
  category: 'Feedback & Status',
  keywords: ["banner","alert","notification","callout","notice","status","message","info","warning","error","success","toast"],
  usage: {
    description:
      'Banner shows a persistent message at the top of a page or section. Use it for form errors, system updates, maintenance notices, or success confirmations that the user needs to see until they act on it.',
    bestPractices: [
      {guidance: true, description: 'Pick a status that matches the message: info for updates, warning for caution, error for problems, success for confirmations.'},
      {guidance: true, description: 'Use the card container inside page content and the section container for full-width messages that span the entire page.'},
      {guidance: true, description: 'Make info and success banners dismissable. Keep error banners visible until the user fixes the issue.'},
      {guidance: true, description: 'Keep titles short and scannable: "Payment failed" not "There was a problem processing your most recent payment."'},
      {guidance: false, description: 'Use Banner for short-lived messages that disappear on their own; use Toast instead.'},
      {guidance: false, description: 'Stack multiple banners with the same status; combine related messages into one banner.'},
      {guidance: true, description: 'Set collapsible={false} when the user needs the content to act on the message, like the list of fields that failed validation. Keep the default toggle when the detail is long enough to bury the banner\'s own message.'},
      {guidance: true, description: 'Banner status controls color and icon only; it does not create a live region. Announce async outcomes from the transition handler with useAnnounce. Add an explicit role="status" only when the visible banner is intended as a persistent semantic mirror; reserve role="alert" for genuinely urgent, interruptive content.'},
      {guidance: false, description: 'Rely on the status color or icon alone to carry meaning; say which status it is in the title text, because the icon is decorative to a screen reader.'},
    ],
    anatomy: [
      {name: 'Banner frame', required: true, description: 'Outer frame that groups the status surface and optional content surface. It carries whole-banner elevation and, for elevated card banners, the radius that shapes that silhouette.'},
      {name: 'Status surface', required: true, description: 'The primary painted surface. It communicates status and contains the icon, title, description, actions, and controls.'},
      {name: 'Icon', required: true, description: 'Automatically set based on the status (info, warning, error, success).'},
      {name: 'Title', required: true, description: 'The main message. Always required.'},
      {name: 'Description', required: false, description: 'Additional detail below the title.'},
      {name: 'Action button', required: false, description: 'A button for the user to act on the message, like "Review" or "Retry".'},
      {name: 'Dismiss button', required: false, description: 'Lets the user close the banner. Enabled by setting isDismissable.'},
      {name: 'Content surface', required: false, description: 'Secondary surface for extra detail below the status surface, like a list of errors. Sits behind an expand/collapse toggle by default; set collapsible={false} to keep it visible.'},
    ],
  },

  examples: [
    {
      label: 'Announce an async outcome from its transition handler',
      code: `import {useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {useAnnounce} from '@astryxdesign/core/hooks';

function SaveSettings() {
  const announce = useAnnounce();
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  async function handleSave() {
    try {
      await saveSettings();
      setResult('success');
      announce('Settings saved');
    } catch {
      setResult('error');
      announce('Settings could not be saved');
    }
  }

  return (
    <>
      <Button label="Save settings" onClick={handleSave} />
      {result != null ? (
        <Banner
          status={result}
          title={result === 'success' ? 'Settings saved' : 'Save failed'}
        />
      ) : null}
    </>
  );
}`,
    },
  ],

  props: [
    {
      name: 'status',
      type: "'info' | 'warning' | 'error' | 'success'",
      description: 'Status type controlling icon and color.',
      required: true,
    },
    {
      name: 'title',
      type: 'ReactNode',
      description: 'Title text or ReactNode displayed in the header.',
      required: true,
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: 'Description text rendered below the title in the header.',
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Override the default status icon.',
      slotElements: [{__element: 'Icon', props: {icon: 'check', size: 'sm'}}],
    },
    {
      name: 'isDismissable',
      type: 'boolean',
      description: 'Whether the banner can be dismissed by the user.',
      default: 'false',
    },
    {
      name: 'onDismiss',
      type: '() => void',
      description:
        'Called when the dismiss button is clicked; banner hides itself regardless of whether this is provided.',
    },
    {
      name: 'dismissLabel',
      type: 'string',
      description:
        'Accessible name and visible tooltip for the dismiss button (pass it already translated). Defaults to "Dismiss <title>" for a string title, so stacked banners are distinguishable; set it when the title is a ReactNode.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Action content rendered in the header area, end-aligned. Wraps to its own row below the text when the header is too narrow to hold both.',
      slotElements: [
        {__element: 'Icon', props: {icon: 'chevronDown', size: 'sm'}},
        {__element: 'Badge', props: {label: '3'}},
      ],
    },
    {
      name: 'container',
      type: "'card' | 'section'",
      description:
        'Container type: card has border-radius; section is full-width with no border-radius for page-level use.',
      default: "'card'",
    },
    {
      name: 'elevation',
      type: "'none' | 'low' | 'med' | 'high'",
      description:
        'Resting shadow depth. Use for a floating banner that hovers above content; `none` is the default inline banner. A `card`-container banner rounds its shadow to match.',
      default: "'none'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Content rendered in the card-background area below the colored header. Sits behind an expand/collapse toggle unless `collapsible={false}`.',
    },
    {
      name: 'collapsible',
      type: 'boolean | {defaultIsOpen?: boolean; isOpen?: boolean; onOpenChange?: (isOpen: boolean) => void}',
      description:
        'Whether the content area (children) sits behind an expand/collapse toggle in the header. On by default, starting collapsed. `false` opts out: children are always visible with no toggle. `{defaultIsOpen: true}` starts open; `{isOpen, onOpenChange}` is controlled. Takes the same CollapsibleConfig as Collapsible.',
      default: 'true',
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
      title: 'System maintenance scheduled',
      description: 'The platform will be briefly unavailable on Sunday from 2–4 AM PST.',
      status: 'info',
    },
  },
  theming: {
    targets: [
      {className: 'astryx-banner-frame', visualProps: ['container', 'elevation']},
      {className: 'astryx-banner', visualProps: ['container', 'status']},
      {className: 'astryx-banner-icon', visualProps: ['status']},
      {className: 'astryx-banner-description'},
      {className: 'astryx-banner-content', visualProps: ['container', 'status']},
    ],
    vars: [
      {name: '--_banner-radius', description: 'Border radius of the card container (header, content area and the elevated root silhouette)', default: 'var(--radius-container)', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_banner-radius']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Banner',
  displayName: 'Banner',
  usage: {
    description:
      'Banner shows a persistent message at the top of a page or section. Use it for form errors, system updates, maintenance notices, or success confirmations that the user needs to see until they act on it.',
    bestPractices: [
      {guidance: true, description: 'Pick a status that matches the message: info for updates, warning for caution, error for problems, success for confirmations.'},
      {guidance: true, description: 'Use the card container inside page content and the section container for full-width messages that span the entire page.'},
      {guidance: true, description: 'Make info and success banners dismissable. Keep error banners visible until the user fixes the issue.'},
      {guidance: true, description: 'Keep titles short and scannable: "Payment failed" not "There was a problem processing your most recent payment."'},
      {guidance: false, description: 'Use Banner for short-lived messages that disappear on their own; use Toast instead.'},
      {guidance: false, description: 'Stack multiple banners with the same status; combine related messages into one banner.'},
      {guidance: true, description: 'Banner 的 status 仅控制颜色和图标，不创建实时区域。异步结果应在实际的状态转换处理函数中调用 useAnnounce。仅当可见 Banner 需要作为持久语义镜像时显式添加 role="status"；只有真正紧急、需要打断当前朗读的内容才使用 role="alert"。'},
      {guidance: false, description: '不要只依赖 status 的颜色或图标传达含义；请在标题文本中明确说明状态，因为屏幕阅读器会忽略这个装饰性图标。'},
    ],
    anatomy: [
      {name: 'Banner frame', required: true, description: 'Outer frame that groups the status surface and optional content surface. It carries whole-banner elevation and, for elevated card banners, the radius that shapes that silhouette.'},
      {name: 'Status surface', required: true, description: 'The primary painted surface. It communicates status and contains the icon, title, description, actions, and controls.'},
      {name: 'Icon', required: true, description: 'Automatically set based on the status (info, warning, error, success).'},
      {name: 'Title', required: true, description: 'The main message. Always required.'},
      {name: 'Description', required: false, description: 'Additional detail below the title.'},
      {name: 'Action button', required: false, description: 'A button for the user to act on the message, like "Review" or "Retry".'},
      {name: 'Dismiss button', required: false, description: 'Lets the user close the banner. Enabled by setting isDismissable.'},
      {name: 'Content surface', required: false, description: 'Secondary surface for extra detail below the status surface, like a list of errors. Sits behind an expand/collapse toggle by default; set collapsible={false} to keep it visible.'},
    ],
  },
  props: [
    {name: 'status', type: "'info' | 'warning' | 'error' | 'success'", description: '状态类型，控制图标和颜色。', required: true},
    {name: 'title', type: 'ReactNode', description: '显示在头部的标题文本或 ReactNode。', required: true},
    {name: 'description', type: 'ReactNode', description: '渲染在头部标题下方的描述文本。'},
    {name: 'icon', type: 'ReactNode', description: '覆盖默认的状态图标。'},
    {name: 'isDismissable', type: 'boolean', description: '横幅是否可被用户关闭。', default: 'false'},
    {name: 'onDismiss', type: '() => void', description: '点击关闭按钮时调用；无论是否提供此回调，横幅都会自动隐藏。'},
    {name: 'dismissLabel', type: 'string', description: '关闭按钮的无障碍名称和可见工具提示（请传入已翻译的字符串）。字符串标题默认生成“关闭 <标题>”；富文本标题请设置此属性。'},
    {name: 'endContent', type: 'ReactNode', description: '渲染在头部区域末端对齐的操作内容，通常是按钮或链接。头部过窄时会整体换行到文本下方，自成一行。'},
    {name: 'container', type: "'card' | 'section'", description: '视觉变体：card 带圆角；section 无圆角全宽，适用于页面级场景。', default: "'card'"},
    {name: 'elevation', type: "'none' | 'low' | 'med' | 'high'", description: '静止阴影深度。用于悬浮于内容之上的浮动横幅；none 为默认内联横幅。', default: "'none'"},
    {name: 'children', type: 'ReactNode', description: '渲染在彩色头部下方卡片背景区域的内容。默认位于展开/折叠开关之后，除非设置 collapsible={false}。'},
    {name: 'collapsible', type: 'boolean | {defaultIsOpen?: boolean; isOpen?: boolean; onOpenChange?: (isOpen: boolean) => void}', description: '内容区域（children）是否位于头部的展开/折叠开关之后。默认开启，且初始为折叠状态。false 表示关闭：内容始终可见且没有开关。{defaultIsOpen: true} 表示初始展开；{isOpen, onOpenChange} 为受控模式。与 Collapsible 使用同一套 CollapsibleConfig。', default: 'true'},
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（外边距、定位、尺寸）。必须是 stylex.create() 的值，而非内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-banner-frame',
        visualProps: [
          'container',
          'elevation',
        ],
      },
      {
        className: 'astryx-banner',
        visualProps: [
          'container',
          'status',
        ],
      },
      {
        className: 'astryx-banner-icon',
        visualProps: [
          'status',
        ],
      },
      {
        className: 'astryx-banner-description',
      },
      {
        className: 'astryx-banner-content',
        visualProps: [
          'container',
          'status',
        ],
      },
    ],
    vars: [
      {name: '--_banner-radius', description: 'Border radius of the card container (header, content area and the elevated root silhouette)', default: 'var(--radius-container)', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_banner-radius']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'persistent message for errors, updates, warnings, or confirmations',
  usage: {
    description:
      'Banner shows a persistent message at the top of a page or section. Use for form errors, system updates, maintenance notices, or success confirmations.',
    bestPractices: [
      {guidance: true, description: 'Match status to message: info for updates, warning for caution, error for problems, success for confirmations.'},
      {guidance: true, description: 'Card container for inline content, section container for full-width page-level messages.'},
      {guidance: true, description: 'Make info/success dismissable. Keep error banners until the issue is fixed.'},
      {guidance: true, description: 'Keep titles short: "Payment failed" not "There was a problem processing your payment."'},
      {guidance: false, description: 'Use for auto-dismissing messages; use Toast instead.'},
      {guidance: false, description: 'Stack multiple banners of the same status; combine into one.'},
      {guidance: true, description: 'Status controls color + icon only; Banner is non-live by default. Announce async outcomes from the transition handler with useAnnounce. Add role="status" only for a persistent semantic mirror; reserve role="alert" for genuinely urgent interruption.'},
      {guidance: false, description: 'Rely on status color or icon alone; state the status in the title text, since the icon is decorative to a screen reader.'},
    ],
    anatomy: [
      {name: 'Banner frame', required: true, description: 'Outer frame grouping the status and optional content surfaces; owns whole-banner elevation and its elevated-card silhouette.'},
      {name: 'Status surface', required: true, description: 'Primary painted surface communicating status and containing the message and controls.'},
      {name: 'Icon', required: true, description: 'Set automatically from status.'},
      {name: 'Title', required: true, description: 'Main message text.'},
      {name: 'Description', required: false, description: 'Detail below title.'},
      {name: 'Action button', required: false, description: 'CTA like Review or Retry.'},
      {name: 'Dismiss button', required: false, description: 'Close button via isDismissable.'},
      {name: 'Content surface', required: false, description: 'Secondary detail surface; behind a toggle unless collapsible={false}.'},
    ],
  },
  propDescriptions: {
    status: 'controls icon+color',
    title: 'title text/ReactNode in header',
    description: 'text below title in header',
    icon: 'override default status icon',
    isDismissable: 'user can dismiss banner',
    onDismiss: 'dismiss callback; banner self-hides regardless',
    dismissLabel:
      'a11y name + visible tooltip for dismiss; defaults to "Dismiss <title>"',
    endContent: 'end-aligned action in header, typically button/link; wraps to its own row when the header is too narrow',
    container: 'card=border-radius; section=full-width no radius for page-level',
    elevation: 'resting shadow depth: none|low|med|high; raise for a floating banner',
    children: 'content in card-bg area below colored header; behind a toggle unless collapsible={false}',
    collapsible: 'children behind a header toggle; default true=collapsed. false=always visible, no toggle. {defaultIsOpen:true}=starts open, {isOpen,onOpenChange}=controlled',
    xstyle: 'StyleX layout customization via stylex.create()',
  },
};
