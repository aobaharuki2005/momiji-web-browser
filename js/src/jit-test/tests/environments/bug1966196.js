// |jit-test|

let REPEAT_COUNT = 300;
let someCondition = Math.random() > 0.5;
function generateJS() {
  let str = "if (someCondition) {let foo;".repeat(REPEAT_COUNT) +
      "}".repeat(REPEAT_COUNT);
  return str;
}
eval(generateJS());
