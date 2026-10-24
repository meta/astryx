---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-017
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-24
phase: accepted
owners: [cixzhang, josephfarina]
affects_architecture:
  [
    architecture:public-component-api,
    architecture:cli-surface,
    architecture:theme-tokens,
  ]
affects_families: []
affects_contributing:
  [
    contributing:release-process,
    contributing:templates,
    contributing:cli-conventions,
  ]
affects_consumer_docs: [release-process, templates]
---

# Release Compatibility & Versioning system spec

<!-- review-applicability:v1 -->

```json
{
  "scope": "global",
  "triggers": {
    "compatibility": [
      "DEC-1",
      "DEC-5",
      "DEC-6",
      "DEC-7",
      "DEC-8",
      "DEC-9",
      "DEC-10",
      "DEC-11",
      "DEC-12",
      "DEC-13",
      "DEC-14",
      "DEC-17",
      "DEC-18",
      "DEC-19",
      "DEC-20",
      "DEC-21",
      "FR3",
      "FR4",
      "FR5",
      "FR12",
      "FR14",
      "FR15",
      "FR16",
      "FR17",
      "FR18",
      "FR19",
      "FR20",
      "FR21",
      "FR22",
      "FR23",
      "FR24",
      "FR25",
      "FR26",
      "FR27",
      "FR28",
      "FR29",
      "FR29a",
      "FR29b",
      "FR29c",
      "FR29d",
      "FR30",
      "FR31",
      "FR32",
      "FR33",
      "FR34",
      "FR35",
      "FR36",
      "FR37",
      "FR38",
      "FR39",
      "FR40",
      "FR41",
      "FR42",
      "FR43",
      "FR44",
      "FR45",
      "FR46",
      "FR47",
      "FR48",
      "FR49",
      "FR50",
      "FR51",
      "FR52",
      "FR53",
      "FR54",
      "DEC-15",
      "DEC-16",
      "DEC-22"
    ]
  }
}
```

## Intent

Give contributors, reviewers, and release owners one durable contract for evolving
published Astryx surfaces. Classify every change from the installed consumer it
affects, isolate experimentation from stable behavior, stage deprecations and
behavior corrections explicitly, and make a planned minor traceable to one locked
final-patch baseline.

A valid consumer of the latest stable release is the compatibility test. The label is
not a risk or severity score: a small rename can be incompatible, while a large
rewrite can remain compatible when released usage is preserved. A real bug can also
be incompatible when consumers validly rely on its released behavior; that case is a
`[breaking]` change that names the authority the released behavior violated and lands
in a declared minor (FR31–FR34).

Components take their compatibility rules from this spec. Every other published
surface, such as the CLI, takes its compatibility contract from its own current record
(FR54). Every surface goes through the one release process this spec defines.

For CLI controls, keep every supported behavior discoverable and put each control on
the narrowest surface that owns it. Global controls require evidence that their value
and meaning are global. Cross-cutting guarantees must be complete, observable, and
independent for each invocation.

Admission is part of that contract. Main declares the next planned version, and a
release branch releases exactly that version. Incompatible work ships only in a
release whose declared version is a minor. A release does not change shape because
one removal merged ahead of the decision to allow it.

## Non-goals

- Freezing implementation details or every byte of generated example code.
- Defining component or template naming conventions.
- Treating private packages, canaries, unreleased work, or explicitly marked
  experimental surfaces as stable public API.
- Replacing the public Release Process, Changesets, migration tooling, or direct
  component and feature authorities. This spec owns the lifecycle and evidence those
  mechanisms implement; it does not duplicate their operational or product rules.

## Requirements

- **FR1 — Breaking changes require caller adaptation.** A change is breaking only
  when a valid consumer scenario supported by the latest stable release of a
  published package must change source or configuration to keep its code,
  interaction, data, semantic output, or supported workflow working, or loses a
  stable public surface. The review names that scenario and the released surface
  it uses. For a surface other than a component, FR54 decides which scenarios are
  valid and supported.
- **FR2 — Classify against the latest stable release.** A surface added and then
  renamed, removed, or reworked before any stable release has no installed
  consumer and is not breaking. Private or ignored packages are outside the
  published compatibility promise. Promotion from a private package into a
  published package is additive from the published side.
- **FR3 — Released contracts include function and semantics, not exact appearance.**
  Compatibility covers public exports and import paths; requiredness, accepted values,
  defaults, return types, callbacks, and error behavior; documented interaction and
  accessibility behavior; stable CLI command names, options, exit behavior, and
  machine-readable schemas; and other explicitly documented public extension points.
  Internal implementation, undocumented markup, source layout, and exact appearance are
  not stable merely because a consumer can observe them. A change only to existing
  content's appearance, spacing, typography, layout styling, or visual default is
  nonbreaking when public API, accepted inputs, interaction, accessibility semantics,
  data, and machine-readable output keep working. It uses `[fix]` when it restores
  current visual authority and `[feat]` when it intentionally changes visual direction.
  Its Changeset names the old and new appearance and how to keep the old look when a
  supported escape exists. A default that changes a functional or semantic contract is
  judged under FR1 instead. Its Changeset names the old and new default and the prop or
  option that restores the old default, which is the migration. When the new default is
  a touch presentation or an open-surface touch input mode
  (`architecture:public-component-api` INV16), that restoring input is the component's `presentation` value that keeps its previous
  surface and input mode. A change to documented
  interaction or accessibility behavior made for accessibility conformance is
  classified under FR53.
- **FR4 — Preserved old usage is nonbreaking.** A rename or replacement is
  nonbreaking when the old released call, import, option, identifier, or input
  continues to work with equivalent meaning through a compatibility alias or
  adapter. A deprecation may warn and point to the replacement, but removing that
  compatibility path is the breaking event.
- **FR5 — Additive and victim-free contract restorations are nonbreaking.** New
  optional capabilities, new components, new commands, broader accepted inputs, and
  new templates are nonbreaking when old usage is unchanged. A fix that restores an
  already-documented contract is nonbreaking only when no valid consumer of the
  released faulty behavior must change. When a supported consumer relies on that
  behavior and the correction breaks the consumer, FR32–FR35 classify it as an
  incompatible fix even though the implementation violated authority. A proposal
  that intentionally replaces the documented contract is not a fix, except an
  accessibility behavior fix under FR53.
- **FR6 — Risk does not override compatibility.** Low adoption, low likelihood,
  engineering approval, or confidence that affected callers are uncommon does not
  make an incompatible released contract nonbreaking. Conversely, implementation
  size, visual scope, or review difficulty does not make a compatible change
  breaking.
- **FR7 — Changeset tags and lifecycle metadata are orthogonal.** Existing primary
  tags remain the authoring vocabulary: corrections use `[fix]`, compatible
  capabilities and replacement-first staging use `[feat]` or the established narrower
  tag, approved removals use `[breaking]`, and confined experiments use
  `[experimental]`. The tag and the Changeset body are the whole declaration: a
  victim-free correction is `[fix]` with a patch bump; a replacement-first
  deprecation is `[feat]` that names the replacement and the migration and stays
  patch-compatible while old usage works; a removal or a behavior-correcting
  incompatibility is `[breaking]` and states the old valid usage, the replacement or
  corrected behavior, and the migration (FR8). Lifecycle ids (`DEP-*`, `IFIX-*`,
  `CLN-*`) and classification metadata are optional descriptive cross-references,
  never a requirement to merge. While Astryx packages remain on `0.x`, the
  incompatible tier is minor; compatible work is patch. A Changeset's bump states the
  tier its change requires; it never sets the release version, which is the version
  main declares under FR46.
  Documentation-only, test-only, and private-package-only changes need no Changeset.
  Translation-catalog updates and newly added languages need no Changeset, nor
  English-catalog description or formatting edits that preserve every message key
  and default message. This exemption never covers removal of a released locale
  import path, which follows FR3–FR4 and FR31.
  Existing Changesets keep their current tag and validated bump semantics and MUST NOT
  be mass-migrated. `pnpm changeset:new` remains the authoring path, and
  `pnpm check:changesets` validates tag, bump, contributors, and the declared tier;
  the migration text is reviewed under FR8. Classify each published package update in
  multi-package work. A fixed-group version-only co-bump needs no Changeset entry by
  itself, but a generated dependency or peer-range edit is part of that package's
  update and must be classified and named. When primary tags differ, use separate
  Changesets so each package retains its own author-facing category.
- **FR8 — Migration evidence matches the affected surface.** Every planned removal
  and incompatible fix names the old valid usage, the replacement or corrected
  behavior, and how consumers migrate. Supply an `astryx upgrade` codemod when
  consumer source, configuration, metadata, or project files can be rewritten
  mechanically. When no rewrite is possible, preserve an explicit compatibility
  adapter or provide concrete replacement instructions and record why a codemod would
  be vacuous. Codemods follow `spec:AST-040` and include positive, negative, and
  second-run idempotence fixtures plus downstream proof.
- **FR9 — Template slugs are mutable catalog data.** A template slug identifies an
  entry in the current template catalog; it is data about that template, not a
  contractual CLI API. Renaming a slug is nonbreaking even when
  `astryx template <old-slug>` no longer resolves. The Changeset and release note
  describe the catalog rename so builders can find the new value, but the rename
  does not use the `[breaking]` category or require an alias or codemod.
- **FR10 — Template content and metadata are expected to evolve.** Adding a
  template, rebuilding its starter source, or changing its slug, human-facing
  name, description, category, keywords, or example data is nonbreaking while the
  CLI's stable command and machine-readable schema contracts remain compatible.
  Generated starter code is not promised byte-for-byte stability across releases,
  and existing projects are not rewritten when a template improves.
- **FR11 — The CLI contract surrounds the catalog.** The `template` command name,
  supported options, exit behavior, and machine-readable response schema are
  contractual surfaces under FR3. Individual catalog values returned through that
  schema, including template slugs, names, descriptions, categories, keywords, and
  starter content, are not independently stable API identifiers.
- **FR12 — Supported inter-package ranges are contracts.** For an update to a
  published package, its latest stable release's documented installation scenarios
  and declared dependency or peer ranges define the supported companion package
  versions. The update is breaking for that package when upgrading it alone makes
  any such combination stop working unchanged, including by narrowing or raising
  the range. A coordinated upgrade that works does not change that classification.
  A dependency bump is not breaking when every previously supported combination
  keeps working. Keep every previously supported version in range and provide an
  adapter when needed; otherwise classify the narrower or higher-floor range as
  breaking, describe the range change in its Changeset release note, and meet FR8's
  migration obligation.
- **FR13 — Stable machine schemas project every field.** A stable CLI response
  contract includes fields inside discriminated `data` entries as well as the
  outer envelope. Every field is present in the canonical response type, contract
  tests, text projection where the command provides one, and complete
  consumer-facing schema documentation. Adding an optional field is nonbreaking
  when old consumers continue unchanged, but it remains a public schema update and
  does not bypass current-authority review or documentation.
- **FR14 — No supported CLI behavior is hidden.** Any Astryx CLI behavior
  available in a supported flow—including behavior selected automatically and
  behavior selected by an Astryx-owned control—is a public surface and MUST be
  documented and discoverable. Every caller-settable control that changes command
  selection, work, output, side effects, or exit behavior is part of that surface,
  whether spelled as a command, option, positional argument, package field, or
  configuration key. The CLI MUST NOT define or read an Astryx-owned environment
  variable for any purpose. A variable is Astryx-owned when Astryx defines its
  semantics, regardless of its name or prefix; standard platform variables remain
  outside this prohibition unless Astryx assigns them an Astryx-specific meaning.
  Automation MUST use the documented programmatic API.
  Public controls MUST define their accepted values, default, precedence and
  interactions, error behavior, and a representative invocation. Commands and
  options MUST appear in generated help and the machine-readable manifest.
  Automatic behavior and other controls MUST either appear there or be linked from
  those discovery surfaces to consumer documentation. A
  normal invocation mode MUST have a documented command, option, or configuration
  surface. Private test hooks and maintainer rollout gates MAY affect tests,
  diagnostics, or staged availability without becoming public controls, but they MUST
  NOT use environment variables, require action from supported consumers, or serve as
  the sole interface to a supported mode. The user-facing behavior they gate remains
  subject to this requirement once supported.
- **FR15 — Global controls require CLI-wide value and semantics.** An option is
  global when the root parser accepts it across commands or the manifest lists it in
  `globalOptions`. A new behavior-changing option MAY be global only when it
  represents one coherent CLI-wide invariant, solves a demonstrated
  supported-consumer need that a narrower surface cannot solve, and has defined,
  meaningful, non-no-op behavior for every executable command and subcommand. The proposal MUST enumerate those surfaces
  from generated help and the machine-readable manifest and state the control's
  behavior, output or error effect, and verification for each one. A command on
  which the control has no meaningful effect is evidence that the proposed scope is too broad. A behavior that applies to only part of the
  CLI MUST be placed on the nearest command, command group, or programmatic API that
  owns it. The same name MUST keep the same meaning throughout that scope, and names
  MUST describe the exact controlled capability rather than make broad claims such as
  `safe`, `secure`, `trusted`, or `isolated`. A safety or trust control MUST also
  define its trust boundary and fail closed before untrusted input can execute or
  cause a side effect.
- **FR16 — Cross-cutting guarantees define and close their boundary.** A claim that
  prevents a class of execution, data access, or side effect MUST define the trusted
  inputs, denied actions, and the points where protection begins and ends. It MUST
  cover every current entry point and fail closed for an unknown or newly added
  extension point.
- **FR17 — Suppressed work is observable.** When a safety or reduced-capability
  control intentionally omits a normally available source, capability, or unit of
  work, every successful machine-readable result MUST identify the active mode and
  what category was omitted. Human-readable output MUST project the same fact. A
  partial or empty result MUST NOT look like an ordinary complete success. If the
  operation cannot produce a useful conforming result, it MUST return a stable
  structured error and, for the CLI, a nonzero exit code before any write or external
  side effect.
- **FR18 — Programmatic controls are explicit and invocation-scoped.** A
  programmatic control MUST be an explicit API input and MUST NOT depend on ambient
  mutable process state. Concurrent calls MUST be able to select different values
  independently. When the CLI and programmatic API expose the same control, they MUST
  share accepted values, defaults, precedence, observable behavior, and error
  semantics.
- **FR19 — Configuration is admitted only on evidence.** A new configuration key,
  or a new accepted value that changes CLI behavior, MUST be justified by a
  reproducible supported-consumer case in which automatic detection and
  established project conventions produce the wrong result. The proposal MUST
  record that case and the convention it tried first. When an established
  convention or automatic detection can express the need, the CLI MUST use it
  instead of adding configuration. Configuration MUST NOT duplicate a value the
  CLI can derive.
- **FR20 — Integration contributions compose predictably and visibly.** A
  configuration setting MAY accept contributions from integrations only when its
  entry in the public configuration contract (the exported `AstryxConfig` type
  and the configuration schema reference consumers read through the CLI) states:
  that integrations may contribute; the exact form of a contribution; how the app
  value and all contributions combine, and in what order; the one documented
  control through which an app refuses inherited contributions; and what happens
  when a contribution fails. The setting owns that rule; an integration cannot
  change it. An integration declares each contribution statically in its
  integration module, either as a field of the exported `AstryxIntegration`
  manifest type or as a documented named export, and the integration authoring
  reference documents that form. Importing an integration module MUST NOT
  contribute anything as a side effect. The CLI MUST let a caller inspect the
  effective value of each such setting and the source of each part (the app or a
  named integration) through a documented command or programmatic API. Unless a
  setting's contract states and justifies otherwise: app and integration
  contributions combine rather than replace one another; the app's own value
  applies first, then integrations in their resolved order; a failing
  contribution is skipped without removing the others or changing the command's
  result; the app refuses all inherited contributions through one documented
  control; and loading the project more than once in one invocation applies each
  contribution once. No integration contribution can remove or weaken a value
  supplied by the app or by another integration. When a setting protects the
  project, a failed contribution MUST fail closed instead of being skipped.
- **FR21 — Experimental APIs are explicit and opt-in before publication.** A
  public surface inside a stable published package is outside the stable
  compatibility promise only when its first stable release exposes it through a
  canonical experimental boundary and marks it in both declarations and consumer
  documentation. On an existing stable component, experimental props and callbacks
  live inside one optional `experimental` prop object; omitting that object preserves
  the component's stable defaults and behavior. Experimental hooks, functions, and
  types use the owning component's `/experimental` import subpath and are not
  re-exported from the package root or the component's ordinary subpath. Declarations
  carry `@experimental`; authored docs carry machine-readable
  `stability: 'experimental'` metadata and state that the surface may change or be
  removed in a patch release. Prose-only warnings and reviewer knowledge do not
  establish this boundary.
- **FR22 — Experimental changes are patch-level and stay confined.** Adding,
  changing, renaming, or removing an explicitly experimental surface uses an
  `[experimental]` Changeset and a patch bump. An incompatibility confined to that
  boundary is `[experimental]`, not `[breaking]`; the Changeset authoring and
  validation process MUST derive and enforce a patch bump for the category even when
  the experimental surface changes incompatibly. Its release note names the affected
  surface and replacement when one exists. A compatibility alias is optional; a
  codemod is supplied when a mechanical migration would materially reduce caller
  work. This exception never covers a change to stable defaults, stable runtime or
  accessibility behavior, ordinary import paths, non-experimental props, or stable
  CLI commands and machine schemas; those changes follow FR1–FR8. A released stable
  surface cannot be retroactively demoted to experimental.
- **FR23 — Promotion creates a stable contract deliberately.** Promotion is an
  owner-approved change that removes the experimental marker, exposes the settled
  prop, callback, hook, function, or type on its normal stable surface, and uses a
  `[feat]` Changeset. From that release forward, FR1–FR8 protect the promoted surface.
  Moving a component API out of the `experimental` prop object or moving an export
  out of a component's `/experimental` subpath names the stable replacement and
  supplies a codemod when the rewrite is mechanical. Keeping a deprecated
  experimental alias for a transition is encouraged but is not itself part of the
  new stable promise.
- **FR24 — Experimental status is verified per public surface.** Release review
  compares the previous published surface with current declarations and authored
  docs, verifies that their experimental markers agree, and rejects an
  `[experimental]` Changeset when any incompatible delta reaches a stable surface.
  Integration-theme contribution capability remains the one grandfathered surface;
  no other released surface may be enrolled retroactively. Its contribution
  metadata, discovery, and authoring contract may evolve in patch releases until an
  explicit promotion removes the marker. This prohibition does not turn an
  unpublished field or behavior into stable API merely because an adjacent feature
  was released. Integration-template replacement-specific fields and behavior—its
  `replaces` declaration, replacement selection, optional list projection, and
  expanded conflict fields—remain pre-publication surfaces under FR2 until their first
  stable release; that classification is not experimental enrollment. Previously
  released same-id conflict warning behavior remains stable. The surrounding stable
  CLI command names, options, exit behavior, and machine-readable envelope remain
  protected under FR3 and FR13.
- **FR25 — Stable Core and every published stable package default to compatibility.**
  Outside a declared minor, changes to behavior, types, exports, CSS or tokens,
  documented markup or selectors, accessibility semantics, persistence, CLI,
  configuration, schemas, build tooling, contractual documentation operations, and
  package files MUST be additive, implementation-equivalent, a nonbreaking default
  change under FR3, a victim-free contract restoration under FR5, or an accessibility
  behavior fix under FR53; a breaking change lands only in a declared minor (FR31). Documentation catalog names and routes
  follow
  FR45. An internal label, low adoption, or lack of a source-level API change does
  not weaken this rule.
- **FR26 — Public lifecycle state is explicit.** Each public surface is
  `experimental`, `stable`, `deprecated`, or `removed`; private and unreleased surfaces
  remain outside the published lifecycle. Stable cannot become experimental. Deprecated
  behavior remains supported until a `[breaking]` removal merges for a declared minor
  (FR31).
- **FR27 — Experimental isolation covers every surface kind.** Whole experimental
  components remain in the private canary-only Lab package governed by the public
  Component Lifecycle. FR21 continues to govern stable-component props and exports.
  Experimental CLI controls use a dedicated experimental namespace; configuration
  uses an experimental object; CSS and tokens use dedicated experimental exports and
  names; persistence uses a feature- and schema-versioned experimental namespace;
  build tooling uses experimental exports/configuration; and docs use marked
  experimental routes. An omitted opt-in MUST leave stable defaults, output, routes,
  data, and behavior unchanged. Promotion requires owner approval and a `[feat]`
  Changeset; withdrawal uses `[experimental]` and MUST prove no stable spillover.
- **FR28 — A planned minor needs no prior deprecation; a patch does.** A change
  landing in a declared minor needs no deprecation path: its `[breaking]` Changeset
  describing the change, with the replacement and migration where they help the
  reader, is enough. A deprecation path is required only when the next planned release
  is a patch, because a compatible release can only prepare a break: the patch ships
  the working replacement while old usage remains equivalent, with an exact migration
  command or codemod when the rewrite is mechanical or ordered, testable instructions
  when it is not, and the removal lands in a later minor. A public record MAY describe
  a deprecation with a stable `DEP-*` id and its replacement, migration, and state; the
  record describes and never gates.
- **FR29 — Deprecation adds no production-runtime behavior.** Marking a surface
  deprecated MUST NOT add a production runtime branch, log, byte, network action,
  changed render, or changed output. Compatibility code needed to keep an already
  released old contract working is separate from warning delivery and MUST preserve
  that contract. A development-only runtime diagnostic is permitted only when runtime
  information is necessary to explain an ambiguous coexistence state, such as both an
  old and replacement prop being supplied; it explains the direct owner's precedence
  rule and is not the primary deprecation channel.
- **FR29a — Warnings live at the earliest accurate authoring surface.** TypeScript
  declarations use static `@deprecated` metadata. Build-interpreted source and
  configuration warn in the authoring, validation, or build reader that can name the
  exact source use. CLI commands and options expose the replacement
  in their machine result and emit at most one human-readable stderr warning per
  invocation. CSS and tokens use static diagnostics. Rendered applications never emit
  a warning merely because a deprecated surface is used. Warnings MUST NOT change a
  successful exit status, canonical output, machine-readable stdout, generated output,
  or rendered behavior.
- **FR29b — Guidance teaches one modern path.** Every warning names the exact
  replacement, stable versioned instructions, and exact migration command when one
  exists. Maintained API docs, generated docs, templates, examples, stories,
  starter output, and agent-facing guidance teach only the replacement. Explicit
  reference remains available for the deprecated surface, visibly labeled with the
  same replacement and modernization route. A warning MUST NOT ship before those
  instructions and that route exist.
- **FR29c — Modernization is safe and verifiable.** A mechanical migration is
  previewable, idempotent, evidence-scoped, and complete under `spec:AST-040`; it
  preserves the old observable result as its baseline and reports every uncertain or
  blocked case. Non-mechanical migration gives short, ordered, testable instructions
  rather than saying only to update manually. The direct owner names the applicable
  source, type, build, runtime, visual, accessibility, and CLI proof. Maintained Astryx
  packages and authoring surfaces migrate in the deprecation patch.
- **FR29d — Each public surface projects the lifecycle without inventing another one.**
  Whole components remain exported, renderable, accessible, themeable, and explicitly
  discoverable, but leave recommendations and copyable examples; their exports and
  docs carry the replacement and modernization route, with no render-time deprecation
  warning. Deprecated props and values keep old-only behavior, declare deterministic
  old-plus-new precedence, and statically name the replacement; codemods rewrite proven
  static uses and report spreads or dynamic expressions they cannot prove. Theme API
  fields, helpers, tokens, targets, and source keep identical normalization and rendered
  output; declarations use `@deprecated`, and theme build or validation reports exact
  source uses without `defineTheme`, theme mounting, or applications warning at
  runtime. Deprecated CLI commands and options remain accepted with their released
  exit status, canonical stdout, JSON envelope, and side effects; help and explicit
  lookup label them, human mode warns once on stderr, machine mode carries the
  deprecation metadata, and generated examples use the replacement. When old and new
  CLI controls coexist, their direct command contract defines precedence or rejects
  the ambiguous combination identically in text and JSON modes.
- **FR30 — Deprecation minima come only from direct authority.** This global spec
  imposes no elapsed-time or release-count minimum. The structural minimum is that the
  final patch preserves old and new behavior together. A direct current spec MAY
  require a duration or number of stable releases for its own surface and names it
  there. Release cadence MUST NOT be
  interpreted as a deprecation clock or eligibility gate.
- **FR31 — No breaking change ships without a planned minor; the gate is the declared
  version.** When `main` declares a minor (`x.y.0`), a `[breaking]` Changeset is
  admitted and the change merges on ordinary review and CI. When `main` declares a
  patch (`x.y.z`, `z > 0`), any `[breaking]` Changeset fails pull-request CI; what may
  merge is the deprecation under FR28. `pnpm check:changesets` enforces this on every
  pull request from the fixed group's declared version. Each incompatible delta maps to
  exactly one `[breaking]` Changeset, which is the one place a reader finds the
  description; maintained sources teach the replacement once the removal lands.
  Lifecycle records and the release manifest describe removals; neither gates a merge.
- **FR32 — A correction with a released victim is a breaking change.** When
  pre-existing current authority proves released behavior wrong, unsafe, or
  nonconforming AND a valid latest-stable consumer relies on that behavior such that
  the correction breaks code, interaction, persisted data, output, or a supported
  workflow, the correction is `[breaking]` and follows FR31 for the declared tier,
  stating the corrected contract and the migration. A visible correction with no valid
  released victim remains `[fix]` under FR5. An accessibility behavior fix is not a
  breaking correction: FR53 classifies it. For a surface other than a component, the
  surface's compatibility contract decides whether a caller is a released victim
  (FR54).
- **FR33 — A correction's authority and victim are named.** The `[breaking]`
  Changeset or its pull request names the pre-existing authority the released behavior
  violated, a latest-stable reproducer, and the migration. Without pre-existing
  authority, the proposal is a new contract decision for the direct owner, not a fix.
  For an accessibility behavior fix, the authority is the conformance target FR53
  names, and the owner records any behavior decision the fix needs in the component's
  record.
- **FR34 — A correction follows the same tier rule.** In a declared minor a breaking
  correction merges on its `[breaking]` Changeset. When `main` declares a patch, the
  patch ships the corrected opt-in or adapter beside the old behavior (FR28) and the
  later minor removes the old behavior. A breaking correction cannot enter a release
  as an incidental compatible fix.
- **FR35 — Emergency correction is narrow and never relabeled as a patch.** Only
  urgent security, privacy, severe accessibility, or comparable critical ongoing
  harm MAY bypass replacement-first coexistence or ordinary scheduling. Waiting must
  materially extend the harm; no additive mitigation, containment, adapter, or safe
  rollout may be available; the contract owner and relevant incident owner must
  approve a dedicated record; public-safe incident evidence and restricted
  attestation must justify urgency; exact-main quality and migration gates still run;
  and the release contains no unrelated feature, cleanup, or incompatible fix.
  Migration ships with the release; an incomplete emergency codemod records an owner,
  bounded follow-up, fixtures, and delivery target. Rollback never restores known
  harmful behavior: use containment or safe-forward correction.
- **FR36 — Minor frequency is planning guidance, not eligibility.** Plan minors
  generally no more often than once every fourteen calendar days. The plan records
  the interval from the prior minor for owner review. CI reports the interval but
  MUST NOT derive deprecation eligibility, a final-patch-to-minor wait, or an
  exception requirement from it.
- **FR37 — Every minor has an owner-named target and a manifest generated at the
  cut.** The owner names the target version on `main` (FR46). The minor's breaking set
  is the set of `[breaking]` Changesets merged for it. At the cut the release generates
  its manifest from the consumed Changesets as authored (FR41) — the breaking ones are
  the minor's migration inventory, the rest its compatible fixes — and freezes it with
  the cut for release notes and audit. The manifest describes; it never gates a merge. The release fails closed on any incompatible delta between the final patch and
  the minor that no merged `[breaking]` Changeset describes (FR39, FR43). Operational
  runbooks may add execution detail but cannot authorize or widen the breaking set.
- **FR38 — The final patch is the paired minor's locked baseline.** Publish the final
  patch with deprecated behavior still working, record its
  exact source and package/docsite/visual/contract receipts, then lock that baseline.
  The paired minor MAY follow sequentially and immediately when ready and explicitly
  authorized; no wait exists unless a direct authority requires one.
- **FR39 — Every final-patch-to-minor delta has exactly one class.** The diff MUST
  partition into: (a) removals or corrections each described by one merged
  `[breaking]` Changeset; (b) a closed
  list of version, changelog, lockfile-integrity, tag, provenance, digest,
  build-timestamp, and source-map metadata; or (c) independently patch-compatible
  fixes under FR40. Strict equivalence is the target. Unrelated features, additive
  product capabilities, incompatible fixes outside approved corrective cleanup,
  refactors with public deltas, and unclassified changes are prohibited.
- **FR40 — Compatible fixes may be disclosed separately in the minor.** Each has its
  own `[fix]` Changeset, current authority or standard, latest-stable regression test,
  representative unchanged paths, and downstream proof, and is listed apart from the
  breaking set in the release description. If the fix lands before final-patch lock,
  include it in both
  releases. If it lands after publication or lock, it MAY enter the minor as a
  disclosed compatible delta; do not recut the final patch solely for bookkeeping.
  CI MUST independently prove patch eligibility. Release notes separate cleanup from
  compatible fixes.
- **FR41 — Release artifacts use closed schemas and invent no fields.** The cut-time
  manifest (FR37) freezes each consumed Changeset exactly as authored — path, content
  digest, packages, category, headline, contributors, and body — and derives breaking
  versus compatible from the category; editorial text is generated from the body, never
  from parallel fields a human must backfill. It also carries the release-metadata
  deltas and the baseline receipts. The equivalence receipt carries final and candidate
  digests plus `unclassifiedDeltas`. Unknown fields and one delta mapped more or less
  than once fail.
- **FR42 — Contributors declare compatibility intent once.** The Changeset is the
  declaration: its tag and body state whether the change is compatible, a deprecation
  with its replacement and migration, or a `[breaking]` change with its migration.
  No parallel classification vocabulary, id, or plan field is required. Existing
  Changesets need no backfill. Contributors state intent; maintainers resolve missing
  authority. External contributors are not required to invent policy.
- **FR43 — CI validates semantics, not labels.** Pull-request CI compares latest
  stable to head to establish released victims and base to head to attribute deltas.
  Release CI compares final patch to paired minor and assigns every delta exactly once
  to cleanup, release metadata, or compatible fix. It checks exports/types, runtime,
  CSS/tokens, DOM/accessibility/visual/RTL, CLI/help/routes/schema, persistence, docs,
  package files, supported package combinations, old-client/new-metadata behavior,
  fixed-group membership, required evidence, and tag/classification/bump coupling.
  Plain failures name the victim, missing evidence, and exact repair path.
- **FR44 — Exact-main release gates and rollback preserve one identity.** The final
  patch and paired minor each use one immutable source identity for build, package
  artifacts, gate receipts, tag, publish, and release record. Missing authority,
  manifest coverage, required migration, exact-main evidence, or any unclassified
  delta aborts the cut. Partial publishing resumes the same bytes. A bad release rolls
  forward with a compatible patch that restores aliases or the prior safe
  compatibility mode; critical-harm recovery follows FR35 and never restores the
  harmful behavior.
- **FR45 — Documentation catalog display names and routes are mutable data.** A
  display name or docs-tree route identifies an entry in the current documentation
  catalog; it is not a contractual CLI operation or machine-readable schema. Renaming
  or moving an entry is nonbreaking even when its former value stops resolving, and
  requires no compatibility alias or codemod. Release metadata identifies the
  replacement value. The `docs` command name, options, exit behavior, and response
  schemas remain contractual under FR3 and FR13. Template identifiers, slugs, display
  names, and names are outside this requirement and remain governed separately by FR9,
  FR11, and applicable registry identity contracts.
- **FR46 — Main declares the next planned version.** The fixed package group's
  version in main's `package.json` files is the owner-selected next release plan. A
  release owner may raise or lower it before a cut; after a cut, changing it affects
  only main's future plan because the release branch remains bound to its cut
  declaration. Pending Changesets do not derive or promote the version. Pull-request
  lint does not compare main's declaration with the newest stable tag or an active
  cut. Canary publication owns that ordering boundary instead: the fixed group MUST
  declare one plain version; a declaration strictly above the newest stable tag
  publishes `<declared version>-canary.<commit>`, equality publishes nothing, and a
  lower or split declaration fails rather than publishing. Changeset admission still
  refuses `[breaking]` work while main declares a patch and admits it while main
  declares the minor successor.
- **FR47 — A release branch releases the declared version.** A release branch's
  version is the fixed-group version declared at its cut commit. Admission, the
  release plan, Changeset consumption, changelog generation, and stable
  publication run only on a release branch. Consuming Changesets writes changelog
  entries under the declared version and never moves it: a `[breaking]` Changeset
  on a branch that declares `0.7.0` releases `0.7.0`, and a patch Changeset on a
  branch that declares `0.6.8` releases `0.6.8`. Pending Changesets MUST NOT
  choose the version: an entry waiting to be released is the work admission
  governs, never evidence for the version that carries it.
- **FR48 — Admission checks the declared tier.** The declared version is either
  the patch successor or the minor successor of the latest stable release, and
  that successor is the release tier. In a patch release, a Changeset carrying the
  `[breaking]` category is inadmissible and MUST be rejected before the release
  consumes it. The admissible routes are FR28's replacement-first deprecation,
  which keeps old usage equivalent and lets the removal ship in a minor release,
  or an owner bump of main to the minor successor before the cut. This gate
  decides patch-versus-minor admission and nothing else; the lifecycle conditions
  of FR28, FR31, FR32, and FR37, and every review and release requirement outside
  this record, continue to apply on their own terms and are neither restated nor
  enforced here.
- **FR49 — The declared version fails closed.** A release is refused when the
  fixed group does not declare one identical `MAJOR.MINOR.PATCH` version; when the
  release version differs from the version declared at the cut commit; when no
  stable release exists to compare against; and when the declared version is
  neither the patch nor the minor successor of the latest stable release,
  including a version that is already released. The latest stable release is the
  newest `vX.Y.Z` tag. A prerelease or canary identifier is publication metadata
  and is never a declared version or a base.
- **FR50 — The published release branch squashes back into current main.** After
  branch-owned tag and stable publication are verified, one merge-back change applies a
  squash projection of the exact published release branch onto then-current main. It
  carries the branch's exact generated changelogs, release notes, promoted codemods,
  and frozen Changeset deletions; it does not regenerate or copy those outputs
  independently. Branch-only active lifecycle marker and plan files do not land on
  main. Between cut and merge-back, main's declaration is whatever main currently
  holds; the release branch cannot change it. The three-way merge MUST preserve that
  declaration, every post-cut main commit, every post-cut Changeset byte, and every
  unrelated newer main field; a conflict holds the merge for explicit resolution. A
  trusted required check binds the merge-back to the immutable tag, release branch head,
  and plan digest, proves the release-owned bytes and frozen deletions equal the branch,
  proves post-cut preservation, and refuses every unrelated mutation. FR50 never chooses
  or lowers the next plan. Merge-back preserves main's current declaration. When it
  equals or falls below the released version, FR46's canary publication check emits no
  prerelease at equality and fails below it.
- **FR51 — The next plan is prepared at the cut and remains separate from merge-back.**
  When a release cut succeeds, release tooling prepares one pull request from current
  main that changes every fixed-group package version, every generated exact internal
  pin, the lockfile, and version-stamped compatibility asset to the successor plan. The
  default is the cut version's patch successor. The minor successor is used only when
  Cindy explicitly names that minor as the next plan; pending `[breaking]` Changesets
  are not that decision. The plan MUST NOT merge before an immutable tag or stable
  package publication makes the cut version non-reusable. After that point it may land
  through normal gates before or after FR50; merge-back preserves an already-landed
  newer plan. A terminal cut with neither an immutable tag nor stable package
  publication closes its prepared plan unmerged. If main already carries a newer owner plan, the prepared change closes or
  refreshes instead of duplicating or lowering it. Other main work need not wait, and
  FR46 remains the independent canary-publication safety boundary. The plan remains
  malleable under FR46 until the next cut.
- **FR52 — Repository evidence follows codemods through promotion.** A codemod staged
  for an unreleased change may move from `transforms/next/` into the immutable
  `transforms/v<declared-version>/` folder during release generation. A checked-in test,
  validator, documentation generator, or other repository evidence that reads that
  transform's source MUST identify the transform independently of its lifecycle folder
  and resolve its staged or promoted location as appropriate. It MUST fail when the
  transform is missing, when multiple candidates make the identity ambiguous, or when
  the promoted source no longer exposes the same transform identity and declared entry
  set. It MUST NOT keep a duplicate transform solely to preserve the staged path.
  Promotion remains one generated release output under FR47 and FR50; this requirement
  changes no consumer migration contract.
- **FR53 — Accessibility behavior fixes are not breaking.** A change whose purpose is
  to make a released component conform to its accessibility target — a WCAG 2.2 Level
  A or AA success criterion, the required parts of an APG pattern the component adopts
  under `spec:AST-020/FR15`, or a current accessibility requirement in its record — is
  `[fix]` and patch-eligible, even when it replaces documented interaction or
  accessibility behavior: roles, accessible names, states and properties, focus
  movement, and keyboard behavior. No deprecation precedes it and no coexistence path
  is required. An accessibility behavior fix requires no app-layer code change:
  existing public props, types, exports, tokens and documented usage keep working
  unchanged. It may add optional public surface (for example a new optional prop),
  which is not breaking and is admitted under the existing rules for public additions;
  it never removes, renames, or narrows existing surface. It ships as a patch `[fix]`,
  with a release-note line when documented behavior changes; its Changeset names the
  old and new behavior and the accessibility target it serves. A change that would
  require apps to edit code must be redesigned so the component absorbs it, or it is
  classified under FR1.
- **FR54 — A surface other than a component defines its own compatibility contract.**
  Each published surface other than a component takes its compatibility contract from
  its own current record. For the CLI, that record is `architecture:cli-surface`. The
  contract states which consumer scenarios are valid and supported, what counts as a
  released victim, and which corrections to the surface are `[fix]` and which are
  `[breaking]`. The surface record's owners decide that contract through the record's
  normal approval, and this record does not restate it. Where the surface record
  states a rule for a case, that rule decides the classification of that case. Where
  it is silent, FR1–FR6 and this record's rules for that surface apply. A surface rule
  turns on the change and its contract, never on risk or adoption (FR6), and covers
  only released, published surfaces (FR2). The release process in this record applies
  to the result unchanged: Changeset categories and bump tiers (FR7, FR22), migration
  evidence (FR8), experimental isolation (FR21–FR27), the patch, minor, and emergency
  paths (FR28, FR31, FR34, FR35, FR48), deprecation and coexistence (FR29–FR30), and
  the release gates (FR37–FR44). A surface record defines only whether a change is
  breaking; it never changes how a change ships. A change any surface record classifies
  as `[breaking]` lands only in a declared minor (FR31) or through the emergency path
  (FR35), never in a patch release, and no surface record can make it patch-eligible by
  redefining a release rule. Components keep the rules in this record, including FR3 and
  FR53.

### Platform support

- Supported feature/engine floor: every published Astryx package and stable CLI
  release.
- Unsupported behavior: private packages, unreleased branch state, canary-only
  surfaces, and surfaces that meet FR21's explicit experimental contract carry no
  stable compatibility promise.
- Browser evidence: not applicable to the classification itself; a browser-owned
  compatibility claim still follows the governing component or platform spec.

## Authority relationships

This spec owns compatibility classification for components, and the release process
every surface's classification goes through: lifecycle state, release-pair delta
classes, and the evidence that admits them. A surface other than a component defines
its own compatibility contract in its current record (FR54). It delegates narrower
questions rather than restating them:

- [`spec:AST-002` — Public API admission and operation shape](../AST-002/spec.md)
  owns whether a public API concept should exist and its semantic shape.
- [`architecture:public-component-api` — Public component API](../../architecture/public-component-api.md)
  owns the stable component contract; this spec owns how it evolves.
- [`architecture:cli-surface` — CLI surface architecture](../../architecture/cli-surface.md)
  and [`spec:AST-042` — CLI command admission and programmatic parity system spec](../AST-042-cli-command-admission/spec.md)
  own CLI structure, admission, and parity. `architecture:cli-surface` also owns the
  CLI's compatibility contract under FR54; this spec owns the release process that
  applies it.
- [`architecture:theme-tokens` — Theme token architecture](../../architecture/theme-tokens.md)
  owns token semantics; this spec owns compatibility and experimental isolation.
- [`spec:AST-013` — Browser and platform support system spec](../AST-013/spec.md)
  owns support floors and fallbacks; this spec owns release treatment of a support
  reduction.
- [`spec:AST-035` — Integration template replacement system spec](../AST-035/spec.md)
  owns template-replacement semantics. This spec classifies each field and behavior
  against the latest stable release: unpublished replacement-specific surfaces follow
  FR2, while previously released same-id conflict warning behavior remains stable.
- [`spec:AST-040` — Evidence-based consumer file modification system spec](../AST-040-consumer-file-modification/spec.md)
  owns what a codemod may edit and the evidence it requires; this spec owns when a
  migration must supply one.
- [`spec:AST-010` — Structured percentage useResizable configuration system spec](../AST-010/spec.md)
  and [`spec:AST-043` — Date and time input presentation system spec](../AST-043-input-presentation/spec.md)
  own their concrete mappings and any surface-specific deprecation minimums.
- [`spec:AST-030` — Positive CI surface routing system spec](../AST-030/spec.md)
  owns pull-request lane routing; this spec owns the compatibility checks each
  affected surface must receive and the exact-main release gate.
- [`spec:AST-039` — Integration contribution descriptor system spec](../AST-039/spec.md)
  is a related draft, not authority. If promoted, it links its compatibility readers
  and removals to this lifecycle.
- The public [Component Lifecycle](https://github.com/facebook/astryx/wiki/Component-Lifecycle)
  owns whole-component Lab-to-Core readiness. Lab remains the private canary-only
  incubation boundary; this spec owns the compatibility effect of promotion.
- The public [API Conventions](https://github.com/facebook/astryx/wiki/API-Conventions),
  [Distribution](https://github.com/facebook/astryx/wiki/Distribution), and
  [Release Process](https://github.com/facebook/astryx/wiki/Release-Process) pages
  are operational projections. When they discuss compatibility lifecycle, they MUST
  link here and cannot create competing rules.
- [`.changeset/config.json`](../../../.changeset/config.json),
  [`scripts/check-changesets.mjs`](../../../scripts/check-changesets.mjs), and
  [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) implement fixed
  grouping, declaration validation, and checks. Their current behavior is not policy
  when it differs from this spec. The `fixed` group in that config is why one
  incompatible Changeset puts every published package in a minor release.
  `check-changesets.mjs` validates Changeset format on every pull request, and the
  release-branch tooling under [`scripts/release/`](../../../scripts/release/)
  implements FR47–FR51 admission, versioning, merge-back, and next-plan validation;
  none of these files may narrow or widen the rule it implements.

The direct current owner decides the intended product contract. For a surface other
than a component, its record also decides what counts as breaking (FR54). This spec
decides the release process every change goes through. The public Release Process
decides how an eligible release is operated. A direct spec cannot waive compatibility silently;
an incompatible change to its surface lands in a declared minor under FR31.

## Current-state impact

Public lifecycle classification remains in force with these operational effects:

- stable changes default to compatible patch treatment;
- experimental containment extends to every public surface kind;
- a breaking change ships only in a declared minor, described by its `[breaking]`
  Changeset; when `main` declares a patch, a deprecation ships first — warnings stay
  at authoring surfaces, production runtime stays unchanged, and an executable
  modernization route precedes warning delivery;
- planned minors use a locked final-patch baseline, and the cut generates the
  release description from the consumed Changesets;
- minor frequency remains planning guidance and creates no deprecation or pair wait;
- contributor declarations are the Changeset tag and body, with no parallel
  lifecycle metadata and no migration of existing Changesets;
- documentation catalog display names and routes remain mutable data while the stable
  `docs` command and machine-readable schemas stay contractual;
- exact-main release comparison rejects unclassified deltas; and
- a surface other than a component is classified by its own record's compatibility
  contract, and the release process here applies to the result.

Main declares the next planned version, and Changeset admission uses that declaration
to refuse `[breaking]` work on a patch plan. Pull-request lint does not compare the
declaration with stable or an active cut. The canary publisher compares at publication
time: strictly above stable publishes, equality skips, and lower or split declarations
fail closed. A release branch releases the cut's declaration unchanged and admits
incompatible work only when it is a minor; the Changeset cannot choose that version
itself. Published branch bytes squash back into current main without regeneration,
post-cut consumption, or plan changes. Release tooling prepares the separate successor
plan at cut time—patch by default, minor only when Cindy names it—and holds it until the
cut version becomes non-reusable. It may then land before or after merge-back without
holding unrelated main work; a terminal cut with neither an immutable tag nor stable
package publication closes it unmerged.

Codemod promotion relocates staged transform source into the immutable release folder.
Repository evidence that reads a transform follows that lifecycle location and treats a
missing or ambiguous identity as a failure rather than preserving a duplicate source.

These requirements alter no published package by themselves and need no Changeset.
Authoring helpers, validators, metadata projections, compatibility snapshots, release
workflows, and contributor guidance implement the contract. Until each projection
lands, maintainers apply its requirement in review and release approval.

## Verification

| Contract  | Verification                                                                                                                                                                                                                                                                                                                                                    | Representative states                                                                                                                                                                                                                 | Mutation or failure expectation                                                                                                                                                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3   | PR compatibility statement plus latest stable package inspection                                                                                                                                                                                                                                                                                                | released export, narrowed type, changed interaction default; unreleased and private surface; visual-only spacing, typography, layout styling, or default appearance; a new touch presentation or open-surface touch mode as a default | A change is labeled from diff size or possibility alone, a functional contract loss is hidden as visual-only, or a pixel-only change is tagged `[breaking]` even though callers need no source or configuration change, or such a touch default names no `presentation` value that restores the previous surface and mode |
| FR4–FR6   | Old-usage type/runtime/CLI regression test                                                                                                                                                                                                                                                                                                                      | alias retained, deprecation warning, broad rewrite, low-adoption caller                                                                                                                                                               | Contractual old usage fails despite a nonbreaking label, or risk is substituted for compatibility                                                                                                                                                                                                                         |
| FR7–FR8   | `pnpm check:changesets` (tag, bump, contributors, declared tier) plus FR8 migration review of `[breaking]` text                                                                                                                                                                                                                                                 | existing `[fix]`, `[feat]`, `[breaking]`, and `[experimental]` tags paired with compatible, deprecation, planned-removal, or incompatible-fix metadata                                                                                | A new lifecycle replaces an established tag, tag/metadata/bump diverge, an incompatible correction uses bare `[fix]`, or migration is unusable                                                                                                                                                                            |
| FR9–FR13  | CLI contract tests, response-schema/type snapshots, text projections, generated consumer docs, and template catalog/output tests                                                                                                                                                                                                                                | slug rename, metadata edit, source rebuild, optional field addition, command or schema change                                                                                                                                         | Catalog data is frozen as API, a command/schema incompatibility is mislabeled as catalog-only, or a response field lacks a complete projection                                                                                                                                                                            |
| FR12      | Minimum and representative supported-version tests plus manifest and release-note review                                                                                                                                                                                                                                                                        | retained range, narrowed range, adapter, coordinated upgrade                                                                                                                                                                          | An in-range combination breaks under a nonbreaking label, or release coordination hides the affected package or migration                                                                                                                                                                                                 |
| FR14      | Help/manifest snapshots, public API and consumer docs, and focused contract tests                                                                                                                                                                                                                                                                               | command, option, API/config, private rollout/test hook                                                                                                                                                                                | Supported behavior is hidden, an environment variable changes behavior, or automation lacks a documented API                                                                                                                                                                                                              |
| FR15      | Full manifest-derived command matrix, supported-consumer evidence, and scope-specific contract tests                                                                                                                                                                                                                                                            | global invariant, scoped command group, single command, programmatic API                                                                                                                                                              | A global control is a no-op for any command, has different meanings, or replaces a narrower owning surface                                                                                                                                                                                                                |
| FR16–FR18 | Boundary inventory, hostile side-effect probes, response snapshots, and concurrent API tests                                                                                                                                                                                                                                                                    | known and new extension, partial result, text/JSON/API parity, independent concurrent calls                                                                                                                                           | A route bypasses the guarantee, omitted work looks complete, or one invocation changes another                                                                                                                                                                                                                            |
| FR19–FR20 | Proposal evidence with a regression fixture for the detection failure, plus composition and provenance tests                                                                                                                                                                                                                                                    | convention covers the case, detection fails, app plus two integrations, refusal, failing contribution, repeated load                                                                                                                  | A key ships without a reproduced detection failure, a contribution displaces the app or applies twice, a part of the effective value has no inspectable source, or a failure silently weakens protection                                                                                                                  |
| FR21–FR24 | Published-surface comparison, declaration/doc metadata checks, import-boundary checks, and Changeset classification review                                                                                                                                                                                                                                      | experimental prop object, experimental subpath, patch evolution, promotion, unpublished adjacent field, stable warning behavior, integration theme                                                                                    | A prose-only marker excludes a stable API, adjacency falsely publishes a new field, an experimental export leaks through a stable path, a patch changes stable behavior, or a promoted API remains unprotected                                                                                                            |
| FR25–FR27 | Stable-surface inventory and experimental-boundary matrix                                                                                                                                                                                                                                                                                                       | package/API, CSS/token, CLI/config, persistence, build tooling, docs, whole Lab component                                                                                                                                             | An unmarked experiment changes stable defaults or a stable surface bypasses compatibility review                                                                                                                                                                                                                          |
| FR28–FR31 | Declared-tier check: on a minor, the `[breaking]` Changeset describes the change (old usage, replacement, migration); on a patch, a breaking Changeset is refused and the deprecation ships instead; declaration/doc/build/CLI warning projections; old/new fixtures; dry-run/idempotence/migration tests; maintained-source and latest-stable upgrade evidence | whole component, prop/value, theme field/helper/token/target/source, CLI command, CLI option; old-only, new-only, both, static/dynamic/uncertain migration, text/JSON, development/production                                         | A warning has no usable modernization route, production runtime changes for deprecation, maintained guidance teaches the old surface, a migration guesses, old behavior degrades early, cadence invents a wait, or one cleanup id covers multiple incompatible deltas                                                     |
| FR32–FR35 | Latest-stable victim fixture, pre-existing authority named in the Changeset or pull request, owner review, declared-tier check, and emergency attestation                                                                                                                                                                                                       | victim-free `[fix]`, `[fix]` plus incompatible-fix metadata, coexistence, cleanup transition, critical-harm emergency                                                                                                                 | A released victim uses bare `[fix]`, a new Changeset tag replaces metadata, a correction record disagrees with its public-surface state, or urgency bypasses migration                                                                                                                                                    |
| FR36–FR40 | Owner-declared target, locked final-patch receipt, three-way delta classification against the merged `[breaking]` Changesets, and separated release notes                                                                                                                                                                                                       | ordinary cadence, immediate pair, cleanup, release metadata, pre/post-lock compatible fix                                                                                                                                             | Cadence becomes eligibility, the final patch is recut for bookkeeping, a feature or incompatible fix enters the incidental-fix lane, or release notes merge cleanup with fixes                                                                                                                                            |
| FR41–FR44 | Schema validation, PR declaration, semantic stable/base/head comparisons, exact-main gate, and immutable publish/rollback receipt                                                                                                                                                                                                                               | duplicate ids, missing evidence, route/schema removal, old-client metadata, partial publish, safe rollback                                                                                                                            | A label passes without semantics, a delta maps zero or multiple times, fixed-group membership drifts, or a release rebuilds under one identity                                                                                                                                                                            |
| FR45      | Docs route inventory, repository-reference checks, and Changeset review                                                                                                                                                                                                                                                                                         | catalog entry rename, former-route miss, stable command and JSON schema                                                                                                                                                               | Catalog routing is frozen as API, or a rename silently changes the contractual command or response schema                                                                                                                                                                                                                 |
| FR46–FR47 | Declared-tier Changeset admission, canary publication ordering, and release-versioning fixtures                                                                                                                                                                                                                                                                 | owner increase/decrease, above/equal/below stable, split group, `[breaking]` on patch and minor plans                                                                                                                                 | Pending Changesets derive the plan, `[breaking]` passes on a patch or fails on a minor, equality publishes a canary, or a lower/split declaration publishes instead of failing                                                                                                                                            |
| FR48      | Category and classification admission under each declared tier                                                                                                                                                                                                                                                                                                  | patch release with `[breaking]`, patch release with a deprecation, minor release with `[breaking]`                                                                                                                                    | Incompatible work passes in a patch release, or a deprecation is refused in one                                                                                                                                                                                                                                           |
| FR49      | Malformed and inconsistent declaration fixtures                                                                                                                                                                                                                                                                                                                 | disagreeing group versions, canary identifier, release version unlike the cut manifest, already-released version, skipped version, no stable tag                                                                                      | An untrustworthy or mismatched declaration is released                                                                                                                                                                                                                                                                    |
| FR50      | Three-way squash merge-back fixtures bound to the immutable tag, branch head, and plan digest                                                                                                                                                                                                                                                                   | exact branch outputs, frozen deletion, branch-only marker exclusion, post-cut Changeset/manifest edit, newer main declaration, merge conflict, regenerated output                                                                     | Merge-back differs from release bytes, lands lifecycle files, consumes post-cut work, overwrites a newer main declaration or unrelated field, or chooses a version                                                                                                                                                        |
| FR51      | Cut-time successor-plan preparation plus manifest/pin/lockfile/compatibility-asset and lifecycle fixtures                                                                                                                                                                                                                                                       | default patch successor, explicitly named minor, abort before any tag or publication, immutable tag before merge-back, pre-advanced main plan, unrelated main work during equality                                                    | The plan merges before the cut version is non-reusable, survives a terminal cut with neither an immutable tag nor stable publication, skips the default patch, derives a minor from pending Changesets, splits pins/assets, or the prepared plan or merge-back lowers or duplicates an existing newer plan                |
| FR52      | Promotion fixtures plus every checked-in source consumer run before and after codemod promotion                                                                                                                                                                                                                                                                 | staged transform, promoted transform, missing source, ambiguous candidates, changed entry identity                                                                                                                                    | Evidence hardcodes only `next/`, keeps a duplicate source, silently chooses among candidates, or passes when the promoted transform no longer exposes the same identity and entries                                                                                                                                       |
| FR53      | Changeset classification review against the governing component record's accessibility evidence                                                                                                                                                                                                                                                                 | a fix that replaces documented keyboard or focus behavior to meet an adopted APG pattern's required parts; a fix that changes a role, state, or accessible name to meet WCAG 2.2 A/AA; a fix that adds an optional prop               | An accessibility fix is held for a minor, given a coexistence path, or classified `[breaking]`; or a change that needs an app-layer code edit, or that removes, renames, or narrows public surface, ships as an accessibility `[fix]`                                                                                     |
| FR54      | Changeset classification review against the surface's current record, then the same tier admission every Changeset receives                                                                                                                                                                                                                                     | a CLI correction the CLI record classifies as `[fix]`; a CLI change the CLI record leaves undecided; a CLI change the CLI record classifies as `[breaking]` on a patch plan; a component change                                       | A non-component change is classified by a rule this record restates instead of its surface record, a surface rule turns on risk or adoption, a surface-classified `[breaking]` change ships in a patch or a surface rule makes it patch-eligible, or a component change is classified by a surface record                 |

## Decision log

### DEC-1 — Breaking means a released consumer must change

**Reference:** `spec:AST-017/DEC-1`
**Decider:** `cixzhang`, `2026-09-02`

Classify compatibility from the latest stable published contract and name the
consumer scenario that stops working. This makes labels predictable, keeps
unreleased and private experimentation free to change, and prevents low-risk but
incompatible edits from hiding in patch releases.

Rejected: classifying by implementation size, perceived risk, reviewer confidence,
or any observable difference. Those tests either miss real contract breakage or
freeze implementation details and data values that were never promised.

### DEC-2 — Template slugs and source are mutable catalog data

**Reference:** `spec:AST-017/DEC-2`
**Decider:** `cixzhang`, `2026-09-02`

Treat a template slug as data describing the current catalog entry, alongside its
name, description, category, keywords, and starter content. Those values may evolve
in patch releases, including a slug rename that makes the previous value stop
resolving. The release note should make the new value discoverable, but the change
is not `[breaking]` and needs no compatibility alias or codemod.

Keep the surrounding CLI operation contractual: incompatible changes to the
`template` command, its options, exit behavior, or machine-readable schema still
follow the normal breaking-change rule. This lets the template library improve
without confusing current catalog contents with the interface that serves them.

Rejected: treating a slug as stable API merely because it is interpolated into an
exact CLI invocation. That would freeze catalog data and discourage clearer naming
without protecting a contract the template system intends to make.

### DEC-3 — Package updates keep their own range promises

**Reference:** `spec:AST-017/DEC-3`
**Decider:** `cixzhang`, `2026-09-03`

Treat the latest stable package's declared dependency or peer range and documented
installation scenario as its compatibility promise. Consumers may upgrade that
package with any companion version the range still allows; a coordinated release
cannot require an undeclared lockstep upgrade. Classify the package update that
creates the mismatch. Supporting package updates keep their own classifications.
A coordinated breaking range change remains allowed when its Changeset release note
describes the new range and its FR8 migration tells consumers how to move.

Rejected: marking every dependency bump breaking, which would freeze compatible
maintenance, or calling an update nonbreaking merely because a coordinated upgrade
works, which would break supported independent consumers.

### DEC-4 — Stable CLI response fields receive complete projections

**Reference:** `spec:AST-017/DEC-4`
**Decider:** `cixzhang`, `2026-09-06`

Treat every field in a stable machine-readable CLI response—including nested
entry fields—as public schema. Keep its canonical type, contract tests, applicable
text output, and complete consumer documentation aligned in the same change.

An optional field addition may remain nonbreaking when old consumers continue
unchanged. That compatibility result does not make the field private or waive
current-authority and documentation requirements.

Rejected: documenting only the outer envelope, relying on implementation typedefs
as consumer documentation, or treating a response-entry field as mutable catalog
data merely because the value it carries may evolve.

### DEC-5 — Supported CLI behavior is never hidden

**Reference:** `spec:AST-017/DEC-5`
**Decider:** `josephfarina`, `2026-09-23`

Any Astryx CLI behavior available in a supported flow is public and must be
documented and discoverable, including behavior selected automatically. A control
that can change supported CLI behavior is public and must be documented and
discoverable. Its status follows the behavior it changes, not whether it is spelled
as a command, option, package field, or configuration key.

Use an option for invocation-scoped behavior, placed on the nearest command or
command group that owns it; a global option must meet FR15's CLI-wide evidence bar.
Use a documented configuration surface for persistent project behavior. Do not
introduce Astryx-owned environment variables, including aliases for another surface.
Automation uses the documented programmatic API. Private tests use injected test
seams instead of environment variables. A maintainer rollout gate may control staged
availability, but it is not a public user interface, must not use an environment
variable, and cannot be the only way to reach a supported mode. The user-facing
behavior it gates becomes subject to this requirement once supported.

Rejected: documented or undocumented environment-variable controls, naming a hidden
rollout gate as the user interface, or describing a behavior only in prose while
omitting it—or a direct link to its documentation—from generated help and the
machine-readable manifest.

### DEC-6 — Global CLI controls prove global value

**Reference:** `spec:AST-017/DEC-6`
**Decider:** `josephfarina`, `2026-09-23`

Treat a behavior-changing global control as a last resort, not as the default home for
invocation-scoped behavior. Because it changes every command, it requires current
system-spec authority before implementation. Its proposal must show one stable
invariant with meaningful behavior for every command, a supported-consumer need that
narrower command or API scope cannot satisfy, and a manifest-derived command matrix that verifies the claim. A
no-op or different meaning on any command means the control is scoped too broadly.

Put narrower behavior on the nearest command, command group, or programmatic API that
owns it. Name the control for the exact capability it changes rather than using broad
quality claims such as `safe`, `secure`, `trusted`, or `isolated`. A safety or trust
control also defines its trust boundary and fails closed before untrusted input can
execute or cause a side effect.

Rejected: making a control global because several implementations share a switch,
because root parsing is convenient, or because unrelated commands can silently ignore
it. Those approaches enlarge the public surface without establishing coherent value.

### DEC-7 — Cross-cutting controls are complete, observable, and per invocation

**Reference:** `spec:AST-017/DEC-7`
**Decider:** `josephfarina`, `2026-09-23`

Define a cross-cutting guarantee by its complete boundary, not by the current list of
implementation sites. Unknown and future extension points fail closed.

Make work omitted by a safety or reduced-capability mode part of the result contract
so a partial result cannot be mistaken for a complete one. When no useful result
remains, return a stable error before writes or external effects. Pass programmatic controls as explicit inputs, keep
them independent across concurrent calls, and preserve semantics across equivalent CLI
and API surfaces.

Rejected: best-effort interception of known loaders, silent fallback to partial or
empty results, process-global mutable switches, and separate CLI and API meanings. Each can
make the advertised guarantee false while the happy-path tests remain green.

### DEC-8 — Configuration is a last resort, and contributions compose

**Reference:** `spec:AST-017/DEC-8`
**Decider:** `josephfarina`, `2026-09-23`

Every configuration key is permanent public surface under FR3 and FR14, and it
asks every consumer to make a decision. A key often hides a gap in detection, so
detection and established conventions come first, and a new key needs a
reproduced case where they fail.

Integration contributions let one package set shared behavior once, as the
`debug` setting does for organization-wide debug logs, while the app keeps the
final say. The setting defines how contributions combine; an integration only
declares its contribution, in the documented form. Contributions combine with the
app value instead of replacing it, they are isolated from one another, each part
of the effective value can be traced to its source, and a protective setting
fails closed.

Rejected: adding a key because it is easy to add, a key that duplicates a
convention or a derivable value, an integration silently replacing an app value,
an integration defining its own merge rule, contributions made by import side
effects, and one broken integration disabling a setting for every app.

### DEC-9 — Existing stable components incubate APIs behind one explicit boundary

**Reference:** `spec:AST-017/DEC-9`
**Decider:** `cixzhang`, `2026-09-28`

Keep Lab as the canary-only home for an entire experimental component. When an
existing stable component needs to test a new prop or callback, put it inside the
component's optional `experimental` prop object so every callsite opts in visibly
and the ordinary prop namespace stays stable. Put experimental hooks, functions,
and types on the owning component's `/experimental` subpath. Mark the same surface
in declarations and authored docs, and keep stable defaults unchanged when the
experimental boundary is unused.

Allow those marked surfaces to evolve through `[experimental]` patch releases.
Promotion is a separate `[feat]` decision that moves the settled API onto its stable
surface; after that release the ordinary compatibility rules apply. Never use an
experimental marker to demote an already stable contract. Integration-theme
contributions remain the single explicitly recorded grandfathered surface because
they shipped before this declaration mechanism while still being introduced for early
iteration.

That retroactive-marker prohibition does not make unpublished additions stable by
association. Integration-template replacement-specific declarations, selection,
optional projection, and expanded conflict fields remain pre-publication under FR2;
their classification is not an experimental enrollment. The already released same-id
conflict warning behavior remains stable.

Rejected: moving a stable component into Lab to test one new API, scattering
`unstableFoo` names through its ordinary prop namespace, relying on prose warnings
that tooling cannot verify, treating every recently added API as implicitly
experimental, and retroactively marking another released stable surface unstable.

### DEC-10 — Replacement-first records own deprecation and cleanup

**Reference:** `spec:AST-017/DEC-10`
**Decider:** `cixzhang`, `2026-09-29`

Keep old and replacement behavior together in the final patch when the next planned
release is a patch; direct authorities may impose a longer transition for their own
surfaces, and release cadence never invents one. DEC-18 supersedes the record-and-
manifest gate this decision once carried.

Rejected: prose-only deprecation, silent removal, a global wait inferred from cadence,
and one cleanup id covering unrelated deltas.

### DEC-11 — Behavior-correcting incompatibility is not an ordinary fix

**Reference:** `spec:AST-017/DEC-11`
**Decider:** `cixzhang`, `2026-09-29`

A correction with a valid released victim is not an ordinary fix: pre-existing
authority proves the expected behavior, latest-stable evidence proves the victim, and
the change ships as `[breaking]` in a declared minor under FR31–FR34. A victim-free
restoration is `[fix]` with patch treatment. DEC-18 supersedes the `incompatible-fix`
classification, `IFIX-*` record and `CLN-*` item this decision once required.

Rejected: treating every visible correction as breaking, and hiding a released victim
behind a bare `[fix]`.

### DEC-12 — The paired minor admits only three delta classes

**Reference:** `spec:AST-017/DEC-12`
**Decider:** `cixzhang`, `2026-09-29`

Lock the final-patch baseline and classify every paired-minor delta as approved
cleanup, closed release metadata, or an independently patch-compatible fix. A fix
that lands after baseline lock may be disclosed in the minor without recutting the
patch solely for bookkeeping. Keep cleanup and compatible fixes separate in both the
manifest and release notes.

Rejected: unrelated features, unclassified deltas, an incompatible fix in the
compatible-fix lane, and strict byte identity that forces a needless replacement
final patch for an independently valid patch fix.

### DEC-13 — Cadence guides planning; readiness and authority gate the cut

**Reference:** `spec:AST-017/DEC-13`
**Decider:** `cixzhang`, `2026-09-29`

Plan minor releases generally no more often than once every fourteen calendar days,
but do not turn that interval into deprecation eligibility or a required wait between
the final patch and paired minor. A ready, authorized pair may publish sequentially.

Rejected: an inferred elapsed-time gate, a special exception merely to publish a
ready pair, and using cadence to waive replacement, migration, cleanup, or exact-main
evidence.

### DEC-14 — Documentation catalog display names and routes are mutable data

**Reference:** `spec:AST-017/DEC-14`
**Decider:** `josephfarina`, `2026-09-29`

Treat a documentation catalog display name or tree route as data identifying a current
entry. It may change in a patch release even when its former value stops resolving.
Release metadata identifies the replacement; no compatibility alias or codemod is
required.

Keep the surrounding operation contractual: incompatible changes to the `docs`
command, its options, exit behavior, or machine-readable response schemas still
follow FR1–FR8 and FR13. Template identifiers, slugs, display names, and names remain
outside this documentation rule and follow FR9, FR11, and applicable registry identity
contracts.

Rejected: treating every route-shaped positional value as stable CLI API. That would
freeze documentation organization rather than protect the command and schema
contracts readers and automation rely on.

### DEC-15 — Main declares the plan; publication enforces ordering

**Reference:** `spec:AST-017/DEC-15`
**Decider:** `cixzhang`, `2026-10-09`; revised `2026-10-12`

Main's `package.json` carries the owner-selected next planned version. Release tooling
runs on a release branch and takes the cut declaration unchanged; admission, versioning,
changelogs, and stable publication happen there. Later main planning cannot change that
branch release. After publication, a three-way squash projection returns the exact
release-owned branch bytes to current main while preserving post-cut work and main's
declaration. A separate owner change declares the patch successor by default, or the
minor successor only when Cindy names it.

Required pull-request lint does not compare main's declaration with stable or an active
cut, because prerelease ordering belongs to canary publication rather than ordinary PR
admission. The canary publisher is the smaller authority boundary: it publishes only
when one plain fixed-group declaration is strictly above the newest stable tag, skips
equality, and fails below-stable or split declarations. Changeset admission independently
refuses `[breaking]` work on a patch plan and admits it on a declared minor.

Rejected: deriving the version from pending Changesets, because the entry being judged
would be its own authorization; publishing a canary at or below stable; regenerating
release outputs during merge-back; and folding the next owner plan into shipped-byte
reconciliation.

Rejected: a dated schedule file beside `package.json`, because two declarations of the
next version can disagree.

Rejected: resetting a newer main declaration to the released version, because release-
branch authority owns shipped outputs, not post-cut planning on main.

### DEC-16 — Deprecation acts at authoring surfaces, not production runtime

**Reference:** `spec:AST-017/DEC-16`
**Decider:** `cixzhang`, `2026-10-07`

A deprecation reaches a builder where the obsolete choice is authored: declarations,
generated reference, theme validation or build, CLI help and invocation, and supported
migration tooling. The working replacement and executable modernization route exist
before warnings begin. Maintained guidance teaches the replacement, while explicit
lookup keeps the deprecated surface and its exact route discoverable.

Production runtime behavior and bytes remain unchanged merely because a surface is
deprecated. The old contract continues working until its separately approved cleanup;
a runtime-only coexistence conflict may receive a development diagnostic explaining
the direct owner's precedence rule. Cleanup follows only after the migration can
preserve or explicitly account for every observable result it owns.

Rejected: a runtime compatibility flag or branch used only to acknowledge deprecation,
a warning without an available modernization path, copyable guidance that keeps
teaching the old surface, and a migration that guesses at uncertain consumer intent.

### DEC-17 — Visual-only changes are compatible even when pixels change

**Reference:** `spec:AST-017/DEC-17`
**Decider:** `cixzhang`, `2026-10-12`

Compatibility asks whether a valid latest-stable caller must edit source or
configuration to keep a supported functional contract working. Removing or renaming a
public surface, narrowing an accepted type, or changing interaction, accessibility
semantics, data, machine-readable output, or another behavior contract can therefore be
breaking. A functional default change's Changeset names the old and new default and the
prop or option that restores the old default; that restoring input is its migration.
Changing only the appearance, spacing, typography, layout styling, or visual default of
existing content is not: it ships as `[feat]` or `[fix]` under FR3 even when an untouched
caller sees different pixels. Its release note names the old and new
appearance and how to keep the old look when a supported escape exists; that escape is
guidance, not a required compatibility migration.

Rejected: treating any pixel difference as a released victim; and calling an
interaction, semantic, data, or machine-output change visual-only because its UI also
looks different.

### DEC-18 — Two rules and one gate

**Reference:** `spec:AST-017/DEC-18`
**Decider:** `cixzhang`, `2026-10-11`

Anything going into a planned minor needs no deprecation first; its `[breaking]`
Changeset describing the change is enough. The two rules that govern compatibility
are: no breaking change ships without a planned minor, and when the next planned
release is a patch a deprecation path is required — deprecate in the patch, remove in
a later minor. The one mechanical gate is the pull-request check that fails a
`[breaking]` Changeset while `main` declares a patch version and admits it while
`main` declares a minor. Everything else — lifecycle records, cleanup ids, the release
manifest, transition rows, migration-evidence cells — is description: the manifest is
generated at the cut from the consumed Changesets exactly as authored and frozen with
the cut as the minor's migration inventory, and the cut fails closed on any
incompatible final-patch-to-minor delta that no `[breaking]` Changeset describes.

Rejected: a lifecycle record and frozen manifest that every removal had to appear in
before merging, which duplicated the Changeset and made bookkeeping the blocker; a
per-record transition requirement and waiver, which the patch rule already expresses;
and dropping the manifest, which would lose the minor's migration inventory.

### DEC-19 — Promotion moves codemod source without invalidating its evidence

**Reference:** `spec:AST-017/DEC-19`
**Decider:** `cixzhang`, 2026-10-14

A staged codemod and its promoted release copy are one transform at two lifecycle
locations. Checked-in evidence identifies the transform and resolves whichever location
the repository state owns; promotion cannot turn a valid source-level guard red merely
by moving the source, and it cannot make that guard silently stop running. Missing,
ambiguous, or identity-changing promotion fails.

Rejected: retaining a duplicate under `next/` after promotion; hardcoding only the
staged path or one release folder; and copying transform declarations into a test.

### DEC-20 — Accessibility behavior fixes are not breaking

**Reference:** `spec:AST-017/DEC-20`
**Decider:** `cixzhang`, `2026-10-14`

Every user of a component that misses its accessibility target is harmed until the
fix ships, and the people harmed most are the ones least able to work around it.
Holding such a fix for a planned minor, or shipping it behind an opt-in beside the
inaccessible behavior, keeps that harm in place to protect callers who depended on
behavior that excluded someone. So a change made for accessibility conformance is a
`[fix]` in the patch line even when it replaces documented roles, names, states, focus
or keyboard behavior. The boundary is the public surface: the fix needs no app-layer code change, may add optional surface, and never removes, renames, or narrows existing surface; a change that would make apps edit code is redesigned so the component absorbs it, or classified as any other change.

Rejected: classifying accessibility corrections as breaking whenever a released
caller observes the old behavior, which delays every conformance fix to a minor.

### DEC-21 — The cut prepares but does not authorize the successor plan

**Reference:** `spec:AST-017/DEC-21`
**Decider:** `cixzhang`, 2026-10-14

The cut knows the default successor and every file that must move together, so it
prepares the separate plan change immediately. That change cannot merge until an
immutable tag or stable package publication makes the cut version non-reusable. It may
then land before or after merge-back because FR50 preserves a newer main declaration.
A terminal cut with neither an immutable tag nor stable package publication closes the
prepared change unmerged.

Rejected: merging the successor before the cut version becomes non-reusable, which
strands a terminal cut with neither a tag nor a publication on a skipped plan; and waiting until merge-back to
prepare information already fixed at the cut.

### DEC-22 — Each surface defines what breaks; this record owns the release process

**Reference:** `spec:AST-017/DEC-22`
**Decider:** `cixzhang`, 2026-10-15

The owners of a surface know which of its behaviors callers may rely on and which of
its corrections leave a real victim. A surface other than a component therefore
defines its compatibility contract in its own current record, decided by that record's
owners: the CLI's lives in `architecture:cli-surface`. This record applies the result
through one release process, so every surface uses the same categories, tiers, paths,
gates, and coexistence rules. Components keep their rules here, because the component
contract and its accessibility fixes (DEC-20) are defined across all components in
this record. Where a surface record is silent, this record's rules for that surface
still apply, so no surface is left without a classification.

Rejected: keeping every surface's breaking rules in this record, which makes this
record's owners decide contracts for surfaces they do not own.

### DEC-23 — A touch presentation default is restored by the component's presentation prop

**Reference:** `spec:AST-017/DEC-23`
**Decider:** `cixzhang`, `2026-10-24`

Touch presentations, and the input modes of an open surface under a finger,
serve touch users best when they are the default where they make sense, and
callers know their product better than any default: the caller's decision is
respected. One `presentation` prop that keeps the previous surface
gives every caller the same way to keep it, and the same input is the migration
a functional default change names, so no touch default ships without a way back.
A touch mode of that kind hard-coded inside a component would leave callers no
such choice. Touch styling and touch-only behavior other records define keep
their own rules.

Rejected: a touch presentation or open-surface touch mode callers cannot pin.

## Open questions

None.
