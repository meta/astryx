use boa_macros::js_str;

use crate::{
    Context, JsExpect, JsResult,
    builtins::function::{OrdinaryFunction, set_function_name},
    object::internal_methods::InternalMethodPropertyContext,
    property::PropertyDescriptor,
    vm::opcode::{IndexOperand, Operation, RegisterOperand},
};

/// `DefineClassStaticSetterByName` implements the Opcode Operation for `Opcode::DefineClassStaticSetterByName`
///
/// Operation:
///  - Defines a class setter by name.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassStaticSetterByName;

impl DefineClassStaticSetterByName {
    #[inline(always)]
    pub(crate) fn operation(
        (function, class, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let class = context.vm.get_register(class.into()).clone();
        let class = class.as_object().js_expect("class must be object")?;
        let key = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, Some(js_str!("set")), context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class.clone());
        }
        let get = class
            .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();

        class.__define_own_property__(
            &key,
            PropertyDescriptor::builder()
                .maybe_set(Some(function.clone()))
                .maybe_get(get)
                .enumerable(false)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;
        Ok(())
    }
}

impl Operation for DefineClassStaticSetterByName {
    const NAME: &'static str = "DefineClassStaticSetterByName";
    const INSTRUCTION: &'static str = "INST - DefineClassStaticSetterByName";
    const COST: u8 = 6;
}

/// `DefineClassSetterByName` implements the Opcode Operation for `Opcode::DefineClassSetterByName`
///
/// Operation:
///  - Defines a class setter by name.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassSetterByName;

impl DefineClassSetterByName {
    #[inline(always)]
    pub(crate) fn operation(
        (function, class_proto, index): (RegisterOperand, RegisterOperand, IndexOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let class_proto = context.vm.get_register(class_proto.into()).clone();
        let class_proto = class_proto.as_object().js_expect("class must be object")?;
        let key = context
            .vm
            .frame()
            .code_block()
            .constant_string(index.into())
            .into();
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, Some(js_str!("set")), context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class_proto.clone());
        }
        let get = class_proto
            .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();

        class_proto.__define_own_property__(
            &key,
            PropertyDescriptor::builder()
                .maybe_set(Some(function.clone()))
                .maybe_get(get)
                .enumerable(false)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;

        Ok(())
    }
}

impl Operation for DefineClassSetterByName {
    const NAME: &'static str = "DefineClassSetterByName";
    const INSTRUCTION: &'static str = "INST - DefineClassSetterByName";
    const COST: u8 = 6;
}

/// `DefineClassStaticSetterByValue` implements the Opcode Operation for `Opcode::DefineClassStaticSetterByValue`
///
/// Operation:
///  - Defines a class setter by value.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassStaticSetterByValue;

impl DefineClassStaticSetterByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (function, key, class): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let class = context.vm.get_register(class.into()).clone();
        let class = class.as_object().js_expect("class must be object")?;
        let key = key.to_property_key(context)?;
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, Some(js_str!("set")), context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class.clone());
        }
        let get = class
            .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();

        class.define_property_or_throw(
            key,
            PropertyDescriptor::builder()
                .maybe_set(Some(function.clone()))
                .maybe_get(get)
                .enumerable(false)
                .configurable(true)
                .build(),
            context,
        )?;

        Ok(())
    }
}

impl Operation for DefineClassStaticSetterByValue {
    const NAME: &'static str = "DefineClassStaticSetterByValue";
    const INSTRUCTION: &'static str = "INST - DefineClassStaticSetterByValue";
    const COST: u8 = 6;
}

/// `DefineClassSetterByValue` implements the Opcode Operation for `Opcode::DefineClassSetterByValue`
///
/// Operation:
///  - Defines a class setter by value.
#[derive(Debug, Clone, Copy)]
pub(crate) struct DefineClassSetterByValue;

impl DefineClassSetterByValue {
    #[inline(always)]
    pub(crate) fn operation(
        (function, key, class_proto): (RegisterOperand, RegisterOperand, RegisterOperand),
        context: &mut Context,
    ) -> JsResult<()> {
        let function = context.vm.get_register(function.into()).clone();
        let key = context.vm.get_register(key.into()).clone();
        let class_proto = context.vm.get_register(class_proto.into()).clone();
        let class_proto = class_proto.as_object().js_expect("class must be object")?;
        let key = key.to_property_key(context)?;
        {
            let function_object = function
                .as_object()
                .js_expect("method must be function object")?;
            set_function_name(&function_object, &key, Some(js_str!("set")), context)?;
            function_object
                .downcast_mut::<OrdinaryFunction>()
                .js_expect("method must be function object")?
                .set_home_object(class_proto.clone());
        }
        let get = class_proto
            .__get_own_property__(&key, &mut InternalMethodPropertyContext::new(context))?
            .as_ref()
            .and_then(PropertyDescriptor::get)
            .cloned();

        class_proto.__define_own_property__(
            &key,
            PropertyDescriptor::builder()
                .maybe_set(Some(function.clone()))
                .maybe_get(get)
                .enumerable(false)
                .configurable(true)
                .build(),
            &mut InternalMethodPropertyContext::new(context),
        )?;

        Ok(())
    }
}

impl Operation for DefineClassSetterByValue {
    const NAME: &'static str = "DefineClassSetterByValue";
    const INSTRUCTION: &'static str = "INST - DefineClassSetterByValue";
    const COST: u8 = 6;
}
