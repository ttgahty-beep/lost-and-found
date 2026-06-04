/* =================================================================
   SMART LOST & FOUND MANAGEMENT SYSTEM - CLIENT SIDE ENGINE
   Vanilla JS Single Page App Logic
   ================================================================= */

// Global Application State
const state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  currentReportType: 'lost', // lost or found
  activePane: 'pane-dashboard',
  categories: [],
  locations: [],
  charts: {
    monthly: null,
    category: null
  },
  activeModalAction: null, // approve or reject
  activeModalClaimId: null
};

// Base URL for API
const API_BASE = '/api';

// Headers helper
function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  return headers;
}

// =================================================================
// 1. SESSION MANAGEMENT & SCREEN SWITCHING
// =================================================================

function checkAuth() {
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  
  if (state.token && state.user) {
    // Logged in
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    
    // Set user profile sidebar displays
    document.getElementById('user-name-display').innerText = state.user.name;
    document.getElementById('user-email-display').innerText = state.user.email;
    document.getElementById('user-role-display').innerText = state.user.role === 'admin' ? 'Administrator' : 'Student';
    
    // Hide/Show Admin-only elements
    const adminItems = document.querySelectorAll('.admin-only');
    adminItems.forEach(item => {
      if (state.user.role === 'admin') {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });

    // Toggle Claim view options (Admin reviews list, User submits claims)
    if (state.user.role === 'admin') {
      document.getElementById('admin-claims-view').classList.remove('hidden');
      document.getElementById('user-claims-view').classList.add('hidden');
    } else {
      document.getElementById('admin-claims-view').classList.add('hidden');
      document.getElementById('user-claims-view').classList.remove('hidden');
    }
    
    // Load metadata and start dashboard updates
    initAppData();
    switchPane(state.activePane);
  } else {
    // Logged out
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    // Stop charts
    destroyCharts();
  }
}

// SPA Pane toggler
function switchPane(targetPaneId) {
  state.activePane = targetPaneId;
  
  // Hide all panes
  const panes = document.querySelectorAll('.pane');
  panes.forEach(pane => pane.classList.remove('active'));
  
  // Show active pane
  const activePane = document.getElementById(targetPaneId);
  if (activePane) activePane.classList.add('active');
  
  // Update sidebar active tab
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.getAttribute('data-target') === targetPaneId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Dynamic Page Title & Subtitle
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  
  switch (targetPaneId) {
    case 'pane-dashboard':
      pageTitle.innerText = "Analytics Dashboard";
      pageSubtitle.innerText = "Real-time status of university lost & found database";
      loadDashboardData();
      break;
    case 'pane-report':
      pageTitle.innerText = "Report Asset";
      pageSubtitle.innerText = "Input lost or found items with constraint validation";
      break;
    case 'pane-search':
      pageTitle.innerText = "Database Search Engine";
      pageSubtitle.innerText = "Explore categories, locations, and match attributes";
      triggerSearch();
      break;
    case 'pane-claims':
      pageTitle.innerText = "Claim Verification Manager";
      pageSubtitle.innerText = "Track and process ownership proofs inside transactions";
      loadClaimsData();
      break;
    case 'pane-reports':
      pageTitle.innerText = "Report Center";
      pageSubtitle.innerText = "Compile statistical summaries and export table queries";
      break;
    case 'pane-monitor':
      pageTitle.innerText = "Database Diagnostics Monitor";
      pageSubtitle.innerText = "Review MySQL buffer, storage metrics, and logs activity";
      loadMonitorData();
      break;
    case 'pane-audit':
      pageTitle.innerText = "Audit Log Trail";
      pageSubtitle.innerText = "Automated audit logs capturing table edits via triggers";
      loadAuditData();
      break;
    case 'pane-viva':
      pageTitle.innerText = "DBMS Concepts Demonstration";
      pageSubtitle.innerText = "Academic references covering schema, normalization, and triggers";
      break;
  }
}

// Reset state on signout
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  state.token = null;
  state.user = null;
  checkAuth();
});

// Switch login/register screens
document.getElementById('show-register-btn').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').classList.remove('active');
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('active');
});

document.getElementById('show-login-btn').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').classList.remove('active');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('login-form').classList.add('active');
});

// =================================================================
// 2. AUTHENTICATION CONTROLLER HANDLERS
// =================================================================

// User Login Form Submit
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorAlert = document.getElementById('login-error');

  errorAlert.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    // Success
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    state.token = data.token;
    state.user = data.user;
    
    checkAuth();
  } catch (error) {
    errorAlert.innerText = error.message;
    errorAlert.classList.remove('hidden');
  }
});

// User Registration Form Submit
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const phone = document.getElementById('reg-phone').value;
  const role = document.getElementById('reg-role').value;
  
  const errorAlert = document.getElementById('register-error');
  const successAlert = document.getElementById('register-success');

  errorAlert.classList.add('hidden');
  successAlert.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone, role })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    // Success
    successAlert.innerText = "Academic Account Created! Please Login.";
    successAlert.classList.remove('hidden');
    
    // Clear form fields
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-phone').value = '';
    
    // Auto toggle to login screen after 1.5s
    setTimeout(() => {
      document.getElementById('show-login-btn').click();
      successAlert.classList.add('hidden');
    }, 1500);

  } catch (error) {
    errorAlert.innerText = error.message;
    errorAlert.classList.remove('hidden');
  }
});

// =================================================================
// 3. APPLICATION INITS & Dynamic Inputs
// =================================================================

async function initAppData() {
  try {
    // 1. Fetch Categories
    const catRes = await fetch(`${API_BASE}/items/categories`, { headers: getHeaders() });
    state.categories = await catRes.json();
    
    // 2. Fetch Locations
    const locRes = await fetch(`${API_BASE}/items/locations`, { headers: getHeaders() });
    state.locations = await locRes.json();

    // Populate Category Forms
    populateDropdown('item-category', state.categories);
    populateDropdown('item-location', state.locations);
    populateDropdown('search-category', state.categories, "All Categories");
    populateDropdown('search-location', state.locations, "All Locations");

    // Start fetching notifications
    fetchNotifications();
    setInterval(fetchNotifications, 10000); // refresh notifications every 10 seconds

  } catch (error) {
    console.error('Initialization error:', error);
  }
}

function populateDropdown(elemId, list, defaultLabel = null) {
  const select = document.getElementById(elemId);
  if (!select) return;
  
  select.innerHTML = '';
  
  if (defaultLabel) {
    select.innerHTML += `<option value="">${defaultLabel}</option>`;
  } else {
    select.innerHTML += `<option value="">-- Select option --</option>`;
  }

  list.forEach(item => {
    select.innerHTML += `<option value="${item.category_id || item.location_id}">${item.name}</option>`;
  });
}

// Sidebar click routers
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const target = item.getAttribute('data-target');
    switchPane(target);
  });
});

// =================================================================
// 4. REPORT ITEM FORM HANDLER
// =================================================================

// Switch Lost / Found Types on Report Form
document.getElementById('toggle-type-lost').addEventListener('click', () => {
  state.currentReportType = 'lost';
  document.getElementById('toggle-type-lost').className = 'btn btn-primary active';
  document.getElementById('toggle-type-found').className = 'btn btn-outline';
  document.getElementById('date-label').innerText = 'Date Lost *';
});

document.getElementById('toggle-type-found').addEventListener('click', () => {
  state.currentReportType = 'found';
  document.getElementById('toggle-type-found').className = 'btn btn-primary active';
  document.getElementById('toggle-type-lost').className = 'btn btn-outline';
  document.getElementById('date-label').innerText = 'Date Found *';
});

document.getElementById('report-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = document.getElementById('item-title').value;
  const category_id = document.getElementById('item-category').value;
  const location_id = document.getElementById('item-location').value;
  const color = document.getElementById('item-color').value;
  const dateStr = document.getElementById('item-date').value;
  const description = document.getElementById('item-desc').value;
  const alertBox = document.getElementById('report-form-alert');

  alertBox.className = 'alert-message hidden';

  // Client-side date check
  if (new Date(dateStr) > new Date()) {
    alertBox.className = 'alert-message error';
    alertBox.innerText = 'Trigger Alert: Item date cannot be in the future (CHK_DATE constraint)';
    return;
  }

  const endpoint = state.currentReportType === 'lost' ? '/items/lost' : '/items/found';
  const body = {
    title,
    category_id,
    location_id,
    color,
    description
  };

  if (state.currentReportType === 'lost') {
    body.lost_date = dateStr;
  } else {
    body.found_date = dateStr;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit report');
    }

    // Success
    alertBox.className = 'alert-message success';
    alertBox.innerHTML = `<strong>Success!</strong> ${data.message}`;
    
    // Clear fields
    document.getElementById('item-title').value = '';
    document.getElementById('item-category').value = '';
    document.getElementById('item-location').value = '';
    document.getElementById('item-color').value = '';
    document.getElementById('item-date').value = '';
    document.getElementById('item-desc').value = '';

    // Auto update stats & notifications
    fetchNotifications();

  } catch (error) {
    alertBox.className = 'alert-message error';
    alertBox.innerText = error.message;
  }
});

// =================================================================
// 5. SEARCH & FILTER ENGINE
// =================================================================

document.getElementById('search-filter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  triggerSearch();
});

async function triggerSearch() {
  const type = document.getElementById('search-type').value;
  const title = document.getElementById('search-title').value;
  const category_id = document.getElementById('search-category').value;
  const location_id = document.getElementById('search-location').value;
  const color = document.getElementById('search-color').value;
  
  // Compile query parameters
  const params = new URLSearchParams();
  params.append('type', type);
  if (title) params.append('title', title);
  if (category_id) params.append('category_id', category_id);
  if (location_id) params.append('location_id', location_id);
  if (color) params.append('color', color);

  try {
    const res = await fetch(`${API_BASE}/items/search?${params.toString()}`, { headers: getHeaders() });
    const results = await res.json();

    document.getElementById('search-count').innerText = `${results.length} records`;

    // Render Table Headers based on Type
    const headers = document.getElementById('search-table-headers');
    const tbody = document.querySelector('#search-results-table tbody');
    tbody.innerHTML = '';

    if (type === 'lost') {
      headers.innerHTML = `
        <th>ID</th>
        <th>Title</th>
        <th>Category</th>
        <th>Last Location</th>
        <th>Color</th>
        <th>Lost Date</th>
        <th>Reporter</th>
        <th>Status</th>
      `;

      if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;">No matches found in the lost database</td></tr>`;
      } else {
        results.forEach(row => {
          tbody.innerHTML += `
            <tr>
              <td>L-${row.lost_id}</td>
              <td style="font-weight:600;">${row.title}</td>
              <td>${row.category_name}</td>
              <td>${row.location_name}</td>
              <td>${row.color}</td>
              <td>${formatDate(row.lost_date)}</td>
              <td>${row.reporter_name || 'System'}</td>
              <td><span class="badge ${getStatusClass(row.status)}">${row.status}</span></td>
            </tr>
          `;
        });
      }
    } else {
      headers.innerHTML = `
        <th>ID</th>
        <th>Title</th>
        <th>Category</th>
        <th>Found Location</th>
        <th>Color</th>
        <th>Found Date</th>
        <th>Finder</th>
        <th>Status</th>
      `;

      if (results.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center;">No matches found in the found registry</td></tr>`;
      } else {
        results.forEach(row => {
          tbody.innerHTML += `
            <tr>
              <td>F-${row.found_id}</td>
              <td style="font-weight:600;">${row.title}</td>
              <td>${row.category_name}</td>
              <td>${row.location_name}</td>
              <td>${row.color}</td>
              <td>${formatDate(row.found_date)}</td>
              <td>${row.finder_name || 'System'}</td>
              <td><span class="badge ${getStatusClass(row.status)}">${row.status}</span></td>
            </tr>
          `;
        });
      }
    }

  } catch (error) {
    console.error(error);
  }
}

// =================================================================
// 6. DASHBOARD & MATCHING RECOMMENDATIONS
// =================================================================

async function loadDashboardData() {
  try {
    // 1. Fetch Stats
    const statsRes = await fetch(`${API_BASE}/reports/stats`, { headers: getHeaders() });
    const stats = await statsRes.json();
    
    // Update stat cards
    document.getElementById('stat-total-users').innerText = stats.total_users || 0;
    document.getElementById('stat-total-lost').innerText = stats.total_lost || 0;
    document.getElementById('stat-total-found').innerText = stats.total_found || 0;
    document.getElementById('stat-total-matches').innerText = stats.total_matches || 0;
    document.getElementById('stat-pending-claims').innerText = stats.pending_claims || 0;
    document.getElementById('stat-returned-items').innerText = stats.returned_items || 0;

    // Connect to Monitor displays too
    const pill = document.getElementById('db-status-pill');
    pill.className = 'status-pill connected';
    pill.querySelector('.label').innerText = 'MySQL Pool Connected';

    // 2. Fetch matches
    const matchRes = await fetch(`${API_BASE}/items/matches`, { headers: getHeaders() });
    const matches = await matchRes.json();
    
    const mTableBody = document.querySelector('#dashboard-matches-table tbody');
    mTableBody.innerHTML = '';
    
    // Clear select in user claims view
    const claimSelect = document.getElementById('claim-match-id');
    if (claimSelect) {
      claimSelect.innerHTML = `<option value="">-- Choose active matching pair --</option>`;
    }

    if (matches.length === 0) {
      mTableBody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center;">No match recommendations currently computed. File more reports to trigger matching.</td></tr>`;
    } else {
      matches.forEach(m => {
        // Append row
        let actionBtn = '';
        if (state.user.role === 'admin') {
          actionBtn = `<span class="text-muted">Requires Claim Request</span>`;
        } else {
          // If student owns it, let them submit a claim
          if (m.status === 'pending') {
            actionBtn = `<button onclick="claimItem(${m.lost_id}, ${m.found_id})" class="btn btn-sm btn-outline">Claim Asset</button>`;
            
            // Append to dropdown in claims pane
            if (claimSelect) {
              claimSelect.innerHTML += `<option value="${m.lost_id}-${m.found_id}">Match #${m.match_id}: "${m.lost_title}" / "${m.found_title}" (${m.match_score}% Match)</option>`;
            }
          } else {
            actionBtn = `<span class="text-success"><i class="fa-solid fa-square-check"></i> ${m.status}</span>`;
          }
        }

        mTableBody.innerHTML += `
          <tr>
            <td>MS-${m.match_id}</td>
            <td>
              <div style="font-weight:600;">${m.lost_title}</div>
              <div class="text-muted" style="font-size:0.75rem;">Owner: ${m.lost_reporter}</div>
            </td>
            <td>
              <div style="font-weight:600;">${m.found_title}</div>
              <div class="text-muted" style="font-size:0.75rem;">Finder: ${m.found_finder}</div>
            </td>
            <td>
              <div style="font-weight:700; color:${getScoreColor(m.match_score)}">${parseFloat(m.match_score).toFixed(0)}%</div>
            </td>
            <td><span class="badge ${getStatusClass(m.status)}">${m.status}</span></td>
            <td>${actionBtn}</td>
          </tr>
        `;
      });
    }

    // 3. Re-draw Charts
    loadDashboardCharts();

  } catch (error) {
    console.error('Stats aggregation error:', error);
    // Visual Fallback Indicator if server drops database
    const pill = document.getElementById('db-status-pill');
    pill.className = 'status-pill disconnected';
    pill.querySelector('.label').innerText = 'Demo Mock Mode Active';
  }
}

// Redirect user to claims page with matching info preloaded
function claimItem(lostId, foundId) {
  switchPane('pane-claims');
  document.getElementById('claim-match-id').value = `${lostId}-${foundId}`;
}

function getScoreColor(score) {
  const sc = parseFloat(score);
  if (sc >= 85) return 'var(--color-success)';
  if (sc >= 65) return 'var(--color-warning)';
  return 'var(--color-secondary)';
}

// Renders ChartJS graphics
async function loadDashboardCharts() {
  destroyCharts();

  try {
    // Fetch trends
    const chartRes = await fetch(`${API_BASE}/reports/monthly`, { headers: getHeaders() });
    const monthlyStats = await chartRes.json();

    const months = monthlyStats.map(m => m.month_name);
    const lostData = monthlyStats.map(m => m.lost_items);
    const foundData = monthlyStats.map(m => m.found_items);
    const returnedData = monthlyStats.map(m => m.returned_items);

    // 1. Monthly Trends Chart
    const ctx1 = document.getElementById('monthlyChart').getContext('2d');
    state.charts.monthly = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Lost Reported',
            data: lostData,
            backgroundColor: 'rgba(245, 158, 11, 0.4)',
            borderColor: 'var(--color-warning)',
            borderWidth: 1.5
          },
          {
            label: 'Found Turned-in',
            data: foundData,
            backgroundColor: 'rgba(16, 185, 129, 0.4)',
            borderColor: 'var(--color-success)',
            borderWidth: 1.5
          },
          {
            label: 'Returned to Owner',
            data: returnedData,
            backgroundColor: 'rgba(56, 189, 248, 0.4)',
            borderColor: 'var(--color-accent)',
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'var(--text-secondary)' } },
          x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } }
        },
        plugins: {
          legend: { labels: { color: 'var(--text-primary)', font: { family: 'Inter' } } }
        }
      }
    });

    // 2. Category Distribution Doughnut Chart
    // Fetch stats for category counts (simulated ratios for beauty)
    const statsRes = await fetch(`${API_BASE}/reports/stats`, { headers: getHeaders() });
    const stats = await statsRes.json();

    const ctx2 = document.getElementById('categoryChart').getContext('2d');
    state.charts.category = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Pending Claims', 'Approved Claims', 'Rejected Claims'],
        datasets: [{
          data: [
            stats.pending_claims || 0,
            stats.approved_claims || 0,
            stats.rejected_claims || 0
          ],
          backgroundColor: [
            'rgba(129, 140, 248, 0.5)',
            'rgba(16, 185, 129, 0.5)',
            'rgba(239, 68, 68, 0.5)'
          ],
          borderColor: [
            'var(--color-secondary)',
            'var(--color-success)',
            'var(--color-error)'
          ],
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'var(--text-primary)', font: { family: 'Inter' } }
          }
        }
      }
    });

  } catch (error) {
    console.error(error);
  }
}

function destroyCharts() {
  if (state.charts.monthly) {
    state.charts.monthly.destroy();
    state.charts.monthly = null;
  }
  if (state.charts.category) {
    state.charts.category.destroy();
    state.charts.category = null;
  }
}

// =================================================================
// 7. CLAIMS VERIFICATION & SQL TRANSACTIONS
// =================================================================

// User files a Claim
document.getElementById('submit-claim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const select = document.getElementById('claim-match-id').value;
  const proof = document.getElementById('claim-proof').value;
  const alertBox = document.getElementById('claim-form-alert');

  alertBox.className = 'alert-message hidden';

  if (!select) {
    alertBox.className = 'alert-message error';
    alertBox.innerText = 'Please select a matching suggestion pair.';
    return;
  }

  const [lost_id, found_id] = select.split('-');

  try {
    const res = await fetch(`${API_BASE}/claims`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ lost_id, found_id, proof })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit claim transaction');
    }

    // Success
    alertBox.className = 'alert-message success';
    alertBox.innerHTML = `<strong>Success!</strong> ${data.message}`;
    document.getElementById('claim-proof').value = '';
    
    // Refresh
    loadDashboardData();
  } catch (error) {
    alertBox.className = 'alert-message error';
    alertBox.innerText = error.message;
  }
});

// Admin loads Claims requests
async function loadClaimsData() {
  if (state.user.role !== 'admin') return;

  try {
    const res = await fetch(`${API_BASE}/claims/pending`, { headers: getHeaders() });
    const claims = await res.json();

    const tbody = document.querySelector('#claims-table tbody');
    tbody.innerHTML = '';

    if (claims.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted" style="text-align:center;">No pending claims awaiting verification.</td></tr>`;
    } else {
      claims.forEach(c => {
        tbody.innerHTML += `
          <tr>
            <td>C-${c.claim_id}</td>
            <td>
              <div style="font-weight:600;">${c.claimant_name}</div>
              <div class="text-muted" style="font-size:0.75rem;">${c.claimant_email}</div>
            </td>
            <td>${c.lost_title} <span class="text-muted">(L-${c.lost_id})</span></td>
            <td>${c.found_title} <span class="text-muted">(F-${c.found_id})</span></td>
            <td><div class="proof-text" style="max-width:240px; font-size:0.8rem; line-height:1.3;">"${c.proof}"</div></td>
            <td>${formatDate(c.created_at)}</td>
            <td>
              <div class="btn-group">
                <button onclick="reviewClaim(${c.claim_id}, 'approve')" class="btn btn-sm btn-primary"><i class="fa-solid fa-check"></i> Approve</button>
                <button onclick="reviewClaim(${c.claim_id}, 'reject')" class="btn btn-sm btn-outline text-error"><i class="fa-solid fa-xmark"></i> Reject</button>
              </div>
            </td>
          </tr>
        `;
      });
    }
  } catch (error) {
    console.error(error);
  }
}

// Open Action Notes modal
function reviewClaim(claimId, actionType) {
  state.activeModalAction = actionType;
  state.activeModalClaimId = claimId;

  const modal = document.getElementById('action-modal');
  const title = document.getElementById('modal-title');
  const label = document.getElementById('modal-input-label');
  const textarea = document.getElementById('modal-input');

  textarea.value = '';

  if (actionType === 'approve') {
    title.innerText = 'Approve Claim Ownership Verification';
    label.innerText = 'Approved Office Location / Reception Notes';
    textarea.placeholder = 'e.g. Approved. Pick up asset at Admin Office (Block B, Room 102). Bring Student ID card.';
  } else {
    title.innerText = 'Reject Claim Request';
    label.innerText = 'Reason for Rejection';
    textarea.placeholder = 'e.g. Rejected. The wallpaper description provided does not match the actual device.';
  }

  modal.classList.remove('hidden');
}

// Cancel Modal
document.getElementById('modal-cancel-btn').addEventListener('click', () => {
  document.getElementById('action-modal').classList.add('hidden');
});

// Submit Modal Action (Approves/Rejects using database transactions)
document.getElementById('modal-submit-btn').addEventListener('click', async () => {
  const notes = document.getElementById('modal-input').value;
  const modal = document.getElementById('action-modal');
  
  if (!notes) {
    alert('Please enter action details/notes');
    return;
  }

  const endpoint = state.activeModalAction === 'approve' ? '/claims/approve' : '/claims/reject';

  try {
    const res = await fetch(`${API_BASE}/claims${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ claim_id: state.activeModalClaimId, admin_notes: notes })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Transaction execution failed');
    }

    modal.classList.add('hidden');
    alert(data.message);
    
    // Refresh claims list & dashboard stats
    loadClaimsData();
  } catch (error) {
    alert(error.message);
  }
});

// =================================================================
// 8. NOTIFICATION ENGINE
// =================================================================

async function fetchNotifications() {
  if (!state.token) return;

  try {
    const res = await fetch(`${API_BASE}/items/notifications`, { headers: getHeaders() });
    const notifs = await res.json();

    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notification-list');
    
    // Count unread
    const unreadCount = notifs.filter(n => n.status === 'unread').length;
    
    if (unreadCount > 0) {
      badge.innerText = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    // Populate List
    list.innerHTML = '';
    if (notifs.length === 0) {
      list.innerHTML = `<div class="empty-state">No new notifications</div>`;
    } else {
      notifs.forEach(n => {
        list.innerHTML += `
          <div class="notif-item ${n.status === 'unread' ? 'unread' : ''}">
            <h4>${n.title}</h4>
            <p>${n.message}</p>
            <span class="notif-time">${formatDate(n.created_at)}</span>
          </div>
        `;
      });
    }

  } catch (error) {
    console.error(error);
  }
}

// Toggle notifications menu
document.getElementById('notification-trigger').addEventListener('click', (e) => {
  e.stopPropagation();
  const dropdown = document.getElementById('notification-menu');
  dropdown.classList.toggle('hidden');
});

// Click outside menu closes it
document.addEventListener('click', () => {
  const dropdown = document.getElementById('notification-menu');
  if (dropdown) dropdown.classList.add('hidden');
});

// Mark all as read
document.getElementById('mark-all-read-btn').addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    await fetch(`${API_BASE}/items/notifications/read`, {
      method: 'POST',
      headers: getHeaders()
    });
    fetchNotifications();
  } catch (error) {
    console.error(error);
  }
});

// =================================================================
// 9. SYSTEM MONITOR DIAGNOSTICS & BACKUPS
// =================================================================

async function loadMonitorData() {
  if (state.user.role !== 'admin') return;

  try {
    const res = await fetch(`${API_BASE}/system/monitor`, { headers: getHeaders() });
    const stats = await res.json();

    // Fill metrics
    document.getElementById('mon-total-tables').innerText = stats.total_tables;
    document.getElementById('mon-total-records').innerText = stats.total_records;
    document.getElementById('mon-db-size').innerText = stats.db_size;
    document.getElementById('mon-active-users').innerText = stats.active_users;
    
    document.getElementById('mon-last-insert').innerText = stats.last_inserted !== 'N/A' ? formatDate(stats.last_inserted) : 'N/A';
    document.getElementById('mon-last-update').innerText = stats.last_updated !== 'N/A' ? formatDate(stats.last_updated) : 'N/A';

    // Set connection status badge
    const badge = document.getElementById('monitor-conn-badge');
    if (stats.connected) {
      badge.className = 'badge badge-accent';
      badge.innerText = 'MySQL Connected (v8.0 InnoDB)';
    } else {
      badge.className = 'badge badge-outline text-warning';
      badge.innerText = 'MySQL Disconnected (Demo Sandbox)';
    }

    // Render activity statements
    const tbody = document.querySelector('#mon-activity-table tbody');
    tbody.innerHTML = '';
    
    if (stats.recent_activity.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted" style="text-align:center;">No recent SQL statements recorded.</td></tr>`;
    } else {
      stats.recent_activity.forEach(row => {
        tbody.innerHTML += `
          <tr>
            <td><strong class="${getActionColorClass(row.action_type)}">${row.action_type}</strong></td>
            <td><code>${row.table_name}</code></td>
            <td>${row.record_id}</td>
            <td class="time-stamp">${formatDate(row.action_timestamp)}</td>
          </tr>
        `;
      });
    }

  } catch (error) {
    console.error(error);
  }
}

function getActionColorClass(action) {
  if (action === 'INSERT') return 'text-success';
  if (action === 'UPDATE') return 'text-warning';
  return 'text-error';
}

// =================================================================
// 10. AUDIT LOG VIEWER
// =================================================================

async function loadAuditData() {
  if (state.user.role !== 'admin') return;

  try {
    const res = await fetch(`${API_BASE}/system/audit`, { headers: getHeaders() });
    const logs = await res.json();

    const tbody = document.querySelector('#audit-table tbody');
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center;">Audit logs table is empty. Try inserting or updating records.</td></tr>`;
    } else {
      logs.forEach(row => {
        tbody.innerHTML += `
          <tr>
            <td>#${row.log_id}</td>
            <td><strong>${row.user_name}</strong></td>
            <td><span class="badge ${getAuditActionBadge(row.action_type)}">${row.action_type}</span></td>
            <td><code>${row.table_name}</code></td>
            <td>${row.record_id}</td>
            <td class="time-stamp">${formatDate(row.action_timestamp)}</td>
          </tr>
        `;
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function getAuditActionBadge(action) {
  if (action === 'INSERT') return 'badge-accent';
  if (action === 'UPDATE') return 'badge-outline text-warning';
  return 'badge-outline text-error';
}

// =================================================================
// 11. EXPORTS HANDLER
// =================================================================

document.querySelectorAll('.btn-export').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const table = btn.getAttribute('data-table');
    const format = btn.getAttribute('data-format');

    try {
      // Trigger a raw HTTP redirect to download the file directly
      const url = `${API_BASE}/reports/export/${table}?format=${format}`;
      
      const response = await fetch(url, { headers: getHeaders() });
      if (!response.ok) {
        throw new Error('Export compilation failed');
      }

      // Convert to blob and download
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `lost_found_export_${table}_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      alert(err.message);
    }
  });
});

// =================================================================
// 12. VIVA SUBTABS CONTROLLER & HELPERS
// =================================================================

window.switchVivaTab = function(tabId) {
  // Toggle buttons
  const btns = document.querySelectorAll('.viva-tab-btn');
  btns.forEach(btn => btn.classList.remove('active'));
  
  event.target.classList.add('active');

  // Toggle panes
  const subpanes = document.querySelectorAll('.viva-subpane');
  subpanes.forEach(pane => pane.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
};

// Formats SQL ISO timestamps to localized readable strings
function formatDate(dateString) {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function getStatusClass(status) {
  switch (status) {
    case 'lost':
    case 'found':
    case 'pending':
      return 'badge-outline';
    case 'matched':
    case 'claimed':
      return 'badge-outline text-warning';
    case 'returned':
    case 'approved':
    case 'verified':
      return 'badge-accent';
    case 'rejected':
      return 'badge-outline text-error';
    default:
      return 'badge-outline';
  }
}

// Initial Bootstrapper
checkAuth();
