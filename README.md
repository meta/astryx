<!-- SYNC CONTRACT: Architecture changes require documentation updates. -->

<div align="center">

<img src="https://lookaside.facebook.com/assets/astryx/Astryx-Banner.png" alt="Astryx" width="100%" />

# Astryx

An open-source design system that's fully customizable and built for how we build today: by people and the agents working alongside them.

Currently in Beta · Built on React 19+ and StyleX

npm version · MIT License · PRs welcome

Docs · Storybook · Sandbox

Docs · Storybook · Sandbox · Contributing · Discord

## Overview

Astryx is an open-source design system that grew inside Meta over the last eight years, becoming the company's largest and most widely used design system. It powers 13,000+ apps and is shaped by the engineers, designers, and product teams who depend on it every day.

It ships 150+ accessible components, brand-level theming, dark mode, ready-to-ship templates, and a CLI as one cohesive system. You import pre-built CSS and use typed React components — no build plugin or styling library to adopt — and both people and AI assistants build with the same tooling.

### What makes Astryx different:

**Open internals.** Components are built to be composed at any level, not locked behind a closed top-level API. The building blocks you'd reach for are exported directly, and when you need to go deeper, swizzle ejects a component's full source into your project for you to own.

**No styling lock-in.** Astryx authors its styles with StyleX, but that's invisible to consumers. Override with className using Tailwind, CSS modules, or plain CSS — whatever your project already uses.

**Customize without wrapping.** A theme is a set of CSS custom property overrides, so designers can make Astryx unmistakably their own without forking or wrapping component source.

**Built for people and agents.** The API, docs, and CLI are designed together so a person and an AI assistant build the same way, from the same reference.

## Getting Started

Astryx requires React 19 or later (react and react-dom are peer dependencies of @astryxdesign/core).

Install Astryx, a theme, and its peer dependencies:

```bash
# npm
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
npm install -D @astryxdesign/cli

# pnpm
pnpm add @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
pnpm add -D @astryxdesign/cli

# yarn
yarn add @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
yarn add -D @astryxdesign/cli
```

You can also install the CLI globally so `astryx` works in any folder and every coding agent can discover Astryx. When run inside a project, it still uses that project's own version.

Project install, global install, or both? The Astryx docs on global, project, and combined installations compare them (both is recommended), and the global installation guide explains how global mode works.

The simplest setup is a few CSS imports and a theme provider — no build plugin, PostCSS, or Babel configuration required. See the @astryxdesign/core README for the full guide (Next.js, Tailwind, Vite, and CDN).

For reliable CLI access, add a script to your package.json:

```json
"scripts": {
  "astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"
}
```

Then use it as `npm run astryx -- component --list`. This avoids path errors when AI assistants or new developers invoke the CLI directly.

## Packages

| Package | Description | README |
|---|---|---|
| @astryxdesign/core | Components, theme system, and utilities | README |
| @astryxdesign/cli | CLI tooling: component docs, templates, scaffolding, themes, and codemods | README |
| @astryxdesign/build | Build plugins for StyleX source builds | README |
| @astryxdesign/theme-* | Seven ready-made, fully customizable themes (neutral, butter, chocolate, matcha, stone, gothic, y2k) | README |

@astryxdesign/lab (experimental components) is used internally for Storybook and the sandbox and is not published to npm. @astryxdesign/vega (Vega/Vega-Lite chart wrapper) and @astryxdesign/charts (chart components) are published to npm only under the @canary dist-tag — there are no stable releases yet.

## Principles

These are the promises Astryx makes to the people building on it.

**Guidance over enforcement.** Components give you capability rather than guardrails that fight you. Design opinions live in docs and examples — if you pass a value, the component renders it.

**Strong, documented conventions.** Every component follows the same naming, prop, and composition rules, and every one is thoroughly documented — so once you've learned a few, the rest feel familiar, and both people and AI can predict how an unfamiliar component behaves.

**One system for humans and AI.** The API, conventions, docs, and CLI are designed together so people and AI assistants build the same way. Every change that made Astryx easier for AI made it easier for people too.

**Earned by measurement.** We test conventions rather than assert them, hold the results loosely, and revisit them when a new situation proves them wrong.

## Architecture

### Foundations

The building blocks for visually cohesive and accessible interfaces: typography, color, layout, and accessibility.

### Components

A library of 150+ reusable UI building blocks with full TypeScript support.

### Patterns

Battle-tested design solutions for common interactions and workflows: table pages, detail page layouts, form wizards, navigation patterns, and data entry flows.

## Project Structure

| Directory | Purpose |
|---|---|
| apps/ | Example apps, the docsite, and Storybook |
| packages/ | Published packages: core, cli, build, themes |
| internal/ | Internal tooling: test utilities, ESLint plugin, vibe tests |

## Contributing

We welcome contributions! See CONTRIBUTING.md for the full guide.

Questions or want a hand with a PR? Come find us on Discord.

Our conventions and review rubrics live in the Contributing wiki — including API Conventions, Design Conventions, the Component Lifecycle, the Contributing Templates, and the Blog Review Rubric. Read the relevant rubric before opening a PR.

### Quick Start for Contributors

This repo uses Node 22+ on an active LTS line and pnpm 11. Install pnpm directly, or enable Corepack once so the pinned pnpm version installs automatically:

```bash
corepack enable
pnpm install
```

If Corepack is missing, install pnpm directly or install Corepack manually; see the troubleshooting notes in CONTRIBUTING.md.

The Theme Showcase DOM tests use the root UI project for shared DOM and StyleX test setup. Run the following command from the repository root:

```bash
pnpm exec vitest run --project ui apps/docsite/src/__tests__/theme-showcase/
```

## License

MIT
