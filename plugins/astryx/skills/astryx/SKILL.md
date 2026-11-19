---
name: astryx
description: "Astryx, a design system and UI library, is available on this computer through the astryx command; use it when building or changing UI, choosing components, layout, styling or theming, working with a design system, or in any project that depends on @astryxdesign packages or mentions Astryx."
---

<!-- ASTRYX:START -->
<!-- astryx-managed sha256:2bf23887c59daa97114635d52473b65ad74729cf1bf52240bef855996abffb3d -->
Astryx, a design system and UI library, is available on this computer.
Inside a project that has its own Astryx text (an `astryx-project` skill, or an Astryx block in AGENTS.md or CLAUDE.md), follow that text: it knows the project's version and setup.
Use it when you build or change UI, pick components, or style or theme an app.
Its docs, components, templates, and themes are all reachable through `astryx`. To make a page, run `astryx build "<what the page is for>"` first, as the WORKFLOW below says. Start with `astryx search '<what you need>'` for anything else.
Then read `astryx component <Name>` or `astryx docs <topic>`, not the package's files.
In a project, the project's version of Astryx answers automatically.
To build UI, work in a project folder (create one if there is none). In a new project, add `@astryxdesign/core` and `@astryxdesign/cli`; in an existing app that doesn't use Astryx, keep its current UI stack unless the user asks for Astryx, and then add both. To a project that already has `@astryxdesign/core`, add `@astryxdesign/cli` at the same version, pinned exactly when Core is (no `^` or `~`). In a project that has or adds Astryx, run `astryx init` and follow the agent docs it writes; the WORKFLOW below is for that project.
WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx component <Name>` to read props before using one; `astryx template <Block>` prints a block example to read for a part it lacks. Astryx names differ from other libraries: buttons, badges, tokens and tabs take their text in `label` (Text, Heading and Link take children), booleans start with `is` or `has` (`isOpen`, `isDisabled`), and every input takes `value` and `onChange`.
Before you deliver an Astryx page, re-read each file; replace any raw <div>/<span>, imported .css/@apply, or hardcoded #hex/px with the component or a token. Then build the project and deliver that build, not a description of it.
If `astryx` is not found, run `npm i -g @astryxdesign/cli` first.
<!-- ASTRYX:END -->
