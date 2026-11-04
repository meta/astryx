// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearchTokenNaming.test.tsx
 * @input Uses vitest, @testing-library/react and PowerSearch
 * @output Tests that a popover filter token's action is named by all its
 *   visible text, says it opens a dialog and whether it is open, that the
 *   editor is a dialog of that name, and that its remove button is named by
 *   the remove word and that text in each locale's word order
 * @position Core testing; validates token naming in PowerSearch.tsx and the
 *   ARIA routing in Token.tsx
 */

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';
import {InternationalizationProvider} from '../i18n/InternationalizationProvider';
import {PowerSearch} from './PowerSearch';
import type {
  PowerSearchConfig,
  PowerSearchFilter,
  PowerSearchTokenProps,
} from './types';

const config: PowerSearchConfig = {
  name: 'Issues',
  fields: [
    {
      key: 'status',
      label: 'Status',
      defaultOperator: 'is',
      operators: [
        {
          key: 'is',
          label: 'is',
          value: {
            type: 'enum',
            values: [
              {value: 'open', label: 'Open'},
              {value: 'closed', label: 'Closed'},
            ],
          },
        },
      ],
    },
  ],
};

const openFilter: PowerSearchFilter = {
  field: 'status',
  operator: 'is',
  value: {type: 'enum', value: 'open'},
};

describe('a PowerSearch filter token', () => {
  it('is named by its field, operator and value', () => {
    render(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Status: is Open'}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Remove Status: is Open'}),
    ).toBeInTheDocument();
  });

  it('says it opens a dialog, and whether that dialog is open', async () => {
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={() => {}}
      />,
    );
    const token = screen.getByRole('button', {name: 'Status: is Open'});
    expect(token).toHaveAttribute('aria-haspopup', 'dialog');
    expect(token).toHaveAttribute('aria-expanded', 'false');

    await user.click(token);

    expect(token).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByRole('dialog', {
        name: 'Status: is Open',
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it('names the remove button and the editor by the text the token shows', async () => {
    const user = userEvent.setup();
    const sizeConfig: PowerSearchConfig = {
      name: 'Files',
      fields: [
        {
          key: 'lines',
          label: 'Line count',
          defaultOperator: 'gt',
          operators: [
            {
              key: 'gt',
              label: 'is greater than',
              value: {type: 'integer', units: 'lines'},
            },
          ],
        },
      ],
    };
    render(
      <PowerSearch
        config={sizeConfig}
        filters={[
          {
            field: 'lines',
            operator: 'gt',
            value: {type: 'integer', value: 100},
          },
        ]}
        onChange={() => {}}
      />,
    );
    const token = screen.getByRole('button', {
      name: 'Line count: is greater than 100',
    });
    expect(
      screen.getByRole('button', {
        name: 'Remove Line count: is greater than 100',
      }),
    ).toBeInTheDocument();

    await user.click(token);

    expect(
      await screen.findByRole('dialog', {
        name: 'Line count: is greater than 100',
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it('opens a named dialog for a token whose operator the config lacks', async () => {
    const user = userEvent.setup();
    render(
      <PowerSearch
        config={config}
        filters={[{...openFilter, operator: 'was'}]}
        onChange={() => {}}
      />,
    );

    const token = screen
      .getAllByRole('button', {name: /^Status/})
      .find(button => button.getAttribute('aria-haspopup') === 'dialog');
    expect(token).toBeDefined();
    await user.click(token!);

    const dialog = await screen.findByRole('dialog', {hidden: true});
    expect(dialog).toHaveAccessibleName(
      token!.getAttribute('aria-label') ?? '',
    );
  });

  it('keeps the plain popover for a token from a components override', async () => {
    const user = userEvent.setup();
    function CustomToken({onClick}: PowerSearchTokenProps) {
      return (
        <button type="button" onClick={onClick}>
          Custom status
        </button>
      );
    }
    render(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={() => {}}
        components={{enum: {Token: CustomToken}}}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Custom status'}));

    expect(
      await screen.findByRole('button', {name: 'Apply', hidden: true}),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', {hidden: true})).toBeNull();
  });

  it('offers no editor on a token whose press commits it', () => {
    const emptyConfig: PowerSearchConfig = {
      name: 'Messages',
      fields: [
        {
          key: 'unread',
          label: 'Unread',
          defaultOperator: 'only',
          operators: [{key: 'only', label: 'only', value: {type: 'empty'}}],
        },
      ],
    };
    render(
      <PowerSearch
        config={emptyConfig}
        filters={[{field: 'unread', operator: 'only', value: {type: 'empty'}}]}
        onChange={() => {}}
      />,
    );

    const token = screen
      .getAllByRole('button', {name: /Unread/})
      .find(button => !button.textContent?.startsWith('Remove'));
    expect(token).toBeDefined();
    expect(token).not.toHaveAttribute('aria-haspopup');
    expect(token).not.toHaveAttribute('aria-expanded');
  });

  it('offers no editor on a read-only token', () => {
    render(
      <PowerSearch
        config={config}
        filters={[openFilter]}
        onChange={() => {}}
        isReadOnly
      />,
    );
    expect(document.querySelector('[aria-haspopup]')).toBeNull();
  });

  it('keeps a verb-last locale order in the remove button name', () => {
    render(
      <InternationalizationProvider
        locale="de"
        messages={{
          de: {'@astryx.token.remove': {defaultMessage: '{label} entfernen'}},
        }}>
        <PowerSearch
          config={config}
          filters={[openFilter]}
          onChange={() => {}}
        />
      </InternationalizationProvider>,
    );
    expect(
      screen.getByRole('button', {name: /^Status: .* Open entfernen$/}),
    ).toBeInTheDocument();
  });
});
