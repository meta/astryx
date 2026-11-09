// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling/styling-basics`: overview of styling approaches,
 * xstyle prop, Tailwind integration, className/style props, and rest props.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'styling-basics',
  title: 'Basics',
  placement: {parent: 'namespace:styling', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Overview of styling approaches, xstyle prop, Tailwind integration, className/style props, and rest props.',
  keywords: [
    'style',
    'rest props',
    'data-testid',
    'ref',
  ],

  sections: [
    {
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'Style components with `xstyle` (StyleX), `className` (Tailwind or your own CSS), or a styling library aliased to Astryx tokens. All of them resolve to the same tokens.',
        },
        {
          type: 'table',
          headers: ['Approach', 'Use for', 'Example'],
          rows: [
            ['StyleX', 'Component-specific overrides, reusable styles, pseudo-classes, and typed tokens', '`const styles = stylex.create(...); <Button xstyle={styles.save} />`'],
            ['Tailwind utilities', 'Page layout, wrappers, and utility styling', '`className="flex gap-3 p-4"`'],
            ['className', 'Integrating with external CSS or Tailwind on components', '`className="my-card shadow-lg"`'],
            ['Styling-library token aliases', 'Keeping Panda, Chakra, MUI, Emotion, styled-components, UnoCSS, CSS Modules, or Sass in sync with the system', "`colors.surface = 'var(--color-background-surface)'`"],
          ],
        },
        {
          type: 'prose',
          text: 'Theming and dark mode work whichever you choose. For external styling libraries, see {@link namespace:styling-libraries}; it covers Tailwind, StyleX, Panda, Chakra, MUI, CSS-in-JS, CSS Modules, Sass, and `useTheme()` for non-CSS processing.',
        },
      ],
    },
    {
      title: 'xstyle Prop',
      content: [
        {
          type: 'prose',
          text: 'Every component accepts an `xstyle` prop for style customization. It accepts StyleX styles created via `stylex.create()`, not inline objects or class name strings. StyleX styles are compiled at build time for optimal deduplication and dead-code elimination.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Simple overrides',
          code: `import * as stylex from '@stylexjs/stylex';

const overrides = stylex.create({
  card: { maxWidth: 400, marginBlock: 16 },
  saveButton: { alignSelf: 'flex-end' },
});

<Card xstyle={overrides.card} />
<Button label="Save" xstyle={overrides.saveButton} />`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Pseudo-classes and conditional styles',
          code: `import * as stylex from '@stylexjs/stylex';

const overrides = stylex.create({
  card: {
    boxShadow: {
      default: 'none',
      ':hover': { '@media (hover: hover)': '0 4px 12px rgba(0,0,0,0.1)' },
    },
  },
});

<Card xstyle={overrides.card}>...</Card>`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'All xstyle values must come from stylex.create()',
            'Pseudo-classes (:hover, :focus-visible) are supported inside stylex.create',
            'All :hover styles MUST use @media (hover: hover) guard',
            'For non-StyleX styling (Tailwind, external CSS), use className instead',
          ],
        },
      ],
    },
    {
      title: 'Tailwind Integration',
      content: [
        {
          type: 'prose',
          text: 'The package ships a Tailwind v4 theme bridge that maps all design tokens to Tailwind utility classes. Import it once and use Tailwind classes backed by design tokens: colors, spacing, radius, shadows, and typography all resolve to the active theme.',
        },
        {
          type: 'prose',
          text: 'For the imports and the cascade-layer order to put in your global CSS, see {@link generic:tailwind}.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Tailwind utilities alongside components',
          code: `<div className="text-primary bg-surface rounded-lg p-4 flex gap-3">
  <Button label="Save" variant="primary" />
  <Button label="Cancel" variant="secondary" />
</div>`,
        },
        {
          type: 'prose',
          text: 'The bridge is pure CSS with zero JS. Theme changes (dark mode, custom themes) apply automatically because the utilities reference the same CSS custom properties that components use. This is the paved Tailwind path; for other styling libraries that follow the same aliasing pattern, see {@link namespace:styling-libraries}.',
        },
      ],
    },
    {
      title: 'className and style Props',
      content: [
        {
          type: 'prose',
          text: 'Every component also accepts standard `className` and `style` props. `className` is appended after the component\'s own classes. `style` is merged after StyleX inline styles, so consumer values win on conflict.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'className with Tailwind utilities',
          code: `<Card className="shadow-lg hover:shadow-xl transition-shadow">
  ...
</Card>
<Button label="Save" className="my-app-save-btn" />`,
        },
        {
          type: 'prose',
          text: 'For layout and wrapper styling, Tailwind utilities on className work well. For component-specific overrides (padding, colors, borders), prefer xstyle; it integrates with StyleX deduplication and the component\'s internal style pipeline.',
        },
      ],
    },
    {
      title: 'Rest Props (Prop Drilling)',
      content: [
        {
          type: 'prose',
          text: 'Components extend HTML attributes and spread rest props onto their root DOM element. This means data-* attributes, aria-* attributes, event handlers, and other HTML props pass through automatically.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Data attributes, event handlers, and ARIA',
          code: `<Card
  data-testid="user-card"
  data-user-id={user.id}
  onMouseEnter={handleHover}
  aria-label="User profile card"
>
  ...
</Card>`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Ref forwarding',
          code: `const cardRef = useRef<HTMLDivElement>(null);
<Card ref={cardRef}>...</Card>`,
        },
        {
          type: 'prose',
          text: 'A few HTML attributes are intentionally omitted from the base type (contentEditable, dangerouslySetInnerHTML). children is not in the base type either; components that accept children declare it explicitly, so slot-based components don\'t silently drop JSX children.',
        },
      ],
    },
  ],
};
