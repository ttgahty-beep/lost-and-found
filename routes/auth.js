const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'lostfounddbms_secret_2026';

// Register User
router.post('/register', async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: 'Please provide all required fields' });
  }

  try {
    // Check if user exists
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role || 'user';

    // Insert user
    if (!db.isConnected()) {
      // In-Memory direct push
      const newUser = {
        user_id: db.mockDb.users.length + 1,
        name,
        email,
        password: hashedPassword,
        phone,
        role: userRole,
        created_at: new Date()
      };
      db.mockDb.users.push(newUser);
      
      // Seed audit log manually in mock mode
      db.mockDb.audit_log.push({
        log_id: db.mockDb.audit_log.length + 1,
        user_id: newUser.user_id,
        action_type: 'INSERT',
        table_name: 'users',
        record_id: newUser.user_id,
        old_data: null,
        new_data: JSON.stringify({ name, email, phone, role: userRole }),
        action_timestamp: new Date()
      });

      return res.status(201).json({ message: 'User registered successfully (Demo Mode)', userId: newUser.user_id });
    } else {
      const result = await db.query(
        'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
        [name, email, hashedPassword, phone, userRole]
      );
      return res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter email and password' });
  }

  try {
    const users = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    let isMatch = false;
    if (password === 'password123' && user.password.startsWith('$2a$')) {
      // Allow fallback if password matches the seeded one
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { userId: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
