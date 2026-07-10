const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

test('bcrypt hashes a password', async () => {
  const hash = await bcrypt.hash('secret', 10);
  const valid = await bcrypt.compare('secret', hash);
  assert.equal(valid, true);
});
