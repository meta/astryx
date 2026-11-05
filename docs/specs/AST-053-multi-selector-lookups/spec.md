---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-053
authority: current
archive_reason: null
superseded_by: null
approved_by: josephfarina
approved_at: 2026-10-01
phase: accepted
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [cli]
---

# Complete multi-selector lookup receipts system spec

## Intent

An agent sometimes knows several exact subjects it must inspect. Repeating one CLI
process per subject wastes setup work and makes it easy to lose a failure between
successful calls. A lookup that accepts several selectors returns one complete,
ordered receipt: every requested selector has one row, ambiguity stays visible, and
the exit status says whether every lookup resolved.

This record owns the observable batch contract and adoption rule for CLI lookups over
independent exact selectors. FR11 E1-E5 are the only eligibility test. An eligible
read-only lookup adopts batching by default; an ineligible command keeps its existing
grammar. The lookup's existing authority still owns what a selector means, how one
selector resolves, and the data returned for one resolved subject.

## Non-goals

- Turning free-text search into a batch. Words in one search query remain one query.
- Applying this read-only lookup contract to mutations, streaming or watch sessions,
  comparisons, ranges, or commands whose positional arguments form one expression or
  ordered workflow.
- Changing existing CLI responses for zero or one positional selector, or existing
  programmatic responses for omitted and string arguments.
- Ranking candidates or choosing among ambiguous identities.
- Adding a global option, configuration key, environment variable, or network source.
- Changing a pre-existing batch response on a command that fails E1-E5. A `.batch`
  suffix alone does not make that response an AST-053 receipt.
- Equivalent internal implementations remain valid when they satisfy this contract.

## Requirements

- **FR1 — Batch selection is explicit and discoverable.** An adopting command MUST
  document its selector position as variadic in generated help and its manifest entry,
  and as an accepted array in its programmatic API. No hidden control enables the
  behavior.
- **FR2 — Every accepted selector gets one row.** After invocation-level validation, a
  batch receipt MUST contain exactly one result row per supplied selector, in input
  order. Duplicate selectors remain duplicate rows. A command MAY reject the whole
  request before resolution when its aggregate work would exceed a documented finite
  bound; that rejection uses the ordinary top-level `ERR_INVALID_ARGUMENT` error
  envelope, the CLI exits 1, and no batch is emitted. An accepted batch MUST NOT
  truncate or deduplicate selectors.
- **FR3 — Every row states its outcome.** Each row MUST echo the selector exactly and
  identify one state: `found`, `not_found`, `ambiguous`, or `error`.
- **FR4 — Found rows preserve single-lookup meaning.** A `found` row MUST carry under
  `result` the same typed response that the programmatic API returns for that selector
  by itself with the same controls and response-base fields. `spec:AST-047` FR10 decides
  whether a command has adopted navigable output, and its FR7 defines the `links` field
  after adoption. Single-result links stay nested with their row. The outer receipt
  carries links only when the command's own AST-047 adoption authority defines the
  receipt as a node; AST-053 does not synthesize moves. A caller does not reconstruct
  the single result from batch-only fields.
- **FR5 — Ambiguity is data, never a guess.** When several identities can satisfy a
  selector, the row MUST be `ambiguous` and list every effective candidate with the
  stable identity fields that the owning catalog exposes. The lookup MUST NOT choose
  the first candidate or silently prefer one namespace, provider, or package.
- **FR6 — Per-selector failures stay in the receipt.** A `not_found` or `error` row MUST
  carry the stable error code the same one-selector lookup uses, its human-readable
  error, and any structured suggestions. After a request is accepted as a batch, a
  per-selector failure MUST NOT become a top-level error, disappear, or become an empty
  success. Only validation or setup failures that apply to the invocation before any
  selector can resolve use the ordinary top-level error envelope.
- **FR7 — Exact qualifiers do not fall through.** When a selector carries an exact
  qualifier owned by the lookup, such as a package version or revision, it resolves
  only against that exact subject. A near identity with another qualifier is
  `not_found`, may point to the owning discovery or next-action command, and is never
  used as a plausible substitute.
- **FR8 — The full receipt precedes failure.** The CLI MUST emit every row, then exit 1
  when any row is not `found`. Text and JSON modes use the same exit status. The
  programmatic API returns the complete typed receipt and leaves process exit policy
  to its caller.
- **FR9 — Existing cardinalities and positional meaning stay stable.** For an adopting
  command, zero selectors preserve the command's existing zero-selector behavior,
  whether browse or error; one selector preserves its existing success or error
  response; and two or more selectors use the batch discriminator. Only the owned
  selector position becomes variadic. Other positional arguments keep their existing
  relationship and order. In the programmatic API, an omitted argument preserves its
  existing behavior, a string requests one result, and an array requests a batch at
  every array length, including zero and one.
- **FR10 — Text is a projection of the batch.** Human-readable output MUST expose the
  count and every row's selector, status, and state-specific fields through the shared
  formatter vocabulary. Outer response fields stay on the receipt, and fields from a
  nested single result stay with that row; nested links MUST NOT be promoted to the
  receipt. Text MUST NOT invent a command-specific table or omit a field that JSON
  carries.
- **FR11 — Eligibility has one test.** A command is eligible exactly when all five
  conditions hold:
  - **E1:** it is read-only and its selector position accepts one exact stable subject;
  - **E2:** selectors resolve independently, without a relationship or order between
    them, and the same options and other positional arguments apply to each;
  - **E3:** each result is finite and the command can return the complete accepted
    receipt before exit;
  - **E4:** one documented aggregate work bound can safely accept at least two
    selectors in every supported option and projection mode, and resolving the set adds
    no side effect; and
  - **E5:** the selector is the command's final positional argument, so making it
    variadic does not reinterpret a following positional.
    A command admitted after this record became current that satisfies E1-E5 MUST adopt
    the contract before its first public release. An existing command that satisfies
    E1-E5 SHOULD migrate without changing its zero- and one-selector contracts. If any
    condition fails, the command is not eligible.
- **FR12 — Every adopter uses one batch vocabulary.** The discriminator MUST be
  `<subject>.batch`, where `<subject>` is the stable subject family used by the
  command's single-result responses. Under `architecture:cli-surface` INV2, `type`
  carries that discriminator and `{count, results}` is the `data` payload. The shared
  CLI response foundation MUST own and publish `BatchResponse` and `BatchRow` for that
  payload and the four row states; subject API modules specialize those types with
  their candidate and single-result types. An adopter MUST NOT invent synonymous
  discriminator, status, or row field names. A pre-existing batch response on an
  ineligible command keeps its command-owned contract and does not claim AST-053
  conformance merely because its discriminator ends in `.batch`.
- **FR13 — Admission records the classification.** Command admission under AST-042 MUST
  classify the selector position against E1-E5. A top-level command's exclusion MUST
  name the failed condition in a current command-owning record; a draft does not count.
  A subcommand's exclusion MUST name the condition in its admitting pull request under
  AST-042's existing code-owner approval bar. After typed admission metadata lands, its
  CommandDoc MUST retain the same classification. Until that metadata and a repository
  check land, FR11 and this requirement are enforced in review rather than
  mechanically.

### Platform support

- Supported feature/engine floor: every runtime already supported by the owning CLI
  command.
- Unsupported behavior: none. A command that is not eligible keeps its existing
  grammar.
- Browser evidence: not applicable; this is a CLI and programmatic API contract.

## Adoption and rollout

FR11 E1-E5 govern eligibility. Typical adopters are `get`, `show`, `inspect`, and
status-style reads over exact identities. The examples below illustrate a failed
condition; they do not replace the E1-E5 test:

- free-text search or discovery fails E1 because several words form one query;
- create, update, delete, apply, or other mutations fail E1 and E4 because they need
  separate transaction and partial-write semantics;
- compare, diff, range, pipeline, or workflow commands fail E2 because argument
  position defines a relationship rather than independent subjects;
- watch, shell, stream, or interactive commands fail E3 because they do not return one
  finite receipt;
- commands whose selector is followed by another positional fail E5 in the current
  grammar; and
- lookups that cannot safely accept at least two selectors in every supported mode fail
  E4.

Adopt the contract one command at a time:

1. Classify the owned selector position against E1-E5 during AST-042 admission. Record
   any exclusion exactly as FR13 requires.
2. Define and document the aggregate work bound, including selector count and any
   command-specific cost dimension. It must safely accept at least two selectors in
   every supported mode. Reject work beyond it before resolution with top-level
   `ERR_INVALID_ARGUMENT` and CLI exit 1; never truncate an accepted batch.
3. Preserve existing zero- and one-selector behavior and minimum cardinality. Make
   only the owned selector position variadic; do not reinterpret another positional.
4. Make programmatic batch intent explicit with an array at every array length. Use
   the shared batch response and row types, the `<subject>.batch` discriminator, and
   the existing one-selector response under each `found.result`.
5. Preserve outer and nested response-base fields, then apply every existing read
   projection and option to each `found` row. Do not ship a reduced batch-only detail
   surface.
6. Add generated help, manifest/API docs including `exitCodes`, a searchable guide,
   real text and JSON receipts, and deterministic coverage for oversized rejection,
   empty and one-item API arrays, order, duplicates, all-found, mixed, all-failed,
   ambiguity, response-base fields, and every projection.

## Current-state impact

The component lookup remains the designated first adopter. Its runtime implementation
lands separately from this specification amendment and MUST apply FR1-FR12 before it
claims compliance. CLI browse and single-selector response types stay unchanged;
programmatic callers choose the catalog with an omitted argument, one result with a
string, and a batch with an array. `architecture:cli-surface` keeps ownership of the
outer envelope, formatter vocabulary, generated help, and API to CLI parity.

AST-042 projects the E1-E5 classification into command admission for FR13. The next
rollout phase adds typed classification to CommandDoc and the generated manifest, then
classifies every existing exact selector position. Those public command docs and the
manifest become the canonical inventory. Later changes migrate each eligible command
family. External scheduling is not authority and its references do not enter this
public repository. Each command's own current authority continues to own selector
grammar, single-result data, and any recorded exclusion.

## Verification

| Contract | Verification                                                       | Representative states                                                        | Mutation or failure expectation                                                            |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| FR1      | Generated help and manifest tests; FunctionDoc contract tests      | one selector position becomes variadic                                       | Batch input exists in code but is absent from help, manifest, or API docs                  |
| FR2, FR3 | Programmatic API and CLI batch tests                               | minimum useful bound; oversized rejection; order; duplicates; mixed outcomes | An accepted selector is reordered, deduplicated, dropped, or has no state                  |
| FR4      | Batch versus single-result and response-base comparison            | detail, links, and each supported focused projection                         | A found row differs from the same one-selector result                                      |
| FR5      | Ambiguous installed-identity fixture                               | two effective package owners for one name                                    | One owner is chosen or a candidate is omitted                                              |
| FR6, FR7 | Missing, malformed, unknown-package, and version-mismatch fixtures | suggestions present and absent; another version installed                    | A selector failure escapes the receipt, loses its code, or uses another qualifier          |
| FR8      | Text and JSON process tests                                        | all found; one failure; several failures                                     | Output stops at the first failure or an unresolved batch does not exit 1                   |
| FR9      | CLI cardinality, positional-meaning, and API input-shape tests     | zero browse/error; one; many; empty and one-item arrays                      | Existing cardinality changes, another positional becomes a selector, or array shape drifts |
| FR10     | Text projection and navigable-output tests                         | every row state; outer fields with and without links                         | Text omits a JSON field, moves a nested link, or draws an unregistered output format       |
| FR11     | AST-042 admission review                                           | E1-E5 eligible adopter; top-level and subcommand exclusions                  | An eligible new command is single-only, or an exclusion does not name a failed condition   |
| FR12     | Shared JSON/type contract and manifest tests                       | `<subject>.batch`; every shared row state                                    | An adopter invents a discriminator, status, or row field                                   |
| FR13     | Knowledge-reference, pull-request, and typed-metadata review       | current top-level record; subcommand evidence; draft exclusion               | Admission skips classification or uses the wrong evidence for its tier                     |

## Decision log

### DEC-1 — A batch is a complete ordered receipt

**Reference:** `spec:AST-053/DEC-1`
**Decider:** `josephfarina`, `2026-10-01`

Batch lookup exists to reduce repeated process work without hiding what happened to
any accepted request, so accepted selectors remain one-for-one and in order, including
duplicates. A work-bound rejection happens before batch resolution and returns no
partial receipt.

Rejected: fail an accepted batch on the first miss, which loses later answers; drop
failed selectors, which makes partial work look complete; or truncate an oversized
request after resolution begins.

### DEC-2 — Ambiguity lists candidates

**Reference:** `spec:AST-053/DEC-2`
**Decider:** `josephfarina`, `2026-10-01`

An unqualified identity can belong to several namespaces, providers, or packages. The
receipt exposes every effective candidate so the caller can make the next lookup
exact.

Rejected: precedence or first-match selection, which turns catalog order into an
undocumented answer.

### DEC-3 — An unresolved row makes the CLI fail after output

**Reference:** `spec:AST-053/DEC-3`
**Decider:** `josephfarina`, `2026-10-01`

Automation needs the process status to say whether every requested lookup resolved,
while the receipt is still useful for fixing all failures in one pass, so any
unresolved row exits 1 after output.

Rejected: exit zero because some rows succeeded, which reports incomplete work as
success; and emit no receipt on failure, which forces repeated calls.

### DEC-4 — Input shape makes batch intent explicit

**Reference:** `spec:AST-053/DEC-4`
**Decider:** `josephfarina`, `2026-10-01`

Existing CLI callers keep the zero- and one-selector behavior they already parse.
Programmatic callers choose those paths with an omitted argument or a string, and
choose a complete batch receipt with an array. Empty and one-item arrays remain
batches, so filtering a selector list never changes the response type.

Rejected: making an array's response depend on its length, which makes an explicit
batch call change shape as a caller filters selectors; and always returning a batch
for strings, which changes the stable JSON shape for existing callers.

### DEC-5 — Independent read-only lookups batch by default

**Reference:** `spec:AST-053/DEC-5`
**Decider:** `josephfarina`, `2026-10-01`

Repeated process setup and fragmented failures are common to every lookup that meets
E1-E5, not only component docs. Commands admitted after this record became current
adopt the shared batch vocabulary in their first public release. Existing eligible
commands migrate one at a time without changing zero- and one-selector behavior.

Rejected: leaving adoption entirely optional, which produces a different batching
model for each command; and making every multi-argument command a batch, which breaks
search queries, mutations, comparisons, workflows, and interactive sessions whose
arguments are not independent read-only subjects.

## Open questions

None.
