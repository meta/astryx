//! Traits and structs for implementing native classes.
//!
//! Native classes are implemented through the [`Class`][class-trait] trait.
//!
//! # Examples
//!
//! ```
//! # use boa_engine::{
//! #    NativeFunction,
//! #    property::Attribute,
//! #    class::{Class, ClassBuilder},
//! #    Context, JsResult, JsValue,
//! #    JsArgs, Source, JsObject, js_str, js_string,
//! #    JsNativeError, JsData,
//! # };
//! # use boa_gc::{Finalize, Trace};
//! #
//! // Can also be a struct containing `Trace` types.
//! #[derive(Debug, Trace, Finalize, JsData)]
//! enum Animal {
//!     Cat,
//!     Dog,
//!     Other,
//! }
//!
//! impl Class for Animal {
//!     // we set the binding name of this function to be `"Animal"`.
//!     const NAME: &'static str = "Animal";
//!
//!     // We set the length to `2` since we accept 2 arguments in the constructor.
//!     const LENGTH: usize = 2;
//!
//!     // This is what is called when we do `new Animal()` to construct the inner data of the class.
//!     // `_new_target` is the target of the `new` invocation, in this case the `Animal` constructor
//!     // object.
//!     fn data_constructor(_new_target: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<Self> {
//!         // This is equivalent to `String(arg)`.
//!         let kind = args.get_or_undefined(0).to_string(context)?;
//!
//!         let animal = match kind.to_std_string_escaped().as_str() {
//!             "cat" => Self::Cat,
//!             "dog" => Self::Dog,
//!             _ => Self::Other,
//!         };
//!
//!         Ok(animal)
//!     }
//!
//!     // This is also called on instance construction, but it receives the object wrapping the
//!     // native data as its `instance` argument.
//!     fn object_constructor(
//!         instance: &JsObject<Self>,
//!         args: &[JsValue],
//!         context: &mut Context,
//!     ) -> JsResult<()> {
//!         let age = args.get_or_undefined(1).to_number(context)?;
//!
//!         // Roughly equivalent to `this.age = Number(age)`.
//!         instance.clone().upcast().set(js_string!("age"), age, true, context)?;
//!
//!         Ok(())
//!     }
//!
//!     /// This is where the class object is initialized.
//!     fn init(class: &mut ClassBuilder) -> JsResult<()> {
//!         class.method(
//!             js_string!("speak"),
//!             0,
//!             NativeFunction::from_fn_ptr(|this, _args, _ctx| {
//!                 if let Some(object) = this.as_object() {
//!                     if let Some(animal) = object.downcast_ref::<Animal>() {
//!                         return Ok(match &*animal {
//!                             Self::Cat => js_string!("meow"),
//!                             Self::Dog => js_string!("woof"),
//!                             Self::Other => js_string!(r"¯\_(ツ)_/¯"),
//!                         }.into());
//!                     }
//!                 }
//!                 Err(JsNativeError::typ().with_message("invalid this for class method").into())
//!             }),
//!         );
//!         Ok(())
//!     }
//! }
//!
//! fn main() {
//!     let mut context = Context::default();
//!
//!     context.register_global_class::<Animal>().unwrap();
//!
//!     let result = context.eval(Source::from_bytes(r#"
//!         let pet = new Animal("dog", 3);
//!
//!         `My pet is ${pet.age} years old. Right, buddy? - ${pet.speak()}!`
//!     "#)).unwrap();
//!
//!     assert_eq!(
//!         result.as_string().unwrap(),
//!         js_str!("My pet is 3 years old. Right, buddy? - woof!")
//!     );
//! }
//! ```
//!
//! [class-trait]: ./trait.Class.html

use crate::{
    Context, JsResult, JsValue,
    context::intrinsics::StandardConstructor,
    error::JsNativeError,
    native_function::NativeFunction,
    object::{ConstructorBuilder, FunctionBinding, JsFunction, JsObject, NativeObject, PROTOTYPE},
    property::{Attribute, PropertyDescriptor, PropertyKey},
};

/// Native class.
///
/// See the [module-level documentation][self] for more details.
pub trait Class: NativeObject + Sized {
    /// The binding name of this class.
    const NAME: &'static str;
    /// The amount of arguments this class' constructor takes. Default is `0`.
    const LENGTH: usize = 0;
    /// The property attributes of this class' constructor in the global object.
    /// Default is `writable`, `enumerable`, `configurable`.
    const ATTRIBUTES: Attribute = Attribute::all();

    /// Initializes the properties and methods of this class.
    fn init(class: &mut ClassBuilder<'_>) -> JsResult<()>;

    /// Creates the internal data for an instance of this class.
    fn data_constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<Self>;

    /// Initializes the properties of the constructed object for an instance of this class.
    ///
    /// Useful to initialize additional properties for the constructed object that aren't
    /// stored inside the native data.
    #[allow(unused_variables)] // Saves work when IDEs autocomplete trait impls.
    fn object_constructor(
        instance: &JsObject<Self>,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<()> {
        Ok(())
    }

    /// Creates a new [`JsObject`] with its internal data set to the result of calling
    /// [`Class::data_constructor`] and [`Class::object_constructor`].
    ///
    /// # Errors
    ///
    /// - Throws an error if `new_target` is undefined.
    /// - Throws an error if this class is not registered in `new_target`'s realm.
    ///   See [`Context::register_global_class`].
    ///
    /// <div class="warning">
    /// Overriding this method could be useful for certain usages, but incorrectly implementing this
    /// could lead to weird errors like missing inherited methods or incorrect internal data.
    /// </div>
    fn construct(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsObject> {
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message(format!(
                    "cannot call constructor of native class `{}` without new",
                    Self::NAME
                ))
                .into());
        }

        let prototype = 'proto: {
            let realm = if let Some(constructor) = new_target.as_object() {
                if let Some(proto) = constructor.get(PROTOTYPE, context)?.as_object() {
                    break 'proto proto.clone();
                }
                constructor.get_function_realm(context)?
            } else {
                context.realm().clone()
            };
            realm
                .get_class::<Self>()
                .ok_or_else(|| {
                    JsNativeError::typ().with_message(format!(
                        "could not find native class `{}` in the map of registered classes",
                        Self::NAME
                    ))
                })?
                .prototype()
        };

        let data = Self::data_constructor(new_target, args, context)?;

        let object =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, data);

        Self::object_constructor(&object, args, context)?;

        Ok(object.upcast())
    }

    /// Constructs an instance of this class from its inner native data.
    ///
    /// Note that the default implementation won't call [`Class::data_constructor`], but it will
    /// call [`Class::object_constructor`] with no arguments.
    ///
    /// # Errors
    /// - Throws an error if this class is not registered in the context's realm. See
    ///   [`Context::register_global_class`].
    ///
    /// <div class="warning">
    /// Overriding this method could be useful for certain usages, but incorrectly implementing this
    /// could lead to weird errors like missing inherited methods or incorrect internal data.
    /// </div>
    fn from_data(data: Self, context: &mut Context) -> JsResult<JsObject> {
        let prototype = context
            .get_global_class::<Self>()
            .ok_or_else(|| {
                JsNativeError::typ().with_message(format!(
                    "could not find native class `{}` in the map of registered classes",
                    Self::NAME
                ))
            })?
            .prototype();

        let object =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), prototype, data);

        Self::object_constructor(&object, &[], context)?;

        Ok(object.upcast())
    }
}

/// Class builder which allows adding methods and static methods to the class.
#[derive(Debug)]
pub struct ClassBuilder<'ctx> {
    builder: ConstructorBuilder<'ctx>,
}

impl<'ctx> ClassBuilder<'ctx> {
    /// Create a new `ClassBuilder` from a [`Class`] type.
    pub fn new<T>(context: &'ctx mut Context) -> Self
    where
        T: Class,
    {
        let mut builder = ConstructorBuilder::new(
            context,
            NativeFunction::from_fn_ptr(|t, a, c| T::construct(t, a, c).map(JsValue::from)),
        );
        builder.name(T::NAME);
        builder.length(T::LENGTH);
        Self { builder }
    }

    /// Create the [`StandardConstructor`] from this class builder.
    #[must_use]
    pub fn build(self) -> StandardConstructor {
        self.builder.build()
    }

    /// Add a method to the class.
    ///
    /// It is added to `prototype`.
    pub fn method<N>(&mut self, name: N, length: usize, function: NativeFunction) -> &mut Self
    where
        N: Into<FunctionBinding>,
    {
        self.builder.method(function, name, length);
        self
    }

    /// Add a static method to the class.
    ///
    /// It is added to class object itself.
    pub fn static_method<N>(
        &mut self,
        name: N,
        length: usize,
        function: NativeFunction,
    ) -> &mut Self
    where
        N: Into<FunctionBinding>,
    {
        self.builder.static_method(function, name, length);
        self
    }

    /// Add a data property to the class, with the specified attribute.
    ///
    /// It is added to `prototype`.
    pub fn property<K, V>(&mut self, key: K, value: V, attribute: Attribute) -> &mut Self
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        self.builder.property(key, value, attribute);
        self
    }

    /// Add a static data property to the class, with the specified attribute.
    ///
    /// It is added to class object itself.
    pub fn static_property<K, V>(&mut self, key: K, value: V, attribute: Attribute) -> &mut Self
    where
        K: Into<PropertyKey>,
        V: Into<JsValue>,
    {
        self.builder.static_property(key, value, attribute);
        self
    }

    /// Add an accessor property to the class, with the specified attribute.
    ///
    /// It is added to `prototype`.
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
        self.builder.accessor(key, get, set, attribute);
        self
    }

    /// Add a static accessor property to the class, with the specified attribute.
    ///
    /// It is added to class object itself.
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
        self.builder.static_accessor(key, get, set, attribute);
        self
    }

    /// Add a property descriptor to the class, with the specified attribute.
    ///
    /// It is added to `prototype`.
    pub fn property_descriptor<K, P>(&mut self, key: K, property: P) -> &mut Self
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        self.builder.property_descriptor(key, property);
        self
    }

    /// Add a static property descriptor to the class, with the specified attribute.
    ///
    /// It is added to class object itself.
    pub fn static_property_descriptor<K, P>(&mut self, key: K, property: P) -> &mut Self
    where
        K: Into<PropertyKey>,
        P: Into<PropertyDescriptor>,
    {
        self.builder.static_property_descriptor(key, property);
        self
    }

    /// Return the current context.
    #[inline]
    pub fn context(&mut self) -> &mut Context {
        self.builder.context()
    }
}
