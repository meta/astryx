// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: four FAQ buttons with aria-expanded, at most one answer open
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

const FAQ = [
  ['What is Orbit?', 'Orbit is a project tracker.'],
  ['Is there a free plan?', 'Yes, for up to three projects.'],
  ['Can I export my data?', 'Yes, as CSV or JSON.'],
  ['How do I contact support?', 'Email support@example.com.'],
];

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const question = index => page.getByRole('button', {name: FAQ[index][0], exact: true});
  const answer = index => page.getByText(FAQ[index][1], {exact: true});
  const expanded = async index => (await question(index).getAttribute('aria-expanded')) === 'true';
  const collapsed = async index => (await question(index).getAttribute('aria-expanded')) === 'false';
  return [
    ['four question buttons', async () => {
      for (let index = 0; index < FAQ.length; index++) await one(question(index), `"${FAQ[index][0]}" button`);
    }],
    ['all answers start hidden', async () => {
      for (let index = 0; index < FAQ.length; index++) {
        await eventually(() => collapsed(index), `"${FAQ[index][0]}" does not report aria-expanded="false"`);
        await hidden(answer(index), `answer "${FAQ[index][1]}"`);
      }
    }],
    ['a question opens its answer', async () => {
      await question(0).click();
      await eventually(() => expanded(0), `"${FAQ[0][0]}" does not report aria-expanded="true"`);
      await shown(answer(0), `answer "${FAQ[0][1]}"`);
    }],
    ['opening another closes the first', async () => {
      await question(2).click();
      await eventually(() => expanded(2), `"${FAQ[2][0]}" does not report aria-expanded="true"`);
      await shown(answer(2), `answer "${FAQ[2][1]}"`);
      await eventually(() => collapsed(0), `"${FAQ[0][0]}" still reports aria-expanded="true"`);
      await hidden(answer(0), `answer "${FAQ[0][1]}"`);
    }],
    ['the open question hides its answer again', async () => {
      await question(2).click();
      await eventually(() => collapsed(2), `"${FAQ[2][0]}" still reports aria-expanded="true"`);
      await hidden(answer(2), `answer "${FAQ[2][1]}"`);
    }],
  ];
}
