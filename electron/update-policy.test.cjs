const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updateBlockReason } = require('./update-policy.cjs');
test('open shift blocks installation', () => {
  assert.equal(updateBlockReason([{ id: '1' }], []), 'أغلق الوردية قبل تثبيت التحديث');
});
test('held invoice blocks installation', () => {
  assert.equal(updateBlockReason([], [{ id: '1' }]), 'أكمل الفواتير المعلقة قبل تثبيت التحديث');
});
test('closed shift allows installation', () => {
  assert.equal(updateBlockReason([{ closedAt: '2026-10-16' }], []), null);
});