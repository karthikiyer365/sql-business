// Run: node scripts/check_test.mjs
import assert from 'node:assert/strict';
import { sameResult } from '../assets/check.js';

const r = (columns, rows) => ({ columns, rows });

assert.ok(sameResult(r(['a'], [[2801]]), r(['repeat_customers'], [[2801]])), 'column names ignored');
assert.ok(sameResult(r(['t', 'x'], [['repeat', 259.87], ['one-time', 137.63]]), r(['t', 'x'], [['one-time', 137.6299], ['repeat', 259.87]])), 'row order + 2dp');
assert.ok(!sameResult(r(['t', 'x'], [['b', 1], ['a', 2]]), r(['t', 'x'], [['a', 2], ['b', 1]]), true), 'order matters when ordered');
assert.ok(!sameResult(r(['a'], [[1]]), r(['a', 'b'], [[1, 2]])), 'column count differs');
assert.ok(!sameResult(r(['a'], [[0]]), r(['a'], [[2997]])), 'value differs');
assert.ok(!sameResult(r(['a'], [[1], [1]]), r(['a'], [[1]])), 'duplicate rows count');
console.log('check.js ok');
