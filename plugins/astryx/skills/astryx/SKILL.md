---
name: astryx
description: 'Astryx, a design system and UI library, is used through the astryx command; use it when building or changing UI, choosing components, layout, styling or theming, working with a design system, or in any project that depends on @astryxdesign packages or mentions Astryx.'
---

Astryx, a design system and UI library, is used through the `astryx` command.
Use it when you build or change UI, pick components, or style or theme an app.
Its docs, components, templates, and themes are all reachable through `astryx`. Start with `astryx search '<what you need>'`.
Then read `astryx component <Name>` or `astryx docs <topic>`, not the package's files.
In a project, the project's version of Astryx answers automatically.
To build UI, work in a project folder (create one if there is none). Add `@astryxdesign/core` and `@astryxdesign/cli` to a new project or one without `@astryxdesign/core`; to a project that already has `@astryxdesign/core`, add `@astryxdesign/cli` at the same version. Run `astryx init` there and follow the agent docs it writes.
If `astryx` is not found, run `npm i -g @astryxdesign/cli` first.
