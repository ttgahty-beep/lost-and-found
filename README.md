# Smart Lost & Found Management System

A professional, enterprise-grade university Database Management System (DBMS) semester project. This system showcases advanced relational concepts, transaction safety, automatic search index optimizations, database triggers for audit logging and matching calculations, and dashboard visualizations.

Developed by: **Ahtesha, Salman, Hussain, Karam, Shahzaib**  
Target DBMS: **MySQL (v8.0+)**  
Backend: **Node.js + Express**  
Frontend: **Vanilla HTML, CSS, JS, Chart.js, FontAwesome (Premium Obsidian Dark Theme)**

---

## Table of Contents
1. [Objectives & Scope](#objectives--scope)
2. [ER Diagram & Relational Schema](#er-diagram--relational-schema)
3. [Normalization (1NF, 2NF, 3NF)](#normalization-1nf-2nf-3nf)
4. [Advanced DBMS Concepts Enforced](#advanced-dbms-concepts-enforced)
5. [Project Folder Structure](#project-folder-structure)
6. [Step-by-Step Local Setup](#step-by-step-local-setup)
7. [System Testing & Verification Cases](#system-testing--verification-cases)
8. [Comprehensive Viva Q&A Guide](#comprehensive-viva-qa-guide)
9. [Presentation Defense Outline](#presentation-defense-outline)

---

## Objectives & Scope

### Objectives
- **Centralize Campus Asset Recovery:** Build an automated digital platform replacing paper notebooks, bulletin boards, and WhatsApp groups for lost & found tracking inside a university campus.
- **Implement Real-time Matching:** Minimize the asset recovery cycle by running similarity match queries instantly using database-level triggers.
- **Ensure Administrative Security:** Enforce academic audit logs and robust transaction controls (`START TRANSACTION` with `ROLLBACK` support) to track database updates and verify property ownership.

### Scope
- **User Roles:**
  - *Student / Faculty:* Register, log in, submit lost reports, report found items, view matches, submit ownership claim forms, and read notifications.
  - *Administrator:* Review submitted claims, approve claims (verifying matches), reject fraudulent claims, monitor database sizes, read audit logs, and export reports to CSV or JSON formats.
- **Constraints & Indexes:** Validates dates (prevents future dates), filters titles/colors, and indexes query paths to optimize query execution on tables.

---

## ER Diagram & Relational Schema

### Entity Relationship Explanation

#### Cardinality Specifications
1. **User (1) &mdash;&mdash; (Many) LostItems:**
   - *Description:* One user (student/staff) can report zero, one, or multiple lost items.
   - *Cardinality:* One-to-Many ($1:N$).
   - *Constraint:* `lost_items.user_id` is a Foreign Key referencing `users.user_id` with `ON DELETE CASCADE`.
2. **User (1) &mdash;&mdash; (Many) FoundItems:**
   - *Description:* One user can find and report zero, one, or multiple found items.
   - *Cardinality:* One-to-Many ($1:N$).
3. **Category (1) &mdash;&mdash; (Many) LostItems / FoundItems:**
   - *Description:* A category contains multiple reported items, but an item must belong to exactly one category.
   - *Cardinality:* One-to-Many ($1:N$).
   - *Constraint:* `ON DELETE RESTRICT` is enforced to prevent deleting active categories that contain items.
4. **Location (1) &mdash;&mdash; (Many) LostItems / FoundItems:**
   - *Description:* A location can contain multiple lost/found item events.
   - *Cardinality:* One-to-Many ($1:N$).
5. **LostItems (Many) &mdash;&mdash; (Many) FoundItems (via MatchSuggestions):**
   - *Description:* A single lost item report can be matched with multiple candidate found items, and vice versa.
   - *Cardinality:* Many-to-Many ($M:N$). Resolved via the `match_suggestions` bridge entity.
   - *Constraint:* Enforces a composite unique constraint on `(lost_id, found_id)`.
6. **LostItems (1) &mdash;&mdash; (0 or 1) Claims:**
   - *Description:* An item can only have one active verification request.
   - *Cardinality:* One-to-One / Zero-to-One ($1:1$). Resolved via unique constraint on `claims.lost_id`.

### Relational Schema Diagram (Logical Mapping)
```
users ( user_id [PK], name, email [UQ], password, phone, role, created_at )

categories ( category_id [PK], name [UQ], description )

locations ( location_id [PK], name [UQ], description )

lost_items ( lost_id [PK], user_id [FK->users.user_id], title, description, category_id [FK->categories.category_id], location_id [FK->locations.location_id], color, lost_date, status, created_at )

found_items ( found_id [PK], user_id [FK->users.user_id], title, description, category_id [FK->categories.category_id], location_id [FK->locations.location_id], color, found_date, status, created_at )

match_suggestions ( match_id [PK], lost_id [FK->lost_items.lost_id], found_id [FK->found_items.found_id], match_score, status, created_at )

claims ( claim_id [PK], lost_id [FK->lost_items.lost_id, UQ], found_id [FK->found_items.found_id], user_id [FK->users.user_id], proof, status, admin_notes, created_at, updated_at )

notifications ( notification_id [PK], user_id [FK->users.user_id], title, message, status, created_at )

audit_log ( log_id [PK], user_id, action_type, table_name, record_id, old_data, new_data, action_timestamp )
```

---

## Normalization (1NF, 2NF, 3NF)

To secure maximum credit, we demonstrate how this database design achieves Third Normal Form (3NF):

### First Normal Form (1NF)
- **Condition:** All table rows must have a primary key, and cells must contain atomic, single-valued attributes (no repeating columns or multi-value lists).
- **Proof:** Rather than storing an item's distinct traits (e.g. `colors = "black, silver"`) as a list in one field, we enforce single atomic values in the `color` column. Every table has an auto-incrementing integer Primary Key (`user_id`, `lost_id`, `category_id`).

### Second Normal Form (2NF)
- **Condition:** Must be in 1NF, and all non-key columns must be fully functionally dependent on the primary key (no partial dependencies on composite keys).
- **Proof:** All tables use single-column primary keys (e.g., `lost_id` in `lost_items`). In composite tables like `match_suggestions` (which could use a composite key of `(lost_id, found_id)`), we introduce a surrogate primary key `match_id` and ensure non-key values (like `match_score`) depend on the entire row identifier, eliminating partial dependencies.

### Third Normal Form (3NF)
- **Condition:** Must be in 2NF, and no non-key columns can depend transitively on another non-key column (no transitive dependencies: $A \rightarrow B \rightarrow C$).
- **Proof:** 
  - *Violating Case:* If the `lost_items` table stored `category_name` and `category_description` directly alongside the item title, we would have: `lost_id` (PK) $\rightarrow$ `category_id` $\rightarrow$ `category_name`. Here, `category_name` depends on `category_id` (a non-key attribute).
  - *Correction:* We extract categories into their own table `categories (category_id, name, description)`. The `lost_items` table only stores the foreign key reference `category_id`. This eliminates transitive dependencies, satisfying 3NF.

---

## Advanced DBMS Concepts Enforced

### 1. Database-Level Triggers
- **Smart Matching Engine (`trg_lost_items_match` / `trg_found_items_match`):** Instantly runs after an item is reported. Calculates a similarity score from 0 to 100 using text, category, color, and location matches. If the score is $\ge 50$, it creates a recommendation in `match_suggestions` and alerts the owner.
- **Audit System Triggers:** Triggers run `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE` on `users`, `lost_items`, `found_items`, and `claims`. These triggers convert row changes into standard JSON strings using MySQL's `JSON_OBJECT()` function and write them to `audit_log` with timestamps.

### 2. Transaction Management (ACID)
- Wraps multi-table modifications inside `START TRANSACTION` and `COMMIT` blocks to prevent partial database states.
- **Approve Claim Transaction Flow:**
  1. Set claim status to `'approved'`.
  2. Set lost item status to `'returned'`.
  3. Set found item status to `'returned'`.
  4. Write log to `audit_log` and dispatch system notifications.
  5. Commit transaction.
  - If any error occurs (e.g. database disconnect, duplicate key), the `DECLARE EXIT HANDLER FOR SQLEXCEPTION` executes a `ROLLBACK`, reverting all changes.

### 3. Database Views
- **`vw_active_lost_items`**: Filters out returned assets, displaying only outstanding items.
- **`vw_pending_claims`**: Joins users, claims, and items to show admins pending claim requests.
- **`vw_audit_summary`**: Joins logs and users for a formatted system audit log viewer.
- **`vw_monthly_statistics`**: Aggregates total database metrics in one view to power the dashboard cards.

---

## Project Folder Structure

```
DBMS-project lab/
├── config/
│   └── db.js                 # MySQL Pool Connector & Demo Mock Database Fallback
├── database/
│   ├── schema.sql            # Table definitions, Triggers, Views, Stored Procedures
│   └── seed.sql              # Pre-populated categories, locations, and user accounts
├── public/                   # Static Frontend Web App files
│   ├── css/
│   │   └── style.css         # Premium Glassmorphic Black Theme Styling
│   ├── js/
│   │   └── app.js            # SPA Controllers, Charts, and Notification Engines
│   └── index.html            # Single Page Interface containing the Viva Concept dashboard
├── routes/                   # Express Router Endpoints
│   ├── auth.js               # User Login & Register
│   ├── items.js              # Lost/Found Items Reporting & Matching
│   ├── claims.js             # Verification Requests & Transaction Approvals
│   ├── reports.js            # Analytical Reports & CSV Data Exports
│   └── system.js             # Diagnostics Monitor & SQL Backup Engine
├── server.js                 # Express Application Entry Point
├── package.json              # NPM Dependencies list
└── .env                      # Database configuration credentials
```

---

## Step-by-Step Local Setup

To run this application locally, you will need **Node.js** and **MySQL Server** (XAMPP, WampServer, or local MySQL instance).

### Step 1: Install Node.js Dependencies
Open your command terminal inside the project directory and run:
```bash
npm install
```

### Step 2: Initialize the MySQL Database
1. Start your local MySQL service (e.g. through XAMPP control panel).
2. Open phpMyAdmin or your terminal MySQL monitor:
   ```bash
   mysql -u root -p
   ```
3. Load the schema and seed files to create and populate the database:
   ```sql
   SOURCE database/schema.sql;
   SOURCE database/seed.sql;
   ```

### Step 3: Configure Environment Variables
Open the `.env` file in the root directory and ensure the database credentials match your local setup:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=lost_and_found_db
JWT_SECRET=lostfounddbms_secret_2026
```

### Step 4: Run the Server
Launch the application:
```bash
npm run dev
```
Open your browser and navigate to: **`http://localhost:3000`**

> [!NOTE]
> If MySQL is not running or credentials aren't set up yet, the backend will display a warning in the console and fall back to **Demo Sandbox Mode** using an in-memory database simulation. The web application will remain fully functional for demonstration.

---

## System Testing & Verification Cases

| Test ID | Module | Action | Expected Result | DBMS Concept Checked |
|:---|:---|:---|:---|:---|
| **TC-01** | Auth | Register new user | Password gets hashed and stored; trigger generates an `INSERT` audit log. | `INSERT` Trigger / Hash |
| **TC-02** | Auth | Login with invalid email | API rejects request with a `400` status. | Table Constraints |
| **TC-03** | Items | Report Lost Item in the future | System blocks request due to `chk_lost_date` check constraint. | `CHECK` Constraint |
| **TC-04** | Items | Insert Found Item | Auto-matching trigger runs, calculates score, and sends a notification. | Post-Insert Trigger |
| **TC-05** | Claims | Submit Claim Request | Item statuses are updated; transaction commits claim record. | Transaction Control |
| **TC-06** | Claims | Approve Claim | Statuses update to `'returned'`; transaction commits; notify claimant. | `COMMIT` / Rollback |
| **TC-07** | System | Click "Download Backup" | Server returns a `.sql` file containing the full schema and seed data. | Dynamic Data Export |

---

## Comprehensive Viva Q&A Guide

#### Q1: What is the benefit of using stored procedures instead of running raw queries from the backend?
**Answer:** Stored procedures compile once and run directly in MySQL, reducing network overhead. They also centralize business logic, allow granular security permissions, and protect against SQL injection.

#### Q2: Explain the ACID properties with respect to your claims approval module.
**Answer:** 
- **Atomicity:** When an admin approves a claim, updating the claim status and marking the item as returned must both succeed. If one fails, the entire transaction is rolled back.
- **Consistency:** Database transitions between valid states, keeping foreign keys intact.
- **Isolation:** Concurrent transactions do not overwrite each other's status updates.
- **Durability:** Committed updates are permanently written to disk.

#### Q3: Why is database auditing implemented with triggers instead of application code?
**Answer:** Application-level auditing can be bypassed if someone runs updates directly in phpMyAdmin or command line. Database-level triggers ensure that *any* change made from *any* interface is recorded in the audit trail.

#### Q4: How does the similarity matching trigger work?
**Answer:** The `AFTER INSERT` trigger calculates a weighted score: category matching (40 pts), location matching (20 pts), color matching (20 pts), and title keyword overlap (20 pts). If the score is $\ge 50$, the match is logged and notifications are sent.

---

## Presentation Defense Outline

1. **Slide 1: Title & Team**
   - Project: Smart Campus Lost & Found Management System.
   - Presenters: **Ahtesha, Salman, Hussain, Karam, Shahzaib**.
2. **Slide 2: Problem Statement & Objectives**
   - Traditional lost & found is manual and slow.
   - Goals: centralized system, real-time matching, and transaction safety.
3. **Slide 3: Entity Relationship & Normalization**
   - ER model showing cardinalities.
   - Normalization proof: how the tables achieve 3NF.
4. **Slide 4: Advanced Database Engineering**
   - Triggers for matching and auditing.
   - Transaction flow for claims verification.
5. **Slide 5: Live Project Walkthrough**
   - Live demo: Login, dashboard, and SQL backups.
   - Database monitor dashboard showing live metrics.
6. **Slide 6: Conclusion & QA**
   - Q&A session.
