const { query } = require('../config/db');

async function requireProjectMembership(req, res, next) {
  const projectId = req.params.projectId || req.body.projectId || req.query.projectId;
  if (!projectId) {
    return res.status(400).json({ error: 'Project id is required' });
  }

  const memberResult = await query(
    'SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );

  if (memberResult.rows.length === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.projectId = projectId;
  next();
}

module.exports = { requireProjectMembership };
