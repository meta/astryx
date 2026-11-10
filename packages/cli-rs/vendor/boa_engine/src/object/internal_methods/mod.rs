//! This module defines the object internal methods.
//!
//! More information:
//!  - [ECMAScript reference][spec]
//!
//! [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots

use std::ops::{Deref, DerefMut};

use super::{
    JsPrototype, PROTOTYPE,
    shape::slot::{Slot, SlotAttributes},
};
use crate::{
    Context, JsNativeError, JsResult,
    context::intrinsics::{StandardConstructor, StandardConstructors},
    object::JsObject,
    property::{DescriptorKind, PropertyDescriptor, PropertyKey},
    value::JsValue,
    vm::source_info::NativeSourceInfo,
};

pub(crate) mod immutable_prototype;
pub(crate) mod string;

/// A lightweight wrapper around [`Context`] used in [`InternalObjectMethods`].
#[derive(Debug)]
pub(crate) struct InternalMethodPropertyContext<'ctx> {
    context: &'ctx mut Context,
    slot: Slot,
}

impl<'ctx> InternalMethodPropertyContext<'ctx> {
    /// Create a new [`InternalMethodPropertyContext`].
    pub(crate) fn new(context: &'ctx mut Context) -> Self {
        Self {
            context,
            slot: Slot::new(),
        }
    }

    /// Gets the [`Slot`] associated with this [`InternalMethodPropertyContext`].
    #[inline]
    pub(crate) fn slot(&mut self) -> &mut Slot {
        &mut self.slot
    }
}

impl Deref for InternalMethodPropertyContext<'_> {
    type Target = Context;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.context
    }
}

impl DerefMut for InternalMethodPropertyContext<'_> {
    #[inline]
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.context
    }
}

impl<'context> From<&'context mut Context> for InternalMethodPropertyContext<'context> {
    #[inline]
    fn from(context: &'context mut Context) -> Self {
        Self::new(context)
    }
}

/// A lightweight wrapper around [`Context`] used in internal call methods.
#[derive(Debug)]
pub(crate) struct InternalMethodCallContext<'ctx> {
    context: &'ctx mut Context,
    native_source_info: NativeSourceInfo,
}

impl<'ctx> InternalMethodCallContext<'ctx> {
    /// Create a new [`InternalMethodCallContext`].
    #[inline]
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub(crate) fn new(context: &'ctx mut Context) -> Self {
        Self {
            context,
            native_source_info: NativeSourceInfo::caller(),
        }
    }

    /// Create a new [`InternalMethodCallContext`].
    #[inline]
    pub(crate) fn with_native_source_info(
        context: &'ctx mut Context,
        native_source_info: NativeSourceInfo,
    ) -> Self {
        Self {
            context,
            native_source_info,
        }
    }

    #[inline]
    pub(crate) fn context(&mut self) -> &mut Context {
        self.context
    }

    #[inline]
    pub(crate) fn native_source_info(&self) -> NativeSourceInfo {
        self.native_source_info
    }
}

impl Deref for InternalMethodCallContext<'_> {
    type Target = Context;

    #[inline]
    fn deref(&self) -> &Self::Target {
        self.context
    }
}

impl DerefMut for InternalMethodCallContext<'_> {
    #[inline]
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.context
    }
}

impl<'context> From<&'context mut Context> for InternalMethodCallContext<'context> {
    #[inline]
    fn from(context: &'context mut Context) -> Self {
        Self::new(context)
    }
}

impl JsObject {
    /// Internal method `[[GetPrototypeOf]]`
    ///
    /// Return either the prototype of this object or null.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getprototypeof
    #[track_caller]
    pub(crate) fn __get_prototype_of__(&self, context: &mut Context) -> JsResult<JsPrototype> {
        (self.vtable().__get_prototype_of__)(self, context)
    }

    /// Internal method `[[SetPrototypeOf]]`
    ///
    /// Set the property of a specified object to another object or `null`.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-setprototypeof-v
    pub(crate) fn __set_prototype_of__(
        &self,
        val: JsPrototype,
        context: &mut Context,
    ) -> JsResult<bool> {
        (self.vtable().__set_prototype_of__)(self, val, context)
    }

    /// Internal method `[[IsExtensible]]`
    ///
    /// Check if the object is extensible.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-isextensible
    pub(crate) fn __is_extensible__(&self, context: &mut Context) -> JsResult<bool> {
        (self.vtable().__is_extensible__)(self, context)
    }

    /// Internal method `[[PreventExtensions]]`
    ///
    /// Disable extensibility for this object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-preventextensions
    pub(crate) fn __prevent_extensions__(&self, context: &mut Context) -> JsResult<bool> {
        (self.vtable().__prevent_extensions__)(self, context)
    }

    /// Internal method `[[GetOwnProperty]]`
    ///
    /// Get the specified property of this object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-getownproperty-p
    pub(crate) fn __get_own_property__(
        &self,
        key: &PropertyKey,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<Option<PropertyDescriptor>> {
        (self.vtable().__get_own_property__)(self, key, context)
    }

    /// Internal method `[[DefineOwnProperty]]`
    ///
    /// Define a new property of this object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-defineownproperty-p-desc
    pub(crate) fn __define_own_property__(
        &self,
        key: &PropertyKey,
        desc: PropertyDescriptor,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool> {
        (self.vtable().__define_own_property__)(self, key, desc, context)
    }

    /// Internal method `[[hasProperty]]`.
    ///
    /// Check if the object or its prototype has the required property.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-hasproperty-p
    pub(crate) fn __has_property__(
        &self,
        key: &PropertyKey,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool> {
        (self.vtable().__has_property__)(self, key, context)
    }

    /// Internal optimization method.
    ///
    /// This method combines the internal methods `[[hasProperty]]` and `[[Get]]`.
    ///
    /// More information:
    ///  - [ECMAScript reference hasProperty][spec0]
    ///  - [ECMAScript reference get][spec1]
    ///
    /// [spec0]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-hasproperty-p
    /// [spec1]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-get-p-receiver
    pub(crate) fn __try_get__(
        &self,
        key: &PropertyKey,
        receiver: JsValue,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<Option<JsValue>> {
        (self.vtable().__try_get__)(self, key, receiver, context)
    }

    /// Internal method `[[Get]]`
    ///
    /// Get the specified property of this object or its prototype.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-get-p-receiver
    pub(crate) fn __get__(
        &self,
        key: &PropertyKey,
        receiver: JsValue,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<JsValue> {
        (self.vtable().__get__)(self, key, receiver, context)
    }

    /// Internal method `[[Set]]`
    ///
    /// Set the specified property of this object or its prototype to the provided value.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-set-p-v-receiver
    pub(crate) fn __set__(
        &self,
        key: PropertyKey,
        value: JsValue,
        receiver: JsValue,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool> {
        (self.vtable().__set__)(self, key, value, receiver, context)
    }

    /// Internal method `[[Delete]]`
    ///
    /// Delete the specified own property of this object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-delete-p
    pub(crate) fn __delete__(
        &self,
        key: &PropertyKey,
        context: &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool> {
        (self.vtable().__delete__)(self, key, context)
    }

    /// Internal method `[[OwnPropertyKeys]]`
    ///
    /// Get all the keys of the properties of this object.
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ordinary-object-internal-methods-and-internal-slots-ownpropertykeys
    #[track_caller]
    pub(crate) fn __own_property_keys__(
        &self,
        context: &mut Context,
    ) -> JsResult<Vec<PropertyKey>> {
        (self.vtable().__own_property_keys__)(self, context)
    }

    /// Internal method `[[Call]]`
    ///
    /// The caller must ensure that the following values are pushed on the stack.
    ///
    /// Stack: `this, function, arg0, arg1, ..., argN`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ecmascript-function-objects-call-thisargument-argumentslist
    #[track_caller]
    pub(crate) fn __call__(&self, argument_count: usize) -> CallValue {
        CallValue::Pending {
            func: self.vtable().__call__,
            object: self.clone(),
            argument_count,
            native_source_info: NativeSourceInfo::caller(),
        }
    }

    /// Internal method `[[Construct]]`
    ///
    /// The caller must ensure that the following values are pushed on the stack.
    ///
    /// Stack: `function, arg0, arg1, ..., argN, new.target`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-ecmascript-function-objects-construct-argumentslist-newtarget
    #[track_caller]
    pub(crate) fn __construct__(&self, argument_count: usize) -> CallValue {
        CallValue::Pending {
            func: self.vtable().__construct__,
            object: self.clone(),
            argument_count,
            native_source_info: NativeSourceInfo::caller(),
        }
    }
}

/// Definitions of the internal object methods for ordinary objects.
///
/// If you want to implement an exotic object, create a new `static InternalObjectMethods`
/// overriding the desired internal methods with the definitions of the spec
/// and set all other methods to the default ordinary values, if necessary.
///
/// E.g. `string::STRING_EXOTIC_INTERNAL_METHODS`
///
/// Then, reference this static in the creation phase of an `ObjectData`.
///
/// E.g. `ObjectData::string`
pub(crate) const ORDINARY_INTERNAL_METHODS: InternalObjectMethods = InternalObjectMethods {
    __get_prototype_of__: ordinary_get_prototype_of,
    __set_prototype_of__: ordinary_set_prototype_of,
    __is_extensible__: ordinary_is_extensible,
    __prevent_extensions__: ordinary_prevent_extensions,
    __get_own_property__: ordinary_get_own_property,
    __define_own_property__: ordinary_define_own_property,
    __has_property__: ordinary_has_property,
    __try_get__: ordinary_try_get,
    __get__: ordinary_get,
    __set__: ordinary_set,
    __delete__: ordinary_delete,
    __own_property_keys__: ordinary_own_property_keys,
    __call__: non_existent_call,
    __construct__: non_existent_construct,
};

/// The internal representation of the internal methods of a `JsObject`.
///
/// This struct allows us to dynamically dispatch exotic objects with their
/// exclusive definitions of the internal methods, without having to
/// resort to `dyn Object`.
///
/// For a guide on how to implement exotic internal methods, see `ORDINARY_INTERNAL_METHODS`.
#[derive(Debug, Clone, Copy)]
#[allow(clippy::type_complexity, clippy::struct_field_names)]
pub struct InternalObjectMethods {
    pub(crate) __get_prototype_of__: fn(&JsObject, &mut Context) -> JsResult<JsPrototype>,
    pub(crate) __set_prototype_of__: fn(&JsObject, JsPrototype, &mut Context) -> JsResult<bool>,
    pub(crate) __is_extensible__: fn(&JsObject, &mut Context) -> JsResult<bool>,
    pub(crate) __prevent_extensions__: fn(&JsObject, &mut Context) -> JsResult<bool>,
    pub(crate) __get_own_property__: fn(
        &JsObject,
        &PropertyKey,
        &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<Option<PropertyDescriptor>>,
    pub(crate) __define_own_property__: fn(
        &JsObject,
        &PropertyKey,
        PropertyDescriptor,
        &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool>,
    pub(crate) __has_property__:
        fn(&JsObject, &PropertyKey, &mut InternalMethodPropertyContext<'_>) -> JsResult<bool>,
    pub(crate) __get__: fn(
        &JsObject,
        &PropertyKey,
        JsValue,
        &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<JsValue>,
    pub(crate) __try_get__: fn(
        &JsObject,
        &PropertyKey,
        JsValue,
        &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<Option<JsValue>>,
    pub(crate) __set__: fn(
        &JsObject,
        PropertyKey,
        JsValue,
        JsValue,
        &mut InternalMethodPropertyContext<'_>,
    ) -> JsResult<bool>,
    pub(crate) __delete__:
        fn(&JsObject, &PropertyKey, &mut InternalMethodPropertyContext<'_>) -> JsResult<bool>,
    pub(crate) __own_property_keys__:
        fn(&JsObject, context: &mut Context) -> JsResult<Vec<PropertyKey>>,
    pub(crate) __call__: fn(
        &JsObject,
        argument_count: usize,
        context: &mut InternalMethodCallContext<'_>,
    ) -> JsResult<CallValue>,
    pub(crate) __construct__: fn(
        &JsObject,
        argument_count: usize,
        context: &mut InternalMethodCallContext<'_>,
    ) -> JsResult<CallValue>,
}

/// The return value of an internal method (`[[Call]]` or `[[Construct]]`).
///
/// This is done to avoid recursion.
#[allow(variant_size_differences)]
pub(crate) enum CallValue {
    /// Calling is ready, the frames have been setup.
    ///
    /// Requires calling [`Context::run()`].
    Ready,

    /// Further processing is needed.
    Pending {
        func: fn(
            &JsObject,
            argument_count: usize,
            context: &mut InternalMethodCallContext<'_>,
        ) -> JsResult<CallValue>,
        object: JsObject,
        argument_count: usize,
        native_source_info: NativeSourceInfo,
    },

    /// The value has been computed and is the first element on the stack.
    Complete,
}

impl CallValue {
    /// Resolves the [`CallValue`], and return if the value is complete.
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    pub(crate) fn resolve(mut self, context: &mut Context) -> JsResult<bool> {
        loop {
            match self {
                CallValue::Ready => return Ok(false),
                CallValue::Complete => return Ok(true),
                CallValue::Pending {
                    func,
                    object,
                    argument_count,
                    native_source_info,
                } => {
                    self = func(
                        &object,
                        argument_count,
                        &mut InternalMethodCallContext::with_native_source_info(
                            context,
                            native_source_info,
                        ),
                    )?;
                }
            }
        }
    }
}

/// Abstract operation `OrdinaryGetPrototypeOf`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarygetprototypeof
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_get_prototype_of(
    obj: &JsObject,
    _context: &mut Context,
) -> JsResult<JsPrototype> {
    // 1. Return O.[[Prototype]].
    Ok(obj.prototype().clone())
}

/// Abstract operation `OrdinarySetPrototypeOf`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarysetprototypeof
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_set_prototype_of(
    obj: &JsObject,
    val: JsPrototype,
    _: &mut Context,
) -> JsResult<bool> {
    // 1. Assert: Either Type(V) is Object or Type(V) is Null.
    // 2. Let current be O.[[Prototype]].
    let current = obj.prototype();

    // 3. If SameValue(V, current) is true, return true.
    if val == current {
        return Ok(true);
    }

    // 4. Let extensible be O.[[Extensible]].
    // 5. If extensible is false, return false.
    if !obj.extensible() {
        return Ok(false);
    }

    // 6. Let p be V.
    let mut p = val.clone();

    // 7. Let done be false.
    // 8. Repeat, while done is false,
    // a. If p is null, set done to true.
    while let Some(proto) = p {
        // b. Else if SameValue(p, O) is true, return false.
        if &proto == obj {
            return Ok(false);
        }
        // c. Else,
        // i. If p.[[GetPrototypeOf]] is not the ordinary object internal method defined
        // in 10.1.1, set done to true.
        else if proto.vtable().__get_prototype_of__ as usize
            != ordinary_get_prototype_of as *const () as usize
        {
            break;
        }
        // ii. Else, set p to p.[[Prototype]].
        p = proto.prototype();
    }

    // 9. Set O.[[Prototype]] to V.
    obj.set_prototype(val);

    // 10. Return true.
    Ok(true)
}

/// Abstract operation `OrdinaryIsExtensible`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinaryisextensible
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_is_extensible(obj: &JsObject, _context: &mut Context) -> JsResult<bool> {
    // 1. Return O.[[Extensible]].
    Ok(obj.borrow().extensible)
}

/// Abstract operation `OrdinaryPreventExtensions`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarypreventextensions
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_prevent_extensions(
    obj: &JsObject,
    _context: &mut Context,
) -> JsResult<bool> {
    // 1. Set O.[[Extensible]] to false.
    obj.borrow_mut().extensible = false;

    // 2. Return true.
    Ok(true)
}

/// Abstract operation `OrdinaryGetOwnProperty`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarygetownproperty
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_get_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<PropertyDescriptor>> {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. If O does not have an own property with key P, return undefined.
    // 3. Let D be a newly created Property Descriptor with no fields.
    // 4. Let X be O's own property whose key is P.
    // 5. If X is a data property, then
    //      a. Set D.[[Value]] to the value of X's [[Value]] attribute.
    //      b. Set D.[[Writable]] to the value of X's [[Writable]] attribute.
    // 6. Else,
    //      a. Assert: X is an accessor property.
    //      b. Set D.[[Get]] to the value of X's [[Get]] attribute.
    //      c. Set D.[[Set]] to the value of X's [[Set]] attribute.
    // 7. Set D.[[Enumerable]] to the value of X's [[Enumerable]] attribute.
    // 8. Set D.[[Configurable]] to the value of X's [[Configurable]] attribute.
    // 9. Return D.
    Ok(obj.borrow().properties.get_with_slot(key, context.slot()))
}

/// Abstract operation `OrdinaryDefineOwnProperty`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarydefineownproperty
pub(crate) fn ordinary_define_own_property(
    obj: &JsObject,
    key: &PropertyKey,
    desc: PropertyDescriptor,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. Let current be ? O.[[GetOwnProperty]](P).
    let current = obj.__get_own_property__(key, context)?;

    // 2. Let extensible be ? IsExtensible(O).
    let extensible = obj.__is_extensible__(context)?;

    // 3. Return ValidateAndApplyPropertyDescriptor(O, P, extensible, Desc, current).
    Ok(validate_and_apply_property_descriptor(
        Some((obj, key)),
        extensible,
        desc,
        current,
        context.slot(),
    ))
}

/// Abstract operation `OrdinaryHasProperty`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinaryhasproperty
pub(crate) fn ordinary_has_property(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let hasOwn be ? O.[[GetOwnProperty]](P).
    // 3. If hasOwn is not undefined, return true.
    if obj.__get_own_property__(key, context)?.is_some() {
        Ok(true)
    } else {
        // 4. Let parent be ? O.[[GetPrototypeOf]]().
        let parent = obj.__get_prototype_of__(context)?;

        context.slot().set_not_cacheable_if_already_prototype();
        context.slot().attributes |= SlotAttributes::PROTOTYPE;

        parent
            // 5. If parent is not null, then
            // a. Return ? parent.[[HasProperty]](P).
            // 6. Return false.
            .map_or(Ok(false), |obj| obj.__has_property__(key, context))
    }
}

/// Abstract operation `OrdinaryGet`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinaryget
pub(crate) fn ordinary_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<JsValue> {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let desc be ? O.[[GetOwnProperty]](P).
    match obj.__get_own_property__(key, context)? {
        // If desc is undefined, then
        None => {
            // a. Let parent be ? O.[[GetPrototypeOf]]().
            if let Some(parent) = obj.__get_prototype_of__(context)? {
                context.slot().set_not_cacheable_if_already_prototype();
                context.slot().attributes |= SlotAttributes::PROTOTYPE;

                // c. Return ? parent.[[Get]](P, Receiver).
                parent.__get__(key, receiver, context)
            }
            // b. If parent is null, return undefined.
            else {
                Ok(JsValue::undefined())
            }
        }
        Some(ref desc) => {
            match desc.kind() {
                // 4. If IsDataDescriptor(desc) is true, return desc.[[Value]].
                DescriptorKind::Data {
                    value: Some(value), ..
                } => Ok(value.clone()),
                // 5. Assert: IsAccessorDescriptor(desc) is true.
                // 6. Let getter be desc.[[Get]].
                DescriptorKind::Accessor { get: Some(get), .. } if !get.is_undefined() => {
                    // 8. Return ? Call(getter, Receiver).
                    get.call(&receiver, &[], context)
                }
                // 7. If getter is undefined, return undefined.
                _ => Ok(JsValue::undefined()),
            }
        }
    }
}

/// Abstract optimization operation.
///
/// This operation combines the abstract operations `OrdinaryHasProperty` and `OrdinaryGet`.
///
/// More information:
///  - [ECMAScript reference OrdinaryHasProperty][spec0]
///  - [ECMAScript reference OrdinaryGet][spec1]
///
/// [spec0]: https://tc39.es/ecma262/#sec-ordinaryhasproperty
/// [spec1]: https://tc39.es/ecma262/#sec-ordinaryget
pub(crate) fn ordinary_try_get(
    obj: &JsObject,
    key: &PropertyKey,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<Option<JsValue>> {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let desc be ? O.[[GetOwnProperty]](P).
    match obj.__get_own_property__(key, context)? {
        // If desc is undefined, then
        None => {
            // a. Let parent be ? O.[[GetPrototypeOf]]().
            if let Some(parent) = obj.__get_prototype_of__(context)? {
                context.slot().set_not_cacheable_if_already_prototype();
                context.slot().attributes |= SlotAttributes::PROTOTYPE;

                // c. Return ? parent.[[Get]](P, Receiver).
                parent.__try_get__(key, receiver, context)
            }
            // b. If parent is null, return undefined.
            else {
                Ok(None)
            }
        }
        Some(ref desc) => {
            match desc.kind() {
                // 4. If IsDataDescriptor(desc) is true, return desc.[[Value]].
                DescriptorKind::Data {
                    value: Some(value), ..
                } => Ok(Some(value.clone())),
                // 5. Assert: IsAccessorDescriptor(desc) is true.
                // 6. Let getter be desc.[[Get]].
                DescriptorKind::Accessor { get: Some(get), .. } if !get.is_undefined() => {
                    // 8. Return ? Call(getter, Receiver).
                    get.call(&receiver, &[], context).map(Some)
                }
                // 7. If getter is undefined, return undefined.
                _ => Ok(Some(JsValue::undefined())),
            }
        }
    }
}

/// Abstract operation `OrdinarySet`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinaryset
pub(crate) fn ordinary_set(
    obj: &JsObject,
    key: PropertyKey,
    value: JsValue,
    receiver: JsValue,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let ownDesc be ? O.[[GetOwnProperty]](P).
    // 3. Return OrdinarySetWithOwnDescriptor(O, P, V, Receiver, ownDesc).

    // OrdinarySetWithOwnDescriptor ( O, P, V, Receiver, ownDesc )
    // https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinarysetwithowndescriptor

    let mut has_own_desc = false;

    // 1. Assert: IsPropertyKey(P) is true.
    let own_desc = if let Some(desc) = obj.__get_own_property__(&key, context)? {
        has_own_desc = true;
        desc
    }
    // 2. If ownDesc is undefined, then
    // a. Let parent be ? O.[[GetPrototypeOf]]().
    // b. If parent is not null, then
    else if let Some(parent) = obj.__get_prototype_of__(context)? {
        context.slot().set_not_cacheable_if_already_prototype();
        context.slot().attributes |= SlotAttributes::PROTOTYPE;

        // i. Return ? parent.[[Set]](P, V, Receiver).
        return parent.__set__(key, value, receiver, context);
    }
    // c. Else,
    else {
        // It's not on prototype chain.
        context
            .slot()
            .attributes
            .remove(SlotAttributes::PROTOTYPE | SlotAttributes::NOT_CACHEABLE);

        // i. Set ownDesc to the PropertyDescriptor { [[Value]]: undefined, [[Writable]]: true,
        // [[Enumerable]]: true, [[Configurable]]: true }.
        PropertyDescriptor::builder()
            .value(JsValue::undefined())
            .writable(true)
            .enumerable(true)
            .configurable(true)
            .build()
    };

    // 3. If IsDataDescriptor(ownDesc) is true, then
    if own_desc.is_data_descriptor() {
        // a. If ownDesc.[[Writable]] is false, return false.
        if !own_desc.expect_writable() {
            return Ok(false);
        }

        // b. If Type(Receiver) is not Object, return false.
        let Some(receiver) = receiver.as_object() else {
            return Ok(false);
        };

        let obj_is_receiver = JsObject::equals(obj, &receiver);

        // NOTE(HaledOdat): If the object and receiver are not the same then it's not inline cacheable for now.
        context
            .slot()
            .attributes
            .set(SlotAttributes::NOT_CACHEABLE, !obj_is_receiver);

        // OPTIMIZATION: If obj and receiver are the same, there's no need to call [[GetOwnProperty]](P)
        //              again because it was already performed above.
        let existing_descriptor = if has_own_desc && obj_is_receiver {
            Some(own_desc)
        } else {
            // c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
            receiver.__get_own_property__(&key, context)?
        };

        // d. If existingDescriptor is not undefined, then
        if let Some(ref existing_desc) = existing_descriptor {
            // i. If IsAccessorDescriptor(existingDescriptor) is true, return false.
            if existing_desc.is_accessor_descriptor() {
                return Ok(false);
            }

            // ii. If existingDescriptor.[[Writable]] is false, return false.
            if !existing_desc.expect_writable() {
                return Ok(false);
            }

            // iii. Let valueDesc be the PropertyDescriptor { [[Value]]: V }.
            // iv. Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
            return receiver.__define_own_property__(
                &key,
                PropertyDescriptor::builder().value(value).build(),
                context,
            );
        }

        // e. Else
        // i. Assert: Receiver does not currently have a property P.
        // ii. Return ? CreateDataProperty(Receiver, P, V).
        return receiver.create_data_property_with_slot(key, value, context);
    }

    // 4. Assert: IsAccessorDescriptor(ownDesc) is true.
    debug_assert!(own_desc.is_accessor_descriptor());

    // 5. Let setter be ownDesc.[[Set]].
    match own_desc.set() {
        Some(set) if !set.is_undefined() => {
            // 7. Perform ? Call(setter, Receiver, « V »).
            set.call(&receiver, &[value], context)?;

            // 8. Return true.
            Ok(true)
        }
        // 6. If setter is undefined, return false.
        _ => Ok(false),
    }
}

/// Abstract operation `OrdinaryDelete`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinarydelete
pub(crate) fn ordinary_delete(
    obj: &JsObject,
    key: &PropertyKey,
    context: &mut InternalMethodPropertyContext<'_>,
) -> JsResult<bool> {
    // 1. Assert: IsPropertyKey(P) is true.
    Ok(
        // 2. Let desc be ? O.[[GetOwnProperty]](P).
        match obj.__get_own_property__(key, context)? {
            // 4. If desc.[[Configurable]] is true, then
            Some(desc) if desc.expect_configurable() => {
                // a. Remove the own property with name P from O.
                obj.borrow_mut().remove(key);
                // b. Return true.
                true
            }
            // 5. Return false.
            Some(_) => false,
            // 3. If desc is undefined, return true.
            None => true,
        },
    )
}

/// Abstract operation `OrdinaryOwnPropertyKeys`.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-ordinaryownpropertykeys
#[allow(clippy::unnecessary_wraps)]
pub(crate) fn ordinary_own_property_keys(
    obj: &JsObject,
    _context: &mut Context,
) -> JsResult<Vec<PropertyKey>> {
    // 1. Let keys be a new empty List.
    let mut keys = Vec::new();

    let ordered_indexes = {
        let mut indexes: Vec<_> = obj.borrow().properties.index_property_keys().collect();
        indexes.sort_unstable();
        indexes
    };

    // 2. For each own property key P of O such that P is an array index, in ascending numeric index order, do
    // a. Add P as the last element of keys.
    keys.extend(ordered_indexes.into_iter().map(Into::into));

    // 3. For each own property key P of O such that Type(P) is String and P is not an array index, in ascending chronological order of property creation, do
    //     a. Add P as the last element of keys.
    //
    // 4. For each own property key P of O such that Type(P) is Symbol, in ascending chronological order of property creation, do
    //     a. Add P as the last element of keys.
    keys.extend(obj.borrow().properties.shape.keys());

    // 5. Return keys.
    Ok(keys)
}

/// Abstract operation `IsCompatiblePropertyDescriptor`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-iscompatiblepropertydescriptor
pub(crate) fn is_compatible_property_descriptor(
    extensible: bool,
    desc: PropertyDescriptor,
    current: Option<PropertyDescriptor>,
) -> bool {
    // 1. Return ValidateAndApplyPropertyDescriptor(undefined, undefined, Extensible, Desc, Current).
    validate_and_apply_property_descriptor(None, extensible, desc, current, &mut Slot::new())
}

/// Abstract operation `ValidateAndApplyPropertyDescriptor`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-validateandapplypropertydescriptor
pub(crate) fn validate_and_apply_property_descriptor(
    obj_and_key: Option<(&JsObject, &PropertyKey)>,
    extensible: bool,
    desc: PropertyDescriptor,
    current: Option<PropertyDescriptor>,
    slot: &mut Slot,
) -> bool {
    // 1. Assert: If O is not undefined, then IsPropertyKey(P) is true.

    let Some(mut current) = current else {
        // 2. If current is undefined, then
        // a. If extensible is false, return false.
        if !extensible {
            return false;
        }

        // b. Assert: extensible is true.

        if let Some((obj, key)) = obj_and_key {
            obj.borrow_mut().properties.insert_with_slot(
                key,
                // c. If IsGenericDescriptor(Desc) is true or IsDataDescriptor(Desc) is true, then
                if desc.is_generic_descriptor() || desc.is_data_descriptor() {
                    // i. If O is not undefined, create an own data property named P of
                    // object O whose [[Value]], [[Writable]], [[Enumerable]], and
                    // [[Configurable]] attribute values are described by Desc.
                    // If the value of an attribute field of Desc is absent, the attribute
                    // of the newly created property is set to its default value.
                    desc.into_data_defaulted()
                }
                // d. Else,
                else {
                    // i. Assert: ! IsAccessorDescriptor(Desc) is true.

                    // ii. If O is not undefined, create an own accessor property named P
                    // of object O whose [[Get]], [[Set]], [[Enumerable]], and [[Configurable]]
                    // attribute values are described by Desc. If the value of an attribute field
                    // of Desc is absent, the attribute of the newly created property is set to
                    // its default value.
                    desc.into_accessor_defaulted()
                },
                slot,
            );
        }

        // e. Return true.
        return true;
    };

    // 3. If every field in Desc is absent, return true.
    if desc.is_empty() {
        return true;
    }

    // 4. If current.[[Configurable]] is false, then
    if !current.expect_configurable() {
        // a. If Desc.[[Configurable]] is present and its value is true, return false.
        if matches!(desc.configurable(), Some(true)) {
            return false;
        }

        // b. If Desc.[[Enumerable]] is present and ! SameValue(Desc.[[Enumerable]], current.[[Enumerable]])
        // is false, return false.
        if matches!(desc.enumerable(), Some(desc_enum) if desc_enum != current.expect_enumerable())
        {
            return false;
        }
    }

    // 5. If ! IsGenericDescriptor(Desc) is true, then
    if desc.is_generic_descriptor() {
        // a. NOTE: No further validation is required.
    }
    // 6. Else if ! SameValue(! IsDataDescriptor(current), ! IsDataDescriptor(Desc)) is false, then
    else if current.is_data_descriptor() != desc.is_data_descriptor() {
        // a. If current.[[Configurable]] is false, return false.
        if !current.expect_configurable() {
            return false;
        }

        if obj_and_key.is_some() {
            // b. If IsDataDescriptor(current) is true, then
            if current.is_data_descriptor() {
                // i. If O is not undefined, convert the property named P of object O from a data
                // property to an accessor property. Preserve the existing values of the converted
                // property's [[Configurable]] and [[Enumerable]] attributes and set the rest of
                // the property's attributes to their default values.
                current = current.into_accessor_defaulted();
            }
            // c. Else,
            else {
                // i. If O is not undefined, convert the property named P of object O from an
                // accessor property to a data property. Preserve the existing values of the
                // converted property's [[Configurable]] and [[Enumerable]] attributes and set
                // the rest of the property's attributes to their default values.
                current = current.into_data_defaulted();
            }
        }
    }
    // 7. Else if IsDataDescriptor(current) and IsDataDescriptor(Desc) are both true, then
    else if current.is_data_descriptor() && desc.is_data_descriptor() {
        // a. If current.[[Configurable]] is false and current.[[Writable]] is false, then
        if !current.expect_configurable() && !current.expect_writable() {
            // i. If Desc.[[Writable]] is present and Desc.[[Writable]] is true, return false.
            if matches!(desc.writable(), Some(true)) {
                return false;
            }
            // ii. If Desc.[[Value]] is present and SameValue(Desc.[[Value]], current.[[Value]]) is false, return false.
            if matches!(desc.value(), Some(value) if !JsValue::same_value(value, current.expect_value()))
            {
                return false;
            }
            // iii. Return true.
            return true;
        }
    }
    // 8. Else,
    // a. Assert: ! IsAccessorDescriptor(current) and ! IsAccessorDescriptor(Desc) are both true.
    // b. If current.[[Configurable]] is false, then
    else if !current.expect_configurable() {
        // i. If Desc.[[Set]] is present and SameValue(Desc.[[Set]], current.[[Set]]) is false, return false.
        if matches!(desc.set(), Some(set) if !JsValue::same_value(set, current.expect_set())) {
            return false;
        }

        // ii. If Desc.[[Get]] is present and SameValue(Desc.[[Get]], current.[[Get]]) is false, return false.
        if matches!(desc.get(), Some(get) if !JsValue::same_value(get, current.expect_get())) {
            return false;
        }
        // iii. Return true.
        return true;
    }

    // 9. If O is not undefined, then
    if let Some((obj, key)) = obj_and_key {
        // a. For each field of Desc that is present, set the corresponding attribute of the
        // property named P of object O to the value of the field.
        current.fill_with(desc);
        obj.borrow_mut()
            .properties
            .insert_with_slot(key, current, slot);
        slot.attributes |= SlotAttributes::FOUND;
    }

    // 10. Return true.
    true
}

/// Abstract operation `GetPrototypeFromConstructor`
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma262/#sec-getprototypefromconstructor
#[track_caller]
pub(crate) fn get_prototype_from_constructor<F>(
    constructor: &JsValue,
    default: F,
    context: &mut Context,
) -> JsResult<JsObject>
where
    F: FnOnce(&StandardConstructors) -> &StandardConstructor,
{
    // 1. Assert: intrinsicDefaultProto is this specification's name of an intrinsic
    // object.
    // The corresponding object must be an intrinsic that is intended to be used
    // as the [[Prototype]] value of an object.
    // 2. Let proto be ? Get(constructor, "prototype").
    let realm = if let Some(constructor) = constructor.as_object() {
        if let Some(proto) = constructor.get(PROTOTYPE, context)?.as_object() {
            return Ok(proto.clone());
        }
        // 3. If Type(proto) is not Object, then
        // a. Let realm be ? GetFunctionRealm(constructor).
        constructor.get_function_realm(context)?
    } else {
        context.realm().clone()
    };
    // b. Set proto to realm's intrinsic object named intrinsicDefaultProto.
    Ok(default(realm.intrinsics().constructors()).prototype())
}

fn non_existent_call(
    obj: &JsObject,
    _argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    Err(crate::v8_messages::not_callable_inner(&obj.clone().into())
        .with_realm(context.realm().clone())
        .into())
}

fn non_existent_construct(
    obj: &JsObject,
    _argument_count: usize,
    context: &mut InternalMethodCallContext<'_>,
) -> JsResult<CallValue> {
    Err(crate::v8_messages::not_constructor_inner(&obj.clone().into())
        .with_realm(context.realm().clone())
        .into())
}
