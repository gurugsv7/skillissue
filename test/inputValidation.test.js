const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidAccessToken } = require('../src/utils/inputValidation');

test('accepts generated and approved custom access-token formats', () => {
    assert.equal(isValidAccessToken('SKI-1234567890abcdefghijklmn'), true);
    assert.equal(isValidAccessToken('gurugsv7'), true);
});

test('rejects malformed access tokens', () => {
    assert.equal(isValidAccessToken('short'), false);
    assert.equal(isValidAccessToken('contains spaces'), false);
    assert.equal(isValidAccessToken('contains/slash'), false);
});
