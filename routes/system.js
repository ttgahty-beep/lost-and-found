const express = require('express');
const router = express.Router();
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// Helper middleware to check JWT token and inject user details
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'lostfounddbms_secret_2026';
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid or expired' });
    req.user = user;
    next();
  });
}

function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
}

// 1. Database Monitor Details
router.get('/monitor', authenticateToken, adminOnly, async (req, res) => {
  try {
    let stats = {
      connected: db.isConnected(),
      error: db.getError(),
      total_tables: 9,
      total_records: 0,
      db_size: '0.00 MB',
      last_inserted: 'N/A',
      last_updated: 'N/A',
      active_users: 1,
      recent_activity: []
    };

    if (db.isConnected()) {
      // Get table sizes and total records from information_schema
      const sizeResults = await db.query(`
        SELECT 
          COUNT(table_name) AS table_count,
          SUM(table_rows) AS row_count,
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS db_size_mb
        FROM information_schema.tables 
        WHERE table_schema = ?
      `, [process.env.DB_NAME || 'lost_and_found_db']);

      if (sizeResults && sizeResults.length > 0) {
        stats.total_tables = sizeResults[0].table_count || 9;
        stats.total_records = parseInt(sizeResults[0].row_count) || 0;
        stats.db_size = `${sizeResults[0].db_size_mb || '0.05'} MB`;
      }

      // Fetch last inserted audit record
      const lastInsert = await db.query(
        'SELECT action_timestamp FROM audit_log WHERE action_type = "INSERT" ORDER BY action_timestamp DESC LIMIT 1'
      );
      if (lastInsert.length > 0) {
        stats.last_inserted = lastInsert[0].action_timestamp;
      }

      // Fetch last updated audit record
      const lastUpdate = await db.query(
        'SELECT action_timestamp FROM audit_log WHERE action_type = "UPDATE" ORDER BY action_timestamp DESC LIMIT 1'
      );
      if (lastUpdate.length > 0) {
        stats.last_updated = lastUpdate[0].action_timestamp;
      }

      // Get count of users registered in the last 24h
      const activeCount = await db.query(
        'SELECT COUNT(*) AS active FROM users WHERE created_at >= NOW() - INTERVAL 1 DAY'
      );
      stats.active_users = activeCount[0].active || 1;

      // Get recent transactions (e.g. claims)
      const recentTx = await db.query(`
        SELECT action_type, table_name, record_id, action_timestamp 
        FROM audit_log 
        ORDER BY action_timestamp DESC LIMIT 5
      `);
      stats.recent_activity = recentTx;

    } else {
      // In Fallback Mock Mode, calculate statistics dynamically from mock database state
      const totalRecs = 
        db.mockDb.users.length +
        db.mockDb.categories.length +
        db.mockDb.locations.length +
        db.mockDb.lost_items.length +
        db.mockDb.found_items.length +
        db.mockDb.match_suggestions.length +
        db.mockDb.claims.length +
        db.mockDb.notifications.length +
        db.mockDb.audit_log.length;

      stats.total_records = totalRecs;
      stats.db_size = '0.04 MB (Demo Mode)';
      if (db.mockDb.audit_log.length > 0) {
        const sortedLogs = [...db.mockDb.audit_log].sort((a,b) => b.action_timestamp - a.action_timestamp);
        stats.last_inserted = sortedLogs.find(l => l.action_type === 'INSERT')?.action_timestamp || 'N/A';
        stats.last_updated = sortedLogs.find(l => l.action_type === 'UPDATE')?.action_timestamp || 'N/A';
        stats.recent_activity = sortedLogs.slice(0, 5).map(l => ({
          action_type: l.action_type,
          table_name: l.table_name,
          record_id: l.record_id,
          action_timestamp: l.action_timestamp
        }));
      }
    }

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'System monitor fetch failed' });
  }
});

// 2. Fetch Audit Logs (View vw_audit_summary)
router.get('/audit', authenticateToken, adminOnly, async (req, res) => {
  try {
    let auditLogs;
    if (db.isConnected()) {
      auditLogs = await db.query('SELECT * FROM vw_audit_summary ORDER BY action_timestamp DESC LIMIT 100');
    } else {
      auditLogs = await db.query('SELECT * FROM vw_audit_summary');
    }
    res.json(auditLogs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Audit log fetch failed' });
  }
});

// 3. Download Full SQL Backup (Combines schema.sql + dynamic INSERT statements)
router.get('/backup/sql', authenticateToken, adminOnly, async (req, res) => {
  try {
    // 1. Read static schema.sql
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    let sqlContent = '';
    
    if (fs.existsSync(schemaPath)) {
      sqlContent = fs.readFileSync(schemaPath, 'utf8');
    } else {
      sqlContent = '-- Smart Lost & Found DB Schema Backup\nCREATE DATABASE IF NOT EXISTS lost_and_found_db;\nUSE lost_and_found_db;\n';
    }

    sqlContent += '\n\n-- =================================================================\n';
    sqlContent += '-- BACKUP DATA SEED DUMP (Generated dynamically on ' + new Date().toISOString() + ')\n';
    sqlContent += '-- =================================================================\n\n';

    // Disable foreign key constraints during insertion
    sqlContent += 'SET FOREIGN_KEY_CHECKS = 0;\n\n';

    // 2. Fetch current rows for each table and append INSERT queries
    const tables = ['users', 'categories', 'locations', 'lost_items', 'found_items', 'match_suggestions', 'claims', 'notifications', 'audit_log'];
    
    for (const table of tables) {
      let rows = [];
      if (db.isConnected()) {
        rows = await db.query(`SELECT * FROM ${table}`);
      } else {
        rows = db.mockDb[table] || [];
      }

      if (rows.length > 0) {
        sqlContent += `-- Data dump for table \`${table}\` (${rows.length} rows)\n`;
        sqlContent += `TRUNCATE TABLE \`${table}\`;\n`;
        
        // Build batch INSERT statements
        for (const row of rows) {
          const keys = Object.keys(row);
          const values = keys.map(k => {
            let val = row[k];
            if (val === null || val === undefined) return 'NULL';
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "\\'")}'`;
            if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
            return val;
          });
          sqlContent += `INSERT INTO \`${table}\` (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sqlContent += '\n';
      }
    }

    // Re-enable constraints
    sqlContent += 'SET FOREIGN_KEY_CHECKS = 1;\n';

    // Send file attachment
    res.setHeader('Content-Type', 'text/sql');
    res.setHeader('Content-Disposition', `attachment; filename=lost_found_backup_${Date.now()}.sql`);
    return res.status(200).send(sqlContent);

  } catch (error) {
    console.error('Backup generation error:', error);
    res.status(500).json({ error: 'Failed to compile database SQL backup' });
  }
});

// 4. Download JSON Database Snapshot (for easy JSON exports of full db structure)
router.get('/backup/snapshot', authenticateToken, adminOnly, async (req, res) => {
  try {
    const snapshot = {
      timestamp: new Date(),
      dbConnected: db.isConnected(),
      databaseName: process.env.DB_NAME || 'lost_and_found_db',
      data: {}
    };

    const tables = ['users', 'categories', 'locations', 'lost_items', 'found_items', 'match_suggestions', 'claims', 'notifications', 'audit_log'];
    
    for (const table of tables) {
      if (db.isConnected()) {
        snapshot.data[table] = await db.query(`SELECT * FROM ${table}`);
      } else {
        snapshot.data[table] = db.mockDb[table] || [];
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=lost_found_snapshot_${Date.now()}.json`);
    return res.json(snapshot);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to compile JSON snapshot' });
  }
});

module.exports = router;
