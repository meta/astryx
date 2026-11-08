# @astryxdesign/theme-probe

**A test fixture, not a theme anyone should use.** Private; never published.

Real themes style what their designer cared about, so most of the themeable
surface is never exercised by any of them, and a newly added theming target
starts life unverified — nothing notices when it stops working, because nothing
was styling it.

This theme is **generated from the target enumeration**, so it styles every
declared target, variant and state. A target added tomorrow is covered the
moment its doc lands; nobody has to remember. That is what lets the visual gate
answer "does every documented theming target still reach the pixels?"

Every selector gets a distinct, deliberately garish colour derived from a hash
of its name — two sub-targets that are supposed to be different elements but
actually resolve to the same one show up as a single colour, which a uniform
hot-pink theme would hide.

```bash
pnpm visual:probe-theme          # regenerate
pnpm visual:probe-theme:check    # CI guard — fails when a target is uncovered
```

`src/probeTheme.ts` is generated. Do not edit it; change
`.github/scripts/visual-gate/lib/probe-theme.mjs` instead.
