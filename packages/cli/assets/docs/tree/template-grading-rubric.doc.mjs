// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/templates/template-grading-rubric`:
 * complete scoring rules for page and block template quality.
 */

/**
 * The single source of rubric version, grade bands, category ids, and weights.
 * The agent-grading guide and any grading tool import this constant; the
 * detailed scoring rules live in the sections below.
 */
export const TEMPLATE_RUBRIC = Object.freeze({
  version: '1.4',
  minimumScore: 75,
  minimumGrade: 'B',
  grades: Object.freeze([
    Object.freeze({
      grade: 'A',
      min: 90,
      max: 100,
      meaning: 'Exemplary. Copy-ready with no known quality problems.',
    }),
    Object.freeze({
      grade: 'B',
      min: 75,
      max: 89,
      meaning: 'Good. Minor issues may remain, but the template is usable.',
    }),
    Object.freeze({
      grade: 'C',
      min: 60,
      max: 74,
      meaning: 'Needs work before publication.',
    }),
    Object.freeze({
      grade: 'D',
      min: 40,
      max: 59,
      meaning: 'Poor. Significant rewrites are needed.',
    }),
    Object.freeze({
      grade: 'F',
      min: 0,
      max: 39,
      meaning: 'Failing. The template teaches or produces bad patterns.',
    }),
  ]),
  categories: Object.freeze([
    Object.freeze({
      id: 'component_purity',
      title: 'Astryx component purity',
      max: 30,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'icon_purity',
      title: 'Icon purity',
      max: 15,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'custom_css',
      title: 'Custom CSS',
      max: 15,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'layout_structure',
      title: 'Layout & structure',
      max: 15,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'doc_metadata',
      title: 'Doc metadata',
      max: 10,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'image_handling',
      title: 'Image handling',
      max: 5,
      guide: 'template-grading-rubric',
    }),
    Object.freeze({
      id: 'code_quality',
      title: 'Code quality',
      max: 10,
      guide: 'template-grading-rubric',
    }),
  ]),
});

const gradeRows = TEMPLATE_RUBRIC.grades.map(({grade, min, max, meaning}) => [
  grade,
  `${min}-${max}`,
  meaning,
]);

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'template-grading-rubric',
  placement: {
    parent: 'namespace:write-good-templates',
    slot: 'guides',
    order: 10,
  },
  title: 'Full grading rubric',
  category: 'guide',
  description:
    'Use a shared set of heuristics to score template quality consistently across Astryx usage, icons, CSS, layout, metadata, images, and code quality.',
  sections: [
    {
      id: 'understand-the-score',
      title: 'Understand the score',
      content: [
        {
          type: 'prose',
          text: 'Start with {@link generic:is-my-code-good}: it owns the shared Astryx quality criteria. This rubric adds template weights, counting rules, and template-only checks, and each category that scores a shared criterion names it.',
        },
        {
          type: 'prose',
          text: `Template rubric ${TEMPLATE_RUBRIC.version} scores seven categories for 100 points. Aim for 100; ${TEMPLATE_RUBRIC.minimumGrade} (${TEMPLATE_RUBRIC.minimumScore}) is the publication floor, not the target. Each category below lists its weight. Never award points for anything you did not inspect.`,
        },
        {
          type: 'table',
          headers: ['Grade', 'Score', 'Meaning'],
          rows: gradeRows,
        },
        {
          type: 'prose',
          text: 'Keep improving while a deduction has a reasonable fix. A score below 100 is fine only when the remaining tradeoff is intentional and recorded. A template is not ready if the copied file fails to build or a required asset is missing, whatever its score.',
        },
        {
          type: 'prose',
          text: `Version ${TEMPLATE_RUBRIC.version} counts public integration components as Astryx components and grades assets and imports after the copy. Record the version with every score so results stay comparable.`,
        },
      ],
    },
    {
      id: 'component-purity',
      title: 'Astryx component purity: 30 points',
      content: [
        {
          type: 'prose',
          text: 'This category scores the Astryx components criterion in {@link generic:is-my-code-good}. Count every JSX opening tag in the copied `.tsx` source. An Astryx element is a component imported from `@astryxdesign/core` or from a public component export of the integration package. A raw HTML element is any lowercase intrinsic JSX tag. Count occurrences, not only unique tag names.',
        },
        {
          type: 'prose',
          text: 'Do not count fragments or a PascalCase helper defined in the same file. Inspect that helper and count the raw HTML inside it. For each raw element, decide with that guide whether it is necessary because Astryx has no equivalent, or unnecessary because an Astryx component can replace it.',
        },
        {
          type: 'table',
          headers: ['Raw HTML elements', 'Points'],
          rows: [
            ['0', '30'],
            ['1-2, all necessary', '25'],
            ['1-2, any unnecessary', '20'],
            ['3-5', '15'],
            ['6-10', '8'],
            ['11-20', '4'],
            ['21 or more', '0'],
          ],
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Do not deduct for an `img` when no general Astryx image component fits and its source passes the Image handling category.',
            'Do not deduct for a `form` that wraps `FormLayout` to provide native submission semantics.',
            'Do not deduct for `input type="hidden"` when it carries native form state.',
          ],
        },
      ],
    },
    {
      id: 'icon-purity',
      title: 'Icon purity: 15 points',
      content: [
        {
          type: 'prose',
          text: 'This category scores the Icons criterion in {@link generic:is-my-code-good}. Count raw icon markup in the copied file. {@link generic:template-icons} shows how to render icons through Astryx instead.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Count every raw `svg`, `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, or `g` used as an icon.',
            'Count an inline SVG component defined in the template.',
            'Count an icon component rendered directly instead of through `Icon` or an Astryx icon prop.',
          ],
        },
        {
          type: 'table',
          headers: ['Raw SVG icon instances', 'Points'],
          rows: [
            ['0', '15'],
            ['1-2', '10'],
            ['3-5', '5'],
            ['6 or more', '0'],
          ],
        },
      ],
    },
    {
      id: 'custom-css',
      title: 'Custom CSS: 15 points',
      content: [
        {
          type: 'prose',
          text: 'This category scores the Styling criterion in {@link generic:is-my-code-good}. Count individual CSS properties inside `stylex.create` and inline `style` objects. Count each `className` and `stylex.props` use once. Do not count Astryx props such as `gap`, `padding`, `variant`, `size`, `color`, `level`, `columns`, `contentPadding`, or `height`.',
        },
        {
          type: 'table',
          headers: ['Custom style declarations', 'Points'],
          rows: [
            ['0', '15'],
            ['1-3, all justified because no Astryx alternative exists', '12'],
            ['1-3, any unjustified because an Astryx prop exists', '8'],
            ['4-10', '5'],
            ['11-20', '2'],
            ['21 or more', '0'],
          ],
        },
        {
          type: 'prose',
          text: 'This category scores styles authored in the copied source. A package stylesheet is graded through its effect on portability and the rendered app, not as a way to hide custom declarations from this count.',
        },
      ],
    },
    {
      id: 'layout-and-structure',
      title: 'Layout and structure: 15 points',
      content: [
        {type: 'heading', level: 3, text: 'Page templates'},
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Choose the page root with the Layout criterion in {@link generic:is-my-code-good}. In a template, only a category that starts with `Shell -` owns global chrome, so it uses `AppShell`; every other page template uses `Layout` or `Center`.',
            'Outside a `Shell -` template, leave global navigation to the host app. Put in-page navigation in a `LayoutPanel` and page headings in `LayoutHeader`.',
            'Use `Grid` with `columns={{minWidth: 280}}` for responsive collections. Do not fix the column count or rebuild the grid in raw CSS.',
            'Use `Center` for centered content instead of custom flexbox workarounds.',
            'Render one page from one source file. Links may be inert examples, but the template does not create nested routes or router integration.',
          ],
        },
        {
          type: 'table',
          headers: ['Page condition', 'Points'],
          rows: [
            [
              'Correct root, responsive grids, proper centering, and one page',
              '15',
            ],
            [
              'Valid root with a smaller issue such as fixed columns or multi-page behavior',
              '8',
            ],
            [
              'Wrong root for the category, a raw layout root, or no Astryx root',
              '0',
            ],
          ],
        },
        {type: 'heading', level: 3, text: 'Block templates'},
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Do not wrap a block in `AppShell`. A block renders inside a preview or page container.',
            'Keep the block focused on one pattern or component usage.',
            'Keep the composition substantial enough to teach the pattern and small enough to adapt. About 20-100 lines is the normal range.',
          ],
        },
        {
          type: 'table',
          headers: ['Block condition', 'Points'],
          rows: [
            [
              'No `AppShell`, one focused pattern, and a reasonable length',
              '15',
            ],
            ['A smaller focus or length issue', '10'],
            ['Wrapped in `AppShell` or deeply unfocused', '0'],
          ],
        },
      ],
    },
    {
      id: 'doc-metadata',
      title: 'Doc metadata: 10 points',
      content: [
        {
          type: 'prose',
          text: 'Score field accuracy for 6 points, the description for 3 points, and naming for 1 point. Read the source and doc together. A field that exists but disagrees with the source is not complete.',
        },
        {type: 'heading', level: 3, text: 'Fields: 6 points'},
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Page: `type`, `name`, `displayName`, `description`, explicit `isReady`, and a specific `category` when the page is meant for browsing.',
            'Block: `type`, `name`, `displayName`, `description`, explicit `isReady`, positive `aspectRatio`, and complete `componentsUsed`.',
            'Relationship and preview fields follow {@link generic:block-template}. A value that contradicts that guide is an inaccuracy.',
          ],
        },
        {
          type: 'table',
          headers: ['Field condition', 'Points'],
          rows: [
            ['All applicable fields are present and accurate', '6'],
            ['All fields are present with one inaccuracy', '4'],
            ['One required field is missing', '2'],
            ['Two or more required fields are missing, or no doc exists', '0'],
          ],
        },
        {type: 'heading', level: 3, text: 'Description: 3 points'},
        {
          type: 'prose',
          text: 'A strong description covers four slots: the archetype, the job someone does, the structural or behavioral differentiator, and the alternate words people may search. Use at least six distinct content words after removing generic words such as page, screen, app, view, and component names. Describe the reusable shape, not only the sample data.',
        },
        {
          type: 'table',
          headers: ['Description condition', 'Points'],
          rows: [
            [
              'All four slots, 6 or more distinct content words, and clear separation from sibling templates',
              '3',
            ],
            [
              'Names and differentiates the pattern but misses one slot or leaves a synonym implicit',
              '2',
            ],
            [
              'Generic, repeats component names, or describes only the sample data',
              '1',
            ],
            ['Missing or restates the name', '0'],
          ],
        },
        {type: 'heading', level: 3, text: 'Naming: 1 point'},
        {
          type: 'prose',
          text: 'The id follows {@link generic:start-a-template}, `displayName` is readable, and a browsable page has a specific category ({@link generic:page-template}). Slug length is guidance, not a scored condition.',
        },
        {
          type: 'table',
          headers: ['Naming condition', 'Points'],
          rows: [
            [
              'Id, display name, and applicable category follow the convention',
              '1',
            ],
            ['Any naming or category requirement is missed', '0'],
          ],
        },
      ],
    },
    {
      id: 'image-handling',
      title: 'Image handling: 5 points',
      content: [
        {
          type: 'prose',
          text: 'This category scores the Images and assets criterion in {@link generic:is-my-code-good}. Inspect every image reference in the copied file against {@link generic:template-images-media}.',
        },
        {
          type: 'table',
          headers: ['Image condition', 'Points'],
          rows: [
            [
              'No image is needed, or every image still works after copy and the demo-placeholder behavior is intentional',
              '5',
            ],
            [
              'One optional demo image is missing in preview, or a placeholder service remains',
              '2',
            ],
            [
              'An essential image breaks after copy, uses a package-relative path, or depends on an inaccessible URL',
              '0',
            ],
          ],
        },
      ],
    },
    {
      id: 'code-quality',
      title: 'Code quality: 10 points',
      content: [
        {
          type: 'prose',
          text: 'This category scores the Code health criterion in {@link generic:is-my-code-good}, plus conditions only a template has. Award 2 points for each condition. Grade the copied file, not only the package source.',
        },
        {
          type: 'table',
          headers: ['Condition', 'Points', 'How to verify'],
          rows: [
            [
              'Correct client boundary',
              '2',
              '`use client` is the first executable statement when hooks, event handlers, or browser APIs require it. A static template does not add it without need.',
            ],
            [
              'Default export',
              '2',
              'The copied file has one default-exported React component.',
            ],
            [
              'Self-contained imports',
              '2',
              'Every import resolves from the copied location through React, a public Astryx path, a public integration-package export, or an app dependency the template explicitly requires.',
            ],
            [
              'Realistic example data',
              '2',
              'Content has realistic names, amounts, dates, lengths, and states instead of lorem ipsum or numbered placeholders.',
            ],
            [
              'No dead code',
              '2',
              'There are no unused imports or variables, commented-out blocks, or helpers that are never called.',
            ],
          ],
        },
      ],
    },
  ],
};
