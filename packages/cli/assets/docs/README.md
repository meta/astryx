# /packages/cli/assets/docs

Reference topics for people **building with** Astryx. Not docs about building Astryx itself.

One `{topic}.doc.mjs` per topic, plus optional `{topic}.doc.dense.mjs` / `{topic}.doc.zh.mjs` prose overlays. `foundation/discovery/docs-discovery.mjs` picks up any `{topic}.doc.mjs` here with no registration; `api/docs/_adapter.mjs` merges the overlays.

What you add reaches `astryx docs <topic>`, `astryx search`, the `--json` API, the agent-docs block and the doc site — and ships on npm.

## Who you are writing for

Someone building a product with Astryx. Their questions:

- what a component is for, and when to reach for something else
- the props, their defaults, and what each does to what they see
- how to compose it, and the pattern to copy
- what it costs — bundle size, the a11y obligations they inherit
- how to theme it, and which targets are stable

**The test for anything you add: does a caller act on it?** They are not reviewing a PR, promoting a component out of lab, or attaching evidence to a checklist.

## Tells that you are writing for us instead

- second person aimed at the wrong reader — "reviewers should…", "before promoting a component…", "attach evidence for…"
- an internal rubric, readiness gate, audit checklist, or sign-off that the reader must satisfy for Astryx maintainers
- a table of things to verify rather than things to use
- anything about lab → core, which is our lifecycle, not theirs
- Storybook, Playwright, CI or the Simulator named as tools the reader runs

One subtlety: a statement about the **system's behavior** is caller-facing even when it sounds like process. "A component's theme targets are stable once published" tells a caller what they can rely on; "reviewers must check that theme targets are stable" is ours. Same fact, different reader — **rewrite it rather than move it**.

A public authoring-quality rubric is also caller-facing when it helps someone evaluate an artifact they create through Astryx. It must be complete and actionable from public inputs. It must not include Astryx's internal approval, promotion, evidence-publication, or CI process. A current system spec must assign the shipped guide as the rubric's owner.

## Where the rest goes

The material is usually good; the finding is placement, not quality. It goes in the [wiki](https://github.com/meta/astryx/wiki) — **as a section on the page that already covers it, not a new page.** The wiki is at nearly 60 pages, several of them overlapping, because every stray section got its own.

| what you wrote                                      | where it goes                                                                                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| how a component is graded — checks, scoring         | [Component-Audit-Rubric](https://github.com/meta/astryx/wiki/Component-Audit-Rubric)                                                                                                     |
| lab → core promotion, what a component must satisfy | [Component-Lifecycle](https://github.com/meta/astryx/wiki/Component-Lifecycle)                                                                                                           |
| how to build a new component                        | [Component-Authoring-Guide](https://github.com/meta/astryx/wiki/Component-Authoring-Guide), [Creating-New-Components](https://github.com/meta/astryx/wiki/Creating-New-Components)   |
| what a component must be hardened against           | [Component-Hardening-Protocol](https://github.com/meta/astryx/wiki/Component-Hardening-Protocol), [Hardening-Audit-Guide](https://github.com/meta/astryx/wiki/Hardening-Audit-Guide) |
| a11y requirements as checks we run                  | [Accessibility-Checklist](https://github.com/meta/astryx/wiki/Accessibility-Checklist)                                                                                                   |
| how the system is put together                      | [System-Architecture](https://github.com/meta/astryx/wiki/System-Architecture), [Theming-Infrastructure](https://github.com/meta/astryx/wiki/Theming-Infrastructure)                 |
| API naming and shape decisions                      | [API-Conventions](https://github.com/meta/astryx/wiki/API-Conventions), [API-Arbitration](https://github.com/meta/astryx/wiki/API-Arbitration)                                       |
| contributor workflow, PR process                    | [Contributing](https://github.com/meta/astryx/wiki/Contributing), [Contributing-with-AI-Assistants](https://github.com/meta/astryx/wiki/Contributing-with-AI-Assistants)             |
| release mechanics                                   | [Release-Process](https://github.com/meta/astryx/wiki/Release-Process)                                                                                                                   |
| what a nightly agent role does                      | the Night-Watch pages, from [Night-Watch-Overview](https://github.com/meta/astryx/wiki/Night-Watch-Overview)                                                                             |

**Fits no row?** It is still not caller-facing. Default it to [Contributing](https://github.com/meta/astryx/wiki/Contributing), or `CONTRIBUTING.md` when it is a step someone follows with the repo cloned. Never default it back to this directory.

Worked example: a responsive-and-interaction readiness rubric is grading criteria → **Component-Audit-Rubric**, or **Component-Lifecycle** if it is a promotion gate.

## Imports in code samples

Import each Core export from the path `astryx component <Name>` prints: the
component's own entry when Core has one (`@astryxdesign/core/VStack`,
`@astryxdesign/core/Heading`), and `@astryxdesign/core/theme` for `Theme`,
`defineTheme` and the rest of the theme API. A reader copies one sample and then
reads `astryx component`, and two paths for one export read as two different
things. The no-build CDN page is the exception: its import map names only the
package root.

## Sections are read one at a time

`astryx docs <topic> --index` lists a topic's sections, and readers then open
one section by its key. A section's key is its `id`, or a key derived from its
title when it has none. Give a section an `id` when its title may change, since
readers and extensions link to the key. Two sections in one topic cannot share
a key. Keep each section small enough to read on its own: `astryx doctor` warns on
any section over 32 KB.
