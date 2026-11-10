//! Type predicates mirroring ast-types' `namedTypes.X.check`.

pub fn is_comment(t: &str) -> bool {
    matches!(t, "CommentLine" | "CommentBlock" | "Line" | "Block")
}

pub fn is_statement(t: &str) -> bool {
    matches!(
        t,
        "ExpressionStatement"
            | "BlockStatement"
            | "EmptyStatement"
            | "DebuggerStatement"
            | "WithStatement"
            | "ReturnStatement"
            | "LabeledStatement"
            | "BreakStatement"
            | "ContinueStatement"
            | "IfStatement"
            | "SwitchStatement"
            | "ThrowStatement"
            | "TryStatement"
            | "WhileStatement"
            | "DoWhileStatement"
            | "ForStatement"
            | "ForInStatement"
            | "ForOfStatement"
            | "ForAwaitStatement"
            | "FunctionDeclaration"
            | "VariableDeclaration"
            | "ClassDeclaration"
            | "ImportDeclaration"
            | "ExportNamedDeclaration"
            | "ExportDefaultDeclaration"
            | "ExportAllDeclaration"
            | "ExportDeclaration"
            | "ClassMethod"
            | "ClassPrivateMethod"
            | "ClassProperty"
            | "ClassPrivateProperty"
            | "ClassAccessorProperty"
            | "MethodDefinition"
            | "ClassPropertyDefinition"
            | "TSDeclareMethod"
            | "TSDeclareFunction"
            | "TSTypeAliasDeclaration"
            | "TSInterfaceDeclaration"
            | "TSEnumDeclaration"
            | "TSModuleDeclaration"
            | "TSImportEqualsDeclaration"
            | "TSExportAssignment"
            | "TSNamespaceExportDeclaration"
            | "TSPropertySignature"
            | "TSMethodSignature"
            | "TSIndexSignature"
            | "TSCallSignatureDeclaration"
            | "TSConstructSignatureDeclaration"
            | "TSParameterProperty"
            | "StaticBlock"
            | "Noop"
            | "TSModuleBlock"
    )
}

pub fn is_expression(t: &str) -> bool {
    matches!(
        t,
        "Identifier"
            | "StringLiteral"
            | "NumericLiteral"
            | "BigIntLiteral"
            | "DecimalLiteral"
            | "NullLiteral"
            | "BooleanLiteral"
            | "RegExpLiteral"
            | "Literal"
            | "ThisExpression"
            | "ArrayExpression"
            | "ObjectExpression"
            | "RecordExpression"
            | "TupleExpression"
            | "FunctionExpression"
            | "ArrowFunctionExpression"
            | "SequenceExpression"
            | "UnaryExpression"
            | "BinaryExpression"
            | "AssignmentExpression"
            | "UpdateExpression"
            | "LogicalExpression"
            | "ConditionalExpression"
            | "NewExpression"
            | "CallExpression"
            | "OptionalCallExpression"
            | "MemberExpression"
            | "OptionalMemberExpression"
            | "YieldExpression"
            | "AwaitExpression"
            | "TemplateLiteral"
            | "TaggedTemplateExpression"
            | "ClassExpression"
            | "JSXElement"
            | "JSXFragment"
            | "JSXText"
            | "JSXIdentifier"
            | "JSXMemberExpression"
            | "JSXExpressionContainer"
            | "JSXEmptyExpression"
            | "MetaProperty"
            | "Super"
            | "Import"
            | "ImportExpression"
            | "TSAsExpression"
            | "TSSatisfiesExpression"
            | "TSNonNullExpression"
            | "TSTypeAssertion"
            | "TSInstantiationExpression"
            | "ParenthesizedExpression"
            | "DoExpression"
            | "BindExpression"
            | "ChainExpression"
            | "PrivateName"
            | "TypeCastExpression"
            | "ModuleExpression"
            | "TopicReference"
            | "V8IntrinsicIdentifier"
    )
}

pub fn is_literal(t: &str) -> bool {
    matches!(
        t,
        "Literal" | "StringLiteral" | "NumericLiteral" | "BigIntLiteral" | "NullLiteral" | "BooleanLiteral" | "RegExpLiteral" | "JSXText" | "DecimalLiteral"
    )
}

pub fn is_member(t: &str) -> bool {
    matches!(t, "MemberExpression" | "OptionalMemberExpression" | "JSXMemberExpression")
}

pub fn is_call(t: &str) -> bool {
    matches!(t, "CallExpression" | "OptionalCallExpression")
}

pub fn is_binary(t: &str) -> bool {
    matches!(t, "BinaryExpression" | "LogicalExpression")
}

pub fn is_function(t: &str) -> bool {
    matches!(
        t,
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "ObjectMethod" | "ClassMethod" | "ClassPrivateMethod" | "TSDeclareFunction" | "TSDeclareMethod"
    )
}
