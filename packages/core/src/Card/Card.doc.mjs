// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Card',
  displayName: 'Card',
  group: 'Card',
  category: 'Container',
  keywords: ["card","surface","panel","container","elevated","shadow","box","paper","tile","well"],
  usage: {
    description:
      'Card is a bordered, elevated container for discrete, self-contained items: things you could reorder, remove, or interact with independently. Cards are NOT the default layout tool. Most content groups don\'t need a container at all; spacing and alignment create visual grouping naturally. Only reach for a Card when items need clear interaction boundaries or visual comparison in a grid.',
    bestPractices: [
      {guidance: true, description: 'Ask "could I reorder or remove this independently?" If yes, it\'s a card. If no, it\'s just a section of the page: use a heading + Stack or Section.'},
      {guidance: true, description: 'Use cards for discrete items: a single user profile, a single notification, a single metric, a product in a grid. Each card represents one "thing" with clear interaction boundaries.'},
      {guidance: true, description: 'Spacing and alignment alone create visual grouping. Not everything needs a container; try removing the card and see if the grouping is still clear from whitespace and typography.'},
      {guidance: true, description: 'Keep padding consistent across sibling cards so they align visually in a grid or list.'},
      {guidance: true, description: 'Pair a card with Layout when you need a structured header, scrollable content, and footer with actions.'},
      {guidance: true, description: 'Let cards share a row or grid on a phone: a card shrinks to fit its track and clips content that cannot wrap at its edge. Truncate long IDs, hashes, and URLs with Text maxLines={1} (the full value shows in a tooltip), and give wide content its own scroll region: Table scrolls by itself; put code or other wide content in a ScrollableArea.'},
      {guidance: false, description: 'Default to cards for visual grouping. A heading + Stack with proper spacing creates hierarchy without adding borders everywhere. Cards should be the exception, not the default.'},
      {guidance: false, description: 'Wrap page sections in cards. "General Settings", "Notification Preferences", form groups: these are page regions, use Section or heading + stack.'},
      {guidance: false, description: 'Create identical card grids (icon + heading + text, repeated). Vary the layout or question whether cards are needed at all.'},
      {guidance: false, description: 'Nest cards inside other cards; flatten the hierarchy or use spacing and dividers instead.'},
      {guidance: false, description: 'Use color variants for status; use Banner or Badge for that. Color cards are for categorization.'},
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'The outer box with border, background, border-radius, and padding.'},
      {name: 'Content', required: true, description: 'Any children rendered inside the card. Often a stack of heading, text, and actions.'},
    ],
  },
  props: [
    {
      name: 'width',
      type: 'SizeValue',
      description: 'Width of the card (number = pixels, string = used as-is). In a flex row or grid track this is the preferred width: the card shrinks below it when the row is narrower. To hold the width in a flex row, wrap the card in StackItem (static by default) and let the row wrap or scroll. In Grid, set a consumer minWidth on the Card and size the track accordingly.',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description: 'Height of the card (number = pixels, string = used as-is).',
    },
    {
      name: 'maxWidth',
      type: 'SizeValue',
      description: 'Maximum width of the card.',
    },
    {
      name: 'minHeight',
      type: 'SizeValue',
      description: 'Minimum height of the card.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content to render inside the card.',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        "Internal padding using the spacing scale. Omit it and the card takes the theme's card padding rather than a step, so passing a step is a decision to override the theme, not a way to restate the default.",
      default: "the theme's card padding (spacing step 4 with no theme)",
    },
    {
      name: 'variant',
      type: "'default' | 'transparent' | 'muted' | 'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'",
      description:
        'Background color variant. `default` uses the standard card background. `transparent` drops the background entirely. `muted` uses the muted background for de-emphasised cards. The non-semantic variants use the corresponding `--color-background-<name>` token.',
      default: "'default'",
    },
    {
      name: 'elevation',
      type: "'none' | 'low' | 'med' | 'high'",
      description:
        'Resting shadow depth. `none` is flat; `low`/`med`/`high` map to the shadow token scale. Raise a card only when it needs to float above surrounding content.',
      default: "'none'",
    },
  ],
  examples: [
    {
      label: 'Cards sharing a row on a phone, with long IDs',
      code: `
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/VStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';

const payouts = [
  {label: 'Payout', amount: '$1,240.00', id: 'po_1Q8ZK4X7M2N5P3R6T9V1W4YB'},
  {label: 'Refund', amount: '-$86.50', id: 're_3NfK9Lm2Qx7Vb4Tz8Rw1Hy6C'},
  {label: 'Adjustment', amount: '$12.00', id: 'adj_7Hq2Wm9Kx4Lz8Vn3Rb6Tf1PD'},
];

// Each card takes one grid track and shrinks with it, so three cards fit a
// 390px phone without widening the page. The ID cannot wrap, so it truncates
// with maxLines={1} (the full value shows in a tooltip) instead of running
// past the card edge.
function PayoutCards() {
  return (
    <Grid columns={3} gap={3}>
      {payouts.map(payout => (
        <Card key={payout.id}>
          <VStack gap={1}>
            <Heading level={3}>{payout.label}</Heading>
            <Text hasTabularNumbers>{payout.amount}</Text>
            <Text type="supporting" maxLines={1}>
              {payout.id}
            </Text>
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}
`,
    },
  ],
  playground: {
    defaults: {
      children: {
        __element: 'VStack',
        props: {gap: 2},
        children: [
          {__element: 'Heading', props: {level: 3}, children: 'Card Title'},
          {__element: 'Text', props: {type: 'body'}, children: 'Card content goes here. This is a standard card with a heading and body text.'},
        ],
      },
    },
  },
  theming: {
    container: true,
    targets: [
      {className: 'astryx-card', visualProps: ['variant', 'elevation']},
    ],
    vars: [
      {name: '--_card-radius', description: 'Border radius of the card', default: 'var(--radius-container)', private: true},
      {name: '--_card-elevation', description: 'Resting shadow of the card, set from the elevation prop. Composed into the card box-shadow list alongside --_card-ring rather than written as boxShadow directly, so a ring and an elevation can coexist.', default: '0 0 transparent', private: true},
      {name: '--_card-ring', description: 'Inset ring drawn in the card box-shadow list. SelectableCard sets it to show selection without taking over the shadow.', default: '0 0 transparent', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_card-radius']},
      {property: 'padding', expand: 'container'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Card',
  displayName: 'Card',
  usage: {
    description:
      'Card is a bordered, elevated container for discrete, self-contained items: things you could reorder, remove, or interact with independently. Cards are NOT the default layout tool. Most content groups don\'t need a container at all; spacing and alignment create visual grouping naturally. Only reach for a Card when items need clear interaction boundaries or visual comparison in a grid.',
    bestPractices: [
      {guidance: true, description: 'Ask "could I reorder or remove this independently?" If yes, it\'s a card. If no, it\'s just a section of the page: use a heading + Stack or Section.'},
      {guidance: true, description: 'Use cards for discrete items: a single user profile, a single notification, a single metric, a product in a grid. Each card represents one "thing" with clear interaction boundaries.'},
      {guidance: true, description: 'Spacing and alignment alone create visual grouping. Not everything needs a container; try removing the card and see if the grouping is still clear from whitespace and typography.'},
      {guidance: true, description: 'Keep padding consistent across sibling cards so they align visually in a grid or list.'},
      {guidance: true, description: 'Pair a card with Layout when you need a structured header, scrollable content, and footer with actions.'},
      {guidance: true, description: 'Let cards share a row or grid on a phone: a card shrinks to fit its track and clips content that cannot wrap at its edge. Truncate long IDs, hashes, and URLs with Text maxLines={1} (the full value shows in a tooltip), and give wide content its own scroll region: Table scrolls by itself; put code or other wide content in a ScrollableArea.'},
      {guidance: false, description: 'Default to cards for visual grouping. A heading + Stack with proper spacing creates hierarchy without adding borders everywhere. Cards should be the exception, not the default.'},
      {guidance: false, description: 'Wrap page sections in cards. "General Settings", "Notification Preferences", form groups: these are page regions, use Section or heading + stack.'},
      {guidance: false, description: 'Create identical card grids (icon + heading + text, repeated). Vary the layout or question whether cards are needed at all.'},
      {guidance: false, description: 'Nest cards inside other cards; flatten the hierarchy or use spacing and dividers instead.'},
      {guidance: false, description: 'Use color variants for status; use Banner or Badge for that. Color cards are for categorization.'},
    ],
    anatomy: [
      {name: 'Container', required: true, description: 'The outer box with border, background, border-radius, and padding.'},
      {name: 'Content', required: true, description: 'Any children rendered inside the card. Often a stack of heading, text, and actions.'},
    ],
  },
  props: [
    {name: 'width', type: 'SizeValue', description: '卡片宽度（数字 = 像素，字符串 = 按原样使用）。'},
    {name: 'height', type: 'SizeValue', description: '卡片高度（数字 = 像素，字符串 = 按原样使用）。'},
    {name: 'maxWidth', type: 'SizeValue', description: '卡片最大宽度。'},
    {name: 'minHeight', type: 'SizeValue', description: '卡片最小高度。'},
    {name: 'children', type: 'ReactNode', description: '在卡片内部渲染的内容。'},
    {name: 'padding', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: '使用间距比例的内边距。省略时，卡片采用主题的卡片内边距，而不是某个步进值；传入步进值意味着覆盖主题，而不是复述默认值。', default: "the theme's card padding (spacing step 4 with no theme)"},
    {name: 'variant', type: "'default' | 'transparent' | 'muted' | 'blue' | 'cyan' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'teal' | 'yellow'", description: '背景颜色变体。`default` 使用标准卡片背景；`transparent` 完全去掉背景；`muted` 使用弱化卡片的柔和背景。非语义变体使用对应的 `--color-background-<name>` 令牌。', default: "'default'"},
    {name: 'elevation', type: "'none' | 'low' | 'med' | 'high'", description: '静止阴影深度。`none` 为扁平；`low`/`med`/`high` 对应阴影令牌比例。', default: "'none'"},
  ],
  theming: {
    container: true,
    targets: [
      {className: 'astryx-card', visualProps: ['variant', 'elevation']},
    ],
    vars: [
      {name: '--_card-radius', description: 'Border radius of the card', default: 'var(--radius-container)', private: true},
      {name: '--_card-elevation', description: 'Resting shadow of the card, set from the elevation prop.', default: '0 0 transparent', private: true},
      {name: '--_card-ring', description: 'Inset ring drawn in the card box-shadow list.', default: '0 0 transparent', private: true},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_card-radius']},
      {property: 'padding', expand: 'container'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'bordered container for DISCRETE items; NOT the default layout tool. Most content doesn\'t need a card.',
  usage: {
    description:
      'Card is for discrete items with clear interaction boundaries (one profile, one notification, one product). Cards are NOT the default. Spacing and alignment create visual grouping without borders. Ask: "could I reorder or remove this independently?" If no, don\'t use a card.',
    bestPractices: [
      {guidance: true, description: 'Ask "could I reorder/remove this independently?" If yes, it\'s a card. If no, it\'s just a page section: use heading + Stack or Section.'},
      {guidance: true, description: 'Use cards for discrete items: one profile, one notification, one metric, one product in a grid. Each card = one "thing" w/ clear interaction boundaries.'},
      {guidance: true, description: 'Spacing + alignment alone create visual grouping. Not everything needs a container; try removing the card; if grouping still reads from whitespace + typography, skip it.'},
      {guidance: true, description: 'Keep padding consistent across sibling cards so they align visually in a grid or list.'},
      {guidance: true, description: 'Pair a card w/ Layout when you need a structured header, scrollable content, and footer with actions.'},
      {guidance: true, description: 'Card shrinks to its row/grid track, clips unwrappable content at its edge. Long IDs/hashes/URLs → Text maxLines={1} (tooltip shows full value). Wide content → own scroll region (Table scrolls itself; ScrollableArea otherwise).'},
      {guidance: false, description: 'Default to cards for grouping. Heading + Stack w/ proper spacing creates hierarchy w/o borders everywhere. Cards are the exception, not the default.'},
      {guidance: false, description: 'Wrap page sections in cards. "General Settings", "Notification Preferences", form groups are page regions; use Section or heading + stack.'},
      {guidance: false, description: 'Create identical card grids (icon + heading + text, repeated). Vary the layout or question whether cards are needed at all.'},
      {guidance: false, description: 'Nest cards inside other cards; flatten the hierarchy or use spacing + dividers instead.'},
      {guidance: false, description: 'Use color variants for status; use Banner or Badge for that instead. Color cards are for categorization.'},
    ],
  },
  propDescriptions: {
    width: 'card width (number=px, string=as-is)',
    height: 'card height (number=px, string=as-is)',
    maxWidth: 'max card width',
    minHeight: 'min card height',
    children: 'content inside card',
    padding: "internal padding via spacing scale; omitted = the theme's card padding, NOT a fixed step. Passing a step overrides the theme.",
    variant: 'background color variant; `default` = standard card bg, `transparent` = no background at all, `muted` = muted bg for de-emphasised cards; non-semantic variants use the corresponding `--color-background-<name>` token',
    elevation: 'resting shadow depth: none (flat) | low | med | high (shadow token scale). Raise only to float above content.',
  },
};
