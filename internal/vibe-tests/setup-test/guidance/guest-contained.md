## Strategy: guest-contained adoption

This app already owns its global stylesheet, its CSS reset, and its token
vocabulary. Adopt this strategy when the design system must live inside one new
or migrated region and leave the rest of the page untouched.

This is the exceptional strategy, not the established-app default. The normal
objective for an app like this one is host-aligned adoption — the host stays
authoritative over typography and color, and the design system is themed to it
through supported public APIs. Containment is for the narrower case where
leaving the rest of the page alone is a hard requirement of the work: a nested
or sub-scoped region inside an application whose global ownership cannot move.

It is also the strategy with no fully supported path today. Scoping the design
system to a subtree means suppressing the root attribute sync described below,
and there is no public API for that; portaled content rendered outside the
subtree then falls outside every scope root and loses its tokens. Both are
product gaps rather than choices this document can make well, and following this
strategy exercises them deliberately — what it produces is evidence about those
gaps as much as it is a recipe.

### The host keeps global ownership

- Do **not** import `@astryxdesign/core/reset.css`. The host already owns
  preflight and element defaults; a second reset changes host elements.
- Do **not** import `@astryxdesign/core/tailwind-theme.css`, and do not change
  the host's existing token definitions.
- Keep `@import 'tailwindcss';` exactly where it is. Declare the layer order
  above it so the design system's layers sit between the host's base and the
  host's components:

  ```css
  @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
  ```

- Verify the layer order in the **emitted** CSS rather than in source order.

### Installing the packages — approving the build script

`@astryxdesign/core` ships a `postinstall` script, and pnpm 11 does not run a
dependency's install scripts until that dependency is approved. It fails the
install rather than skipping quietly:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @astryxdesign/core@0.5.2
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

Do what the error says:

```bash
pnpm install          # fails with ERR_PNPM_IGNORED_BUILDS
pnpm approve-builds   # --all to accept every pending package without prompting
```

That writes the approval into **`pnpm-workspace.yaml`**, as an `allowBuilds` map:

```yaml
allowBuilds:
  '@astryxdesign/core': true
```

Two things about this are worth knowing before you hand-write anything:

- **pnpm 11 reads `allowBuilds` from `pnpm-workspace.yaml` only.** The same key
  under a `pnpm` field in `package.json` is ignored, and the install fails
  exactly as it did before — a confusing failure, because the setting is right
  there in the file you edited. If you write it by hand rather than running
  `approve-builds`, write it in `pnpm-workspace.yaml`, and create that file if
  the project does not have one.
- **`ignoredBuiltDependencies` and `onlyBuiltDependencies` are not the fix
  here.** Neither key clears this error in pnpm 11 in either file. Reach for
  `approve-builds`, or the `allowBuilds` map it writes.

Setting a package to `false` also satisfies pnpm — it records a decision not to
build — but `@astryxdesign/core` expects its `postinstall` to run, so approve it
rather than suppressing it.

Prefer `pnpm-workspace.yaml` over `package.json` for another reason too: it is
pnpm's own file and npm and yarn ignore it, so approving a pnpm build leaves no
pnpm-specific configuration in the manifest those tools read.

### Mount the provider around the guest subtree only

Wrap only the new or migrated region:

```tsx
<Theme theme={neutralTheme} mode={hostMode}>
  <NewRegion />
</Theme>
```

Do not wrap the application root, and do not wrap any pre-existing host UI.
`mode` follows the host's own light/dark state; the host keeps its mode control.

### Containing the root attribute sync — the honest state of this

A provider with no parent provider above it is a **root** provider, and a root
provider synchronizes `data-theme` and `data-astryx-theme` onto the document
element. Theme CSS is emitted as `@scope ([data-astryx-theme="<name>"]) to
(...)`, so that attribute on the document element makes the whole document a
scope root — which is exactly what defeats containment.

**There is no supported public API to disable that sync.** The provider's public
props are `theme`, `mode`, and `children`; none of them opt out, and there is no
nested-mode or scoped-root escape hatch. Do not invent a prop or reach into
internals.

The only mechanism available today is to remove the attribute from the document
element after mount and keep it removed with a `MutationObserver`:

```tsx
useEffect(() => {
  const root = document.documentElement;
  const strip = () => root.removeAttribute('data-astryx-theme');
  strip();
  const observer = new MutationObserver(strip);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-astryx-theme'],
  });
  return () => observer.disconnect();
}, []);
```

State plainly in the code comment that this is a workaround for a missing
capability, not a supported configuration. Leave `data-theme` alone if the host
relies on it for `color-scheme`; strip only the theme-name attribute.

### The portal tradeoff — test it and write it down

`data-astryx-theme` on the document element is what lets `@scope`'d theme CSS
reach content rendered **outside** the provider's DOM subtree: portaled
overlays, dialogs, popovers, tooltips, and fallback toast viewports. Removing it
is therefore not free:

- content inside the provider's subtree stays themed;
- portaled design-system content rendered to `document.body` falls outside every
  scope root and loses its theme tokens.

You must exercise this directly: open a portaled design-system overlay from
inside the guest subtree in both modes, observe the result, and record what
happens in a comment next to the workaround. If the region needs portaled
overlays, say so explicitly — for that region, containment and themed portals
cannot both hold today, and the choice belongs to the app.

Do not resolve this by re-adding a global attribute under another name, by
copying theme variables onto `body`, or by adding `!important` overrides.
