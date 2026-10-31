# @astryxdesign/charts

Astryx charts — a config-model data visualization library built on d3.

```tsx
import {Chart, bar, line} from '@astryxdesign/charts';

<Chart data={data} xKey="month" series={[bar('revenue'), line('trend')]} />;
```

Marks are factory functions (`bar`, `line`, `area`, `dot`, `band`, `candlestick`,
`errorBar`, `referenceLine`, and WebGL variants) that return config objects passed
via the `series` prop. The chart root owns **one** x/y scale that every mark, axis,
and grid line reads, so they can never disagree. It consumes `@astryxdesign/core`
theme tokens directly (StyleX build mirrors `@astryxdesign/lab`).

It ships to npm **only under the `@canary` dist-tag** — there is never a stable
(`latest`) release yet.

> Note: this package is the successor to the experimental `Chart` (formerly
> `ChartV2`) that used to live in `@astryxdesign/lab`; that code has moved here and
> d3 is a direct dependency. (Supersedes the original "thin wrappers over a peer
> engine" framing of the bootstrap scaffold.)

## Status

Under active development. The config-model chart and its marks/chrome are in place;
API and visuals are still being refined. See [`docs/`](https://github.com/meta/astryx/tree/main/packages/charts/docs) for the plan, design research, readiness audit, and
verification checklist.

## Usage

Inside the monorepo (storybook/sandbox), imports resolve via pnpm workspaces:

```tsx
import {Chart, bar, line, ChartGrid, ChartAxis} from '@astryxdesign/charts';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/charts/charts.css';
```

### Trying charts in your own project (canary)

`@astryxdesign/charts` is published **only** under the `@canary` dist-tag, so you must request that tag explicitly. There is no `latest` version to install.

```bash
npm install @astryxdesign/charts@canary @astryxdesign/core@canary
```

> Canary builds track the latest commit on `main` (`0.x.y-canary.<sha>`). They can break between any two versions — pin an exact version if you need stability.

## Why no stable release?

`package.json` keeps `"private": true` plus an `"astryx": { "canaryOnly": true }` marker. The release workflow's stable (`latest`) job skips both private and `canaryOnly` packages, while the canary job strips `private` in its ephemeral CI checkout only (never in git) to publish the `@canary` tag. The committed `private: true` is npm's hard guarantee that no stable publish can ever happen — **do not remove it.**
