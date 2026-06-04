const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let dbConnected = false;
let connectionError = null;

// Mock database storage for fallback mode
const mockDb = {
  users: [
    { user_id: 1, name: 'Admin User', email: 'admin@uni.edu', password: '', phone: '1234567890', role: 'admin', created_at: new Date() },
    { user_id: 2, name: 'Ahtesha', email: 'ahtesha@uni.edu', password: '', phone: '1112223333', role: 'user', created_at: new Date() },
    { user_id: 3, name: 'Salman', email: 'salman@uni.edu', password: '', phone: '4445556666', role: 'user', created_at: new Date() },
    { user_id: 4, name: 'Hussain', email: 'hussain@uni.edu', password: '', phone: '7778889999', role: 'user', created_at: new Date() },
    { user_id: 5, name: 'Karam', email: 'karam@uni.edu', password: '', phone: '1231231234', role: 'user', created_at: new Date() },
    { user_id: 6, name: 'Shahzaib', email: 'shahzaib@uni.edu', password: '', phone: '3213214321', role: 'user', created_at: new Date() }
  ],
  categories: [
    { category_id: 1, name: 'Electronics', description: 'Phones, laptops, chargers' },
    { category_id: 2, name: 'Documents', description: 'IDs, wallets, cards, documents' },
    { category_id: 3, name: 'Books & Stationery', description: 'Notebooks, textbooks, pens' },
    { category_id: 4, name: 'Personal Belongings', description: 'Keys, bags, bottles, clothing' }
  ],
  locations: [
    { location_id: 1, name: 'Main Library', description: 'Central campus library' },
    { location_id: 2, name: 'Block A Cafeteria', description: 'Main student cafeteria' },
    { location_id: 3, name: 'Auditorium Hall', description: 'Main auditorium building' },
    { location_id: 4, name: 'Science Lab 3', description: 'Chemistry & Physics block' }
  ],
  lost_items: [
    { lost_id: 1, user_id: 2, title: 'iPhone 15 Pro Black', description: 'Black iPhone 15 Pro, has a transparent cover and a sticker on the back.', category_id: 1, location_id: 1, color: 'Black', lost_date: '2026-06-01', status: 'matched', created_at: new Date() },
    { lost_id: 2, user_id: 3, title: 'Brown Leather Wallet', description: 'Brown wallet containing student ID card and driver license.', category_id: 2, location_id: 2, color: 'Brown', lost_date: '2026-06-02', status: 'lost', created_at: new Date() }
  ],
  found_items: [
    { found_id: 1, user_id: 4, title: 'iPhone 15 Pro Max', description: 'Found a black iPhone 15 near library stairs. Transparent cover.', category_id: 1, location_id: 1, color: 'Black', found_date: '2026-06-02', status: 'matched', created_at: new Date() },
    { found_id: 2, user_id: 5, title: 'Key Bundle with Keychain', description: 'Found a set of 3 keys with a red key holder near Cafeteria.', category_id: 4, location_id: 2, color: 'Red', found_date: '2026-06-03', status: 'found', created_at: new Date() }
  ],
  match_suggestions: [
    { match_id: 1, lost_id: 1, found_id: 1, match_score: 95.00, status: 'pending', created_at: new Date() }
  ],
  claims: [
    { claim_id: 1, lost_id: 1, found_id: 1, user_id: 2, proof: 'I can unlock the phone with my passcode. The lock screen wallpaper is a picture of a cat.', status: 'pending', admin_notes: null, created_at: new Date(), updated_at: new Date() }
  ],
  notifications: [
    { notification_id: 1, user_id: 2, title: 'Match Suggestion Found', message: 'A found item "iPhone 15 Pro Max" matches your reported "iPhone 15 Pro Black" (95% Match Score).', status: 'unread', created_at: new Date() }
  ],
  audit_log: [
    { log_id: 1, user_id: 2, action_type: 'INSERT', table_name: 'lost_items', record_id: 1, old_data: null, new_data: JSON.stringify({ title: 'iPhone 15 Pro Black' }), action_timestamp: new Date() },
    { log_id: 2, user_id: 4, action_type: 'INSERT', table_name: 'found_items', record_id: 1, old_data: null, new_data: JSON.stringify({ title: 'iPhone 15 Pro Max' }), action_timestamp: new Date() }
  ]
};

async function initDb() {
  try {
   const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
    });

    // Test the connection
    const connection = await pool.getConnection();
    console.log('✅ Success: MySQL Database connected successfully.');
    dbConnected = true;
    connection.release();
  } catch (error) {
    connectionError = error.message;
    console.warn('⚠️ Warning: Could not connect to MySQL Database. Error:', error.message);
    console.warn('⚡ Fallback: Smart Lost & Found running in MEMORY-BASED DEMO MODE.');
    dbConnected = false;
  }
}

// Custom query wrapper that routes to MySQL or falls back to in-memory mock data operations
async function query(sql, params = []) {
  if (dbConnected && pool) {
    try {
      const [results] = await pool.execute(sql, params);
      return results;
    } catch (err) {
      console.error('SQL Execution Error:', err);
      throw err;
    }
  }

  // MOCK DATABASE INTERPOLATION LOGIC
  const sqlLower = sql.toLowerCase().trim();

  // 1. AUTHENTICATION & USERS
  if (sqlLower.includes('select * from users') || sqlLower.includes('from users')) {
    if (sqlLower.includes('email = ?')) {
      const email = params[0];
      const user = mockDb.users.find(u => u.email === email);
      return user ? [user] : [];
    }
    if (sqlLower.includes('user_id = ?')) {
      const id = parseInt(params[0]);
      const user = mockDb.users.find(u => u.user_id === id);
      return user ? [user] : [];
    }
    return mockDb.users;
  }

  if (sqlLower.includes('insert into users')) {
    const newUser = {
      user_id: mockDb.users.length + 1,
      name: params[0],
      email: params[1],
      password: params[2],
      phone: params[3],
      role: params[4] || 'user',
      created_at: new Date()
    };
    mockDb.users.push(newUser);
    // Log audit
    mockDb.audit_log.push({
      log_id: mockDb.audit_log.length + 1,
      user_id: newUser.user_id,
      action_type: 'INSERT',
      table_name: 'users',
      record_id: newUser.user_id,
      old_data: null,
      new_data: JSON.stringify({ name: newUser.name, email: newUser.email }),
      action_timestamp: new Date()
    });
    return { insertId: newUser.user_id, affectedRows: 1 };
  }

  // 2. ITEMS (LOST / FOUND)
  if (sqlLower.includes('select') && sqlLower.includes('vw_active_lost_items')) {
    return mockDb.lost_items.filter(item => ['lost', 'matched'].includes(item.status)).map(item => {
      const user = mockDb.users.find(u => u.user_id === item.user_id) || {};
      const cat = mockDb.categories.find(c => c.category_id === item.category_id) || {};
      const loc = mockDb.locations.find(l => l.location_id === item.location_id) || {};
      return { ...item, reporter_name: user.name, category_name: cat.name, location_name: loc.name };
    });
  }

  if (sqlLower.includes('select') && sqlLower.includes('lost_items')) {
    // Basic formatting with join data
    return mockDb.lost_items.map(item => {
      const user = mockDb.users.find(u => u.user_id === item.user_id) || {};
      const cat = mockDb.categories.find(c => c.category_id === item.category_id) || {};
      const loc = mockDb.locations.find(l => l.location_id === item.location_id) || {};
      return { ...item, reporter_name: user.name, category_name: cat.name, location_name: loc.name };
    });
  }

  if (sqlLower.includes('select') && sqlLower.includes('found_items')) {
    return mockDb.found_items.map(item => {
      const user = mockDb.users.find(u => u.user_id === item.user_id) || {};
      const cat = mockDb.categories.find(c => c.category_id === item.category_id) || {};
      const loc = mockDb.locations.find(l => l.location_id === item.location_id) || {};
      return { ...item, finder_name: user.name, category_name: cat.name, location_name: loc.name };
    });
  }

  if (sqlLower.includes('insert into lost_items')) {
    const newItem = {
      lost_id: mockDb.lost_items.length + 1,
      user_id: params[0],
      title: params[1],
      description: params[2],
      category_id: parseInt(params[3]),
      location_id: parseInt(params[4]),
      color: params[5],
      lost_date: params[6],
      status: 'lost',
      created_at: new Date()
    };
    mockDb.lost_items.push(newItem);

    // Run simple mock matching algorithm
    mockDb.found_items.forEach(found => {
      let score = 0;
      if (found.category_id === newItem.category_id) score += 40;
      if (found.location_id === newItem.location_id) score += 20;
      if (found.color.toLowerCase() === newItem.color.toLowerCase()) score += 20;
      if (found.title.toLowerCase().includes(newItem.title.toLowerCase()) || newItem.title.toLowerCase().includes(found.title.toLowerCase())) score += 20;

      if (score >= 50) {
        found.status = 'matched';
        newItem.status = 'matched';
        const match = {
          match_id: mockDb.match_suggestions.length + 1,
          lost_id: newItem.lost_id,
          found_id: found.found_id,
          match_score: score,
          status: 'pending',
          created_at: new Date()
        };
        mockDb.match_suggestions.push(match);

        // Add Notification
        mockDb.notifications.push({
          notification_id: mockDb.notifications.length + 1,
          user_id: newItem.user_id,
          title: 'Potential Item Match Found!',
          message: `Your lost item "${newItem.title}" has a potential match with found item "${found.title}" (${score}% match score).`,
          status: 'unread',
          created_at: new Date()
        });
      }
    });

    // Log Audit
    mockDb.audit_log.push({
      log_id: mockDb.audit_log.length + 1,
      user_id: newItem.user_id,
      action_type: 'INSERT',
      table_name: 'lost_items',
      record_id: newItem.lost_id,
      old_data: null,
      new_data: JSON.stringify(newItem),
      action_timestamp: new Date()
    });

    return { insertId: newItem.lost_id, affectedRows: 1 };
  }

  if (sqlLower.includes('insert into found_items')) {
    const newItem = {
      found_id: mockDb.found_items.length + 1,
      user_id: params[0],
      title: params[1],
      description: params[2],
      category_id: parseInt(params[3]),
      location_id: parseInt(params[4]),
      color: params[5],
      found_date: params[6],
      status: 'found',
      created_at: new Date()
    };
    mockDb.found_items.push(newItem);

    // Run simple mock matching
    mockDb.lost_items.forEach(lost => {
      let score = 0;
      if (lost.category_id === newItem.category_id) score += 40;
      if (lost.location_id === newItem.location_id) score += 20;
      if (lost.color.toLowerCase() === newItem.color.toLowerCase()) score += 20;
      if (lost.title.toLowerCase().includes(newItem.title.toLowerCase()) || newItem.title.toLowerCase().includes(lost.title.toLowerCase())) score += 20;

      if (score >= 50) {
        lost.status = 'matched';
        newItem.status = 'matched';
        const match = {
          match_id: mockDb.match_suggestions.length + 1,
          lost_id: lost.lost_id,
          found_id: newItem.found_id,
          match_score: score,
          status: 'pending',
          created_at: new Date()
        };
        mockDb.match_suggestions.push(match);

        // Add Notification
        mockDb.notifications.push({
          notification_id: mockDb.notifications.length + 1,
          user_id: lost.user_id,
          title: 'Potential Item Match Found!',
          message: `Your lost item "${lost.title}" has a potential match with found item "${newItem.title}" (${score}% match score).`,
          status: 'unread',
          created_at: new Date()
        });
      }
    });

    // Log Audit
    mockDb.audit_log.push({
      log_id: mockDb.audit_log.length + 1,
      user_id: newItem.user_id,
      action_type: 'INSERT',
      table_name: 'found_items',
      record_id: newItem.found_id,
      old_data: null,
      new_data: JSON.stringify(newItem),
      action_timestamp: new Date()
    });

    return { insertId: newItem.found_id, affectedRows: 1 };
  }

  // 3. CATEGORIES & LOCATIONS
  if (sqlLower.includes('from categories')) return mockDb.categories;
  if (sqlLower.includes('from locations')) return mockDb.locations;

  // 4. CLAIMS
  if (sqlLower.includes('select') && sqlLower.includes('vw_pending_claims')) {
    return mockDb.claims.filter(c => c.status === 'pending').map(c => {
      const lost = mockDb.lost_items.find(l => l.lost_id === c.lost_id) || {};
      const found = mockDb.found_items.find(f => f.found_id === c.found_id) || {};
      const user = mockDb.users.find(u => u.user_id === c.user_id) || {};
      return {
        ...c,
        lost_title: lost.title,
        found_title: found.title,
        claimant_name: user.name,
        claimant_email: user.email
      };
    });
  }

  if (sqlLower.includes('select') && sqlLower.includes('claims')) {
    return mockDb.claims.map(c => {
      const lost = mockDb.lost_items.find(l => l.lost_id === c.lost_id) || {};
      const found = mockDb.found_items.find(f => f.found_id === c.found_id) || {};
      const user = mockDb.users.find(u => u.user_id === c.user_id) || {};
      return {
        ...c,
        lost_title: lost.title,
        found_title: found.title,
        claimant_name: user.name,
        claimant_email: user.email
      };
    });
  }

  if (sqlLower.includes('insert into claims')) {
    const newClaim = {
      claim_id: mockDb.claims.length + 1,
      lost_id: parseInt(params[0]),
      found_id: parseInt(params[1]),
      user_id: parseInt(params[2]),
      proof: params[3],
      status: 'pending',
      admin_notes: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    mockDb.claims.push(newClaim);

    // Update item status
    const lostItem = mockDb.lost_items.find(l => l.lost_id === newClaim.lost_id);
    if (lostItem) lostItem.status = 'claimed';
    const foundItem = mockDb.found_items.find(f => f.found_id === newClaim.found_id);
    if (foundItem) foundItem.status = 'claimed';

    // Audit logs
    mockDb.audit_log.push({
      log_id: mockDb.audit_log.length + 1,
      user_id: newClaim.user_id,
      action_type: 'INSERT',
      table_name: 'claims',
      record_id: newClaim.claim_id,
      old_data: null,
      new_data: JSON.stringify(newClaim),
      action_timestamp: new Date()
    });

    return { insertId: newClaim.claim_id, affectedRows: 1 };
  }

  // 5. CALL PROCEDURES (TRANSACTIONS)
  if (sqlLower.includes('call sp_approveclaim') || sqlLower.includes('approveclaim')) {
    const claimId = parseInt(params[0]);
    const notes = params[1];
    const claim = mockDb.claims.find(c => c.claim_id === claimId);
    if (claim) {
      const oldClaim = { ...claim };
      claim.status = 'approved';
      claim.admin_notes = notes;
      claim.updated_at = new Date();

      // Set items to returned
      const lost = mockDb.lost_items.find(l => l.lost_id === claim.lost_id);
      if (lost) lost.status = 'returned';
      const found = mockDb.found_items.find(f => f.found_id === claim.found_id);
      if (found) found.status = 'returned';

      // Mark matching suggestion as verified
      const match = mockDb.match_suggestions.find(m => m.lost_id === claim.lost_id && m.found_id === claim.found_id);
      if (match) match.status = 'verified';

      // Insert Notification
      mockDb.notifications.push({
        notification_id: mockDb.notifications.length + 1,
        user_id: claim.user_id,
        title: 'Claim Approved! 🎉',
        message: `Congratulations! Your claim for "${lost ? lost.title : 'Item'}" has been approved. Please visit the admin office to retrieve your item.`,
        status: 'unread',
        created_at: new Date()
      });

      // Audit logs
      mockDb.audit_log.push({
        log_id: mockDb.audit_log.length + 1,
        user_id: 1, // Admin user id
        action_type: 'UPDATE',
        table_name: 'claims',
        record_id: claim.claim_id,
        old_data: JSON.stringify(oldClaim),
        new_data: JSON.stringify(claim),
        action_timestamp: new Date()
      });
      return [{ message: 'Claim approved successfully' }];
    }
    throw new Error('Claim not found');
  }

  if (sqlLower.includes('call sp_rejectclaim') || sqlLower.includes('rejectclaim')) {
    const claimId = parseInt(params[0]);
    const notes = params[1];
    const claim = mockDb.claims.find(c => c.claim_id === claimId);
    if (claim) {
      const oldClaim = { ...claim };
      claim.status = 'rejected';
      claim.admin_notes = notes;
      claim.updated_at = new Date();

      // Reset items back to lost/found
      const lost = mockDb.lost_items.find(l => l.lost_id === claim.lost_id);
      if (lost) lost.status = 'lost';
      const found = mockDb.found_items.find(f => f.found_id === claim.found_id);
      if (found) found.status = 'found';

      // Insert Notification
      mockDb.notifications.push({
        notification_id: mockDb.notifications.length + 1,
        user_id: claim.user_id,
        title: 'Claim Rejected',
        message: `Your claim for "${lost ? lost.title : 'Item'}" has been rejected. Note: ${notes}`,
        status: 'unread',
        created_at: new Date()
      });

      // Audit logs
      mockDb.audit_log.push({
        log_id: mockDb.audit_log.length + 1,
        user_id: 1, // Admin user id
        action_type: 'UPDATE',
        table_name: 'claims',
        record_id: claim.claim_id,
        old_data: JSON.stringify(oldClaim),
        new_data: JSON.stringify(claim),
        action_timestamp: new Date()
      });
      return [{ message: 'Claim rejected successfully' }];
    }
    throw new Error('Claim not found');
  }

  // 6. NOTIFICATIONS
  if (sqlLower.includes('select') && sqlLower.includes('notifications')) {
    if (sqlLower.includes('user_id = ?')) {
      const userId = parseInt(params[0]);
      return mockDb.notifications.filter(n => n.user_id === userId);
    }
    return mockDb.notifications;
  }

  if (sqlLower.includes('update notifications')) {
    if (sqlLower.includes('notification_id = ?')) {
      const notifId = parseInt(params[0]);
      const notif = mockDb.notifications.find(n => n.notification_id === notifId);
      if (notif) notif.status = 'read';
      return { affectedRows: 1 };
    }
    if (sqlLower.includes('user_id = ?')) {
      const userId = parseInt(params[0]);
      mockDb.notifications.forEach(n => {
        if (n.user_id === userId) n.status = 'read';
      });
      return { affectedRows: mockDb.notifications.length };
    }
  }

  // 7. MATCH SUGGESTIONS
  if (sqlLower.includes('select') && sqlLower.includes('match_suggestions')) {
    return mockDb.match_suggestions.map(match => {
      const lost = mockDb.lost_items.find(l => l.lost_id === match.lost_id) || {};
      const found = mockDb.found_items.find(f => f.found_id === match.found_id) || {};
      return {
        ...match,
        lost_title: lost.title,
        found_title: found.title,
        lost_reporter: mockDb.users.find(u => u.user_id === lost.user_id)?.name || 'Unknown',
        found_finder: mockDb.users.find(u => u.user_id === found.user_id)?.name || 'Unknown'
      };
    });
  }

  // 8. AUDIT LOGS SUMMARY
  if (sqlLower.includes('select') && sqlLower.includes('audit_log')) {
    return mockDb.audit_log.map(log => {
      const user = mockDb.users.find(u => u.user_id === log.user_id);
      return {
        ...log,
        user_name: user ? user.name : 'System/Trigger',
        user_email: user ? user.email : 'system@uni.edu'
      };
    }).sort((a, b) => b.action_timestamp - a.action_timestamp);
  }

  if (sqlLower.includes('vw_audit_summary')) {
    return mockDb.audit_log.map(log => {
      const user = mockDb.users.find(u => u.user_id === log.user_id);
      return {
        log_id: log.log_id,
        user_name: user ? user.name : 'System/Trigger',
        action_type: log.action_type,
        table_name: log.table_name,
        record_id: log.record_id,
        action_timestamp: log.action_timestamp
      };
    }).sort((a, b) => b.action_timestamp - a.action_timestamp);
  }

  // 9. DASHBOARD STATS
  if (sqlLower.includes('count') && sqlLower.includes('from users')) {
    return [{ total: mockDb.users.length }];
  }

  // If query is for dashboard summary statistics
  if (sqlLower.includes('dashboard') || sqlLower.includes('statistics') || sqlLower.includes('vw_monthly_statistics')) {
    return [{
      total_users: mockDb.users.length,
      total_lost: mockDb.lost_items.length,
      total_found: mockDb.found_items.length,
      total_matches: mockDb.match_suggestions.length,
      pending_claims: mockDb.claims.filter(c => c.status === 'pending').length,
      approved_claims: mockDb.claims.filter(c => c.status === 'approved').length,
      rejected_claims: mockDb.claims.filter(c => c.status === 'rejected').length,
      returned_items: mockDb.lost_items.filter(i => i.status === 'returned').length + mockDb.found_items.filter(i => i.status === 'returned').length,
      active_notifications: mockDb.notifications.filter(n => n.status === 'unread').length,
      audit_logs_count: mockDb.audit_log.length
    }];
  }

  // Fallback default
  return [];
}

// Check database connection state
function isConnected() {
  return dbConnected;
}

// Get the connection error details (if any)
function getError() {
  return connectionError;
}

module.exports = {
  initDb,
  query,
  isConnected,
  getError,
  mockDb // Exported for easy resetting/backup exports
};
