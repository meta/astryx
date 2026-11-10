use boa_gc::{Finalize, Trace};

use crate::{
    Context, JsExpect, JsObject, JsResult, JsValue,
    object::{
        JsData,
        internal_methods::{
            CallValue, InternalMethodCallContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
        },
    },
};

/// Binds a `Function Object` when `bind` is called.
#[derive(Debug, Trace, Finalize)]
pub struct BoundFunction {
    target_function: JsObject,
    this: JsValue,
    args: Vec<JsValue>,
}

impl JsData for BoundFunction {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static CONSTRUCTOR_METHODS: InternalObjectMethods = InternalObjectMethods {
            __call__: bound_function_exotic_call,
            __construct__: bound_function_exotic_construct,
            ..ORDINARY_INTERNAL_METHODS
        };

        static FUNCTION_METHODS: InternalObjectMethods = InternalObjectMethods {
            __call__: bound_function_exotic_call,
            ..ORDINARY_INTERNAL_METHODS
        };

        if self.target_function.is_constructor() {
            &CONSTRUCTOR_METHODS
        } else {
            &FUNCTION_METHODS
        }
    }
}

impl BoundFunction {
    /// Abstract operation `BoundFunctionCreate`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-boundfunctioncreate
    pub fn create(
        target_function: JsObject,
        this: JsValue,
        args: Vec<JsValue>,
        context: &mut Context,
    ) -> JsResult<JsObject> {
        // 1. Let proto be ? targetFunction.[[GetPrototypeOf]]().
        let proto = target_function.__get_prototype_of__(context)?;

        // 2. Let internalSlotsList be the internal slots listed in Table 35, plus [[Prototype]] and [[Extensible]].
        // 3. Let obj be ! MakeBasicObject(internalSlotsList).
        // 4. Set obj.[[Prototype]] to proto.
        // 5. Set obj.[[Call]] as described in 10.4.1.1.
        // 6. If IsConstructor(targetFunction) is true, then
        // a. Set obj.[[Construct]] as described in 10.4.1.2.
        // 7. Set obj.[[BoundTargetFunction]] to targetFunction.
        // 8. Set obj.[[BoundThis]] to boundThis.
        // 9. Set obj.[[BoundArguments]] to boundArgs.
        // 10. Return obj.
        Ok(JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            proto,
            Self {
                target_function,
                this,
                args,
            },
        )
        .upcast())
    }

    /// Get a reference to the bound function's this.
    #[must_use]
    pub const fn this(&self) -> &JsValue {
        &self.this
    }

    /// Get a reference to the bound function's target function.
    #[must_use]
    pub const fn target_function(&self) -> &JsObject {
        &self.target_function
    }

    /// Get a reference to the bound function's args.
    #[must_use]
    pub fn args(&self) -> &[JsValue] {
        self.args.as_slice()
    }
}

/// Internal method `[[Call]]` for Bound Function Exotic Objects
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-bound-function-exotic-objects-call-thisargument-argumentslist
#[allow(clippy::unnecessary_wraps)]
fn bound_function_exotic_call(
    obj: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    let bound_function = obj.downcast_ref::<BoundFunction>().js_expect(
        "bound function exotic method should only be callable from bound function objects",
    )?;

    // 1. Let target be F.[[BoundTargetFunction]].
    let target = bound_function.target_function();
    context
        .vm
        .stack
        .calling_convention_set_function(argument_count, target.clone().into());

    // 2. Let boundThis be F.[[BoundThis]].
    let bound_this = bound_function.this();
    context
        .vm
        .stack
        .calling_convention_set_this(argument_count, bound_this.clone());

    // 3. Let boundArgs be F.[[BoundArguments]].
    let bound_args = bound_function.args();

    // 4. Let args be the list-concatenation of boundArgs and argumentsList.
    context
        .vm
        .stack
        .calling_convention_insert_arguments(argument_count, bound_args);

    // 5. Return ? Call(target, boundThis, args).
    Ok(target.__call__(bound_args.len() + argument_count))
}

/// Internal method `[[Construct]]` for Bound Function Exotic Objects
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-bound-function-exotic-objects-construct-argumentslist-newtarget
#[allow(clippy::unnecessary_wraps)]
fn bound_function_exotic_construct(
    function_object: &JsObject,
    argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    let new_target = context.vm.stack.pop();

    debug_assert!(new_target.is_object(), "new.target should be an object");

    let bound_function = function_object.downcast_ref::<BoundFunction>().js_expect(
        "bound function exotic method should only be callable from bound function objects",
    )?;

    // 1. Let target be F.[[BoundTargetFunction]].
    let target = bound_function.target_function();

    // 2. Assert: IsConstructor(target) is true.

    // 3. Let boundArgs be F.[[BoundArguments]].
    let bound_args = bound_function.args();

    // 4. Let args be the list-concatenation of boundArgs and argumentsList.
    context
        .vm
        .stack
        .calling_convention_insert_arguments(argument_count, bound_args);

    // 5. If SameValue(F, newTarget) is true, set newTarget to target.
    let function_object: JsValue = function_object.clone().into();
    let new_target = if JsValue::same_value(&function_object, &new_target) {
        target.clone().into()
    } else {
        new_target
    };

    // 6. Return ? Construct(target, args, newTarget).
    context.vm.stack.push(new_target);
    Ok(target.__construct__(bound_args.len() + argument_count))
}
