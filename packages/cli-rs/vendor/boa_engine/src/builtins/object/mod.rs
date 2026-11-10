//! Boa's implementation of ECMAScript's global `Object` object.
//!
//! The `Object` class represents one of ECMAScript's data types.
//!
//! It is used to store various keyed collections and more complex entities.
//! Objects can be created using the `Object()` constructor or the
//! object initializer / literal syntax.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!  - [MDN documentation][mdn]
//!
//! [spec]: https://tc39.es/ecma262/#sec-objects
//! [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object

use super::{
    Array, BuiltInBuilder, BuiltInConstructor, Date, IntrinsicObject, RegExp, error::Error,
};
use crate::builtins::function::arguments::{MappedArguments, UnmappedArguments};
use crate::value::JsVariant;
use crate::{
    Context, JsArgs, JsData, JsExpect, JsResult, JsString,
    builtins::{BuiltInObject, iterable::IteratorHint, map},
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_error, js_string,
    native_function::NativeFunction,
    object::{
        FunctionObjectBuilder, IntegrityLevel, JsObject,
        internal_methods::{InternalMethodPropertyContext, get_prototype_from_constructor},
    },
    property::{Attribute, PropertyDescriptor, PropertyKey, PropertyNameKind},
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
    value::JsValue,
};
use boa_gc::{Finalize, Trace};
use boa_macros::js_str;
use tap::{Conv, Pipe};

pub(crate) mod for_in_iterator;
#[cfg(test)]
mod tests;

/// An ordinary Javascript `Object`.
#[derive(Debug, Default, Clone, Copy, Trace, Finalize, JsData)]
#[boa_gc(empty_trace)]
pub struct OrdinaryObject;

impl IntrinsicObject for OrdinaryObject {
    fn init(realm: &Realm) {
        let legacy_proto_getter = BuiltInBuilder::callable(realm, Self::legacy_proto_getter)
            .name(js_string!("get __proto__"))
            .build();

        let legacy_setter_proto = BuiltInBuilder::callable(realm, Self::legacy_proto_setter)
            .name(js_string!("set __proto__"))
            .length(1)
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .inherits(None)
            .accessor(
                js_string!("__proto__"),
                Some(legacy_proto_getter),
                Some(legacy_setter_proto),
                Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .method(Self::has_own_property, js_string!("hasOwnProperty"), 1)
            .method(
                Self::property_is_enumerable,
                js_string!("propertyIsEnumerable"),
                1,
            )
            .method(Self::to_string, js_string!("toString"), 0)
            .method(Self::to_locale_string, js_string!("toLocaleString"), 0)
            .method(Self::value_of, js_string!("valueOf"), 0)
            .method(Self::is_prototype_of, js_string!("isPrototypeOf"), 1)
            .method(
                Self::legacy_define_getter,
                js_string!("__defineGetter__"),
                2,
            )
            .method(
                Self::legacy_define_setter,
                js_string!("__defineSetter__"),
                2,
            )
            .method(
                Self::legacy_lookup_getter,
                js_string!("__lookupGetter__"),
                1,
            )
            .method(
                Self::legacy_lookup_setter,
                js_string!("__lookupSetter__"),
                1,
            )
            .static_method(Self::create, js_string!("create"), 2)
            .static_method(Self::set_prototype_of, js_string!("setPrototypeOf"), 2)
            .static_method(Self::get_prototype_of, js_string!("getPrototypeOf"), 1)
            .static_method(Self::define_property, js_string!("defineProperty"), 3)
            .static_method(Self::define_properties, js_string!("defineProperties"), 2)
            .static_method(Self::assign, js_string!("assign"), 2)
            .static_method(Self::is, js_string!("is"), 2)
            .static_method(Self::keys, js_string!("keys"), 1)
            .static_method(Self::values, js_string!("values"), 1)
            .static_method(Self::entries, js_string!("entries"), 1)
            .static_method(Self::seal, js_string!("seal"), 1)
            .static_method(Self::is_sealed, js_string!("isSealed"), 1)
            .static_method(Self::freeze, js_string!("freeze"), 1)
            .static_method(Self::is_frozen, js_string!("isFrozen"), 1)
            .static_method(Self::prevent_extensions, js_string!("preventExtensions"), 1)
            .static_method(Self::is_extensible, js_string!("isExtensible"), 1)
            .static_method(
                Self::get_own_property_descriptor,
                js_string!("getOwnPropertyDescriptor"),
                2,
            )
            .static_method(
                Self::get_own_property_descriptors,
                js_string!("getOwnPropertyDescriptors"),
                1,
            )
            .static_method(
                Self::get_own_property_names,
                js_string!("getOwnPropertyNames"),
                1,
            )
            .static_method(
                Self::get_own_property_symbols,
                js_string!("getOwnPropertySymbols"),
                1,
            )
            .static_method(Self::has_own, js_string!("hasOwn"), 2)
            .static_method(Self::from_entries, js_string!("fromEntries"), 1)
            .static_method(Self::group_by, js_string!("groupBy"), 2)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for OrdinaryObject {
    const NAME: JsString = StaticJsStrings::OBJECT;
}

impl BuiltInConstructor for OrdinaryObject {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 12;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 23;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::object;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is neither undefined nor the active function object, then
        if !new_target.is_undefined()
            && new_target
                != &context
                    .active_function_object()
                    .unwrap_or_else(|| context.intrinsics().constructors().object().constructor())
                    .into()
        {
            //     a. Return ? OrdinaryCreateFromConstructor(NewTarget, "%Object.prototype%").
            let prototype =
                get_prototype_from_constructor(new_target, StandardConstructors::object, context)?;
            let object = JsObject::from_proto_and_data_with_shared_shape(
                context.root_shape(),
                prototype,
                OrdinaryObject,
            );
            return Ok(object.into());
        }

        let value = args.get_or_undefined(0);

        // 2. If value is undefined or null, return OrdinaryObjectCreate(%Object.prototype%).
        if value.is_null_or_undefined() {
            Ok(JsObject::with_object_proto(context.intrinsics()).into())
        } else {
            // 3. Return ! ToObject(value).
            value.to_object(context).map(JsValue::from)
        }
    }
}

impl OrdinaryObject {
    /// `get Object.prototype.__proto__`
    ///
    /// The `__proto__` getter function exposes the value of the
    /// internal `[[Prototype]]` of an object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-object.prototype.__proto__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/proto
    pub fn legacy_proto_getter(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let obj = this.to_object(context)?;

        // 2. Return ? O.[[GetPrototypeOf]]().
        let proto = obj.__get_prototype_of__(&mut InternalMethodPropertyContext::new(context))?;

        Ok(proto.map_or(JsValue::null(), JsValue::new))
    }

    /// `set Object.prototype.__proto__`
    ///
    /// The `__proto__` setter allows the `[[Prototype]]` of
    /// an object to be mutated.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-set-object.prototype.__proto__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/proto
    pub fn legacy_proto_setter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? RequireObjectCoercible(this value).
        let this = this.require_object_coercible()?;

        // 2. If Type(proto) is neither Object nor Null, return undefined.
        let proto = match args.get_or_undefined(0).variant() {
            JsVariant::Object(proto) => Some(proto.clone()),
            JsVariant::Null => None,
            _ => return Ok(JsValue::undefined()),
        };

        // 3. If Type(O) is not Object, return undefined.
        let JsVariant::Object(object) = this.variant() else {
            return Ok(JsValue::undefined());
        };

        // 4. Let status be ? O.[[SetPrototypeOf]](proto).
        let status =
            object.__set_prototype_of__(proto, &mut InternalMethodPropertyContext::new(context))?;

        // 5. If status is false, throw a TypeError exception.
        if !status {
            return Err(js_error!(TypeError: "__proto__ called on null or undefined"));
        }

        // 6. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `Object.prototype.__defineGetter__(prop, func)`
    ///
    /// Binds an object's property to a function to be called when that property is looked up.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.__defineGetter__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__defineGetter__
    pub fn legacy_define_getter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let getter = args.get_or_undefined(1);

        // 1. Let O be ? ToObject(this value).
        let obj = this.to_object(context)?;

        // 2. If IsCallable(getter) is false, throw a TypeError exception.
        if !getter.is_callable() {
            return Err(js_error!(TypeError:
                "Object.prototype.__defineGetter__: expected 'getter' to be a Function object",
            ));
        }

        // 3. Let desc be PropertyDescriptor { [[Get]]: getter, [[Enumerable]]: true, [[Configurable]]: true }.
        let desc = PropertyDescriptor::builder()
            .get(getter.clone())
            .enumerable(true)
            .configurable(true);

        // 4. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(0).to_property_key(context)?;

        // 5. Perform ? DefinePropertyOrThrow(O, key, desc).
        obj.define_property_or_throw(key, desc, context)?;

        // 6. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `Object.prototype.__defineSetter__(prop, func)`
    ///
    /// Binds an object's property to a function to be called when an attempt is made to set that property.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.__defineSetter__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__defineSetter__
    pub fn legacy_define_setter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let setter = args.get_or_undefined(1);

        // 1. Let O be ? ToObject(this value).
        let obj = this.to_object(context)?;

        // 2. If IsCallable(setter) is false, throw a TypeError exception.
        if !setter.is_callable() {
            return Err(js_error!(TypeError:
                "Object.prototype.__defineSetter__: expected 'setter' to be a Function object",
            ));
        }

        // 3. Let desc be PropertyDescriptor { [[Set]]: setter, [[Enumerable]]: true, [[Configurable]]: true }.
        let desc = PropertyDescriptor::builder()
            .set(setter.clone())
            .enumerable(true)
            .configurable(true);

        // 4. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(0).to_property_key(context)?;

        // 5. Perform ? DefinePropertyOrThrow(O, key, desc).
        obj.define_property_or_throw(key, desc, context)?;

        // 6. Return undefined.
        Ok(JsValue::undefined())
    }

    /// `Object.prototype.__lookupGetter__(prop)`
    ///
    /// Returns the function bound as a getter to the specified property.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.__lookupGetter__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__lookupGetter__
    pub fn legacy_lookup_getter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let mut obj = this.to_object(context)?;

        // 2. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(0).to_property_key(context)?;

        // 3. Repeat
        loop {
            // a. Let desc be ? O.[[GetOwnProperty]](key).

            let desc =
                obj.__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

            // b. If desc is not undefined, then
            if let Some(current_desc) = desc {
                // i. If IsAccessorDescriptor(desc) is true, return desc.[[Get]].
                return if current_desc.is_accessor_descriptor() {
                    Ok(current_desc.expect_get().clone())
                } else {
                    // ii. Return undefined.
                    Ok(JsValue::undefined())
                };
            }
            match obj.__get_prototype_of__(&mut InternalMethodPropertyContext::new(context))? {
                // c. Set O to ? O.[[GetPrototypeOf]]().
                Some(o) => obj = o,
                // d. If O is null, return undefined.
                None => return Ok(JsValue::undefined()),
            }
        }
    }
    /// `Object.prototype.__lookupSetter__(prop)`
    ///
    /// Returns the function bound as a getter to the specified property.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.__lookupSetter__
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__lookupSetter__
    pub fn legacy_lookup_setter(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be ? ToObject(this value).
        let mut obj = this.to_object(context)?;

        // 2. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(0).to_property_key(context)?;

        // 3. Repeat
        loop {
            // a. Let desc be ? O.[[GetOwnProperty]](key).

            let desc =
                obj.__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

            // b. If desc is not undefined, then
            if let Some(current_desc) = desc {
                // i. If IsAccessorDescriptor(desc) is true, return desc.[[Set]].
                return if current_desc.is_accessor_descriptor() {
                    Ok(current_desc.expect_set().clone())
                } else {
                    // ii. Return undefined.
                    Ok(JsValue::undefined())
                };
            }
            match obj.__get_prototype_of__(&mut InternalMethodPropertyContext::new(context))? {
                // c. Set O to ? O.[[GetPrototypeOf]]().
                Some(o) => obj = o,
                // d. If O is null, return undefined.
                None => return Ok(JsValue::undefined()),
            }
        }
    }

    /// `Object.create( proto, [propertiesObject] )`
    ///
    /// Creates a new object from the provided prototype.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.create
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
    pub fn create(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let prototype = args.get_or_undefined(0);
        let properties = args.get_or_undefined(1);

        let obj = match prototype.variant() {
            JsVariant::Object(_) | JsVariant::Null => {
                JsObject::from_proto_and_data_with_shared_shape(
                    context.root_shape(),
                    prototype.as_object(),
                    OrdinaryObject,
                )
                .upcast()
            }
            _ => {
                return Err(js_error!(TypeError:
                    "Object.create: expected 'proto' to be an Object or null, got `{}`",
                    prototype.type_of()
                ));
            }
        };

        if !properties.is_undefined() {
            object_define_properties(&obj, properties, context)?;
            return Ok(obj.into());
        }

        Ok(obj.into())
    }

    /// `Object.getOwnPropertyDescriptor( object, property )`
    ///
    /// Returns an object describing the configuration of a specific property on a given object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.getownpropertydescriptor
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor
    pub fn get_own_property_descriptor(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(O).
        let obj = args.get_or_undefined(0).to_object(context)?;

        // 2. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(1).to_property_key(context)?;

        // 3. Let desc be ? obj.[[GetOwnProperty]](key).

        let desc =
            obj.__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

        // 4. Return FromPropertyDescriptor(desc).
        Self::from_property_descriptor(desc, context)
    }

    /// `Object.getOwnPropertyDescriptors( object )`
    ///
    /// Returns all own property descriptors of a given object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.getownpropertydescriptors
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptors
    pub fn get_own_property_descriptors(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(O).
        let obj = args.get_or_undefined(0).to_object(context)?;

        // 2. Let ownKeys be ? obj.[[OwnPropertyKeys]]().
        let own_keys =
            obj.__own_property_keys__(&mut InternalMethodPropertyContext::new(context))?;

        // 3. Let descriptors be OrdinaryObjectCreate(%Object.prototype%).
        let descriptors = JsObject::with_object_proto(context.intrinsics());

        // 4. For each element key of ownKeys, do
        for key in own_keys {
            // a. Let desc be ? obj.[[GetOwnProperty]](key).

            let desc =
                obj.__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

            // b. Let descriptor be FromPropertyDescriptor(desc).
            let descriptor = Self::from_property_descriptor(desc, context)?;

            // c. If descriptor is not undefined,
            //    perform ! CreateDataPropertyOrThrow(descriptors, key, descriptor).
            if !descriptor.is_undefined() {
                descriptors
                    .create_data_property_or_throw(key, descriptor, context)
                    .js_expect("should not fail according to spec")?;
            }
        }

        // 5. Return descriptors.
        Ok(descriptors.into())
    }

    /// The abstract operation `FromPropertyDescriptor`.
    ///
    /// [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-frompropertydescriptor
    pub(crate) fn from_property_descriptor(
        desc: Option<PropertyDescriptor>,
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If Desc is undefined, return undefined.
        let Some(desc) = desc else {
            return Ok(JsValue::undefined());
        };

        // 2. Let obj be ! OrdinaryObjectCreate(%Object.prototype%).
        // 3. Assert: obj is an extensible ordinary object with no own properties.
        let obj = JsObject::with_object_proto(context.intrinsics());

        // 4. If Desc has a [[Value]] field, then
        if let Some(value) = desc.value() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "value", Desc.[[Value]]).
            obj.create_data_property_or_throw(js_string!("value"), value.clone(), context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 5. If Desc has a [[Writable]] field, then
        if let Some(writable) = desc.writable() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "writable", Desc.[[Writable]]).
            obj.create_data_property_or_throw(js_string!("writable"), writable, context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 6. If Desc has a [[Get]] field, then
        if let Some(get) = desc.get() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "get", Desc.[[Get]]).
            obj.create_data_property_or_throw(js_string!("get"), get.clone(), context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 7. If Desc has a [[Set]] field, then
        if let Some(set) = desc.set() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "set", Desc.[[Set]]).
            obj.create_data_property_or_throw(js_string!("set"), set.clone(), context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 8. If Desc has an [[Enumerable]] field, then
        if let Some(enumerable) = desc.enumerable() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "enumerable", Desc.[[Enumerable]]).
            obj.create_data_property_or_throw(js_string!("enumerable"), enumerable, context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 9. If Desc has a [[Configurable]] field, then
        if let Some(configurable) = desc.configurable() {
            // a. Perform ! CreateDataPropertyOrThrow(obj, "configurable", Desc.[[Configurable]]).
            obj.create_data_property_or_throw(js_string!("configurable"), configurable, context)
                .js_expect("CreateDataPropertyOrThrow cannot fail here")?;
        }

        // 10. Return obj.
        Ok(obj.into())
    }

    /// Uses the `SameValue` algorithm to check equality of objects
    pub fn is(_: &JsValue, args: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        let x = args.get_or_undefined(0);
        let y = args.get_or_undefined(1);

        Ok(JsValue::same_value(x, y).into())
    }

    /// Get the `prototype` of an object.
    ///
    /// [More information][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.setprototypeof
    pub fn get_prototype_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        if args.is_empty() {
            return Err(js_error!(TypeError:
                "Object.getPrototypeOf: At least 1 argument required, but only 0 passed",
            ));
        }

        // 1. Let obj be ? ToObject(O).
        let obj = args[0].clone().to_object(context)?;

        // 2. Return ? obj.[[GetPrototypeOf]]().
        Ok(obj
            .__get_prototype_of__(&mut InternalMethodPropertyContext::new(context))?
            .map_or(JsValue::null(), JsValue::new))
    }

    /// Set the `prototype` of an object.
    ///
    /// [More information][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.setprototypeof
    pub fn set_prototype_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        if args.len() < 2 {
            return Err(js_error!(TypeError:
                "Object prototype may only be an Object or null: {}",
                args.get(1).map_or_else(|| "undefined".to_string(), |v| v.display().to_string())
            ));
        }

        // 1. Set O to ? RequireObjectCoercible(O).
        let o = args
            .first()
            .cloned()
            .unwrap_or_default()
            .require_object_coercible()?
            .clone();

        let proto = match args.get_or_undefined(1).variant() {
            JsVariant::Object(obj) => Some(obj.clone()),
            JsVariant::Null => None,
            // 2. If Type(proto) is neither Object nor Null, throw a TypeError exception.
            val => {
                return Err(js_error!(TypeError:
                    "Object.setPrototypeOf: expected 'proto' to be an Object or null, got `{}`",
                    val.type_of()
                ));
            }
        };

        let Some(obj) = o.as_object() else {
            // 3. If Type(O) is not Object, return O.
            return Ok(o);
        };

        // 4. Let status be ? O.[[SetPrototypeOf]](proto).
        let status =
            obj.__set_prototype_of__(proto, &mut InternalMethodPropertyContext::new(context))?;

        if !status {
            return Err(js_error!(TypeError: "can't set prototype of this object"));
        }

        // 6. Return O.
        Ok(o)
    }

    /// `Object.prototype.isPrototypeOf( proto )`
    ///
    /// Check whether or not an object exists within another object's prototype chain.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.isprototypeof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isPrototypeOf
    pub fn is_prototype_of(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let v = args.get_or_undefined(0);
        if !v.is_object() {
            return Ok(JsValue::new(false));
        }
        let mut v = v.clone();
        let o = JsValue::new(this.to_object(context)?);
        loop {
            v = Self::get_prototype_of(this, &[v], context)?;
            if v.is_null() {
                return Ok(JsValue::new(false));
            }
            if JsValue::same_value(&o, &v) {
                return Ok(JsValue::new(true));
            }
        }
    }

    /// Define a property in an object
    pub fn define_property(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        if let Some(object) = args.get_or_undefined(0).as_object() {
            let key = args
                .get(1)
                .unwrap_or(&JsValue::undefined())
                .to_property_key(context)?;
            let desc = args
                .get(2)
                .unwrap_or(&JsValue::undefined())
                .to_property_descriptor(context)?;

            object.define_property_or_throw(key, desc, context)?;

            Ok(object.clone().into())
        } else {
            Err(js_error!(TypeError: "Object.defineProperty: expected 'this' to be an Object"))
        }
    }

    /// `Object.defineProperties( proto, [propertiesObject] )`
    ///
    /// Creates or update own properties to the object
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.defineproperties
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/defineProperties
    pub fn define_properties(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let arg = args.get_or_undefined(0);
        if let Some(obj) = arg.as_object() {
            let props = args.get_or_undefined(1);
            object_define_properties(&obj, props, context)?;
            Ok(arg.clone())
        } else {
            Err(js_error!(TypeError: "Object.defineProperties: expected 'this' to be an Object"))
        }
    }

    /// `Object.prototype.valueOf()`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.valueof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/valueOf
    pub fn value_of(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Return ? ToObject(this value).
        Ok(this.to_object(context)?.into())
    }

    /// `Object.prototype.toString()`
    ///
    /// This method returns a string representing the object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.tostring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toString
    #[allow(clippy::wrong_self_convention)]
    pub fn to_string(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. If the this value is undefined, return "[object Undefined]".
        if this.is_undefined() {
            return Ok(js_string!("[object Undefined]").into());
        }
        // 2. If the this value is null, return "[object Null]".
        if this.is_null() {
            return Ok(js_string!("[object Null]").into());
        }
        // 3. Let O be ! ToObject(this value).
        let o = this
            .to_object(context)
            .js_expect("toObject cannot fail here")?;

        //  4. Let isArray be ? IsArray(O).
        //  5. If isArray is true, let builtinTag be "Array".
        let builtin_tag = if o.is_array_abstract()? {
            js_str!("Array")
        } else if o.is::<UnmappedArguments>() || o.is::<MappedArguments>() {
            // 6. Else if O has a [[ParameterMap]] internal slot, let builtinTag be "Arguments".
            js_str!("Arguments")
        } else if o.is_callable() {
            // 7. Else if O has a [[Call]] internal method, let builtinTag be "Function".
            js_str!("Function")
        } else if o.is::<Error>() {
            // 8. Else if O has an [[ErrorData]] internal slot, let builtinTag be "Error".
            js_str!("Error")
        } else if o.is::<bool>() {
            // 9. Else if O has a [[BooleanData]] internal slot, let builtinTag be "Boolean".
            js_str!("Boolean")
        } else if o.is::<f64>() {
            // 10. Else if O has a [[NumberData]] internal slot, let builtinTag be "Number".
            js_str!("Number")
        } else if o.is::<JsString>() {
            // 11. Else if O has a [[StringData]] internal slot, let builtinTag be "String".
            js_str!("String")
        } else if o.is::<Date>() {
            // 12. Else if O has a [[DateValue]] internal slot, let builtinTag be "Date".
            js_str!("Date")
        } else if o.is::<RegExp>() {
            // 13. Else if O has a [[RegExpMatcher]] internal slot, let builtinTag be "RegExp".
            js_str!("RegExp")
        } else {
            // 14. Else, let builtinTag be "Object".
            js_str!("Object")
        };

        // 15. Let tag be ? Get(O, @@toStringTag).
        let tag = o.get(JsSymbol::to_string_tag(), context)?;

        // 16. If Type(tag) is not String, set tag to builtinTag.
        let tag = tag.as_string();
        let tag = tag.as_ref().map_or(builtin_tag, JsString::as_str);

        // 17. Return the string-concatenation of "[object ", tag, and "]".
        Ok(js_string!(js_str!("[object "), tag, js_str!("]")).into())
    }

    /// `Object.prototype.toLocaleString( [ reserved1 [ , reserved2 ] ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.tolocalestring
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/toLocaleString
    #[allow(clippy::wrong_self_convention)]
    pub fn to_locale_string(
        this: &JsValue,
        _: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Return ? Invoke(O, "toString").
        this.invoke(js_string!("toString"), &[], context)
    }

    /// `Object.prototype.hasOwnProperty( property )`
    ///
    /// The method returns a boolean indicating whether the object has the specified property
    /// as its own property (as opposed to inheriting it).
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.hasownproperty
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty
    pub fn has_own_property(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let P be ? ToPropertyKey(V).
        let key = args.get_or_undefined(0).to_property_key(context)?;

        // 2. Let O be ? ToObject(this value).
        let object = this.to_object(context)?;

        // 3. Return ? HasOwnProperty(O, P).
        Ok(object.has_own_property(key, context)?.into())
    }

    /// `Object.prototype.propertyIsEnumerable( property )`
    ///
    /// This method returns a Boolean indicating whether the specified property is
    /// enumerable and is the object's own property.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.prototype.propertyisenumerable
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/propertyIsEnumerable
    pub fn property_is_enumerable(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let Some(key) = args.first() else {
            return Ok(JsValue::new(false));
        };

        let key = key.to_property_key(context)?;

        let own_prop = this
            .to_object(context)?
            .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?;

        own_prop
            .as_ref()
            .and_then(PropertyDescriptor::enumerable)
            .unwrap_or_default()
            .conv::<JsValue>()
            .pipe(Ok)
    }

    /// `Object.assign( target, ...sources )`
    ///
    /// This method copies all enumerable own properties from one or more
    /// source objects to a target object. It returns the target object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.assign
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
    pub fn assign(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let to be ? ToObject(target).
        let to = args.get_or_undefined(0).to_object(context)?;

        // 2. If only one argument was passed, return to.
        if args.len() == 1 {
            return Ok(to.into());
        }

        // 3. For each element nextSource of sources, do
        for source in &args[1..] {
            // 3.a. If nextSource is neither undefined nor null, then
            if !source.is_null_or_undefined() {
                // 3.a.i. Let from be ! ToObject(nextSource).
                let from = source
                    .to_object(context)
                    .js_expect("this ToObject call must not fail")?;
                // 3.a.ii. Let keys be ? from.[[OwnPropertyKeys]]().
                let keys =
                    from.__own_property_keys__(&mut InternalMethodPropertyContext::new(context))?;
                // 3.a.iii. For each element nextKey of keys, do
                for key in keys {
                    // 3.a.iii.1. Let desc be ? from.[[GetOwnProperty]](nextKey).

                    if let Some(desc) = from.__get_own_property__(
                        &key,
                        &mut InternalMethodPropertyContext::new(context),
                    )? {
                        // 3.a.iii.2. If desc is not undefined and desc.[[Enumerable]] is true, then
                        if desc.expect_enumerable() {
                            // 3.a.iii.2.a. Let propValue be ? Get(from, nextKey).
                            let property = from.get(key.clone(), context)?;
                            // 3.a.iii.2.b. Perform ? Set(to, nextKey, propValue, true).
                            to.set(key, property, true, context)?;
                        }
                    }
                }
            }
        }

        // 4. Return to.
        Ok(to.into())
    }

    /// `Object.keys( target )`
    ///
    /// This method returns an array of a given object's own enumerable
    /// property names, iterated in the same order that a normal loop would.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.keys
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
    pub fn keys(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(target).
        let obj = args
            .first()
            .cloned()
            .unwrap_or_default()
            .to_object(context)?;

        // 2. Let nameList be ? EnumerableOwnPropertyNames(obj, key).
        let name_list = obj.enumerable_own_property_names(PropertyNameKind::Key, context)?;

        // 3. Return CreateArrayFromList(nameList).
        let result = Array::create_array_from_list(name_list, context);

        Ok(result.into())
    }

    /// `Object.values( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.values
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/values
    pub fn values(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(target).
        let obj = args
            .first()
            .cloned()
            .unwrap_or_default()
            .to_object(context)?;

        // 2. Let nameList be ? EnumerableOwnPropertyNames(obj, value).
        let name_list = obj.enumerable_own_property_names(PropertyNameKind::Value, context)?;

        // 3. Return CreateArrayFromList(nameList).
        let result = Array::create_array_from_list(name_list, context);

        Ok(result.into())
    }

    /// `Object.entries( target )`
    ///
    /// This method returns an array of a given object's own enumerable string-keyed property [key, value] pairs.
    /// This is the same as iterating with a for...in loop,
    /// except that a for...in loop enumerates properties in the prototype chain as well).
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.entries
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
    pub fn entries(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(target).
        let obj = args
            .first()
            .cloned()
            .unwrap_or_default()
            .to_object(context)?;

        // 2. Let nameList be ? EnumerableOwnPropertyNames(obj, key+value).
        let name_list =
            obj.enumerable_own_property_names(PropertyNameKind::KeyAndValue, context)?;

        // 3. Return CreateArrayFromList(nameList).
        let result = Array::create_array_from_list(name_list, context);

        Ok(result.into())
    }

    /// `Object.seal( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.seal
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/seal
    pub fn seal(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        if let Some(o) = o.as_object() {
            // 2. Let status be ? SetIntegrityLevel(O, sealed).
            let status = o.set_integrity_level(IntegrityLevel::Sealed, context)?;
            // 3. If status is false, throw a TypeError exception.
            if !status {
                return Err(js_error!(TypeError: "cannot seal object"));
            }
        }
        // 1. If Type(O) is not Object, return O.
        // 4. Return O.
        Ok(o.clone())
    }

    /// `Object.isSealed( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.issealed
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isSealed
    pub fn is_sealed(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        // 1. If Type(O) is not Object, return true.
        // 2. Return ? TestIntegrityLevel(O, sealed).
        if let Some(o) = o.as_object() {
            Ok(o.test_integrity_level(IntegrityLevel::Sealed, context)?
                .into())
        } else {
            Ok(JsValue::new(true))
        }
    }

    /// `Object.freeze( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.freeze
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze
    pub fn freeze(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        if let Some(o) = o.as_object() {
            // 2. Let status be ? SetIntegrityLevel(O, frozen).
            let status = o.set_integrity_level(IntegrityLevel::Frozen, context)?;
            // 3. If status is false, throw a TypeError exception.
            if !status {
                return Err(js_error!(TypeError: "cannot freeze object"));
            }
        }
        // 1. If Type(O) is not Object, return O.
        // 4. Return O.
        Ok(o.clone())
    }

    /// `Object.isFrozen( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.isfrozen
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isFrozen
    pub fn is_frozen(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        // 1. If Type(O) is not Object, return true.
        // 2. Return ? TestIntegrityLevel(O, frozen).
        if let Some(o) = o.as_object() {
            Ok(o.test_integrity_level(IntegrityLevel::Frozen, context)?
                .into())
        } else {
            Ok(JsValue::new(true))
        }
    }

    /// `Object.preventExtensions( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.preventextensions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/preventExtensions
    pub fn prevent_extensions(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);

        if let Some(o) = o.as_object() {
            // 2. Let status be ? O.[[PreventExtensions]]().
            let status =
                o.__prevent_extensions__(&mut InternalMethodPropertyContext::new(context))?;
            // 3. If status is false, throw a TypeError exception.
            if !status {
                return Err(js_error!(TypeError: "cannot prevent extensions"));
            }
        }
        // 1. If Type(O) is not Object, return O.
        // 4. Return O.
        Ok(o.clone())
    }

    /// `Object.isExtensible( target )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.isextensible
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isExtensible
    pub fn is_extensible(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let o = args.get_or_undefined(0);
        // 1. If Type(O) is not Object, return false.
        if let Some(o) = o.as_object() {
            // 2. Return ? IsExtensible(O).
            Ok(o.is_extensible(context)?.into())
        } else {
            Ok(JsValue::new(false))
        }
    }

    /// `Object.getOwnPropertyNames( object )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.getownpropertynames
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyNames
    pub fn get_own_property_names(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Return ? GetOwnPropertyKeys(O, string).
        let o = args.get_or_undefined(0);
        get_own_property_keys(o, PropertyKeyType::String, context)
    }

    /// `Object.getOwnPropertySymbols( object )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.getownpropertysymbols
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertySymbols
    pub fn get_own_property_symbols(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Return ? GetOwnPropertyKeys(O, symbol).
        let o = args.get_or_undefined(0);
        get_own_property_keys(o, PropertyKeyType::Symbol, context)
    }

    /// `Object.hasOwn( object, property )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.hasown
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwn
    pub fn has_own(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let obj be ? ToObject(O).
        let obj = args.get_or_undefined(0).to_object(context)?;

        // 2. Let key be ? ToPropertyKey(P).
        let key = args.get_or_undefined(1).to_property_key(context)?;

        // 3. Return ? HasOwnProperty(obj, key).
        Ok(obj.has_own_property(key, context)?.into())
    }

    /// `Object.fromEntries( iterable )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.fromentries
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/fromEntries
    pub fn from_entries(_: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Perform ? RequireObjectCoercible(iterable).
        let iterable = args.get_or_undefined(0).require_object_coercible()?;

        // 2. Let obj be ! OrdinaryObjectCreate(%Object.prototype%).
        // 3. Assert: obj is an extensible ordinary object with no own properties.
        let obj = JsObject::with_object_proto(context.intrinsics());

        // 4. Let closure be a new Abstract Closure with parameters (key, value) that captures
        // obj and performs the following steps when called:
        let closure = FunctionObjectBuilder::new(
            context.realm(),
            NativeFunction::from_copy_closure_with_captures(
                |_, args, obj, context| {
                    let key = args.get_or_undefined(0);
                    let value = args.get_or_undefined(1);

                    // a. Let propertyKey be ? ToPropertyKey(key).
                    let property_key = key.to_property_key(context)?;

                    // b. Perform ! CreateDataPropertyOrThrow(obj, propertyKey, value).
                    obj.create_data_property_or_throw(property_key, value.clone(), context)?;

                    // c. Return undefined.
                    Ok(JsValue::undefined())
                },
                obj.clone(),
            ),
        );

        // 5. Let adder be ! CreateBuiltinFunction(closure, 2, "", « »).
        let adder = closure.length(2).name("").build();

        // 6. Return ? AddEntriesFromIterable(obj, iterable, adder).
        map::add_entries_from_iterable(&obj, iterable, &adder, context)
    }

    /// [`Object.groupBy ( items, callbackfn )`][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-object.groupby
    pub(crate) fn group_by(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        use std::hash::BuildHasherDefault;

        use indexmap::IndexMap;
        use rustc_hash::FxHasher;

        use crate::builtins::{Number, iterable::if_abrupt_close_iterator};

        let items = args.get_or_undefined(0);
        let callback = args.get_or_undefined(1);
        // 1. Let groups be ? GroupBy(items, callbackfn, property).

        // `GroupBy`
        // https://tc39.es/ecma262/#sec-groupby
        // inlined to change the key type.

        // 1. Perform ? RequireObjectCoercible(items).
        items.require_object_coercible()?;

        // 2. If IsCallable(callbackfn) is false, throw a TypeError exception.
        let callback = callback
            .as_callable()
            .ok_or_else(|| js_error!(TypeError: "callback must be a callable object"))?;

        // 3. Let groups be a new empty List.
        let mut groups: IndexMap<PropertyKey, Vec<JsValue>, BuildHasherDefault<FxHasher>> =
            IndexMap::default();

        // 4. Let iteratorRecord be ? GetIterator(items, sync).
        let mut iterator = items.get_iterator(IteratorHint::Sync, context)?;

        // 5. Let k be 0.
        let mut k = 0u64;

        // 6. Repeat,
        loop {
            // a. If k ≥ 2^53 - 1, then
            if k >= Number::MAX_SAFE_INTEGER as u64 {
                // i. Let error be ThrowCompletion(a newly created TypeError object).
                let error = js_error!(TypeError: "exceeded maximum safe integer");

                // ii. Return ? IteratorClose(iteratorRecord, error).
                return iterator.close(Err(error), context);
            }

            // b. Let next be ? IteratorStepValue(iteratorRecord).
            let Some(next) = iterator.step_value(context)? else {
                // c. If next is false, then
                // i. Return groups.
                break;
            };

            // d. Let value be next.
            let value = next;

            // e. Let key be Completion(Call(callbackfn, undefined, « value, 𝔽(k) »)).
            let key = callback.call(&JsValue::undefined(), &[value.clone(), k.into()], context);

            // f. IfAbruptCloseIterator(key, iteratorRecord).
            let key = if_abrupt_close_iterator!(key, iterator, context);

            // g. If keyCoercion is property, then
            //     i. Set key to Completion(ToPropertyKey(key)).
            let key = key.to_property_key(context);

            //     ii. IfAbruptCloseIterator(key, iteratorRecord).
            let key = if_abrupt_close_iterator!(key, iterator, context);

            // i. Perform AddValueToKeyedGroup(groups, key, value).
            groups.entry(key).or_default().push(value);

            // j. Set k to k + 1.
            k += 1;
        }

        // 2. Let obj be OrdinaryObjectCreate(null).
        let obj = JsObject::with_null_proto();

        // 3. For each Record { [[Key]], [[Elements]] } g of groups, do
        for (key, elements) in groups {
            // a. Let elements be CreateArrayFromList(g.[[Elements]]).
            let elements = Array::create_array_from_list(elements, context);

            // b. Perform ! CreateDataPropertyOrThrow(obj, g.[[Key]], elements).
            obj.create_data_property_or_throw(key, elements, context)
                .js_expect("cannot fail for a newly created object")?;
        }

        // 4. Return obj.
        Ok(obj.into())
    }
}

/// The abstract operation `ObjectDefineProperties`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-object.defineproperties
fn object_define_properties(
    object: &JsObject,
    props: &JsValue,
    context: &mut Context,
) -> JsResult<()> {
    // 1. Assert: Type(O) is Object.
    // 2. Let props be ? ToObject(Properties).
    let props = &props.to_object(context)?;

    // 3. Let keys be ? props.[[OwnPropertyKeys]]().
    let keys = props.__own_property_keys__(&mut InternalMethodPropertyContext::new(context))?;

    // 4. Let descriptors be a new empty List.
    let mut descriptors: Vec<(PropertyKey, PropertyDescriptor)> = Vec::new();

    // 5. For each element nextKey of keys, do
    for next_key in keys {
        // a. Let propDesc be ? props.[[GetOwnProperty]](nextKey).
        // b. If propDesc is not undefined and propDesc.[[Enumerable]] is true, then

        if let Some(prop_desc) = props
            .__get_own_property__(&next_key, &mut InternalMethodPropertyContext::new(context))?
            && prop_desc.expect_enumerable()
        {
            // i. Let descObj be ? Get(props, nextKey).
            let desc_obj = props.get(next_key.clone(), context)?;

            // ii. Let desc be ? ToPropertyDescriptor(descObj).
            let desc = desc_obj.to_property_descriptor(context)?;

            // iii. Append the pair (a two element List) consisting of nextKey and desc to the end of descriptors.
            descriptors.push((next_key, desc));
        }
    }

    // 6. For each element pair of descriptors, do
    // a. Let P be the first element of pair.
    // b. Let desc be the second element of pair.
    for (p, d) in descriptors {
        // c. Perform ? DefinePropertyOrThrow(O, P, desc).
        object.define_property_or_throw(p, d, context)?;
    }

    // 7. Return O.
    Ok(())
}

/// Type enum used in the abstract operation `GetOwnPropertyKeys`.
#[derive(Debug, Copy, Clone)]
enum PropertyKeyType {
    String,
    Symbol,
}

/// The abstract operation `GetOwnPropertyKeys`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-getownpropertykeys
fn get_own_property_keys(
    o: &JsValue,
    r#type: PropertyKeyType,
    context: &mut Context,
) -> JsResult<JsValue> {
    // 1. Let obj be ? ToObject(o).
    let obj = o.to_object(context)?;

    // 2. Let keys be ? obj.[[OwnPropertyKeys]]().
    let keys = obj.__own_property_keys__(&mut InternalMethodPropertyContext::new(context))?;

    // 3. Let nameList be a new empty List.
    // 4. For each element nextKey of keys, do
    let name_list = keys.iter().filter_map(|next_key| {
        // a. If Type(nextKey) is Symbol and type is symbol or Type(nextKey) is String and type is string, then
        // i. Append nextKey as the last element of nameList.
        match (r#type, &next_key) {
            (PropertyKeyType::String, PropertyKey::String(_))
            | (PropertyKeyType::Symbol, PropertyKey::Symbol(_)) => Some(next_key.into()),
            (PropertyKeyType::String, PropertyKey::Index(index)) => {
                Some(js_string!(index.get()).into())
            }
            _ => None,
        }
    });

    // 5. Return CreateArrayFromList(nameList).
    Ok(Array::create_array_from_list(name_list, context).into())
}
