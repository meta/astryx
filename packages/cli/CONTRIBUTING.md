# Contributing to @astryxdesign/cli

Architecture, conventions, and playbook for CLI contributors.

## Architecture

The CLI is a thin wrapper around type-safe API functions. Each command follows the same pattern:

```
User calls API function        User runs CLI
        |                            |
        v                            v
  api/component/component.mjs ◄─ clients/cli/commands/component.mjs
        |                            |
        v                            v
  { type, data }              jsonOut(response) or formatText(data)
```

Both paths run identical code. The CLI handler just adds argument parsing and output formatting.

The package is organized into four product surfaces plus a shared substrate (no
`src/` — it was dissolved in the reorg). The top-level directory _is_ the module boundary:

```
packages/cli/
  api/                         # Programmatic API (exported as @astryxdesign/cli/api)
    index.mjs                  # barrel: command functions + re-exported .type.mjs types
    error.mjs  logger.mjs      # AstryxError (.suggestions + .code); the injectable logger
    component/component.mjs    # one dir per command; colocated <cmd>.type.mjs + tests
    json/                      # the ./json consumer surface — parse.mjs + index.d.ts
    ...                        # command-internal helpers take a `_` prefix (_adapter, _site, …)
  clients/                     # user-facing apps over api/ — MUST NOT be imported by api/
    cli/                       # the CLI app (room for a future clients/interactive/)
      bin/astryx.mjs           # entry: Node-version gate + top-level error boundary
      index.mjs                # program setup + JSON_SUPPORTED set + fallback hook
      commands/                # thin wrappers: parse args → one API call → render
      lib/                     # CLI-only support (cli-error, manifest, *-format, json-shim, …)
  authoring/                   # public authoring surface + colocated .d.ts
                               #   (./config ./doc ./template ./codemod ./integration)
  assets/                      # data/content the CLI ships
    codemods/  docs/  templates/
  foundation/                  # shared substrate (proven used by 2+ surfaces), by concern
    response/                  # json.mjs (emitter), parse's contract, base.d.ts, error-codes
    config/  discovery/  integrations/  text/  fs/  env/
    agent-docs/                # doc generator/injector (shared: init/upgrade/hook)
    schemas/                   # zod/JSON schemas
    xle/                       # the ./xle layout engine (self-contained, extract-ready)
  scripts/  test-utils/        # package tooling + the in-process CLI test harness
```

**Hard boundary:** `api/` never imports from `clients/`. The API is the reusable core;
the CLI is one consumer of it. Anything shared by both (doc generation, manifest,
package-manager detection) lives in `foundation/` (or, if CLI-only, in `clients/cli/lib/`),
never in a place `api/` would reach up into. Side-effecting commands perform the effect
_in the API_ and return a `{type, data}` receipt; the CLI only chooses how to render it
and what exit code to set.

## Adding a new command

### Does it need an API function?

**Yes** if the command returns data that consumers might want programmatically — component docs, template source, lists, search results. Put the logic in `api/`, export from `@astryxdesign/cli/api`, and make the CLI handler a thin wrapper.

**No** if the command is purely interactive or only makes sense in a terminal — `init` (interactive prompts). The interactive shell can live in `cli/commands/`, but any reusable core (the actual scaffolding work) still belongs in `api/`.

**Rule of thumb:** if it supports `--json`, it should have an API function. The parity test (`api-cli-parity-test.mjs`) will flag any `--json` type that doesn't have API coverage.

### 1. Write the API function

Add a file in `api/<command>/` with all the logic. It returns `{ type, data }` on success and throws `AstryxError` on failure. The CLI handler should have zero logic — just arg parsing and text formatting:

```javascript
// api/my-command/my-command.mjs
import {AstryxError} from '../error.mjs';

export async function myCommand(name, options = {}) {
  if (!name) {
    return {type: 'my-command.list', data: getAllItems()};
  }

  const item = findItem(name);
  if (!item) {
    throw new AstryxError(`Item "${name}" not found`, suggestions);
  }

  return {type: 'my-command.detail', data: item};
}
```

Export it from `api/index.mjs`:

```javascript
export {myCommand} from './my-command/my-command.mjs';
```

### 2. Create the CLI wrapper

The CLI handler just parses args, calls the API function, and formats the result. No business logic here:

```javascript
// cli/commands/my-command.mjs
import {jsonOut, jsonError} from '../../lib/json.mjs';
import {myCommand} from '../../api/my-command/my-command.mjs';

export function registerMyCommand(program) {
  program
    .command('my-command [name]')
    .description('Does something')
    .action(async (name, options) => {
      const json = program.opts().json || false;

      let result;
      try {
        result = await myCommand(name, options);
      } catch (e) {
        if (json) return jsonError(e.message, e.suggestions);
        console.error(e.message);
        process.exit(1);
      }

      if (json) return jsonOut(result.type, result.data);
      console.log(formatText(result));
    });
}
```

### 3. Define response types

Create `types/my-command.d.ts`:

```typescript
/** xds --json my-command */
export interface MyCommandListResponse {
  type: 'my-command.list';
  data: MyCommandListEntry[];
}

export interface MyCommandListEntry {
  name: string;
  description: string;
}

/** xds --json my-command <name> */
export interface MyCommandDetailResponse {
  type: 'my-command.detail';
  data: {name: string; content: string};
}
```

### 4. Wire it up

Add to `types/index.d.ts`:

```typescript
export * from './my-command';
```

That's the only type wiring — there is **no central response union** to register
in. Each response `type` is guaranteed by its own command function's `@returns`
(the source of truth); consumers import the per-command type directly.

### 5. That's it

If you skip the type steps, the command still works — the global fallback hook returns a clean `CLIUnsupportedError` when someone passes `--json`. No crashes, no broken output.

## Playbook — common changes

### Adding a prop to a component

Nothing to do in the CLI. Props come from `.doc.mjs` files in `packages/core/src/`. The CLI reads them at runtime. If the `.doc.mjs` is updated, the CLI and API automatically reflect the change.

### Adding a new component

1. Create the component in `packages/core/src/{Name}/`
2. Add a `{Name}.doc.mjs` in the same directory (or add to the parent's `.doc.mjs` if it's a sub-component)
3. Done — the CLI auto-discovers it, the API auto-discovers it, the parity test auto-discovers it

If the component has no `.doc.mjs`, `astryx component {Name}` returns a clean error and CI's smoke test skips it.

### Adding a new doc topic

1. Add `{topic}.doc.mjs` in `packages/cli/assets/docs/`
2. Done — auto-discovered by `astryx docs` and the `docs()` API function

### Adding a new template

Every template is exactly **two files** — no exceptions:

```
packages/cli/assets/templates/{name}/
├── page.tsx              ← the template code (single self-contained file)
└── template.doc.mjs      ← metadata (name, description, isReady)
```

1. Create `packages/cli/assets/templates/{name}/page.tsx` with a default-exported React component
2. Create `packages/cli/assets/templates/{name}/template.doc.mjs` with a `doc` export (`TemplateDoc`)
3. Done — auto-discovered by `astryx template --list` and the `template()` API function

**Rules:**

- No extra files — no CSS, no images, no other assets. Everything lives in `page.tsx`.
- Images must use external URLs (e.g. Unsplash), not local imports.
- All styles must use StyleX or inline styles, not separate CSS files.

### Adding a new option to an existing API function

1. Add the option to the API function in `api/{command}/{command}.mjs`
2. Pass it through from the CLI handler in `cli/commands/{command}.mjs`
3. Add the option to the `{Command}Options` typedef in `api/{command}/{command}.type.mjs` — this JSDoc is the source of truth; the public `./api` type surface regenerates from it via `pnpm sync:api-types`

### Adding a new response type (e.g. `component.detail.variants`)

1. Add the logic in `api/{command}/{command}.mjs` — return `{type: 'component.detail.variants', data: ...}`
2. Add a `@typedef` for it in `api/{command}/{command}.type.mjs` (the colocated source of truth)
3. Reference it from the function's `@returns` — there is no central union to update; the `./api` type surface regenerates from the JSDoc
4. The parity test will auto-detect the new type and verify API=CLI

### Renaming or removing a response type

This is a breaking change for `@astryxdesign/cli/api` consumers. Bump the version.

### What CI catches automatically

- **New component without docs** → smoke test skips it with a message (not a failure)
- **New CLI `--json` type without API coverage** → parity test flags it as a coverage gap
- **API and CLI returning different data** → parity test fails with both payloads shown
- **Invalid JSON envelope shape** → json smoke test fails
- **Type mismatches** → `tsconfig.json-api.json` typecheck fails

## Naming conventions

### Response types: `{Command}{Mode}{SubMode?}Response`

| Part    | Rule                    | Examples                                                                          |
| ------- | ----------------------- | --------------------------------------------------------------------------------- |
| Command | PascalCase command name | `Component`, `Discover`, `ThemeBuild`                                             |
| Mode    | What the response IS    | `List`, `Brief`, `Detail`, `Search`, `Copy`, `Build`, `Run`, `Categories`, `File` |
| SubMode | Narrower view of Mode   | `Props`, `Source`, `Doc`, `Section`                                               |
| Suffix  | Always `Response`       |                                                                                   |

### Entry types: `{Command}{What}Entry`

Sub-objects in arrays. No `Response` suffix.

### Type discriminators: dot-separated lowercase

```
{command}.{mode}              -> component.list
{command}.{mode}.{submode}    -> component.detail.props
```

### How flags compose

`--json` is an output format, not a mode. All other flags still work:

- `--json + --category X` filters the same response type (no new type needed)
- `--json + --lang zh` applies translation before dumping
- `--json + --props` narrows to `component.detail.props` (sub-mode)
- `--json + --source` narrows to `component.detail.source` (sub-mode)

## How the fallback hook works

1. Command runs normally
2. If it called `jsonOut()` or `jsonError()`, `process.__xdsJsonHandled` is `true` → done
3. If not, the `postAction` hook fires and outputs `CLIUnsupportedError`
4. New commands that don't know about `--json` automatically get a clean error

## Suppressing stdout for --json

When `--json` is active, human-readable output must not contaminate stdout:

```javascript
// Simple commands: guard console.log
if (!json) console.log(`✓ Done`);

// Logger commands: skip term-log calls
if (!json) p.intro('Welcome');
if (!json) p.log.step('Running...');

// Side-effect commands: still run the work, just suppress output
// and collect results into a receipt object
```

## CI enforcement

- `tsconfig.json-api.json` typechecks `json.mjs` and `parse.mjs` against the `.d.ts` declarations
- `.github/scripts/cli-json-smoke-test.mjs` validates every `--json` command outputs valid JSON with correct envelope shape
- `.github/scripts/api-cli-parity-test.mjs` verifies the programmatic API returns identical data to `xds --json` for every command
- All three run in the `cli-smoke-test.yml` workflow on every PR

## Strict type-check (checkJs + JSDoc) — required CI gate

The CLI ships as hand-written `.mjs` (no build step) but is type-checked with
TypeScript's `checkJs` against the JSDoc annotations in the source. `tsconfig.strict.json`
runs the compiler over the **whole package** — every surface (`api`, `clients`,
`authoring`, `foundation`) plus the `assets/` content (codemods, docs, and the emitted
`templates` `.tsx` source) and `scripts` — under full `strict`, including
`noImplicitAny`, so an un-annotated parameter is an error.

```bash
pnpm build   # once, so @astryxdesign/{core,charts,lab} dist types resolve
pnpm -F @astryxdesign/cli typecheck:strict
```

This is a **required CI gate**: it runs on every PR and in the merge queue (the `build`
check in `ci.yml`) and again in the post-merge validation gate in `deploy.yml`, so the
CLI must stay strict-clean — a new un-annotated parameter or type error fails CI. Run it
locally before pushing. (The emitted `templates/**/*.tsx` import built workspace packages,
so run `pnpm build` first or you'll see spurious "cannot find module" errors from unbuilt
`dist` output.)

## Roadmap

Two tracks of planned work. Both are intentionally sequenced _after_ the thin-CLI
extraction settles, so each lands as a focused, fully-verified increment rather than a
rushed one where a subtle behavior change could slip past the tests.

Every increment must clear the same gate before commit: shape-lock IDENTICAL (the
`--json` payloads and human text stay byte-for-byte the same), `typecheck:strict` at 0
errors with the file count not shrinking, `typecheck:json-api`, the vitest suite, and the
api↔cli parity + json-smoke scripts.

### 1. Finish the thin-CLI / API coverage

Goal: every command is scriptable and each CLI handler is `parse → one API call →
render`. The reusable core lives in `api/`; the CLI only parses args, renders (`jsonOut`
or human text), and sets the exit code. Side-effecting commands do the effect in the API
and return a `{type, data}` receipt.

Remaining commands, in order (largest / highest-risk deliberately taken one at a time):

1. **`upgrade`** (~860 lines — codemod pipeline, ~10 outcomes). Extract to `api/upgrade`
   returning an `upgrade.run` receipt. Use the **injected-logger** pattern: the API takes
   an optional logger (default no-op) so the work runs identically whether or not the CLI
   is rendering progress; all `term-log` calls stay in the CLI. Runs codemods + a
   post-codemod hook via `execFile`, so preserve dry-run vs `--apply` exactly.
   - Open decision to make explicit in that PR: two error sites currently pass a metadata
     object (`{agentDocs}` / `{receipt}`) as `jsonError`'s _suggestions_ argument, which
     `toErrorEnvelope` silently drops (it only forwards array-shaped suggestions). Either
     preserve the drop (shape-lock stays identical) **or** fix it as a deliberate,
     documented additive change that puts the metadata in the receipt `data`. Do not
     change it silently either way.
2. **`theme build`** (~1275 lines — theme→CSS/TS compiler, ~14 file-write sites). Extract
   the compiler into `api/theme` returning a build receipt; keep all disk writes in the
   API, keep rendering in the CLI. Large and side-effecting — its own pass.
3. **`init`** (~195 lines). The interactive prompts stay CLI-side; extract the scaffolding
   core into `api/init` so the non-interactive path is scriptable.
4. **`blog --json`**: `blog` emits `blog.list` / `blog.detail` today but has **no
   `blog.d.ts`** — enabling/locking its `--json` surface must _also_ add the response
   types (at the function's `@returns` / `types/blog.d.ts`). Small, low-risk, pure win.
5. **Data-command audit** (`component`, `docs`, `hook`, `template`): confirm no residual
   business logic remains CLI-side after the reorg. Mostly already thin.

### 2. Replace hand-written `.d.ts` with generated declarations

Today the API's public types are hand-written `.d.ts` files in `types/`, kept in sync with
the `.mjs` implementation by convention + CI. The goal is to make the annotated `.mjs` the
single source of truth so type drift becomes a compile error instead of a review catch.

Proven feasible: a JSDoc `@typedef` in a `.mjs` file plus `tsc --emitDeclarationOnly`
generates a correct `.d.ts`, and a shared `.ts` spine can `import type { XResult } from
'./x.mjs'` and both type-check and emit correctly.

Phased plan:

- **Phase 0 (done):** each API function gets a precise `@returns
{Promise<XResult>}` pointing at its exported result union, so an implementation that
  stops matching its declared type fails `typecheck:strict`. `discover` and `docs` are the
  reference pattern; `build`'s `search` result is already annotated.
- **Phase 1 — generation harness:** wire `tsc --emitDeclarationOnly` → `dist/types/` and
  prove the generated output is byte-identical to the current hand-written `.d.ts`. No
  behavior change; this only establishes the generator.
- **Phase 2 — migrate per-command:** move each command's types into a colocated
  `api/<cmd>/<cmd>.types.ts` (or JSDoc typedefs in the `.mjs`), update `base.ts`'s imports,
  and delete `types/<cmd>.d.ts` one at a time. Start with **`blog`** — it has no `.d.ts`
  today, so it's a pure win with nothing to keep in sync.
- **Phase 3 — flip the export:** point `exports.types` at the generated output and stop
  committing generated `.d.ts` by hand.
- **Phase 4 — lock it:** add a CI check so no hand-written per-command `.d.ts` can
  reappear.
