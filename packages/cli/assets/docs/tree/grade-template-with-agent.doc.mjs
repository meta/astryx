// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/write-good-templates/grade-template-with-agent`:
 * give an agent the canonical rubric and require a reproducible template grade.
 */

import {TEMPLATE_RUBRIC} from './template-grading-rubric.doc.mjs';

const scorecardRows = TEMPLATE_RUBRIC.categories
  .map(({title, max}) => `| ${title} | X | ${max} | |`)
  .join('\n');

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'grade-template-with-agent',
  placement: {parent: 'namespace:write-good-templates', slot: 'guides', order: 20},
  title: 'Grade and improve with an agent',
  category: 'guide',
  description:
    'Give an agent the rubric and evidence it needs to find problems, produce a reproducible scorecard, and improve the template.',
  sections: [
    {
      id: 'give-the-agent-the-rubric',
      title: 'Give the agent the rubric',
      content: [
        {
          type: 'prose',
          text: `Grade one exact package revision against template rubric ${TEMPLATE_RUBRIC.version}. Give the agent the template id, the package name, and a clean app that can install the packed package, then use this prompt. Replace every angle-bracket value. The first pass is read-only so the original score and findings stay visible.`,
        },
        {
          type: 'code',
          lang: 'text',
          label: 'Agent grading prompt',
          code: `Grade integration template <id> from <package> at <revision>.

Before scoring:
1. Read \`astryx docs authoring/building-blocks/templates/write-good-templates --full\`.
2. Read \`astryx docs authoring/building-blocks/templates/write-good-templates/template-grading-rubric --full\` and every guide it links.
3. Inspect the template source, its matching .doc.mjs file, package.json exports and files, and astryx.integration.mjs.
4. Run \`astryx integration verify\` in the package.
5. Follow \`astryx docs authoring/building-blocks/templates/build-the-template/package-and-test/test-template-in-app --full\`: install the packed package in the clean app, copy the template, build the app, and render the behavior matrix.

Score all seven rubric categories. Cite file and line evidence for every deduction. Do not award points for a state you did not inspect. If browser or build evidence is unavailable, say so and mark the template not publishable.

Return the rubric version, package revision, numeric score, letter grade, category scorecard, publishable yes/no verdict, detailed findings, and the top three fixes. Treat 100 as the target. Name every remaining deduction and say whether it is an intentional tradeoff or still needs work. Do not edit files during this first pass.`,
        },
      ],
    },
    {
      id: 'require-a-scorecard',
      title: 'Require a scorecard',
      content: [
        {
          type: 'code',
          lang: 'markdown',
          code: `# Template grade: <id>

**Rubric:** ${TEMPLATE_RUBRIC.version}
**Package revision:** <revision>
**Type:** page | block
**Grade:** <letter> (<score>/100)
**Publishable:** yes | no

| Category | Points | Max | Evidence |
| --- | ---: | ---: | --- |
${scorecardRows}
| **Total** | **X** | **100** | |

## Detailed findings
- <file:line, rubric rule, observed problem, and deduction>

## Publication blockers
- <failed pack, copy, build, asset, browser, theme, responsive, or input check>

## Top three fixes
1. <highest-value fix>
2. <second fix>
3. <third fix>`,
        },
        {
          type: 'prose',
          text: `The category scores must add exactly to the total, and the grade comes from the published bands. The verdict is \`yes\` only when the score is ${TEMPLATE_RUBRIC.minimumScore} or higher and every package, copy, build, asset, and rendered-app check passes.`,
        },
      ],
    },
    {
      id: 'improve-and-regrade',
      title: 'Improve and regrade',
      content: [
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Fix publication blockers first.',
            'Fix every reasonable deduction without hiding it behind helper components or package CSS.',
            'Pack again, copy into a fresh app, and have the agent repeat the full grade. Keep the earlier scorecard so the improvement is visible.',
            'Stop only when no reasonable fix remains, and record every intentional tradeoff that still costs points.',
          ],
        },
      ],
    },
  ],
};
