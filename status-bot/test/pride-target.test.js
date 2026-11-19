const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePrideTarget } = require('../pride-target');

test('uses the invoking user when Discord omits their resolved user record', () => {
  const invokingUser = { id: 'self-id' };
  const options = {
    get(name, required) {
      assert.equal(name, 'member');
      assert.equal(required, true);
      return { value: invokingUser.id };
    },
    getUser() {
      assert.fail('self selection should not need resolved user data');
    },
  };

  assert.equal(resolvePrideTarget(options, invokingUser), invokingUser);
});

test('resolves another selected user through the interaction options', () => {
  const invokingUser = { id: 'self-id' };
  const selectedUser = { id: 'other-id' };
  const options = {
    get() {
      return { value: selectedUser.id };
    },
    getUser(name, required) {
      assert.equal(name, 'member');
      assert.equal(required, true);
      return selectedUser;
    },
  };

  assert.equal(resolvePrideTarget(options, invokingUser), selectedUser);
});
