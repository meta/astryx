## The exact edits

Do these in order:

1. Run `pnpm add @astryxdesign/core @astryxdesign/theme-neutral`.
2. In `src/index.css`, insert the layer declaration **above** the existing
   `@import 'tailwindcss';`, then add the three Astryx stylesheets immediately
   after the Tailwind import. Keep the rest of the host stylesheet intact.
3. In `src/main.tsx`, wrap `<App />` in
   `<Theme theme={neutralTheme} mode="light">`. Preserve the app's own mode
   control and change the explicit mode only when the host's initial mode differs.
4. Build the app and inspect the rendered page before finishing.
