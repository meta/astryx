// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a three-step checkout that validates each step and keeps values
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const field = name => page.getByRole('textbox', {name: new RegExp(`^\\s*${name}`)});
  const button = name => page.getByRole('button', {name, exact: true});
  const stepLine = n => page.getByText(new RegExp(`Step\\s+${n}\\s+of\\s+3`));
  const heading = name => page.getByRole('heading', {name, exact: true});
  const invalid = async name => (await field(name).getAttribute('aria-invalid')) === 'true';
  return [
    ['step 1 shows its title, fields and no Back button', async () => {
      await shown(stepLine(1), '"Step 1 of 3"');
      await one(heading('Contact'), 'Contact heading');
      await one(field('Full name'), 'Full name field');
      await one(field('Email'), 'Email field');
      await hidden(button('Back'), 'Back button on step 1');
    }],
    ['Next with empty fields shows Required and stays', async () => {
      await button('Next').click();
      await eventually(async () => (await page.getByText('Required', {exact: true}).filter({visible: true}).count()) >= 2, 'expected two "Required" errors');
      await eventually(async () => (await invalid('Full name')) && (await invalid('Email')), 'empty fields are not marked aria-invalid="true"');
      await shown(stepLine(1), '"Step 1 of 3" after a blocked Next');
    }],
    ['filled step 1 moves to Shipping', async () => {
      await field('Full name').fill('Ada Lovelace');
      await field('Email').fill('ada@example.com');
      await button('Next').click();
      await shown(stepLine(2), '"Step 2 of 3"');
      await one(heading('Shipping'), 'Shipping heading');
      await one(field('Street'), 'Street field');
      await one(field('City'), 'City field');
    }],
    ['Back keeps what was typed', async () => {
      await field('Street').fill('12 Analytical Way');
      await button('Back').click();
      await shown(stepLine(1), '"Step 1 of 3" after Back');
      assert((await field('Full name').inputValue()) === 'Ada Lovelace', 'Full name was not kept');
      await button('Next').click();
      await shown(stepLine(2), '"Step 2 of 3" again');
      assert((await field('Street').inputValue()) === '12 Analytical Way', 'Street was not kept');
    }],
    ['review shows the values and places the order', async () => {
      await field('City').fill('London');
      await button('Next').click();
      await shown(stepLine(3), '"Step 3 of 3"');
      await one(heading('Review'), 'Review heading');
      for (const value of ['Ada Lovelace', 'ada@example.com', '12 Analytical Way', 'London']) {
        await shown(page.getByText(value), `"${value}" on the review step`);
      }
      await button('Place order').click();
      await one(heading('Order placed'), 'Order placed heading');
      await hidden(button('Place order'), 'Place order button');
    }],
  ];
}
