//! Boa's implementation of ECMAScript's global `Function` object and Native Functions.
//!
//! Objects wrap `Function`s and expose them via call/construct slots.
//!
//! The `Function` object is used for matching text with a pattern.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-function-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function

use crate::{
    Context, JsArgs, JsExpect, JsResult, JsStr, JsString, JsValue, SpannedSourceText,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject, OrdinaryObject,
    },
    bytecompiler::FunctionCompiler,
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    environments::{EnvironmentStack, FunctionSlots, PrivateEnvironment, ThisBindingStatus},
    error::JsNativeError,
    js_error, js_string,
    native_function::NativeFunctionObject,
    object::{
        JsData, JsFunction, JsObject, PrivateElement, PrivateName,
        internal_methods::{
            CallValue, InternalMethodCallContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
            get_prototype_from_constructor,
        },
    },
    property::{Attribute, PropertyDescriptor, PropertyKey},
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::IntegerOrInfinity,
    vm::{ActiveRunnable, CallFrame, CallFrameFlags, CodeBlock},
};
use boa_ast::{
    Position, Span, Spanned, StatementList,
    function::{FormalParameterList, FunctionBody},
    operations::{
        ContainsSymbol, all_private_identifiers_valid, bound_names, contains,
        lexically_declared_names,
    },
    scope::BindingLocatorScope,
};
use boa_gc::{self, Finalize, Gc, Trace, custom_trace};
use boa_interner::Sym;
use boa_macros::js_str;
use boa_parser::{Parser, Source};
use thin_vec::ThinVec;

use super::Proxy;

pub(crate) mod arguments;
mod bound;

pub use bound::BoundFunction;

#[cfg(test)]
mod tests;

/// Represents the `[[ThisMode]]` internal slot of function objects.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ecmascript-function-objects
#[derive(Debug, Trace, Finalize, PartialEq, Eq, Clone)]
pub enum ThisMode {
    /// The `this` value refers to the `this` value of a lexically enclosing function.
    Lexical,

    /// The `this` value is used exactly as provided by an invocation of the function.
    Strict,

    /// The `this` value of `undefined` or `null` is interpreted as a reference to the global object,
    /// and any other `this` value is first passed to `ToObject`.
    Global,
}

impl ThisMode {
    /// Returns `true` if the this mode is `Lexical`.
    #[must_use]
    pub const fn is_lexical(&self) -> bool {
        matches!(self, Self::Lexical)
    }

    /// Returns `true` if the this mode is `Strict`.
    #[must_use]
    pub const fn is_strict(&self) -> bool {
        matches!(self, Self::Strict)
    }

    /// Returns `true` if the this mode is `Global`.
    #[must_use]
    pub const fn is_global(&self) -> bool {
        matches!(self, Self::Global)
    }
}

/// Represents the `[[ConstructorKind]]` internal slot of function objects.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ecmascript-function-objects
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConstructorKind {
    /// The class constructor is not derived.
    Base,

    /// The class constructor is a derived class constructor.
    Derived,
}

impl ConstructorKind {
    /// Returns `true` if the constructor kind is `Base`.
    #[must_use]
    pub const fn is_base(&self) -> bool {
        matches!(self, Self::Base)
    }

    /// Returns `true` if the constructor kind is `Derived`.
    #[must_use]
    pub const fn is_derived(&self) -> bool {
        matches!(self, Self::Derived)
    }
}

/// Record containing the field definition of classes.
///
/// More information:
///  - [ECMAScript specification][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-classfielddefinition-record-specification-type
#[derive(Clone, Debug, Finalize)]
pub enum ClassFieldDefinition {
    /// A class field definition with a `string` or `symbol` as a name.
    Public(PropertyKey, JsFunction, Option<PropertyKey>),

    /// A class field definition with a private name.
    Private(PrivateName, JsFunction),
}

unsafe impl Trace for ClassFieldDefinition {
    custom_trace! {this, mark, {
        match this {
            Self::Public(_key, func, _) => {
                mark(func);
            }
            Self::Private(_, func) => {
                mark(func);
            }
        }
    }}
}

/// Boa representation of a JavaScript Function Object.
///
/// `FunctionBody` is specific to this interpreter, it will either be Rust code or JavaScript code
/// (AST Node).
///
/// <https://tc39.es/ecma262/#sec-ecmascript-function-objects>
#[derive(Debug, Trace, Finalize)]
pub struct OrdinaryFunction {
    /// The code block containing the compiled function.
    pub(crate) code: Gc<CodeBlock>,

    /// The `[[Environment]]` internal slot.
    pub(crate) environments: EnvironmentStack,

    /// The `[[HomeObject]]` internal slot.
    pub(crate) home_object: Option<JsObject>,

    /// The `[[ScriptOrModule]]` internal slot.
    pub(crate) script_or_module: Option<ActiveRunnable>,

    /// The [`Realm`] the function is defined in.
    pub(crate) realm: Realm,

    /// The `[[Fields]]` internal slot.
    fields: ThinVec<ClassFieldDefinition>,

    /// The `[[PrivateMethods]]` internal slot.
    private_methods: ThinVec<(PrivateName, PrivateElement)>,
}

impl JsData for OrdinaryFunction {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static FUNCTION_METHODS: InternalObjectMethods = InternalObjectMethods {
            __call__: function_call,
            ..ORDINARY_INTERNAL_METHODS
        };

        static CONSTRUCTOR_METHODS: InternalObjectMethods = InternalObjectMethods {
            __call__: function_call,
            __construct__: function_construct,
            ..ORDINARY_INTERNAL_METHODS
        };

        if self.code.has_prototype_property() {
            &CONSTRUCTOR_METHODS
        } else {
            &FUNCTION_METHODS
        }
    }
}

impl OrdinaryFunction {
    pub(crate) fn new(
        code: Gc<CodeBlock>,
        environments: EnvironmentStack,
        script_or_module: Option<ActiveRunnable>,
        realm: Realm,
    ) -> Self {
        Self {
            code,
            environments,
            home_object: None,
            script_or_module,
            realm,
            fields: ThinVec::default(),
            private_methods: ThinVec::default(),
        }
    }

    /// Returns the codeblock of the function.
    #[must_use]
    pub fn codeblock(&self) -> &CodeBlock {
        &self.code
    }

    /// Push a private environment to the function.
    pub(crate) fn push_private_environment(&mut self, environment: Gc<PrivateEnvironment>) {
        self.environments.push_private(environment);
    }

    /// Returns true if the function object is a derived constructor.
    pub(crate) fn is_derived_constructor(&self) -> bool {
        self.code.is_derived_constructor()
    }

    /// Does this function have the `[[ClassFieldInitializerName]]` internal slot set to non-empty value.
    pub(crate) fn in_class_field_initializer(&self) -> bool {
        self.code.in_class_field_initializer()
    }

    /// Returns a reference to the function `[[HomeObject]]` slot if present.
    pub(crate) const fn get_home_object(&self) -> Option<&JsObject> {
        self.home_object.as_ref()
    }

    ///  Sets the `[[HomeObject]]` slot if present.
    pub(crate) fn set_home_object(&mut self, object: JsObject) {
        self.home_object = Some(object);
    }

    /// Returns the values of the `[[Fields]]` internal slot.
    pub(crate) fn get_fields(&self) -> &[ClassFieldDefinition] {
        &self.fields
    }

    /// Pushes a value to the `[[Fields]]` internal slot if present.
    pub(crate) fn push_field(
        &mut self,
        key: PropertyKey,
        value: JsFunction,
        function_name: Option<PropertyKey>,
    ) {
        self.fields
            .push(ClassFieldDefinition::Public(key, value, function_name));
    }

    /// Pushes a private value to the `[[Fields]]` internal slot if present.
    pub(crate) fn push_field_private(&mut self, name: PrivateName, value: JsFunction) {
        self.fields.push(ClassFieldDefinition::Private(name, value));
    }

    /// Returns the values of the `[[PrivateMethods]]` internal slot.
    pub(crate) fn get_private_methods(&self) -> &[(PrivateName, PrivateElement)] {
        &self.private_methods
    }

    /// Pushes a private method to the `[[PrivateMethods]]` internal slot if present.
    pub(crate) fn push_private_method(&mut self, name: PrivateName, method: PrivateElement) {
        self.private_methods.push((name, method));
    }

    /// Gets the `Realm` from where this function originates.
    #[must_use]
    pub const fn realm(&self) -> &Realm {
        &self.realm
    }

    /// Checks if this function is an ordinary function.
    pub(crate) fn is_ordinary(&self) -> bool {
        self.code.is_ordinary()
    }
}

/// The internal representation of a `Function` object.
#[derive(Debug, Clone, Copy)]
pub struct BuiltInFunctionObject;

impl IntrinsicObject for BuiltInFunctionObject {
    fn init(realm: &Realm) {
        let has_instance = BuiltInBuilder::callable(realm, Self::has_instance)
            .name(js_string!("[Symbol.hasInstance]"))
            .length(1)
            .build();

        let throw_type_error = realm.intrinsics().objects().throw_type_error();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .method(Self::apply, js_string!("apply"), 2)
            .method(Self::bind, js_string!("bind"), 1)
            .method(Self::call, js_string!("call"), 1)
            .method(Self::to_string, js_string!("toString"), 0)
            .property(JsSymbol::has_instance(), has_instance, Attribute::default())
            .accessor(
                js_string!("caller"),
                Some(throw_type_error.clone()),
                Some(throw_type_error.clone()),
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("arguments"),
                Some(throw_type_error.clone()),
                Some(throw_type_error),
                Attribute::CONFIGURABLE,
            )
            .build();

        let prototype = realm.intrinsics().constructors().function().prototype();

        BuiltInBuilder::callable_with_object(realm, prototype.clone(), Self::prototype)
            .name(js_string!())
            .length(0)
            .build();

        prototype.set_prototype(Some(realm.intrinsics().constructors().object().prototype()));
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for BuiltInFunctionObject {
    const NAME: JsString = StaticJsStrings::FUNCTION;
}

impl BuiltInConstructor for BuiltInFunctionObject {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 10;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 0;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::function;

    /// `Function ( p1, p2, … , pn, body )`
    ///
    /// The `apply()` method invokes self with the first argument as the `this` value
    /// and the rest of the arguments provided as an array (or an array-like object).
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function-p1-p2-pn-body
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/Function
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let active_function = context
            .active_function_object()
            .unwrap_or_else(|| context.intrinsics().constructors().function().constructor());
        Self::create_dynamic_function(active_function, new_target, args, false, false, context)
            .map(Into::into)
    }
}

impl BuiltInFunctionObject {
    /// `CreateDynamicFunction ( constructor, newTarget, kind, args )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createdynamicfunction
    pub(crate) fn create_dynamic_function(
        constructor: JsObject,
        new_target: &JsValue,
        args: &[JsValue],
        r#async: bool,
        generator: bool,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. If newTarget is undefined, set newTarget to constructor.
        let new_target = if new_target.is_undefined() {
            constructor.into()
        } else {
            new_target.clone()
        };

        let strict = context.is_strict();

        let default = if r#async && generator {
            // 5. Else,
            //     a. Assert: kind is async-generator.
            //     b. Let prefix be "async function*".
            //     c. Let exprSym be the grammar symbol AsyncGeneratorExpression.
            //     d. Let bodySym be the grammar symbol AsyncGeneratorBody.
            //     e. Let parameterSym be the grammar symbol FormalParameters[+Yield, +Await].
            //     f. Let fallbackProto be "%AsyncGeneratorFunction.prototype%".
            StandardConstructors::async_generator_function
        } else if r#async {
            // 4. Else if kind is async, then
            //     a. Let prefix be "async function".
            //     b. Let exprSym be the grammar symbol AsyncFunctionExpression.
            //     c. Let bodySym be the grammar symbol AsyncFunctionBody.
            //     d. Let parameterSym be the grammar symbol FormalParameters[~Yield, +Await].
            //     e. Let fallbackProto be "%AsyncFunction.prototype%".
            StandardConstructors::async_function
        } else if generator {
            // 3. Else if kind is generator, then
            //     a. Let prefix be "function*".
            //     b. Let exprSym be the grammar symbol GeneratorExpression.
            //     c. Let bodySym be the grammar symbol GeneratorBody.
            //     d. Let parameterSym be the grammar symbol FormalParameters[+Yield, ~Await].
            //     e. Let fallbackProto be "%GeneratorFunction.prototype%".
            StandardConstructors::generator_function
        } else {
            // 2. If kind is normal, then
            //     a. Let prefix be "function".
            //     b. Let exprSym be the grammar symbol FunctionExpression.
            //     c. Let bodySym be the grammar symbol FunctionBody[~Yield, ~Await].
            //     d. Let parameterSym be the grammar symbol FormalParameters[~Yield, ~Await].
            //     e. Let fallbackProto be "%Function.prototype%".
            StandardConstructors::function
        };

        // 22. Let proto be ? GetPrototypeFromConstructor(newTarget, fallbackProto).
        let prototype = get_prototype_from_constructor(&new_target, default, context)?;

        // 6. Let argCount be the number of elements in parameterArgs.
        let (body, param_list) = if let Some((body, params)) = args.split_last() {
            // 7. Let parameterStrings be a new empty List.
            let mut parameters = Vec::with_capacity(args.len());

            // 8. For each element arg of parameterArgs, do
            for param in params {
                // a. Append ? ToString(arg) to parameterStrings.
                parameters.push(param.to_string(context)?);
            }

            // 9. Let bodyString be ? ToString(bodyArg).
            let body = body.to_string(context)?;

            (body, parameters)
        } else {
            (js_string!(), Vec::new())
        };
        let current_realm = context.realm().clone();

        context.host_hooks().ensure_can_compile_strings(
            current_realm,
            &param_list,
            &body,
            false,
            context,
        )?;

        let parameters = if param_list.is_empty() {
            FormalParameterList::default()
        } else {
            // 12. Let P be the empty String.
            // 13. If argCount > 0, then
            //     a. Set P to parameterStrings[0].
            //     b. Let k be 1.
            //     c. Repeat, while k < argCount,
            //         i. Let nextArgString be parameterStrings[k].
            //         ii. Set P to the string-concatenation of P, "," (a comma), and nextArgString.
            //         iii. Set k to k + 1.

            // TODO: Replace with standard `Iterator::intersperse` iterator method when it's stabilized.
            //       See: <https://github.com/rust-lang/rust/issues/79524>
            let parameters = itertools::Itertools::intersperse(
                param_list.iter().map(JsString::iter),
                js_str!(",").iter(),
            )
            .flatten()
            .collect::<Vec<_>>();
            let mut parser = Parser::new(Source::from_utf16(&parameters));
            parser.set_identifier(context.next_parser_identifier());

            // 17. Let parameters be ParseText(StringToCodePoints(P), parameterSym).
            // 18. If parameters is a List of errors, throw a SyntaxError exception.
            let parameters = parser
                .parse_formal_parameters(context.interner_mut(), generator, r#async)
                .map_err(|e| {
                    JsNativeError::syntax()
                        .with_message(format!("failed to parse function parameters: {e}"))
                })?;

            // It is a Syntax Error if FormalParameters Contains YieldExpression is true.
            if generator && contains(&parameters, ContainsSymbol::YieldExpression) {
                return Err(JsNativeError::syntax().with_message(
                    if r#async {
                        "yield expression is not allowed in formal parameter list of async generator"
                    } else {
                        "yield expression is not allowed in formal parameter list of generator"
                    }
                ).into());
            }

            // It is a Syntax Error if FormalParameters Contains AwaitExpression is true.
            if r#async && contains(&parameters, ContainsSymbol::AwaitExpression) {
                return Err(JsNativeError::syntax()
                    .with_message(
                        if generator {
                            "await expression is not allowed in formal parameter list of async function"
                        } else {
                            "await expression is not allowed in formal parameter list of async generator"
                        })
                    .into());
            }

            parameters
        };

        let body = if body.is_empty() {
            FunctionBody::new(StatementList::default(), Span::new((1, 1), (1, 1)))
        } else {
            // 14. Let bodyParseString be the string-concatenation of 0x000A (LINE FEED), bodyString, and 0x000A (LINE FEED).
            let mut body_parse = Vec::with_capacity(body.len());
            body_parse.push(u16::from(b'\n'));
            body_parse.extend(body.iter());
            body_parse.push(u16::from(b'\n'));

            // 19. Let body be ParseText(StringToCodePoints(bodyParseString), bodySym).
            // 20. If body is a List of errors, throw a SyntaxError exception.
            let mut parser = Parser::new(Source::from_utf16(&body_parse));
            parser.set_identifier(context.next_parser_identifier());

            // 19. Let body be ParseText(StringToCodePoints(bodyParseString), bodySym).
            // 20. If body is a List of errors, throw a SyntaxError exception.
            let body = parser
                .parse_function_body(context.interner_mut(), generator, r#async)
                .map_err(|e| {
                    JsNativeError::syntax()
                        .with_message(format!("failed to parse function body: {e}"))
                })?;

            // It is a Syntax Error if AllPrivateIdentifiersValid of StatementList with argument « »
            // is false unless the source text containing ScriptBody is eval code that is being
            // processed by a direct eval.
            // https://tc39.es/ecma262/#sec-scripts-static-semantics-early-errors
            if !all_private_identifiers_valid(&body, Vec::new()) {
                return Err(JsNativeError::syntax()
                    .with_message("invalid private identifier usage")
                    .into());
            }

            // 21. NOTE: The parameters and body are parsed separately to ensure that each is valid alone. For example, new Function("/*", "*/ ) {") does not evaluate to a function.
            // 22. NOTE: If this step is reached, sourceText must have the syntax of exprSym (although the reverse implication does not hold). The purpose of the next two steps is to enforce any Early Error rules which apply to exprSym directly.
            // 23. Let expr be ParseText(sourceText, exprSym).
            // 24. If expr is a List of errors, throw a SyntaxError exception.
            // Check for errors that apply for the combination of body and parameters.

            // Early Error: If BindingIdentifier is present and the source text matched by BindingIdentifier is strict mode code,
            // it is a Syntax Error if the StringValue of BindingIdentifier is "eval" or "arguments".
            if body.strict() {
                for name in bound_names(&parameters) {
                    if name == Sym::ARGUMENTS || name == Sym::EVAL {
                        return Err(JsNativeError::syntax()
                            .with_message("Unexpected 'eval' or 'arguments' in strict mode")
                            .into());
                    }
                }
            }

            // Early Error: If the source code matching FormalParameters is strict mode code,
            // the Early Error rules for UniqueFormalParameters : FormalParameters are applied.
            if (body.strict()) && parameters.has_duplicates() {
                return Err(JsNativeError::syntax()
                    .with_message("Duplicate parameter name not allowed in this context")
                    .into());
            }

            // Early Error: It is a Syntax Error if FunctionBodyContainsUseStrict of GeneratorBody is true
            // and IsSimpleParameterList of FormalParameters is false.
            if body.strict() && !parameters.is_simple() {
                return Err(JsNativeError::syntax()
                    .with_message(
                        "Illegal 'use strict' directive in function with non-simple parameter list",
                    )
                    .into());
            }

            // It is a Syntax Error if FunctionBody Contains SuperProperty is true.
            if contains(&body, ContainsSymbol::SuperProperty) {
                return Err(JsNativeError::syntax()
                    .with_message("invalid `super` reference")
                    .into());
            }

            // It is a Syntax Error if FunctionBody Contains SuperCall is true.
            if contains(&body, ContainsSymbol::SuperCall) {
                return Err(JsNativeError::syntax()
                    .with_message("invalid `super` call")
                    .into());
            }

            // It is a Syntax Error if any element of the BoundNames of FormalParameters
            // also occurs in the LexicallyDeclaredNames of FunctionBody.
            // https://tc39.es/ecma262/#sec-function-definitions-static-semantics-early-errors
            {
                let lexically_declared_names = lexically_declared_names(&body);
                for name in bound_names(&parameters) {
                    if lexically_declared_names.contains(&name) {
                        return Err(JsNativeError::syntax()
                            .with_message(format!(
                                "Redeclaration of formal parameter `{}`",
                                context.interner().resolve_expect(name)
                            ))
                            .into());
                    }
                }
            }

            body
        };

        // TODO: create SourceText : "anonymous(" parameters \n ") {" body_parse "}"

        let function_span_start = Position::new(1, 1);
        let function_span_end = body.span().end();
        let mut function = boa_ast::function::FunctionExpression::new(
            None,
            parameters,
            body,
            None,
            false,
            Span::new(function_span_start, function_span_end),
        );
        if let Err(reason) =
            function.analyze_scope(strict, context.realm().scope(), context.interner())
        {
            return Err(js_error!(SyntaxError: "failed to analyze function scope: {}", reason));
        }

        let in_with = context.vm.frame().environments.has_object_environment();
        let spanned_source_text = SpannedSourceText::new_empty();

        let code = FunctionCompiler::new(spanned_source_text)
            .name(js_string!("anonymous"))
            .generator(generator)
            .r#async(r#async)
            .in_with(in_with)
            .force_function_scope(true)
            .compile(
                function.parameters(),
                function.body(),
                context.realm().scope().clone(),
                context.realm().scope().clone(),
                function.scopes(),
                function.contains_direct_eval(),
                context.interner_mut(),
            );

        let saved = context.vm.frame_mut().environments.pop_to_global();
        let function_object = crate::vm::create_function_object(code, prototype, context);
        context
            .vm
            .frame_mut()
            .environments
            .restore_from_saved(saved);

        Ok(function_object)
    }

    /// `Function.prototype.apply ( thisArg, argArray )`
    ///
    /// The `apply()` method invokes self with the first argument as the `this` value
    /// and the rest of the arguments provided as an array (or an array-like object).
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function.prototype.apply
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
    fn apply(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let func be the this value.
        // 2. If IsCallable(func) is false, throw a TypeError exception.
        let func = this.as_callable().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("{} is not a function", this.display()))
        })?;

        let this_arg = args.get_or_undefined(0);
        let arg_array = args.get_or_undefined(1);
        // 3. If argArray is undefined or null, then
        if arg_array.is_null_or_undefined() {
            // a. Perform PrepareForTailCall().
            // TODO?: 3.a. PrepareForTailCall

            // b. Return ? Call(func, thisArg).
            return func.call(this_arg, &[], context);
        }

        // 4. Let argList be ? CreateListFromArrayLike(argArray).
        let arg_list = arg_array.create_list_from_array_like(&[], context)?;

        // 5. Perform PrepareForTailCall().
        // TODO?: 5. PrepareForTailCall

        // 6. Return ? Call(func, thisArg, argList).
        func.call(this_arg, &arg_list, context)
    }

    /// `Function.prototype.bind ( thisArg, ...args )`
    ///
    /// The `bind()` method creates a new function that, when called, has its
    /// this keyword set to the provided value, with a given sequence of arguments
    /// preceding any provided when the new function is called.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function.prototype.bind
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_objects/Function/bind
    fn bind(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let Target be the this value.
        // 2. If IsCallable(Target) is false, throw a TypeError exception.
        let target = this.as_callable().ok_or_else(|| {
            JsNativeError::typ()
                .with_message("cannot bind `this` without a `[[Call]]` internal method")
        })?;

        let this_arg = args.get_or_undefined(0).clone();
        let bound_args = args.get(1..).unwrap_or(&[]).to_vec();
        let arg_count = bound_args.len() as i64;

        // 3. Let F be ? BoundFunctionCreate(Target, thisArg, args).
        let f = BoundFunction::create(target.clone(), this_arg, bound_args, context)?;

        // 4. Let L be 0.
        let mut l = JsValue::new(0);

        // 5. Let targetHasLength be ? HasOwnProperty(Target, "length").
        // 6. If targetHasLength is true, then
        if target.has_own_property(StaticJsStrings::LENGTH, context)? {
            // a. Let targetLen be ? Get(Target, "length").
            let target_len = target.get(StaticJsStrings::LENGTH, context)?;
            // b. If Type(targetLen) is Number, then
            if target_len.is_number() {
                // 1. Let targetLenAsInt be ! ToIntegerOrInfinity(targetLen).
                match target_len
                    .to_integer_or_infinity(context)
                    .js_expect("to_integer_or_infinity cannot fail for a number")?
                {
                    // i. If targetLen is +∞𝔽, set L to +∞.
                    IntegerOrInfinity::PositiveInfinity => l = f64::INFINITY.into(),
                    // ii. Else if targetLen is -∞𝔽, set L to 0.
                    IntegerOrInfinity::NegativeInfinity => {}
                    // iii. Else,
                    IntegerOrInfinity::Integer(target_len) => {
                        // 2. Assert: targetLenAsInt is finite.
                        // 3. Let argCount be the number of elements in args.
                        // 4. Set L to max(targetLenAsInt - argCount, 0).
                        l = (target_len - arg_count).max(0).into();
                    }
                }
            }
        }

        // 7. Perform ! SetFunctionLength(F, L).
        f.define_property_or_throw(
            StaticJsStrings::LENGTH,
            PropertyDescriptor::builder()
                .value(l)
                .writable(false)
                .enumerable(false)
                .configurable(true),
            context,
        )
        .js_expect("defining the `length` property for a new object should not fail")?;

        // 8. Let targetName be ? Get(Target, "name").
        let target_name = target.get(js_string!("name"), context)?;

        // 9. If Type(targetName) is not String, set targetName to the empty String.
        let target_name = target_name.as_string().unwrap_or_default();

        // 10. Perform SetFunctionName(F, targetName, "bound").
        set_function_name(&f, &target_name.into(), Some(js_str!("bound")), context)?;

        // 11. Return F.
        Ok(f.into())
    }

    /// `Function.prototype.call ( thisArg, ...args )`
    ///
    /// The `call()` method calls a function with a given this value and arguments provided individually.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function.prototype.call
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/call
    fn call(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let func be the this value.
        // 2. If IsCallable(func) is false, throw a TypeError exception.
        let func = this.as_callable().ok_or_else(|| {
            JsNativeError::typ().with_message(format!("{} is not a function", this.display()))
        })?;
        let this_arg = args.get_or_undefined(0);

        // 3. Perform PrepareForTailCall().
        // TODO?: 3. Perform PrepareForTailCall

        // 4. Return ? Call(func, thisArg, args).
        func.call(this_arg, args.get(1..).unwrap_or(&[]), context)
    }

    /// `Function.prototype.toString()`
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString
    #[allow(clippy::wrong_self_convention)]
    fn to_string(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let func be the this value.
        let func = this;

        // TODO:
        //    2. If func is an Object, func has a [[SourceText]] internal slot, func.[[SourceText]] is a sequence of Unicode code points,and HostHasSourceTextAvailable(func) is true, then
        //        a. Return CodePointsToString(func.[[SourceText]]).

        // 3. If func is a built-in function object, return an implementation-defined String source code representation of func.
        //    The representation must have the syntax of a NativeFunction. Additionally, if func has an [[InitialName]] internal slot and
        //    func.[[InitialName]] is a String, the portion of the returned String that would be matched by
        //    NativeFunctionAccessor_opt PropertyName must be the value of func.[[InitialName]].

        // 4. If func is an Object and IsCallable(func) is true, return an implementation-defined String source code representation of func.
        //    The representation must have the syntax of a NativeFunction.
        // 5. Throw a TypeError exception.
        let Some(object) = func.as_callable() else {
            return Err(JsNativeError::typ().with_message("not a function").into());
        };

        if object.is::<NativeFunctionObject>() {
            let name = {
                // Is there a case here where if there is no name field on a value
                // name should default to None? Do all functions have names set?
                let value = object.get(js_string!("name"), &mut *context)?;
                if value.is_null_or_undefined() {
                    js_string!()
                } else {
                    value.to_string(context)?
                }
            };
            return Ok(
                js_string!(js_str!("function "), &name, js_str!("() { [native code] }")).into(),
            );
        } else if object.is::<Proxy>() || object.is::<BoundFunction>() {
            return Ok(js_string!("function () { [native code] }").into());
        }

        let function = object
            .downcast_ref::<OrdinaryFunction>()
            .ok_or_else(|| JsNativeError::typ().with_message("not a function"))?;

        let code = function.codeblock();
        if let Some(code_points) = code.source_info().text_spanned().to_code_points() {
            return Ok(JsString::from(code_points).into());
        }

        Ok(js_string!(
            js_str!("function "),
            code.name(),
            js_str!("() { [native code] }")
        )
        .into())
    }

    /// `Function.prototype [ @@hasInstance ] ( V )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-function.prototype-@@hasinstance
    fn has_instance(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let F be the this value.
        // 2. Return ? OrdinaryHasInstance(F, V).
        Ok(JsValue::ordinary_has_instance(this, args.get_or_undefined(0), context)?.into())
    }

    #[allow(clippy::unnecessary_wraps)]
    fn prototype(_: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        Ok(JsValue::undefined())
    }
}

/// Abstract operation `SetFunctionName`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-setfunctionname
pub(crate) fn set_function_name(
    function: &JsObject,
    name: &PropertyKey,
    prefix: Option<JsStr<'_>>,
    context: &mut Context,
) -> JsResult<()> {
    // 1. Assert: F is an extensible object that does not have a "name" own property.
    // 2. If Type(name) is Symbol, then
    let mut name = match name {
        PropertyKey::Symbol(sym) => {
            // a. Let description be name's [[Description]] value.
            // b. If description is undefined, set name to the empty String.
            // c. Else, set name to the string-concatenation of "[", description, and "]".
            sym.description().map_or_else(
                || js_string!(),
                |desc| js_string!(js_str!("["), &desc, js_str!("]")),
            )
        }
        PropertyKey::String(string) => string.clone(),
        PropertyKey::Index(index) => js_string!(format!("{}", index.get())),
    };

    // 3. Else if name is a Private Name, then
    // a. Set name to name.[[Description]].
    // todo: implement Private Names

    // 4. If F has an [[InitialName]] internal slot, then
    // a. Set F.[[InitialName]] to name.
    // todo: implement [[InitialName]] for builtins

    // 5. If prefix is present, then
    if let Some(prefix) = prefix {
        name = js_string!(prefix, js_str!(" "), &name);
        // b. If F has an [[InitialName]] internal slot, then
        // i. Optionally, set F.[[InitialName]] to name.
        // todo: implement [[InitialName]] for builtins
    }

    // 6. Return ! DefinePropertyOrThrow(F, "name", PropertyDescriptor { [[Value]]: name,
    // [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: true }).
    function
        .define_property_or_throw(
            js_string!("name"),
            PropertyDescriptor::builder()
                .value(name)
                .writable(false)
                .enumerable(false)
                .configurable(true),
            context,
        )
        .js_expect("defining the `name` property must not fail per the spec")?;

    Ok(())
}

/// Call this object.
///
/// # Panics
///
/// Panics if the object is currently mutably borrowed.
// <https://tc39.es/ecma262/#sec-prepareforordinarycall>
// <https://tc39.es/ecma262/#sec-ecmascript-function-objects-call-thisargument-argumentslist>
pub(crate) fn function_call(
    function_object: &JsObject,
    argument_count: usize,
    #[allow(
        unused_variables,
        reason = "Only used if native-backtrace feature is enabled"
    )]
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    context.check_runtime_limits()?;

    let function = function_object
        .downcast_ref::<OrdinaryFunction>()
        .js_expect("not a function")?;
    let realm = function.realm().clone();

    if function.code.is_class_constructor() {
        debug_assert!(
            function.is_ordinary(),
            "only ordinary functions can be classes"
        );
        let class_name = function.code.source_info.function_name().to_std_string_escaped();
        return Err(JsNativeError::typ()
            .with_message(format!("Class constructor {class_name} cannot be invoked without 'new'"))
            .with_realm(realm)
            .into());
    }

    let code = function.code.clone();
    let environments = function.environments.clone();
    let script_or_module = function.script_or_module.clone();

    drop(function);

    let env_fp = environments.len() as u32;

    let frame = CallFrame::new(code, script_or_module, environments, realm)
        .with_argument_count(argument_count as u32)
        .with_env_fp(env_fp);

    #[cfg(feature = "native-backtrace")]
    {
        let native_source_info = context.native_source_info();
        context
            .vm
            .shadow_stack
            .patch_last_native(native_source_info);
    }

    context.vm.push_frame(frame);
    context.vm.set_return_value(JsValue::undefined());

    let context = context.context();

    let lexical_this_mode = context.vm.frame().code_block.this_mode == ThisMode::Lexical;
    let this = if lexical_this_mode {
        ThisBindingStatus::Lexical
    } else {
        let this = context.vm.stack.get_this(context.vm.frame());
        if context.vm.frame().code_block.strict() {
            context.vm.frame_mut().flags |= CallFrameFlags::THIS_VALUE_CACHED;
            ThisBindingStatus::Initialized(this)
        } else if this.is_null_or_undefined() {
            context.vm.frame_mut().flags |= CallFrameFlags::THIS_VALUE_CACHED;
            let this: JsValue = context.realm().global_this().clone().into();
            context.vm.stack.set_this(
                context.vm.frames.last().js_expect("frame must exist")?,
                this.clone(),
            );
            ThisBindingStatus::Initialized(this)
        } else {
            let this: JsValue = this
                .to_object(context)
                .js_expect("conversion cannot fail")?
                .into();
            context.vm.frame_mut().flags |= CallFrameFlags::THIS_VALUE_CACHED;
            context.vm.stack.set_this(
                context.vm.frames.last().js_expect("frame must exist")?,
                this.clone(),
            );
            ThisBindingStatus::Initialized(this)
        }
    };

    let mut last_env = 0;

    let has_binding_identifier = context.vm.frame().code_block().has_binding_identifier();
    let has_function_scope = context.vm.frame().code_block().has_function_scope();

    if has_binding_identifier {
        let frame = context.vm.frame_mut();
        let global = frame.realm.environment();
        let index = frame.environments.push_lexical(1, global);
        frame.environments.put_lexical_value(
            BindingLocatorScope::Stack(index),
            0,
            function_object.clone().into(),
            global,
        );
        last_env += 1;
    }

    if has_function_scope {
        let scope = context.vm.frame().code_block().constant_scope(last_env);
        let frame = context.vm.frame_mut();
        let global = frame.realm.environment();
        frame.environments.push_function(
            scope,
            FunctionSlots::new(this, function_object.clone(), None),
            global,
        );
    }

    Ok(CallValue::Ready)
}

/// Construct an instance of this object with the specified arguments.
///
/// # Panics
///
/// Panics if the object is currently mutably borrowed.
// <https://tc39.es/ecma262/#sec-ecmascript-function-objects-construct-argumentslist-newtarget>
fn function_construct(
    this_function_object: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    context.check_runtime_limits()?;

    let function = this_function_object
        .downcast_ref::<OrdinaryFunction>()
        .js_expect("not a function")?;
    let realm = function.realm().clone();

    debug_assert!(
        function.is_ordinary(),
        "only ordinary functions can be constructed"
    );

    let code = function.code.clone();
    let environments = function.environments.clone();
    let script_or_module = function.script_or_module.clone();
    drop(function);

    let env_fp = environments.len() as u32;

    let new_target = context.vm.stack.pop();

    let this = if code.is_derived_constructor() {
        None
    } else {
        // If the prototype of the constructor is not an object, then use the default object
        // prototype as prototype for the new object
        // see <https://tc39.es/ecma262/#sec-ordinarycreatefromconstructor>
        // see <https://tc39.es/ecma262/#sec-getprototypefromconstructor>
        let prototype =
            get_prototype_from_constructor(&new_target, StandardConstructors::object, context)?;
        let this = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            OrdinaryObject,
        )
        .upcast();

        this.initialize_instance_elements(this_function_object, context)?;

        Some(this)
    };

    let mut frame = CallFrame::new(code, script_or_module, environments, realm)
        .with_argument_count(argument_count as u32)
        .with_env_fp(env_fp)
        .with_flags(CallFrameFlags::CONSTRUCT);

    // We push the `this` below so we can mark this function as having the this value
    // cached if it's initialized.
    frame
        .flags
        .set(CallFrameFlags::THIS_VALUE_CACHED, this.is_some());

    #[cfg(feature = "native-backtrace")]
    {
        let native_source_info = context.native_source_info();
        context
            .vm
            .shadow_stack
            .patch_last_native(native_source_info);
    }

    context.vm.push_frame(frame);
    context.vm.set_return_value(JsValue::undefined());

    let mut last_env = 0;

    let has_binding_identifier = context.vm.frame().code_block().has_binding_identifier();
    let has_function_scope = context.vm.frame().code_block().has_function_scope();

    if has_binding_identifier {
        let frame = context.vm.frame_mut();
        let global = frame.realm.environment();
        let index = frame.environments.push_lexical(1, global);
        frame.environments.put_lexical_value(
            BindingLocatorScope::Stack(index),
            0,
            this_function_object.clone().into(),
            global,
        );
        last_env += 1;
    }

    if has_function_scope {
        let scope = context.vm.frame().code_block().constant_scope(last_env);
        let frame = context.vm.frame_mut();
        let global = frame.realm.environment();
        frame.environments.push_function(
            scope,
            FunctionSlots::new(
                this.clone().map_or(ThisBindingStatus::Uninitialized, |o| {
                    ThisBindingStatus::Initialized(o.into())
                }),
                this_function_object.clone(),
                Some(
                    new_target
                        .as_object()
                        .js_expect("new.target should be an object")?
                        .clone(),
                ),
            ),
            global,
        );
    }

    let context = context.context();
    context.vm.stack.set_this(
        context.vm.frames.last().js_expect("frame must exist")?,
        this.map(JsValue::new).unwrap_or_default(),
    );

    Ok(CallValue::Ready)
}
