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

// ← Update these gid values to match YOUR spreadsheet tabs
// (Click each tab in Google Sheets → URL shows ?gid=XXXXXXXX)
const GID = {
  details    : '0',           // Sheet 1 — Details
  skills     : '559279686',   // Sheet 2 — Skills
  ps         : '1889884415',  // Sheet 3 — PS Completion
  events     : '1647711386',  // Sheet 4 — Events
  attendance : '952830820',   // Sheet 5 — Missed Attendance
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
// FIREBASE CALLBACKS (called from the <script type="module"> in index.html)
// ═══════════════════════════════════════════════════════════════
window._onFirebaseUser    = u   => { resetGBtn(); loginWithEmail(u.email||'', u.displayName||'', u.photoURL||''); };
window._onFirebaseSignOut = ()  => resetGBtn();
window._onFirebaseError   = msg => { resetGBtn(); showLoginError(msg); };

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadCaptainData();
  wireListeners();
  setTimeout(() => {
    setLoader('FIREBASE CONNECTED');
    setTimeout(() => { hideLoader(); showLoginScreen(); }, 800);
  }, 1400);
});

const setLoader    = t => { const e = document.getElementById('loaderSub'); if(e) e.textContent = t; };
const hideLoader   = () => { const l = document.getElementById('loader'); l.style.opacity='0'; setTimeout(()=>l.classList.add('hidden'), 500); };
const showLoginScreen = () => document.getElementById('roleScreen').classList.remove('hidden');

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

// Safely read a column — tries multiple possible header names
function col(row, ...keys) {
  for(const k of keys) {
    for(const attempt of [k, k.toLowerCase(), k.toUpperCase()]) {
      if(row[attempt] !== undefined && String(row[attempt]).trim() !== '')
        return String(row[attempt]).trim();
    }
  }
  return 'N/A';
}

// ── Row parsers (match your actual sheet column names) ──────────
function parseDetail(r) {
  const regNo = col(r,'Reg. No.','Reg No','RegNo','Registration Number','Reg.No.');
  if(!regNo || regNo==='N/A') return null;
  return {
    regNo,
    sno           : col(r,'S. No','S.No','sno'),
    name          : col(r,'Name','name'),
    dept          : col(r,'Department','Dept','dept'),
    role          : col(r,'Role','role'),
    mobile        : col(r,'Mobile Number','Mobile','Phone','mobile'),
    mail          : col(r,'Mail ID','Email','Email ID','mail'),
    cgpa          : parseFloat(col(r,'CGPA','cgpa')) || 0,
    arrears       : parseInt(col(r,'Arrears Count','Arrears','arrears')) || 0,
    specialLab    : col(r,'Special Lab','specialLab'),
    ssg           : col(r,'Member of SSG','SSG','ssg'),
    eventsAttended: parseInt(col(r,'Events Attended','eventsAttended')) || 0,
    eventsWon     : parseInt(col(r,'Events Won','eventsWon')) || 0,
    foreignLang   : col(r,'Foreign Language Selected','Foreign Language','foreignLang'),
    modeOfStudy   : col(r,'Mode of Study','modeOfStudy'),
    currentEvents : col(r,'Currently Registered Events','Current Events','currentEvents'),
  };
}
function parseSkill(r) {
  const regNo = col(r,'Reg. No.','Reg No','RegNo');
  if(!regNo||regNo==='N/A') return null;
  return { regNo,
    primary1  : col(r,'Primary Skill 1','primary1'),
    primary2  : col(r,'Primary Skill 2','primary2'),
    secondary1: col(r,'Secondary Skill 1','secondary1'),
    secondary2: col(r,'Secondary Skill 2','secondary2'),
    spec1     : col(r,'Specialization Skill 1','spec1'),
    spec2     : col(r,'Specialization Skill 2','spec2'),
  };
}
function parsePS(r) {
  const regNo = col(r,'Reg. No.','Reg No','RegNo');
  if(!regNo||regNo==='N/A') return null;
  return { regNo,
    rewardPts           : parseInt(col(r,'Reward Points','rewardPts'))||0,
    activityPts         : parseInt(col(r,'Activity Points','activityPts'))||0,
    mandatoryCompletion : col(r,'Mandatory PS Completion','mandatoryCompletion'),
    weeklyAttempts      : parseInt(col(r,'Weekly Attempts','weeklyAttempts'))||0,
    weeklyCleared       : parseInt(col(r,'Weekly Cleared','weeklyCleared'))||0,
  };
}
function parseEvent(r) {
  return { name:col(r,'Event Name','name'), monthYear:col(r,'Month-Year','monthYear'), host:col(r,'Host','host'), type:col(r,'Type','type') };
}
function parseAttend(r) {
  return { date:col(r,'Date','date'), regNo:col(r,'Register Number','Reg No','regNo'),
           name:col(r,'Name','name'), mail:col(r,'Mail ID','Email','mail'),
           missedHour:parseInt(col(r,'Missed Hour','Missed Hours','missedHour'))||0 };
}

function mergeMembers(details, skills, ps) {
  const sm={}, pm={};
  skills.forEach(s => sm[s.regNo]=s);
  ps.forEach(p => pm[p.regNo]=p);
  return details.map(d => ({ ...d, skills: sm[d.regNo]||{}, ps: pm[d.regNo]||{} }));
}

async function loadSheetData() {
  setLoader('FETCHING TEAM DATA FROM GOOGLE SHEETS…');
  const settled = await Promise.allSettled([
    fetchCSV(GID.details), fetchCSV(GID.skills), fetchCSV(GID.ps),
    fetchCSV(GID.events),  fetchCSV(GID.attendance),
  ]);
  const ok = r => r.status==='fulfilled' ? csvToObjects(r.value) : [];
  const details  = ok(settled[0]).map(parseDetail).filter(Boolean);
  const skills   = ok(settled[1]).map(parseSkill).filter(Boolean);
  const ps       = ok(settled[2]).map(parsePS).filter(Boolean);
  S.members      = mergeMembers(details, skills, ps);
  S.events       = ok(settled[3]).map(parseEvent);
  S.attendance   = ok(settled[4]).map(parseAttend);
  S.filteredMembers = [...S.members];
  if(!details.length)
    showToast('No data loaded — make the Google Sheet public (Anyone with link → Viewer) and verify GID values.','warning');
}

// ═══════════════════════════════════════════════════════════════
// CORE LOGIN — the only place S.mode is assigned
// ═══════════════════════════════════════════════════════════════
async function loginWithEmail(email, displayName, picture) {
  // Show loading state in card
  const card = document.getElementById('loginCard');
  if(card) card.innerHTML = `
    <div style="padding:48px 20px;text-align:center">
      <div class="loader-ring" style="margin:0 auto 20px;width:52px;height:52px;border-width:3px"></div>
      <p class="login-status-text" style="color:var(--cyan);margin-bottom:6px">LOADING TEAM DATA…</p>
      <p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${email}</p>
    </div>`;

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
  if(typeof window._fbSignOut==='function') window._fbSignOut().catch(()=>{});
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
// CAPTAIN DATA (localStorage — venue & tasks persist across sessions)
// ═══════════════════════════════════════════════════════════════
function loadCaptainData() {
  try { S.captainData = JSON.parse(localStorage.getItem(LS_KEY)) || {venue:'',tasks:{}}; }
  catch(_) { S.captainData = {venue:'',tasks:{}}; }
  updateVenueDisplay();
}
function saveCaptainData() { localStorage.setItem(LS_KEY, JSON.stringify(S.captainData)); }

// ── VENUE ────────────────────────────────────────────────────────
function saveVenue() {
  if(!requireCaptain('Venue update')) return; // hard guard
  const v = (document.getElementById('venueInput').value||'').trim();
  if(!v) { showToast('Enter a venue first','warning'); return; }
  S.captainData.venue = v;
  saveCaptainData();
  updateVenueDisplay();
  showToast('Venue updated: ' + v, 'success');
}
function updateVenueDisplay() {
  const v = S.captainData.venue || 'Not Set';
  document.getElementById('venueText').textContent = 'Venue: ' + v;
  const inp = document.getElementById('venueInput');
  if(inp) inp.value = S.captainData.venue || '';
}

// ── TASKS ─────────────────────────────────────────────────────────
function getTask(regNo) {
  return S.captainData.tasks[regNo] || {title:'',priority:'medium',dueDate:'',status:'pending',remarks:''};
}
function setTask(regNo, obj) {
  if(!requireCaptain('Task assignment')) return; // hard guard
  S.captainData.tasks[regNo] = obj;
  saveCaptainData();
}

function assignBulkTask() {
  if(!requireCaptain('Bulk assign')) return;
  const title = (document.getElementById('bulkTaskTitle').value||'').trim();
  if(!title) { showToast('Enter a task title','warning'); return; }
  const priority = document.getElementById('bulkPriority').value;
  const dueDate  = document.getElementById('bulkDueDate').value;
  S.members.forEach(m => {
    S.captainData.tasks[m.regNo] = {title, priority, dueDate, status:'pending', remarks:''};
  });
  saveCaptainData();
  updateTaskOverview();
  renderTaskTable();
  showToast(`Task assigned to all ${S.members.length} members`, 'success');
}

function exportTasks() {
  if(!requireCaptain('Export')) return;
  const blob = new Blob([JSON.stringify({
    venue: S.captainData.venue, tasks: S.captainData.tasks, exportedAt: new Date().toISOString()
  }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nexus_tasks.json';
  a.click();
  showToast('Exported successfully','success');
}

function resetAllTasks() {
  if(!requireCaptain('Reset')) return;
  if(!confirm('Reset ALL captain data (venue + tasks)? This cannot be undone.')) return;
  S.captainData = {venue:'',tasks:{}};
  saveCaptainData();
  updateVenueDisplay();
  updateTaskOverview();
  renderTaskTable();
  showToast('All captain data cleared','warning');
}

function markDone(regNo) {
  if(!requireCaptain('Mark done')) return;
  const t = getTask(regNo); t.status='completed';
  S.captainData.tasks[regNo] = t; saveCaptainData();
  updateTaskOverview(); renderTaskTable();
  showToast('Marked as completed','success');
}

function updateTaskOverview() {
  const all = Object.values(S.captainData.tasks);
  document.getElementById('tobAllNum') .textContent = S.members.length;
  document.getElementById('tobPendNum').textContent = all.filter(t=>t.status==='pending'||t.status==='in-progress').length;
  document.getElementById('tobCompNum').textContent = all.filter(t=>t.status==='completed').length;
  document.getElementById('tobHighNum').textContent = all.filter(t=>t.priority==='high').length;
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

// ── Role badge class ───────────────────────────────────────────────
function badgeClass(role='') {
  const r = role.toLowerCase();
  if(r.includes('captain')&&!r.includes('vice')) return 'badge-captain';
  if(r.includes('vice'))                          return 'badge-vice-captain';
  if(r.includes('strategist'))                    return 'badge-strategist';
  if(r.includes('mentor'))                        return 'badge-mentor';
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
  document.getElementById('profileInfo').innerHTML = [
    II('DEPARTMENT',m.dept), II('MOBILE',m.mobile), II('EMAIL',m.mail),
    II('CGPA',m.cgpa), II('ARREARS',m.arrears||0), II('SPECIAL LAB',m.specialLab),
    II('SSG MEMBER',m.ssg), II('EVENTS ATTENDED',m.eventsAttended||0),
    II('EVENTS WON',m.eventsWon||0), II('FOREIGN LANGUAGE',m.foreignLang),
    II('MODE OF STUDY',m.modeOfStudy), II('CURRENT EVENTS',m.currentEvents||'None'),
    II('TEAM VENUE', S.captainData.venue||'Not Set'),
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
function saveModalTask() {
  if(!requireCaptain('Save task')) return; // hard guard
  const m=S.currentMember; if(!m) return;
  S.captainData.tasks[m.regNo] = {
    title   : document.getElementById('mmTaskTitle').value.trim(),
    priority: document.getElementById('mmPriority').value,
    dueDate : document.getElementById('mmDueDate').value,
    status  : document.getElementById('mmStatus').value,
    remarks : document.getElementById('mmRemarks').value.trim(),
  };
  saveCaptainData();
  updateTaskOverview(); renderTaskTable(); renderMemberCards(S.filteredMembers);
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