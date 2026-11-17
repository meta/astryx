// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs is-my-code-good`: one evidence-first guide for checking
 * whether a product surface uses Astryx well and improving it with an agent.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'is-my-code-good',
  title: 'Is my Astryx code good?',
  category: 'guide',
  keywords: [
    'is my code good',
    'review my code',
    'code review',
    'check my code',
    'evaluate my code',
    'review astryx code',
    'rubric',
    'astryx quality rubric',
    'custom code audit',
  ],
  description:
    'Check whether a product surface fits its app and uses Astryx well, require evidence for every claim, and improve it with a repeatable agent review.',
  sections: [
    {
      id: 'understand-the-app',
      title: 'Understand the app',
      content: [
        {
          type: 'prose',
          text: 'Do not judge a file or surface in isolation. First learn the app context that makes a pattern correct, inconsistent, or incomplete.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Name what the app is for, who uses it, and the task this surface helps them complete.',
            'Trace where the surface sits: its route, entry point, navigation path, parent shell, and the page or block pattern it is meant to use.',
            'Inspect sibling surfaces that do the same or adjacent jobs. Record their shared headers, actions, layout primitives, spacing, density, states, and narrow-screen behavior.',
            'Read project guidance, including the root and relevant nested `AGENTS.md` files. Record app-owned wrapper components and intentional app conventions.',
            'Record the installed `@astryxdesign/core`, `@astryxdesign/cli`, and integration-package versions from the project manifest and lockfile. Run the installed invocation of `{@command component --list}` to see core and integration components, then inspect app-owned wrappers that do not appear in that catalog.',
            'List the real data states, roles and permissions, supported locales and RTL behavior, and mobile or narrow-width needs that affect the task.',
          ],
        },
        {
          type: 'prose',
          text: 'Keep this context with the review. Mark anything you could not learn as `not inspected`. Do not flag a documented, intentional app convention merely because it differs from a generic pattern; cite the convention and verify that the user task and accessibility requirements still work.',
        },
      ],
    },
    {
      id: 'choose-the-review',
      title: 'Choose the review',
      content: [
        {
          type: 'prose',
          text: 'Review one exact revision and one named product surface, route, or component in its app context. Pick the smallest review that can answer your question.',
        },
        {
          type: 'table',
          headers: ['Review', 'Use it for', 'What it can prove'],
          rows: [
            [
              'Source check',
              'A fast check for raw elements, direct icons, custom styles, and unsupported imports',
              'Source findings plus app context visible in the project. It cannot call the rendered product good.',
            ],
            [
              'Full product review',
              'Calling a surface done',
              'App fit and task completion plus source quality, rendered layout, states, assets, project checks, and accessibility evidence.',
            ],
            [
              'Template publication grade',
              'An integration template that people copy',
              'The shared criteria plus versioned scoring, metadata, packaging, copy, and clean-app checks in {@link generic:grade-template-with-agent}.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'If all you have is one source file, run the source check anyway and use any project context that is available. Report clear source blockers; list missing app purpose, route, sibling patterns, shell, theme and density, installed components and versions, real states and roles, locale and mobile needs, revision, runnable app, rendered states, and project checks; and do not call the full product good.',
        },
        {
          type: 'prose',
          text: "`astryx` in this guide means the project's installed CLI invocation, such as its local binary or existing package script. If the project has no installed invocation, report that evidence gap instead of downloading a different CLI version for the review.",
        },
        {
          type: 'prose',
          text: 'A screenshot can prove a visible result, but it cannot prove which imports, components, or styles produced it. Source alone cannot prove responsive behavior, interaction, color modes, or whether an asset loads. Mark anything outside the supplied evidence as `not inspected`.',
        },
      ],
    },
    {
      id: 'apply-the-rubric',
      title: 'Apply the shared rubric',
      content: [
        {
          type: 'prose',
          text: 'Mark each category `good`, `needs work`, or `not inspected`. Cite the route, sibling surface, project guidance, theme, component catalog, or user requirement behind every context-dependent result; cite a file and line for every source result; and name the rendered state for every visual result. Never turn missing evidence into a pass. A blocker is a finding that prevents the surface from building, rendering, operating, letting the target user complete the task, or meeting an accessibility requirement. Other departures from the rubric are `needs work`.',
        },
        {
          type: 'table',
          headers: ['Category', 'What good means'],
          rows: [
            [
              'App fit and task completion',
              "The surface uses the app's established shell, page pattern, theme, density, wrappers, integrations, and interaction conventions unless a deviation is intentional and evidenced. The target user can complete the surface's job across the real states and permissions in scope.",
            ],
            [
              'Astryx components',
              'Astryx owns each visible or interactive pattern for which it has a suitable component. Raw elements remain only when their native semantics are necessary or Astryx has no equivalent.',
            ],
            [
              'Icons',
              'Icons render through `Icon`, `IconButton`, or the receiving component icon prop, not as raw SVG or a library component used directly.',
            ],
            [
              'Styling',
              'Component props and design tokens do the work before custom StyleX declarations, inline styles, or classes. Each custom rule has a reason because no supported Astryx surface fits.',
            ],
            [
              'Layout',
              'Astryx layout primitives express the visible structure, hierarchy, spacing, and responsive behavior without rebuilding the same patterns in raw containers or CSS.',
            ],
            [
              'Images and assets',
              'Every image, font, and other asset is intentional, accessible, stable, and working from the product build path.',
            ],
            [
              'Code health',
              'Public imports resolve, client boundaries are necessary, reachable states are handled, and no dead code or wrapper hides a finding.',
            ],
          ],
        },
        {
          type: 'prose',
          text: "Before calling a pattern custom or wrong, compare sibling surfaces and the installed component catalog. Reuse an app-owned wrapper or integration component when it already owns the job. A documented app convention is not a finding merely because it differs from a generic pattern; cite the convention and verify the user's task and accessibility requirements.",
        },
        {type: 'heading', level: 3, text: 'Common component replacements'},
        {
          type: 'table',
          headers: ['Raw pattern', 'Common Astryx owner'],
          rows: [
            [
              'Layout `div`',
              '`VStack`, `HStack`, `Grid`, `Card`, `Section`, or `Center`',
            ],
            ['`span`, `p`, or `h1` through `h6`', '`Text` or `Heading`'],
            ['`button` or linked action', '`Button`, `IconButton`, or `Link`'],
            ['In-page `nav` or `aside`', '`LayoutPanel`'],
            [
              '`header` or `main`',
              '`LayoutHeader` or `LayoutContent` inside `Layout`',
            ],
            ['`ul`, `ol`, or `li`', '`List` and `ListItem`'],
            [
              '`input`, `textarea`, or `select`',
              'The matching Astryx form control',
            ],
            ['`table`, `tr`, or `td`', '`Table`'],
            [
              '`hr`, `dialog`, `details`, or `summary`',
              '`Divider`, `Dialog`, or `Collapsible`',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Keep a native element when its semantics are necessary and Astryx has no equivalent. Common examples are a `form` that provides native submission, `input type="hidden"` for native form state, and an `img` when no general Astryx image component fits.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            "Compare the route with sibling surfaces that do the same job. Identify the app's shared header, actions, shell, page pattern, spacing, and density before judging the target.",
            'Inspect every JSX opening tag. Moving raw HTML behind a PascalCase helper does not make the underlying pattern an Astryx component.',
            'Count every raw SVG element used as an icon, including `svg`, `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, and `g`. For an inline SVG helper, count its raw SVG elements once in the helper definition, not again at each render. Count each icon-library component rendered directly outside an Astryx icon surface.',
            'Look up a possible replacement with `{@command component <Name> --dense}`. Do not invent a component or prop that the installed version does not provide.',
            'Run the installed `{@command component --list}` and inspect app-owned wrappers before rebuilding a pattern. Prefer the component the app or one of its installed integrations already uses for the job.',
            'Inspect every `stylex.create` declaration, inline style, `className`, and `stylex.props` use. Look for a component prop or token first.',
            "When replacing a literal spacing value, read `{@command docs spacing --full}` for the matching step or token and the target component doc for the prop's accepted scale. Do not guess a pixel-to-step mapping.",
            'Choose the root that matches the surface. Use `Layout` for a page, `Center` for centered content, and `AppShell` only when the surface owns global application chrome.',
            'Render realistic empty, loading, error, long-content, and interactive states. Check narrow and wide widths plus each supported color mode.',
            'Verify the target roles and permissions, supported locales and RTL behavior, and mobile needs. Follow the real task from entry to completion instead of judging only the static page.',
            'Run the product build, type check, tests, and accessibility checks. Keep a missing or failed check visible instead of calling the result good.',
          ],
        },
        {
          type: 'prose',
          text: 'This shared rubric has no numeric score. It answers whether ordinary product code uses Astryx well without pretending that an inapplicable template field or missing browser state earned points. Integration templates add a versioned score in {@link generic:template-grading-rubric}.',
        },
      ],
    },
    {
      id: 'collect-the-evidence',
      title: 'Collect the evidence',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Record the exact revision, named surface, route, and source files in scope. If the files are outside version control, record a content hash for each file and say that no project revision was available.',
            "Write down the app's purpose, target users, surface task, entry point, navigation path, parent shell, expected page pattern, and sibling surfaces used for comparison.",
            'Record project guidance, theme, density, installed Astryx and integration versions, the relevant output of `{@command component --list}`, and app-owned wrappers or conventions.',
            'List the states and context that matter, including real data shapes, roles and permissions, empty, loading, error, long content, interaction, narrow width, wide width, supported color modes, locales, and RTL behavior when they apply.',
            'Run the product and capture each named rendered state. Use screenshots or a live browser result for visible claims, and follow the target user task from entry to completion.',
            'Run the build, type check, tests, and accessibility checks. Keep their commands and results with the review.',
            'For each Astryx component whose replacement, prop, or composition is in question, read `{@command component <Name> --dense}`.',
          ],
        },
      ],
    },
    {
      id: 'ask-an-agent',
      title: 'Ask an agent',
      content: [
        {
          type: 'prose',
          text: 'Start with a read-only pass so the original findings stay visible. Replace every angle-bracket value in this prompt.',
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Agent evaluation prompt',
          code: `Evaluate how well <surface> at <revision> fits <app> and uses Astryx. Do not edit files during this first pass.

\`astryx\` below means the project's installed CLI invocation, such as its local binary or existing package script. If none is installed, report that evidence gap instead of downloading a different version.

Before evaluating:
1. Read \`astryx docs is-my-code-good --full\`.
2. Read the root and relevant nested \`AGENTS.md\` files plus other project guidance. State what the app is for, who uses it, and the task this surface supports.
3. Trace the surface's route, entry point, navigation path, parent shell, and expected page or block pattern.
4. Inspect at least two sibling surfaces that do the same or adjacent jobs. Record their shared headers, actions, layout, spacing, density, states, and narrow-screen behavior.
5. Record the app's theme, density, app-owned wrappers, and documented intentional conventions.
6. Read the project manifest and lockfile for the installed Astryx, CLI, and integration versions. Run \`astryx component --list\`, then identify relevant integration components and app-owned wrappers.
7. List the real data states, roles and permissions, supported locales and RTL behavior, and mobile or narrow-width needs.
8. Inspect every source file in scope and its public imports.
9. Run \`astryx component <Name> --dense\` for each Astryx component whose replacement, prop, or composition you question.
10. Read \`astryx docs spacing --full\` and the target component's docs before mapping a literal spacing value to a prop or token.
11. Render every supplied state at narrow and wide widths and in each supported color mode.
12. Read the build, type-check, test, and accessibility-check results.

If only source is supplied, continue with a source check. Report blockers visible in the source, list every missing app-context and product-evidence item, and do not call the full product good. Do not leave the blocker list empty only because no checks were supplied.

Judge the code against the app as well as Astryx. Ask whether it matches sibling surfaces, uses the right shell and page pattern, reuses app or integration components instead of rebuilding them, preserves intentional app conventions, and lets the target user complete the task.

For each rubric category, return \`good\`, \`needs work\`, or \`not inspected\`. Every context-dependent finding must cite the route, sibling file, project guidance, theme, component catalog, wrapper, or user requirement it relies on. Cite file and line evidence for source findings and name the rendered state for visual findings. Mark context you could not learn as \`not inspected\`. Do not flag a documented intentional app convention merely because it differs from a generic pattern. Never turn missing evidence into a pass. Do not hide raw HTML or custom styles behind a helper. Do not calculate a template score for ordinary product code.

Return:
- app purpose, target users, surface job, route, and entry path
- app context inspected and app context missing
- product evidence inspected and product evidence missing
- one row per rubric category with result, evidence, and fix
- task-completion, functional, or accessibility blockers visible in the source or found by the supplied checks
- the top three fixes in order
- every claim that still needs a person to verify`,
        },
      ],
    },
    {
      id: 'verify-and-repeat',
      title: 'Verify, improve, and repeat',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Reject a `good` result without app-context, source, and rendered evidence. Open every cited route, sibling file, guidance file, and source location, and reproduce every named visible state.',
            'Check that documented intentional app conventions were not flagged merely for differing from a generic pattern, and that context the reviewer could not learn stayed `not inspected`.',
            'Fix task-completion, build, functional, and accessibility blockers first.',
            'Reuse the app shell, page pattern, wrappers, and installed integration components before replacing unnecessary raw elements, direct icons, and custom styles.',
            'Follow the target user task again, render the full state set, and rerun the project checks.',
            'Repeat the read-only review on the new revision. Keep the first report so the improvement and every remaining tradeoff stay visible.',
          ],
        },
        {
          type: 'prose',
          text: 'For an integration template, finish with the scored package and copy workflow in {@link generic:grade-template-with-agent}. Ordinary product code stops with the evidence-backed category report and does not receive a template publication grade.',
        },
      ],
    },
  ],
};
