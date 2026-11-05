---
title: 'AI is a copycat so we gave it good examples to copy'
description: 'We created a single entry point in the CLI that exposes the high quality templates our designers crafted so your agent can copy them and produce high quality output.'
date: '2026-07-17'
type: 'engineering'
draft: false
authors:
  - 'josephfarina'
tags:
  - 'CLI'
  - 'AI'
  - 'Composition'
coverImage: '/blog/astryx-cli-build-command/cover.png'
coverAlt: 'Many copies of the Astryx astronaut cat mascot arranged in rows on a light blue background'
relatedDocs:
  - title: 'The best CLI is one you never run'
    href: '/blog/the-astryx-cli'
  - title: 'CLI'
    href: '/docs/cli'
  - title: 'Components'
    href: '/components'
---

This is the second post in the series on the Astryx CLI. The first was about how [the CLI is the docs](/blog/the-astryx-cli).

## You have probably noticed AI is very good at copying

Arguably what an LLM does best is copy. We all know it is much worse at coming up with original ideas. And we all know it has major struggles with frontend code. This is not news to anyone who has spent time with any of the major models out there. And we ran straight into it building Astryx.

Early on our templates were not good. There was too much plain StyleX. Too many divs and spans. Not enough actual components. We would ask an agent to build a page and watch it barely touch Astryx or hand back something that just looked broken. That confused us for a while. The agent had the docs. It had every prop and every example through the CLI. It had everything it could possibly need. Why was it ignoring all of it?

The answer was almost too simple. It was copying our bad examples. Garbage in, garbage out. The old saying still holds. That is why we wrote a [grading rubric for templates](https://github.com/meta/astryx/wiki/Contributing-Templates). It scores every template the same way every time. Nothing sloppy slips through and a room full of designers can hold one bar. We fixed what the agent was copying and the output followed.

## Good examples to copy

That fixed the quality problem. We now have a large number of high quality templates our designers made. That box is checked. The next problem is usability. A full page example only helps when your need looks like the one we built. Needs vary a lot. Covering every one of them with full pages is not sustainable. That is why we make examples at three sizes:

- A **page** is a full template. It is the dream case when your need matches one of ours.
- A **block** is a smaller composable piece. It meets the same quality bar but it is not a full page. You compose them into what you need.
- A **component** example shows a good way to use one specific component.

Now we have high quality examples at every size from full pages down to the smallest component. We have the full range. The next question is how an agent actually uses all of it. It can grep around and it will find some things. But what if it wants analytics and we named the template dashboard? There are plenty of cases like that where the words do not line up. A plain text search will not cut it. We had to be cleverer about how we expose this.

## Introducing `astryx build`

The solution to everything above is a single command called `astryx build`. It takes a natural language prompt and returns the pieces that might be relevant to what you are building. It is the one command your agent uses to find anything it needs for the project you are working on. If it cannot find a whole page it might recommend a block or a component. It does not just hand back a list of results. It recommends the first move so your agent knows exactly where to start. In a way it is almost an interactive prompt.

Under the hood it is a plain ranking algorithm. `astryx build` starts by gathering every candidate at once from your components and hooks and docs and templates. Then it cleans up your prompt. It throws out the filler words and expands the rest through a built-in synonym map so a request for a dashboard also reaches analytics and KPIs and metrics. It even stems each word so that chart and charts and charting all fold down to the same root.

Every candidate then gets scored on a fixed ladder of signals:

- An exact name match wins.
- An exact keyword is next.
- Below those sit the near matches that forgive typos and small misspellings by edit distance.

A word that only lives in a description still counts but a clean name or keyword match always outranks it so you get the real thing and not something that happened to mention your word once. On a longer prompt it scores each concept on its own and rewards whatever covers the most of them. It then averages the strength of those matches so a wordy prompt is never punished for rambling.

Templates get one extra trick. Each one is indexed by what it is built from and not just its title. A page carries the names of the actual components inside it so it surfaces even when its title tells you nothing. In the end your agent gets everything it needs to build the page:

- the closest page to start from
- the blocks that cover parts of it
- the components to fill the gaps
- the frame and foundation every page needs anyway

Then it picks a single starting move. A strong page match means scaffold this one and a weaker match means treat it as a layout reference and compose the rest. All of this is fast and deterministic so the same prompt returns the same result every time. There is no network call and no model behind it. You can read [the whole thing](https://github.com/meta/astryx/blob/main/packages/cli/src/api/search.mjs) yourself.

Finally every `astryx build` run ends with a short set of rules. No divs for layout and no inline styles and tokens for everything else. It is the rubric again but this time pointed at your agent instead of our designers. The agent still gets to improvise and the fences just keep it on the system while it does.

## The whole point

A big part of what we are building toward with Astryx is this. An agent should be able to produce a genuinely good frontend without much effort from you at all. You should be able to spin something up and trust it without thinking hard about how it got there.

Instead of fighting the copycat we lean into it. We make good things. We put them where the agent will find them. And we let it copy. Good examples become good output. And good output becomes the next thing worth copying. Give a copycat something worth copying and it starts to look a lot like taste.
