use crate::{
    Context, JsData, JsExpect, JsResult, JsValue,
    bytecompiler::ToJsString,
    environments::DeclarativeEnvironment,
    object::{
        JsObject,
        internal_methods::{
            InternalMethodPropertyContext, InternalObjectMethods, ORDINARY_INTERNAL_METHODS,
            ordinary_define_own_property, ordinary_delete, ordinary_get, ordinary_get_own_property,
            ordinary_set, ordinary_try_get,
        },
    },
    property::{DescriptorKind, PropertyDescriptor, PropertyKey},
};
use boa_ast::{function::FormalParameterList, operations::bound_names, scope::Scope};
use boa_gc::{Finalize, Gc, Trace};
use boa_interner::Interner;
use rustc_hash::FxHashMap;
use thin_vec::{ThinVec, thin_vec};

#[derive(Debug, Copy, Clone, Trace, Finalize, JsData)]
#[boa_gc(empty_trace)]
pub(crate) struct UnmappedArguments;

impl UnmappedArguments {
    /// Creates a new unmapped Arguments ordinary object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-createunmappedargumentsobject
    #[allow(clippy::new_ret_no_self)]
    pub(crate) fn new(arguments_list: &[JsValue], context: &mut Context) -> JsObject {
        // 1. Let len be the number of elements in argumentsList.
        let len = arguments_list.len();

        let values_function = context.intrinsics().objects().array_prototype_values();
        let throw_type_error = context.intrinsics().objects().throw_type_error();

        // 2. Let obj be ! OrdinaryObjectCreate(%Object.prototype%, « [[ParameterMap]] »).
        // 3. Set obj.[[ParameterMap]] to undefined.
        // skipped because the `Arguments` enum ensures ordinary argument objects don't have a `[[ParameterMap]]`
        let obj = context
            .intrinsics()
            .templates()
            .unmapped_arguments()
            .create(
                Self,
                vec![
                    // 4. Perform DefinePropertyOrThrow(obj, "length", PropertyDescriptor { [[Value]]: 𝔽(len),
                    // [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
                    len.into(),
                    // 7. Perform ! DefinePropertyOrThrow(obj, @@iterator, PropertyDescriptor {
                    // [[Value]]: %Array.prototype.values%, [[Writable]]: true, [[Enumerable]]: false,
                    // [[Configurable]]: true }).
                    values_function.into(),
                    // 8. Perform ! DefinePropertyOrThrow(obj, "callee", PropertyDescriptor {
                    // [[Get]]: %ThrowTypeError%, [[Set]]: %ThrowTypeError%, [[Enumerable]]: false,
                    // [[Configurable]]: false }).
                    throw_type_error.clone().into(), // get
                    throw_type_error.into(),         // set
                ],
            );

        // 5. Let index be 0.
        // 6. Repeat, while index < len,
        //    a. Let val be argumentsList[index].
        //    b. Perform ! CreateDataPropertyOrThrow(obj, ! ToString(𝔽(index)), val).
        //    c. Set index to index + 1.
        obj.borrow_mut()
            .properties_mut()
            .override_indexed_properties(arguments_list.iter().cloned().collect());

        // 9. Return obj.
        obj
    }
}

/// `MappedArguments` represents an Arguments exotic object.
///
/// This struct stores all the data to access mapped function parameters in their environment.
#[derive(Debug, Clone, Trace, Finalize)]
pub(crate) struct MappedArguments {
    #[unsafe_ignore_trace]
    binding_indices: Vec<Option<u32>>,
    environment: Gc<DeclarativeEnvironment>,
}

impl JsData for MappedArguments {
    fn internal_methods(&self) -> &'static InternalObjectMethods {
        static METHODS: InternalObjectMethods = InternalObjectMethods {
            __get_own_property__: arguments_exotic_get_own_property,
            __define_own_property__: arguments_exotic_define_own_property,
            __try_get__: arguments_exotic_try_get,
            __get__: arguments_exotic_get,
            __set__: arguments_exotic_set,
            __delete__: arguments_exotic_delete,
            ..ORDINARY_INTERNAL_METHODS
        };

        &METHODS
    }
}

impl MappedArguments {
    /// Deletes the binding with the given index from the parameter map.
    pub(crate) fn delete(&mut self, index: u32) {
        if let Some(binding) = self.binding_indices.get_mut(index as usize) {
            *binding = None;
        }
    }

    /// Get the value of the binding at the given index from the function environment.
    ///
    /// Note: This function is the abstract getter closure described in 10.4.4.7.1 `MakeArgGetter ( name, env )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-makearggetter
    pub(crate) fn get(&self, index: u32) -> Option<JsValue> {
        let binding_index = self
            .binding_indices
            .get(index as usize)
            .copied()
            .flatten()?;
        self.environment.get(binding_index)
    }

    /// Set the value of the binding at the given index in the function environment.
    ///
    /// Note: This function is the abstract setter closure described in 10.4.4.7.2 `MakeArgSetter ( name, env )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-makeargsetter
    pub(crate) fn set(&self, index: u32, value: &JsValue) {
        if let Some(binding_index) = self.binding_indices.get(index as usize).copied().flatten() {
            self.environment.set(binding_index, value.clone());
        }
    }
}

impl MappedArguments {
    pub(crate) fn binding_indices(
        formals: &FormalParameterList,
        scope: &Scope,
        interner: &Interner,
    ) -> ThinVec<Option<u32>> {
        // Section 17-19 are done first, for easier object creation in 11.
        //
        // The section 17-19 differs from the spec, due to the way the runtime environments work.
        //
        // This section creates getters and setters for all mapped arguments.
        // Getting and setting values on the `arguments` object will actually access the bindings in the environment:
        // ```
        // function f(a) {console.log(a); arguments[0] = 1; console.log(a)};
        // f(0) // 0, 1
        // ```
        //
        // The spec assumes, that identifiers are used at runtime to reference bindings in the environment.
        // We use indices to access environment bindings at runtime.
        // To map to function parameters to binding indices, we use the fact, that bindings in a
        // function environment start with all of the arguments in order:
        //
        // Note: The first binding (binding 0) is where "arguments" is stored.
        //
        // `function f (a,b,c)`
        // | binding index | `arguments` property key | identifier |
        // | 1             | 0                        | a          |
        // | 2             | 1                        | b          |
        // | 3             | 2                        | c          |
        //
        // Notice that the binding index does not correspond to the argument index:
        // `function f (a,a,b)` => binding indices 0 (a), 1 (b), 2 (c)
        // | binding index | `arguments` property key | identifier |
        // | -             | 0                        | -          |
        // | 1             | 1                        | a          |
        // | 2             | 2                        | b          |
        //
        // While the `arguments` object contains all arguments, they must not be all bound.
        // In the case of duplicate parameter names, the last one is bound as the environment binding.
        //
        // The following logic implements the steps 17-19 adjusted for our environment structure.
        let mut bindings = FxHashMap::default();
        let mut property_index = 0;
        for name in bound_names(formals) {
            let binding_index = scope
                .get_binding(&name.to_js_string(interner))
                .expect("binding must exist")
                .binding_index();

            let entry = bindings
                .entry(name)
                .or_insert((binding_index, property_index));

            entry.1 = property_index;
            property_index += 1;
        }

        let mut binding_indices = thin_vec![None; property_index];
        for (binding_index, property_index) in bindings.values() {
            binding_indices[*property_index] = Some(*binding_index);
        }

        binding_indices
    }

    /// Creates a new mapped Arguments exotic object.
    ///
    /// <https://tc39.es/ecma262/#sec-createmappedargumentsobject>
    #[allow(clippy::new_ret_no_self)]
    pub(crate) fn new(
        func: &JsObject,
        binding_indices: &[Option<u32>],
        arguments_list: &[JsValue],
        env: &Gc<DeclarativeEnvironment>,
        context: &Context,
    ) -> JsObject {
        // 1. Assert: formals does not contain a rest parameter, any binding patterns, or any initializers.
        // It may contain duplicate identifiers.
        // 2. Let len be the number of elements in argumentsList.
        let len = arguments_list.len();

        // 3. Let obj be ! MakeBasicObject(« [[Prototype]], [[Extensible]], [[ParameterMap]] »).
        // 4. Set obj.[[GetOwnProperty]] as specified in 10.4.4.1.
        // 5. Set obj.[[DefineOwnProperty]] as specified in 10.4.4.2.
        // 6. Set obj.[[Get]] as specified in 10.4.4.3.
        // 7. Set obj.[[Set]] as specified in 10.4.4.4.
        // 8. Set obj.[[Delete]] as specified in 10.4.4.5.
        // 9. Set obj.[[Prototype]] to %Object.prototype%.

        let range = binding_indices.len().min(len);
        let map = MappedArguments {
            binding_indices: binding_indices[..range].to_vec(),
            environment: env.clone(),
        };

        // %Array.prototype.values%
        let values_function = context.intrinsics().objects().array_prototype_values();

        // 11. Set obj.[[ParameterMap]] to map.
        let obj = context.intrinsics().templates().mapped_arguments().create(
            map,
            vec![
                // 16. Perform ! DefinePropertyOrThrow(obj, "length", PropertyDescriptor { [[Value]]: 𝔽(len),
                // [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
                len.into(),
                // 20. Perform ! DefinePropertyOrThrow(obj, @@iterator, PropertyDescriptor {
                // [[Value]]: %Array.prototype.values%, [[Writable]]: true, [[Enumerable]]: false,
                // [[Configurable]]: true }).
                values_function.into(),
                // 21. Perform ! DefinePropertyOrThrow(obj, "callee", PropertyDescriptor {
                // [[Value]]: func, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true }).
                func.clone().into(),
            ],
        );

        // 14. Let index be 0.
        // 15. Repeat, while index < len,
        //     a. Let val be argumentsList[index].
        //     b. Perform ! CreateDataPropertyOrThrow(obj, ! ToString(𝔽(index)), val).
        //     Note: Direct initialization of indexed array is used here because `CreateDataPropertyOrThrow`
        //     would cause a panic while executing exotic argument object set methods before the variables
        //     in the environment are initialized.
        obj.borrow_mut()
            .properties_mut()
            .override_indexed_properties(arguments_list.iter().cloned().collect());

        // 22. Return obj.
        obj
    }
}

/// `[[GetOwnProperty]]` for arguments exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-getownproperty-p
pub(crate) fn arguments_exotic_get_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<PropertyDescriptor>> {
    // 1. Let desc be OrdinaryGetOwnProperty(args, P).
    // 2. If desc is undefined, return desc.
    let Some(desc) = ordinary_get_own_property(obj, key, context)? else {
        return Ok(None);
    };

    // 3. Let map be args.[[ParameterMap]].
    // 4. Let isMapped be ! HasOwnProperty(map, P).
    // 5. If isMapped is true, then
    if let PropertyKey::Index(index) = key
        && let Some(value) = obj
            .downcast_ref::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .get(index.get())
    {
        // a. Set desc.[[Value]] to Get(map, P).
        return Ok(Some(
            PropertyDescriptor::builder()
                .value(value)
                .maybe_writable(desc.writable())
                .maybe_enumerable(desc.enumerable())
                .maybe_configurable(desc.configurable())
                .build(),
        ));
    }

    // 6. Return desc.
    Ok(Some(desc))
}

/// `[[DefineOwnProperty]]` for arguments exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-defineownproperty-p-desc
#[allow(clippy::needless_pass_by_value)]
pub(crate) fn arguments_exotic_define_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    desc: PropertyDescriptor,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 2. Let isMapped be HasOwnProperty(map, P).
    let mapped = if let &PropertyKey::Index(index) = &key {
        // 1. Let map be args.[[ParameterMap]].
        obj.downcast_ref::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .get(index.get())
            .map(|value| (index, value))
    } else {
        None
    };

    let new_arg_desc = match desc.kind() {
        // 4. If isMapped is true and IsDataDescriptor(Desc) is true, then
        // a. If Desc.[[Value]] is not present and Desc.[[Writable]] is present and its
        // value is false, then
        DescriptorKind::Data {
            writable: Some(false),
            value: None,
        } =>
        // i. Set newArgDesc to a copy of Desc.
        // ii. Set newArgDesc.[[Value]] to Get(map, P).
        {
            if let Some((_, value)) = &mapped {
                PropertyDescriptor::builder()
                    .value(value.clone())
                    .writable(false)
                    .maybe_enumerable(desc.enumerable())
                    .maybe_configurable(desc.configurable())
                    .build()
            } else {
                desc.clone()
            }
        }

        // 3. Let newArgDesc be Desc.
        _ => desc.clone(),
    };

    // 5. Let allowed be ? OrdinaryDefineOwnProperty(args, P, newArgDesc).
    // 6. If allowed is false, return false.
    if !ordinary_define_own_property(obj, key, new_arg_desc, context)? {
        return Ok(false);
    }

    // 7. If isMapped is true, then
    if let Some((index, _)) = mapped {
        // 1. Let map be args.[[ParameterMap]].
        let mut map = obj
            .downcast_mut::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?;

        // a. If IsAccessorDescriptor(Desc) is true, then
        if desc.is_accessor_descriptor() {
            // i. Call map.[[Delete]](P).
            map.delete(index.get());
        }
        // b. Else,
        else {
            // i. If Desc.[[Value]] is present, then
            if let Some(value) = desc.value() {
                // 1. Let setStatus be Set(map, P, Desc.[[Value]], false).
                // 2. Assert: setStatus is true because formal parameters mapped by argument objects are always writable.
                map.set(index.get(), value);
            }

            // ii. If Desc.[[Writable]] is present and its value is false, then
            if desc.writable() == Some(false) {
                // 1. Call map.[[Delete]](P).
                map.delete(index.get());
            }
        }
    }

    // 8. Return true.
    Ok(true)
}

/// Internal optimization method for `Arguments` exotic objects.
///
/// This method combines the internal methods `OrdinaryHasProperty` and `[[Get]]`.
///
/// More information:
///  - [ECMAScript reference OrdinaryHasProperty][spec0]
///  - [ECMAScript reference Get][spec1]
///
/// [spec0]: https://tc39.es/ecma262/#sec-ordinaryhasproperty
/// [spec1]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-get-p-receiver
pub(crate) fn arguments_exotic_try_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<JsValue>> {
    // 1. Let map be args.[[ParameterMap]].
    // 2. Let isMapped be ! HasOwnProperty(map, P).
    if let PropertyKey::Index(index) = key
        && let Some(value) = obj
            .downcast_ref::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .get(index.get())
    {
        // a. Assert: map contains a formal parameter mapping for P.
        // b. Return Get(map, P).
        return Ok(Some(value));
    }

    // 3. If isMapped is false, then
    // a. Return ? OrdinaryGet(args, P, Receiver).
    ordinary_try_get(obj, key, receiver, context)
}

/// `[[Get]]` for arguments exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-get-p-receiver
pub(crate) fn arguments_exotic_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<JsValue> {
    // 1. Let map be args.[[ParameterMap]].
    // 2. Let isMapped be ! HasOwnProperty(map, P).
    if let PropertyKey::Index(index) = key
        && let Some(value) = obj
            .downcast_ref::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .get(index.get())
    {
        // a. Assert: map contains a formal parameter mapping for P.
        // b. Return Get(map, P).
        return Ok(value);
    }

    // 3. If isMapped is false, then
    // a. Return ? OrdinaryGet(args, P, Receiver).
    ordinary_get(obj, key, receiver, context)
}

/// `[[Set]]` for arguments exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-set-p-v-receiver
pub(crate) fn arguments_exotic_set(
    obj: &JsObject,
    key: PropertyKey,
    value: JsValue,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. If SameValue(args, Receiver) is false, then
    // a. Let isMapped be false.
    // 2. Else,
    if let PropertyKey::Index(index) = &key
        && JsValue::same_value(&obj.clone().into(), &receiver)
    {
        // a. Let map be args.[[ParameterMap]].
        // b. Let isMapped be ! HasOwnProperty(map, P).
        // 3. If isMapped is true, then
        // a. Let setStatus be Set(map, P, V, false).
        // b. Assert: setStatus is true because formal parameters mapped by argument objects are always writable.
        obj.downcast_ref::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .set(index.get(), &value);
    }

    // 4. Return ? OrdinarySet(args, P, V, Receiver).
    ordinary_set(obj, key, value, receiver, context)
}

/// `[[Delete]]` for arguments exotic objects.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-arguments-exotic-objects-delete-p
pub(crate) fn arguments_exotic_delete(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 3. Let result be ? OrdinaryDelete(args, P).
    let result = ordinary_delete(obj, key, context)?;

    if result && let PropertyKey::Index(index) = key {
        // 1. Let map be args.[[ParameterMap]].
        // 2. Let isMapped be ! HasOwnProperty(map, P).
        // 4. If result is true and isMapped is true, then
        // a. Call map.[[Delete]](P).
        obj.downcast_mut::<MappedArguments>()
            .js_expect("arguments exotic method must only be callable from arguments objects")?
            .delete(index.get());
    }

    // 5. Return result.
    Ok(result)
}
