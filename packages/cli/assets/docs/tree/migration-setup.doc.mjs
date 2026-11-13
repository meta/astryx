// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs migration/migration-setup`: theme and CSS setup,
 * cascade layer safety, layer audit, and the foundation smoke test.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'migration-setup',
  title: 'Setup',
  placement: {parent: 'namespace:migration', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Install the theme, wire CSS layers, audit resets, and run the foundation smoke test before migrating any surface.',
  keywords: [
    'setup',
    'theme',
    'reset',
    'smoke test',
    'layer audit',
    'cascade layers',
    'Tailwind coexistence',
  ],

  sections: [
    {
      title: 'Overview',
      content: [
        {
          type: 'prose',
          text: 'Treat migration as a product-shell and workflow migration, not a global class replacement. Start by putting the app inside Theme and AppShell, then move one route or surface at a time to design system primitives while keeping existing data, routing, and business logic intact.',
        },
        {
          type: 'prose',
          text: 'Tailwind can coexist during migration. Use it for legacy wrappers and local layout while replacing interactive controls, navigation, command surfaces, forms, alerts, dialogs, and settings UI with components.',
        },
      ],
    },
    {
      title: 'Recommended Order',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Install the packages and run `{@command init}` for agent docs, then add the reset, `astryx.css`, and theme CSS imports (see Theme and CSS Setup below).',
            'Wrap the app root with Theme and choose the initial light, dark, or system mode behavior.',
            'Make Tailwind and design system CSS layer order explicit before replacing components.',
            'Render the foundation smoke test page and confirm primitives keep their padding before migrating any surface.',
            'Move the persistent frame first: AppShell, TopNav, SideNav, page content, and mobile navigation. See {@link generic:component-migration}.',
            'Replace shared primitives: Button, IconButton, TextInput, NumberInput, Switch, CheckboxInput, RadioList, Selector, TabList, Dialog, AlertDialog, Banner, Toast, Badge, Card, Table, and ListItem. See {@link generic:component-migration}.',
            'Replace global workflows: command palette, settings popover, theme toggle, search, filters, create flows, and destructive confirmation dialogs.',
            'Remove legacy Tailwind classes from each completed surface, keeping only token-backed layout utilities or local wrappers that still need to be migrated.',
            'Verify both light and dark modes, keyboard navigation, responsive layout, and empty/error/loading states before moving to the next route. See {@link generic:migration-verification}.',
          ],
        },
      ],
    },
    {
      title: 'CLI Workflow',
      content: [
        {
          type: 'prose',
          text: 'Use the CLI as the migration checklist. Read the docs for the pattern you are about to touch, inspect a matching template skeleton, then read the exact component docs before editing.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Migration-oriented CLI pass',
          code: `{@command docs migration}
{@command docs theme}
{@command docs styling}
{@command template --list --type block}
{@command template AppShellTopNavWithSideNav --skeleton}
{@command template PopoverSettingsPanel --skeleton}
{@command component AppShell}
{@command component SideNav}
{@command component TopNav}
{@command component CommandPalette}
{@command component Button}
{@command component TextInput}`,
        },
        {
          type: 'prose',
          text: 'For a shorter read to paste into an AI coding tool, see {@link generic:working-with-ai}. Use `--json` when building automated migration reports.',
        },
        {
          type: 'code',
          lang: 'bash',
          label: 'Short and JSON modes',
          code: `{@command docs migration --full --detail brief}
{@command component Button --json}`,
        },
      ],
    },
    {
      title: 'Theme and CSS Setup',
      content: [
        {
          type: 'prose',
          text: 'Mount Theme at the app root so every migrated component reads the same token set. Keep the mode in application state if users can switch between light and dark themes.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Root provider with explicit mode',
          code: `import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useState} from 'react';
import '@astryxdesign/theme-neutral/theme.css';

export function AppRoot({children}: {children: React.ReactNode}) {
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>('system');

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <SettingsContext.Provider value={{mode, setMode}}>
        {children}
      </SettingsContext.Provider>
    </Theme>
  );
}`,
        },
        {
          type: 'prose',
          text: 'When Tailwind remains in the app, declare layer order once in the global CSS file. Load the Astryx reset and theme CSS before Tailwind utilities so migrated components keep design system defaults while legacy utility classes still work. On Tailwind v4, use the imports and layer order in {@link generic:tailwind}.',
        },
        {
          type: 'prose',
          text: 'Import the global CSS file first in the root layout or app entry, before anything that imports Astryx or theme CSS, including the `astryx-themes` module and a root component like the `AppRoot` above. Why the order matters, and what to do when it cannot come first, is in {@link generic:tailwind}.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Root layout or app entry',
          code: `import './globals.css'; // first: declares the cascade-layer order

import {AppRoot} from './AppRoot';`,
        },
        {
          type: 'prose',
          text: 'On Tailwind v3 there is no preflight.css to import, so wrap the @tailwind base directive in a named layer instead. Keep utilities unlayered so existing app utility classes still win everywhere. Put the `@layer` order line in its own `layers.css` and import it first, before `globals.css`: Next.js (webpack or Turbopack) and other bundlers that hoist CSS imports move the imported files above an inline `@layer` line, so the order would arrive too late.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'layers.css (imported first)',
          code: `@layer reset, tw-preflight, astryx-base, astryx-theme;`,
        },
        {
          type: 'code',
          lang: 'css',
          label: 'globals.css (Tailwind v3 coexistence)',
          code: `@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-neutral/theme.css";

@layer tw-preflight {
  @tailwind base; /* layered: astryx-theme now wins over preflight */
}
@tailwind components;
@tailwind utilities; /* unlayered: legacy utility classes keep winning */`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Root layout or app entry (Tailwind v3)',
          code: `import './layers.css'; // first: declares the cascade-layer order
import './globals.css';

import {AppRoot} from './AppRoot';`,
        },
      ],
    },
    {
      id: 'cascade-layer-safety',
      title: 'Why resets break cascade layers',
      content: [
        {
          type: 'prose',
          text: 'In a stylesheet with no layers at all, a zero-specificity reset like `* { padding: 0 }` loses to any class selector, so most developers treat resets as harmless. Layers change the rules twice: unlayered styles beat every named layer, and a later layer beats an earlier one, both regardless of specificity. The same reset therefore wins against every component style either by staying unlayered or by landing in a layer declared after astryx-base. Same CSS, opposite outcome, and no error or warning when it happens.',
        },
        {
          type: 'prose',
          text: 'This is the most common way an adoption breaks, through one of two @import mechanisms. A top-level @import without the layer() keyword keeps the legacy reset unlayered, where it overrides every design system layer. And an @import nested inside a file that was itself imported into a layer inherits that surrounding layer, so a reset can silently land in a consumer layer above astryx-base. Either way the fix is the same: import the legacy reset into the lowest layer explicitly.',
        },
        {
          type: 'code',
          lang: 'css',
          label: 'Legacy reset, explicitly layered',
          code: `/* was: @import "./legacy-reset.css";  (unlayered: beats every layer) */
@import "./legacy-reset.css" layer(reset);`,
        },
        {
          type: 'prose',
          text: 'Before building screens, check every stylesheet against the cascade layer audit below.',
        },
      ],
    },
    {
      id: 'layer-audit',
      title: 'Cascade layer audit',
      content: [
        {
          type: 'prose',
          text: 'Audit the layers around the design system with this checklist before building screens.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Declare the canonical @layer order once, before any @import. With Next.js (webpack or Turbopack) and other bundlers that hoist CSS imports, the order declaration must live in its own CSS file imported first, such as layers.css, because the bundler hoists @import content above the inline CSS that follows it.',
            'Audit every pre-existing global or reset stylesheet and assign each one to a layer deliberately. Top-level imports without layer() stay unlayered and beat every layer; imports nested inside a layered file inherit that layer.',
            'Remove or demote the app legacy reset. The design system ships its own :where() reset in the lowest layer, so any app reset belongs in that same reset layer and never in a layer above astryx-base.',
            'Layer Tailwind preflight. On Tailwind v4, import preflight.css with layer(base). On Tailwind v3, wrap the @tailwind base directive in a named layer (see the snippet in Theme and CSS Setup). Unlayered preflight overrides theme CSS silently.',
            'Set moduleResolution to bundler or node16 and newer so subpath imports like @astryxdesign/core/reset.css resolve.',
            'Theme with defineTheme and the accent family API instead of hand-writing individual color tokens. Derived tokens like --color-on-accent are generated from the accent scale automatically; hand-writing only --color-accent leaves --color-on-accent at its stale white default with no contrast guarantee against the new accent.',
            'Run the foundation smoke test below and view a few components in both light and dark mode before migrating any route.',
          ],
        },
        {
          type: 'prose',
          text: 'One more mental model shift: a className or utility class you write on a component still reaches the DOM either way, but whether it overrides the component is a layer question, not a source order question. Keep app utilities in the utilities layer so they keep winning.',
        },
      ],
    },
    {
      title: 'Foundation Smoke Test',
      content: [
        {
          type: 'prose',
          text: 'A broken layer order fails silently and identically on every page, so catch it before feature work instead of after N migrated screens. Render one throwaway page with a few primitives as the first migration step.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Foundation check page',
          code: `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Table} from '@astryxdesign/core/Table';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

export default function FoundationCheck() {
  const [email, setEmail] = useState('');

  return (
    <div data-foundation-check>
      <VStack gap={4}>
        <Button label="Primary action" variant="primary" />
        <TextInput
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={setEmail}
        />
        <Card>One card with default padding</Card>
        <Table
          data={[{name: 'Foundation', status: 'ok'}]}
          columns={[
            {key: 'name', header: 'Name'},
            {key: 'status', header: 'Status'},
          ]}
        />
      </VStack>
    </div>
  );
}`,
        },
        {
          type: 'prose',
          text: 'If the button renders with visible padding, a filled primary background, and the input and card have borders and internal spacing, the foundation is sound. For an assertion that can run in any test runner or a dev-only effect, check that a primitive keeps non-zero padding:',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Foundation assertion',
          code: `const button = document.querySelector<HTMLButtonElement>(
  '[data-foundation-check] button',
);
if (!button) {
  throw new Error('Foundation check page did not render a button.');
}
if (getComputedStyle(button).paddingInline === '0px') {
  throw new Error(
    'Foundation broken: an unlayered reset or a later cascade layer is ' +
      'overriding component styles. Check that no app reset sits outside ' +
      'the reset layer.',
  );
}`,
        },
        {
          type: 'prose',
          text: 'When this fails, the fix is almost always in the layer order: find the stylesheet that zeroes padding, and move it into the reset layer or delete it.',
        },
      ],
    },
  ],
};
