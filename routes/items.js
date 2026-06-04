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

// 1. Fetch Categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await db.query('SELECT * FROM categories ORDER BY name');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Database query error' });
  }
});

// 2. Fetch Locations
router.get('/locations', async (req, res) => {
  try {
    const locations = await db.query('SELECT * FROM locations ORDER BY name');
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Database query error' });
  }
});

// 3. Add Lost Item (using sp_AddLostItem or direct insert if MySQL off)
router.post('/lost', authenticateToken, async (req, res) => {
  const { title, description, category_id, location_id, color, lost_date } = req.body;
  const user_id = req.user.userId;

  if (!title || !category_id || !location_id || !color || !lost_date) {
    return res.status(400).json({ error: 'Please enter all required fields' });
  }

  try {
    if (db.isConnected()) {
      // Set session variable so MySQL triggers know who is doing it
      await db.query('SET @current_user_id = ?', [user_id]);
      
      // Execute stored procedure
      await db.query(
        'CALL sp_AddLostItem(?, ?, ?, ?, ?, ?, ?)',
        [user_id, title, description || '', category_id, location_id, color, lost_date]
      );
      res.status(201).json({ message: 'Lost item reported successfully!' });
    } else {
      // Fallback
      await db.query('INSERT INTO lost_items (user_id, title, description, category_id, location_id, color, lost_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, title, description || '', category_id, location_id, color, lost_date]
      );
      res.status(201).json({ message: 'Lost item reported successfully (Demo Mode)!' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Add Found Item (using sp_AddFoundItem or direct insert if MySQL off)
router.post('/found', authenticateToken, async (req, res) => {
  const { title, description, category_id, location_id, color, found_date } = req.body;
  const user_id = req.user.userId;

  if (!title || !category_id || !location_id || !color || !found_date) {
    return res.status(400).json({ error: 'Please enter all required fields' });
  }

  try {
    if (db.isConnected()) {
      await db.query('SET @current_user_id = ?', [user_id]);
      await db.query(
        'CALL sp_AddFoundItem(?, ?, ?, ?, ?, ?, ?)',
        [user_id, title, description || '', category_id, location_id, color, found_date]
      );
      res.status(201).json({ message: 'Found item reported successfully!' });
    } else {
      // Fallback
      await db.query('INSERT INTO found_items (user_id, title, description, category_id, location_id, color, found_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, title, description || '', category_id, location_id, color, found_date]
      );
      res.status(201).json({ message: 'Found item reported successfully (Demo Mode)!' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. Search Items (Advanced Filters)
router.get('/search', async (req, res) => {
  const { type, title, category_id, location_id, color, start_date, end_date } = req.query;
  const itemType = type || 'lost';

  try {
    if (db.isConnected()) {
      // Call SQL search procedure
      const results = await db.query(
        'CALL sp_SearchItems(?, ?, ?, ?, ?, ?, ?)',
        [
          itemType,
          title || null,
          category_id ? parseInt(category_id) : null,
          location_id ? parseInt(location_id) : null,
          color || null,
          start_date || null,
          end_date || null
        ]
      );
      // Stored procedures in mysql2 return nested array [[records], metadata]
      res.json(results[0] || []);
    } else {
      // Memory Filtering for Demonstration Mode
      let list = itemType === 'lost' ? db.mockDb.lost_items : db.mockDb.found_items;
      
      let filtered = list.map(item => {
        const u = db.mockDb.users.find(x => x.user_id === item.user_id) || {};
        const c = db.mockDb.categories.find(x => x.category_id === item.category_id) || {};
        const l = db.mockDb.locations.find(x => x.location_id === item.location_id) || {};
        return {
          ...item,
          category_name: c.name,
          location_name: l.name,
          reporter_name: u.name,
          finder_name: u.name
        };
      });

      if (title) {
        filtered = filtered.filter(item => item.title.toLowerCase().includes(title.toLowerCase()));
      }
      if (category_id) {
        filtered = filtered.filter(item => item.category_id === parseInt(category_id));
      }
      if (location_id) {
        filtered = filtered.filter(item => item.location_id === parseInt(location_id));
      }
      if (color) {
        filtered = filtered.filter(item => item.color.toLowerCase() === color.toLowerCase());
      }
      if (start_date) {
        const sd = new Date(start_date);
        filtered = filtered.filter(item => new Date(item.lost_date || item.found_date) >= sd);
      }
      if (end_date) {
        const ed = new Date(end_date);
        filtered = filtered.filter(item => new Date(item.lost_date || item.found_date) <= ed);
      }

      res.json(filtered);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Search error' });
  }
});

// 6. Get Match Suggestions
router.get('/matches', authenticateToken, async (req, res) => {
  try {
    let matches;
    if (db.isConnected()) {
      matches = await db.query(`
        SELECT m.match_id, m.match_score, m.status, m.created_at,
               l.title AS lost_title, l.lost_id, u1.name AS lost_reporter,
               f.title AS found_title, f.found_id, u2.name AS found_finder
        FROM match_suggestions m
        JOIN lost_items l ON m.lost_id = l.lost_id
        JOIN found_items f ON m.found_id = f.found_id
        JOIN users u1 ON l.user_id = u1.user_id
        JOIN users u2 ON f.user_id = u2.user_id
        ORDER BY m.match_score DESC
      `);
    } else {
      matches = await db.query('SELECT * FROM match_suggestions');
    }
    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 7. Get Notifications for current user
router.get('/notifications', authenticateToken, async (req, res) => {
  const user_id = req.user.userId;
  try {
    const notifications = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
      [user_id]
    );
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 8. Mark Notifications as Read
router.post('/notifications/read', authenticateToken, async (req, res) => {
  const user_id = req.user.userId;
  try {
    await db.query(
      'UPDATE notifications SET status = "read" WHERE user_id = ? AND status = "unread"',
      [user_id]
    );
    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
