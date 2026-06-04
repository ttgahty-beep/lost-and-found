-- =================================================================
-- SMART LOST & FOUND MANAGEMENT SYSTEM DATABASE SCHEMA
-- Target DBMS: MySQL (v8.0+)
-- Authors: Ahtesha, Salman, Hussain, Karam, Shahzaib
-- Compatible: Clever Cloud MySQL / Any Managed MySQL 8.x Provider
-- =================================================================

-- On cloud hosting (Clever Cloud) keep these commented out.
-- The database is pre-allocated; CREATE DATABASE is not permitted.
-- CREATE DATABASE IF NOT EXISTS lost_and_found_db;
-- USE lost_and_found_db;

-- =================================================================
-- DROP ORDER: triggers → views → procedures → tables
-- (triggers must be dropped before their parent tables)
-- =================================================================

-- Drop matching triggers (split into BEFORE + AFTER pairs)
DROP TRIGGER IF EXISTS trg_lost_items_before_match;
DROP TRIGGER IF EXISTS trg_lost_items_after_match;
DROP TRIGGER IF EXISTS trg_found_items_before_match;
DROP TRIGGER IF EXISTS trg_found_items_after_match;
DROP TRIGGER IF EXISTS trg_found_items_match;

-- Drop audit triggers
DROP TRIGGER IF EXISTS trg_claims_audit_update;
DROP TRIGGER IF EXISTS trg_claims_audit_insert;
DROP TRIGGER IF EXISTS trg_found_items_audit_delete;
DROP TRIGGER IF EXISTS trg_found_items_audit_update;
DROP TRIGGER IF EXISTS trg_found_items_audit_insert;
DROP TRIGGER IF EXISTS trg_lost_items_audit_delete;
DROP TRIGGER IF EXISTS trg_lost_items_audit_update;
DROP TRIGGER IF EXISTS trg_lost_items_audit_insert;
DROP TRIGGER IF EXISTS trg_users_audit_delete;
DROP TRIGGER IF EXISTS trg_users_audit_update;
DROP TRIGGER IF EXISTS trg_users_audit_insert;

-- Drop old single-trigger names (in case a previous schema version was loaded)
DROP TRIGGER IF EXISTS trg_lost_items_match;
DROP TRIGGER IF EXISTS trg_found_items_match;

-- Drop views
DROP VIEW IF EXISTS vw_audit_summary;
DROP VIEW IF EXISTS vw_user_activity;
DROP VIEW IF EXISTS vw_monthly_statistics;
DROP VIEW IF EXISTS vw_returned_items;
DROP VIEW IF EXISTS vw_pending_claims;
DROP VIEW IF EXISTS vw_active_lost_items;

-- Drop procedures
DROP PROCEDURE IF EXISTS sp_GenerateMonthlyReport;
DROP PROCEDURE IF EXISTS sp_SearchItems;
DROP PROCEDURE IF EXISTS sp_ReturnItem;
DROP PROCEDURE IF EXISTS sp_RejectClaim;
DROP PROCEDURE IF EXISTS sp_ApproveClaim;
DROP PROCEDURE IF EXISTS sp_CreateClaim;
DROP PROCEDURE IF EXISTS sp_AddFoundItem;
DROP PROCEDURE IF EXISTS sp_AddLostItem;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS match_suggestions;
DROP TABLE IF EXISTS found_items;
DROP TABLE IF EXISTS lost_items;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;


-- =================================================================
-- 1. TABLES & CONSTRAINTS
-- =================================================================

-- USERS TABLE (1NF, 2NF, 3NF compliant)
CREATE TABLE users (
    user_id    INT AUTO_INCREMENT,
    name       VARCHAR(100) NOT NULL,
    email      VARCHAR(100) NOT NULL,
    password   VARCHAR(255) NOT NULL,
    phone      VARCHAR(15)  NOT NULL,
    role       ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users        PRIMARY KEY (user_id),
    CONSTRAINT uq_users_email  UNIQUE (email),
    -- LENGTH() is deterministic — this CHECK is Clever Cloud compatible
    CONSTRAINT chk_users_phone CHECK (LENGTH(phone) >= 10)
) ENGINE=InnoDB;

-- ITEM CATEGORIES TABLE
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NULL,
    CONSTRAINT pk_categories      PRIMARY KEY (category_id),
    CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB;

-- LOCATIONS TABLE
CREATE TABLE locations (
    location_id INT AUTO_INCREMENT,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    CONSTRAINT pk_locations      PRIMARY KEY (location_id),
    CONSTRAINT uq_locations_name UNIQUE (name)
) ENGINE=InnoDB;

-- LOST ITEMS TABLE
CREATE TABLE lost_items (
    lost_id     INT AUTO_INCREMENT,
    user_id     INT NOT NULL,
    title       VARCHAR(150) NOT NULL,
    description TEXT NULL,
    category_id INT NOT NULL,
    location_id INT NOT NULL,
    color       VARCHAR(30)  NOT NULL,
    lost_date   DATE NOT NULL,
    status      ENUM('lost', 'matched', 'claimed', 'returned') DEFAULT 'lost',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_lost_items          PRIMARY KEY (lost_id),
    CONSTRAINT fk_lost_items_user     FOREIGN KEY (user_id)     REFERENCES users(user_id)          ON DELETE CASCADE,
    CONSTRAINT fk_lost_items_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_lost_items_location FOREIGN KEY (location_id) REFERENCES locations(location_id)  ON DELETE RESTRICT
    -- CHECK (lost_date <= CURRENT_DATE) REMOVED:
    -- CURRENT_DATE is non-deterministic → Clever Cloud error #3814.
    -- Date validation is enforced in the application layer instead.
) ENGINE=InnoDB;

-- FOUND ITEMS TABLE
CREATE TABLE found_items (
    found_id    INT AUTO_INCREMENT,
    user_id     INT NOT NULL,    -- the person who found and turned in the item
    title       VARCHAR(150) NOT NULL,
    description TEXT NULL,
    category_id INT NOT NULL,
    location_id INT NOT NULL,
    color       VARCHAR(30)  NOT NULL,
    found_date  DATE NOT NULL,
    status      ENUM('found', 'matched', 'claimed', 'returned') DEFAULT 'found',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_found_items          PRIMARY KEY (found_id),
    CONSTRAINT fk_found_items_user     FOREIGN KEY (user_id)     REFERENCES users(user_id)          ON DELETE CASCADE,
    CONSTRAINT fk_found_items_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
    CONSTRAINT fk_found_items_location FOREIGN KEY (location_id) REFERENCES locations(location_id)  ON DELETE RESTRICT
    -- CHECK (found_date <= CURRENT_DATE) REMOVED:
    -- CURRENT_DATE is non-deterministic → Clever Cloud error #3814.
    -- Date validation is enforced in the application layer instead.
) ENGINE=InnoDB;

-- MATCH SUGGESTIONS TABLE (Many-to-Many resolver)
CREATE TABLE match_suggestions (
    match_id    INT AUTO_INCREMENT,
    lost_id     INT NOT NULL,
    found_id    INT NOT NULL,
    match_score DECIMAL(5,2) NOT NULL,
    status      ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_match_suggestions PRIMARY KEY (match_id),
    CONSTRAINT fk_match_lost        FOREIGN KEY (lost_id)  REFERENCES lost_items(lost_id)   ON DELETE CASCADE,
    CONSTRAINT fk_match_found       FOREIGN KEY (found_id) REFERENCES found_items(found_id) ON DELETE CASCADE,
    CONSTRAINT uq_match_pair        UNIQUE (lost_id, found_id),
    -- Constant literals only — fully deterministic, Clever Cloud compatible
    CONSTRAINT chk_match_score      CHECK (match_score >= 0.00 AND match_score <= 100.00)
) ENGINE=InnoDB;

-- CLAIMS TABLE
CREATE TABLE claims (
    claim_id    INT AUTO_INCREMENT,
    lost_id     INT NOT NULL,
    found_id    INT NOT NULL,
    user_id     INT NOT NULL,    -- claimant
    proof       TEXT NOT NULL,
    status      ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_claims       PRIMARY KEY (claim_id),
    CONSTRAINT fk_claims_lost  FOREIGN KEY (lost_id)  REFERENCES lost_items(lost_id)   ON DELETE CASCADE,
    CONSTRAINT fk_claims_found FOREIGN KEY (found_id) REFERENCES found_items(found_id) ON DELETE CASCADE,
    CONSTRAINT fk_claims_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)        ON DELETE CASCADE,
    CONSTRAINT uq_claim_lost   UNIQUE (lost_id)    -- one claim per lost report
) ENGINE=InnoDB;

-- NOTIFICATIONS TABLE
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT,
    user_id         INT NOT NULL,
    title           VARCHAR(100) NOT NULL,
    message         TEXT NOT NULL,
    status          ENUM('unread', 'read') DEFAULT 'unread',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_notifications      PRIMARY KEY (notification_id),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- AUDIT LOG TABLE
CREATE TABLE audit_log (
    log_id           INT AUTO_INCREMENT,
    user_id          INT NULL,    -- NULL when triggered by system/cascade
    action_type      ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    table_name       VARCHAR(50) NOT NULL,
    record_id        INT NOT NULL,
    old_data         JSON NULL,
    new_data         JSON NULL,
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_audit_log PRIMARY KEY (log_id)
) ENGINE=InnoDB;


-- =================================================================
-- 2. INDEXES
-- =================================================================
CREATE INDEX idx_lost_search   ON lost_items        (status, category_id, location_id, lost_date);
CREATE INDEX idx_found_search  ON found_items       (status, category_id, location_id, found_date);
CREATE INDEX idx_claims_status ON claims            (status, user_id);
CREATE INDEX idx_match_score   ON match_suggestions (match_score);


-- =================================================================
-- 3. AUDIT TRIGGERS
-- =================================================================

DELIMITER $$

-- ── USERS ───────────────────────────────────────────────────────

CREATE TRIGGER trg_users_audit_insert AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NEW.user_id, 'INSERT', 'users', NEW.user_id, NULL,
        JSON_OBJECT('name', NEW.name, 'email', NEW.email, 'role', NEW.role, 'phone', NEW.phone)
    );
END$$

CREATE TRIGGER trg_users_audit_update AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NEW.user_id, 'UPDATE', 'users', NEW.user_id,
        JSON_OBJECT('name', OLD.name, 'email', OLD.email, 'role', OLD.role, 'phone', OLD.phone),
        JSON_OBJECT('name', NEW.name, 'email', NEW.email, 'role', NEW.role, 'phone', NEW.phone)
    );
END$$

CREATE TRIGGER trg_users_audit_delete AFTER DELETE ON users
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NULL, 'DELETE', 'users', OLD.user_id,
        JSON_OBJECT('name', OLD.name, 'email', OLD.email, 'role', OLD.role, 'phone', OLD.phone),
        NULL
    );
END$$

-- ── LOST ITEMS ───────────────────────────────────────────────────

CREATE TRIGGER trg_lost_items_audit_insert AFTER INSERT ON lost_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        COALESCE(@current_user_id, NEW.user_id), 'INSERT', 'lost_items', NEW.lost_id, NULL,
        JSON_OBJECT('title', NEW.title, 'category_id', NEW.category_id, 'color', NEW.color, 'status', NEW.status)
    );
END$$

CREATE TRIGGER trg_lost_items_audit_update AFTER UPDATE ON lost_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        COALESCE(@current_user_id, NEW.user_id), 'UPDATE', 'lost_items', NEW.lost_id,
        JSON_OBJECT('title', OLD.title, 'status', OLD.status),
        JSON_OBJECT('title', NEW.title, 'status', NEW.status)
    );
END$$

CREATE TRIGGER trg_lost_items_audit_delete AFTER DELETE ON lost_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NULL, 'DELETE', 'lost_items', OLD.lost_id,
        JSON_OBJECT('title', OLD.title, 'status', OLD.status),
        NULL
    );
END$$

-- ── FOUND ITEMS ──────────────────────────────────────────────────

CREATE TRIGGER trg_found_items_audit_insert AFTER INSERT ON found_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        COALESCE(@current_user_id, NEW.user_id), 'INSERT', 'found_items', NEW.found_id, NULL,
        JSON_OBJECT('title', NEW.title, 'category_id', NEW.category_id, 'color', NEW.color, 'status', NEW.status)
    );
END$$

CREATE TRIGGER trg_found_items_audit_update AFTER UPDATE ON found_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        COALESCE(@current_user_id, NEW.user_id), 'UPDATE', 'found_items', NEW.found_id,
        JSON_OBJECT('title', OLD.title, 'status', OLD.status),
        JSON_OBJECT('title', NEW.title, 'status', NEW.status)
    );
END$$

CREATE TRIGGER trg_found_items_audit_delete AFTER DELETE ON found_items
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NULL, 'DELETE', 'found_items', OLD.found_id,
        JSON_OBJECT('title', OLD.title, 'status', OLD.status),
        NULL
    );
END$$

-- ── CLAIMS ───────────────────────────────────────────────────────

CREATE TRIGGER trg_claims_audit_insert AFTER INSERT ON claims
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        NEW.user_id, 'INSERT', 'claims', NEW.claim_id, NULL,
        JSON_OBJECT('lost_id', NEW.lost_id, 'found_id', NEW.found_id, 'status', NEW.status)
    );
END$$

CREATE TRIGGER trg_claims_audit_update AFTER UPDATE ON claims
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (user_id, action_type, table_name, record_id, old_data, new_data)
    VALUES (
        COALESCE(@current_user_id, 1), 'UPDATE', 'claims', NEW.claim_id,
        JSON_OBJECT('status', OLD.status, 'notes', OLD.admin_notes),
        JSON_OBJECT('status', NEW.status, 'notes', NEW.admin_notes)
    );

    -- Send notification when admin changes claim status
    IF OLD.status != NEW.status THEN
        IF NEW.status = 'approved' THEN
            INSERT INTO notifications (user_id, title, message)
            VALUES (
                NEW.user_id,
                'Claim APPROVED! 🎉',
                'Good news! Your claim request has been approved by Admin. Please visit the reception office.'
            );
        ELSEIF NEW.status = 'rejected' THEN
            INSERT INTO notifications (user_id, title, message)
            VALUES (
                NEW.user_id,
                'Claim Rejected',
                CONCAT('Your claim request has been reviewed and rejected. Admin Notes: ', COALESCE(NEW.admin_notes, 'N/A'))
            );
        END IF;
    END IF;
END$$

DELIMITER ;


-- =================================================================
-- 4. SMART MATCHING ENGINE TRIGGERS
--
-- FIX for Error #1442 ("Can't update table X in stored
-- function/trigger because it is already used by the statement
-- which invoked this stored function/trigger"):
--
-- Root cause: the original AFTER INSERT triggers on lost_items and
-- found_items each executed  UPDATE <same table> SET status='matched'
-- — a self-referencing write that MySQL forbids (Error 1442).
--
-- Solution: split every matching trigger into two triggers:
--
--   BEFORE INSERT  → uses  SET NEW.status = 'matched'
--                    (modifies the row being inserted — no separate
--                     UPDATE statement needed, no self-reference)
--
--   AFTER INSERT   → inserts into match_suggestions & notifications
--                    ONLY (never touches the triggering table again)
--
-- This eliminates all self-referencing updates while preserving
-- 100 % of the original business logic.
-- =================================================================

DELIMITER $$

-- ────────────────────────────────────────────────────────────────
-- LOST ITEMS — BEFORE INSERT
-- Sets NEW.status = 'matched' if qualifying found items already
-- exist, so no UPDATE on lost_items is ever needed.
-- ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_lost_items_before_match BEFORE INSERT ON lost_items
FOR EACH ROW
BEGIN
    DECLARE v_match_count INT DEFAULT 0;

    -- Count found items that would score >= 50 against this new lost item
    SELECT COUNT(*) INTO v_match_count
    FROM found_items f
    WHERE f.status = 'found'
      AND (
            (NEW.category_id = f.category_id) OR
            (NEW.location_id = f.location_id AND LOWER(NEW.color) = LOWER(f.color))
          )
      AND (
            (CASE WHEN NEW.category_id = f.category_id                                          THEN 40 ELSE 0 END) +
            (CASE WHEN NEW.location_id = f.location_id                                          THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(NEW.color) = LOWER(f.color)                                        THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(NEW.title) LIKE CONCAT('%', LOWER(f.title), '%')
                    OR LOWER(f.title)   LIKE CONCAT('%', LOWER(NEW.title), '%')                 THEN 20 ELSE 0 END)
          ) >= 50;

    -- Pre-set status on the row being inserted (no separate UPDATE needed)
    IF v_match_count > 0 THEN
        SET NEW.status = 'matched';
    END IF;
END$$

-- ────────────────────────────────────────────────────────────────
-- LOST ITEMS — AFTER INSERT
-- Inserts match_suggestions rows and notifications ONLY.
-- Does NOT touch lost_items (avoids Error #1442).
-- ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_lost_items_after_match AFTER INSERT ON lost_items
FOR EACH ROW
BEGIN
    -- Build match_suggestions for qualifying found items
    INSERT INTO match_suggestions (lost_id, found_id, match_score, status)
    SELECT
        NEW.lost_id,
        f.found_id,
        (
            (CASE WHEN NEW.category_id = f.category_id                                          THEN 40 ELSE 0 END) +
            (CASE WHEN NEW.location_id = f.location_id                                          THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(NEW.color) = LOWER(f.color)                                        THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(NEW.title) LIKE CONCAT('%', LOWER(f.title), '%')
                    OR LOWER(f.title)   LIKE CONCAT('%', LOWER(NEW.title), '%')                 THEN 20 ELSE 0 END)
        ) AS score,
        'pending'
    FROM found_items f
    WHERE f.status IN ('found', 'matched')
      AND (
            (NEW.category_id = f.category_id) OR
            (NEW.location_id = f.location_id AND LOWER(NEW.color) = LOWER(f.color))
          )
    HAVING score >= 50;

    -- Notify the reporter if matches were found
    IF EXISTS (SELECT 1 FROM match_suggestions WHERE lost_id = NEW.lost_id) THEN
        INSERT INTO notifications (user_id, title, message)
        VALUES (
            NEW.user_id,
            'Match Suggestion Found',
            CONCAT('We found potential match(es) for your lost item: "', NEW.title, '". Check your Dashboard!')
        );
    END IF;
END$$

-- ────────────────────────────────────────────────────────────────
-- FOUND ITEMS — BEFORE INSERT
-- Sets NEW.status = 'matched' if qualifying lost items already
-- exist, so no UPDATE on found_items is ever needed.
-- ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_found_items_before_match BEFORE INSERT ON found_items
FOR EACH ROW
BEGIN
    DECLARE v_match_count INT DEFAULT 0;

    -- Count lost items that would score >= 50 against this new found item
    SELECT COUNT(*) INTO v_match_count
    FROM lost_items l
    WHERE l.status = 'lost'
      AND (
            (l.category_id = NEW.category_id) OR
            (l.location_id = NEW.location_id AND LOWER(l.color) = LOWER(NEW.color))
          )
      AND (
            (CASE WHEN l.category_id = NEW.category_id                                          THEN 40 ELSE 0 END) +
            (CASE WHEN l.location_id = NEW.location_id                                          THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(l.color) = LOWER(NEW.color)                                        THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(l.title)   LIKE CONCAT('%', LOWER(NEW.title), '%')
                    OR LOWER(NEW.title) LIKE CONCAT('%', LOWER(l.title), '%')                   THEN 20 ELSE 0 END)
          ) >= 50;

    -- Pre-set status on the row being inserted (no separate UPDATE needed)
    IF v_match_count > 0 THEN
        SET NEW.status = 'matched';
    END IF;
END$$

-- ────────────────────────────────────────────────────────────────
-- FOUND ITEMS — AFTER INSERT
-- Inserts match_suggestions rows, updates LOST items' status, and
-- sends notifications. Does NOT touch found_items (avoids #1442).
-- ────────────────────────────────────────────────────────────────
CREATE TRIGGER trg_found_items_after_match AFTER INSERT ON found_items
FOR EACH ROW
BEGIN
    -- Build match_suggestions for qualifying lost items
    INSERT INTO match_suggestions (lost_id, found_id, match_score, status)
    SELECT
        l.lost_id,
        NEW.found_id,
        (
            (CASE WHEN l.category_id = NEW.category_id                                          THEN 40 ELSE 0 END) +
            (CASE WHEN l.location_id = NEW.location_id                                          THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(l.color) = LOWER(NEW.color)                                        THEN 20 ELSE 0 END) +
            (CASE WHEN LOWER(l.title)   LIKE CONCAT('%', LOWER(NEW.title), '%')
                    OR LOWER(NEW.title) LIKE CONCAT('%', LOWER(l.title), '%')                   THEN 20 ELSE 0 END)
        ) AS score,
        'pending'
    FROM lost_items l
    WHERE l.status IN ('lost', 'matched')
      AND (
            (l.category_id = NEW.category_id) OR
            (l.location_id = NEW.location_id AND LOWER(l.color) = LOWER(NEW.color))
          )
    HAVING score >= 50;

    -- Update matched lost items to 'matched' status (different table — allowed)
    IF EXISTS (SELECT 1 FROM match_suggestions WHERE found_id = NEW.found_id) THEN

        UPDATE lost_items l
        INNER JOIN match_suggestions m ON l.lost_id = m.lost_id
        SET l.status = 'matched'
        WHERE m.found_id = NEW.found_id
          AND l.status = 'lost';

        -- Notify each affected lost-item owner
        INSERT INTO notifications (user_id, title, message)
        SELECT
            l.user_id,
            'Potential Match Reported!',
            CONCAT('Someone turned in a "', NEW.title, '" which may match your lost item: "', l.title, '".')
        FROM lost_items l
        INNER JOIN match_suggestions m ON l.lost_id = m.lost_id
        WHERE m.found_id = NEW.found_id;

    END IF;
END$$

DELIMITER ;


-- =================================================================
-- 5. STORED PROCEDURES & TRANSACTION MANAGEMENT
-- =================================================================

DELIMITER $$

-- Add Lost Item
CREATE PROCEDURE sp_AddLostItem(
    IN p_user_id     INT,
    IN p_title       VARCHAR(150),
    IN p_description TEXT,
    IN p_category_id INT,
    IN p_location_id INT,
    IN p_color       VARCHAR(30),
    IN p_lost_date   DATE
)
BEGIN
    INSERT INTO lost_items (user_id, title, description, category_id, location_id, color, lost_date)
    VALUES (p_user_id, p_title, p_description, p_category_id, p_location_id, p_color, p_lost_date);
END$$

-- Add Found Item (original had a stray semicolon — fixed)
CREATE PROCEDURE sp_AddFoundItem(
    IN p_user_id     INT,
    IN p_title       VARCHAR(150),
    IN p_description TEXT,
    IN p_category_id INT,
    IN p_location_id INT,
    IN p_color       VARCHAR(30),
    IN p_found_date  DATE
)
BEGIN
    INSERT INTO found_items (user_id, title, description, category_id, location_id, color, found_date)
    VALUES (p_user_id, p_title, p_description, p_category_id, p_location_id, p_color, p_found_date);
END$$

-- TRANSACTION: Create Claim Request
CREATE PROCEDURE sp_CreateClaim(
    IN p_lost_id  INT,
    IN p_found_id INT,
    IN p_user_id  INT,
    IN p_proof    TEXT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO claims (lost_id, found_id, user_id, proof, status)
    VALUES (p_lost_id, p_found_id, p_user_id, p_proof, 'pending');

    UPDATE lost_items  SET status = 'claimed' WHERE lost_id  = p_lost_id;
    UPDATE found_items SET status = 'claimed' WHERE found_id = p_found_id;

    COMMIT;
END$$

-- TRANSACTION: Approve Claim
CREATE PROCEDURE sp_ApproveClaim(
    IN p_claim_id    INT,
    IN p_admin_notes TEXT,
    IN p_admin_id    INT
)
BEGIN
    DECLARE v_lost_id  INT;
    DECLARE v_found_id INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET @current_user_id = p_admin_id;

    SELECT lost_id, found_id INTO v_lost_id, v_found_id
    FROM claims WHERE claim_id = p_claim_id;

    UPDATE claims
    SET status = 'approved', admin_notes = p_admin_notes, updated_at = CURRENT_TIMESTAMP
    WHERE claim_id = p_claim_id;

    UPDATE lost_items  SET status = 'returned' WHERE lost_id  = v_lost_id;
    UPDATE found_items SET status = 'returned' WHERE found_id = v_found_id;

    UPDATE match_suggestions
    SET status = 'verified'
    WHERE lost_id = v_lost_id AND found_id = v_found_id;

    COMMIT;
END$$

-- TRANSACTION: Reject Claim
CREATE PROCEDURE sp_RejectClaim(
    IN p_claim_id    INT,
    IN p_admin_notes TEXT,
    IN p_admin_id    INT
)
BEGIN
    DECLARE v_lost_id  INT;
    DECLARE v_found_id INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET @current_user_id = p_admin_id;

    SELECT lost_id, found_id INTO v_lost_id, v_found_id
    FROM claims WHERE claim_id = p_claim_id;

    UPDATE claims
    SET status = 'rejected', admin_notes = p_admin_notes, updated_at = CURRENT_TIMESTAMP
    WHERE claim_id = p_claim_id;

    UPDATE lost_items  SET status = 'matched' WHERE lost_id  = v_lost_id;
    UPDATE found_items SET status = 'matched' WHERE found_id = v_found_id;

    COMMIT;
END$$

-- TRANSACTION: Return Item directly (Admin override)
CREATE PROCEDURE sp_ReturnItem(
    IN p_lost_id  INT,
    IN p_found_id INT,
    IN p_admin_id INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SET @current_user_id = p_admin_id;

    UPDATE lost_items  SET status = 'returned' WHERE lost_id  = p_lost_id;
    UPDATE found_items SET status = 'returned' WHERE found_id = p_found_id;

    UPDATE claims SET status = 'approved'
    WHERE lost_id = p_lost_id AND found_id = p_found_id;

    COMMIT;
END$$

-- Advanced Filter Search
-- FIX: parameter was ENUM('lost','found') — MySQL forbids ENUM in procedure params.
--      Changed to VARCHAR(10).
CREATE PROCEDURE sp_SearchItems(
    IN p_type        VARCHAR(10),    -- 'lost' or 'found'
    IN p_title       VARCHAR(100),
    IN p_category_id INT,
    IN p_location_id INT,
    IN p_color       VARCHAR(30),
    IN p_start_date  DATE,
    IN p_end_date    DATE
)
BEGIN
    IF p_type = 'lost' THEN
        SELECT l.*, c.name AS category_name, loc.name AS location_name, u.name AS reporter_name
        FROM lost_items l
        JOIN categories c   ON l.category_id = c.category_id
        JOIN locations  loc ON l.location_id  = loc.location_id
        JOIN users      u   ON l.user_id      = u.user_id
        WHERE (p_title       IS NULL OR l.title       LIKE CONCAT('%', p_title, '%'))
          AND (p_category_id IS NULL OR l.category_id = p_category_id)
          AND (p_location_id IS NULL OR l.location_id = p_location_id)
          AND (p_color       IS NULL OR LOWER(l.color) = LOWER(p_color))
          AND (p_start_date  IS NULL OR l.lost_date   >= p_start_date)
          AND (p_end_date    IS NULL OR l.lost_date   <= p_end_date);
    ELSE
        SELECT f.*, c.name AS category_name, loc.name AS location_name, u.name AS finder_name
        FROM found_items f
        JOIN categories c   ON f.category_id = c.category_id
        JOIN locations  loc ON f.location_id  = loc.location_id
        JOIN users      u   ON f.user_id      = u.user_id
        WHERE (p_title       IS NULL OR f.title       LIKE CONCAT('%', p_title, '%'))
          AND (p_category_id IS NULL OR f.category_id = p_category_id)
          AND (p_location_id IS NULL OR f.location_id = p_location_id)
          AND (p_color       IS NULL OR LOWER(f.color) = LOWER(p_color))
          AND (p_start_date  IS NULL OR f.found_date  >= p_start_date)
          AND (p_end_date    IS NULL OR f.found_date  <= p_end_date);
    END IF;
END$$

-- Monthly Report Generator
CREATE PROCEDURE sp_GenerateMonthlyReport(
    IN p_year INT
)
BEGIN
    SELECT
        m.month_name,
        COALESCE(lost.cnt,  0) AS lost_items,
        COALESCE(found.cnt, 0) AS found_items,
        COALESCE(ret.cnt,   0) AS returned_items
    FROM (
        SELECT  1 AS month_num, 'January'   AS month_name UNION ALL
        SELECT  2, 'February'  UNION ALL SELECT  3, 'March'     UNION ALL
        SELECT  4, 'April'     UNION ALL SELECT  5, 'May'       UNION ALL
        SELECT  6, 'June'      UNION ALL SELECT  7, 'July'      UNION ALL
        SELECT  8, 'August'    UNION ALL SELECT  9, 'September' UNION ALL
        SELECT 10, 'October'   UNION ALL SELECT 11, 'November'  UNION ALL
        SELECT 12, 'December'
    ) m
    LEFT JOIN (
        SELECT MONTH(lost_date) AS mth, COUNT(*) AS cnt
        FROM lost_items WHERE YEAR(lost_date) = p_year
        GROUP BY MONTH(lost_date)
    ) lost  ON m.month_num = lost.mth
    LEFT JOIN (
        SELECT MONTH(found_date) AS mth, COUNT(*) AS cnt
        FROM found_items WHERE YEAR(found_date) = p_year
        GROUP BY MONTH(found_date)
    ) found ON m.month_num = found.mth
    LEFT JOIN (
        SELECT MONTH(lost_date) AS mth, COUNT(*) AS cnt
        FROM lost_items
        WHERE YEAR(lost_date) = p_year AND status = 'returned'
        GROUP BY MONTH(lost_date)
    ) ret   ON m.month_num = ret.mth
    ORDER BY m.month_num;
END$$

DELIMITER ;


-- =================================================================
-- 6. VIEWS
-- =================================================================

-- Active lost items (still missing or awaiting match confirmation)
CREATE VIEW vw_active_lost_items AS
SELECT
    l.lost_id, l.title, l.description, l.color, l.lost_date, l.status,
    c.name   AS category_name,
    loc.name AS location_name,
    u.name   AS reporter_name,
    u.email  AS reporter_email
FROM lost_items l
JOIN categories c   ON l.category_id = c.category_id
JOIN locations  loc ON l.location_id  = loc.location_id
JOIN users      u   ON l.user_id      = u.user_id
WHERE l.status IN ('lost', 'matched');

-- Claims pending admin review
CREATE VIEW vw_pending_claims AS
SELECT
    cl.claim_id, cl.proof, cl.created_at, cl.status,
    l.lost_id,  l.title AS lost_title,
    f.found_id, f.title AS found_title,
    u.name  AS claimant_name,
    u.email AS claimant_email
FROM claims cl
JOIN lost_items  l ON cl.lost_id  = l.lost_id
JOIN found_items f ON cl.found_id = f.found_id
JOIN users       u ON cl.user_id  = u.user_id
WHERE cl.status = 'pending';

-- History of returned items
CREATE VIEW vw_returned_items AS
SELECT
    l.lost_id, l.title AS item_title, l.color, l.lost_date,
    c.name   AS category_name,
    loc.name AS location_name,
    u1.name  AS owner_name,
    u2.name  AS finder_name,
    cl.updated_at AS returned_at
FROM claims cl
JOIN lost_items  l   ON cl.lost_id    = l.lost_id
JOIN found_items f   ON cl.found_id   = f.found_id
JOIN categories  c   ON l.category_id = c.category_id
JOIN locations   loc ON l.location_id = loc.location_id
JOIN users       u1  ON l.user_id     = u1.user_id
JOIN users       u2  ON f.user_id     = u2.user_id
WHERE cl.status = 'approved';

-- Dashboard statistics snapshot
CREATE VIEW vw_monthly_statistics AS
SELECT
    (SELECT COUNT(*) FROM users)                                 AS total_users,
    (SELECT COUNT(*) FROM lost_items)                            AS total_lost,
    (SELECT COUNT(*) FROM found_items)                           AS total_found,
    (SELECT COUNT(*) FROM match_suggestions)                     AS total_matches,
    (SELECT COUNT(*) FROM claims WHERE status = 'pending')       AS pending_claims,
    (SELECT COUNT(*) FROM claims WHERE status = 'approved')      AS approved_claims,
    (SELECT COUNT(*) FROM claims WHERE status = 'rejected')      AS rejected_claims,
    (SELECT COUNT(*) FROM lost_items WHERE status = 'returned')  AS returned_items,
    (SELECT COUNT(*) FROM notifications WHERE status = 'unread') AS active_notifications,
    (SELECT COUNT(*) FROM audit_log)                             AS audit_logs_count;

-- Per-user activity summary
CREATE VIEW vw_user_activity AS
SELECT
    u.user_id, u.name, u.email, u.role,
    (SELECT COUNT(*) FROM lost_items  WHERE user_id = u.user_id) AS lost_reported_count,
    (SELECT COUNT(*) FROM found_items WHERE user_id = u.user_id) AS found_reported_count,
    (SELECT COUNT(*) FROM claims      WHERE user_id = u.user_id) AS claims_made_count
FROM users u;

-- Human-readable audit log
CREATE VIEW vw_audit_summary AS
SELECT
    a.log_id,
    COALESCE(u.name, 'System') AS user_name,
    a.action_type,
    a.table_name,
    a.record_id,
    a.action_timestamp
FROM audit_log a
LEFT JOIN users u ON a.user_id = u.user_id;

-- =================================================================
-- END OF SCHEMA
-- =================================================================
