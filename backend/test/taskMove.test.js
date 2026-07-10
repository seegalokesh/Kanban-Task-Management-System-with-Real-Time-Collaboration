const test = require('node:test');
const assert = require('node:assert/strict');
const { applyTaskMove } = require('../src/modules/tasks/taskMove');

test('reorders tasks within the same column', () => {
  const tasks = [
    { id: 't1', column_id: 'c1', position: 0 },
    { id: 't2', column_id: 'c1', position: 1 },
    { id: 't3', column_id: 'c1', position: 2 }
  ];

  const result = applyTaskMove(tasks, 't1', 'c1', 2);
  assert.equal(result.find((task) => task.id === 't1').position, 2);
  assert.equal(result.find((task) => task.id === 't2').position, 0);
});

test('moves a task to a different column', () => {
  const tasks = [
    { id: 't1', column_id: 'c1', position: 0 },
    { id: 't2', column_id: 'c1', position: 1 },
    { id: 't3', column_id: 'c2', position: 0 }
  ];

  const result = applyTaskMove(tasks, 't1', 'c2', 1);
  assert.equal(result.find((task) => task.id === 't1').column_id, 'c2');
  assert.equal(result.find((task) => task.id === 't1').position, 1);
});
