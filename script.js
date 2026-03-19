/* ══════════════════════════════════════════════════════════════════
   NEXUS TEAM DASHBOARD — script.js
   Data   : Google Sheets (live CSV)
   Sync   : Firebase Firestore (venue, tasks, skill logs — real-time)
   Access : Captain → full edit  |  Member → read-only
══════════════════════════════════════════════════════════════════ */
'use strict';

// ── Google Sheets config ─────────────────────────────────────────
const SHEET_ID = '1hDjwJBT5N_YzPHZNFpZOvYJOyXD5ks8qkClM_psY9Es';
const CSV_BASE = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const GID = {
  details    : '1766801887',
  skills     : '1529264533',
  ps         : '0',
  events     : '1929646157',
  attendance : '2141076572',
};

// Captain emails — seeded from hard-coded list, then overridden live from Firestore nexus/config
// Fix 5: no longer hard-coded only — Firestore is the source of truth after first load
let CAPTAIN_EMAILS = ['ritviks.it25@bitsathy.ac.in'];

// ── Global state ─────────────────────────────────────────────────
const S = {
  mode           : 'member',
  loggedInUser   : null,
  members        : [],
  events         : [],
  attendance     : [],
  filteredMembers: [],
  captainData    : { venue: '', tasks: {} },
  captainEmails  : ['ritviks.it25@bitsathy.ac.in'], // Fix 5: live from Firestore
  skillLogs      : {},
  activeSection  : 'dashboard',
  currentMember  : null,
  taskFilter     : 'all',
  charts         : {},
  slotDraft      : [],
  isOnline       : navigator.onLine,  // Fix 4: offline tracking
};

// ── Firestore unsubscribe handles ───────────────────────────────
let _unsubCaptain = null;
let _unsubSkills  = null;
let _unsubConfig  = null;  // Fix 5: captain config listener

// ── Boot state ───────────────────────────────────────────────────
let _domReady    = false;
let _pendingUser = null;
let _deferredInstallPrompt = null;
let _installBannerDismissed = false;

/* ════════════════════════════════════════════════════════════════
   FIREBASE CALLBACKS — called by the module block in index.html
   These may fire before DOMContentLoaded, so we queue if needed.
════════════════════════════════════════════════════════════════ */
window._onFirebaseUser = (u) => {
  if (!_domReady) { _pendingUser = u; return; }
  resetGBtn(); hideLoader();
  loginWithEmail(u.email || '', u.displayName || '', u.photoURL || '');
};
window._onFirebaseSignOut = () => { if (_domReady) resetGBtn(); };
window._onFirebaseError   = (msg) => { resetGBtn(); hideLoader(); showLoginScreen(); showLoginError(msg); };

/* ════════════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  wireListeners();
  setupOfflineDetection(); // Fix 4
  setupInstallExperience();
  registerServiceWorker();
  _domReady = true;
  setLoader('SYSTEM READY');
  setTimeout(() => {
    hideLoader();
    if (_pendingUser) {
      const u = _pendingUser; _pendingUser = null;
      loginWithEmail(u.email || '', u.displayName || '', u.photoURL || '');
    } else {
      showLoginScreen();
    }
  }, 1000);
});

const setLoader       = t => { const e = document.getElementById('loaderSub'); if (e) e.textContent = t; };
const hideLoader      = () => { const l = document.getElementById('loader'); if (!l || l.classList.contains('hidden')) return; l.style.opacity = '0'; setTimeout(() => l.classList.add('hidden'), 500); };
const showLoginScreen = () => document.getElementById('roleScreen').classList.remove('hidden');

// Fix 4 — Offline detection: show/hide banner, warn user
function setupOfflineDetection() {
  const showBanner = (offline) => {
    const b = document.getElementById('offlineBanner');
    if (!b) return;
    b.classList.toggle('hidden', !offline);
    if (offline) showToast('⚡ Internet connection lost — live sync paused', 'warning');
    else         showToast('✓ Back online — syncing now', 'success');
  };
  window.addEventListener('offline', () => { S.isOnline = false; showBanner(true);  });
  window.addEventListener('online',  () => { S.isOnline = true;  showBanner(false); });
  // Show banner immediately if already offline on page load
  if (!navigator.onLine) showBanner(true);
}

function setupInstallExperience() {
  const installBtn = document.getElementById('installAppBtn');
  const dismissBtn = document.getElementById('dismissInstallBtn');

  if (installBtn) installBtn.addEventListener('click', installApp);
  if (dismissBtn) dismissBtn.addEventListener('click', dismissInstallBanner);

  if (window.matchMedia('(display-mode: standalone)').matches) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    _deferredInstallPrompt = event;
    _installBannerDismissed = false;
    toggleInstallBanner(true);
  });

  window.addEventListener('appinstalled', () => {
    _deferredInstallPrompt = null;
    toggleInstallBanner(false);
    showToast('NEXUS installed successfully', 'success');
  });

  if (isIosInstallCandidate()) {
    toggleInstallBanner(true);
  }
}

function isIosInstallCandidate() {
  const ua = window.navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isStandalone = window.navigator.standalone === true;
  return isIos && !isStandalone;
}

function toggleInstallBanner(show) {
  const banner = document.getElementById('installBanner');
  if (!banner) return;

  const shouldShow = show && !_installBannerDismissed && !window.matchMedia('(display-mode: standalone)').matches;
  banner.classList.toggle('hidden', !shouldShow);
}

function dismissInstallBanner() {
  _installBannerDismissed = true;
  toggleInstallBanner(false);
}

async function installApp() {
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    const choice = await _deferredInstallPrompt.userChoice;
    if (choice.outcome !== 'accepted') showToast('Install cancelled', 'warning');
    _deferredInstallPrompt = null;
    toggleInstallBanner(false);
    return;
  }

  if (isIosInstallCandidate()) {
    showToast('On iPhone: Share -> Add to Home Screen', 'info');
    return;
  }

  showToast('Open this site in Chrome or Edge over HTTPS to install it', 'warning');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('[NEXUS] service worker registration failed:', err));
  });
}

function resetGBtn() {
  const b = document.getElementById('firebaseGoogleBtn');
  const s = document.getElementById('googleBtnLoader');
  const t = document.querySelector('.google-btn-text');
  if (!b) return;
  b.disabled = false;
  if (s) s.classList.add('hidden');
  if (t) t.style.visibility = 'visible';
}

/* ════════════════════════════════════════════════════════════════
   GOOGLE SHEETS → FETCH & PARSE
════════════════════════════════════════════════════════════════ */
async function fetchCSV(gid) {
  const r = await fetch(`${CSV_BASE}&gid=${gid}&cb=${Date.now()}`);
  if (!r.ok) throw new Error(`gid ${gid} → HTTP ${r.status}`);
  return r.text();
}

function csvToObjects(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (q) { if (c === '"' && n === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(f.trim()); f = ''; }
      else if (c === '\r' && n === '\n') { row.push(f.trim()); rows.push(row); row = []; f = ''; i++; }
      else if (c === '\n' || c === '\r') { row.push(f.trim()); rows.push(row); row = []; f = ''; }
      else f += c;
    }
  }
  if (f || row.length) { row.push(f.trim()); rows.push(row); }
  const clean = rows.filter(r => r.some(c => c !== ''));
  if (!clean.length) return [];
  const [hdr, ...data] = clean;
  return data.map(r => { const o = {}; hdr.forEach((h, i) => { o[h.trim()] = (r[i] || '').trim(); }); return o; });
}

// Case-insensitive column reader
function col(row, ...keys) {
  const norm = {};
  for (const k in row) norm[k.trim().toLowerCase()] = String(row[k] ?? '').trim();
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim()) return String(row[k]).trim();
    const v = norm[k.trim().toLowerCase()];
    if (v !== undefined && v !== '') return v;
  }
  return 'N/A';
}

function parseDetail(r) {
  const regNo = col(r, 'REG .NO.', 'REG. NO.', 'REG.NO.', 'Reg .No.', 'Reg. No.', 'REG NO', 'RegNo');
  if (!regNo || regNo === 'N/A') return null;
  const arrRaw  = col(r, 'ARREARS COUNT (CURRENT)', 'ARREARS COUNT', 'ARREARS');
  const cgpaRaw = col(r, 'CGPA');
  // Store null for '-', empty, or unparseable CGPA so UI shows 'N/A' not '0'
  const cgpaParsed = parseFloat(cgpaRaw);
  const cgpa = (!cgpaRaw || cgpaRaw === '-' || cgpaRaw === 'N/A' || isNaN(cgpaParsed)) ? null : cgpaParsed;
  return {
    regNo,
    sno: col(r, 'S. No', 'S. NO', 'S.No'),
    name: col(r, 'NAME', 'Name'),
    dept: col(r, 'DEPARTMENT', 'Department', 'DEPT'),
    role: col(r, 'ROLE', 'Role'),
    mobile: col(r, 'MOBILE NUMBER', 'Mobile Number', 'MOBILE'),
    mail: col(r, 'MAIL ID', 'Mail ID', 'EMAIL', 'Email'),
    cgpa,  // null means 'N/A', a number means actual CGPA
    arrears: (arrRaw === 'NIL' || arrRaw === 'N/A') ? 0 : parseInt(arrRaw) || 0,
    specialLab: col(r, 'SPECIAL LAB', 'Special Lab'),
    ssg: col(r, 'MEMBER OF SSG', 'Member of SSG', 'SSG'),
    eventsAttended: parseInt(col(r, 'EVENTS ATTENDED', 'Events Attended')) || 0,
    eventsWon: parseInt(col(r, 'EVENTS WON', 'Events Won')) || 0,
    foreignLang: col(r, 'FOREIGN LANGUAGE SELECTED', 'Foreign Language Selected', 'FOREIGN LANGUAGE'),
    modeOfStudy: col(r, 'MODE OF STUDY', 'Mode of Study'),
    currentEvents: col(r, 'CURRENTLY REGISTERED EVENTS', 'Currently Registered Events', 'CURRENT EVENTS'),
    notes: col(r, 'NOTES', 'Notes'),
  };
}

function parseSkill(r) {
  const regNo = col(r, 'REG. NO.', 'REG .NO.', 'REG.NO.', 'Reg. No.', 'Reg .No.', 'REG NO', 'RegNo');
  if (!regNo || regNo === 'N/A') return null;
  return {
    regNo,
    primary1: col(r, 'PRIMARY SKILL 1', 'Primary Skill 1'),
    primary2: col(r, 'PRIMARY SKILL 2', 'Primary Skill 2'),
    secondary1: col(r, 'SECONDARY SKILL 1', 'Secondary Skill 1'),
    secondary2: col(r, 'SECONDARY SKILL 2', 'Secondary Skill 2'),
    spec1: col(r, 'SPECIALIZATION SKILL 1', 'Specialization Skill 1'),
    spec2: col(r, 'SPECIALIZATION SKILL 2', 'Specialization Skill 2'),
  };
}

function parsePS(r) {
  const regNo = col(r, 'REG .NO.', 'REG. NO.', 'REG.NO.', 'Reg .No.', 'Reg. No.', 'REG NO', 'RegNo');
  if (!regNo || regNo === 'N/A') return null;
  let attempts = 0, cleared = 0;
  for (const k in r) {
    const kl = k.trim().toLowerCase();
    if (kl === 'attempts') attempts += parseInt(r[k]) || 0;
    if (kl === 'cleared') cleared += parseInt(r[k]) || 0;
  }
  return {
    regNo,
    rewardPts: parseInt(col(r, 'REWARD POINTS', 'Reward Points')) || 0,
    activityPts: parseInt(col(r, 'ACTIVITY POINTS', 'Activity Points')) || 0,
    mandatoryCompletion: col(r, 'MANDATORY PS COMPLETION (YES/NO)', 'MANDATORY PS COMPLETION', 'Mandatory PS Completion'),
    weeklyAttempts: attempts,
    weeklyCleared: cleared,
  };
}

function parseEvent(r) {
  const name = col(r, 'EVENTS', 'Events', 'EVENT NAME', 'Event Name');
  if (!name || name === 'N/A') return null;
  return { name, monthYear: col(r, 'MONTH - YEAR', 'Month - Year', 'MONTH-YEAR', 'Month-Year'), host: col(r, 'HOST', 'Host'), type: col(r, 'Type', 'TYPE'), doc: col(r, 'DOCUMENTATION', 'Documentation') };
}

function parseAttend(r) {
  return { date: col(r, 'DATE', 'Date'), regNo: col(r, 'REGISTER NUMBER', 'Register Number', 'REG .NO.', 'REG. NO.', 'REG NO'), name: col(r, 'NAME', 'Name'), mail: col(r, 'MAIL ID', 'Mail ID', 'EMAIL', 'Email'), missedHour: parseInt(col(r, 'MISSED HOUR', 'Missed Hour', 'MISSED HOURS')) || 0 };
}

const normReg = r => (r || '').replace(/\s+/g, '').toUpperCase();

function mergeMembers(details, skills, ps) {
  const sm = {}, pm = {};
  skills.forEach(s => { sm[normReg(s.regNo)] = s; });
  ps.forEach(p => { pm[normReg(p.regNo)] = p; });
  return details.map(d => ({ ...d, skills: sm[normReg(d.regNo)] || {}, ps: pm[normReg(d.regNo)] || {} }));
}

// ── Sheet data cache (30 min TTL) ────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let _sheetCache = null; // { data, ts }

async function loadSheetData() {
  // Return cached data if fresh
  if (_sheetCache && (Date.now() - _sheetCache.ts) < CACHE_TTL) {
    const c = _sheetCache.data;
    S.members         = c.members;
    S.events          = c.events;
    S.attendance      = c.attendance;
    S.filteredMembers = [...c.members];
    console.log('[NEXUS] Using cached sheet data');
    return;
  }

  setLoader('FETCHING SHEET DATA…');
  const settled = await Promise.allSettled([
    fetchCSV(GID.details), fetchCSV(GID.skills), fetchCSV(GID.ps), fetchCSV(GID.events), fetchCSV(GID.attendance),
  ]);
  const ok = res => res.status === 'fulfilled' ? csvToObjects(res.value) : [];
  const details  = ok(settled[0]).map(parseDetail).filter(Boolean);
  const skills   = ok(settled[1]).map(parseSkill).filter(Boolean);
  const ps       = ok(settled[2]).map(parsePS).filter(Boolean);
  S.events       = ok(settled[3]).map(parseEvent).filter(Boolean);
  S.attendance   = ok(settled[4]).map(parseAttend);
  S.members      = mergeMembers(details, skills, ps);
  S.filteredMembers = [...S.members];

  // Store in cache
  _sheetCache = { ts: Date.now(), data: { members: S.members, events: S.events, attendance: S.attendance } };

  console.log(`[NEXUS] Loaded: ${details.length} members, ${S.events.length} events`);
  if (!details.length) showToast('Sheet returned 0 rows — check sharing + GIDs', 'warning');
}

/* ════════════════════════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════════════════════════ */
async function loginWithEmail(email, displayName, picture) {
  hideLoader();
  const card = document.getElementById('loginCard');
  if (card) card.innerHTML = `
    <div style="padding:48px;text-align:center">
      <div class="loader-ring" style="margin:0 auto 20px;width:52px;height:52px;border-width:3px"></div>
      <p style="font-family:var(--font-mono);font-size:12px;color:var(--cyan);margin-bottom:6px">LOADING TEAM DATA…</p>
      <p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${email}</p>
    </div>`;
  showLoginScreen();

  try { await loadSheetData(); }
  catch (err) {
    console.error(err);
    // Fix 4: if offline, try to use cached data instead of reloading
    if (!navigator.onLine && _sheetCache) {
      const c = _sheetCache.data;
      S.members = c.members; S.events = c.events; S.attendance = c.attendance;
      S.filteredMembers = [...c.members];
      showToast('Offline — using cached data', 'warning');
    } else {
      showToast('Could not load sheet. Check public sharing + GIDs.', 'error');
      location.reload(); return;
    }
  }

  const el  = email.toLowerCase();
  const match = S.members.find(m => (m.mail || '').toLowerCase() === el);
  const role  = (match?.role || '').toLowerCase().replace(/-/g, ' ');

  // Fix 5: check both hard-coded fallback AND live Firestore captainEmails
  const capByEmail = S.captainEmails.map(e => e.toLowerCase()).includes(el);
  const capByRole  = role === 'captain';
  const isCaptain  = capByEmail || capByRole;

  S.loggedInUser = {
    email, picture,
    name    : match ? match.name  : (displayName || email.split('@')[0]),
    regNo   : match ? match.regNo : null,
    role    : match ? match.role  : (isCaptain ? 'Captain' : 'Guest'),
    inRoster: !!match,
  };
  S.mode = isCaptain ? 'captain' : 'member';

  document.getElementById('roleScreen').classList.add('hidden');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  applyModeUI();
  renderUserProfile();

  // Start all Firestore listeners
  startConfigListener();   // Fix 5: captain emails live from Firestore
  startCaptainListener();  // venue + tasks
  startSkillListener();    // skill logs

  renderAll();
  showToast(
    isCaptain
      ? `Welcome Captain ${S.loggedInUser.name.split(' ')[0]}!`
      : `Welcome ${S.loggedInUser.name.split(' ')[0]}`,
    isCaptain ? 'success' : 'info'
  );
  if (!match) showToast('Email not in roster — guest view active', 'warning');
}

function showLoginError(msg) {
  document.getElementById('loginErrMsg').textContent = msg;
  document.getElementById('loginError').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════════
   FIRESTORE LISTENERS — real-time sync for everyone
════════════════════════════════════════════════════════════════ */

// ── Captain data: venue + tasks ──────────────────────────────────
function startCaptainListener() {
  if (_unsubCaptain) { _unsubCaptain(); _unsubCaptain = null; }
  if (typeof window._fbListenCaptainData !== 'function') return;

  _unsubCaptain = window._fbListenCaptainData((data) => {
    // Fires immediately on login AND every time captain saves
    S.captainData = { venue: data.venue || '', tasks: data.tasks || {} };
    onCaptainDataUpdated();
  });
}

// Called every time Firestore pushes new captain data to this client
function onCaptainDataUpdated() {
  updateVenueEverywhere();
  updateLiveBanner();
  updateTaskOverview();
  // Refresh member cards (task status badges)
  if (S.members.length) renderMemberCards(S.filteredMembers.length ? S.filteredMembers : S.members);
  if (S.activeSection === 'captain') renderTaskTable();
  if (S.currentMember && S.mode === 'captain') renderModalTask(S.currentMember);
}

// ── Skill logs listener — fires for ALL clients on every member save ──
function startSkillListener() {
  if (_unsubSkills) { _unsubSkills(); _unsubSkills = null; }
  if (typeof window._fbListenSkillLogs !== 'function') {
    console.warn('[NEXUS] _fbListenSkillLogs not ready yet — retrying in 1s');
    setTimeout(startSkillListener, 1000);
    return;
  }

  _unsubSkills = window._fbListenSkillLogs((logs) => {
    // Normalise all keys: strip spaces so lookup always works
    // regardless of how the regNo was originally saved
    const normalised = {};
    Object.entries(logs).forEach(([key, val]) => {
      // Keep both the original key AND the normalised key so
      // lookups work no matter what format was used when saving
      normalised[key] = val;
      const nk = (key || '').replace(/\s+/g, '').toUpperCase();
      if (nk !== key) normalised[nk] = val;
    });
    S.skillLogs = normalised;

    // Always re-render the team table so all open browsers update
    renderSkillTeamTable();

    // If user is currently on the skill progress page, also refresh their personal view
    if (S.activeSection === 'skills') renderSkillTeamTable();
  });
}

/* ════════════════════════════════════════════════════════════════
   SAVE — captain writes to Firestore → onSnapshot pushes to all
════════════════════════════════════════════════════════════════ */
async function saveCaptainData() {
  if (typeof window._fbSaveCaptainData !== 'function') {
    showToast('Firestore not ready — refresh the page', 'error'); return false;
  }
  try {
    await window._fbSaveCaptainData({ venue: S.captainData.venue, tasks: S.captainData.tasks });
    return true;
  } catch (e) {
    console.error('[NEXUS] saveCaptainData:', e);
    showToast('Save failed — check Firestore rules are published', 'error');
    return false;
  }
}

async function saveMySkillLog(entries) {
  const u = S.loggedInUser;

  // email is the Firestore document ID — must match auth token email (rule enforces this)
  if (!u?.email) {
    showToast('Not signed in — please sign in again', 'error');
    return false;
  }
  if (!u?.regNo) {
    showToast('Your Google email is not linked to any roster member. Check that your Mail ID in the sheet matches your Google account email exactly.', 'error');
    return false;
  }
  if (typeof window._fbSaveSkillLog !== 'function') {
    showToast('Firestore not ready — please refresh', 'error');
    return false;
  }

  try {
    // Pass email as first arg — becomes the Firestore doc ID
    // The rule validates: auth.token.email == userEmail (the doc path)
    // AND request.resource.data.email == auth.token.email
    await window._fbSaveSkillLog(u.email, {
      regNo  : u.regNo,
      name   : u.name,
      email  : u.email,   // stored in doc body too — rule checks this field
      entries: entries,
    });

    // onSnapshot fires automatically on all clients including this one
    showToast('✓ Skill progress saved — all members can see it now', 'success');
    return true;
  } catch (e) {
    console.error('[NEXUS] saveMySkillLog error:', e);
    const hint = e.code === 'permission-denied'
      ? 'Permission denied — check Firestore rules are published.'
      : e.message || e.code || 'Unknown error';
    showToast(`Skill save failed: ${hint}`, 'error');
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════
   SIGN OUT
════════════════════════════════════════════════════════════════ */
function signOut() {
  if (_unsubCaptain) { _unsubCaptain(); _unsubCaptain = null; }
  if (_unsubSkills)  { _unsubSkills();  _unsubSkills  = null; }
  if (_unsubConfig)  { _unsubConfig();  _unsubConfig  = null; }
  if (typeof window._fbSignOut === 'function') window._fbSignOut().catch(() => {});
  location.reload();
}

/* ════════════════════════════════════════════════════════════════
   FIX 5 — CONFIG LISTENER: captain emails stored in Firestore
   nexus/config  { captainEmails: ['a@b.com', 'c@d.com'] }
   Firestore rule: same write guard as captainData (isCaptain only)
════════════════════════════════════════════════════════════════ */
function startConfigListener() {
  if (_unsubConfig) { _unsubConfig(); _unsubConfig = null; }
  if (typeof window._fbListenConfig !== 'function') return;

  _unsubConfig = window._fbListenConfig((cfg) => {
    // Merge Firestore list with the hard-coded seed so we never lock out
    const fromFirestore = (cfg.captainEmails || []).map(e => e.toLowerCase());
    const seed = ['ritviks.it25@bitsathy.ac.in']; // permanent fallback
    S.captainEmails = [...new Set([...seed, ...fromFirestore])];
    CAPTAIN_EMAILS  = S.captainEmails; // keep global in sync
    renderCaptainEmailList();
  });
}

function renderCaptainEmailList() {
  const el = document.getElementById('captainEmailList');
  if (!el) return;
  const isCap = S.mode === 'captain';
  el.innerHTML = S.captainEmails.length
    ? S.captainEmails.map(email => `
        <span class="skill-chip skill-primary" style="display:inline-flex;align-items:center;gap:8px;font-size:10px">
          ${email}
          ${isCap && email !== S.loggedInUser?.email
            ? `<button onclick="removeCaptainEmail('${email}')" class="btn-xs" style="padding:1px 6px" title="Remove">✕</button>`
            : '<span style="font-size:9px;opacity:.5">(you)</span>'}
        </span>`).join('')
    : '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px">No captains configured</span>';
}

async function addCaptainEmail() {
  if (!requireCaptain('Add captain')) return;
  const inp = document.getElementById('newCaptainEmail');
  const email = (inp?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { showToast('Enter a valid email address', 'warning'); return; }
  if (S.captainEmails.includes(email)) { showToast('Already a captain', 'warning'); return; }

  const updated = [...S.captainEmails, email];
  try {
    await window._fbSaveConfig({ captainEmails: updated });
    inp.value = '';
    showToast(`✓ ${email} added as Captain`, 'success');
  } catch (e) {
    showToast('Failed to save — check Firestore rules', 'error');
    console.error('[NEXUS] addCaptainEmail:', e);
  }
}

window.removeCaptainEmail = async (email) => {
  if (!requireCaptain('Remove captain')) return;
  if (email === S.loggedInUser?.email) { showToast('Cannot remove yourself', 'warning'); return; }
  if (!confirm(`Remove ${email} from captain list?`)) return;

  const updated = S.captainEmails.filter(e => e !== email);
  try {
    await window._fbSaveConfig({ captainEmails: updated });
    showToast(`${email} removed from captains`, 'success');
  } catch (e) {
    showToast('Failed to save — check Firestore rules', 'error');
    console.error('[NEXUS] removeCaptainEmail:', e);
  }
};

/* ════════════════════════════════════════════════════════════════
   MODE UI
════════════════════════════════════════════════════════════════ */
function applyModeUI() {
  const isCap = S.mode === 'captain';
  const tag = document.getElementById('sbModeTag'), badge = document.getElementById('modeBadge');
  tag.textContent   = isCap ? '● CAPTAIN MODE' : '● MEMBER MODE';
  tag.style.color   = isCap ? 'var(--gold)' : 'var(--green)';
  badge.textContent = isCap ? 'CAPTAIN' : 'MEMBER';
  badge.style.background  = isCap ? 'rgba(255,215,0,.1)' : 'var(--cyan-glow)';
  badge.style.color       = isCap ? 'var(--gold)' : 'var(--cyan)';
  badge.style.borderColor = isCap ? 'rgba(255,215,0,.3)' : 'var(--cyan-dim)';
  document.querySelectorAll('.captain-only').forEach(el => el.classList.toggle('hidden', !isCap));
}

function requireCaptain(label) {
  if (S.mode !== 'captain') { showToast(`"${label}" is Captain-only`, 'error'); return false; }
  return true;
}

function renderUserProfile() {
  const u = S.loggedInUser; if (!u) return;
  const ini = u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const img = p => `<img src="${p}" alt="${ini}" onerror="this.parentElement.textContent='${ini}'">`;
  document.getElementById('sbUserName').textContent  = u.name;
  document.getElementById('sbUserEmail').textContent = u.email;
  document.getElementById('sbUserAvatar').innerHTML  = u.picture ? img(u.picture) : ini;
  document.getElementById('topbarUserName').textContent = u.name.split(' ')[0];
  document.getElementById('topbarUserRole').textContent = u.role || '—';
  document.getElementById('topbarAvatar').innerHTML     = u.picture ? img(u.picture) : ini;
}

/* ════════════════════════════════════════════════════════════════
   VENUE DISPLAY — updates in every UI element at once
════════════════════════════════════════════════════════════════ */
function updateVenueEverywhere() {
  const v = S.captainData.venue || 'Not Set';
  // Topbar pill
  const tv = document.getElementById('venueText'); if (tv) tv.textContent = 'Venue: ' + v;
  // Captain panel input + hint
  const vi = document.getElementById('venueInput'); if (vi) vi.value = S.captainData.venue || '';
  const vh = document.getElementById('currentVenueHint'); if (vh) vh.textContent = v;
  // Live banner
  const lv = document.getElementById('lbVenue'); if (lv) { lv.textContent = v; lv.style.color = S.captainData.venue ? 'var(--cyan)' : 'var(--text-muted)'; }
}

/* ════════════════════════════════════════════════════════════════
   LIVE BANNER — venue + my task + task summary (dashboard top)
   Visible to ALL members, updates in real time
════════════════════════════════════════════════════════════════ */
function updateLiveBanner() {
  // My task
  const regNo  = S.loggedInUser?.regNo;
  const task   = regNo ? getTask(regNo) : null;
  const taskEl = document.getElementById('lbTask');
  const metaEl = document.getElementById('lbTaskMeta');
  if (taskEl) {
    if (task?.title) {
      taskEl.textContent = task.title;
      taskEl.style.color = 'var(--text-primary)';
      if (metaEl) {
        const prio = task.priority || 'medium';
        const stat = task.status   || 'pending';
        const due  = task.dueDate ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)"> · Due: ${task.dueDate}</span>` : '';
        metaEl.innerHTML = `<span class="priority-${prio}">${prio.toUpperCase()}</span> <span class="status-${stat.replace(/\s/g,'-')}">${stat.replace(/-/g,' ').toUpperCase()}</span>${due}`;
      }
    } else {
      taskEl.textContent = 'No task assigned';
      taskEl.style.color = 'var(--text-muted)';
      if (metaEl) metaEl.innerHTML = '';
    }
  }

  // Task summary for everyone
  const all  = Object.values(S.captainData.tasks);
  const done = all.filter(t => t.status === 'completed').length;
  const sumEl = document.getElementById('lbTaskSummary');
  if (sumEl) sumEl.textContent = `${all.length} assigned · ${done} done`;
}

/* ════════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════════ */
function wireListeners() {
  // Google sign-in button
  document.getElementById('firebaseGoogleBtn').addEventListener('click', () => {
    const b = document.getElementById('firebaseGoogleBtn');
    const s = document.getElementById('googleBtnLoader');
    const t = document.querySelector('.google-btn-text');
    b.disabled = true; if (s) s.classList.remove('hidden'); if (t) t.style.visibility = 'hidden';
    if (typeof window._firebaseGoogleSignIn === 'function') window._firebaseGoogleSignIn();
    else setTimeout(() => {
      if (typeof window._firebaseGoogleSignIn === 'function') window._firebaseGoogleSignIn();
      else { resetGBtn(); showLoginError('Firebase not ready — refresh the page'); }
    }, 1500);
  });

  document.getElementById('loginRetry').addEventListener('click', () =>
    document.getElementById('loginError').classList.add('hidden'));

  // Hamburger — Fix 3: use touchstart for iOS Safari responsiveness
  const hamburger = document.getElementById('hamburger');
  const sidebar   = document.getElementById('sidebar');
  hamburger.addEventListener('click', () => sidebar.classList.toggle('open'));
  // Fix 3: close sidebar on outside tap — works on iOS because the overlay div is clickable
  document.addEventListener('click', e => {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !hamburger.contains(e.target))
      sidebar.classList.remove('open');
  });
  // Fix 3: iOS Safari needs cursor:pointer on the body for click delegation to fire
  document.body.style.cursor = 'auto'; // forces iOS to register tap events on non-interactive elements

  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', e => {
    e.preventDefault();
    const sec = item.dataset.section;
    if ((sec === 'captain' || sec === 'attendance') && S.mode !== 'captain') {
      showToast('Captain access required', 'error'); return;
    }
    navigateTo(sec); sidebar.classList.remove('open');
  }));

  document.getElementById('signOutBtn').addEventListener('click', signOut);

  // Fix 2: Refresh Data button — clears cache and re-fetches sheet
  document.getElementById('refreshDataBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshDataBtn');
    btn.textContent = '↺ REFRESHING…'; btn.disabled = true;
    _sheetCache = null; // bust cache
    try {
      await loadSheetData();
      renderAll();
      showToast('✓ Data refreshed from Google Sheets', 'success');
    } catch (e) {
      showToast('Refresh failed — check internet connection', 'error');
    }
    btn.textContent = '↺ REFRESH DATA'; btn.disabled = false;
  });

  document.getElementById('searchInput')  .addEventListener('input',  applyFilters);
  document.getElementById('filterDept')   .addEventListener('change', applyFilters);
  document.getElementById('filterRole')   .addEventListener('change', applyFilters);
  document.getElementById('sortBy')       .addEventListener('change', applyFilters);
  document.getElementById('clearFilters') .addEventListener('click',  clearFilters);
  document.getElementById('viewCard')     .addEventListener('click',  () => setView('card'));
  document.getElementById('viewTable')    .addEventListener('click',  () => setView('table'));

  // Captain panel
  document.getElementById('saveVenueBtn')    .addEventListener('click', saveVenue);
  document.getElementById('assignBulkBtn')   .addEventListener('click', assignBulkTask);
  document.getElementById('exportTasksBtn')  .addEventListener('click', exportTasks);
  document.getElementById('resetTasksBtn')   .addEventListener('click', resetAllTasks);
  document.getElementById('taskSearch')      .addEventListener('input',  renderTaskTable);
  document.getElementById('taskStatusFilter').addEventListener('change', renderTaskTable);

  // Fix 5: Captain email management buttons
  document.getElementById('addCaptainEmailBtn').addEventListener('click', addCaptainEmail);
  document.getElementById('newCaptainEmail').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCaptainEmail(); }
  });

  document.querySelectorAll('.tob-item').forEach(item => item.addEventListener('click', () => {
    S.taskFilter = item.dataset.filter;
    document.querySelectorAll('.tob-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active'); renderTaskTable();
  }));

  // Skill progress
  document.getElementById('addSlotBtn')   .addEventListener('click', addSlot);
  document.getElementById('saveSkillBtn') .addEventListener('click', saveWeekEntry);
  document.getElementById('skillSlotName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSlot(); } });
  document.getElementById('skillWeek')    .addEventListener('change', loadWeekDraft);

  // Modal
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('memberModal').addEventListener('click', e => {
    if (e.target === document.getElementById('memberModal')) closeModal();
  });
  document.querySelectorAll('.mm-tab').forEach(tab => tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'task' && S.mode !== 'captain') {
      showToast('Task editing is Captain-only', 'error'); return;
    }
    switchModalTab(tab.dataset.tab);
  }));
  document.getElementById('saveTaskBtn').addEventListener('click', saveModalTask);
}

/* ════════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════ */
function navigateTo(sec) {
  S.activeSection = sec;
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  document.getElementById(`sec-${sec}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${sec}"]`)?.classList.add('active');
  const L = { dashboard: 'DASHBOARD', members: 'MEMBERS', analytics: 'ANALYTICS', events: 'EVENTS', skills: 'SKILL PROGRESS', captain: 'CAPTAIN PANEL', attendance: 'ATTENDANCE' };
  document.getElementById('topbarSection').textContent = L[sec] || sec.toUpperCase();
  if (sec === 'analytics') renderAnalyticsCharts();
  if (sec === 'captain')   { renderTaskTable(); updateTaskOverview(); }
  if (sec === 'skills')    { initSkillWeek(); }
}

/* ════════════════════════════════════════════════════════════════
   CAPTAIN — VENUE
════════════════════════════════════════════════════════════════ */
async function saveVenue() {
  if (!requireCaptain('Venue update')) return;
  const v = (document.getElementById('venueInput').value || '').trim();
  if (!v) { showToast('Enter a venue first', 'warning'); return; }

  const btn = document.getElementById('saveVenueBtn');
  const orig = btn.textContent;
  btn.textContent = 'SAVING…'; btn.disabled = true;

  S.captainData.venue = v;
  updateVenueEverywhere();
  const ok = await saveCaptainData();

  btn.textContent = orig; btn.disabled = false;
  if (ok) showToast('✓ Venue saved — syncing to all members now', 'success');
}

async function assignBulkTask() {
  if (!requireCaptain('Bulk assign')) return;
  const title = (document.getElementById('bulkTaskTitle').value || '').trim();
  if (!title) { showToast('Enter a task title', 'warning'); return; }

  const btn = document.getElementById('assignBulkBtn');
  const orig = btn.textContent;
  btn.textContent = 'SAVING…'; btn.disabled = true;

  const priority = document.getElementById('bulkPriority').value;
  const dueDate  = document.getElementById('bulkDueDate').value;
  S.members.forEach(m => { S.captainData.tasks[m.regNo] = { title, priority, dueDate, status: 'pending', remarks: '' }; });
  const ok = await saveCaptainData();

  btn.textContent = orig; btn.disabled = false;
  if (ok) showToast(`Task assigned to all ${S.members.length} members`, 'success');
}

function getTask(regNo) {
  return S.captainData.tasks[regNo] || { title: '', priority: 'medium', dueDate: '', status: 'pending', remarks: '' };
}

function exportTasks() {
  if (!requireCaptain('Export')) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ venue: S.captainData.venue, tasks: S.captainData.tasks, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
  a.download = 'nexus_tasks.json'; a.click();
  showToast('Exported', 'success');
}

async function resetAllTasks() {
  if (!requireCaptain('Reset')) return;
  if (!confirm('Reset venue and ALL tasks? Cannot be undone.')) return;
  S.captainData = { venue: '', tasks: {} };
  await saveCaptainData();
  showToast('All captain data cleared', 'warning');
}

async function markDone(regNo) {
  if (!requireCaptain('Mark done')) return;
  const t = getTask(regNo); t.status = 'completed';
  S.captainData.tasks[regNo] = t;
  await saveCaptainData();
  showToast('Marked as completed', 'success');
}

function updateTaskOverview() {
  const all  = Object.values(S.captainData.tasks);
  const pend = all.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
  const comp = all.filter(t => t.status === 'completed').length;
  const high = all.filter(t => t.priority === 'high').length;
  const e = id => document.getElementById(id);
  if (e('tobAll'))  e('tobAll').textContent  = S.members.length;
  if (e('tobPend')) e('tobPend').textContent = pend;
  if (e('tobComp')) e('tobComp').textContent = comp;
  if (e('tobHigh')) e('tobHigh').textContent = high;
}

function renderTaskTable() {
  const q   = (document.getElementById('taskSearch').value || '').toLowerCase();
  const sf  = document.getElementById('taskStatusFilter').value;
  const tf  = S.taskFilter;
  const body = document.getElementById('taskTableBody');

  const list = S.members.filter(m => {
    const t  = getTask(m.regNo);
    const mq = !q || m.name.toLowerCase().includes(q) || m.regNo.toLowerCase().includes(q);
    const ms = !sf || t.status === sf;
    const mt = tf === 'all' ? true : tf === 'pending' ? (t.status === 'pending' || t.status === 'in-progress') : tf === 'completed' ? t.status === 'completed' : tf === 'high' ? t.priority === 'high' : true;
    return mq && ms && mt;
  });

  body.innerHTML = list.length ? list.map(m => {
    const t = getTask(m.regNo);
    return `<tr>
      <td><strong>${m.name}</strong></td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${m.regNo}</td>
      <td>${t.title || '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
      <td><span class="priority-${t.priority || 'medium'}">${(t.priority || 'medium').toUpperCase()}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px">${t.dueDate || '—'}</td>
      <td><span class="status-${(t.status || 'pending').replace(/\s/g, '-')}">${(t.status || 'pending').replace(/-/g, ' ').toUpperCase()}</span></td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="${t.remarks || ''}">${t.remarks || '—'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-xs" onclick="openMemberModal('${m.regNo}','task')">EDIT</button>
        ${t.status !== 'completed' ? `<button class="btn-xs done" onclick="markDone('${m.regNo}')">✓</button>` : ''}
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty-td">No tasks match filter.</td></tr>';
}

/* ════════════════════════════════════════════════════════════════
   SKILL PROGRESS — per-member weekly entries
   Everyone can VIEW all entries.
   Each member can only EDIT their own.
════════════════════════════════════════════════════════════════ */
function currentWeekStr() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - new Date(Date.UTC(y, 0, 1))) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function initSkillWeek() {
  const wi = document.getElementById('skillWeek');
  if (wi && !wi.value) wi.value = currentWeekStr();
  S.slotDraft = [];
  loadWeekDraft();
}

function loadWeekDraft() {
  const u    = S.loggedInUser;
  const week = document.getElementById('skillWeek')?.value;
  if (!u || !week) return;

  // Match by email (Firestore primary key) → regNo fallbacks for legacy data
  const normReg = (u.regNo || '').replace(/\s+/g, '').toUpperCase();
  const log     = S.skillLogs[u.email]
               || S.skillLogs[(u.email || '').toLowerCase()]
               || S.skillLogs[u.regNo]
               || S.skillLogs[normReg];

  const existing = (log?.entries || []).find(e => e.week === week);
  S.slotDraft    = existing ? [...(existing.slots || [])] : [];
  const notes    = document.getElementById('skillNotes');
  if (notes) notes.value = existing?.notes || '';
  renderSlotDraft();
}

function addSlot() {
  const nameEl   = document.getElementById('skillSlotName');
  const resultEl = document.getElementById('skillSlotResult');
  const name = (nameEl?.value || '').trim();
  if (!name) { showToast('Enter a PS slot name', 'warning'); return; }
  S.slotDraft.push({ name, result: resultEl?.value || 'passed' });
  nameEl.value = ''; renderSlotDraft();
}

window.removeSlot = idx => { S.slotDraft.splice(idx, 1); renderSlotDraft(); };

function renderSlotDraft() {
  const el = document.getElementById('slotDraftList');
  if (!el) return;
  el.innerHTML = S.slotDraft.length
    ? S.slotDraft.map((s, i) => `
        <span class="skill-chip ${s.result === 'passed' ? 'skill-primary' : 'skill-spec'}" style="display:inline-flex;align-items:center;gap:8px">
          ${s.name} <span style="font-size:10px">[${s.result.toUpperCase()}]</span>
          <button onclick="removeSlot(${i})" class="btn-xs" style="padding:1px 6px">✕</button>
        </span>`).join('')
    : '<span style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px">No slots added yet</span>';
}

async function saveWeekEntry() {
  const u = S.loggedInUser;
  if (!u?.regNo) {
    showToast('Your Google email is not linked to any roster member. Check Mail ID in sheet.', 'error');
    return;
  }
  const week = document.getElementById('skillWeek')?.value;
  if (!week)               { showToast('Select a week first', 'warning'); return; }
  if (!S.slotDraft.length) { showToast('Add at least one PS slot', 'warning'); return; }
  const notes = (document.getElementById('skillNotes')?.value || '').trim();

  // Primary key = email (per Firestore rule), fallback to regNo variants
  const normKey = (u.regNo || '').replace(/\s+/g, '').toUpperCase();
  const log  = S.skillLogs[u.email] || S.skillLogs[u.regNo] || S.skillLogs[normKey];
  const prev = (log?.entries || []).filter(e => e.week !== week);
  const entries = [...prev, { week, slots: [...S.slotDraft], notes, savedAt: Date.now() }];

  const saved = await saveMySkillLog(entries);
  if (saved) {
    S.slotDraft = [];
    renderSlotDraft();
    const notesEl = document.getElementById('skillNotes');
    if (notesEl) notesEl.value = '';
  }
}

// ── Team table — ALL members' entries, visible to everyone ─────────
function renderSkillTeamTable() {
  const body = document.getElementById('skillTeamBody');
  if (!body) return;

  const rows = [];
  S.members.forEach(m => {
    // Primary key = email (Firestore doc ID per rules).
    // Fallback to regNo variants for any data saved before the email-key fix.
    const normReg = (m.regNo || '').replace(/\s+/g, '').toUpperCase();
    const log = S.skillLogs[m.mail]      // email from sheet (matches Firestore doc ID)
             || S.skillLogs[(m.mail||'').toLowerCase()]
             || S.skillLogs[m.regNo]     // legacy fallback
             || S.skillLogs[normReg];    // normalised regNo fallback

    if (!log?.entries?.length) {
      rows.push({ member: m, week: '—', slots: [], notes: '—' });
    } else {
      const sorted = [...log.entries].sort((a, b) => (b.week || '').localeCompare(a.week || ''));
      sorted.forEach(entry => rows.push({
        member: m,
        week  : entry.week || '—',
        slots : entry.slots || [],
        notes : entry.notes || '—',
      }));
    }
  });

  if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="empty-td">No skill entries yet.</td></tr>'; return; }

  body.innerHTML = rows.map(row => {
    const slotsHtml = row.slots.length
      ? row.slots.map(s => `<span class="skill-chip ${s.result === 'passed' ? 'skill-primary' : 'skill-spec'}" style="font-size:9px;padding:2px 8px">${s.name} [${(s.result || '').toUpperCase()}]</span>`).join(' ')
      : '<span style="color:var(--text-muted)">—</span>';
    return `<tr>
      <td><strong>${row.member.name}</strong></td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${row.member.regNo}</td>
      <td>${row.member.dept || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${row.week}</td>
      <td style="max-width:300px">${slotsHtml}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${row.notes}</td>
    </tr>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════════
   RENDER ALL
════════════════════════════════════════════════════════════════ */
function renderAll() {
  renderSummaryCards();
  populateFilters();
  renderMemberCards(S.members);
  renderMemberTable(S.members);
  renderEventsSection();
  renderAttendanceTable();
  renderDashboardCharts();
  renderRecentActivity();
  updateVenueEverywhere();
  updateLiveBanner();
  updateTaskOverview();
  renderSkillTeamTable();
}

function renderSummaryCards() {
  const m = S.members;
  document.getElementById('sc-total')  .textContent = m.length;
  document.getElementById('sc-depts')  .textContent = new Set(m.map(x => x.dept)).size;
  document.getElementById('sc-events') .textContent = m.reduce((a, x) => a + (x.eventsAttended || 0), 0);
  document.getElementById('sc-won')    .textContent = m.reduce((a, x) => a + (x.eventsWon || 0), 0);
  document.getElementById('sc-arrears').textContent = m.filter(x => (x.arrears || 0) > 0).length;
  // Only average members who have a real CGPA (exclude null)
  const withCgpa = m.filter(x => x.cgpa !== null && x.cgpa !== undefined);
  document.getElementById('sc-cgpa').textContent = withCgpa.length
    ? (withCgpa.reduce((a, x) => a + x.cgpa, 0) / withCgpa.length).toFixed(2) : '--';
}

function populateFilters() {
  const ds = [...new Set(S.members.map(m => m.dept).filter(Boolean))].sort();
  const rs = [...new Set(S.members.map(m => m.role).filter(Boolean))].sort();
  document.getElementById('filterDept').innerHTML = '<option value="">All Departments</option>' + ds.map(d => `<option value="${d}">${d}</option>`).join('');
  document.getElementById('filterRole').innerHTML = '<option value="">All Roles</option>' + rs.map(r => `<option value="${r}">${r}</option>`).join('');
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const d = document.getElementById('filterDept').value;
  const r = document.getElementById('filterRole').value;
  const sort = document.getElementById('sortBy').value;
  let res = S.members.filter(m => {
    const mq = !q || m.name.toLowerCase().includes(q) || m.regNo.toLowerCase().includes(q) || (m.dept || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q);
    return mq && (!d || m.dept === d) && (!r || m.role === r);
  });
  if (sort) res.sort((a, b) => {
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    // For CGPA sort: null (N/A) always goes last
    if (sort === 'cgpa') {
      const ac = a.cgpa ?? -1, bc = b.cgpa ?? -1;
      return bc - ac;
    }
    const map = { rewardPts: [b.ps?.rewardPts || 0, a.ps?.rewardPts || 0], activityPts: [b.ps?.activityPts || 0, a.ps?.activityPts || 0], eventsAttended: [b.eventsAttended || 0, a.eventsAttended || 0] };
    return (map[sort] || [0, 0])[0] - (map[sort] || [0, 0])[1];
  });
  S.filteredMembers = res;
  document.getElementById('filterCount').textContent = `Showing ${res.length} of ${S.members.length} members`;
  renderMemberCards(res); renderMemberTable(res);
}

function clearFilters() {
  ['searchInput', 'filterDept', 'filterRole', 'sortBy'].forEach(id => { document.getElementById(id).value = ''; });
  applyFilters();
}

function badgeClass(role = '') {
  const r = role.toLowerCase().replace(/-/g, ' ');
  if (r === 'captain')   return 'badge-captain';
  if (r.includes('vice')) return 'badge-vice-captain';
  if (r.includes('strateg')) return 'badge-strategist';
  if (r.includes('manager')) return 'badge-manager';
  if (r.includes('mentor'))  return 'badge-mentor';
  return 'badge-member';
}

function renderMemberCards(members) {
  const grid = document.getElementById('membersGrid');
  if (!members.length) { grid.innerHTML = '<p class="empty-state">No members match.</p>'; return; }
  grid.innerHTML = members.map(m => {
    const ini  = (m.name || '--').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const sk   = m.skills || {};
    const tags = [sk.primary1, sk.primary2].filter(s => s && s !== 'N/A').map(s => `<span class="skill-tag">${s}</span>`).join('');
    const task = getTask(m.regNo);
    const tb   = S.mode === 'captain' && task.title ? `<span class="skill-tag" style="color:var(--gold);border-color:rgba(255,215,0,.3)">${task.status.toUpperCase()}</span>` : '';
    const cgpaDisplay = m.cgpa !== null && m.cgpa !== undefined ? m.cgpa : 'N/A';
    return `<div class="member-card" onclick="openMemberModal('${m.regNo}')">
      <div class="mc-top"><div class="mc-avatar">${ini}</div><div><div class="mc-name">${m.name || 'Unknown'}</div><div class="mc-reg">${m.regNo}</div></div></div>
      <div class="mc-details">
        <div class="mc-detail"><span class="mc-detail-label">DEPT</span><span class="mc-detail-val">${m.dept || 'N/A'}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">CGPA</span><span class="mc-detail-val">${cgpaDisplay}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">REWARD PTS</span><span class="mc-detail-val">${m.ps?.rewardPts || 0}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">EVENTS WON</span><span class="mc-detail-val">${m.eventsWon || 0}</span></div>
      </div>
      <div class="mc-footer"><span class="role-badge ${badgeClass(m.role)}">${m.role || 'Member'}</span>${tags}${tb}</div>
    </div>`;
  }).join('');
}

function renderMemberTable(members) {
  document.getElementById('tableHead').innerHTML = '<tr><th>#</th><th>NAME</th><th>REG NO</th><th>DEPT</th><th>ROLE</th><th>CGPA</th><th>ARREARS</th><th>REWARD PTS</th></tr>';
  document.getElementById('tableBody').innerHTML = members.length
    ? members.map((m, i) => {
        const cgpa = m.cgpa !== null && m.cgpa !== undefined ? m.cgpa : 'N/A';
        return `<tr onclick="openMemberModal('${m.regNo}')">
          <td>${i + 1}</td><td><strong>${m.name || 'N/A'}</strong></td>
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${m.regNo}</td>
          <td>${m.dept || 'N/A'}</td>
          <td><span class="role-badge ${badgeClass(m.role)}" style="font-size:9px">${m.role || 'Member'}</span></td>
          <td style="color:${cgpa !== 'N/A' ? 'var(--green)' : 'var(--text-muted)'}">${cgpa}</td>
          <td style="color:${(m.arrears || 0) > 0 ? 'var(--red)' : 'var(--text-secondary)'}">${m.arrears || 0}</td>
          <td style="color:var(--gold)">${m.ps?.rewardPts || 0}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="8" class="empty-td">No members found.</td></tr>';
}

function setView(mode) {
  document.getElementById('membersGrid') .classList.toggle('hidden', mode !== 'card');
  document.getElementById('membersTable').classList.toggle('hidden', mode !== 'table');
  document.getElementById('viewCard')    .classList.toggle('active', mode === 'card');
  document.getElementById('viewTable')   .classList.toggle('active', mode === 'table');
}

function renderEventsSection() {
  const grid = document.getElementById('eventsGrid');
  grid.innerHTML = S.events.length
    ? S.events.map(ev => `<div class="event-card"><div class="event-name">${ev.name}</div><div class="event-meta">📅 ${ev.monthYear || 'N/A'} &nbsp;|&nbsp; 🏛 ${ev.host || 'N/A'}</div><span class="event-type">${ev.type || 'General'}</span></div>`).join('')
    : '<p class="empty-state">No events data in sheet.</p>';
}

function renderAttendanceTable() {
  const body = document.getElementById('attendanceBody');
  body.innerHTML = S.attendance.length
    ? S.attendance.map(a => `<tr><td>${a.date}</td><td style="font-family:var(--font-mono);color:var(--cyan)">${a.regNo}</td><td>${a.name}</td><td style="font-size:11px">${a.mail}</td><td style="color:var(--red)">${a.missedHour}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty-td">No attendance data.</td></tr>';
}

function renderRecentActivity() {
  const m = S.members;
  const withCgpa = m.filter(x => x.cgpa !== null && x.cgpa !== undefined);
  const avgCgpa  = withCgpa.length
    ? (withCgpa.reduce((a, x) => a + x.cgpa, 0) / withCgpa.length).toFixed(2)
    : 'N/A';
  const skillCount = new Set(
    Object.values(S.skillLogs).map(l => l.regNo).filter(Boolean)
  ).size;
  document.getElementById('recentList').innerHTML = [
    `${m.length} members loaded from Google Sheets`,
    `${S.events.length} events in the log`,
    `${m.filter(x => (x.ps?.mandatoryCompletion || '') === 'Yes').length} members completed Mandatory PS`,
    `Average CGPA: ${avgCgpa} (${withCgpa.length} of ${m.length} members have CGPA data)`,
    `${skillCount} members have submitted skill progress this term`,
    `${Object.keys(S.captainData.tasks).length} tasks assigned · ${Object.values(S.captainData.tasks).filter(t => t.status === 'completed').length} completed`,
  ].map(it => `<div class="recent-item"><div class="recent-dot"></div>${it}</div>`).join('');
}

/* ════════════════════════════════════════════════════════════════
   MEMBER MODAL
════════════════════════════════════════════════════════════════ */
function openMemberModal(regNo, defaultTab = 'profile') {
  const m = S.members.find(x => x.regNo === regNo); if (!m) return;
  S.currentMember = m;
  const ini = (m.name || '--').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('mmAvatar').textContent = ini;
  document.getElementById('mmName').textContent   = m.name || '—';
  document.getElementById('mmReg').textContent    = `REG: ${m.regNo}`;
  const rb = document.getElementById('mmRoleBadge');
  rb.textContent = m.role || 'Member'; rb.className = `role-badge ${badgeClass(m.role)}`;
  document.querySelectorAll('.mm-tab[data-tab="task"]').forEach(t => t.classList.toggle('hidden', S.mode !== 'captain'));
  renderModalProfile(m); renderModalSkills(m); renderModalPS(m); renderModalEvents(m);
  if (S.mode === 'captain') renderModalTask(m);
  switchModalTab(defaultTab);
  document.getElementById('memberModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('memberModal').classList.add('hidden'); S.currentMember = null; }
function switchModalTab(tab) {
  document.querySelectorAll('.mm-tab')  .forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.mm-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

const II = (l, v) => `<div class="info-item"><div class="info-label">${l}</div><div class="info-val">${v || 'N/A'}</div></div>`;

function renderModalProfile(m) {
  const task = getTask(m.regNo);
  const taskHtml = task.title
    ? `<span class="priority-${task.priority}">${task.title}</span> <span class="status-${task.status}">[${task.status.toUpperCase()}]</span>${task.dueDate ? ` <span style="font-size:10px;color:var(--text-muted)">Due: ${task.dueDate}</span>` : ''}`
    : '<span style="color:var(--text-muted)">No task assigned</span>';
  document.getElementById('profileInfo').innerHTML = [
    II('DEPARTMENT',      m.dept),
    II('MOBILE',          m.mobile),
    II('EMAIL',           m.mail),
    II('CGPA',            m.cgpa || 'N/A'),
    II('ARREARS',         m.arrears || 0),
    II('SPECIAL LAB',     m.specialLab),
    II('SSG MEMBER',      m.ssg),
    II('EVENTS ATTENDED', m.eventsAttended || 0),
    II('EVENTS WON',      m.eventsWon || 0),
    II('FOREIGN LANG',    m.foreignLang),
    II('MODE OF STUDY',   m.modeOfStudy),
    II('CURRENT EVENTS',  m.currentEvents || 'None'),
    II('VENUE',           S.captainData.venue || 'Not Set'),
    `<div class="info-item" style="grid-column:1/-1"><div class="info-label">ASSIGNED TASK</div><div class="info-val">${taskHtml}</div></div>`,
  ].join('');
}

function renderModalSkills(m) {
  const s = m.skills || {};
  const chip = (v, cls) => v && v !== 'N/A' ? `<span class="skill-chip ${cls}">${v}</span>` : '';
  document.getElementById('skillsDisplay').innerHTML = `
    <div class="skill-label">PRIMARY</div>${chip(s.primary1, 'skill-primary')}${chip(s.primary2, 'skill-primary')}
    <div class="skill-label">SECONDARY</div>${chip(s.secondary1, 'skill-secondary')}${chip(s.secondary2, 'skill-secondary')}
    <div class="skill-label">SPECIALIZATION</div>${chip(s.spec1, 'skill-spec')}${chip(s.spec2, 'skill-spec')}`;
}

function renderModalPS(m) {
  const ps = m.ps || {};
  const pct = ps.weeklyAttempts ? Math.round(ps.weeklyCleared / ps.weeklyAttempts * 100) : 0;
  document.getElementById('psDisplay').innerHTML = `
    <div class="info-grid">${II('REWARD PTS', ps.rewardPts || 0)}${II('ACTIVITY PTS', ps.activityPts || 0)}${II('MANDATORY', ps.mandatoryCompletion || 'N/A')}${II('ATTEMPTS', ps.weeklyAttempts || 0)}${II('CLEARED', ps.weeklyCleared || 0)}</div>
    <div class="skill-label">COMPLETION</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
      <div class="ps-progress" style="flex:1"><div class="ps-bar" style="width:${pct}%"></div></div>
      <span style="font-family:var(--font-mono);color:var(--cyan)">${pct}%</span>
    </div>`;
}

function renderModalEvents(m) {
  const att  = (m.currentEvents || '').split(',').map(s => s.trim()).filter(Boolean);
  const miss = S.attendance.filter(a => a.regNo === m.regNo);
  let h = att.length ? `<div class="skill-label">REGISTERED</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${att.map(e => `<span class="event-type">${e}</span>`).join('')}</div>` : '';
  h += `<div class="skill-label">STATS</div><div class="info-grid">${II('ATTENDED', m.eventsAttended || 0)}${II('WON', m.eventsWon || 0)}</div>`;
  if (miss.length) h += `<div class="skill-label">MISSED SESSIONS</div><div class="table-wrap"><table class="data-table"><thead><tr><th>DATE</th><th>HRS</th></tr></thead><tbody>${miss.map(a => `<tr><td>${a.date}</td><td style="color:var(--red)">${a.missedHour}</td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('eventsDisplay').innerHTML = h || '<p class="empty-state">No event data.</p>';
}

function renderModalTask(m) {
  const t = getTask(m.regNo);
  document.getElementById('mmTaskTitle').value = t.title || '';
  document.getElementById('mmPriority') .value = t.priority || 'medium';
  document.getElementById('mmDueDate')  .value = t.dueDate || '';
  document.getElementById('mmStatus')   .value = t.status || 'pending';
  document.getElementById('mmRemarks')  .value = t.remarks || '';
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
  const ok = await saveCaptainData();
  if (ok) showToast(`Task saved for ${m.name}`, 'success');
}

/* ════════════════════════════════════════════════════════════════
   CHARTS
════════════════════════════════════════════════════════════════ */
const NC = ['#00d4ff','#7c3aed','#00ff88','#ffd700','#ff3366','#4488ff','#ff8c00','#00ffcc'];
const dChart = k => { if (S.charts[k]) { S.charts[k].destroy(); delete S.charts[k]; } };
const CD = { plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}, scales:{x:{ticks:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}},grid:{color:'rgba(0,212,255,.05)'}},y:{ticks:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}},grid:{color:'rgba(0,212,255,.05)'}}} };

function renderDashboardCharts() {
  const m = S.members;

  // Dept doughnut
  const dc = {}; m.forEach(x => { dc[x.dept||'N/A'] = (dc[x.dept||'N/A']||0)+1; });
  dChart('dept'); const dC = document.getElementById('deptChart');
  if (dC) S.charts.dept = new Chart(dC, {type:'doughnut',data:{labels:Object.keys(dc),datasets:[{data:Object.values(dc),backgroundColor:NC.map(c=>c+'99'),borderColor:NC,borderWidth:1}]},options:{plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}},cutout:'60%'}});

  // Role pie
  const rc = {}; m.forEach(x => { rc[x.role||'Member'] = (rc[x.role||'Member']||0)+1; });
  dChart('role'); const rC = document.getElementById('roleChart');
  if (rC) S.charts.role = new Chart(rC, {type:'pie',data:{labels:Object.keys(rc),datasets:[{data:Object.values(rc),backgroundColor:NC.map(c=>c+'88'),borderColor:NC,borderWidth:1}]},options:{plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});

  // Fix 1: Top CGPA bar — only include members WITH a real CGPA (not null)
  const top = [...m]
    .filter(x => x.cgpa !== null && x.cgpa !== undefined)
    .sort((a, b) => b.cgpa - a.cgpa)
    .slice(0, 8);
  dChart('cgpa'); const cC = document.getElementById('cgpaChart');
  if (cC) S.charts.cgpa = new Chart(cC, {
    type: 'bar',
    data: {
      labels  : top.map(x => x.name.split(' ')[0]),
      datasets: [{ label:'CGPA', data:top.map(x=>x.cgpa), backgroundColor:NC[0]+'66', borderColor:NC[0], borderWidth:1 }],
    },
    options: { ...CD, plugins:{legend:{display:false}}, scales:{...CD.scales,y:{...CD.scales.y,min:0,max:10}} },
  });
}

function renderAnalyticsCharts() {
  const m=S.members;
  const sc={};m.forEach(x=>{const s=x.skills||{};[s.primary1,s.primary2,s.secondary1,s.secondary2].forEach(k=>{if(k&&k!=='N/A')sc[k]=(sc[k]||0)+1;});});
  const t10=Object.entries(sc).sort((a,b)=>b[1]-a[1]).slice(0,10);
  dChart('skill'); const skC=document.getElementById('skillChart');
  if(skC)S.charts.skill=new Chart(skC,{type:'bar',data:{labels:t10.map(x=>x[0]),datasets:[{data:t10.map(x=>x[1]),backgroundColor:NC[2]+'66',borderColor:NC[2],borderWidth:1}]},options:{...CD,indexAxis:'y',plugins:{legend:{display:false}}}});
  const psY=m.filter(x=>(x.ps?.mandatoryCompletion||'')==='Yes').length;
  dChart('ps'); const psC=document.getElementById('psChart');
  if(psC)S.charts.ps=new Chart(psC,{type:'doughnut',data:{labels:['Completed','Pending'],datasets:[{data:[psY,m.length-psY],backgroundColor:[NC[2]+'99',NC[4]+'99'],borderColor:[NC[2],NC[4]],borderWidth:1}]},options:{cutout:'65%',plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});
  const at=Object.values(S.captainData.tasks||{});const tc={c:at.filter(t=>t.status==='completed').length,i:at.filter(t=>t.status==='in-progress').length,p:at.filter(t=>t.status==='pending').length,u:m.length-at.length};
  dChart('task'); const tC=document.getElementById('taskChart');
  if(tC)S.charts.task=new Chart(tC,{type:'doughnut',data:{labels:['Completed','In Progress','Pending','Unassigned'],datasets:[{data:[tc.c,tc.i,tc.p,tc.u],backgroundColor:[NC[2]+'99',NC[0]+'99',NC[3]+'99','#445566'],borderColor:[NC[2],NC[0],NC[3],'#667799'],borderWidth:1}]},options:{cutout:'65%',plugins:{legend:{labels:{color:'#8aa8cc',font:{family:'Share Tech Mono',size:10}}}}}});
  const em={};S.events.forEach(ev=>{em[ev.monthYear||'N/A']=(em[ev.monthYear||'N/A']||0)+1;});
  dChart('eTrend'); const etC=document.getElementById('eventTrendChart');
  if(etC)S.charts.eTrend=new Chart(etC,{type:'line',data:{labels:Object.keys(em),datasets:[{data:Object.values(em),borderColor:NC[1],backgroundColor:NC[1]+'22',tension:.4,fill:true,pointBackgroundColor:NC[1]}]},options:{...CD,plugins:{legend:{display:false}}}});
  dChart('pts'); const ptC=document.getElementById('pointsChart');
  if(ptC)S.charts.pts=new Chart(ptC,{type:'scatter',data:{datasets:[{data:m.map(x=>({x:x.ps?.activityPts||0,y:x.ps?.rewardPts||0,label:x.name})),backgroundColor:NC[0]+'99',borderColor:NC[0],pointRadius:6}]},options:{...CD,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw.label}: Act ${c.raw.x}, Rew ${c.raw.y}`}}}}});
}

/* ════════════════════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const cont = document.getElementById('toastContainer'), el = document.createElement('div');
  const ic = {success:'✓',error:'✕',warning:'⚠',info:'◉'}, cl = {success:'var(--green)',error:'var(--red)',warning:'var(--gold)',info:'var(--cyan)'};
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="color:${cl[type]}">${ic[type]}</span>${msg}`;
  cont.appendChild(el); setTimeout(() => el.remove(), 3400);
}
