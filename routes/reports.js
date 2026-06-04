const express = require('express');
const router = express.Router();
const db = require('../config/db');

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

// Helper to convert JSON arrays to CSV string
function convertToCSV(array) {
  if (array.length === 0) return '';
  const headers = Object.keys(array[0]);
  const csvRows = [
    headers.join(','), // headers row
    ...array.map(row => 
      headers.map(fieldName => {
        let value = row[fieldName];
        if (value instanceof Date) {
          value = value.toISOString();
        } else if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'object') {
          value = JSON.stringify(value);
        }
        // Escape quotes
        const escaped = ('' + value).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];
  return csvRows.join('\n');
}

// 1. Get Dashboard Summary Statistics (from vw_monthly_statistics)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    let stats;
    if (db.isConnected()) {
      const results = await db.query('SELECT * FROM vw_monthly_statistics');
      stats = results[0];
    } else {
      // Direct mock response
      const results = await db.query('SELECT * FROM dashboard_stats');
      stats = results[0];
    }
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database stats error' });
  }
});

// 2. Get Monthly Charts Data (from sp_GenerateMonthlyReport)
router.get('/monthly', authenticateToken, async (req, res) => {
  const year = req.query.year || new Date().getFullYear();
  try {
    if (db.isConnected()) {
      const results = await db.query('CALL sp_GenerateMonthlyReport(?)', [parseInt(year)]);
      res.json(results[0] || []);
    } else {
      // In Fallback Mock Mode, generate mockup months
      const mockMonthlyStats = [
        { month_name: 'January', lost_items: 2, found_items: 1, returned_items: 0 },
        { month_name: 'February', lost_items: 4, found_items: 3, returned_items: 1 },
        { month_name: 'March', lost_items: 5, found_items: 4, returned_items: 2 },
        { month_name: 'April', lost_items: 8, found_items: 6, returned_items: 4 },
        { month_name: 'May', lost_items: 12, found_items: 10, returned_items: 7 },
        { month_name: 'June', lost_items: db.mockDb.lost_items.length + 3, found_items: db.mockDb.found_items.length + 4, returned_items: 2 },
        { month_name: 'July', lost_items: 0, found_items: 0, returned_items: 0 },
        { month_name: 'August', lost_items: 0, found_items: 0, returned_items: 0 },
        { month_name: 'September', lost_items: 0, found_items: 0, returned_items: 0 },
        { month_name: 'October', lost_items: 0, found_items: 0, returned_items: 0 },
        { month_name: 'November', lost_items: 0, found_items: 0, returned_items: 0 },
        { month_name: 'December', lost_items: 0, found_items: 0, returned_items: 0 }
      ];
      res.json(mockMonthlyStats);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database chart error' });
  }
});

// 3. Export Center APIs
router.get('/export/:table', authenticateToken, adminOnly, async (req, res) => {
  const table = req.params.table;
  const format = req.query.format || 'json'; // json or csv

  let sql = '';
  switch (table) {
    case 'lost':
      sql = 'SELECT * FROM lost_items ORDER BY lost_id DESC';
      break;
    case 'found':
      sql = 'SELECT * FROM found_items ORDER BY found_id DESC';
      break;
    case 'claims':
      sql = 'SELECT * FROM claims ORDER BY claim_id DESC';
      break;
    case 'audit':
      sql = 'SELECT * FROM audit_log ORDER BY log_id DESC';
      break;
    case 'notifications':
      sql = 'SELECT * FROM notifications ORDER BY notification_id DESC';
      break;
    case 'summary':
      sql = 'SELECT * FROM vw_monthly_statistics';
      break;
    default:
      return res.status(400).json({ error: 'Invalid export category' });
  }

  try {
    let data;
    if (db.isConnected()) {
      data = await db.query(sql);
    } else {
      // In Fallback Mock Mode, grab mock list directly
      if (table === 'lost') data = db.mockDb.lost_items;
      else if (table === 'found') data = db.mockDb.found_items;
      else if (table === 'claims') data = db.mockDb.claims;
      else if (table === 'audit') data = db.mockDb.audit_log;
      else if (table === 'notifications') data = db.mockDb.notifications;
      else if (table === 'summary') {
        data = [{
          total_users: db.mockDb.users.length,
          total_lost: db.mockDb.lost_items.length,
          total_found: db.mockDb.found_items.length,
          total_matches: db.mockDb.match_suggestions.length,
          pending_claims: db.mockDb.claims.filter(c => c.status === 'pending').length,
          approved_claims: db.mockDb.claims.filter(c => c.status === 'approved').length,
          rejected_claims: db.mockDb.claims.filter(c => c.status === 'rejected').length,
          returned_items: db.mockDb.lost_items.filter(i => i.status === 'returned').length + db.mockDb.found_items.filter(i => i.status === 'returned').length,
          active_notifications: db.mockDb.notifications.filter(n => n.status === 'unread').length,
          audit_logs_count: db.mockDb.audit_log.length
        }];
      }
    }

    if (format === 'csv') {
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=lost_found_export_${table}_${Date.now()}.csv`);
      return res.status(200).send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=lost_found_export_${table}_${Date.now()}.json`);
      return res.json(data);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Data export compilation failed' });
  }
});

module.exports = router;
