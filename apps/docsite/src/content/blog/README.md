# Adding a Blog Post

The Astryx docsite blog lives at `/blog` (index) and `/blog/<slug>` (post detail).
Posts are human-authored. Adding one is intentionally close to "drop in one
Markdown file."

> **Principle:** metadata organizes the blog; humans write the prose. There is
> no required article template — structure each post however reads best.

## 1. Create the post file

Add a Markdown file under:

```
apps/docsite/src/content/blog/posts/<slug>.md
```

The filename (minus `.md`) becomes the URL slug, e.g.
`introducing-astryx.md` → `/blog/introducing-astryx`.

Start it with YAML frontmatter, then write the body in Markdown:

```md
---
title: 'Designing agent-ready components'
description: 'How Astryx structures component APIs and docs so humans and agents can build with confidence.'
date: '2026-06-17'
type: 'guide'
authors:
  - 'your-handle'
tags:
  - 'AI'
  - 'Components'
  - 'Docs'
---

Write the post in human-authored prose here. Use any structure that fits —
headings, code blocks, lists, links. The body is rendered with `Markdown`.
```

## 2. Frontmatter reference

### Required

| Field         | Type           | Notes                                                                      |
| ------------- | -------------- | -------------------------------------------------------------------------- |
| `title`       | string         | Article `h1`, card title, default page/social title.                       |
| `description` | string         | Card excerpt, article dek, default meta description.                       |
| `date`        | `YYYY-MM-DD`   | Publish date and default sort key (latest first).                          |
| `type`        | enum           | One of `update`, `guide`, `design`, `story`, `perspective`, `engineering`. |
| `authors`     | string[]       | One or more author keys from the author registry (see step 3).             |
| `tags`        | string[] (1–4) | Topical tags for chips and discovery.                                      |

### Optional

| Field            | Type             | Notes                                                                                                     |
| ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `updatedAt`      | `YYYY-MM-DD`     | Shows an "Updated" date; does not replace `date`.                                                         |
| `dek`            | string           | Article-only subtitle/dek. Supports inline Markdown links.                                                |
| `draft`          | boolean          | `true` keeps the post in the repo but out of production output.                                           |
| `coverImage`     | string           | Path to a custom cover image (e.g. `/blog/<slug>/cover.png`).                                             |
| `coverAlt`       | string           | **Required when `coverImage` is set.** Alt text for the cover.                                            |
| `releasePackage` | string           | Package label on the generated release cover (default `@astryxdesign/core`). Only used for release posts. |
| `relatedDocs`    | `{title,href}[]` | Curated related-doc links rendered near the end of the article.                                           |

Required frontmatter is validated at build time (`pnpm generate`) and in tests.
A missing or malformed field fails the build with a clear, slug-prefixed error.

### Post types

| Type          | Use for                                                       |
| ------------- | ------------------------------------------------------------- |
| `update`      | Functionality improvements, releases, new capabilities.       |
| `guide`       | Practical, educational posts.                                 |
| `design`      | Visual and design-craft posts: composition, color, motion.    |
| `story`       | User stories, community examples, adoption stories.           |
| `perspective` | Design-system philosophy, industry observations, opinions.    |
| `engineering` | Implementation details, infrastructure, technical deep dives. |

Each post has exactly one `type`. Type filters only appear on the index when
more than one type has published content.

## 3. Add yourself to the author registry (once)

Authors are referenced by key so profile metadata lives in one place:

```
apps/docsite/src/content/blog/authors.ts
```

```ts
export const authors = {
  'your-handle': {
    name: 'Your Name',
    github: 'your-handle', // avatar + profile link are derived from GitHub
    role: 'Design', // optional
  },
} as const satisfies Record<string, AuthorProfile>;
```

For GitHub-backed authors, the avatar and profile link default to
`https://github.com/<handle>.png` and `https://github.com/<handle>` — no
build-time profile fetching. Then reference the key from your post:

```yaml
authors:
  - 'your-handle'
```

## 4. Cover images

A custom cover is optional. If you omit `coverImage`, the site renders a calm,
deterministic default cover derived from the post `type` and `slug` — so every
post has visual presence without bespoke artwork.

To use a custom cover, put the image under `public/blog/<slug>/` and reference
it with alt text:

```yaml
coverImage: '/blog/<slug>/cover.png'
coverAlt: 'Short description of the image'
```

**Release posts** get their cover automatically: when a post title carries a
version (e.g. "Astryx v0.1.3: …"), the version is rendered on a solid
Astryx-blue field with the Astryx mark as the separator between segments and
the package name beneath. Set `releasePackage` to change the package label
(defaults to `@astryxdesign/core`); set an explicit `coverImage` to opt out.

## 5. Images in the post body

Reference images in the body with normal Markdown, from `public/blog/<slug>/`:

```md
![Descriptive alt text](/blog/<slug>/my-screenshot.png)
```

Always write meaningful alt text — it's read by screen readers and shown if the
image fails to load. Body images are rendered with a subtle frame so screenshots
read intentionally on either background.

### Light / dark variants

A body image can automatically swap in dark mode. Drop a second file next to it
named `<name>.dark.<ext>` and it's used when the site is in dark mode — no
frontmatter, no markup change. You still reference only the light file:

```
public/blog/<slug>/pipeline.png        ← shown in light mode
public/blog/<slug>/pipeline.dark.png   ← shown in dark mode (optional)
```

```md
![The build pipeline](/blog/<slug>/pipeline.png)
```

How it works: `scripts/generate-data.mjs` scans `public/blog/**` at build time
and records every `*.dark.*` file in a `blogDarkImages` manifest. The blog
renderer checks that manifest for a `<name>.dark.<ext>` sibling of each image,
so the decision is made at build time — no runtime request, no flash. If no
dark variant exists (the common case), the single image is used in both modes.
The swap follows the site's theme toggle, not just the OS preference.

### Retina screenshots (`@2x`)

A screenshot taken on a 2× display has twice as many pixels as the component
is wide on screen, so by default it renders at double size, capped only by the
column. Name the file with an `@2x` suffix and it renders at half its pixel
width — the component's real size — with `height: auto` and still capped at
the column width:

```
public/blog/<slug>/swipe@2x.webp        ← 780 px wide file → 390 CSS px
public/blog/<slug>/swipe@2x.dark.webp   ← dark variant, same width (optional)
```

```md
![Swiping an item reveals its actions](/blog/<slug>/swipe@2x.webp)
```

How it works: the same build-time scan records the natural size of every
`@2x` image (PNG, JPEG, or WebP — including an animated WebP's canvas) in a
`blogImageSizes` manifest, and the renderer sets the image's `width` to half
of it. The dark variant takes the light image's width, so the theme toggle
never shifts the layout. Images without the suffix are unchanged.

## 6. Preview locally

```bash
cd apps/docsite
pnpm dev            # runs `pnpm generate` first, then starts Next.js
```

Visit `/blog` and `/blog/<slug>`. Drafts (`draft: true`) render in dev but are
excluded from production builds.

## 7. Validate before you push

```bash
pnpm generate       # discovers + validates posts into src/generated/blogRegistry.ts
pnpm test           # runs blog discovery/validation tests
pnpm typecheck
```

That's it — no index pages to edit, no manual wiring. The post is discovered
automatically and sorted into place by date.

## How posts are reviewed

Blog posts are reviewed against the **[Blog Review
Rubric](https://github.com/meta/astryx/wiki/Blog-Review-Rubric#three-required-scored-criteria)**.
The rubric is type-aware (a changelog `update`, an `engineering` deep-dive, and a
`perspective` essay are judged by different profiles), gates on accuracy
(verifiable claims — commands, APIs, numbers — are checked against the codebase,
and a confirmed error blocks publish), and checks substance, efficiency, craft,
and voice **without homogenizing your voice**. Reading it before you write is
the fastest way to land an A.
