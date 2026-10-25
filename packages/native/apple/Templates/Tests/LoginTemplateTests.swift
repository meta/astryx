// Copyright (c) Meta Platforms, Inc. and affiliates.

import Testing
@testable import AstryxTemplates

@Test func loginRequiresBothFields() {
  var form = LoginForm()
  form.email = "you@example.com"
  #expect(form.submit() == false)
  #expect(form.error == "Please enter both email and password.")
  #expect(form.isLoading == false)
}

@Test func loginStartsLoadingAndClearsTheError() {
  var form = LoginForm()
  _ = form.submit()
  form.email = "you@example.com"
  form.password = "secret"
  #expect(form.submit() == true)
  #expect(form.error == nil)
  #expect(form.isLoading == true)
}
