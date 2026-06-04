-- =================================================================
-- SMART LOST & FOUND MANAGEMENT SYSTEM - DATABASE SEEDING
-- Target DBMS: MySQL (v8.0+)
-- Authors: Ahtesha, Salman, Hussain, Karam, Shahzaib
-- =================================================================

-- On cloud hosting (Clever Cloud) keep this commented out.
-- USE lost_and_found_db;

-- Disable FK checks during seeding to allow explicit IDs
SET FOREIGN_KEY_CHECKS = 0;

-- =================================================================
-- 1. SEED CATEGORIES
-- =================================================================
INSERT INTO categories (category_id, name, description) VALUES
(1, 'Electronics',         'Smartphones, laptops, tablets, chargers, and audio accessories'),
(2, 'Documents & Cards',   'Student IDs, National ID cards, driving licenses, wallets, and folders'),
(3, 'Books & Stationery',  'Textbooks, notebooks, calculators, pencil cases, and folders'),
(4, 'Personal Belongings', 'Keys, bags, water bottles, umbrellas, watches, and glasses');

-- =================================================================
-- 2. SEED LOCATIONS
-- =================================================================
INSERT INTO locations (location_id, name, description) VALUES
(1, 'Main Library',       'Central academic library, silent study zones, and computer labs'),
(2, 'Block A Cafeteria',  'Ground floor cafeteria and surrounding seating court'),
(3, 'Auditorium Hall',    'Main campus seminar hall and auditorium building'),
(4, 'Science Lab Block',  'Physics and Chemistry practical lab corridors');

-- =================================================================
-- 3. SEED USERS  (password for all: password123)
--    Bcrypt hash: $2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K
-- =================================================================
INSERT INTO users (user_id, name, email, password, phone, role) VALUES
(1, 'Admin Staff', 'admin@uni.edu',    '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03001234567', 'admin'),
(2, 'Ahtesha',     'ahtesha@uni.edu',  '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03112223334', 'user'),
(3, 'Salman',      'salman@uni.edu',   '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03223334445', 'user'),
(4, 'Hussain',     'hussain@uni.edu',  '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03334445556', 'user'),
(5, 'Karam',       'karam@uni.edu',    '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03445556667', 'user'),
(6, 'Shahzaib',    'shahzaib@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03556667778', 'user');

-- =================================================================
-- 4. SEED LOST REPORTS
--
-- NOTE: The BEFORE INSERT trigger (trg_lost_items_before_match) will
-- check for existing found_items and may upgrade status to 'matched'
-- automatically. Because found_items is empty at this point the
-- status will remain 'lost' as supplied.
-- Audit triggers fire automatically and write to audit_log.
-- =================================================================
SET @current_user_id = 2;
INSERT INTO lost_items (lost_id, user_id, title, description, category_id, location_id, color, lost_date, status) VALUES
(1, 2, 'Dell Latitude Laptop',
    'Black Dell Latitude with a university sticker on the lid. Left it on the study desk.',
    1, 1, 'Black', '2026-06-01', 'lost'),
(2, 3, 'Brown Leather Wallet',
    'Brown leather wallet containing student card and metro card.',
    2, 2, 'Brown', '2026-06-02', 'lost');

-- =================================================================
-- 5. SEED FOUND REPORTS
--
-- NOTE: The BEFORE INSERT trigger (trg_found_items_before_match)
-- will detect that matching lost items now exist and will set
-- status = 'matched' automatically — even if 'found' is supplied
-- here.  The AFTER INSERT trigger then inserts match_suggestions
-- and sends notifications.  No self-referencing UPDATE occurs.
-- =================================================================
SET @current_user_id = 4;
INSERT INTO found_items (found_id, user_id, title, description, category_id, location_id, color, found_date, status) VALUES
(1, 4, 'Black Dell Laptop Charger & Laptop',
    'Found a black Dell laptop on the library 2nd floor desk. Turning it in.',
    1, 1, 'Black', '2026-06-02', 'found'),
(2, 5, 'Brown Wallet',
    'Found a brown leather wallet near Block A cafeteria tables. Contains some cards.',
    2, 2, 'Brown', '2026-06-03', 'found');

-- Re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

-- =================================================================
-- Expected automatic trigger output after seeding:
--
--  match_suggestions:
--    (lost_id=1, found_id=1, match_score=80, status='pending')
--      → category match (+40) + location match (+20) + color match (+20)
--    (lost_id=2, found_id=2, match_score=80, status='pending')
--      → category match (+40) + location match (+20) + color match (+20)
--
--  found_items status after BEFORE trigger:
--    found_id=1  → 'matched'
--    found_id=2  → 'matched'
--
--  lost_items status updated by AFTER INSERT trigger on found_items:
--    lost_id=1   → 'matched'
--    lost_id=2   → 'matched'
--
--  notifications: 2 match notifications to users 2 and 3
--  audit_log:     entries for all INSERTs above
-- =================================================================
