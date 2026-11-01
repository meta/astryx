---
title: 'The best CLI is one you never run'
description: 'What the Astryx CLI is, why it is docs-first, and a tour of every command.'
date: '2026-07-10'
type: 'engineering'
authors:
  - 'josephfarina'
tags:
  - 'CLI'
  - 'AI'
  - 'Docs'
coverImage: '/blog/the-astryx-cli/cover.gif'
coverAlt: 'A terminal running astryx init'
relatedDocs:
  - title: 'AI is a copycat, so we gave it good examples to copy'
    href: '/blog/astryx-cli-build-command'
  - title: 'How Astryx works'
    href: '/blog/how-astryx-works'
  - title: 'CLI'
    href: '/docs/cli'
---

This is the first in a series on the Astryx CLI. It is the tool an agent uses to build with Astryx or as we like to think of it the interface for the machine. We put a lot of thought into getting it right.

## The CLI is the docs

Agents live in the terminal now. Give one a good tool and it uses it well. But most tools we hand agents are not good enough. So we made a call that the CLI is the docs. That is where every doc, example, and reference starts. The docs site you are reading is a consumer of the CLI and not the other way around. The CLI is the source of truth. An agent always reads the exact source we wrote and maintain. There is no second copy to fall out of sync. Nothing goes stale.

Docs are only part of it. The CLI also serves templates that show an agent how to build a real page. It builds themes. It searches across all of it. The best CLI is one you never run. The agent runs it. It is all open source so [have a look for yourself](https://github.com/meta/astryx/blob/main/apps/docsite/scripts/generate-data.mjs). Or do not read this post at all. Tell your agent to run `astryx blog` and it will read it for you.

## The tour

Here is the fun part. You do not really need any of it. Your agent will know it all. But in case you are curious, I will walk you through every part of the CLI you might reach for. We go from an empty folder to a shipped app. I am keeping it high level.

**Set up.** `astryx init` installs the packages and writes your agent file. You do not even need to maintain that file. We do. You can still change it if you want. And `upgrade` keeps it current as the system changes.

**Learn.** `astryx search` ranks results across components, hooks, docs, and templates at once. `astryx component` prints the props, examples, and source for a component. `astryx hook` does the same for hooks. `astryx docs` covers reference topics like tokens, color, type, motion, and our principles.

**Compose.** `astryx build` is going to be your best friend. Tell it what you are making. It points your agent at the closest template, the right blocks, and the components to fill the gaps. `astryx template` drops a page template straight into your project. `astryx layout` sketches a page's structure from a short expression before you fill it in.

**Make it yours.** `astryx theme build` compiles a theme to production CSS and JS. `astryx swizzle` ejects a component's full source when you want to own it.

**Keep it current.** `astryx upgrade` runs codemods that migrate your code between versions. It refreshes the agent docs too. `astryx doctor` finds problems and tells you the fix.

## One surface, many readers

We enforce a JSON interface across every command. We enforce stable error codes too. Agents can rely on both and work programmatically. A manifest describes the whole tool in one call if an agent needs it. Most commands describe themselves. An agent can find its way through on its own. And there is a dense mode for fewer tokens.

## The whole point

An agent building with Astryx should not have to guess. Everything is one command away.

Read part two: [AI is a copycat, so we gave it good examples to copy](/blog/astryx-cli-build-command).
