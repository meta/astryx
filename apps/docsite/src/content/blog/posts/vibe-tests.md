---
title: 'Vibe Test'
description: 'How we make decisions in Astryx'
date: '2026-07-27'
type: 'engineering'
authors:
  - 'cixzhang'
  - 'ernest'
tags:
  - 'AI'
  - 'Testing'
  - 'Design systems'
coverImage: '/blog/vibe-tests/cover.png'
coverAlt: 'Astracat, the Astryx mascot, dressed as a scientist in a lab coat and round glasses, sipping a flask of blue liquid, with the words vibe and test on either side'
relatedDocs:
  - title: 'How Astryx works'
    href: '/blog/how-astryx-works'
  - title: 'Vibe Tests wiki'
    href: 'https://github.com/meta/astryx/wiki/Vibe-Tests'
---

When we started this project, the AI space was chaotic. Every so often a new solution would pop up (a new framework, a new prompting trick, a new "agent-native" pattern), and it was hard to know where to invest our efforts. We also strongly believed that a well-designed and well-documented system should be good for AI and humans alike. Beyond open-sourcing our work so it can be consumed by models in their training data, we had the option of context engineering, but that carries downsides around staleness and maintenance, almost like a second set of code to keep in sync.

So we needed a way to _measure_ it. For our vibe tests, we tried to figure out what specific properties we wanted in the output of a design system: the things worth maintaining, encoding, and measuring in our codebase.

Our [first iteration of vibe testing](https://github.com/meta/astryx/pull/57) set up the harness: personas, a prompt battery, and an evaluator that scored generated code for "escape hatches" (hallucinated components, wrong component choices, wrapper divs, redundant CSS) against a list of expected components. It worked, but it was too specific. It mostly measured _system adherence_ (whether the agent used Astryx the way we wanted), which assumed Astryx was the right answer and couldn't fairly compare us against anything else.

Our [next iteration](https://github.com/meta/astryx/pull/243) prioritized _fairness_. We replaced adherence-checking with a target-neutral evaluation: the same deterministic analysis runs across every configuration (Astryx, Tailwind, shadcn, raw HTML), scoring code on properties any good output should have, not on whether it looked like ours. That let us ask the real question: is Astryx actually better, or do we just prefer it?

## The principles we keep in mind

When thinking about vibe tests, we keep these principles in mind:

- **Simulate naive environments.** User prompts should not contain leading language, and testing agents should not inherit any SOUL.md, MEMORY.md, or prior context. Prompts should describe the _user experience_ rather than specific components. For example, "Build an FAQ page where the user opens each question" instead of "Create an accordion using collapsible lists." Prompts should also give reasonable coverage across categories to prevent oversampling one area and only testing the happy path.
- **Keep sub-agents context-free.** Because sub-agents typically carry main-agent context, [specific instructions](https://github.com/meta/astryx/wiki/Vibe-Evaluation#sub-agent-isolation) are followed to ensure isolation and prevent context from leaking in ways that would skew results.
- **Narrow to 3 to 5 candidates per test.** These could be small design details (component abstraction level, API naming, configuration shapes) or framework-level decisions like testing Astryx with StyleX vs. Tailwind vs. shadcn vs. raw HTML.
- **Let a separate agent be the judge.** After sub-agents run through all the prompt batteries, a judge agent is spawned to compare across all the outcomes. It's important for sub-agents _not_ to self-judge; we found that self-judging minimizes the ability to spot differences across outcomes.

The judges are guided by a set of rubrics we document in the Astryx wiki, baking in the aspects that matter to Astryx. For example:

- The [Astryx system test](https://github.com/meta/astryx/wiki/Vibe-Evaluation#what-gets-measured) judges on: correctness, accessibility, code quality, efficiency, maintainability, and design dimensions. (Design is scored from rendered screenshots against reference images and is still a work-in-progress dimension.)
- [Astryx's API test](https://github.com/meta/astryx/wiki/API-Arbitration#what-to-look-for) judges on: discoverability, hallucinations, added divs, verbose code, and unused-feature dimensions.

## Reporting and self-healing

Because vibe tests can run at scale and at frequency, we run them _every night_ using a [nightly cron job](https://github.com/meta/astryx/wiki/Night-Watch-Vibe-Test-Runner) that activates an AI orchestrator: the same prompt battery across all four configurations, scored on all six dimensions. We call these [night watches](https://github.com/meta/astryx/wiki/Night-Watch-Overview), and they help automate management of various parts of our system. This gives us a rolling scorecard instead of a one-off snapshot.

Here's one good night ([2026-07-10](https://github.com/meta/astryx/wiki/Vibe-Test-Scores)). The overall picture across targets:

| Target                     | Overall |
| -------------------------- | ------- |
| **Astryx**                 | **98**  |
| Astryx + Tailwind          | 97      |
| Baseline (shadcn/Tailwind) | 95      |
| Raw HTML                   | 82      |

And Astryx's own dimension breakdown for that run:

| Dimension       | Score           |
| --------------- | --------------- |
| Correctness     | 100             |
| Accessibility   | 100             |
| Code quality    | 100             |
| Efficiency      | 88              |
| Maintainability | 100             |
| Design          | _WIP dimension_ |

It's not always this good. AI agents aren't deterministic, so some nights go sideways. Here's a rough one ([2026-06-28](https://github.com/meta/astryx/wiki/Vibe-Test-Scores)): Astryx dropped to an overall 77 and lost the night to the baseline.

| Dimension       | Score           |
| --------------- | --------------- |
| Correctness     | **2**           |
| Accessibility   | 98              |
| Code quality    | 99              |
| Efficiency      | 91              |
| Maintainability | 96              |
| Design          | _WIP dimension_ |

Everything held except correctness, which fell off a cliff. The agents hallucinated imports and prop names on a handful of prompts, and one bad category dragged the whole night down. Across our full ledger the baseline actually wins the plurality of nights; we don't always come out on top, and the scorecard is public precisely so we can't hide that.

The nice thing about running these nightly is that we can follow up. When a run comes in, a second night watch, the [vibe test debugger](https://github.com/meta/astryx/wiki/Night-Watch-Vibe-Test-Debugger), picks it up. It reads the failing prompts, classifies each failure, and fixes what's fixable by opening a PR ([like this](https://github.com/meta/astryx/pull/3907)) against our docs or CLI.

We found that AI producing solutions to vibe-test issues naively will often oversample for the specific issue it encountered in a single test, so the debugger is instructed to look for recurring patterns and to demonstrate evidence by reproducing the vibe-test issue, not to chase one-off variance from a single bad night.

## Design your own

Vibe testing isn't just for our own decisions. You can point it at almost anything the community ships to understand whether it's worth pursuing, or use it as an API check or exploration. Vibe tests became our compass for quickly evaluating new ideas and narrowing down where to invest. Some real examples that shaped Astryx's design:

- [Token naming structure](https://github.com/meta/astryx/issues/864)
- [Selector API](https://github.com/meta/astryx/issues/477)
- [CLI vs MCP](https://github.com/meta/astryx/issues/2306)

For example, when the [impeccable front-end skills](https://impeccable.style/) were released, we [explored vibe testing them with Astryx components](https://github.com/meta/astryx/issues/1000).

You can design your own vibe tests by providing a few key ingredients to an AI agent. [Have your agent follow the instructions here.](https://github.com/meta/astryx/wiki/Designing-Vibe-Tests) We hope this methodology helps people navigate the crazy world of AI!
