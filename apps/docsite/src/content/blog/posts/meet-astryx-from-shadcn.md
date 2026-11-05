---
title: 'Meet people where they already build'
description: 'A compatibility path for shadcn users to install Astryx components, examples, blocks, and pages without giving up the Astryx package or CLI.'
date: '2026-09-02'
type: 'engineering'
draft: true
authors:
  - 'josephfarina'
tags:
  - 'CLI'
  - 'Components'
  - 'Templates'
relatedDocs:
  - title: 'Use Astryx with shadcn'
    href: '/docs/shadcn-compatibility'
  - title: 'Migration guide'
    href: '/docs/migration'
  - title: 'Components'
    href: '/components'
---

A lot of teams already have a shadcn app. Asking them to replace their setup before they can try one Astryx component is a bad first date.

So we tried a smaller idea: what if Astryx met them inside the workflow they already use?

## The registry is a delivery truck

shadcn has a [Registry protocol](https://ui.shadcn.com/docs/registry). A registry is static JSON that tells its CLI which packages to install and which source files to add to an app. Independent libraries use that protocol because it gives them a familiar install command without making them part of shadcn.

Astryx can do the same thing.

```bash
npx shadcn@4.19.0 add <registry-origin>/templates/dashboard.json
```

The important bit is what happens after that command. Astryx does not become a pile of copied component source. The command installs the real `@astryxdesign/core` package. The dashboard code it copies imports `Card`, `Table`, `Button`, `ProgressBar`, and everything else from that package.

Astryx still owns component behavior, accessibility, styling, and fixes. The app owns the dashboard composition it asked for.

## Copy the composition, not the design system

This splits the catalog into two useful kinds of install:

- A **component** entry installs the package and writes a tiny local re-export.
- An **example, block, or page** entry copies editable application code that imports the package.

That distinction matters. Copying a complete Button implementation into every app makes upgrades harder and lets every copy drift. Copying a dashboard that uses the published Button is normal application development. The design system stays a dependency. The page stays yours.

Copied compositions include a small adjacent Astryx receipt. After you update the Astryx packages, `astryx upgrade --registry` previews changes against the installed base and the matching registry release. Add `--apply` to update unchanged files and merge non-overlapping edits. Conflicts leave your file untouched with a separate review file.

Deep customization still exists, but it remains explicit through `astryx swizzle`. A normal registry install does not cross that line for you.

## We tried the whole catalog

The first experiment generated registry entries from the same catalog that powers the CLI and docsite. It covered every published component and hook, every showcase and example block, and every ready page template.

Then we created a clean shadcn Vite app and installed a Button entry, a Button showcase, a Button example, and a complete analytics dashboard through the shadcn CLI. The CLI installed the Astryx package and other dependencies, added the required CSS, wrote the four files into the app, and the untouched app built successfully.

The experiment matters because it is small. The registry is generated JSON. The docsite already has the catalog, source, package versions, and pages. We are not building another component system.

## This does not replace the Astryx CLI

The shadcn CLI is good transport. It can fetch a known item and put it in the right place.

The Astryx CLI knows the system. It can help you find what fits a prompt, explain the component contract, assemble a page from multiple pieces, compile themes, validate an installation, and apply upgrades.

The two paths can sit next to each other:

```bash
# I know the exact item and already use shadcn
npx shadcn@4.19.0 add <registry-origin>/examples/button/variants.json

# I need help finding and maintaining the right pieces
astryx build "analytics dashboard with filters"
astryx doctor
astryx upgrade --registry
astryx upgrade --registry --apply
```

## Why bother?

Incremental adoption is the point. A team can try one Astryx block inside its current app. It can add a full page when that is useful. It does not need to declare a migration project or learn a new tool before seeing value.

Astryx gets a wider front door without giving up the package boundary or the richer CLI experience. We meet people where they already build, and give them a reason to come further in.
