/* ════════════════════════════════════════════════════════════════════
   NEXUS TEAM DASHBOARD — script.js
   Data  : Google Sheets (live CSV, fetched on every login)
   Auth  : Firebase Google Sign-In
   Access: Captain → full edit  |  Member → read-only always
════════════════════════════════════════════════════════════════════ */
'use strict';

// ═══════════════════════════════════════════════════════════════
// ① GOOGLE SHEETS CONFIG
//    The sheet must be shared: "Anyone with the link → Viewer"
//    To get each tab's gid: click the tab → read ?gid=NNNN from URL
// ═══════════════════════════════════════════════════════════════
const SHEET_ID = '1hDjwJBT5N_YzPHZNFpZOvYJOyXD5ks8qkClM_psY9Es';
const CSV_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// ══════════════════════════════════════════════════════════════
// ★ FIND YOUR GIDs:
//   1. Open your Google Sheet
//   2. Click each tab at the bottom
//   3. Look at the URL — it ends with  #gid=XXXXXXXXX
//   4. Copy that number and paste it below
//
// Your sheet tab order (based on data you shared):
//   Tab 1 → Details        (first tab = always gid 0)
//   Tab 2 → Skills
//   Tab 3 → PS Completion
//   Tab 4 → Events
//   Tab 5 → Missed Attendance
// ══════════════════════════════════════════════════════════════
const GID = {
  details    : '1766801887',  // Tab — Details
  skills     : '1529264533',  // Tab — Skills
  ps         : '0',           // Tab — PS Completion
  events     : '1929646157',  // Tab — Events
  attendance : '2141076572',  // Tab — Missed Attendance
};

// ② Captain emails — anyone whose "Role" column = "Captain" is also
//    auto-promoted. Add real Gmail addresses here as a hard override:
const CAPTAIN_EMAILS = [
  // 'captain@gmail.com',
];

const LS_KEY = 'nexus_cap_v3'; // localStorage key for captain data

// ═══════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════
const S = {
  mode            : 'member',   // 'member' | 'captain' — set ONCE at login
  loggedInUser    : null,       // { email, name, picture, regNo, role, inRoster }
  members         : [],
  events          : [],
  attendance      : [],
  filteredMembers : [],
  captainData     : { venue:'', tasks:{} },
  activeSection   : 'dashboard',
  currentMember   : null,       // member open in modal
  taskFilter      : 'all',
  charts          : {},
};

// ═══════════════════════════════════════════════════════════════
// BOOT STATE — tracks whether DOM init is complete
// ═══════════════════════════════════════════════════════════════
let _domReady    = false;   // true after DOMContentLoaded + wireListeners
let _pendingUser = null;    // Firebase user queued before DOM was ready

// ═══════════════════════════════════════════════════════════════
// FIREBASE CALLBACKS (called from <script type="module"> in index.html)
// These may fire BEFORE DOMContentLoaded — we queue the user if so.
// ═══════════════════════════════════════════════════════════════
window._onFirebaseUser = function(u) {
  if (!_domReady) {
    // DOM not ready yet — save and handle after boot
    _pendingUser = u;
    return;
  }
  resetGBtn();
  // Hide loader first, then enter app
  hideLoader();
  loginWithEmail(u.email || '', u.displayName || '', u.photoURL || '');
};

window._onFirebaseSignOut = function() {
  if (!_domReady) return; // ignore pre-DOM callbacks
  resetGBtn();
  // Show login screen (loader should already be hidden by boot)
};

window._onFirebaseError = function(msg) {
  resetGBtn();
  hideLoader();
  showLoginScreen();
  showLoginError(msg);
};

// ═══════════════════════════════════════════════════════════════
// BOOT — runs on DOMContentLoaded, guaranteed single entry point
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadCaptainData();
  wireListeners();
  _domReady = true;

  // Always hide loader and show login after a short splash
  // (Firebase auth state may already have resolved by now)
  setLoader('SYSTEM READY');
  setTimeout(() => {
    hideLoader();

    // If Firebase already called _onFirebaseUser before DOM was ready,
    // handle that queued user now
    if (_pendingUser) {
      const u = _pendingUser;
      _pendingUser = null;
      loginWithEmail(u.email || '', u.displayName || '', u.photoURL || '');
    } else {
      // No active session — show login screen
      showLoginScreen();
    }
  }, 1200); // short enough to feel snappy, long enough for Firebase to resolve
});

const setLoader = t => {
  const e = document.getElementById('loaderSub');
  if (e) e.textContent = t;
};

const hideLoader = () => {
  const l = document.getElementById('loader');
  if (!l || l.classList.contains('hidden')) return; // already hidden
  l.style.opacity = '0';
  setTimeout(() => l.classList.add('hidden'), 500);
};

const showLoginScreen = () => {
  document.getElementById('roleScreen').classList.remove('hidden');
};

function resetGBtn() {
  const b = document.getElementById('firebaseGoogleBtn');
  const s = document.getElementById('googleBtnLoader');
  const t = document.querySelector('.google-btn-text');
  if(!b) return;
  b.disabled = false;
  if(s) s.classList.add('hidden');
  if(t) t.style.visibility = 'visible';
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE SHEETS → CSV FETCH & PARSE
// ═══════════════════════════════════════════════════════════════
async function fetchCSV(gid) {
  const url = `${CSV_BASE}&gid=${gid}&cachebust=${Date.now()}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Sheet gid=${gid} returned HTTP ${res.status}`);
  return res.text();
}

function csvToObjects(text) {
  // Full RFC-4180 CSV parser
  const rows = []; let row = [], f = '', inQ = false;
  for(let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if(inQ) {
      if(c==='"' && n==='"') { f+='"'; i++; }
      else if(c==='"') inQ = false;
      else f += c;
    } else {
      if(c==='"') inQ = true;
      else if(c===',') { row.push(f.trim()); f=''; }
      else if(c==='\r'&&n==='\n') { row.push(f.trim()); rows.push(row); row=[]; f=''; i++; }
      else if(c==='\n'||c==='\r') { row.push(f.trim()); rows.push(row); row=[]; f=''; }
      else f += c;
    }
  }
  if(f||row.length) { row.push(f.trim()); rows.push(row); }
  const clean = rows.filter(r => r.some(c => c!==''));
  if(!clean.length) return [];
  const [hdr, ...data] = clean;
  return data.map(r => { const o={}; hdr.forEach((h,i) => { o[h.trim()] = (r[i]||'').trim(); }); return o; });
}

// Safely read a column — fully case-insensitive, trims whitespace
function col(row, ...keys) {
  const norm = {};
  for (const k in row) norm[k.trim().toLowerCase()] = String(row[k] ?? '').trim();
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
    const lk = k.trim().toLowerCase();
    if (norm[lk] !== undefined && norm[lk] !== '') return norm[lk];
  }
  return 'N/A';
}

// ── SHEET 1: DETAILS ─────────────────────────────────────────────
// Headers: S. No | NAME | REG .NO. | DEPARTMENT | ROLE |
//   MOBILE NUMBER | MAIL ID | CGPA | ARREARS COUNT (CURRENT) |
//   SPECIAL LAB | MEMBER OF SSG | EVENTS ATTENDED | EVENTS WON |
//   FOREIGN LANGUAGE SELECTED | MODE OF STUDY |
//   CURRENTLY REGISTERED EVENTS | NOTES
function parseDetail(r) {
  const regNo = col(r,
    'REG .NO.','REG. NO.','REG.NO.',
    'Reg .No.','Reg. No.','Reg.No.',
    'REG NO','RegNo','REGISTRATION NUMBER'
  );
  if (!regNo || regNo === 'N/A') return null;

  const arrearsRaw = col(r,
    'ARREARS COUNT (CURRENT)','Arrears Count (Current)',
    'ARREARS COUNT','Arrears Count','ARREARS','Arrears'
  );
  const arrears = (arrearsRaw === 'NIL' || arrearsRaw === 'N/A') ? 0 : parseInt(arrearsRaw) || 0;

  return {
    regNo,
    sno           : col(r, 'S. No','S. NO','S.No','S.NO'),
    name          : col(r, 'NAME','Name'),
    dept          : col(r, 'DEPARTMENT','Department','DEPT','Dept'),
    role          : col(r, 'ROLE','Role'),
    mobile        : col(r, 'MOBILE NUMBER','Mobile Number','MOBILE','Mobile'),
    mail          : col(r, 'MAIL ID','Mail ID','EMAIL','Email'),
    cgpa          : parseFloat(col(r, 'CGPA','cgpa')) || 0,
    arrears,
    specialLab    : col(r, 'SPECIAL LAB','Special Lab'),
    ssg           : col(r, 'MEMBER OF SSG','Member of SSG','SSG'),
    eventsAttended: parseInt(col(r, 'EVENTS ATTENDED','Events Attended')) || 0,
    eventsWon     : parseInt(col(r, 'EVENTS WON','Events Won')) || 0,
    foreignLang   : col(r, 'FOREIGN LANGUAGE SELECTED','Foreign Language Selected','FOREIGN LANGUAGE','Foreign Language'),
    modeOfStudy   : col(r, 'MODE OF STUDY','Mode of Study'),
    currentEvents : col(r, 'CURRENTLY REGISTERED EVENTS','Currently Registered Events','CURRENT EVENTS','Current Events'),
    notes         : col(r, 'NOTES','Notes'),
  };
}

// ── SHEET 2: SKILLS ──────────────────────────────────────────────
// Headers: S. No | NAME | REG. NO. | PRIMARY SKILL 1 | PRIMARY SKILL 2 |
//   SECONDARY SKILL 1 | SECONDARY SKILL 2 |
//   SPECIALIZATION SKILL 1 | SPECIALIZATION SKILL 2
function parseSkill(r) {
  const regNo = col(r,
    'REG. NO.','REG .NO.','REG.NO.',
    'Reg. No.','Reg .No.','Reg.No.',
    'REG NO','RegNo'
  );
  if (!regNo || regNo === 'N/A') return null;
  return {
    regNo,
    name       : col(r, 'NAME','Name'),
    primary1   : col(r, 'PRIMARY SKILL 1',        'Primary Skill 1'),
    primary2   : col(r, 'PRIMARY SKILL 2',        'Primary Skill 2'),
    secondary1 : col(r, 'SECONDARY SKILL 1',      'Secondary Skill 1'),
    secondary2 : col(r, 'SECONDARY SKILL 2',      'Secondary Skill 2'),
    spec1      : col(r, 'SPECIALIZATION SKILL 1', 'Specialization Skill 1'),
    spec2      : col(r, 'SPECIALIZATION SKILL 2', 'Specialization Skill 2'),
  };
}

// ── SHEET 3: PS COMPLETION ───────────────────────────────────────
// Headers: S. No | NAME | REG .NO. | DEPT. | ROLE |
//   REWARD POINTS | ACTIVITY POINTS |
//   MANDATORY PS COMPLETION (YES/NO) |
//   [Date range cols with sub-headers: ATTEMPTS / CLEARED]
function parsePS(r) {
  const regNo = col(r,
    'REG .NO.','REG. NO.','REG.NO.',
    'Reg .No.','Reg. No.','Reg.No.',
    'REG NO','RegNo'
  );
  if (!regNo || regNo === 'N/A') return null;

  // Sum all weekly ATTEMPTS and CLEARED columns
  let totalAttempts = 0, totalCleared = 0;
  for (const k in r) {
    const kl = k.trim().toLowerCase();
    if (kl === 'attempts') totalAttempts += parseInt(r[k]) || 0;
    if (kl === 'cleared')  totalCleared  += parseInt(r[k]) || 0;
  }

  return {
    regNo,
    name                : col(r, 'NAME','Name'),
    dept                : col(r, 'DEPT.','DEPT','Dept.','Dept','DEPARTMENT','Department'),
    role                : col(r, 'ROLE','Role'),
    rewardPts           : parseInt(col(r, 'REWARD POINTS','Reward Points'))   || 0,
    activityPts         : parseInt(col(r, 'ACTIVITY POINTS','Activity Points')) || 0,
    mandatoryCompletion : col(r,
                            'MANDATORY PS COMPLETION (YES/NO)',
                            'Mandatory PS Completion (YES/NO)',
                            'MANDATORY PS COMPLETION',
                            'Mandatory PS Completion'
                          ),
    weeklyAttempts : totalAttempts,
    weeklyCleared  : totalCleared,
  };
}

// ── SHEET 4: EVENTS ──────────────────────────────────────────────
// Headers: __S.NO__ | EVENTS | MONTH - YEAR | HOST | Type | DOCUMENTATION
function parseEvent(r) {
  const name = col(r, 'EVENTS','Events','EVENT NAME','Event Name','NAME','Name');
  if (!name || name === 'N/A') return null;
  return {
    name,
    monthYear : col(r, 'MONTH - YEAR','Month - Year','MONTH-YEAR','Month-Year','MONTH','Month'),
    host      : col(r, 'HOST','Host'),
    type      : col(r, 'Type','TYPE','type'),
    doc       : col(r, 'DOCUMENTATION','Documentation'),
  };
}

// ── SHEET 5: MISSED ATTENDANCE ───────────────────────────────────
function parseAttend(r) {
  return {
    date      : col(r, 'DATE','Date'),
    regNo     : col(r, 'REGISTER NUMBER','Register Number','REG .NO.','REG. NO.','REG NO','Reg No'),
    name      : col(r, 'NAME','Name'),
    mail      : col(r, 'MAIL ID','Mail ID','EMAIL','Email'),
    missedHour: parseInt(col(r, 'MISSED HOUR','Missed Hour','MISSED HOURS','Missed Hours')) || 0,
  };
}

// Normalise regNo — strip ALL internal spaces for safe key matching
// e.g. "7376252IT310" == "7376252IT310", "7376252 IT310" → same
const normReg = r => (r||'').replace(/\s+/g,'').toUpperCase();

function mergeMembers(details, skills, ps) {
  const sm={}, pm={};
  skills.forEach(s => { sm[normReg(s.regNo)] = s; });
  ps.forEach(p     => { pm[normReg(p.regNo)] = p; });
  return details.map(d => ({
    ...d,
    skills : sm[normReg(d.regNo)] || {},
    ps     : pm[normReg(d.regNo)] || {},
  }));
}

async function loadSheetData() {
  setLoader('FETCHING TEAM DATA…');
  const settled = await Promise.allSettled([
    fetchCSV(GID.details),
    fetchCSV(GID.skills),
    fetchCSV(GID.ps),
    fetchCSV(GID.events),
    fetchCSV(GID.attendance),
  ]);

  const ok = res => res.status === 'fulfilled' ? csvToObjects(res.value) : [];

  const rawDetails = ok(settled[0]);
  const rawSkills  = ok(settled[1]);
  const rawPS      = ok(settled[2]);
  const rawEvents  = ok(settled[3]);
  const rawAttend  = ok(settled[4]);

  const details = rawDetails.map(parseDetail).filter(Boolean);
  const skills  = rawSkills .map(parseSkill) .filter(Boolean);
  const ps      = rawPS     .map(parsePS)    .filter(Boolean);
  const events  = rawEvents .map(parseEvent) .filter(Boolean);
  const attend  = rawAttend .map(parseAttend);

  S.members         = mergeMembers(details, skills, ps);
  S.events          = events;
  S.attendance      = attend;
  S.filteredMembers = [...S.members];

  // Debug info in console
  console.log(`[NEXUS] Loaded: ${details.length} members, ${skills.length} skills, ${ps.length} PS rows, ${events.length} events`);

  if (!details.length) {
    showToast('⚠ Sheet returned 0 rows — check: (1) Sheet is public, (2) GID values are correct.', 'warning');
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE LOGIN — the only place S.mode is assigned
// ═══════════════════════════════════════════════════════════════
async function loginWithEmail(email, displayName, picture) {
  // Ensure loader is fully gone first
  hideLoader();

  // Show loading state inside the login card
  const card = document.getElementById('loginCard');
  if (card) card.innerHTML = `
    <div style="padding:48px 20px;text-align:center">
      <div class="loader-ring" style="margin:0 auto 20px;width:52px;height:52px;border-width:3px"></div>
      <p class="login-status-text" style="color:var(--cyan);margin-bottom:6px">LOADING TEAM DATA…</p>
      <p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${email}</p>
    </div>`;

  // Make sure login screen is visible while we load
  showLoginScreen();

  try { await loadSheetData(); }
  catch(err) {
    console.error('Sheet load error:', err);
    showToast('Could not load Google Sheet. Make it public and check GIDs.','error');
    location.reload(); return;
  }

  const el    = email.toLowerCase();
  const match = S.members.find(m => (m.mail||'').toLowerCase() === el);
  const rRole = (match?.role||'').toLowerCase();

  // Captain: email in CAPTAIN_EMAILS list  OR  "captain" in role (not "vice captain")
  const capByEmail = CAPTAIN_EMAILS.map(e=>e.toLowerCase()).includes(el);
  const capByRole  = rRole.includes('captain') && !rRole.includes('vice');
  const isCaptain  = capByEmail || capByRole;

  S.loggedInUser = {
    email, picture,
    name    : match ? match.name    : (displayName || email.split('@')[0]),
    regNo   : match ? match.regNo   : null,
    role    : match ? match.role    : (isCaptain ? 'Captain' : 'Guest'),
    inRoster: !!match,
  };
  S.mode = isCaptain ? 'captain' : 'member'; // SET ONCE — never changed again

  document.getElementById('roleScreen').classList.add('hidden');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  applyModeUI();
  renderUserProfile();
  subscribeCaptainData(); // start Firestore live listener — works for both captain & members
  renderAll();

  showToast(
    isCaptain
      ? `Welcome Captain ${S.loggedInUser.name.split(' ')[0]}! Full access granted.`
      : `Welcome ${S.loggedInUser.name.split(' ')[0]}. Signed in as Member.`,
    isCaptain ? 'success' : 'info'
  );
  if(!match) showToast('Email not found in roster — guest view active.','warning');
}

function showLoginError(msg) {
  document.getElementById('loginErrMsg').textContent = msg;
  document.getElementById('loginError').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
// SIGN OUT
// ═══════════════════════════════════════════════════════════════
function signOut() {
  if (_firestoreUnsub) { _firestoreUnsub(); _firestoreUnsub = null; }
  if (typeof window._fbSignOut === 'function') window._fbSignOut().catch(()=>{});
  location.reload();
}

// ═══════════════════════════════════════════════════════════════
// MODE UI — controls every visible element based on role
// ═══════════════════════════════════════════════════════════════
function applyModeUI() {
  const isCap = S.mode === 'captain';

  // Mode pill
  const tag   = document.getElementById('sbModeTag');
  const badge = document.getElementById('modeBadge');
  tag.textContent         = isCap ? '● CAPTAIN MODE'          : '● MEMBER MODE';
  tag.style.color         = isCap ? 'var(--gold)'             : 'var(--green)';
  badge.textContent       = isCap ? 'CAPTAIN'                 : 'MEMBER';
  badge.style.background  = isCap ? 'rgba(255,215,0,0.1)'     : 'var(--cyan-glow)';
  badge.style.color       = isCap ? 'var(--gold)'             : 'var(--cyan)';
  badge.style.borderColor = isCap ? 'rgba(255,215,0,0.3)'     : 'var(--cyan-dim)';

  // Show/hide captain-only DOM elements (nav links, task tab, etc.)
  document.querySelectorAll('.captain-only').forEach(el => el.classList.toggle('hidden', !isCap));
}

// ═══════════════════════════════════════════════════════════════
// ACCESS GUARD — call this at the top of every captain action
// ═══════════════════════════════════════════════════════════════
function requireCaptain(label) {
  if(S.mode !== 'captain') {
    showToast(`"${label}" is Captain-only. You are signed in as Member.`, 'error');
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// USER PROFILE DISPLAY
// ═══════════════════════════════════════════════════════════════
function renderUserProfile() {
  const u = S.loggedInUser; if(!u) return;
  const ini = u.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  const img = p => `<img src="${p}" alt="${ini}" onerror="this.parentElement.textContent='${ini}'">`;

  document.getElementById('sbUserName').textContent  = u.name;
  document.getElementById('sbUserEmail').textContent = u.email;
  document.getElementById('sbUserAvatar').innerHTML  = u.picture ? img(u.picture) : ini;

  document.getElementById('topbarUserName').textContent = u.name.split(' ')[0];
  document.getElementById('topbarUserRole').textContent = u.role || '—';
  document.getElementById('topbarAvatar').innerHTML     = u.picture ? img(u.picture) : ini;
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════
function wireListeners() {

  // ── Firebase Google button ────────────────────────────────────
  document.getElementById('firebaseGoogleBtn').addEventListener('click', () => {
    const b = document.getElementById('firebaseGoogleBtn');
    const s = document.getElementById('googleBtnLoader');
    const t = document.querySelector('.google-btn-text');
    b.disabled = true;
    if(s) s.classList.remove('hidden');
    if(t) t.style.visibility = 'hidden';
    if(typeof window._firebaseGoogleSignIn === 'function') {
      window._firebaseGoogleSignIn();
    } else {
      setTimeout(() => {
        if(typeof window._firebaseGoogleSignIn === 'function') window._firebaseGoogleSignIn();
        else { resetGBtn(); showLoginError('Firebase not ready — please refresh the page.'); }
      }, 1500);
    }
  });

  document.getElementById('loginRetry').addEventListener('click', () => {
    document.getElementById('loginError').classList.add('hidden');
  });

  // ── Hamburger ─────────────────────────────────────────────────
  document.getElementById('hamburger').addEventListener('click', toggleSidebar);
  document.addEventListener('click', e => {
    const sb = document.getElementById('sidebar'), hb = document.getElementById('hamburger');
    if(sb.classList.contains('open') && !sb.contains(e.target) && !hb.contains(e.target))
      sb.classList.remove('open');
  });

  // ── Navigation ────────────────────────────────────────────────
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', e => {
    e.preventDefault();
    const sec = item.dataset.section;
    // Block member from captain-only sections
    if((sec==='captain'||sec==='attendance') && S.mode!=='captain') {
      showToast('Captain access required for this section.','error');
      return;
    }
    navigateTo(sec);
    document.getElementById('sidebar').classList.remove('open');
  }));

  document.getElementById('signOutBtn').addEventListener('click', signOut);

  // ── Filters ───────────────────────────────────────────────────
  document.getElementById('searchInput')  .addEventListener('input',  applyFilters);
  document.getElementById('filterDept')   .addEventListener('change', applyFilters);
  document.getElementById('filterRole')   .addEventListener('change', applyFilters);
  document.getElementById('sortBy')       .addEventListener('change', applyFilters);
  document.getElementById('clearFilters') .addEventListener('click',  clearFilters);

  // ── View toggle ───────────────────────────────────────────────
  document.getElementById('viewCard') .addEventListener('click', () => setView('card'));
  document.getElementById('viewTable').addEventListener('click', () => setView('table'));

  // ── Captain panel buttons (all guarded by requireCaptain inside) ──
  document.getElementById('saveVenue')       .addEventListener('click', saveVenue);
  document.getElementById('assignBulkTask') .addEventListener('click', assignBulkTask);
  document.getElementById('exportTasks')    .addEventListener('click', exportTasks);
  document.getElementById('resetTasks')     .addEventListener('click', resetAllTasks);
  document.getElementById('taskSearchInput').addEventListener('input',  renderTaskTable);
  document.getElementById('taskStatusFilter').addEventListener('change', renderTaskTable);

  document.querySelectorAll('.tob-item').forEach(item => item.addEventListener('click', () => {
    S.taskFilter = item.dataset.filter;
    document.querySelectorAll('.tob-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    renderTaskTable();
  }));

  // ── Member modal ──────────────────────────────────────────────
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('memberModal').addEventListener('click', e => {
    if(e.target===document.getElementById('memberModal')) closeModal();
  });
  document.querySelectorAll('.mm-tab').forEach(tab => tab.addEventListener('click', () => {
    // Block member from clicking the Task tab (it shouldn't even be visible, but extra safety)
    if(tab.dataset.tab==='tasks' && S.mode!=='captain') {
      showToast('Task management is Captain-only.','error'); return;
    }
    switchModalTab(tab.dataset.tab);
  }));
  document.getElementById('saveTask').addEventListener('click', saveModalTask);
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════
function navigateTo(sec) {
  S.activeSection = sec;
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
  document.getElementById(`sec-${sec}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${sec}"]`)?.classList.add('active');
  const L = {dashboard:'DASHBOARD',members:'MEMBERS',analytics:'ANALYTICS',events:'EVENTS',captain:'CAPTAIN PANEL',attendance:'ATTENDANCE'};
  document.getElementById('topbarSection').textContent = L[sec] || sec.toUpperCase();
  if(sec==='analytics') renderAnalyticsCharts();
  if(sec==='captain')   { renderTaskTable(); updateTaskOverview(); updateVenueDisplay(); }
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ═══════════════════════════════════════════════════════════════
// CAPTAIN DATA — stored in Firebase Firestore
// Captain writes → all members see updates in real time via onSnapshot
// ═══════════════════════════════════════════════════════════════
let _firestoreUnsub = null; // holds the onSnapshot unsubscribe fn

// Called after login — subscribe to live Firestore updates
// Fires for BOTH captain and members — everyone gets real-time venue+task
function subscribeCaptainData() {
  if (_firestoreUnsub) { _firestoreUnsub(); _firestoreUnsub = null; }

  if (typeof window._fbSubscribeCaptainData !== 'function') {
    S.captainData = { venue: '', tasks: {} };
    updateVenueDisplay();
    renderMemberStrip();
    return;
  }

  _firestoreUnsub = window._fbSubscribeCaptainData((data) => {
    // This callback fires:
    //  1. Immediately when a member logs in (current data)
    //  2. Every time captain saves venue or any task (real-time push)
    S.captainData = {
      venue : data.venue || '',
      tasks : data.tasks || {},
    };

    // Update everywhere venue/tasks are shown
    updateVenueDisplay();
    updateTaskOverview();
    renderMemberStrip(); // member-facing dashboard strip

    // Re-render member cards so task status badges stay live
    if (S.members.length) {
      renderMemberCards(S.filteredMembers.length ? S.filteredMembers : S.members);
      if (S.activeSection === 'captain') renderTaskTable();
    }
  });
}

// Write to Firestore — only captain can call this (requireCaptain guards above)
async function saveCaptainData() {
  if (typeof window._fbSaveCaptainData !== 'function') {
    showToast('Firestore not ready — please refresh the page.', 'error');
    return false;
  }
  try {
    await window._fbSaveCaptainData({
      venue : S.captainData.venue,
      tasks : S.captainData.tasks,
    });
    return true;
  } catch (e) {
    showToast('Save failed — check Firestore rules are published.', 'error');
    console.error('[NEXUS] saveCaptainData error:', e);
    return false;
  }
}

// Keep loadCaptainData as a no-op initialiser (subscription happens after login)
function loadCaptainData() {
  S.captainData = { venue: '', tasks: {} };
}

function updateVenueDisplay() {
  const v = S.captainData.venue || 'Not Set';
  // Topbar pill
  const tv = document.getElementById('venueText');
  if (tv) tv.textContent = 'Venue: ' + v;
  // Captain input field
  const inp = document.getElementById('venueInput');
  if (inp) inp.value = S.captainData.venue || '';
}

// ── MEMBER STRIP — live venue + personal task on the dashboard ────
function renderMemberStrip() {
  const venueEl = document.getElementById('misVenueVal');
  if (venueEl) {
    venueEl.textContent = S.captainData.venue || 'Not Set';
    venueEl.style.color = S.captainData.venue ? 'var(--cyan)' : 'var(--text-muted)';
  }

  const taskEl = document.getElementById('misTaskVal');
  const metaEl = document.getElementById('misTaskMeta');
  if (!taskEl) return;

  const regNo = S.loggedInUser?.regNo;
  const task  = regNo ? getTask(regNo) : null;

  if (!task || !task.title) {
    taskEl.textContent = 'No task assigned yet';
    taskEl.style.color = 'var(--text-muted)';
    if (metaEl) metaEl.innerHTML = '';
    return;
  }

  taskEl.textContent = task.title;
  taskEl.style.color = 'var(--text-primary)';

  if (metaEl) {
    const prio = task.priority || 'medium';
    const stat = task.status   || 'pending';
    const due  = task.dueDate
      ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Due: ${task.dueDate}</span>`
      : '';
    metaEl.innerHTML = `
      <span class="priority-${prio}">${prio.toUpperCase()}</span>
      <span class="status-${stat.replace(/\s+/g,'-')}">${stat.replace(/-/g,' ').toUpperCase()}</span>
      ${due}`;
  }
}
async function saveVenue() {
  if (!requireCaptain('Venue update')) return;
  const v = (document.getElementById('venueInput').value || '').trim();
  if (!v) { showToast('Enter a venue first', 'warning'); return; }
  S.captainData.venue = v;
  const ok = await saveCaptainData();
  if (ok) showToast('✓ Venue saved — all members will see it instantly', 'success');
}

// ── TASKS ─────────────────────────────────────────────────────────
function getTask(regNo) {
  return S.captainData.tasks[regNo] || { title:'', priority:'medium', dueDate:'', status:'pending', remarks:'' };
}

async function setTask(regNo, obj) {
  if (!requireCaptain('Task assignment')) return;
  S.captainData.tasks[regNo] = obj;
  await saveCaptainData(); // syncs to Firestore → all members see it
}

async function assignBulkTask() {
  if (!requireCaptain('Bulk assign')) return;
  const title = (document.getElementById('bulkTaskTitle').value || '').trim();
  if (!title) { showToast('Enter a task title', 'warning'); return; }
  const priority = document.getElementById('bulkPriority').value;
  const dueDate  = document.getElementById('bulkDueDate').value;
  S.members.forEach(m => {
    S.captainData.tasks[m.regNo] = { title, priority, dueDate, status:'pending', remarks:'' };
  });
  await saveCaptainData();
  showToast(`Task assigned to all ${S.members.length} members`, 'success');
}

function exportTasks() {
  if (!requireCaptain('Export')) return;
  const blob = new Blob([JSON.stringify({
    venue: S.captainData.venue, tasks: S.captainData.tasks, exportedAt: new Date().toISOString()
  }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nexus_tasks.json';
  a.click();
  showToast('Exported successfully', 'success');
}

async function resetAllTasks() {
  if (!requireCaptain('Reset')) return;
  if (!confirm('Reset ALL captain data (venue + tasks)? This cannot be undone.')) return;
  S.captainData = { venue:'', tasks:{} };
  await saveCaptainData();
  showToast('All captain data cleared', 'warning');
}

async function markDone(regNo) {
  if (!requireCaptain('Mark done')) return;
  const t = getTask(regNo);
  t.status = 'completed';
  S.captainData.tasks[regNo] = t;
  await saveCaptainData();
  showToast('Marked as completed', 'success');
}

function updateVenueDisplay() {
  const v = S.captainData.venue || 'Not Set';
  // Topbar pill
  const vt = document.getElementById('venueText');
  if (vt) vt.textContent = 'Venue: ' + v;
  // Captain panel input
  const inp = document.getElementById('venueInput');
  if (inp) inp.value = S.captainData.venue || '';
  // Dashboard banner
  const bv = document.getElementById('bannerVenue');
  if (bv) bv.textContent = v;
}

function updateTaskOverview() {
  const all       = Object.values(S.captainData.tasks);
  const pending   = all.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
  const completed = all.filter(t => t.status === 'completed').length;
  const high      = all.filter(t => t.priority === 'high').length;

  // Captain panel stat boxes
  const tobAll  = document.getElementById('tobAllNum');
  const tobPend = document.getElementById('tobPendNum');
  const tobComp = document.getElementById('tobCompNum');
  const tobHigh = document.getElementById('tobHighNum');
  if (tobAll)  tobAll.textContent  = S.members.length;
  if (tobPend) tobPend.textContent = pending;
  if (tobComp) tobComp.textContent = completed;
  if (tobHigh) tobHigh.textContent = high;

  // Dashboard banner — visible to ALL members
  const bt = document.getElementById('bannerTasks');
  const bc = document.getElementById('bannerCompleted');
  if (bt) bt.textContent = all.length + ' assigned';
  if (bc) bc.textContent = completed + ' done';
}

// ═══════════════════════════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════════════════════════
function renderAll() {
  renderSummaryCards();
  populateFilters();
  renderMemberCards(S.members);
  renderMemberTable(S.members);
  renderEventsSection();
  renderAttendanceTable();
  renderDashboardCharts();
  renderRecentActivity();
  updateVenueDisplay();
  updateTaskOverview();
}

// ── Summary cards ─────────────────────────────────────────────────
function renderSummaryCards() {
  const m = S.members;
  document.getElementById('sc-total')  .textContent = m.length;
  document.getElementById('sc-depts')  .textContent = new Set(m.map(x=>x.dept)).size;
  document.getElementById('sc-events') .textContent = m.reduce((a,x)=>a+(x.eventsAttended||0),0);
  document.getElementById('sc-won')    .textContent = m.reduce((a,x)=>a+(x.eventsWon||0),0);
  document.getElementById('sc-arrears').textContent = m.filter(x=>(x.arrears||0)>0).length;
  document.getElementById('sc-cgpa')   .textContent = m.length ? (m.reduce((a,x)=>a+(x.cgpa||0),0)/m.length).toFixed(2) : '--';
}

// ── Filters & search ──────────────────────────────────────────────
function populateFilters() {
  const ds = [...new Set(S.members.map(m=>m.dept).filter(Boolean))].sort();
  const rs = [...new Set(S.members.map(m=>m.role).filter(Boolean))].sort();
  document.getElementById('filterDept').innerHTML = '<option value="">All Departments</option>'
    + ds.map(d=>`<option value="${d}">${d}</option>`).join('');
  document.getElementById('filterRole').innerHTML = '<option value="">All Roles</option>'
    + rs.map(r=>`<option value="${r}">${r}</option>`).join('');
}

function applyFilters() {
  const q  = document.getElementById('searchInput').value.toLowerCase();
  const d  = document.getElementById('filterDept').value;
  const r  = document.getElementById('filterRole').value;
  const sort = document.getElementById('sortBy').value;

  let res = S.members.filter(m => {
    const mq = !q || m.name.toLowerCase().includes(q)
                  || m.regNo.toLowerCase().includes(q)
                  || (m.dept||'').toLowerCase().includes(q)
                  || (m.role||'').toLowerCase().includes(q);
    return mq && (!d||m.dept===d) && (!r||m.role===r);
  });

  if(sort) res.sort((a,b) => {
    if(sort==='name') return (a.name||'').localeCompare(b.name||'');
    const map = { cgpa:[b.cgpa,a.cgpa], rewardPts:[(b.ps?.rewardPts||0),(a.ps?.rewardPts||0)],
                  activityPts:[(b.ps?.activityPts||0),(a.ps?.activityPts||0)], eventsAttended:[b.eventsAttended||0,a.eventsAttended||0] };
    return (map[sort]||[0,0])[0] - (map[sort]||[0,0])[1];
  });

  S.filteredMembers = res;
  document.getElementById('filterCount').textContent = `Showing ${res.length} of ${S.members.length} members`;
  renderMemberCards(res);
  renderMemberTable(res);
}
function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterDept').value  = '';
  document.getElementById('filterRole').value  = '';
  document.getElementById('sortBy').value      = '';
  applyFilters();
}

// ── Role badge class — matches actual roles in your sheet ──────────
// Roles: CAPTAIN, VICE-CAPTAIN, VICE CAPTAIN, STRATEGIST,
//        TEAM MANAGER, TEAM-MANAGER, MEMBER
function badgeClass(role='') {
  const r = role.toLowerCase().replace(/-/g,' ');
  if (r === 'captain')                            return 'badge-captain';
  if (r.includes('vice'))                         return 'badge-vice-captain';
  if (r.includes('strateg'))                      return 'badge-strategist';
  if (r.includes('team manager') || r.includes('manager')) return 'badge-manager';
  if (r.includes('mentor'))                       return 'badge-mentor';
  return 'badge-member';
}

// ── Member cards ──────────────────────────────────────────────────
function renderMemberCards(members) {
  const grid = document.getElementById('membersGrid');
  if(!members.length) { grid.innerHTML='<p class="empty-state">No members match your search.</p>'; return; }
  grid.innerHTML = members.map(m => {
    const ini = (m.name||'--').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const sk  = m.skills||{};
    const tags = [sk.primary1,sk.primary2].filter(s=>s&&s!=='N/A').map(s=>`<span class="skill-tag">${s}</span>`).join('');
    const task = getTask(m.regNo);
    const taskBadge = S.mode==='captain' && task.title
      ? `<span class="skill-tag" style="color:var(--gold);border-color:rgba(255,215,0,.3)">${task.status.toUpperCase()}</span>` : '';
    return `
    <div class="member-card" onclick="openMemberModal('${m.regNo}')">
      <div class="mc-top">
        <div class="mc-avatar">${ini}</div>
        <div><div class="mc-name">${m.name||'Unknown'}</div><div class="mc-reg">${m.regNo}</div></div>
      </div>
      <div class="mc-details">
        <div class="mc-detail"><span class="mc-detail-label">DEPT</span><span class="mc-detail-val">${m.dept||'N/A'}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">CGPA</span><span class="mc-detail-val">${m.cgpa||'N/A'}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">EVENTS WON</span><span class="mc-detail-val">${m.eventsWon||0}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">REWARD PTS</span><span class="mc-detail-val">${m.ps?.rewardPts||0}</span></div>
      </div>
      <div class="mc-footer">
        <span class="role-badge ${badgeClass(m.role)}">${m.role||'Member'}</span>
        ${tags} ${taskBadge}
      </div>
    </div>`;
  }).join('');
}

// ── Member table ──────────────────────────────────────────────────
function renderMemberTable(members) {
  document.getElementById('tableHead').innerHTML = `<tr>
    <th>#</th><th>NAME</th><th>REG. NO.</th><th>DEPT</th><th>ROLE</th>
    <th>CGPA</th><th>ARREARS</th><th>EVENTS WON</th><th>REWARD PTS</th>
  </tr>`;
  document.getElementById('tableBody').innerHTML = members.length
    ? members.map((m,i) => `<tr onclick="openMemberModal('${m.regNo}')">
        <td>${i+1}</td>
        <td><strong>${m.name||'N/A'}</strong></td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${m.regNo}</td>
        <td>${m.dept||'N/A'}</td>
        <td><span class="role-badge ${badgeClass(m.role)}" style="font-size:9px">${m.role||'Member'}</span></td>
        <td style="color:var(--green)">${m.cgpa||'N/A'}</td>
        <td style="color:${(m.arrears||0)>0?'var(--red)':'var(--text-secondary)'}">${m.arrears||0}</td>
        <td>${m.eventsWon||0}</td>
        <td style="color:var(--gold)">${m.ps?.rewardPts||0}</td>
      </tr>`).join('')
    : '<tr><td colspan="9" class="empty-td">No members found.</td></tr>';
}

function setView(mode) {
  document.getElementById('membersGrid') .classList.toggle('hidden', mode!=='card');
  document.getElementById('membersTable').classList.toggle('hidden', mode!=='table');
  document.getElementById('viewCard')    .classList.toggle('active', mode==='card');
  document.getElementById('viewTable')   .classList.toggle('active', mode==='table');
}

// ── Events section ────────────────────────────────────────────────
function renderEventsSection() {
  const grid = document.getElementById('eventsGrid');
  if(!S.events.length) { grid.innerHTML='<p class="empty-state">No events data found in sheet.</p>'; return; }
  grid.innerHTML = S.events.map(ev => `
    <div class="event-card">
      <div class="event-name">${ev.name||'—'}</div>
      <div class="event-meta">📅 ${ev.monthYear||'N/A'} &nbsp;|&nbsp; 🏛 ${ev.host||'N/A'}</div>
      <span class="event-type">${ev.type||'General'}</span>
    </div>`).join('');
}

// ── Attendance table ──────────────────────────────────────────────
function renderAttendanceTable() {
  const body = document.getElementById('attendanceBody');
  if(!S.attendance.length) { body.innerHTML='<tr><td colspan="5" class="empty-td">No attendance data in sheet.</td></tr>'; return; }
  body.innerHTML = S.attendance.map(a => `<tr>
    <td>${a.date}</td>
    <td style="font-family:var(--font-mono);color:var(--cyan)">${a.regNo}</td>
    <td>${a.name}</td>
    <td style="font-size:11px">${a.mail}</td>
    <td style="color:var(--red)">${a.missedHour}</td>
  </tr>`).join('');
}

// ── Task table (captain panel) ────────────────────────────────────
function renderTaskTable() {
  const q      = (document.getElementById('taskSearchInput').value||'').toLowerCase();
  const sF     = document.getElementById('taskStatusFilter').value;
  const tF     = S.taskFilter;
  const body   = document.getElementById('taskTableBody');

  const members = S.members.filter(m => {
    const t = getTask(m.regNo);
    const mq      = !q || m.name.toLowerCase().includes(q) || m.regNo.toLowerCase().includes(q);
    const ms      = !sF || t.status===sF;
    const mt      = tF==='all' ? true
                  : tF==='pending'   ? (t.status==='pending'||t.status==='in-progress')
                  : tF==='completed' ? t.status==='completed'
                  : tF==='high'      ? t.priority==='high' : true;
    return mq && ms && mt;
  });

  body.innerHTML = members.length ? members.map(m => {
    const t = getTask(m.regNo);
    return `<tr>
      <td><strong>${m.name}</strong></td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${m.regNo}</td>
      <td>${t.title||'<span style="color:var(--text-muted)">Unassigned</span>'}</td>
      <td><span class="priority-${t.priority||'medium'}">${(t.priority||'medium').toUpperCase()}</span></td>
      <td style="font-size:11px;font-family:var(--font-mono)">${t.dueDate||'—'}</td>
      <td><span class="status-${t.status||'pending'}">${(t.status||'pending').replace('-',' ').toUpperCase()}</span></td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.remarks||''}">${t.remarks||'—'}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn-xs" onclick="openMemberModal('${m.regNo}','tasks')">EDIT</button>
        ${t.status!=='completed'?`<button class="btn-xs done" onclick="markDone('${m.regNo}')">✓</button>`:''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty-td">No tasks match the current filter.</td></tr>';
}

// ── Recent activity ───────────────────────────────────────────────
function renderRecentActivity() {
  const m = S.members;
  const items = [
    `${m.length} team members loaded from Google Sheets`,
    `${S.events.length} events in the log`,
    `${m.filter(x=>(x.ps?.mandatoryCompletion||'')===  'Yes').length} members completed Mandatory PS`,
    `${S.attendance.length} missed attendance records`,
    `Average CGPA: ${m.length?(m.reduce((a,x)=>a+(x.cgpa||0),0)/m.length).toFixed(2):'N/A'}`,
  ];
  document.getElementById('recentList').innerHTML = items.map(it =>
    `<div class="recent-item"><div class="recent-dot"></div>${it}</div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// MEMBER MODAL
// ═══════════════════════════════════════════════════════════════
function openMemberModal(regNo, defaultTab='profile') {
  const m = S.members.find(x=>x.regNo===regNo); if(!m) return;
  S.currentMember = m;

  const ini = (m.name||'--').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
  document.getElementById('mmAvatar').textContent   = ini;
  document.getElementById('mmName').textContent      = m.name||'—';
  document.getElementById('mmReg').textContent       = `REG: ${m.regNo}`;
  const rb = document.getElementById('mmRoleBadge');
  rb.textContent = m.role||'Member'; rb.className = `role-badge ${badgeClass(m.role)}`;

  // Show/hide the Task tab based on mode
  document.querySelectorAll('.mm-tab[data-tab="tasks"]').forEach(t=>t.classList.toggle('hidden', S.mode!=='captain'));

  renderModalProfile(m); renderModalSkills(m); renderModalPS(m); renderModalEvents(m);
  if(S.mode==='captain') renderModalTask(m);

  switchModalTab(defaultTab);
  document.getElementById('memberModal').classList.remove('hidden');
}
function closeModal() { document.getElementById('memberModal').classList.add('hidden'); S.currentMember=null; }
function switchModalTab(tab) {
  document.querySelectorAll('.mm-tab')  .forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  document.querySelectorAll('.mm-panel').forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));
}

const II = (l,v) => `<div class="info-item"><div class="info-label">${l}</div><div class="info-val">${v||'N/A'}</div></div>`;

function renderModalProfile(m) {
  const task = getTask(m.regNo);
  const hasTask = task.title && task.title !== '';
  const taskInfo = hasTask
    ? `<span class="priority-${task.priority}" style="font-size:11px">${task.title}</span>
       &nbsp;<span class="status-${task.status}" style="font-size:11px">[${task.status.toUpperCase()}]</span>
       ${task.dueDate ? `<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)"> Due: ${task.dueDate}</span>` : ''}`
    : '<span style="color:var(--text-muted)">No task assigned</span>';

  document.getElementById('profileInfo').innerHTML = [
    II('DEPARTMENT',       m.dept),
    II('MOBILE',           m.mobile),
    II('EMAIL',            m.mail),
    II('CGPA',             m.cgpa || 'N/A'),
    II('ARREARS',          m.arrears || 0),
    II('SPECIAL LAB',      m.specialLab),
    II('SSG MEMBER',       m.ssg),
    II('EVENTS ATTENDED',  m.eventsAttended || 0),
    II('EVENTS WON',       m.eventsWon || 0),
    II('FOREIGN LANGUAGE', m.foreignLang),
    II('MODE OF STUDY',    m.modeOfStudy),
    II('CURRENT EVENTS',   m.currentEvents || 'None'),
    II('TEAM VENUE',       S.captainData.venue || 'Not Set'),
    `<div class="info-item" style="grid-column:1/-1">
       <div class="info-label">ASSIGNED TASK</div>
       <div class="info-val">${taskInfo}</div>
     </div>`,
  ].join('');
}
function renderModalSkills(m) {
  const s=m.skills||{};
  const chip=(v,cls)=>v&&v!=='N/A'?`<span class="skill-chip ${cls}">${v}</span>`:'';
  document.getElementById('skillsDisplay').innerHTML=`
    <div class="skill-label">PRIMARY</div>${chip(s.primary1,'skill-primary')}${chip(s.primary2,'skill-primary')}
    <div class="skill-label">SECONDARY</div>${chip(s.secondary1,'skill-secondary')}${chip(s.secondary2,'skill-secondary')}
    <div class="skill-label">SPECIALIZATION</div>${chip(s.spec1,'skill-spec')}${chip(s.spec2,'skill-spec')}`;
}
function renderModalPS(m) {
  const ps=m.ps||{}, pct=ps.weeklyAttempts?Math.round(ps.weeklyCleared/ps.weeklyAttempts*100):0;
  document.getElementById('psDisplay').innerHTML=`
    <div class="info-grid">${II('REWARD PTS',ps.rewardPts||0)}${II('ACTIVITY PTS',ps.activityPts||0)}${II('MANDATORY',ps.mandatoryCompletion||'N/A')}${II('ATTEMPTS',ps.weeklyAttempts||0)}${II('CLEARED',ps.weeklyCleared||0)}</div>
    <div class="skill-label">COMPLETION RATE</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
      <div class="ps-progress" style="flex:1"><div class="ps-bar" style="width:${pct}%"></div></div>
      <span style="font-family:var(--font-mono);color:var(--cyan)">${pct}%</span>
    </div>`;
}
function renderModalEvents(m) {
  const att=(m.currentEvents||'').split(',').map(s=>s.trim()).filter(Boolean);
  const miss=S.attendance.filter(a=>a.regNo===m.regNo);
  let h=att.length?`<div class="skill-label">REGISTERED</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${att.map(e=>`<span class="event-type">${e}</span>`).join('')}</div>`:'';
  h+=`<div class="skill-label">STATS</div><div class="info-grid">${II('ATTENDED',m.eventsAttended||0)}${II('WON',m.eventsWon||0)}</div>`;
  if(miss.length) h+=`<div class="skill-label">MISSED SESSIONS</div><div class="table-wrap"><table class="data-table"><thead><tr><th>DATE</th><th>HRS</th></tr></thead><tbody>${miss.map(a=>`<tr><td>${a.date}</td><td style="color:var(--red)">${a.missedHour}</td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('eventsDisplay').innerHTML=h||'<p class="empty-state">No event data.</p>';
}
function renderModalTask(m) {
  // Only rendered when captain — no need for extra guard
  const t=getTask(m.regNo);
  document.getElementById('mmTaskTitle').value = t.title||'';
  document.getElementById('mmPriority') .value = t.priority||'medium';
  document.getElementById('mmDueDate')  .value = t.dueDate||'';
  document.getElementById('mmStatus')   .value = t.status||'pending';
  document.getElementById('mmRemarks')  .value = t.remarks||'';
}
async function saveModalTask() {
  if (!requireCaptain('Save task')) return;
  const m = S.currentMember; if (!m) return;
  S.captainData.tasks[m.regNo] = {
    title   : document.getElementById('mmTaskTitle').value.trim(),
    priority: document.getElementById('mmPriority').value,
    dueDate : document.getElementById('mmDueDate').value,
    status  : document.getElementById('mmStatus').value,
    remarks : document.getElementById('mmRemarks').value.trim(),
  };
  await saveCaptainData(); // syncs to Firestore → onSnapshot re-renders for everyone
  showToast(`Task saved for ${m.name}`, 'success');
}

// ═══════════════════════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════════════════════
const NC = ['#00d4ff','#7c3aed','#00ff88','#ffd700','#ff3366','#4488ff','#ff8c00','#00ffcc'];
const dChart = k => { if(S.charts[k]){S.charts[k].destroy();delete S.charts[k];} };
const CD = {
  plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}},
  scales:{
    x:{ticks:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}},grid:{color:'rgba(0,212,255,.05)'}},
    y:{ticks:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}},grid:{color:'rgba(0,212,255,.05)'}},
  }
};

function renderDashboardCharts() {
  const m = S.members;
  // Dept doughnut
  const dc={}; m.forEach(x=>{dc[x.dept||'N/A']=(dc[x.dept||'N/A']||0)+1;});
  dChart('dept');
  const dC=document.getElementById('deptChart');
  if(dC) S.charts.dept=new Chart(dC,{type:'doughnut',data:{labels:Object.keys(dc),datasets:[{data:Object.values(dc),backgroundColor:NC.map(c=>c+'99'),borderColor:NC,borderWidth:1}]},options:{plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}},cutout:'60%'}});
  // Role pie
  const rc={}; m.forEach(x=>{rc[x.role||'Member']=(rc[x.role||'Member']||0)+1;});
  dChart('role');
  const rC=document.getElementById('roleChart');
  if(rC) S.charts.role=new Chart(rC,{type:'pie',data:{labels:Object.keys(rc),datasets:[{data:Object.values(rc),backgroundColor:NC.map(c=>c+'88'),borderColor:NC,borderWidth:1}]},options:{plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});
  // Top CGPA bar
  const top=[...m].sort((a,b)=>(b.cgpa||0)-(a.cgpa||0)).slice(0,8);
  dChart('cgpa');
  const cC=document.getElementById('cgpaChart');
  if(cC) S.charts.cgpa=new Chart(cC,{type:'bar',data:{labels:top.map(x=>x.name.split(' ')[0]),datasets:[{label:'CGPA',data:top.map(x=>x.cgpa),backgroundColor:NC[0]+'66',borderColor:NC[0],borderWidth:1}]},options:{...CD,plugins:{legend:{display:false}},scales:{...CD.scales,y:{...CD.scales.y,min:0,max:10}}}});
}

function renderAnalyticsCharts() {
  const m = S.members;
  // Skills frequency
  const sc={}; m.forEach(x=>{const s=x.skills||{};[s.primary1,s.primary2,s.secondary1,s.secondary2].forEach(k=>{if(k&&k!=='N/A')sc[k]=(sc[k]||0)+1;});});
  const t10=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  dChart('skill');
  const skC=document.getElementById('skillChart');
  if(skC) S.charts.skill=new Chart(skC,{type:'bar',data:{labels:t10.map(x=>x[0]),datasets:[{label:'Members',data:t10.map(x=>x[1]),backgroundColor:NC[2]+'66',borderColor:NC[2],borderWidth:1}]},options:{...CD,indexAxis:'y',plugins:{legend:{display:false}}}});
  // PS completion
  const psY=m.filter(x=>(x.ps?.mandatoryCompletion||'')==='Yes').length;
  dChart('ps');
  const psC=document.getElementById('psChart');
  if(psC) S.charts.ps=new Chart(psC,{type:'doughnut',data:{labels:['Completed','Pending'],datasets:[{data:[psY,m.length-psY],backgroundColor:[NC[2]+'99',NC[4]+'99'],borderColor:[NC[2],NC[4]],borderWidth:1}]},options:{cutout:'65%',plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});
  // Task completion
  const at=Object.values(S.captainData.tasks||{});
  const tc={c:at.filter(t=>t.status==='completed').length,i:at.filter(t=>t.status==='in-progress').length,p:at.filter(t=>t.status==='pending').length,u:m.length-at.length};
  dChart('task');
  const tC=document.getElementById('taskChart');
  if(tC) S.charts.task=new Chart(tC,{type:'doughnut',data:{labels:['Completed','In Progress','Pending','Unassigned'],datasets:[{data:[tc.c,tc.i,tc.p,tc.u],backgroundColor:[NC[2]+'99',NC[0]+'99',NC[3]+'99','#445566'],borderColor:[NC[2],NC[0],NC[3],'#667799'],borderWidth:1}]},options:{cutout:'65%',plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});
  // Event trend
  const em={}; S.events.forEach(ev=>{em[ev.monthYear||'N/A']=(em[ev.monthYear||'N/A']||0)+1;});
  dChart('eventTrend');
  const etC=document.getElementById('eventTrendChart');
  if(etC) S.charts.eventTrend=new Chart(etC,{type:'line',data:{labels:Object.keys(em),datasets:[{label:'Events',data:Object.values(em),borderColor:NC[1],backgroundColor:NC[1]+'22',tension:.4,fill:true,pointBackgroundColor:NC[1]}]},options:{...CD,plugins:{legend:{display:false}}}});
  // Activity vs Reward scatter
  dChart('points');
  const ptC=document.getElementById('pointsChart');
  if(ptC) S.charts.points=new Chart(ptC,{type:'scatter',data:{datasets:[{label:'Members',data:m.map(x=>({x:x.ps?.activityPts||0,y:x.ps?.rewardPts||0,label:x.name})),backgroundColor:NC[0]+'99',borderColor:NC[0],pointRadius:6}]},options:{...CD,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.label}: Act ${c.raw.x}, Rew ${c.raw.y}`}}}}});
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
function showToast(msg, type='info') {
  const cont=document.getElementById('toastContainer'), el=document.createElement('div');
  const ic={success:'✓',error:'✕',warning:'⚠',info:'◉'};
  const cl={success:'var(--green)',error:'var(--red)',warning:'var(--gold)',info:'var(--cyan)'};
  el.className=`toast ${type}`;
  el.innerHTML=`<span style="color:${cl[type]}">${ic[type]}</span>${msg}`;
  cont.appendChild(el); setTimeout(()=>el.remove(),3200);
}