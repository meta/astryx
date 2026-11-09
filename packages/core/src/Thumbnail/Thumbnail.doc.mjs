// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Thumbnail',
  displayName: 'Thumbnail',
  category: 'Content',
  keywords: ["thumbnail","attachment","preview","image","upload","dismiss","remove","loading"],
  props: [
    {
      name: 'src',
      type: 'string',
      description: 'Image source URL.',
    },
    {
      name: 'alt',
      type: 'string',
      description: 'Alt text for the image. When omitted, the image is explicitly decorative (alt="", role="presentation", aria-hidden) and hidden from screen readers; a dev warning fires if neither alt nor label is set.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label (e.g. file name). Shown as tooltip on hover.',
    },
    {
      name: 'onRemove',
      type: '(e: React.MouseEvent) => void',
      description: 'Callback for the overlaid remove button.',
    },
    {
      name: 'onClick',
      type: '(e: React.MouseEvent) => void',
      description: 'Click handler. Adds button semantics and a hover overlay.',
    },
    {
      name: 'isLoading',
      type: 'boolean',
      description: 'Shows skeleton (no src) or upload overlay (with src).',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the thumbnail is disabled.',
      default: 'false',
    },
    {
      name: 'showRemoveOn',
      type: "'always' | 'hover'",
      description:
        'When the remove button is visible. `hover` (the default) reveals it on hover and on keyboard focus, and keeps it visible on any touch-capable device; `always` shows it at rest. Only applies when `onRemove` is set.',
      default: "'hover'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name for the root element. Prefer xstyle for styling; className is provided for integration with non-StyleX systems.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description: 'Inline styles for the root element. Prefer xstyle for styling; inline styles bypass StyleX optimization.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-thumbnail'},
    ],
    vars: [
      {name: '--_thumbnail-hit-inset', description: 'Outset of the remove button\'s invisible hit area, applied to a ::after overlay. 0 on a fine pointer; negative on a coarse one, which grows the 20px button to the 24px touch target without changing what is drawn.', default: '0px', private: true},
      {name: '--_press-overlay', description: 'Colour of the ::after interaction overlay for the hover and mouse states: transparent at rest, the hover overlay token on hover (hover-capable pointers), the pressed overlay token while a mouse holds `:active`. A press the touch press controller paints (`data-astryx-press`) is the overlay\'s image instead, at the press\'s strength, and the colour yields to it. Set on the card element by its own interaction arms.', default: 'transparent', private: true},
    ],
  },
  usage: {
    description:
      'Thumbnail displays a compact, square preview of an image attachment. It shows a shimmer effect while uploading, the image on success, and a placeholder icon when no source is set. Use it in chat composers, file upload lists, or anywhere you need a small image preview with optional remove and click actions.',
    bestPractices: [
      {guidance: true, description: 'Always provide a label prop with the file name so the thumbnail and its remove button are accessible to screen readers and show a tooltip on hover.'},
      {guidance: true, description: 'Use isLoading without a src to show a skeleton during initial upload, and isLoading with a src to show a spinner overlay once a preview URL is available.'},
      {guidance: true, description: 'Pair onClick with a lightbox or detail view so users can inspect the full image; the thumbnail adds button semantics and a hover overlay automatically.'},
      {guidance: false, description: "Don't use Thumbnail for non-image file types like PDFs or spreadsheets; use a file attachment component with an appropriate icon instead."},
      {guidance: false, description: "Don't omit alt text when a src is provided; screen readers need a description of the image content, not just the file name from label."},
    ],
    anatomy: [
      {name: 'Image', required: false, description: 'The preview image, displayed as a square with cover fit.'},
      {name: 'Placeholder', required: false, description: 'An image silhouette icon shown when no src is provided.'},
      {name: 'Remove button', required: false, description: 'An overlaid close button in the top-right corner. Appears when onRemove is set. Sits on a fixed --color-overlay scrim with an --color-on-dark icon to stay visible on any image.'},
      {name: 'Upload overlay', required: false, description: 'A semi-transparent overlay with a spinner, shown when isLoading is true and a src preview is available.'},
      {name: 'Skeleton', required: false, description: 'A shimmer animation shown when isLoading is true and no src is set.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  propDescriptions: {
    src: '\u56FE\u7247\u6E90 URL\u3002',
    alt: '\u56FE\u7247\u7684\u66FF\u4EE3\u6587\u672C\u3002\u7701\u7565\u65F6\u56FE\u7247\u4F1A\u88AB\u663E\u5F0F\u6807\u8BB0\u4E3A\u88C5\u9970\u6027\uFF08alt=""\u3001role="presentation"\u3001aria-hidden\uFF09\u5E76\u5BF9\u5C4F\u5E55\u9605\u8BFB\u5668\u9690\u85CF\uFF1B\u82E5 alt \u548C label \u5747\u672A\u8BBE\u7F6E\uFF0C\u5F00\u53D1\u73AF\u5883\u4F1A\u53D1\u51FA\u8B66\u544A\u3002',
    label: '\u65E0\u969C\u788D\u6807\u7B7E\uFF08\u5982\u6587\u4EF6\u540D\uFF09\u3002\u60AC\u505C\u65F6\u4EE5\u63D0\u793A\u5DE5\u5177\u663E\u793A\u3002',
    onRemove: '\u8986\u76D6\u5C42\u79FB\u9664\u6309\u94AE\u7684\u56DE\u8C03\u3002',
    onClick: '\u70B9\u51FB\u5904\u7406\u5668\u3002\u6DFB\u52A0\u6309\u94AE\u8BED\u4E49\u548C\u60AC\u505C\u8986\u76D6\u5C42\u3002',
    isLoading: '\u663E\u793A\u9AA8\u67B6\u5C4F\uFF08\u65E0 src\uFF09\u6216\u4E0A\u4F20\u8986\u76D6\u5C42\uFF08\u6709 src\uFF09\u3002',
    isDisabled: '\u662F\u5426\u7981\u7528\u7F29\u7565\u56FE\u3002',
    showRemoveOn: '\u4F55\u65F6\u663E\u793A\u79FB\u9664\u6309\u94AE\uFF1Ahover\uFF08\u9ED8\u8BA4\uFF0C\u60AC\u505C\u65F6\u4EE5\u53CA\u952E\u76D8\u805A\u7126\u65F6\u663E\u793A\uFF0C\u89E6\u6478\u8BBE\u5907\u4E0A\u4FDD\u6301\u53EF\u89C1\uFF09| always\uFF08\u59CB\u7EC8\u663E\u793A\uFF09\u3002\u4EC5\u5728\u8BBE\u7F6E onRemove \u65F6\u751F\u6548\u3002',
    xstyle: '\u7528\u4E8E\u5E03\u5C40\u81EA\u5B9A\u4E49\u7684 StyleX \u6837\u5F0F\u3002\u5FC5\u987B\u662F stylex.create() \u7684\u503C\uFF0C\u800C\u975E\u5185\u8054\u6837\u5F0F\u5BF9\u8C61\u3002',
    className: '\u6839\u5143\u7D20\u7684 CSS \u7C7B\u540D\u3002\u5EFA\u8BAE\u4F7F\u7528 xstyle\u3002',
    style: '\u6839\u5143\u7D20\u7684\u5185\u8054\u6837\u5F0F\u3002\u5EFA\u8BAE\u4F7F\u7528 xstyle\u3002',
    'data-testid': '\u7528\u4E8E\u81EA\u52A8\u5316\u6D4B\u8BD5\u6846\u67B6\u7684\u6D4B\u8BD5\u9009\u62E9\u5668\u3002',
  },
  usage: {
    description:
      'Thumbnail \u662F\u56FE\u7247\u9644\u4EF6\u7684\u65B9\u5F62\u9884\u89C8\u5361\u7247\u3002\u4E0A\u4F20\u65F6\u663E\u793A\u9AA8\u67B6\u5C4F\u52A8\u753B\uFF0C\u6210\u529F\u540E\u663E\u793A\u56FE\u7247\uFF0C\u672A\u8BBE\u7F6E\u6E90\u65F6\u663E\u793A\u5360\u4F4D\u56FE\u6807\u3002\u7528\u4E8E\u804A\u5929\u7F16\u8F91\u5668\u3001\u6587\u4EF6\u4E0A\u4F20\u5217\u8868\u6216\u4EFB\u4F55\u9700\u8981\u7D27\u51D1\u56FE\u7247\u9884\u89C8\u7684\u573A\u666F\u3002',
    bestPractices: [
      {guidance: true, description: '\u59CB\u7EC8\u63D0\u4F9B label \u5C5E\u6027\u5E76\u586B\u5199\u6587\u4EF6\u540D\uFF0C\u4EE5\u4FBF\u5C4F\u5E55\u9605\u8BFB\u5668\u80FD\u591F\u8BC6\u522B\u7F29\u7565\u56FE\u53CA\u5176\u79FB\u9664\u6309\u94AE\uFF0C\u5E76\u5728\u60AC\u505C\u65F6\u663E\u793A\u63D0\u793A\u3002'},
      {guidance: true, description: '\u4E0A\u4F20\u521D\u671F\u4F7F\u7528\u4E0D\u5E26 src \u7684 isLoading \u663E\u793A\u9AA8\u67B6\u5C4F\uFF1B\u83B7\u5F97\u9884\u89C8 URL \u540E\u4F7F\u7528\u5E26 src \u7684 isLoading \u663E\u793A\u65CB\u8F6C\u52A0\u8F7D\u8986\u76D6\u5C42\u3002'},
      {guidance: true, description: '\u5C06 onClick \u4E0E\u706F\u7BB1\u6216\u8BE6\u60C5\u89C6\u56FE\u914D\u5BF9\uFF0C\u4EE5\u4FBF\u7528\u6237\u67E5\u770B\u5B8C\u6574\u56FE\u7247\u2014\u2014\u7EC4\u4EF6\u4F1A\u81EA\u52A8\u6DFB\u52A0\u6309\u94AE\u8BED\u4E49\u548C\u60AC\u505C\u8986\u76D6\u5C42\u3002'},
      {guidance: false, description: '\u5BF9 PDF \u6216\u7535\u5B50\u8868\u683C\u7B49\u975E\u56FE\u7247\u6587\u4EF6\u7C7B\u578B\u4F7F\u7528 Thumbnail\u2014\u2014\u5E94\u4F7F\u7528\u5E26\u6709\u76F8\u5E94\u56FE\u6807\u7684\u6587\u4EF6\u9644\u4EF6\u7EC4\u4EF6\u3002'},
      {guidance: false, description: '\u63D0\u4F9B src \u65F6\u7701\u7565 alt \u6587\u672C\u2014\u2014\u5C4F\u5E55\u9605\u8BFB\u5668\u9700\u8981\u56FE\u7247\u5185\u5BB9\u7684\u63CF\u8FF0\uFF0C\u800C\u4E0D\u4EC5\u662F label \u4E2D\u7684\u6587\u4EF6\u540D\u3002'},
    ],
  },
};

export const docsDense = {
  description:
    'Square preview card for image attachments. Skeleton shimmer on upload, image on success, placeholder when no src.',
  usage: {
    description:
      'Compact square image preview. Shimmer while uploading, image on success, placeholder when empty. Use in chat composers, file lists, or small media previews.',
    bestPractices: [
      {guidance: true, description: 'Always set label (file name) for a11y; powers screen reader announce + hover tooltip.'},
      {guidance: true, description: 'isLoading w/o src \u2192 skeleton; isLoading w/ src \u2192 spinner overlay. Two distinct loading states.'},
      {guidance: true, description: 'onClick adds button semantics + hover overlay; pair with lightbox for full preview.'},
      {guidance: false, description: "Don't use for non-image files (PDF, xlsx); use file attachment component with icon instead."},
      {guidance: false, description: "Don't omit alt when src present; screen readers need image content description, not just label."},
    ],
  },
  propDescriptions: {
    src: 'Image source URL.',
    alt: 'Alt text for image. Omitted → explicitly decorative (alt="" + role="presentation" + aria-hidden); dev warn when src set with no alt and no label.',
    label: 'Accessible label (file name). Tooltip on hover, aria-label.',
    onRemove: '(e) => void. Overlaid remove button callback.',
    onClick: '(e) => void. Adds button semantics + hover overlay.',
    isLoading: 'Skeleton (no src) or upload overlay (with src). Default: false.',
    isDisabled: 'Disabled state. Default: false.',
    showRemoveOn: "When remove button shows: hover (default: reveal on hover/focus, stays visible on touch) | always. Only when onRemove set.",
    xstyle: 'stylex.create() for layout.',
    className: 'CSS class. Prefer xstyle.',
    style: 'Inline styles. Prefer xstyle.',
    'data-testid': 'Test selector.',
  },
};
