# /apps/storybook

Storybook application for component development and visual documentation.

<!-- SYNC: When files in this directory change, update this document. -->

## How stories are organized

One shape, so a reader can guess where anything lives and the visual gate can
find it:

```
<Package>/<Component>/(Default | Theme Sheet | …)
<Package>/Hooks/<hook>
<Package>/Themes/<theme feature>
<Package>/Internationalization/<page>
A11y/<pattern or component>
```

- **`<Package>`** is `Core`, `Lab`, `Charts`, `Vega` or `RichText` — the package
  the thing ships from, never a category like "Components".
- **`Default` comes first.** The simplest honest use, and the first thing a
  builder sees.
- **`Theme Sheet` comes second** — every themeable target of that component, in
  every variant and state its `.doc.mjs` declares, on one page. It is the
  reference for theme authors and the surface the visual gate photographs under
  the probe theme, which is how a theming target is proven to still reach the
  pixels. A component whose sheet is missing a target has a target nothing can
  verify.
- **Hooks and theme-level features are not components** and do not sit beside
  them. Icon and indicator registries, `MediaTheme`, `CodeTheme` and the like
  live under `Themes/`.
- **An internationalization page** checks one locale behavior across several
  components, such as dates in Calendar, DateInput and Timestamp, so it sits in
  its package's `Internationalization/` group rather than beside one component.
- **Accessibility contract fixtures live under `A11y/`.** They are test
  fixtures the a11y audit and its browser specs open by story id, not component
  docs. Storybook ids lowercase titles, so `A11y/` and `a11y/` share ids, and
  the check accepts both.
- `.storybook/story-tree.test.ts` checks this shape against the built index,
  and CI runs it in `build-storybook` right after the build.

### A Theme Sheet must not pin its own theme

Render the component plainly and let the toolbar drive the theme. A story that
wraps itself in `<Theme theme={…}>` overrides the global, so the toolbar cannot
switch it and the visual gate can never probe it — the story becomes invisible
to exactly the testing it looks like it is helping with.

```tsx
// Good — the toolbar (and the gate) control the theme
export const ThemeSheet: Story = {
  name: 'Theme Sheet',
  render: () => (
    <>
      {VARIANTS.map(v => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </>
  ),
};
```

| File                             | Role          | Purpose                                                                            |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `.storybook/main.ts`             | Config        | Storybook Vite integration, preview build target, and shared workspace alias table |
| `.storybook/main.test.ts`        | Tests         | Source alias coverage and cold-clone config loading                                |
| `LOCAL_STARTUP_INVESTIGATION.md` | Investigation | Why local Storybook previews can appear before they are ready                      |
| `package.json`                   | Config        | Package dependencies and scripts                                                   |
| `tsconfig.json`                  | Config        | TypeScript compiler configuration                                                  |
| `vite.config.ts`                 | Config        | Vite bundler configuration with path aliases                                       |
