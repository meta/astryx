# Astryx Vibe Tests

Structured evaluations that compare how well LLMs generate UI code under different design system configurations. Same prompts, different systems, measurable outcomes.

## Prompt Battery

Prompts live in [`test-sets/default.json`](test-sets/default.json). Each prompt has:

```json
{
  "id": "fwc-6",
  "category": "feature-with-constraint",
  "prompt": "Build a shipping method selector with three options: Standard (free, 5-7 days), Express ($9.99, 2-3 days), Overnight ($19.99, next day)",
  "expectedComponents": ["RadioList", "Card"],
  "complexity": "simple"
}
```

- **`prompt`**: the task given to the agent (identical across all configs)
- **`expectedComponents`**: used for evaluation ONLY, never shown to agents
- **`category`**: groups prompts by type (feature-with-constraint, workflow-description, clone-with-modification, state-display, data-display, responsive-challenge, io-integration, page-setup, typography, theme-customization)
- **`complexity`**: simple, moderate, complex

## Sub-Agent Prompts

Each target gets an equivalent prompt. The only thing that varies is the design system name and the project environment.

**All library targets see the same structure:**

```
You are generating React/TSX code using <system name>.
Your project is at <project dir>. Explore it to find available components.

## Task

<prompt text>

## Output
...same format...
```

**HTML target sees:**

```
You are generating React/TSX code using ONLY plain HTML elements and inline CSS.
Your project is at <project dir>. Do NOT use any component library.
Use standard HTML elements (div, button, input, etc.) with inline styles or a styles object.

## Task

<prompt text>

## Output
...same format...
```

Note: no system-specific rules, no expected components, no pre-built commands. The agent discovers what it needs through the project's own files (README, package.json, symlinked sources).

## Checker Protocol

**Before running or modifying any vibe test, verify these 5 invariants.**

### 1. Fair Evaluators

- Same evaluation logic across all configurations (tsc, scoring dimensions)
- Same pass/fail criteria; don't score one config differently than another
- Target-aware scoring is OK (different systems need different counting methods) but the judgments must be equivalent
- Evaluation must be blind to which config produced the output

### 2. Only the System Under Test Varies

- Same prompts across all configurations (same IDs, same text)
- Same persona across all configurations
- Same output format requirements
- Equivalent sub-agent instructions: if one config gets "read the README", all get an analogous instruction
- No system-specific coaching rules (e.g. "use StyleX" or "use Tailwind"); let the docs teach that

### 3. Never Leak the Answer

- `expectedComponents` is for evaluation ONLY; never include in the sub-agent prompt
- Don't pre-build retrieval commands from expected components
- Don't hint at which components to use
- Don't include rules that only make sense for one system
- The agent should discover the right approach through the system's own docs

### 4. Representative Environment

- Sub-agents should have a realistic project setup (node_modules, package.json)
- The docs/tools available should match what a real consumer would have
- Don't give sub-agents access to the source repo if a real user would only have the npm package
- Test the actual delivery mechanism (README in node_modules, not hand-written skill docs)

### 5. Context-Free Sub-Agents

- Sub-agents must be spawned fresh with no prior conversation context
- No inherited knowledge about the design system from the parent session
- The sub-agent's only knowledge comes from what it discovers during the task
- Don't reuse sub-agent sessions across prompts; each prompt gets a fresh agent

## How to Verify

Before any test run, review the generated task prompts:

```bash
# Generate an iteration without running it
node internal/vibe-tests/src/setup-nightly.mjs --sample 3

# Read the task files and compare:
# - Are the prompts identical (same task text)?
# - Does either prompt contain expectedComponents or pre-built commands?
# - Does either prompt contain system-specific coaching rules?
# - Do the doc retrieval instructions point to representative paths?
```

For evaluation fairness, check `universal-eval.ts`:

- Search for `target ===` to find all target-aware branches
- Verify each branch is measuring the equivalent concept for its system
- Watch for any target getting a skip/bonus the others don't

## Known Accepted Asymmetries

These are intentional and documented; they slightly favor baseline, making Astryx wins more credible:

- **Efficiency:** Tailwind's single-line `className` gets a lower styling-ratio than Astryx's multi-line `stylex.create` blocks, despite encoding more decisions
- **Maintainability:** Tailwind scale values (`p-4`, `text-sm`) count as semantic, which is generous compared to how raw `16px` is counted for HTML
- **Astryx+Tailwind scoring:** The hybrid target counts styling decisions from both Astryx props and Tailwind classes. This may inflate its decision count relative to pure Astryx, but accurately reflects the code's actual styling surface area

## Execution Provenance

Runners may write an optional `<promptId>.provenance.json` sidecar beside each result. It records versioned, executor-neutral task, fixture, condition, executor, timing, and token metadata without embedding prompts or filesystem paths. Collection copies the sidecar, and universal aggregation preserves per-run harness/model labels, supports provenance filters, and marks measured, derived, estimated, complete, and incomplete cost data explicitly.

See [`docs/execution-provenance.md`](docs/execution-provenance.md) for the schema, example, fallback rules, and runner migration contract.

## Directory Structure

```
internal/vibe-tests/
├── test-sets/           # Prompt batteries (JSON)
├── src/                 # Runner scripts, evaluation, and fixture guards
│   ├── setup-nightly.mjs     # 4-target nightly setup
│   ├── universal-eval.ts     # Static analysis scoring (5 dimensions)
│   ├── universal-aggregate.ts # Score aggregation
│   ├── universal-compare.ts  # Cross-target comparison
│   ├── build-previews.ts     # TSX → HTML compilation + tsc
│   ├── screenshot-previews.ts # Playwright screenshots
│   ├── build-report.ts       # Vite HTML report
│   └── deploy-report.ts      # gh-pages deployment
├── fixtures/            # Immutable standalone consumer-app fixtures
├── fixture-recipes/     # Pinned provenance and SHA-256 manifests
├── scripts/             # Fixture setup plus report helpers
├── .baseline/           # Real shadcn/ui components for baseline tsc
├── setup-test/          # Setup evaluation over the canonical fixture matrix
│   ├── PLAN.md               # controls, pilot stages, measures, decision rule
│   ├── matrix.json           # fixtures × controls × prompts × bundles × reps
│   ├── conditions.json       # controls plus the opt-in established-app strategies
│   ├── guidance/             # one document per patch, including both strategies
│   ├── run-setup.mjs         # sandbox + task + provenance preparation only
│   ├── setup-interactions.mjs # marker-driven dialog and nested-overlay opener
│   ├── setup-measure.mjs     # build + exact style, geometry, and overlay probes
│   ├── setup-workspace.mjs   # copy-on-write build root; the sandbox is never written to
│   ├── setup-integrity.mjs   # read-only diff attestation and escape-hatch checks
│   ├── setup-important.mjs   # syntactic `!important` detection for that checker
│   ├── setup-eval.ts         # strict deterministic deltas against each fixture
│   └── setup-aggregate.ts    # matrix coverage, A/B deltas, and final acceptance
├── results/             # Iteration results (gitignored)
└── README.md            # This file
```

## Canonical fixture suite

The three apps under `fixtures/` represent a plain Tailwind v4 control, an
established shadcn-style Tailwind v4 app, and an original enterprise-style app
with a marked guest design-system boundary. The two established-app fixtures
include controlled portal dialogs and nested tooltip/menu surfaces so setup can
measure clipping, occlusion, and layer order. They are standalone packages with
exact dependencies and lockfiles; none has Astryx installed.

Treat canonical fixture files as immutable inputs. Setup validates their pinned
recipe and SHA-256 manifest, then copies the listed files into a sandbox without
writing into the canonical directory:

```bash
pnpm -F @astryxdesign/vibe-tests fixtures:verify
pnpm -F @astryxdesign/vibe-tests fixtures:prepare -- tailwind-v4-control --output /tmp/tailwind-control-run
pnpm -F @astryxdesign/vibe-tests fixtures:build
```

When intentionally refreshing a fixture, update its pinned recipe, regenerate
its lockfile, review the authored patches, and refresh the recorded hashes:

```bash
pnpm -F @astryxdesign/vibe-tests fixtures:refresh -- tailwind-v4-control
```

The root repository guard verifies provenance, exact manifests, deterministic
source, dependency isolation, workspace exclusion, and separation from every
publishable package root. This keeps future setup or migration tests independent
of any unlanded harness branch.

Generated public artifacts never retain machine-local paths. Setup configs use
paths relative to their output directory; measurements identify the fixture and
redact private paths or hosts from build diagnostics; exported provenance uses a
generic usage-source label. Setup and universal aggregation fail closed before
emitting a report that still contains an absolute path or private host.
