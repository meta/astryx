//! Boa's representation of a JavaScript object and builtin object wrappers
//!
//! For the builtin object wrappers, please see [`object::builtins`][builtins] for implementors.

use datatypes::ObjectData;
pub use jsobject::{RecursionLimiter, Ref, RefMut};
pub use operations::IntegrityLevel;
pub use property_map::*;
use thin_vec::ThinVec;

use self::{internal_methods::ORDINARY_INTERNAL_METHODS, shape::Shape};
use crate::{
    Context, JsString, JsSymbol, JsValue,
    builtins::{OrdinaryObject, function::ConstructorKind},
    context::intrinsics::StandardConstructor,
    js_string,
    native_function::{NativeFunction, NativeFunctionObject},
    property::{Attribute, PropertyDescriptor, PropertyKey},
    realm::Realm,
    string::StaticJsStrings,
};

use boa_gc::{Finalize, Trace};
use std::{
    any::{Any, TypeId},
    fmt::Debug,
};

#[cfg(test)]
mod tests;

pub(crate) mod internal_methods;

pub mod builtins;
mod datatypes;
mod jsobject;
mod operations;
mod property_map;

pub mod shape;

pub(crate) use builtins::*;

pub use datatypes::JsData;
pub use jsobject::*;

/// Const `constructor`, usually set on prototypes as a key to point to their respective constructor object.
pub const CONSTRUCTOR: JsString = js_string!("constructor");

/// Const `prototype`, usually set on constructors as a key to point to their respective prototype object.
pub const PROTOTYPE: JsString = js_string!("prototype");

/// A type alias for an object prototype.
///
/// A `None` values means that the prototype is the `null` value.
pub type JsPrototype = Option<JsObject>;

/// The internal storage of an object's property values.
///
/// The [`shape::Shape`] contains the property names and attributes.
pub(crate) type ObjectStorage = Vec<JsValue>;

/// This trait allows Rust types to be passed around as objects.
///
/// This is automatically implemented when a type implements `Any`, `Trace`, and `JsData`.
pub trait NativeObject: Any + Trace + JsData {
    /// Convert the Rust type which implements `NativeObject` to a `&dyn Any`.
    fn as_any(&self) -> &dyn Any;

    /// Convert the Rust type which implements `NativeObject` to a `&mut dyn Any`.
    fn as_mut_any(&mut self) -> &mut dyn Any;

    /// Gets the type name of the value.
    fn type_name_of_value(&self) -> &'static str;
}

// TODO: Use super trait casting in Rust 1.75
impl<T: Any + Trace + JsData> NativeObject for T {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_mut_any(&mut self) -> &mut dyn Any {
        self
    }

    fn type_name_of_value(&self) -> &'static str {
        fn name_of_val<T: ?Sized>(_val: &T) -> &'static str {
            std::any::type_name::<T>()
        }

        name_of_val(self)
    }
}

// TODO: Use super trait casting in Rust 1.75
impl dyn NativeObject {
    /// Returns `true` if the inner type is the same as `T`.
    #[inline]
    pub fn is<T: NativeObject>(&self) -> bool {
        // Get `TypeId` of the type this function is instantiated with.
        let t = TypeId::of::<T>();

        // Get `TypeId` of the type in the trait object (`self`).
        let concrete = self.type_id();

        // Compare both `TypeId`s on equality.
        t == concrete
    }

    /// Returns some reference to the inner value if it is of type `T`, or
    /// `None` if it isn't.
    #[inline]
    pub fn downcast_ref<T: NativeObject>(&self) -> Option<&T> {
        if self.is::<T>() {
            // SAFETY: just checked whether we are pointing to the correct type, and we can rely on
            // that check for memory safety because we have implemented NativeObject for all types; no other
            // impls can exist as they would conflict with our impl.
            unsafe { Some(self.downcast_ref_unchecked()) }
        } else {
            None
        }
    }

    /// Returns some mutable reference to the inner value if it is of type `T`, or
    /// `None` if it isn't.
    #[inline]
    pub fn downcast_mut<T: NativeObject>(&mut self) -> Option<&mut T> {
        if self.is::<T>() {
            // SAFETY: Already checked if inner type is T, so this is safe.
            unsafe { Some(self.downcast_mut_unchecked()) }
        } else {
            None
        }
    }

    /// Returns a reference to the inner value as type `dyn T`.
    ///
    /// # Safety
    ///
    /// The contained value must be of type `T`. Calling this method
    /// with the incorrect type is *undefined behavior*.
    #[inline]
    pub unsafe fn downcast_ref_unchecked<T: NativeObject>(&self) -> &T {
        debug_assert!(self.is::<T>());
        let ptr: *const dyn NativeObject = self;
        // SAFETY: caller guarantees that T is the correct type
        unsafe { &*ptr.cast::<T>() }
    }

    /// Returns a mutable reference to the inner value as type `dyn T`.
    ///
    /// # Safety
    ///
    /// The contained value must be of type `T`. Calling this method
    /// with the incorrect type is *undefined behavior*.
    #[inline]
    pub unsafe fn downcast_mut_unchecked<T: NativeObject>(&mut self) -> &mut T {
        debug_assert!(self.is::<T>());
        // SAFETY: caller guarantees that T is the correct type
        let ptr: *mut dyn NativeObject = self;
        unsafe { &mut *ptr.cast::<T>() }
    }
}

/// The internal representation of a JavaScript object.
#[derive(Debug, Finalize, Trace)]
// SAFETY: This does not implement drop, so this is safe.
#[boa_gc(unsafe_no_drop)]
// SAFETY: This type must use `#[repr(C)]` to prevent the compiler from reordering fields,
//         as it is used for casting between types.
#[repr(C)]
pub struct Object<T: ?Sized> {
    /// The collection of properties contained in the object
    pub(crate) properties: PropertyMap,
    /// Whether it can have new properties added to it.
    pub(crate) extensible: bool,
    /// The `[[PrivateElements]]` internal slot.
    private_elements: ThinVec<(PrivateName, PrivateElement)>,
    /// The inner object data
    data: ObjectData<T>,
}

impl<T: Default> Default for Object<T> {
    fn default() -> Self {
        Self {
            properties: PropertyMap::default(),
            extensible: true,
            private_elements: ThinVec::new(),
            data: ObjectData::default(),
        }
    }
}

/// A Private Name.
#[derive(Clone, Debug, PartialEq, Eq, Trace, Finalize)]
pub struct PrivateName {
    /// The `[[Description]]` internal slot of the private name.
    description: JsString,

    /// The unique identifier of the private name.
    id: usize,
}

impl PrivateName {
    /// Create a new private name.
    pub(crate) const fn new(description: JsString, id: usize) -> Self {
        Self { description, id }
    }
}

/// The representation of private object elements.
#[derive(Clone, Debug, Trace, Finalize)]
pub enum PrivateElement {
    /// A private field.
    Field(JsValue),

    /// A private method.
    Method(JsObject),

    /// A private element accessor.
    Accessor {
        /// A getter function.
        getter: Option<JsObject>,

        /// A setter function.
        setter: Option<JsObject>,
    },
}

impl<T: ?Sized> Object<T> {
    /// Returns the shape of the object.
    #[must_use]
    pub const fn shape(&self) -> &Shape {
        &self.properties.shape
    }

    /// Returns the data of the object.
    #[inline]
    #[must_use]
    pub fn data(&self) -> &T {
        self.data.as_ref()
    }

    /// Returns the data of the object.
    #[inline]
    #[must_use]
    pub fn data_mut(&mut self) -> &mut T {
        self.data.as_mut()
    }

    /// Gets the prototype instance of this object.
    #[inline]
    #[must_use]
    pub fn prototype(&self) -> JsPrototype {
        self.properties.shape.prototype()
    }

    /// Sets the prototype instance of the object.
    ///
    /// [More information][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-invariants-of-the-essential-internal-methods
    #[track_caller]
    pub fn set_prototype<O: Into<JsPrototype>>(&mut self, prototype: O) -> bool {
        let prototype = prototype.into();
        if self.extensible {
            self.properties.shape = self.properties.shape.change_prototype_transition(prototype);
            true
        } else {
            // If target is non-extensible, [[SetPrototypeOf]] must return false
            // unless V is the SameValue as the target's observed [[GetPrototypeOf]] value.
            self.prototype() == prototype
        }
    }

    /// Returns the properties of the object.
    #[inline]
    #[must_use]
    pub const fn properties(&self) -> &PropertyMap {
        &self.properties
    }

    #[inline]
    pub(crate) fn properties_mut(&mut self) -> &mut PropertyMap {
        &mut self.properties
    }

    /// Inserts a field in the object `properties` without checking if it's writable.
    ///
    /// If a field was already in the object with the same name, then `true` is returned
    /// otherwise, `false` is returned.
    pub(crate) fn insert<K, P>(&mut self, key: K, property: P) -> bool
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        self.properties.insert(&key.into(), property.into())
    }

    /// Helper function for property removal without checking if it's configurable.
    ///
    /// Returns `true` if the property was removed, `false` otherwise.
    #[inline]
    pub(crate) fn remove(&mut self, key: &PropertyKey) -> bool {
        self.properties.remove(key)
    }

    /// Append a private element to an object.
    pub(crate) fn append_private_element(&mut self, name: PrivateName, element: PrivateElement) {
        if let PrivateElement::Accessor { getter, setter } = &element {
            for (key, value) in &mut self.private_elements {
                if name == *key
                    && let PrivateElement::Accessor {
                        getter: existing_getter,
                        setter: existing_setter,
                    } = value
                {
                    if existing_getter.is_none() {
                        existing_getter.clone_from(getter);
                    }
                    if existing_setter.is_none() {
                        existing_setter.clone_from(setter);
                    }
                    return;
                }
            }
        }

        self.private_elements.push((name, element));
    }
}

/// The functions binding.
///
/// Specifies what is the name of the function object (`name` property),
/// and the binding name of the function object which can be different
/// from the function name.
///
/// The only way to construct this is with the `From` trait.
///
/// There are two implementations:
///  - From a single type `T` which implements `Into<FunctionBinding>` which sets the binding
///    name and the function name to the same value.
///  - From a tuple `(B: Into<PropertyKey>, N: Into<JsString>)`, where the `B` is the binding name
///    and the `N` is the function name.
#[derive(Debug, Clone)]
pub struct FunctionBinding {
    pub(crate) binding: PropertyKey,
    pub(crate) name: JsString,
}

impl From<JsString> for FunctionBinding {
    #[inline]
    fn from(name: JsString) -> Self {
        Self {
            binding: name.clone().into(),
            name,
        }
    }
}

impl From<JsSymbol> for FunctionBinding {
    #[inline]
    fn from(binding: JsSymbol) -> Self {
        Self {
            name: binding.fn_name(),
            binding: binding.into(),
        }
    }
}

impl<B, N> From<(B, N)> for FunctionBinding
where
    B: Into<PropertyKey>,
    N: Into<JsString>,
{
    fn from((binding, name): (B, N)) -> Self {
        Self {
            binding: binding.into(),
            name: name.into(),
        }
    }
}

/// Builder for creating native function objects
#[derive(Debug)]
pub struct FunctionObjectBuilder<'realm> {
    realm: &'realm Realm,
    function: NativeFunction,
    constructor: Option<ConstructorKind>,
    name: JsString,
    length: usize,
}

impl<'realm> FunctionObjectBuilder<'realm> {
    /// Create a new `FunctionBuilder` for creating a native function.
    #[inline]
    #[must_use]
    pub fn new(realm: &'realm Realm, function: NativeFunction) -> Self {
        Self {
            realm,
            function,
            constructor: None,
            name: js_string!(),
            length: 0,
        }
    }

    /// Specify the name property of object function object.
    ///
    /// The default is `""` (empty string).
    #[must_use]
    pub fn name<N>(mut self, name: N) -> Self
    where
        N: Into<JsString>,
    {
        self.name = name.into();
        self
    }

    /// Specify the length property of object function object.
    ///
    /// How many arguments this function takes.
    ///
    /// The default is `0`.
    #[inline]
    #[must_use]
    pub const fn length(mut self, length: usize) -> Self {
        self.length = length;
        self
    }

    /// Specify whether the object function object can be called with `new` keyword.
    ///
    /// The default is `false`.
    #[must_use]
    pub fn constructor(mut self, yes: bool) -> Self {
        self.constructor = yes.then_some(ConstructorKind::Base);
        self
    }

    /// Build the function object.
    #[must_use]
    pub fn build(self) -> JsFunction {
        let object = self.realm.intrinsics().templates().function().create(
            NativeFunctionObject {
                f: self.function,
                name: self.name.clone(),
                constructor: self.constructor,
                realm: Some(self.realm.clone()),
            },
            vec![self.length.into(), self.name.into()],
        );

        JsFunction::from_object_unchecked(object)
    }
}

/// Builder for creating objects with properties.
///
/// # Examples
///
/// ```
/// # use boa_engine::{
/// #     Context,
/// #     JsValue,
/// #     NativeFunction,
/// #     object::ObjectInitializer,
/// #     property::Attribute,
/// #     js_string,
/// # };
/// let mut context = Context::default();
/// let object = ObjectInitializer::new(&mut context)
///     .property(js_string!("hello"), js_string!("world"), Attribute::all())
///     .property(1, 1, Attribute::all())
///     .function(
///         NativeFunction::from_fn_ptr(|_, _, _| Ok(JsValue::undefined())),
///         js_string!("func"),
///         0,
///     )
///     .build();
/// ```
///
/// The equivalent in JavaScript would be:
/// ```text
/// let object = {
///     hello: "world",
///     "1": 1,
///     func: function() {}
/// }
/// ```
#[derive(Debug)]
pub struct ObjectInitializer<'ctx> {
    context: &'ctx mut Context,
    object: JsObject,
}

impl<'ctx> ObjectInitializer<'ctx> {
    /// Create a new `ObjectBuilder`.
    #[inline]
    pub fn new(context: &'ctx mut Context) -> Self {
        let object = JsObject::with_object_proto(context.intrinsics());
        Self { context, object }
    }

    /// Create a new `ObjectBuilder` with custom [`NativeObject`] data.
    pub fn with_native_data<T: NativeObject>(data: T, context: &'ctx mut Context) -> Self {
        let object = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            context.intrinsics().constructors().object().prototype(),
            data,
        )
        .upcast();
        Self { context, object }
    }

    /// Create a new `ObjectBuilder` with custom [`NativeObject`] data and custom prototype.
    pub fn with_native_data_and_proto<T: NativeObject>(
        data: T,
        proto: JsObject,
        context: &'ctx mut Context,
    ) -> Self {
        let object =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, data)
                .upcast();
        Self { context, object }
    }

    /// Add a function to the object.
    pub fn function<B>(&mut self, function: NativeFunction, binding: B, length: usize) -> &mut Self
    where
        B: Into<FunctionBinding>,
    {
        let binding = binding.into();
        let function = FunctionObjectBuilder::new(self.context.realm(), function)
            .name(binding.name)
            .length(length)
            .constructor(false)
            .build();

        self.object.borrow_mut().insert(
            binding.binding,
            PropertyDescriptor::builder()
                .value(function)
                .writable(true)
                .enumerable(false)
                .configurable(true),
        );
        self
    }

    /// Add a property to the object.
    pub fn property<K, V>(&mut self, key: K, value: V, attribute: Attribute) -> &mut Self
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        let property = PropertyDescriptor::builder()
            .value(value)
            .writable(attribute.writable())
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.object.borrow_mut().insert(key, property);
        self
    }

    /// Add new accessor property to the object.
    ///
    /// # Panics
    ///
    /// If both getter or setter are [`None`].
    pub fn accessor<K>(
        &mut self,
        key: K,
        get: Option<JsFunction>,
        set: Option<JsFunction>,
        attribute: Attribute,
    ) -> &mut Self
    where
        K: Into<PropertyKey>,
    {
        // Accessors should have at least one function.
        assert!(set.is_some() || get.is_some());

        let property = PropertyDescriptor::builder()
            .maybe_get(get)
            .maybe_set(set)
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.object.borrow_mut().insert(key, property);
        self
    }

    /// Build the object.
    #[inline]
    pub fn build(&mut self) -> JsObject {
        self.object.clone()
    }

    /// Gets the context used to create the object.
    #[inline]
    pub fn context(&mut self) -> &mut Context {
        self.context
    }
}

/// Builder for creating constructors objects, like `Array`.
#[derive(Debug)]
pub struct ConstructorBuilder<'ctx> {
    context: &'ctx mut Context,
    function: NativeFunction,
    constructor_object: Object<OrdinaryObject>,
    has_prototype_property: bool,
    prototype: Object<OrdinaryObject>,
    name: JsString,
    length: usize,
    callable: bool,
    kind: Option<ConstructorKind>,
    inherit: Option<JsPrototype>,
    custom_prototype: Option<JsPrototype>,
}

impl<'ctx> ConstructorBuilder<'ctx> {
    /// Create a new `ConstructorBuilder`.
    #[inline]
    pub fn new(context: &'ctx mut Context, function: NativeFunction) -> ConstructorBuilder<'ctx> {
        Self {
            context,
            function,
            constructor_object: Object {
                data: ObjectData::new(OrdinaryObject),
                properties: PropertyMap::default(),
                extensible: true,
                private_elements: ThinVec::new(),
            },
            prototype: Object {
                data: ObjectData::new(OrdinaryObject),
                properties: PropertyMap::default(),
                extensible: true,
                private_elements: ThinVec::new(),
            },
            length: 0,
            name: js_string!(),
            callable: true,
            kind: Some(ConstructorKind::Base),
            inherit: None,
            custom_prototype: None,
            has_prototype_property: true,
        }
    }

    /// Add new method to the constructors prototype.
    pub fn method<B>(&mut self, function: NativeFunction, binding: B, length: usize) -> &mut Self
    where
        B: Into<FunctionBinding>,
    {
        let binding = binding.into();
        let function = FunctionObjectBuilder::new(self.context.realm(), function)
            .name(binding.name)
            .length(length)
            .constructor(false)
            .build();

        self.prototype.insert(
            binding.binding,
            PropertyDescriptor::builder()
                .value(function)
                .writable(true)
                .enumerable(false)
                .configurable(true),
        );
        self
    }

    /// Add new static method to the constructors object itself.
    pub fn static_method<B>(
        &mut self,
        function: NativeFunction,
        binding: B,
        length: usize,
    ) -> &mut Self
    where
        B: Into<FunctionBinding>,
    {
        let binding = binding.into();
        let function = FunctionObjectBuilder::new(self.context.realm(), function)
            .name(binding.name)
            .length(length)
            .constructor(false)
            .build();

        self.constructor_object.insert(
            binding.binding,
            PropertyDescriptor::builder()
                .value(function)
                .writable(true)
                .enumerable(false)
                .configurable(true),
        );
        self
    }

    /// Add new data property to the constructor's prototype.
    pub fn property<K, V>(&mut self, key: K, value: V, attribute: Attribute) -> &mut Self
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        let property = PropertyDescriptor::builder()
            .value(value)
            .writable(attribute.writable())
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.prototype.insert(key, property);
        self
    }

    /// Add new static data property to the constructor object itself.
    pub fn static_property<K, V>(&mut self, key: K, value: V, attribute: Attribute) -> &mut Self
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        let property = PropertyDescriptor::builder()
            .value(value)
            .writable(attribute.writable())
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.constructor_object.insert(key, property);
        self
    }

    /// Add new accessor property to the constructor's prototype.
    pub fn accessor<K>(
        &mut self,
        key: K,
        get: Option<JsFunction>,
        set: Option<JsFunction>,
        attribute: Attribute,
    ) -> &mut Self
    where
        K: Into<PropertyKey>,
    {
        let property = PropertyDescriptor::builder()
            .maybe_get(get)
            .maybe_set(set)
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.prototype.insert(key, property);
        self
    }

    /// Add new static accessor property to the constructor object itself.
    pub fn static_accessor<K>(
        &mut self,
        key: K,
        get: Option<JsFunction>,
        set: Option<JsFunction>,
        attribute: Attribute,
    ) -> &mut Self
    where
        K: Into<PropertyKey>,
    {
        let property = PropertyDescriptor::builder()
            .maybe_get(get)
            .maybe_set(set)
            .enumerable(attribute.enumerable())
            .configurable(attribute.configurable());
        self.constructor_object.insert(key, property);
        self
    }

    /// Add new property to the constructor's prototype.
    pub fn property_descriptor<K, P>(&mut self, key: K, property: P) -> &mut Self
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        let property = property.into();
        self.prototype.insert(key, property);
        self
    }

    /// Add new static property to the constructor object itself.
    pub fn static_property_descriptor<K, P>(&mut self, key: K, property: P) -> &mut Self
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        let property = property.into();
        self.constructor_object.insert(key, property);
        self
    }

    /// Specify how many arguments the constructor function takes.
    ///
    /// Default is `0`.
    #[inline]
    pub fn length(&mut self, length: usize) -> &mut Self {
        self.length = length;
        self
    }

    /// Specify the name of the constructor function.
    ///
    /// Default is `"[object]"`
    pub fn name<N>(&mut self, name: N) -> &mut Self
    where
        N: AsRef<str>,
    {
        self.name = name.as_ref().into();
        self
    }

    /// Specify whether the constructor function can be called.
    ///
    /// Default is `true`
    #[inline]
    pub fn callable(&mut self, callable: bool) -> &mut Self {
        self.callable = callable;
        self
    }

    /// Specify whether the constructor function can be called with `new` keyword.
    ///
    /// Default is `true`
    #[inline]
    pub fn constructor(&mut self, constructor: bool) -> &mut Self {
        self.kind = constructor.then_some(ConstructorKind::Base);
        self
    }

    /// Specify the parent prototype which objects created by this constructor
    /// inherit from.
    ///
    /// Default is `Object.prototype`
    pub fn inherit<O: Into<JsPrototype>>(&mut self, prototype: O) -> &mut Self {
        self.inherit = Some(prototype.into());
        self
    }

    /// Specify the `[[Prototype]]` internal field of this constructor.
    ///
    /// Default is `Function.prototype`
    pub fn custom_prototype<O: Into<JsPrototype>>(&mut self, prototype: O) -> &mut Self {
        self.custom_prototype = Some(prototype.into());
        self
    }

    /// Specify whether the constructor function has a 'prototype' property.
    ///
    /// Default is `true`
    #[inline]
    pub fn has_prototype_property(&mut self, has_prototype_property: bool) -> &mut Self {
        self.has_prototype_property = has_prototype_property;
        self
    }

    /// Return the current context.
    #[inline]
    pub fn context(&mut self) -> &mut Context {
        self.context
    }

    /// Build the constructor function object.
    #[must_use]
    pub fn build(mut self) -> StandardConstructor {
        let length = PropertyDescriptor::builder()
            .value(self.length)
            .writable(false)
            .enumerable(false)
            .configurable(true);
        let name = PropertyDescriptor::builder()
            .value(self.name.clone())
            .writable(false)
            .enumerable(false)
            .configurable(true);

        let prototype = {
            if let Some(proto) = self.inherit.take() {
                self.prototype.set_prototype(proto);
            } else {
                self.prototype.set_prototype(
                    self.context
                        .intrinsics()
                        .constructors()
                        .object()
                        .prototype(),
                );
            }

            JsObject::from_object_and_vtable(self.prototype, &ORDINARY_INTERNAL_METHODS)
        };

        let constructor = {
            let data = NativeFunctionObject {
                f: self.function,
                name: self.name.clone(),
                constructor: self.kind,
                realm: Some(self.context.realm().clone()),
            };
            let internal_methods = data.internal_methods();
            let mut constructor = Object {
                properties: self.constructor_object.properties,
                extensible: self.constructor_object.extensible,
                private_elements: self.constructor_object.private_elements,
                data: ObjectData::new(data),
            };

            constructor.insert(StaticJsStrings::LENGTH, length);
            constructor.insert(js_string!("name"), name);

            if let Some(proto) = self.custom_prototype.take() {
                constructor.set_prototype(proto);
            } else {
                constructor.set_prototype(
                    self.context
                        .intrinsics()
                        .constructors()
                        .function()
                        .prototype(),
                );
            }

            if self.has_prototype_property {
                constructor.insert(
                    PROTOTYPE,
                    PropertyDescriptor::builder()
                        .value(prototype.clone())
                        .writable(false)
                        .enumerable(false)
                        .configurable(false),
                );
            }

            JsObject::from_object_and_vtable(constructor, internal_methods)
        };

        {
            let mut prototype = prototype.borrow_mut();
            prototype.insert(
                CONSTRUCTOR,
                PropertyDescriptor::builder()
                    .value(constructor.clone())
                    .writable(true)
                    .enumerable(false)
                    .configurable(true),
            );
        }

        StandardConstructor::new(JsFunction::from_object_unchecked(constructor), prototype)
    }
}
