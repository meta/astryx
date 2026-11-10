(function () {
  let b = "hello";
  for (let a = 10; a < 100; a += 5) {
    if (a < 50) {
      b += "world";
    }
  }

  return b;
})();
