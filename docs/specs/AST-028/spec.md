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
docs-only demo contents, imported from the one repository-only demo-content
module, that a real Astryx component wraps in a motion or gesture example.

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
  such as `<Card><PlayingCardContents /></Card>`. A demo-content element is an
  element imported from the one repository-only demo-content module. Copying a
  template MUST replace repository-only demo assets (FR7–FR10) and every
  demo-content element with generic placeholders and drop the demo-content
  import, keeping the outer component and its props. The copy receipt (FR11)
  MUST count the replaced elements as `demoContentReplaced`. Live previews
  render the originals (FR4). A check MUST fail when copied output still
  references a demo-content element or its import. Implementation gap: the
  demo-content module, the element replacement, and `demoContentReplaced` are
  not built (Current-state impact).

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
to an empty string rather than place image data in a video element. This behavior
established the core preview-versus-copy split, while this record adds the
previously unwritten requirements for why assets are fixtures, which references
may be transformed, what a safe fallback means, how unsupported formats fail,
and why icons are separate.

Demo-content elements (FR13) are not built: no demo-content module exists, the
copy path replaces no elements, and the copy receipt has no
`demoContentReplaced` count.

This specification-only change alters no package, template, asset, preview,
runtime, or public CLI behavior. Remaining implementation and verification
follow separately.

## Verification

| Contract | Verification                                        | Representative cases                                                                                                          | Failure expectation                                                                                                                                                                                                  |
| -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1–FR3  | Template-source and copy-boundary tests             | built-in page, block, integration template; Astryx fixture; consumer path; third-party URL                                    | Copied source retains a preview runtime dependency or rewrites consumer-owned content                                                                                                                                |
| FR4–FR6  | Real preview request and rendered-media checks      | local, docsite, main sandbox, PR preview; image and video; missing fixture                                                    | Representative media 404s, resolves to another file, or silently uses the wrong kind                                                                                                                                 |
| FR7–FR8  | End-to-end CLI copy tests                           | image-only, video-only, and no-media template                                                                                 | Generated source retains `/template-assets/` or does not parse/render without setup                                                                                                                                  |
| FR9–FR10 | Classifier and mixed-source mutation tests          | upper/lower case; multi-dot filename; image poster plus video; unknown suffix                                                 | Last suffix is misread, image data enters video, or an unsupported kind is guessed                                                                                                                                   |
| FR11     | Human and structured copy-receipt tests             | no replacement; one image; mixed media                                                                                        | The consumer is not told what must be replaced or is told assets were installed                                                                                                                                      |
| FR12     | Scope guard tests and review                        | Icon prop, registry icon, imported SVG component, static hero image                                                           | Icon behavior is silently folded into the static-fixture transformer                                                                                                                                                 |
| FR13     | End-to-end CLI copy tests plus a real preview check | a motion or gesture example whose `Card` wraps one demo-content element; one with two; an example with none; its live preview | Copied output still references a demo-content element or its import, the outer component or its props change, the receipt omits or miscounts `demoContentReplaced`, or the live preview stops rendering the original |

### Completion criteria

This spec moves from `accepted` to `shipped` only when:

- preview environments render the same canonical static fixtures without private
  network access or per-preview duplication requirements;
- copied templates retain no Astryx preview-only media reference;
- image, poster, and video fallbacks are kind-safe and covered end to end;
- unsupported static fixture formats fail with an actionable reference;
- copy receipts identify replaced demonstration media;
- copied templates retain no demo-content element or import, and the receipt
  counts them; and
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

This contract covers static image and video fixtures only. Icons have distinct
semantic, import, registry, and conversion concerns; grouping them with demo
media would silently decide another public boundary.

Rejected: classifying every SVG or image-like source as a template fixture.

## Open questions

None.
