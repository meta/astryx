(() => {
  let sum = "";
  let string = "Hello, world!!!";
  for (let i = 0; i < string.length; ++i) {
    sum += string.charCodeAt(i).toString(16);
  }
  return sum;
})();
