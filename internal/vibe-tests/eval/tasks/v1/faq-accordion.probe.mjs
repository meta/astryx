// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: four FAQ buttons with aria-expanded, at most one answer open
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {eventually, one} from '../../lib/probe-kit.mjs';

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
  // An animated accordion can keep a closed answer mounted and clipped to no height,
  // so an answer counts as shown only when a person can see it.
  const perceivable = index =>
    answer(index).evaluateAll(elements =>
      elements.some(element => {
        if (!element.checkVisibility({opacityProperty: true, visibilityProperty: true})) return false;
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const clips = /hidden|clip|auto|scroll/.test(style.overflow + style.overflowY);
          const area = parent.getBoundingClientRect();
          if (clips && (area.height < 1 || area.width < 1)) return false;
        }
        return true;
      }),
    );
  const showsAnswer = index => eventually(() => perceivable(index), `answer "${FAQ[index][1]}" is not shown`);
  const hidesAnswer = index =>
    eventually(async () => !(await perceivable(index)), `answer "${FAQ[index][1]}" is still shown`);
  const expanded = async index => (await question(index).getAttribute('aria-expanded')) === 'true';
  const collapsed = async index => (await question(index).getAttribute('aria-expanded')) === 'false';
  return [
    ['four question buttons', async () => {
      for (let index = 0; index < FAQ.length; index++) await one(question(index), `"${FAQ[index][0]}" button`);
    }],
    ['all answers start hidden', async () => {
      for (let index = 0; index < FAQ.length; index++) {
        await eventually(() => collapsed(index), `"${FAQ[index][0]}" does not report aria-expanded="false"`);
        await hidesAnswer(index);
      }
    }],
    ['a question opens its answer', async () => {
      await question(0).click();
      await eventually(() => expanded(0), `"${FAQ[0][0]}" does not report aria-expanded="true"`);
      await showsAnswer(0);
    }],
    ['opening another closes the first', async () => {
      await question(2).click();
      await eventually(() => expanded(2), `"${FAQ[2][0]}" does not report aria-expanded="true"`);
      await showsAnswer(2);
      await eventually(() => collapsed(0), `"${FAQ[0][0]}" still reports aria-expanded="true"`);
      await hidesAnswer(0);
    }],
    ['the open question hides its answer again', async () => {
      await question(2).click();
      await eventually(() => collapsed(2), `"${FAQ[2][0]}" still reports aria-expanded="true"`);
      await hidesAnswer(2);
    }],
  ];
}
