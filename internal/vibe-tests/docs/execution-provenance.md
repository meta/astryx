# Execution provenance

Vibe-test runners may emit an optional, executor-neutral provenance sidecar for each result. The canonical filename is `<promptId>.provenance.json`, beside `<promptId>.tsx` and `<promptId>.json`.

The version 1 contract is defined by:

- `schema/execution-provenance-v1.schema.json` for JSON Schema consumers
- `src/provenance.ts` for the TypeScript type and parser

Unknown fields are preserved so producers can add data without breaking version 1 readers. A reader rejects an unknown `schemaVersion`. Missing sidecars and valid partial sidecars use the legacy aggregation fallbacks. A sidecar that exists but is malformed is an error.

## Example

```json
{
  "schemaVersion": 1,
  "task": {
    "id": "profile-card",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "fixture": {
    "id": "starter-project",
    "commit": "0123456789abcdef"
  },
  "condition": "setup",
  "rep": 1,
  "executor": {
    "harness": "local-cli",
    "model": "example-model",
    "effort": "standard",
    "harnessVersion": "2.0.0",
    "runnerVersion": "1.4.0"
  },
  "execution": {
    "status": "succeeded",
    "startedAt": "2026-01-02T03:04:05.000Z",
    "finishedAt": "2026-01-02T03:04:09.000Z",
    "durationMs": 4000,
    "attempt": 1,
    "retry": 0
  },
  "usage": {
    "inputTokens": 1200,
    "outputTokens": 340,
    "source": "runner",
    "complete": true
  }
}
```

Labels under `executor` are opaque. The framework does not interpret or restrict runner, harness, model, or effort names.

## Aggregation

`universal-aggregate.ts` preserves a per-run summary and groups results by:

- harness and model together
- fixture, when present
- condition, when present

It accepts `--harness`, `--model`, `--fixture`, and `--condition` filters. Old results are grouped under `unknown` harness and model labels.

Sidecar duration and token usage take precedence over legacy metadata and estimates. Every selected value carries a source and quality. Token totals are comparable only when every run in the group has `usage.complete: true`; otherwise grouped totals are `null` and the complete/incomplete run counts explain why.

## Runner migration

Existing runners do not need to change their result JSON. Add the sidecar beside each result and let `collect-results.mjs` copy it. Use `expandExecutionMatrix` from `src/provenance-matrix.ts` when a setup or adoption runner needs the Cartesian product of harness, model, effort, condition, and repetition.

This is an additive adapter contract: specialized runner branches can rebase, emit version 1 sidecars, and keep their current task/result formats. Do not put raw prompts, filesystem paths, credentials, or tool transcripts in provenance; use stable IDs and hashes instead.
