## Adding Astryx to an established Tailwind app

The public greenfield recipe is not a replacement for an existing stylesheet.
Preserve the host application's CSS and add Astryx around it:

- Keep `@import 'tailwindcss';` and put the layer declaration **above it**:

  ```css
  @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

  @import 'tailwindcss';
  @import '@astryxdesign/core/reset.css';
  @import '@astryxdesign/core/astryx.css';
  @import '@astryxdesign/theme-neutral/theme.css';
  ```

- Do not import `@astryxdesign/core/tailwind-theme.css` unless the host wants
  Astryx to own its Tailwind vocabulary. It intentionally maps common color,
  radius, shadow, type, and spacing names.
- Pass an explicit `mode` to `<Theme>` that matches the host's initial mode.
  Preserve any app-controlled light/dark switch rather than replacing it.
- If both systems own the same custom-property name, reassert the host value at
  the theme boundary instead of deleting either vocabulary.
- Verify the rendered app as well as the build. Cascade and inherited-color
  changes can compile cleanly.
