// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/responsive`: decide what each region does as
 * width changes.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'responsive',
  title: 'Responsive',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 50},
  category: 'guide',
  description:
    'Decide what each region does as width changes: divide, reveal, resize, or swap.',
  keywords: [
    'breakpoints',
    'useMediaQuery',
    'Dialog',
    'BottomSheet',
    'contract',
    'Grid',
    'columns',
    'minWidth',
  ],

  sections: [
    {
      id: 'breakpoints',
      title: 'Breakpoints',
      content: [
        {
          type: 'prose',
          text: 'Decide what each region does as width changes. Write the responsive contract down for every region before you call the layout done.',
        },
        {
          type: 'list',
          style: 'do',
          items: [
            'Write the contract down for every region before you call the layout done',
            'Decide per region whether it is revealed, resized, or swapped at each width',
            'Drop a region rather than let it compete for width it does not have',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Hold three regions at a width where none of them has usable space',
            'Shrink every region uniformly instead of swapping or dropping one',
            'Wire a breakpoint in CSS that the contract comment never mentions',
          ],
        },
      ],
    },
    {
      id: 'responsive-contract',
      title: 'Responsive contract',
      content: [
        {
          type: 'prose',
          text: 'Lock what each region does as width changes, and pair every line of the contract with the prop or hook that enforces it.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Divide: how many regions survive at each width',
            'Reveal: which regions earn their width only when there is room, and open on demand below that',
            'Resize: content flexes while fixed regions hold their budgets, and text stays capped by contentWidth so line length holds',
            'Swap: navigation becomes MobileNav at the AppShell mobileNav breakpoint; the side panel becomes a Dialog or BottomSheet, driven by useMediaQuery',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Contract wired to props',
          code: `// Recommended thresholds: 3 regions above 1024, 2 from 768,
// 1 below. Text reads best at 40–60 characters per line.
//   >1024  SideNav 256 | content | side panel 380
//   <=1024 panel moves to a Dialog     (useMediaQuery)
//   <=768  nav collapses to MobileNav   (mobileNav "md")
const isNarrow = useMediaQuery('(max-width: 1024px)');

<AppShell sideNav={<SideNav />} mobileNav={{breakpoint: 'md'}}>
  <Layout
    content={<LayoutContent>{/* rows */}</LayoutContent>}
    end={isNarrow ? undefined : <LayoutPanel width={380} hasDivider />}
  />
</AppShell>`,
        },
        {
          type: 'prose',
          text: 'Verify: every contract line names a mechanism, so the comment cannot drift from the behavior.',
        },
      ],
    },
    {
      id: 'columns-that-reflow',
      title: 'Columns that reflow',
      content: [
        {
          type: 'prose',
          text: 'For columns that reflow on small screens, use `Grid columns={{minWidth, max}}`. A numeric `columns` is exactly N columns at every width and never reflows: `columns={4}` on a 390px phone renders four tracks under 100px wide, and the row overflows the page as soon as their content cannot shrink to fit. `{minWidth: 240, max: 4}` renders at most four columns, each at least 240px, and drops to one full-width column when the container is narrow; `max` is what lets that last column shrink to the container, and `gap` counts toward the room the columns need.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Reflowing stat row versus a fixed week row',
          code: `// Reflows: 4 columns on desktop, 3 in a 768px-wide grid, 1 on a phone.
<Grid columns={{minWidth: 240, max: 4}} gap={3}>
  {stats.map(stat => <StatCard key={stat.id} {...stat} />)}
</Grid>

// Fixed: exactly 7 columns at every width (a number never reflows).
<Grid columns={7} gap={1}>
  {days.map(day => <DayCell key={day} day={day} />)}
</Grid>`,
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`{minWidth}` alone: as many columns as fit at the floor, no cap; a container narrower than `minWidth` overflows, so add `max` for anything that reaches a phone',
            "`{minWidth, repeat: 'fit'}`: empty tracks collapse so present items stretch",
            "A numeric `GridSpan` wider than the grid's current columns adds implicit columns to the whole grid; items placed before and after the span flow into them, and `columns='full'` then covers only the explicit columns. In a reflowing grid keep spans within the smallest count it can reach, or use `'full'`, which adds none",
            'Styling that changes the room columns have to fit changes the count a reflowing shape reaches: a `columnGap` or `gap` step, inline padding on the grid, or `grid-auto-flow: column` through `xstyle`, which places items into extra implicit columns. A `className` rule replaces the computed track list only when it wins the cascade against the generated styles; prefer `xstyle` for overrides',
          ],
        },
      ],
    },
  ],
};
