const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/db');
const { authMiddleware } = require('../../middleware/auth');
const { requireProjectMembership } = require('../../middleware/membership');
const { emitProjectEvent } = require('../websocket/socket');

const router = express.Router();
router.use(authMiddleware);

const uploadDir = process.env.UPLOAD_DIR || './uploads';
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

function isAllowedMime(mimeType) {
  return ['image/png', 'image/jpeg', 'image/gif', 'application/pdf', 'text/plain'].includes(mimeType);
}

async function getProjectIdForTask(taskId) {
  const result = await query('SELECT project_id FROM tasks WHERE id = $1', [taskId]);
  return result.rows[0]?.project_id;
}

router.get('/:projectId/tasks', requireProjectMembership, async (req, res) => {
  const projectId = req.params.projectId;
  const tasksResult = await query(
    `SELECT t.*, u.name as assignee_name FROM tasks t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.project_id = $1 AND t.deleted_at IS NULL
     ORDER BY t.column_id, t.position`,
    [projectId]
  );
  const columnsResult = await query('SELECT * FROM columns WHERE project_id = $1 ORDER BY position', [projectId]);
  res.json({ columns: columnsResult.rows, tasks: tasksResult.rows });
});

router.post('/:projectId/tasks', requireProjectMembership, async (req, res) => {
  const { title, description, columnId, position, priority, assignedTo } = req.body;
  const taskId = uuidv4();
  const result = await query(
    'INSERT INTO tasks (id, project_id, column_id, title, description, position, priority, assigned_to) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [taskId, req.params.projectId, columnId, title, description, position ?? 0, priority || 'medium', assignedTo || null]
  );
  const task = result.rows[0];
  emitProjectEvent(req.params.projectId, 'task:created', task);
  res.status(201).json(task);
});

router.patch('/:projectId/tasks/:id', requireProjectMembership, async (req, res) => {
  const { title, description, priority, assignedTo } = req.body;
  const result = await query(
    'UPDATE tasks SET title = COALESCE($1, title), description = COALESCE($2, description), priority = COALESCE($3, priority), assigned_to = COALESCE($4, assigned_to), updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [title, description, priority, assignedTo, req.params.id]
  );
  const updatedTask = result.rows[0];
  emitProjectEvent(req.params.projectId, 'task:updated', updatedTask);
  res.json(updatedTask);
});

router.patch('/:projectId/tasks/:id/move', requireProjectMembership, async (req, res) => {
  const { columnId, position } = req.body;
  const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const task = taskResult.rows[0];
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const oldColumnId = task.column_id;
  const oldPosition = task.position;

  if (oldColumnId === columnId) {
    if (position > oldPosition) {
      await query('UPDATE tasks SET position = position - 1 WHERE column_id = $1 AND position > $2 AND position <= $3', [columnId, oldPosition, position]);
    } else if (position < oldPosition) {
      await query('UPDATE tasks SET position = position + 1 WHERE column_id = $1 AND position >= $2 AND position < $3', [columnId, position, oldPosition]);
    }
  } else {
    await query('UPDATE tasks SET position = position - 1 WHERE column_id = $1 AND position > $2', [oldColumnId, oldPosition]);
    await query('UPDATE tasks SET position = position + 1 WHERE column_id = $1 AND position >= $2', [columnId, position]);
  }

  const updatedResult = await query('UPDATE tasks SET column_id = $1, position = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *', [columnId, position, req.params.id]);
  const movedTask = updatedResult.rows[0];
  emitProjectEvent(req.params.projectId, 'task:moved', movedTask);
  res.json(movedTask);
});

router.delete('/:projectId/tasks/:id', requireProjectMembership, async (req, res) => {
  await query('UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
  emitProjectEvent(req.params.projectId, 'task:deleted', { id: req.params.id });
  res.json({ ok: true });
});

router.post('/:projectId/tasks/:id/comments', requireProjectMembership, async (req, res) => {
  const { content } = req.body;
  const commentId = uuidv4();
  const result = await query('INSERT INTO comments (id, task_id, user_id, content) VALUES ($1, $2, $3, $4) RETURNING *', [commentId, req.params.id, req.user.id, content]);
  const comment = result.rows[0];
  emitProjectEvent(req.params.projectId, 'comment:added', comment);
  res.status(201).json(comment);
});

router.get('/:projectId/tasks/:id/comments', requireProjectMembership, async (req, res) => {
  const result = await query('SELECT c.*, u.name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = $1 ORDER BY c.created_at', [req.params.id]);
  res.json(result.rows);
});

router.post('/:projectId/tasks/:id/attachments', requireProjectMembership, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!isAllowedMime(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported mime type' });

  const attachmentId = uuidv4();
  const result = await query(
    'INSERT INTO attachments (id, task_id, user_id, original_name, stored_name, mime_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [attachmentId, req.params.id, req.user.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/:projectId/attachments/:fileId', requireProjectMembership, async (req, res) => {
  const attachmentResult = await query('SELECT * FROM attachments WHERE id = $1', [req.params.fileId]);
  const attachment = attachmentResult.rows[0];
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  const filePath = path.join(process.env.UPLOAD_DIR || './uploads', attachment.stored_name);
  res.sendFile(path.resolve(filePath));
});

module.exports = router;
