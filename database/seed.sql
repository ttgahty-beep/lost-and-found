-- =================================================================
-- SMART LOST & FOUND MANAGEMENT SYSTEM - DATABASE SEEDING
-- Target DBMS: MySQL (v8.0+)
-- Author: Ahtesha, Salman, Hussain, Karam, Shahzaib
-- =================================================================

USE lost_and_found_db;

-- 1. SEED CATEGORIES
INSERT INTO categories (category_id, name, description) VALUES
(1, 'Electronics', 'Smartphones, laptops, tablets, chargers, and audio accessories'),
(2, 'Documents & Cards', 'Student IDs, National ID cards, driving licenses, wallets, and folders'),
(3, 'Books & Stationery', 'Textbooks, notebooks, calculators, pencil cases, and folders'),
(4, 'Personal Belongings', 'Keys, bags, water bottles, umbrellas, watches, and glasses');

-- 2. SEED LOCATIONS
INSERT INTO locations (location_id, name, description) VALUES
(1, 'Main Library', 'Central academic library, silent study zones, and computer labs'),
(2, 'Block A Cafeteria', 'Ground floor cafeteria and surrounding seating court'),
(3, 'Auditorium Hall', 'Main campus seminar hall and auditorium building'),
(4, 'Science Lab Block', 'Physics and Chemistry practical lab corridors');

-- 3. SEED USERS (Password for all is: password123)
-- Bcrypt Hash: $2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K
INSERT INTO users (user_id, name, email, password, phone, role) VALUES
(1, 'Admin Staff', 'admin@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03001234567', 'admin'),
(2, 'Ahtesha', 'ahtesha@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03112223334', 'user'),
(3, 'Salman', 'salman@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03223334445', 'user'),
(4, 'Hussain', 'hussain@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03334445556', 'user'),
(5, 'Karam', 'karam@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03445556667', 'user'),
(6, 'Shahzaib', 'shahzaib@uni.edu', '$2a$10$3z.p27r8q7l99MvqYx5nK.qBqf4t5v4rFqF72i5o4aC1C64g6801K', '03556667778', 'user');

-- 4. SEED SAMPLE LOST REPORTS
-- (Triggers will execute and audit logs will be generated automatically if loaded into a schema with triggers)
SET @current_user_id = 2;
INSERT INTO lost_items (lost_id, user_id, title, description, category_id, location_id, color, lost_date, status) VALUES
(1, 2, 'Dell Latitude Laptop', 'Black Dell Latitude with a university sticker on the lid. Left it on the study desk.', 1, 1, 'Black', '2026-06-01', 'lost'),
(2, 3, 'Brown Leather Wallet', 'Brown leather wallet containing student card and metro card.', 2, 2, 'Brown', '2026-06-02', 'lost');

-- 5. SEED SAMPLE FOUND REPORTS
-- (Triggers will match found items to lost items and create Match Suggestions)
SET @current_user_id = 4;
INSERT INTO found_items (found_id, user_id, title, description, category_id, location_id, color, found_date, status) VALUES
(1, 4, 'Black Dell Laptop Charger & Laptop', 'Found a black Dell laptop on the library 2nd floor desk. Turning it in.', 1, 1, 'Black', '2026-06-02', 'found'),
(2, 5, 'Brown Wallet', 'Found a brown leather wallet near Block A cafeteria tables. Contain some cards.', 2, 2, 'Brown', '2026-06-03', 'found');

-- Note: The triggers will automatically create match suggestions for:
-- Lost Laptop (lost_id 1) and Found Laptop (found_id 1) -> category and location match (high score)
-- Lost Wallet (lost_id 2) and Found Wallet (found_id 2) -> category, location, color match (very high score)
