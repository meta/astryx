---
schema_version: 4
template_version: 1
kind: system-spec
id: spec:AST-028
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-09-04
phase: accepted
owners: [cixzhang]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: []
affects_consumer_docs: [templates]
---

# Template local fixtures and preview fallback contract

## Intent

People should be able to preview an Astryx template with realistic media, copy
it into their project, and then replace the demonstration content without
inheriting Astryx's preview infrastructure or mistaking sample media for product
assets.

Templates are starting points. They are intended to be copied and modified by
the consumer. Images and videos included with a template demonstrate the
composition, crop, density, and state the template was designed for; they are
not production content or a supported consumer asset library.

## Scope

This contract owns static demonstration assets used by templates, including
images, posters, and videos. It covers their authored references, maintainer
previews, copied output, and fallbacks. It also owns demo-content elements:
repository-only elements that stand in for docs-only demo contents, such as a
playing-card face, that a real Astryx component wraps in a motion or gesture
example.

It does not own icons. Icons may be component props, registry values, imported
modules, inline symbols, or product assets, and their conversion and portability
concerns require a separate contract.

## Non-goals

- Publishing Astryx's template media as a consumer asset package.
- Copying every demonstration image or video into the consumer's project.
- Defining icon resolution, icon imports, SVG-component conversion, favicons, or
  application icons.
- Guaranteeing that demonstration content is appropriate for a consumer's brand,
  product, locale, or production license needs.
- Defining product data loaders or the broader template data boundary.
- Making templates immutable after copying.

## Requirements

### Template and asset ownership

- **FR1 — A template is editable source.** A copied page or block template MUST
  be ordinary consumer-owned source that can be changed, split, connected to
  product data, or deleted without retaining a runtime dependency on Astryx's
  preview host.
- **FR2 — Static template media is demonstration content.** Images, posters, and
  videos shipped for a template MUST be treated as fixtures that demonstrate the
  intended composition and state. Their presence in a template MUST NOT imply
  that consumers should ship those files, URLs, subjects, copy, or brands in a
  product.
- **FR3 — Fixture ownership is explicit and local.** Astryx-owned static template
  fixtures MUST use the repository's designated template-fixture namespace and
  MUST be available to maintainers without private network access. Product-owned
  paths and explicit third-party URLs are not Astryx fixture references and MUST
  NOT be rewritten merely because they occur in template source.

### Preview behavior

- **FR4 — Maintainer previews show the real fixture.** Local development, the
  docsite, the sandbox, and pull-request previews MUST resolve each Astryx-owned
  static fixture to the representative image or video. A preview MAY rewrite the
  deployment base path, but that rewrite MUST leave the portable template source
  unchanged.
- **FR5 — One canonical fixture may serve many previews.** Preview deployment MAY
  share one published fixture set rather than duplicate media into every preview.
  The owning deployment MUST keep references deterministic and prevent a preview
  from silently resolving to an unrelated file.
- **FR6 — Preview failure is visible and bounded.** A missing or unsupported
  fixture MUST produce an actionable authoring or preview failure naming the
  reference. It MUST NOT silently render a fallback of the wrong media kind and
  claim the template preview is representative.

### Copy behavior

- **FR7 — Copied source drops the preview dependency.** Copying or scaffolding a
  template MUST remove every Astryx-owned static fixture reference from the
  generated source. The output MUST NOT fetch from the Astryx docsite, sandbox,
  GitHub Pages preview, private CDN, or repository-only `/template-assets/`
  namespace at runtime.
- **FR8 — Fallbacks preserve source usability, not demo content.** The copy path
  MUST produce source that still parses and renders without setup. Image and
  poster references MAY become a neutral self-contained visual placeholder.
  Video references MAY become an explicit empty or non-playing replacement point
  when no verified portable video placeholder exists. In either case, the output
  MUST make no claim that the original demonstration content was copied.
- **FR9 — Fallbacks are media-kind safe.** An image fallback MUST NOT be supplied
  as a video source, and video bytes MUST NOT be supplied as an image fallback.
  Classification MUST use the complete final filename suffix and be
  case-insensitive. If the copy path cannot safely classify an Astryx-owned
  fixture, it MUST fail with the fixture path and unsupported format rather than
  guess or leave a preview-only reference behind.
- **FR10 — Mixed static media transforms independently.** A template containing
  an image poster and a video source MUST transform each reference according to
  its own media kind. One unsupported reference MUST NOT cause another reference
  to receive the wrong fallback.
- **FR11 — Copy receipts disclose replacement.** A successful copy operation MUST
  tell the consumer when Astryx demonstration media was replaced and identify the
  generated file or replacement points they need to customize. The receipt MUST
  not imply that production-ready media was installed.
- **FR13 — Demo-content elements are replaced during copy.** In a motion or
  gesture example, a real Astryx component MAY wrap docs-only demo contents,
  such as `<Card><PlayingCardContents /></Card>`. A demo-content element is a
  repository-only element that stands in for those contents. Every copy MUST
  replace repository-only demo assets (FR7–FR10) and every demo-content element
  with generic placeholders, keeping the outer component and its props, and the
  copied source MUST NOT reference the repository-only code that defines a
  demo-content element. A demo-content wrapper that only adds docs-only
  presentation around a real component, such as a usage hint, is removed rather
  than replaced: the copy keeps the wrapped component and its props as if the
  wrapper were absent, and `demoContentReplaced` counts only the placeholders,
  since only they need the consumer's own content.
  The copies are `template copy` and the docsite's shadcn
  Install item, which writes the example into the consumer's project. The copy
  receipt (FR11) MUST count the replaced elements as `demoContentReplaced`.
  Until the next minor, the persisted `.astryx/<item>.json` receipt keeps its
  v2 shape (released readers validate it strictly), so the replacement counts
  appear in the copy response that `template copy` and `template show` report.
  `template show` returns the same source a copy writes and MUST report
  `demoContentReplaced` in its response, as it reports `demoMediaReplaced`.
  For the shadcn Install item, whose output Astryx does not control, FR11's
  disclosure is carried by the placeholders themselves (each replaced element
  and media reference is a visibly marked placeholder at its replacement point)
  and by the registry item's description. At 0.8.0, the next minor, the
  persisted counts move to a v3 receipt, with a migration note (CLN-0027).
  Surfaces other than these copies and `template show` that hand out example
  source without writing it into a project replace only demo-content elements
  and keep their fixture media:
  `astryx component <Name> --showcase`, which prints the component's showcase
  source, and the docsite surfaces of `spec:AST-033` FR23. Live previews render
  the originals (FR4). A check MUST fail when copied, shown, or handed-out
  output still references a demo-content element or the code that defines it.
  How a demo-content element is marked and replaced belongs to
  `architecture:template-authoring`.

### Boundary with icons

- **FR12 — Icons are excluded by role, not file extension.** Component icons,
  registry icons, imported SVG icon components, and application icons MUST NOT be
  classified as static template fixtures under this contract merely because
  their source representation is an image format. Any copying, import rewriting,
  registry conversion, or fallback behavior for icons requires its own accepted
  contract.

## Current-state impact

Astryx templates currently use repository-local `/template-assets/*` references
for representative images and video. The docsite and sandbox own those files for
preview, and deployed previews can rewrite only the executable bundle to a shared
published location. The portable source keeps the root-relative fixture path.

The CLI copy path currently recognizes Astryx's fixture namespace and replaces
images with a self-contained SVG placeholder. It strips recognized video sources
to an empty string rather than place image data in a video element.

`template copy` and `template show` replace each demo-content element (FR13)
with a `<Text>Card content</Text>` placeholder, import Astryx's `Text` for it
when the source does not already import it, and remove the demo-content import.
They remove a docs-only presentation wrapper, such as a usage hint, and keep
the component it wraps. Both responses report the placeholder count as
`demoContentReplaced`.
`astryx template <name> --skeleton` outlines that replaced source and lists
its components. `astryx component <Name> --showcase` prints the showcase source
with each demo-content element replaced and its fixture media kept. The shadcn
Install item installs block and page source with demo-content elements and
fixture media both replaced, each as a visibly marked placeholder, and its
registry item description says how many were replaced. Its
`.astryx/<item>.json` receipt keeps the v2 shape until CLN-0027.

## Verification

| Contract | Verification                                                                                       | Representative cases                                                                                                                                                                                                                                                                                                                             | Failure expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | Template-source and copy-boundary tests                                                            | built-in page, block, integration template; Astryx fixture; consumer path; third-party URL                                                                                                                                                                                                                                                       | Copied source retains a preview runtime dependency or rewrites consumer-owned content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| FR4–FR6  | Real preview request and rendered-media checks                                                     | local, docsite, main sandbox, PR preview; image and video; missing fixture                                                                                                                                                                                                                                                                       | Representative media 404s, resolves to another file, or silently uses the wrong kind                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR7–FR8  | End-to-end CLI copy tests                                                                          | image-only, video-only, and no-media template                                                                                                                                                                                                                                                                                                    | Generated source retains `/template-assets/` or does not parse/render without setup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| FR9–FR10 | Classifier and mixed-source mutation tests                                                         | upper/lower case; multi-dot filename; image poster plus video; unknown suffix                                                                                                                                                                                                                                                                    | Last suffix is misread, image data enters video, or an unsupported kind is guessed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| FR11     | Human and structured copy-receipt tests                                                            | no replacement; one image; mixed media                                                                                                                                                                                                                                                                                                           | The consumer is not told what must be replaced or is told assets were installed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| FR12     | Scope guard tests and review                                                                       | Icon prop, registry icon, imported SVG component, static hero image                                                                                                                                                                                                                                                                              | Icon behavior is silently folded into the static-fixture transformer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| FR13     | End-to-end CLI copy, show, and `--showcase` tests, a shadcn install test, and a real preview check | a motion or gesture example whose `Card` wraps one demo-content element; one with two; one whose `Card` sits in a docs-only hint wrapper; an example with none; its `template show` response; its `--showcase` output; its shadcn install into a project, its registry item description, and its `.astryx/<item>.json` receipt; its live preview | Copied, shown, or installed output still references a demo-content element or keeps a docs-only wrapper or its hint text (a hinted example copies to exactly the `Card` plus its placeholder), the code that defines it, or `/template-assets/`; `--showcase` output references a demo-content element or changes its fixture media; the outer component or its props change; the copy receipt or the `template show` response omits or miscounts `demoContentReplaced`; a shadcn install leaves a replaced element or media reference without a visibly marked placeholder, or its registry item description does not disclose the replacement; the installed `.astryx/<item>.json` receipt gains a field or fails the released strict v2 reader before CLN-0027; or the live preview stops rendering the original |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- preview environments render the same canonical static fixtures without private
  network access or per-preview duplication requirements;
- copied templates retain no Astryx preview-only media reference;
- image, poster, and video fallbacks are kind-safe and covered end to end;
- unsupported static fixture formats fail with an actionable reference;
- copy receipts identify replaced demonstration media;
- copied and installed templates retain no demo-content element or reference
  to the code that defines it, and the receipt counts the replaced elements; and
- icon sources are proven outside this transform and linked to a separate
  contract before any icon conversion is introduced.

## Decision log

### DEC-1 — Template media demonstrates a composition; consumers replace it

**Reference:** `spec:AST-028/DEC-1`

**Decider:** `cixzhang`, `2026-09-04`

Images and videos in Astryx templates are local fixtures for showing the
intended composition. A copied template is consumer-owned editable source, not a
channel for distributing production media or preserving an Astryx preview
runtime dependency.

Rejected: treating the checked-in demonstration files as a supported consumer
asset library or copying them by default into every project.

### DEC-2 — Preview and copy have different obligations

**Reference:** `spec:AST-028/DEC-2`

**Decider:** `cixzhang`, `2026-09-04`

Maintainer previews show the real fixture so the template can be judged. Copied
source removes the preview dependency and substitutes a media-kind-safe,
portable replacement point so the consumer can customize it.

Rejected: showing placeholders in every maintainer preview, and leaving
repository-only fixture URLs in generated projects.

### DEC-3 — Icons require a separate contract

**Reference:** `spec:AST-028/DEC-3`

**Decider:** `cixzhang`, `2026-09-04`

This contract covers static image and video fixtures and the demo-content
elements of DEC-4; it does not cover icons. Icons have distinct
semantic, import, registry, and conversion concerns; grouping them with demo
media would silently decide another public boundary.

Rejected: classifying every SVG or image-like source as a template fixture.

### DEC-4 — Demo-content elements are fixtures that copy replaces

**Reference:** `spec:AST-028/DEC-4`

**Decider:** `cixzhang`, `2026-11-01`

Motion and gesture examples can show docs-only demo contents, such as a
playing-card face, inside a real Astryx component without a second copy of each
example to maintain. Those contents are fixtures in the DEC-1 sense: copy
replaces each demo-content element with a generic placeholder and keeps the
outer component, removes a wrapper that only adds docs-only presentation (such
as a usage hint) and keeps what it wraps, and previews render the originals
(DEC-2). The shadcn Install
item writes the example into the consumer's project, so it is a copy and
replaces fixture media and demo-content elements as `template copy` does.
`template show` returns the same source a copy writes; other surfaces that
only hand out source replace demo-content elements alone. Examples without
demo-content elements keep their source, except that their shadcn install
replaces fixture media like any copy (FR7).

Rejected: a docs-only duplicate of each example, which adds documents to keep in sync.

## Deprecation and cleanup records

### CLN-0027 — The installed receipt counts what the copy replaced

| Field     | Value                                                                                                                                                                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id        | `CLN-0027`                                                                                                                                                                                                                                                                                                                                    |
| lifecycle | No deprecation: the staged `[breaking]` change for FR13 (`spec:AST-017` FR28)                                                                                                                                                                                                                                                                 |
| delta     | The shadcn Install item writes a v3 `.astryx/<item>.json` receipt that adds `demoMediaReplaced` and `demoContentReplaced`. `astryx upgrade` reads v1, v2, and v3 receipts; a CLI released before 0.8.0 cannot read a v3 receipt, so the migration note tells consumers to upgrade the CLI before they upgrade an item installed from 0.8.0 on |
| rollback  | Restore the v2 receipt writer from the final-patch baseline                                                                                                                                                                                                                                                                                   |
| state     | `pending` — lands in 0.8.0, the next minor, with its `[breaking]` Changeset                                                                                                                                                                                                                                                                   |

## Open questions

None.
