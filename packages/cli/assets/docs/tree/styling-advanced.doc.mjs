// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling/styling-advanced`: compound component styling,
 * data-attribute selectors, deprecated bare classes, and what not to do.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'styling-advanced',
  title: 'Advanced',
  placement: {parent: 'namespace:styling', slot: 'guides', order: 20},
  category: 'guide',
  description:
    'Compound component styling, data-attribute selectors, migrating removed theme compatibility selectors, and common anti-patterns.',
  keywords: [
    'compound',
    'data attributes',
    'removed classes',
    'selector',
    'astryx-button',
    'data-variant',
  ],

  sections: [
    {
      title: 'Compound Components',
      content: [
        {
          type: 'prose',
          text: 'Complex components are composed from smaller components. Each sub-component accepts its own xstyle, className, and rest props. You style the parts individually; there\'s no single "drill into sub-part" prop.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Dialog with individually styled parts',
          code: `import * as stylex from '@stylexjs/stylex';

const overrides = stylex.create({
  dialog: { maxWidth: 500 },
  content: { gap: 'var(--spacing-4)' },
});

<Dialog isOpen={isOpen} onOpenChange={close} xstyle={overrides.dialog}>
  <Layout
    header={
      <LayoutHeader hasDivider>
        <Heading level={2}>Edit Profile</Heading>
      </LayoutHeader>
    }
    content={
      <LayoutContent xstyle={overrides.content}>
        <TextInput label="Name" value={name} onChange={setName} />
      </LayoutContent>
    }
    footer={
      <LayoutFooter hasDivider>
        <Button label="Cancel" variant="secondary" onClick={close} />
        <Button label="Save" variant="primary" onClick={save} />
      </LayoutFooter>
    }
  />
</Dialog>`,
        },
        {
          type: 'prose',
          text: 'The pattern: the parent component (Dialog) controls structure and behavior, child components (Layout, Header, Button) control their own appearance. Style each piece where it lives.',
        },
      ],
    },
    {
      id: 'preferred-selector-surface-data-attributes',
      title: 'Data attribute selectors',
      content: [
        {
          type: 'prose',
          text: 'When external CSS needs to target an Astryx component by prop or state, combine the stable component class with reflected data attributes. The component class identifies the component (`.astryx-button`, `.astryx-card`); data attributes identify the axis and value (`data-variant`, `data-size`, `data-level`, etc.). This is the preferred selector surface for new CSS because it is explicit and collision-resistant.',
        },
        {
          type: 'code',
          lang: 'css',
          code: `.my-app .astryx-button[data-variant="primary"] {
  /* primary buttons in this app context */
}

.my-app .astryx-button[data-variant="primary"][data-size="sm"] {
  /* small primary buttons */
}

.my-app .astryx-heading[data-level="2"] {
  /* level 2 headings; numeric values stay literal in data attrs */
}`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'What components reflect',
          code: `// <Button variant="primary" size="sm" />
// preferred selector attrs: data-variant="primary" data-size="sm"

// <Card variant="elevated" />
// preferred selector attrs: data-variant="elevated"

// <Heading level={2} />
// preferred selector attrs: data-level="2"`,
        },
        {
          type: 'prose',
          text: 'For systematic theming, use defineTheme component overrides instead of raw CSS selectors. defineTheme keeps the higher-level `prop:value` API (`variant:primary`, `size:sm`) and handles selector generation for you. Run {@link generic:author-a-theme} for component theming.',
        },
      ],
    },
    {
      id: 'deprecated-classes',
      title: 'Migrating Removed Theme Compatibility Selectors',
      content: [
        {
          type: 'prose',
          text: 'Astryx 0.7 emits canonical `astryx-*` target classes and reflected `data-*` attributes only. Run `{@command upgrade --from <your 0.6 version> --apply --path .}` to rename removed target keys inside theme `components` maps and to migrate CSS selectors. The CSS migration renames removed target classes and replaces target-qualified bare prop/value/state classes such as `.primary`, `.sm`, `.level-2`, and `.checked` with their reflected `data-*` selectors.',
        },
        {
          type: 'code',
          lang: 'css',
          code: `/* Before */
.astryx-progressbar.success > .astryx-progressbar-mark.fill {}
.astryx-selector-clear-icon { color: red; }

/* After */
.astryx-progress-bar:is([data-variant="success"]) >
  .astryx-progress-bar-mark:is([data-placement="fill"]) {}
.astryx-input-clear-icon:where(.astryx-selector *) { color: red; }`,
        },
        {
          type: 'prose',
          text: 'Removed target mappings: `base-table` → `table`; `checkbox` → `checkbox-indicator`; `codeblock` → `code-block`; `codeblock-copy-button` → `code-block-copy-button`; `codeblock-header` → `code-block-header`; `codeblock-title` → `code-block-title`; `date-input-clear-icon`, `date-range-input-clear-icon`, `multi-selector-clear-icon`, and `selector-clear-icon` → `input-clear-icon`; `hovercard` → `hover-card`; `navicon` → `nav-icon`; `popover-surface` → `popover`; `progressbar`, `progressbar-fill`, `progressbar-mark`, and `progressbar-track` → their hyphenated `progress-bar*` forms; `radio` → `radio-indicator`; `radio-dot` → `radio-indicator-dot`; `statusdot` → `status-dot`; `textarea` → `text-area`.',
        },
        {
          type: 'prose',
          text: '`input-clear-icon` styles the clear icon of every input. In CSS the upgrade keeps each old clear-icon rule on its component with `:where(.astryx-<component> *)`. A theme key cannot carry that scope, so the upgrade renames the key and adds a `TODO(astryx upgrade)` that names the CSS selector to use instead.',
        },
        {
          type: 'prose',
          text: 'The upgrade treats a `components` map as a theme when it belongs to a `defineTheme()` call imported from Astryx, an object typed as an Astryx theme, or the theme object a same-stem theme descriptor (`<stem>.doc.mjs`) declares: the top-level binding exported as `<stem>`, with a static `name` and component entries that are style objects. A look-alike object anywhere else, such as a theme object from another library in the same file, is not an Astryx theme. It leaves computed theme keys, unqualified classes, unknown consumer classes, declarations, comments, and CSS inside JavaScript or TypeScript strings unchanged. It adds `TODO(astryx upgrade)` when a map has both an old and a canonical key, and when a bare class Astryx once emitted has no known meaning on the target it qualifies. Review each TODO by hand.',
        },
      ],
    },
    {
      title: 'What NOT to Do',
      content: [
        {
          type: 'list',
          style: 'dont',
          items: [
            'style={{}} on raw <div> wrappers. Use xstyle on the component directly.',
            'Hardcoded colors (#fff, rgb(...)). Use var(--color-*) tokens or Tailwind semantic classes (text-primary, bg-surface).',
            'Hardcoded spacing (16px, 1rem). Use var(--spacing-*) tokens or Tailwind spacing utilities (p-4, gap-3).',
            'Wrapping a component in a <div> just to add margin. Use xstyle with stylex.create on the component.',
            "Using !important. If styles aren't applying, check specificity; xstyle is merged last.",
          ],
        },
      ],
    },
  ],
};
