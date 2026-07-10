const { Pool } = require('pg');
const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');

let dbClient;
let memDb;
let memPool;

function createMemoryDb() {
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    implementation: () => require('uuid').v4()
  });
  return db.adapters.createPg();
}

async function initializeDatabase() {
  if (process.env.DATABASE_URL) {
    dbClient = new Pool({ connectionString: process.env.DATABASE_URL });
    await dbClient.query('SELECT 1');
    return { type: 'postgres', client: dbClient };
  }

  if (!memDb) {
    memDb = createMemoryDb();
    memPool = new memDb.Pool();
  }

  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '001_init.sql'), 'utf8');
  await memPool.query(sql);
  return { type: 'memory', client: memPool };
}

async function query(text, params) {
  if (dbClient) {
    return dbClient.query(text, params);
  }
  return memPool.query(text, params);
}

module.exports = { initializeDatabase, query };
