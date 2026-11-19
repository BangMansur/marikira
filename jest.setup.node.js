// Deterministic-enough secure randomness for uuidv7 in Node tests.
const { setRandomSource } = require('./src/core/id');
const { randomFillSync } = require('crypto');
setRandomSource((b) => randomFillSync(b));
