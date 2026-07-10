function normalizeColumnTasks(columnTasks) {
  return columnTasks.slice().map((task, index) => ({ ...task, position: index }));
}

function applyTaskMove(tasks, taskId, targetColumnId, targetIndex) {
  const taskToMove = tasks.find((task) => task.id === taskId);
  if (!taskToMove) {
    return tasks;
  }

  const sourceColumnId = taskToMove.column_id;
  const otherTasks = tasks
    .filter((task) => task.id !== taskId)
    .map((task) => ({ ...task }));

  const sourceTasks = otherTasks
    .filter((task) => task.column_id === sourceColumnId)
    .sort((a, b) => a.position - b.position);
  const destinationTasks = otherTasks
    .filter((task) => task.column_id === targetColumnId)
    .sort((a, b) => a.position - b.position);
  const tasksOutsideColumns = otherTasks.filter(
    (task) => task.column_id !== sourceColumnId && task.column_id !== targetColumnId
  );

  const movedTask = { ...taskToMove, column_id: targetColumnId, position: 0 };
  const insertAt = Math.max(0, Math.min(targetIndex, destinationTasks.length));

  const rebuiltDestinationTasks = [
    ...destinationTasks.slice(0, insertAt),
    movedTask,
    ...destinationTasks.slice(insertAt)
  ];

  const rebuiltSourceTasks = sourceTasks.filter((task) => task.id !== taskId);

  const rebuiltTasks = [
    ...tasksOutsideColumns,
    ...normalizeColumnTasks(rebuiltSourceTasks),
    ...normalizeColumnTasks(rebuiltDestinationTasks)
  ];

  if (sourceColumnId === targetColumnId) {
    const sameColumnTasks = otherTasks
      .filter((task) => task.column_id === sourceColumnId)
      .sort((a, b) => a.position - b.position);
    const reorderedTasks = [
      ...sameColumnTasks.slice(0, targetIndex),
      movedTask,
      ...sameColumnTasks.slice(targetIndex)
    ];

    return [
      ...tasksOutsideColumns,
      ...normalizeColumnTasks(reorderedTasks)
    ];
  }

  return rebuiltTasks;
}

module.exports = { applyTaskMove };
