# @astryxdesign/vega

Astryx Vega wrapper: chart and data visualization components.

Renders [Vega](https://vega.github.io/vega/) and [Vega-Lite](https://vega.github.io/vega-lite/) specifications via the Vega runtime. The component inspects `$schema` to decide whether to compile (Vega-Lite) or render directly (Vega), validates the schema URL before doing either, and exposes the full Vega `parse()` and `View` construction APIs as props.

> **Publishing status: canary only.** This package ships to npm **only under the `@canary` dist-tag** — there is no stable (`latest`) release yet. See [Publishing](#publishing) below for the canary model and the steps to graduate it to a public stable release.

<!-- SYNC: When files in this directory change, update this document. -->

## File Manifest

| File                | Role      | Purpose                                                      |
| ------------------- | --------- | ------------------------------------------------------------ |
| `package.json`      | Config    | Package metadata, deps, build scripts                        |
| `tsconfig.json`     | Config    | TypeScript compiler config (extends root)                    |
| `tsup.config.ts`    | Config    | Build config: CJS + ESM + `.d.ts` outputs                    |
| `src/index.ts`      | Barrel    | Public API surface                                           |
| `src/VegaChart.tsx` | Component | Inspects `$schema`, compiles or renders, owns View lifecycle |
| `src/viewInputs.ts` | Utility   | Detects value changes in the props that own the View         |
| `src/schema.ts`     | Utility   | Parses and validates Vega/Vega-Lite `$schema` URLs           |
| `src/types.ts`      | Types     | Shared TypeScript types for this package                     |

## Installation

Vega is published **only** under the `@canary` dist-tag, so you must request that tag explicitly. There is no `latest` version to install yet.

```bash
npm install @astryxdesign/vega@canary vega vega-lite
```

> Canary builds track the latest commit on `main` (`0.x.y-canary.<sha>`). They can break between any two versions — pin an exact version if you need stability.

## Usage

### Vega-Lite spec (compiled automatically)

```tsx
import {VegaChart} from '@astryxdesign/vega';

<VegaChart
  spec={{
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    mark: 'bar',
    data: {
      values: [
        {a: 'A', b: 28},
        {a: 'B', b: 55},
      ],
    },
    encoding: {
      x: {field: 'a', type: 'ordinal'},
      y: {field: 'b', type: 'quantitative'},
    },
  }}
/>;
```

### Vega spec (rendered directly, no compilation)

```tsx
<VegaChart
  spec={{
    $schema: 'https://vega.github.io/schema/vega/v5.json',
    marks: [...],
  }}
/>
```

### Full configuration

```tsx
<VegaChart
  spec={spec}
  parseConfig={{background: '#1a1a1a'}}
  parseOptions={{ast: true}}
  viewOptions={{
    renderer: 'canvas',
    logLevel: 1,
    tooltip: myTooltipHandler,
    locale: myLocale,
    loader: myLoader,
  }}
  onReady={view => {
    view.addSignalListener('highlight', (name, value) => {
      console.log('signal:', name, value);
    });
  }}
  onError={err => console.error('Chart error:', err.message)}
/>
```

## API

### `<VegaChart>`

| Prop             | Type                             | Default | Description                                                |
| ---------------- | -------------------------------- | ------- | ---------------------------------------------------------- |
| `spec`           | `AnySpec`                        | --      | Vega or Vega-Lite spec with `$schema` (required)           |
| `data`           | `ViewData`                       | --      | Initial dataset values: `{datasetName: tuples[]}`          |
| `compileOptions` | `CompileOptions`                 | --      | Options passed to `compile(spec, options)`, Vega-Lite only |
| `parseConfig`    | `Config`                         | --      | Vega config passed to `parse(spec, config)`                |
| `parseOptions`   | `ParseOptions`                   | --      | Options passed to `parse(spec, config, options)`           |
| `viewOptions`    | `Omit<ViewOptions, 'container'>` | --      | Options passed to `new View(runtime, options)`             |
| `className`      | `string`                         | --      | CSS class on the container div                             |
| `style`          | `CSSProperties`                  | --      | Inline styles on the container div                         |
| `onReady`        | `(view: View) => void`           | --      | Called with the live Vega View when ready                  |
| `onError`        | `(err: Error) => void`           | --      | Called on schema error, compile failure, or render failure |

`viewOptions` maps directly to [`ViewOptions`](https://vega.github.io/vega/docs/api/view/) with `container` omitted (always set by the component). Notable fields:

| `viewOptions` field | Type                | Description                             |
| ------------------- | ------------------- | --------------------------------------- |
| `renderer`          | `'svg' \| 'canvas'` | Rendering backend (default: `'svg'`)    |
| `hover`             | `boolean`           | Enable hover encoding (default: `true`) |
| `logLevel`          | `number`            | Vega log verbosity                      |
| `logger`            | `LoggerInterface`   | Custom logger                           |
| `tooltip`           | `TooltipHandler`    | Custom tooltip handler                  |
| `locale`            | `LocaleFormatters`  | Number and time format locale           |
| `loader`            | `Loader`            | Custom data loader                      |
| `background`        | `Color`             | Chart background color                  |

`compileOptions` fields (Vega-Lite specs only, ignored otherwise):

| `compileOptions` field | Type                           | Description                                         |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| `config`               | `VegaLiteConfig`               | Vega-Lite config merged on top of the spec's config |
| `logger`               | `LoggerInterface`              | Custom logger used during compilation               |
| `fieldTitle`           | `(fieldDef, config) => string` | Custom field title formatter                        |

`parseOptions` fields:

| `parseOptions` field | Type      | Description                                               |
| -------------------- | --------- | --------------------------------------------------------- |
| `ast`                | `boolean` | Retain expression AST in the runtime (useful for tooling) |

### View lifecycle

`<VegaChart>` builds a Vega `View` on mount and finalizes it on unmount. In
between, it rebuilds the View only when `spec`, `compileOptions`,
`parseConfig`, `parseOptions`, or `viewOptions` **changes value** — these props
are compared by value against the values the live View was built from, not by
reference. Two consequences, and you need neither `useMemo` nor a discipline
about object identity for either:

- an object literal rebuilt inline on every render does **not** tear the chart
  down;
- a spec you edit **in place** — held in a ref, a module constant, or shared
  between renders — **is** picked up, because the comparison is against a copy
  taken when the View was built, not against the previous props.

Functions inside those props (a `tooltip` handler, `logger`, `loader`, `expr`,
or `fieldTitle`) and class instances are compared by reference, since their
behavior lives in methods a copy cannot capture: replace the value rather than
mutating it.

Two shapes cannot be copied for comparison: a subtree that re-enters an object
already on its own path (a reference cycle), and one nested deeper than 100
levels. Those parts are compared **by reference**, so passing the **same**
object again is stable — a chart built from a cyclic spec is not rebuilt on
every render — while passing a **new** object rebuilds the View even when it
holds equal values.

What that costs differs between the two:

- **A cycle hides nothing.** Its re-entry edge points back at an object the
  copy already walked, so an in-place edit anywhere in a cyclic spec is still
  detected normally.
- **Past 100 levels, an in-place edit is invisible** — the reference did not
  change and the values below were never copied. Replace the object, or drive
  the View through `onReady`, to update from down there.

Everything the copy did reach is compared by value either way, so a mutation
elsewhere in the spec is picked up even when part of it is opaque.

Everything else is inert to the lifecycle: `data`, `className`, `style`,
`onReady`, and `onError` never rebuild the View.

### Data loading

`data` maps dataset names to tuple arrays and is applied via `view.data(name, tuples)` during View initialization, before the first render. It is _not reactive_; changes after mount are ignored, and a new `data` object never rebuilds the View by itself. (When something else rebuilds the View, the new View loads whatever `data` holds at that moment.)

To update data dynamically after render, use `onReady` to get the live View and drive it yourself:

```tsx
<VegaChart
  spec={spec}
  data={{
    table: [
      {category: 'A', value: 28},
      {category: 'B', value: 55},
    ],
  }}
  onReady={view => {
    // Later, update data dynamically:
    view.data('table', newRows);
    view.runAsync();
  }}
/>
```

### Untrusted specs

A Vega/Vega-Lite spec is a program, not just data: Vega evaluates the
expression strings inside it (signals, event streams, encodings, filters)
and, by default, compiles them to JavaScript with the Function constructor.
A spec's `data` entries can also name URLs — including signal-built dynamic
ones — that the default loader will fetch with the page's credentials.

`<VegaChart>` renders the spec you give it with Vega's defaults, so those
defaults define the trust boundary: **only pass specs you author or
review.** If specs come from users, stored documents, or model output, wire
the safe evaluation mode through the existing pass-through options — Vega's
own guidance for untrusted specs:

```tsx
import {expressionInterpreter} from 'vega-interpreter';
import {loader} from 'vega';

<VegaChart
  spec={untrustedSpec}
  // Retain the expression AST and evaluate it interpreted (no Function
  // constructor). Slower, and a small subset of expressions is unsupported —
  // see the vega-interpreter README.
  parseOptions={{ast: true}}
  viewOptions={{
    expr: expressionInterpreter,
    // Restrict (or disable) what a spec may load. `mode: 'file'` with no
    // baseURL rejects everything; supply your own loader to allowlist hosts.
    loader: loader({mode: 'file'}),
  }}
/>;
```

`vega-interpreter` is a separate package (`npm install vega-interpreter`);
pair it with a `Content-Security-Policy` that omits `'unsafe-eval'` so the
boundary is enforced by the platform, not only by configuration.

### `parseSchema(schema)` (exported utility)

Parses and validates a Vega `$schema` URL. Returns:

- `{ok: true, library: 'vega' | 'vega-lite', version: string}` on success
- `{ok: false, error: string}` if the URL is missing, malformed, or names an unknown library

## Schema validation

`VegaChart` validates `spec.$schema` before doing any work. It will call `onError` (and render nothing) if:

- `$schema` is missing or not a string
- The URL doesn't match the expected format (`schema/{library}/{version}.json`)
- The library name is not `vega` or `vega-lite`

## Build

```bash
pnpm -F @astryxdesign/vega build
```

## Publishing

### Canary (automatic, today)

`package.json` keeps `"private": true` plus an `"astryx": { "canaryOnly": true }` marker. The release workflow (`.github/workflows/release.yml`) handles both dist-tags:

- The **stable (`latest`) job** skips every package that is `private` **or** `canaryOnly`, so Vega can never be published as a stable release by accident.
- The **canary job** runs on every push to `main`. In its ephemeral CI checkout only (never in git) it strips the `private` flag from `canaryOnly` packages and publishes them to the `@canary` dist-tag as `0.x.y-canary.<short-sha>`, with npm OIDC trusted publishing + provenance.

The committed `private: true` is npm's hard guarantee that no stable publish can ever happen — **do not remove it until the graduation steps below are intentionally taken.**

> **First canary won't publish until the package name is claimed on npm.** npm cannot register OIDC trust for a name that does not yet exist on the registry. An `@astryxdesign` npm org owner must claim the name and register `release.yml` as its trusted publisher once, following [Trusted-publisher setup](https://github.com/meta/astryx/blob/main/docs/release.md#trusted-publisher-setup) (this also applies before the first stable publish). Until this is done, CI's canary publish for this package will fail.

### Graduating to a public stable (`latest`) release

When Vega is ready to be published publicly as a stable release, take these steps (in order). This mirrors how the other public `@astryxdesign/*` packages are released — see the wiki's **Release-Process** page for the authoritative flow.

1. **Remove the canary-only gating** from `packages/vega/package.json`:
   - Delete `"private": true`.
   - Delete the `"astryx": { "canaryOnly": true }` block.

2. **Join the versioning group.** Add `@astryxdesign/vega` to the `fixed` array in `.changeset/config.json` so it co-versions with the rest of the publishable packages (they all bump to the same version). Set `version` to match the current published version of the other packages.

3. **Confirm the name is claimed + trusted on npm** (the bootstrap box above). An `@astryxdesign` org owner runs it once if it hasn't been done already — a stable publish fails for an unclaimed/untrusted name exactly like a canary does.

4. **Add a changeset** so the release notes and version bump include Vega:

   ```bash
   pnpm changeset:new
   ```

5. **Land the change, then version + publish** through the normal release flow:
   - Merge the PR that removes the gating (a canary publishes automatically on that push to `main`).
   - Run the version-bump PR (`pnpm version-packages`, refresh the lockfile, merge) — this bumps versions on `main` but publishes nothing.
   - Dispatch the stable Release workflow to publish the `latest` dist-tag:

     ```bash
     gh workflow run release.yml --ref main -f dry-run=true   # optional preview
     gh workflow run release.yml --ref main                   # publish latest
     gh run list --workflow=release.yml -L 3                   # watch
     ```

   Publishing is tokenless (npm OIDC trusted publishing) and version-gated/idempotent — re-running is safe. No manual `npm publish`, no npm tokens.

After the stable publish, `npm install @astryxdesign/vega` (no tag) resolves to the stable release; the `@canary` tag continues to track `main`.
