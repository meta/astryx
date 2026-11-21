// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {getInputARIA} from './inputAria';

describe('getInputARIA', () => {
  it('keeps standalone input labeling native while composing descriptions', () => {
    expect(
      getInputARIA('input-label', ['input-help', undefined, 'input-error']),
    ).toEqual({
      ariaLabelledBy: undefined,
      ariaDescribedBy: 'input-help input-error',
      isInvalid: false,
    });
  });

  it('composes InputGroup context before input labels and descriptions', () => {
    expect(
      getInputARIA('input-label', ['input-help'], {
        labelID: 'group-label',
        describedByIDs: 'group-help group-error',
      }),
    ).toEqual({
      ariaLabelledBy: 'group-label input-label',
      ariaDescribedBy: 'group-help group-error input-help',
      isInvalid: false,
    });
  });

  it('deduplicates repeated IDs', () => {
    expect(
      getInputARIA('group-label', ['shared', 'input-help'], {
        labelID: 'group-label',
        describedByIDs: 'shared group-error',
      }),
    ).toEqual({
      ariaLabelledBy: 'group-label',
      ariaDescribedBy: 'shared group-error input-help',
      isInvalid: false,
    });
  });

  it('marks a standalone input invalid from its own error status only', () => {
    expect(getInputARIA('input-label', [], null, 'error').isInvalid).toBe(true);
    expect(getInputARIA('input-label', [], null, 'warning').isInvalid).toBe(
      false,
    );
    expect(getInputARIA('input-label', [], null, 'success').isInvalid).toBe(
      false,
    );
    expect(getInputARIA('input-label', [], null).isInvalid).toBe(false);
  });

  it('marks a grouped input invalid from the group error status only', () => {
    expect(
      getInputARIA('input-label', [], {
        labelID: 'group-label',
        statusType: 'error',
      }).isInvalid,
    ).toBe(true);
    expect(
      getInputARIA('input-label', [], {
        labelID: 'group-label',
        statusType: 'warning',
      }).isInvalid,
    ).toBe(false);
    expect(
      getInputARIA('input-label', [], {
        labelID: 'group-label',
        statusType: 'success',
      }).isInvalid,
    ).toBe(false);
    expect(
      getInputARIA('input-label', [], {labelID: 'group-label'}).isInvalid,
    ).toBe(false);
  });

  it('marks a grouped input invalid when either the group or the input has an error', () => {
    expect(
      getInputARIA('input-label', [], {labelID: 'group-label'}, 'error')
        .isInvalid,
    ).toBe(true);
    expect(
      getInputARIA(
        'input-label',
        [],
        {
          labelID: 'group-label',
          statusType: 'error',
        },
        'warning',
      ).isInvalid,
    ).toBe(true);
  });
});
