'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

async function migrate() {
  var sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('[migrate] Database schema applied');
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(function (err) {
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
}
