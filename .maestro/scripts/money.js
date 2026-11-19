/* global output -- provided by Maestro's JavaScript runtime */
// Parse an on-screen amount ("RM1,234.50", "-RM60.00") into whole sen (integer maths only).
function sen(text) {
  const m = /^([+-])?RM([\d,]+)\.(\d{2})$/.exec(String(text).trim());
  if (!m) throw new Error('Not a money string: ' + text);
  const v = Number(m[2].replace(/,/g, '')) * 100 + Number(m[3]);
  return m[1] === '-' ? -v : v;
}
output.sen = sen;
