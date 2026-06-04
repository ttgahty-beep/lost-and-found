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

// Admin only middleware
function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
}

// 1. Submit a Claim (Transactional Stored Procedure sp_CreateClaim)
router.post('/', authenticateToken, async (req, res) => {
  const { lost_id, found_id, proof } = req.body;
  const user_id = req.user.userId;

  if (!lost_id || !found_id || !proof) {
    return res.status(400).json({ error: 'Please enter proof and select item matches.' });
  }

  try {
    if (db.isConnected()) {
      await db.query('SET @current_user_id = ?', [user_id]);
      // Call CreateClaim stored procedure which handles database TRANSACTION
      await db.query('CALL sp_CreateClaim(?, ?, ?, ?)', [lost_id, found_id, user_id, proof]);
      res.status(201).json({ message: 'Claim submitted successfully. Transaction committed!' });
    } else {
      // In Fallback Mode, manually simulate TRANSACTION block
      try {
        // Step 1: Insert Claim
        const queryRes = await db.query('INSERT INTO claims (lost_id, found_id, user_id, proof) VALUES (?, ?, ?, ?)', 
          [lost_id, found_id, user_id, proof]
        );
        res.status(201).json({ message: 'Claim submitted successfully. Transaction simulated and committed!' });
      } catch (err) {
        console.error('Transaction Failed. Mock Rollback executed.', err);
        res.status(500).json({ error: 'Transaction rolled back. Error: ' + err.message });
      }
    }
  } catch (error) {
    console.error('Claim transaction error:', error);
    res.status(500).json({ error: 'Database Transaction Failed. Rollback executed.' });
  }
});

// 2. Fetch Pending Claims (Calls vw_pending_claims view)
router.get('/pending', authenticateToken, adminOnly, async (req, res) => {
  try {
    let claims;
    if (db.isConnected()) {
      claims = await db.query('SELECT * FROM vw_pending_claims');
    } else {
      claims = await db.query('SELECT * FROM vw_pending_claims'); // handled by mockdb router wrapper
    }
    res.json(claims);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. Approve Claim (sp_ApproveClaim Stored Procedure with START TRANSACTION, COMMIT, ROLLBACK)
router.post('/approve', authenticateToken, adminOnly, async (req, res) => {
  const { claim_id, admin_notes } = req.body;
  const admin_id = req.user.userId;

  if (!claim_id) {
    return res.status(400).json({ error: 'Claim ID is required' });
  }

  try {
    if (db.isConnected()) {
      await db.query('SET @current_user_id = ?', [admin_id]);
      // Run procedure with SQL Transactions
      await db.query('CALL sp_ApproveClaim(?, ?, ?)', [claim_id, admin_notes || 'Approved by Admin', admin_id]);
      res.json({ message: 'Claim approved successfully! All tables updated and database transaction committed.' });
    } else {
      // Fallback
      await db.query('CALL sp_ApproveClaim(?, ?, ?)', [claim_id, admin_notes || 'Approved by Admin', admin_id]);
      res.json({ message: 'Claim approved successfully (Demo Mode)! Transaction committed.' });
    }
  } catch (error) {
    console.error('Approval transaction error:', error);
    res.status(500).json({ error: 'Transaction rolled back. Check logs for details.' });
  }
});

// 4. Reject Claim (sp_RejectClaim Stored Procedure with TRANSACTION)
router.post('/reject', authenticateToken, adminOnly, async (req, res) => {
  const { claim_id, admin_notes } = req.body;
  const admin_id = req.user.userId;

  if (!claim_id || !admin_notes) {
    return res.status(400).json({ error: 'Claim ID and rejection reason are required.' });
  }

  try {
    if (db.isConnected()) {
      await db.query('SET @current_user_id = ?', [admin_id]);
      await db.query('CALL sp_RejectClaim(?, ?, ?)', [claim_id, admin_notes, admin_id]);
      res.json({ message: 'Claim rejected. Items set back to active and transaction committed.' });
    } else {
      await db.query('CALL sp_RejectClaim(?, ?, ?)', [claim_id, admin_notes, admin_id]);
      res.json({ message: 'Claim rejected (Demo Mode). Transaction committed.' });
    }
  } catch (error) {
    console.error('Rejection transaction error:', error);
    res.status(500).json({ error: 'Transaction rolled back.' });
  }
});

module.exports = router;
