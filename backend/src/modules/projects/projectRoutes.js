const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/db');
const { authMiddleware } = require('../../middleware/auth');
const { requireProjectMembership } = require('../../middleware/membership');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const result = await query(
    `SELECT p.id, p.name, p.description, p.owner_id, p.created_at
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1`,
    [req.user.id]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { name, description } = req.body;
  const projectId = uuidv4();
  const projectResult = await query(
    'INSERT INTO projects (id, name, description, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [projectId, name, description, req.user.id]
  );
  const project = projectResult.rows[0];
  await query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)', [project.id, req.user.id, 'owner']);
  const defaultColumns = [
    { id: uuidv4(), title: 'Backlog', position: 0 },
    { id: uuidv4(), title: 'Todo', position: 1 },
    { id: uuidv4(), title: 'In Progress', position: 2 },
    { id: uuidv4(), title: 'Review', position: 3 },
    { id: uuidv4(), title: 'Done', position: 4 }
  ];
  for (const column of defaultColumns) {
    await query('INSERT INTO columns (id, project_id, title, position) VALUES ($1, $2, $3, $4)', [column.id, project.id, column.title, column.position]);
  }
  res.status(201).json(project);
});

router.post('/:projectId/members', requireProjectMembership, async (req, res) => {
  const { email, role = 'member' } = req.body;
  const userResult = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

  await query('INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [req.params.projectId, userResult.rows[0].id, role]);
  res.json({ ok: true });
});

router.delete('/:projectId', requireProjectMembership, async (req, res) => {
  const projectResult = await query('SELECT owner_id FROM projects WHERE id = $1', [req.params.projectId]);
  const project = projectResult.rows[0];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the project owner can delete the project' });

  await query('DELETE FROM projects WHERE id = $1', [req.params.projectId]);
  res.json({ ok: true });
});

module.exports = router;
