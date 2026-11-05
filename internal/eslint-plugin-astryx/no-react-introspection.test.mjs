// Copyright (c) Meta Platforms, Inc. and affiliates.

import {RuleTester} from 'eslint';
import noReactIntrospectionRule from './no-react-introspection.js';

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {ecmaFeatures: {jsx: true}},
  },
});

tester.run('no-react-introspection', noReactIntrospectionRule, {
  valid: [
    // Data-driven API
    {code: `function Tabs({ items }) { return items.map(item => item); }`},
    // Pass-through children
    {code: `function TabList({ children }) { return children; }`},
    // Normal .type access on data objects
    {code: `const x = option.type === 'divider';`},
    // Normal .props on data objects
    {code: `const x = config.props.label;`},
    // isValidElement is allowed — it's a type guard, not introspection
    {code: `import { isValidElement } from 'react'; if (isValidElement(x)) {}`},
    {code: `if (React.isValidElement(x)) {}`},
    // allowFiles escape hatch
    {
      code: `import { Children } from 'react'; Children.map(children, c => c);`,
      options: [{allowFiles: ['test-utils']}],
      filename: '/packages/test-utils/src/helpers.tsx',
    },
    // allowFiles escape hatch on Windows, where ESLint reports filename with
    // backslash separators against a forward-slash pattern.
    {
      code: `import { Children } from 'react'; Children.map(children, c => c);`,
      options: [{allowFiles: ['test-utils']}],
      filename: 'D:\\repo\\packages\\test-utils\\src\\helpers.tsx',
    },
  ],
  invalid: [
    // Children.toArray
    {
      code: `import { Children } from 'react'; const items = Children.toArray(children);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // Children.map
    {
      code: `import { Children } from 'react'; Children.map(children, c => c);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // Children.forEach
    {
      code: `import { Children } from 'react'; Children.forEach(children, c => c);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // Children.count
    {
      code: `import { Children } from 'react'; const n = Children.count(children);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // React.Children.map
    {
      code: `React.Children.map(children, c => c);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // React.Children.forEach
    {
      code: `React.Children.forEach(children, c => c);`,
      errors: [{messageId: 'childrenMethod'}],
    },
    // cloneElement
    {
      code: `import { cloneElement } from 'react'; cloneElement(x, { a: 1 });`,
      errors: [{messageId: 'cloneElement'}],
    },
    {
      code: `React.cloneElement(x, { a: 1 });`,
      errors: [{messageId: 'cloneElement'}],
    },
    // child.props access
    {
      code: `const val = child.props.isCurrent;`,
      errors: [{messageId: 'propAccess'}],
    },
    // child.type access
    {
      code: `if (child.type === Foo) {}`,
      errors: [{messageId: 'typeAccess'}],
    },
    // element.props access
    {
      code: `const val = element.props.name;`,
      errors: [{messageId: 'propAccess'}],
    },
  ],
});

console.log('All tests passed!');
