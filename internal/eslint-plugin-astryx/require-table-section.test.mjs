// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file require-table-section.test.mjs
 * @description Tests for the require-table-section ESLint rule, plus the
 * #5277 regression it was written for (the `table-grouped` page template
 * emitted `<table><tr>` because its rows had no `<TableBody>` around them).
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import requireTableSectionRule from './require-table-section.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
    },
  },
});

// RuleTester registers its own describe/it blocks internally, so it
// must run at the top level. Vitest 4 forbids calling suite functions
// (describe/it) from inside another it() callback.
ruleTester.run('require-table-section', requireTableSectionRule, {
  valid: [
    // The house pattern: rows live in a section component.
    {code: '<Table><TableBody><TableRow/></TableBody></Table>'},
    {code: '<Table><TableHeader><TableRow/></TableHeader></Table>'},
    {code: '<Table><TableFooter><TableRow/></TableFooter></Table>'},
    // Raw section elements are the same DOM node and equally valid.
    {code: '<Table><tbody><TableRow/></tbody></Table>'},
    {code: '<table><tbody><tr/></tbody></table>'},
    {code: '<table><thead><tr/></thead></table>'},
    // colgroup/caption are legal direct children of a table — untouched.
    {code: '<Table><colgroup><col/></colgroup><TableBody><TableRow/></TableBody></Table>'},
    {code: '<table><caption>Cap</caption><tbody><tr/></tbody></table>'},
    // Mapped rows inside a section: the .map()/fragment chain is transparent.
    {
      code: '<Table><TableBody>{rows.map(r => <TableRow key={r.id}/>)}</TableBody></Table>',
    },
    {
      code: '<Table><TableBody>{keys.map(k => (<React.Fragment key={k}><TableRow/></React.Fragment>))}</TableBody></Table>',
    },
    // Data-driven mode: Table supplies its own tbody, no children at all.
    {code: '<Table data={data} columns={columns}/>'},
    // A row whose enclosing element is some other component: we cannot know
    // what that renders, so the rule stays silent rather than guessing.
    {code: '<Wrapper><TableRow/></Wrapper>'},
    // A row hoisted out of the JSX: its lexical parent is a declarator, so
    // the rule cannot see where it lands. Silent, not a false positive.
    {code: 'const row = <TableRow/>; const t = <Table><TableBody>{row}</TableBody></Table>;'},
    // A row returned from a named helper — same reasoning.
    {code: 'function renderRow() { return <TableRow/>; }'},
    // A standalone row with no table around it at all (unit-test fixtures).
    {code: '<TableRow><TableCell>x</TableCell></TableRow>'},

    // A component we know nothing about, INSIDE a table: it may well render the
    // tbody itself, so guessing here would flag correct code.
    {code: '<Table><Wrapper><TableRow/></Wrapper></Table>'},
    // A row handed to Table as a prop — the prop's renderer decides where it lands.
    {code: '<Table rowSlot={<TableRow/>}><TableBody/></Table>'},
    {code: '<Table children={<TableRow/>}/>'},
    // BaseTable renders the same <table>; a section is still a section under it.
    {code: '<BaseTable><tbody><tr/></tbody></BaseTable>'},
    // Fragment shorthand inside a section stays valid.
    {
      code: '<Table><TableBody><>{list.map(r => <TableRow key={r}/>)}</></TableBody></Table>',
    },
    // Nested tables, both composed correctly.
    {
      code: '<Table><TableBody><TableRow><TableCell><Table><TableBody><TableRow/></TableBody></Table></TableCell></TableRow></TableBody></Table>',
    },

    // A row passed to a function as an ARGUMENT is data, not placement: the
    // callee decides where it ends up, and it is routinely somewhere valid.
    // Flagging these told authors to wrap code that was already correct.
    {code: '<Table>{wrapInBody(<TableRow/>)}</Table>'},
    {code: "<Table>{React.createElement('tbody', null, <TableRow/>)}</Table>"},
    {code: '<table>{createPortal(<tr/>, node)}</table>'},
    // Same for a callback handed to a helper: only an inline .map()/.flatMap()
    // splices its result straight into this JSX position.
    {code: '<Table>{withBody(() => <TableRow/>)}</Table>'},
    {
      code: '<Table columns={c}>{buildGroupedBodies(groups, g => <TableRow key={g.id}/>)}</Table>',
    },

    // Name matching is lexical — no import resolution, by design. An aliased
    // table or row is invisible, the same way a bare `Table` from any package
    // is treated as ours.
    {code: '<DataTable><TableRow/></DataTable>'},
    // Accepted limitations, pinned so a change of behaviour is deliberate:
    // a sequence expression and an awaited wrapper both break the walk.
    {code: '<Table>{(0, <TableRow/>)}</Table>'},
    {
      code: '<Table>{await Promise.all(rows.map(async r => <TableRow key={r.id}/>))}</Table>',
    },
    // Only the method form splices: a helper that happens to be named `map`
    // still places the row itself.
    {code: '<Table>{map(rows, r => <TableRow key={r.id}/>)}</Table>'},
    // The chain is followed up the object side, not out of a computed key.
    {code: '<Table>{arr[<TableRow/>]}</Table>'},
  ],
  invalid: [
    // The straightforward case.
    {
      code: '<Table><TableRow/></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // The #5277 shape: a colgroup, then rows mapped straight into the table.
    {
      code: '<Table columns={columns}><colgroup><col/></colgroup>{rows.map(r => <TableRow key={r.id}/>)}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // The #5277 shape in full: fragment + conditional + nested map, two rows.
    {
      code: `
        <Table columns={columns}>
          <colgroup><col/></colgroup>
          {groupKeys.map(key => {
            return (
              <React.Fragment key={key}>
                {groupBy !== 'none' && <TableRow role="button"/>}
                {isExpanded && tasks.map(task => (<TableRow key={task.id}/>))}
              </React.Fragment>
            );
          })}
        </Table>
      `,
      errors: [
        {messageId: 'rowOutsideSection'},
        {messageId: 'rowOutsideSection'},
      ],
    },
    // Raw <tr> under the Astryx <Table> is the same invalid DOM.
    {
      code: '<Table><tr><td>x</td></tr></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // ...and under a raw <table> too.
    {
      code: '<table><tr><td>x</td></tr></table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // A ternary branch is transparent: both arms are still direct children.
    {
      code: '<Table>{isEmpty ? <TableRow/> : <TableRow/>}</Table>',
      errors: [
        {messageId: 'rowOutsideSection'},
        {messageId: 'rowOutsideSection'},
      ],
    },
    // BaseTable renders the <table>; core's own tests compose it directly.
    {
      code: '<BaseTable><tr><td>x</td></tr></BaseTable>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // Fragment shorthand, single and nested.
    {
      code: '<Table><>{list.map(r => <TableRow key={r}/>)}</></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    {
      code: '<Table><><><TableRow/></></></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // An array literal spliced into the table.
    {
      code: '<Table>{[<TableRow key="a"/>]}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // ...and the same rows spread in. Flagging the literal row but not the
    // spread beside it would be a green lint over the same broken DOM.
    {
      code: '<Table>{...rows.map(r => <TableRow key={r.id}/>)}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // Nested tables: only the inner, section-less one is reported.
    {
      code: '<Table><TableBody><TableRow><TableCell><Table><TableRow/></Table></TableCell></TableRow></TableBody></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // A method chained after the map is the most idiomatic row-list shape there
    // is, and it must not hide the rows.
    {
      code: '<Table>{rows.map(r => <TableRow key={r.id}/>).filter(Boolean)}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // A return one statement deeper inside the map callback.
    {
      code: '<Table>{rows.map(r => { if (r.ok) { return <TableRow key={r.id}/>; } return null; })}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // Member-expression element names resolve on their last segment, so a
    // namespaced import is not a blind spot.
    {
      code: '<Astryx.Table><Astryx.TableRow/></Astryx.Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // ...and an aliased React import still reads as a fragment.
    {
      code: '<Table><Rx.Fragment><TableRow/></Rx.Fragment></Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    // Optional chaining and flatMap are the same splice.
    {
      code: '<Table>{rows?.map(r => <TableRow key={r.id}/>)}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
    {
      code: '<Table>{groups.flatMap(g => g.rows.map(r => <TableRow key={r.id}/>))}</Table>',
      errors: [{messageId: 'rowOutsideSection'}],
    },
  ],
});
