/* ══════════════════════════════════════════════
   NEXUS TEAM DASHBOARD — SCRIPT.JS
   All logic: data, render, charts, captain controls
══════════════════════════════════════════════ */

// ═══════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════
const State = {
  mode: 'member',            // 'member' | 'captain'
  members: [],               // unified member objects
  events: [],                // event list
  attendance: [],            // missed attendance records
  filteredMembers: [],       // after search/filter
  captainData: {},           // taskData + venue from localStorage
  activeSection: 'dashboard',
  currentViewMember: null,
  taskFilter: 'all',
  charts: {},
};

const CAPTAIN_PIN = '1234';
const LS_KEY = 'nexus_captain_data';

// ═══════════════════════════════════════════
// SAMPLE DUMMY DATA (fallback if no Excel)
// ═══════════════════════════════════════════
const DUMMY_DETAILS = [
  { sno:1, name:'Arjun Sharma',     regNo:'21CS001', dept:'CSE', role:'Captain',      mobile:'9876543210', mail:'arjun@college.edu',    cgpa:9.2, arrears:0, specialLab:'AI Lab',      ssg:'Yes', eventsAttended:12, eventsWon:5, foreignLang:'German',   modeOfStudy:'Regular', currentEvents:'HackFest 2025' },
  { sno:2, name:'Divya Nair',       regNo:'21CS002', dept:'CSE', role:'Vice Captain',  mobile:'9876543211', mail:'divya@college.edu',    cgpa:8.9, arrears:0, specialLab:'ML Lab',      ssg:'Yes', eventsAttended:10, eventsWon:3, foreignLang:'French',   modeOfStudy:'Regular', currentEvents:'CodeSprint' },
  { sno:3, name:'Karthik Rajan',    regNo:'21IT003', dept:'IT',  role:'Strategist',    mobile:'9876543212', mail:'karthik@college.edu',  cgpa:8.5, arrears:1, specialLab:'IoT Lab',     ssg:'No',  eventsAttended:8,  eventsWon:2, foreignLang:'Japanese', modeOfStudy:'Regular', currentEvents:'RoboWars' },
  { sno:4, name:'Priya Menon',      regNo:'21EC004', dept:'ECE', role:'Member',        mobile:'9876543213', mail:'priya@college.edu',    cgpa:7.8, arrears:0, specialLab:'VLSI Lab',    ssg:'Yes', eventsAttended:6,  eventsWon:1, foreignLang:'German',   modeOfStudy:'Regular', currentEvents:'' },
  { sno:5, name:'Rohit Verma',      regNo:'21ME005', dept:'MECH',role:'Member',        mobile:'9876543214', mail:'rohit@college.edu',    cgpa:7.2, arrears:2, specialLab:'CAD Lab',     ssg:'No',  eventsAttended:4,  eventsWon:0, foreignLang:'French',   modeOfStudy:'Regular', currentEvents:'CAD Expo' },
  { sno:6, name:'Sneha Krishnan',   regNo:'21CS006', dept:'CSE', role:'Mentor',        mobile:'9876543215', mail:'sneha@college.edu',    cgpa:9.5, arrears:0, specialLab:'Cloud Lab',   ssg:'Yes', eventsAttended:15, eventsWon:7, foreignLang:'German',   modeOfStudy:'Regular', currentEvents:'HackFest 2025' },
  { sno:7, name:'Arun Babu',        regNo:'21IT007', dept:'IT',  role:'Member',        mobile:'9876543216', mail:'arun@college.edu',     cgpa:8.1, arrears:0, specialLab:'Cyber Lab',   ssg:'No',  eventsAttended:7,  eventsWon:2, foreignLang:'Japanese', modeOfStudy:'Regular', currentEvents:'' },
  { sno:8, name:'Meera Pillai',     regNo:'21EC008', dept:'ECE', role:'Member',        mobile:'9876543217', mail:'meera@college.edu',    cgpa:8.3, arrears:1, specialLab:'Embedded Lab',ssg:'Yes', eventsAttended:9,  eventsWon:3, foreignLang:'French',   modeOfStudy:'Regular', currentEvents:'Circuit Quest' },
  { sno:9, name:'Vikram Singh',     regNo:'21CS009', dept:'CSE', role:'Member',        mobile:'9876543218', mail:'vikram@college.edu',   cgpa:7.6, arrears:0, specialLab:'VR Lab',      ssg:'No',  eventsAttended:5,  eventsWon:1, foreignLang:'German',   modeOfStudy:'Regular', currentEvents:'' },
  { sno:10,name:'Ananya Das',       regNo:'21ME010', dept:'MECH',role:'Member',        mobile:'9876543219', mail:'ananya@college.edu',   cgpa:8.0, arrears:0, specialLab:'CAD Lab',     ssg:'Yes', eventsAttended:6,  eventsWon:2, foreignLang:'Japanese', modeOfStudy:'Regular', currentEvents:'' },
  { sno:11,name:'Manoj Kumar',      regNo:'21IT011', dept:'IT',  role:'Member',        mobile:'9876543220', mail:'manoj@college.edu',    cgpa:7.4, arrears:3, specialLab:'Network Lab', ssg:'No',  eventsAttended:3,  eventsWon:0, foreignLang:'French',   modeOfStudy:'Regular', currentEvents:'NetSec Challenge' },
  { sno:12,name:'Lakshmi Suresh',   regNo:'21CS012', dept:'CSE', role:'Member',        mobile:'9876543221', mail:'lakshmi@college.edu',  cgpa:9.1, arrears:0, specialLab:'AI Lab',      ssg:'Yes', eventsAttended:11, eventsWon:4, foreignLang:'German',   modeOfStudy:'Regular', currentEvents:'AI Hackathon' },
];

const DUMMY_SKILLS = [
  { regNo:'21CS001', primary1:'Python',   primary2:'Machine Learning', secondary1:'React',    secondary2:'Node.js',   spec1:'Deep Learning',  spec2:'NLP' },
  { regNo:'21CS002', primary1:'Java',     primary2:'Data Structures',  secondary1:'Spring',   secondary2:'MySQL',     spec1:'Microservices',  spec2:'Kubernetes' },
  { regNo:'21IT003', primary1:'C++',      primary2:'Embedded Systems', secondary1:'Python',   secondary2:'Arduino',   spec1:'IoT Security',   spec2:'MQTT' },
  { regNo:'21EC004', primary1:'VHDL',     primary2:'Circuit Design',   secondary1:'Python',   secondary2:'MATLAB',    spec1:'FPGA',           spec2:'Signal Processing' },
  { regNo:'21ME005', primary1:'AutoCAD',  primary2:'SolidWorks',       secondary1:'Python',   secondary2:'MATLAB',    spec1:'FEA',            spec2:'CFD' },
  { regNo:'21CS006', primary1:'Python',   primary2:'Cloud Computing',  secondary1:'Docker',   secondary2:'Terraform', spec1:'AWS Solutions',  spec2:'DevSecOps' },
  { regNo:'21IT007', primary1:'Cybersecurity','primary2':'Penetration Testing',secondary1:'Python',secondary2:'Bash',spec1:'Forensics', spec2:'Malware Analysis' },
  { regNo:'21EC008', primary1:'Embedded C',primary2:'PCB Design',      secondary1:'Python',   secondary2:'MATLAB',    spec1:'ARM Cortex',     spec2:'RTOS' },
  { regNo:'21CS009', primary1:'Unity3D',  primary2:'C#',               secondary1:'Blender',  secondary2:'WebGL',     spec1:'VR Development', spec2:'AR' },
  { regNo:'21ME010', primary1:'CATIA',    primary2:'ANSYS',            secondary1:'Python',   secondary2:'MATLAB',    spec1:'Topology Opt.',  spec2:'Additive Mfg' },
  { regNo:'21IT011', primary1:'Cisco CCNA','primary2':'Network Admin', secondary1:'Python',   secondary2:'Linux',     spec1:'SDN',            spec2:'NFV' },
  { regNo:'21CS012', primary1:'Python',   primary2:'NLP',              secondary1:'TensorFlow',secondary2:'PyTorch',  spec1:'Transformers',   spec2:'LLMs' },
];

const DUMMY_PS = [
  { regNo:'21CS001', rewardPts:320, activityPts:180, mandatoryCompletion:'Yes', weeklyAttempts:48, weeklyCleared:46 },
  { regNo:'21CS002', rewardPts:290, activityPts:160, mandatoryCompletion:'Yes', weeklyAttempts:44, weeklyCleared:40 },
  { regNo:'21IT003', rewardPts:220, activityPts:130, mandatoryCompletion:'Yes', weeklyAttempts:40, weeklyCleared:35 },
  { regNo:'21EC004', rewardPts:180, activityPts:110, mandatoryCompletion:'No',  weeklyAttempts:36, weeklyCleared:28 },
  { regNo:'21ME005', rewardPts:140, activityPts:80,  mandatoryCompletion:'No',  weeklyAttempts:30, weeklyCleared:20 },
  { regNo:'21CS006', rewardPts:410, activityPts:220, mandatoryCompletion:'Yes', weeklyAttempts:52, weeklyCleared:52 },
  { regNo:'21IT007', rewardPts:240, activityPts:140, mandatoryCompletion:'Yes', weeklyAttempts:42, weeklyCleared:38 },
  { regNo:'21EC008', rewardPts:260, activityPts:150, mandatoryCompletion:'Yes', weeklyAttempts:46, weeklyCleared:42 },
  { regNo:'21CS009', rewardPts:170, activityPts:90,  mandatoryCompletion:'No',  weeklyAttempts:32, weeklyCleared:22 },
  { regNo:'21ME010', rewardPts:190, activityPts:100, mandatoryCompletion:'Yes', weeklyAttempts:38, weeklyCleared:30 },
  { regNo:'21IT011', rewardPts:120, activityPts:60,  mandatoryCompletion:'No',  weeklyAttempts:28, weeklyCleared:16 },
  { regNo:'21CS012', rewardPts:380, activityPts:200, mandatoryCompletion:'Yes', weeklyAttempts:50, weeklyCleared:48 },
];

const DUMMY_EVENTS = [
  { name:'HackFest 2025',       monthYear:'Mar-2025', host:'SRM Institute', type:'Hackathon' },
  { name:'CodeSprint',          monthYear:'Feb-2025', host:'VIT Vellore',   type:'Competitive Coding' },
  { name:'RoboWars',            monthYear:'Jan-2025', host:'Anna University',type:'Robotics' },
  { name:'Circuit Quest',       monthYear:'Feb-2025', host:'PSG College',   type:'ECE' },
  { name:'AI Hackathon',        monthYear:'Mar-2025', host:'IIT Madras',    type:'AI/ML' },
  { name:'NetSec Challenge',    monthYear:'Jan-2025', host:'NIT Trichy',    type:'Cybersecurity' },
  { name:'CAD Expo',            monthYear:'Feb-2025', host:'CEG Chennai',   type:'Design' },
];

const DUMMY_ATTENDANCE = [
  { date:'2025-03-10', regNo:'21ME005', name:'Rohit Verma',    mail:'rohit@college.edu',   missedHour:2 },
  { date:'2025-03-11', regNo:'21IT011', name:'Manoj Kumar',    mail:'manoj@college.edu',   missedHour:3 },
  { date:'2025-03-12', regNo:'21EC004', name:'Priya Menon',    mail:'priya@college.edu',   missedHour:1 },
  { date:'2025-03-13', regNo:'21CS009', name:'Vikram Singh',   mail:'vikram@college.edu',  missedHour:2 },
  { date:'2025-03-14', regNo:'21ME005', name:'Rohit Verma',    mail:'rohit@college.edu',   missedHour:4 },
];

// ═══════════════════════════════════════════
// GOOGLE AUTH CONFIG
// ═══════════════════════════════════════════
// ⚠️  REPLACE with your actual Google OAuth Client ID from
//     https://console.cloud.google.com/  (APIs & Services → Credentials)
// For local file:// testing, add http://localhost as an Authorized Origin,
// or use a local server (e.g. VS Code Live Server / python -m http.server)
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

// Captain role emails — add the captain's real Google email here
const CAPTAIN_EMAILS = [
  'arjun@college.edu',     // maps to dummy data captain
  // add more if needed
];

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    updateLoader('NEXUS ONLINE — READY');
    setTimeout(() => {
      hideLoader();
      initGoogleSignIn();
      showLoginScreen();
    }, 800);
  }, 1600);

  loadCaptainData();
  setupEventListeners();
});

function updateLoader(text) {
  const el = document.getElementById('loaderSub');
  if (el) el.textContent = text;
}

function hideLoader() {
  const loader = document.getElementById('loader');
  loader.style.opacity = '0';
  setTimeout(() => loader.classList.add('hidden'), 500);
}

function showLoginScreen() {
  document.getElementById('roleScreen').classList.remove('hidden');
}

// ═══════════════════════════════════════════
// GOOGLE IDENTITY SERVICES
// ═══════════════════════════════════════════
function initGoogleSignIn() {
  // Wait for GSI script to load, then render the button
  const tryInit = () => {
    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      // Render official Google button
      google.accounts.id.renderButton(
        document.getElementById('googleSignInBtn'),
        {
          theme: 'filled_black',   // dark theme button
          size: 'large',
          width: 320,
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
        }
      );
    } else {
      // GSI not loaded yet — retry
      setTimeout(tryInit, 300);
    }
  };
  tryInit();
}

// Called by Google after user picks account
function handleGoogleCredential(response) {
  try {
    // Decode the JWT credential (no signature verify needed on frontend)
    const payload = parseJwt(response.credential);
    const email = payload.email || '';
    const name = payload.name || email.split('@')[0];
    const picture = payload.picture || '';

    loginWithEmail(email, name, picture);
  } catch (err) {
    console.error('Google login error:', err);
    showLoginError('Google authentication failed. Please try again.');
  }
}

// Parse JWT payload (base64 decode — no verification needed for display purposes)
function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
  return JSON.parse(jsonPayload);
}

// Core login function — works for Google & demo logins
function loginWithEmail(email, name, picture = '') {
  // First load data so we can match against roster
  mergeAndSetMembers(DUMMY_DETAILS, DUMMY_SKILLS, DUMMY_PS);
  State.events = DUMMY_EVENTS;
  State.attendance = DUMMY_ATTENDANCE;

  // Match email to roster
  const emailLower = email.toLowerCase();
  const rosterMatch = State.members.find(m => (m.mail || '').toLowerCase() === emailLower);

  // Determine mode: captain if email is in CAPTAIN_EMAILS OR roster role is Captain
  const isCaptainEmail = CAPTAIN_EMAILS.map(e => e.toLowerCase()).includes(emailLower);
  const rosterRole = rosterMatch ? (rosterMatch.role || '').toLowerCase() : '';
  const isCaptainRole = rosterRole.includes('captain') && !rosterRole.includes('vice');
  const isCaptain = isCaptainEmail || isCaptainRole;

  // Set logged-in user state
  State.loggedInUser = {
    email,
    name: rosterMatch ? rosterMatch.name : name,
    picture,
    regNo: rosterMatch ? rosterMatch.regNo : null,
    role: rosterMatch ? rosterMatch.role : (isCaptain ? 'Captain' : 'Guest'),
    inRoster: !!rosterMatch,
  };

  State.mode = isCaptain ? 'captain' : 'member';

  // Enter app
  document.getElementById('roleScreen').classList.add('hidden');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  applyModeUI();
  renderUserProfile();

  State.filteredMembers = [...State.members];
  renderAll();
  updateVenueControlVisibility();

  const greeting = isCaptain ? `Welcome, Captain ${State.loggedInUser.name.split(' ')[0]}!` : `Welcome, ${State.loggedInUser.name.split(' ')[0]}!`;
  showToast(greeting, isCaptain ? 'success' : 'info');

  if (!rosterMatch) {
    showToast('Note: Your email was not found in the team roster. Showing full dashboard.', 'warning');
  }
}

function showLoginError(msg) {
  const box = document.getElementById('loginError');
  document.getElementById('loginErrMsg').textContent = msg;
  box.classList.remove('hidden');
}

// ═══════════════════════════════════════════
// RENDER USER PROFILE IN UI
// ═══════════════════════════════════════════
function renderUserProfile() {
  const u = State.loggedInUser;
  if (!u) return;

  const initials = u.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // Sidebar
  document.getElementById('sbUserName').textContent = u.name;
  document.getElementById('sbUserEmail').textContent = u.email;
  const sbAv = document.getElementById('sbUserAvatar');
  if (u.picture) {
    sbAv.innerHTML = `<img src="${u.picture}" alt="${u.name}" onerror="this.parentElement.textContent='${initials}'">`;
  } else {
    sbAv.textContent = initials;
  }

  // Topbar
  document.getElementById('topbarUserName').textContent = u.name.split(' ')[0];
  document.getElementById('topbarUserRole').textContent = u.role || '—';
  const tbAv = document.getElementById('topbarAvatar');
  if (u.picture) {
    tbAv.innerHTML = `<img src="${u.picture}" alt="${u.name}" onerror="this.parentElement.textContent='${initials}'">`;
  } else {
    tbAv.textContent = initials;
  }
}

// ═══════════════════════════════════════════
// VENUE VISIBILITY — captain edits, member reads
// ═══════════════════════════════════════════
function updateVenueControlVisibility() {
  const isCap = State.mode === 'captain';
  const editForm = document.getElementById('venueEditForm');
  const readOnly = document.getElementById('venueReadOnly');
  if (editForm) editForm.classList.toggle('hidden', !isCap);
  if (readOnly) readOnly.classList.toggle('hidden', isCap);
  // Update read-only text
  const roText = document.getElementById('venueReadOnlyText');
  if (roText) roText.textContent = State.captainData.venue || 'Not Set';
}

// ═══════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════
function setupEventListeners() {
  // Demo login buttons
  document.getElementById('demoMemberBtn').addEventListener('click', () => {
    loginWithEmail('arjun@college.edu', 'Arjun Sharma', '');
    // Override to member for demo
    State.mode = 'member';
    State.loggedInUser.role = 'Member (Demo)';
    applyModeUI();
    renderUserProfile();
    updateVenueControlVisibility();
    showToast('Demo: Member mode activated', 'info');
  });
  document.getElementById('demoCaptainBtn').addEventListener('click', () => {
    loginWithEmail('arjun@college.edu', 'Arjun Sharma', '');
    showToast('Demo: Captain mode activated', 'success');
  });

  // Login retry
  document.getElementById('loginRetry').addEventListener('click', () => {
    document.getElementById('loginError').classList.add('hidden');
  });

  // PIN modal (kept as fallback if needed)
  document.getElementById('pinCancel').addEventListener('click', closePinModal);
  document.getElementById('pinSubmit').addEventListener('click', submitPin);
  setupPinInputs();

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', toggleSidebar);
  document.addEventListener('click', e => {
    const sb = document.getElementById('sidebar');
    const hb = document.getElementById('hamburger');
    if (sb.classList.contains('open') && !sb.contains(e.target) && !hb.contains(e.target)) {
      sb.classList.remove('open');
    }
  });

  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const sec = item.dataset.section;
      navigateTo(sec);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Sign Out
  document.getElementById('switchRole').addEventListener('click', signOut);

  // Excel Upload
  document.getElementById('excelUpload').addEventListener('change', handleExcelUpload);

  // Search/Filter/Sort
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('filterDept').addEventListener('change', applyFilters);
  document.getElementById('filterRole').addEventListener('change', applyFilters);
  document.getElementById('sortBy').addEventListener('change', applyFilters);
  document.getElementById('clearFilters').addEventListener('click', clearFilters);

  // View Toggle
  document.getElementById('viewCard').addEventListener('click', () => setView('card'));
  document.getElementById('viewTable').addEventListener('click', () => setView('table'));

  // Captain Panel
  document.getElementById('saveVenue').addEventListener('click', saveVenue);
  document.getElementById('assignBulkTask').addEventListener('click', assignBulkTask);
  document.getElementById('exportTasks').addEventListener('click', exportTasks);
  document.getElementById('resetTasks').addEventListener('click', resetTasks);
  document.getElementById('taskSearchInput').addEventListener('input', renderTaskTable);
  document.getElementById('taskStatusFilter').addEventListener('change', renderTaskTable);

  // Task Overview Filters
  document.querySelectorAll('.tob-item').forEach(item => {
    item.addEventListener('click', () => {
      State.taskFilter = item.dataset.filter;
      document.querySelectorAll('.tob-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderTaskTable();
    });
  });

  // Member Modal
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('memberModal').addEventListener('click', e => {
    if (e.target === document.getElementById('memberModal')) closeModal();
  });

  // Modal tabs
  document.querySelectorAll('.mm-tab').forEach(tab => {
    tab.addEventListener('click', () => switchModalTab(tab.dataset.tab));
  });

  // Save Task in Modal
  document.getElementById('saveTask').addEventListener('click', saveModalTask);
}

// ═══════════════════════════════════════════
// SIGN OUT
// ═══════════════════════════════════════════
function signOut() {
  // Sign out from Google if GSI is loaded
  if (typeof google !== 'undefined' && google.accounts) {
    google.accounts.id.disableAutoSelect();
    if (State.loggedInUser?.email) {
      google.accounts.id.revoke(State.loggedInUser.email, () => {});
    }
  }
  State.loggedInUser = null;
  State.mode = 'member';
  State.members = [];
  State.filteredMembers = [];

  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginError').classList.add('hidden');
  document.getElementById('roleScreen').classList.remove('hidden');
  showToast('Signed out successfully', 'info');
}

// ═══════════════════════════════════════════
// ROLE / AUTH HELPERS
// ═══════════════════════════════════════════
function applyModeUI() {
  const isCap = State.mode === 'captain';
  const tag = document.getElementById('sbModeTag');
  const badge = document.getElementById('modeBadge');
  tag.textContent = isCap ? '● CAPTAIN MODE' : '● MEMBER MODE';
  tag.style.color = isCap ? 'var(--gold)' : 'var(--green)';
  badge.textContent = isCap ? 'CAPTAIN' : 'MEMBER';
  badge.style.background = isCap ? 'rgba(255,215,0,0.1)' : 'var(--cyan-glow)';
  badge.style.color = isCap ? 'var(--gold)' : 'var(--cyan)';
  badge.style.borderColor = isCap ? 'rgba(255,215,0,0.3)' : 'var(--cyan-dim)';

  document.querySelectorAll('.captain-only').forEach(el => {
    el.classList.toggle('hidden', !isCap);
  });
}

function openPinModal() {
  document.getElementById('pinModal').classList.remove('hidden');
  document.querySelector('.pin-input[data-idx="0"]').focus();
  clearPinInputs();
}

function closePinModal() {
  document.getElementById('pinModal').classList.add('hidden');
  clearPinInputs();
  document.getElementById('pinError').classList.add('hidden');
}

function clearPinInputs() {
  document.querySelectorAll('.pin-input').forEach(i => i.value = '');
}

function setupPinInputs() {
  const inputs = document.querySelectorAll('.pin-input');
  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      if (input.value && idx < inputs.length - 1) inputs[idx + 1].focus();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
      if (e.key === 'Enter') submitPin();
    });
  });
}

function submitPin() {
  const pin = Array.from(document.querySelectorAll('.pin-input')).map(i => i.value).join('');
  if (pin === CAPTAIN_PIN) {
    closePinModal();
  } else {
    const err = document.getElementById('pinError');
    err.classList.remove('hidden');
    clearPinInputs();
    document.querySelector('.pin-input[data-idx="0"]').focus();
    setTimeout(() => err.classList.add('hidden'), 3000);
  }
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
function navigateTo(section) {
  State.activeSection = section;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById(`sec-${section}`);
  if (sec) sec.classList.add('active');
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

  const labels = { dashboard:'DASHBOARD', members:'MEMBERS', analytics:'ANALYTICS', events:'EVENTS', captain:'CAPTAIN PANEL', attendance:'ATTENDANCE' };
  document.getElementById('topbarSection').textContent = labels[section] || section.toUpperCase();

  if (section === 'analytics') renderAnalyticsCharts();
  if (section === 'captain') { renderTaskTable(); updateTaskOverview(); updateVenueControlVisibility(); }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ═══════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════
function loadDummyData() {
  mergeAndSetMembers(DUMMY_DETAILS, DUMMY_SKILLS, DUMMY_PS);
  State.events = DUMMY_EVENTS;
  State.attendance = DUMMY_ATTENDANCE;
  State.filteredMembers = [...State.members];
  renderAll();
  showToast('Sample data loaded — upload Excel to replace', 'info');
}

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  showToast('Parsing Excel file...', 'info');
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const details  = parseSheet(wb, 0, parseDetailRow);
      const skills   = parseSheet(wb, 1, parseSkillRow);
      const ps       = parseSheet(wb, 2, parsePSRow);
      const evts     = parseSheet(wb, 3, parseEventRow);
      const attend   = parseSheet(wb, 4, parseAttendRow);

      mergeAndSetMembers(details, skills, ps);
      State.events = evts.length ? evts : DUMMY_EVENTS;
      State.attendance = attend.length ? attend : DUMMY_ATTENDANCE;
      State.filteredMembers = [...State.members];
      renderAll();
      showToast(`Excel loaded! ${State.members.length} members found.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Error parsing Excel. Check console.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function parseSheet(wb, idx, rowFn) {
  const sheet = wb.Sheets[wb.SheetNames[idx]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.slice(0).map(rowFn).filter(Boolean);
}

function cell(row, ...keys) {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== '') return String(v).trim();
  }
  return 'N/A';
}

function parseDetailRow(r) {
  const regNo = cell(r, 'Reg. No.', 'Reg No', 'RegNo', 'reg_no');
  if (!regNo || regNo === 'N/A') return null;
  return {
    sno: cell(r, 'S. No', 'S.No', 'sno'),
    name: cell(r, 'Name', 'name'),
    regNo, dept: cell(r, 'Department', 'Dept', 'dept'),
    role: cell(r, 'Role', 'role'),
    mobile: cell(r, 'Mobile Number', 'Mobile', 'mobile'),
    mail: cell(r, 'Mail ID', 'Email', 'mail'),
    cgpa: parseFloat(cell(r, 'CGPA', 'cgpa')) || 0,
    arrears: parseInt(cell(r, 'Arrears Count', 'arrears')) || 0,
    specialLab: cell(r, 'Special Lab', 'specialLab'),
    ssg: cell(r, 'Member of SSG', 'SSG', 'ssg'),
    eventsAttended: parseInt(cell(r, 'Events Attended', 'eventsAttended')) || 0,
    eventsWon: parseInt(cell(r, 'Events Won', 'eventsWon')) || 0,
    foreignLang: cell(r, 'Foreign Language Selected', 'foreignLang'),
    modeOfStudy: cell(r, 'Mode of Study', 'modeOfStudy'),
    currentEvents: cell(r, 'Currently Registered Events', 'currentEvents'),
  };
}

function parseSkillRow(r) {
  const regNo = cell(r, 'Reg. No.', 'Reg No', 'RegNo');
  if (!regNo || regNo === 'N/A') return null;
  return {
    regNo,
    primary1: cell(r, 'Primary Skill 1', 'primary1'),
    primary2: cell(r, 'Primary Skill 2', 'primary2'),
    secondary1: cell(r, 'Secondary Skill 1', 'secondary1'),
    secondary2: cell(r, 'Secondary Skill 2', 'secondary2'),
    spec1: cell(r, 'Specialization Skill 1', 'spec1'),
    spec2: cell(r, 'Specialization Skill 2', 'spec2'),
  };
}

function parsePSRow(r) {
  const regNo = cell(r, 'Reg. No.', 'Reg No', 'RegNo');
  if (!regNo || regNo === 'N/A') return null;
  return {
    regNo,
    rewardPts: parseInt(cell(r, 'Reward Points', 'rewardPts')) || 0,
    activityPts: parseInt(cell(r, 'Activity Points', 'activityPts')) || 0,
    mandatoryCompletion: cell(r, 'Mandatory PS Completion', 'mandatoryCompletion'),
    weeklyAttempts: parseInt(cell(r, 'Weekly Attempts', 'weeklyAttempts')) || 0,
    weeklyCleared: parseInt(cell(r, 'Weekly Cleared', 'weeklyCleared')) || 0,
  };
}

function parseEventRow(r) {
  return {
    name: cell(r, 'Event Name', 'name'),
    monthYear: cell(r, 'Month-Year', 'monthYear'),
    host: cell(r, 'Host', 'host'),
    type: cell(r, 'Type', 'type'),
  };
}

function parseAttendRow(r) {
  return {
    date: cell(r, 'Date', 'date'),
    regNo: cell(r, 'Register Number', 'Reg No', 'regNo'),
    name: cell(r, 'Name', 'name'),
    mail: cell(r, 'Mail ID', 'Email', 'mail'),
    missedHour: parseInt(cell(r, 'Missed Hour', 'missedHour')) || 0,
  };
}

function mergeAndSetMembers(details, skills, ps) {
  const skillMap = {};
  skills.forEach(s => skillMap[s.regNo] = s);
  const psMap = {};
  ps.forEach(p => psMap[p.regNo] = p);

  State.members = details.map(d => ({
    ...d,
    skills: skillMap[d.regNo] || {},
    ps: psMap[d.regNo] || {},
  }));
}

// ═══════════════════════════════════════════
// CAPTAIN DATA (localStorage)
// ═══════════════════════════════════════════
function loadCaptainData() {
  try {
    State.captainData = JSON.parse(localStorage.getItem(LS_KEY)) || { venue: '', tasks: {} };
  } catch {
    State.captainData = { venue: '', tasks: {} };
  }
  updateVenueDisplay();
}

function saveCaptainData() {
  localStorage.setItem(LS_KEY, JSON.stringify(State.captainData));
}

function saveVenue() {
  const v = document.getElementById('venueInput').value.trim();
  if (!v) { showToast('Enter a venue first', 'warning'); return; }
  State.captainData.venue = v;
  saveCaptainData();
  updateVenueDisplay();
  showToast(`Venue updated: ${v}`, 'success');
}

function updateVenueDisplay() {
  const v = State.captainData.venue || 'Not Set';
  document.getElementById('venueText').textContent = `Venue: ${v}`;
  const inp = document.getElementById('venueInput');
  if (inp) inp.value = State.captainData.venue || '';
  // Also update read-only display
  const roText = document.getElementById('venueReadOnlyText');
  if (roText) roText.textContent = v;
}

function getTask(regNo) {
  return State.captainData.tasks[regNo] || { title: '', priority: 'medium', dueDate: '', status: 'pending', remarks: '' };
}

function setTask(regNo, taskObj) {
  State.captainData.tasks[regNo] = taskObj;
  saveCaptainData();
}

function assignBulkTask() {
  const title = document.getElementById('bulkTaskTitle').value.trim();
  const priority = document.getElementById('bulkPriority').value;
  const dueDate = document.getElementById('bulkDueDate').value;
  if (!title) { showToast('Enter a task title', 'warning'); return; }
  State.members.forEach(m => {
    setTask(m.regNo, { title, priority, dueDate, status: 'pending', remarks: '' });
  });
  updateTaskOverview();
  renderTaskTable();
  showToast(`Task assigned to all ${State.members.length} members`, 'success');
}

function exportTasks() {
  const data = { venue: State.captainData.venue, tasks: State.captainData.tasks, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nexus_task_data.json';
  a.click();
  showToast('Task data exported as JSON', 'success');
}

function resetTasks() {
  if (!confirm('Reset ALL captain data? This cannot be undone.')) return;
  State.captainData = { venue: '', tasks: {} };
  saveCaptainData();
  updateVenueDisplay();
  updateTaskOverview();
  renderTaskTable();
  showToast('All captain data reset', 'warning');
}

function updateTaskOverview() {
  const allTasks = Object.values(State.captainData.tasks);
  const total = State.members.length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const pending = allTasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
  const high = allTasks.filter(t => t.priority === 'high').length;
  document.getElementById('tobAllNum').textContent = total;
  document.getElementById('tobPendNum').textContent = pending;
  document.getElementById('tobCompNum').textContent = completed;
  document.getElementById('tobHighNum').textContent = high;
}

// ═══════════════════════════════════════════
// RENDER ALL
// ═══════════════════════════════════════════
function renderAll() {
  renderSummaryCards();
  populateFilters();
  renderMemberCards(State.members);
  renderMemberTable(State.members);
  renderEventsSection();
  renderAttendanceTable();
  renderDashboardCharts();
  renderRecentActivity();
}

// ═══════════════════════════════════════════
// SUMMARY CARDS
// ═══════════════════════════════════════════
function renderSummaryCards() {
  const m = State.members;
  document.getElementById('sc-total').textContent = m.length;
  const depts = new Set(m.map(x => x.dept)).size;
  document.getElementById('sc-depts').textContent = depts;
  const totalEvents = m.reduce((a, x) => a + (x.eventsAttended || 0), 0);
  document.getElementById('sc-events').textContent = totalEvents;
  const totalWon = m.reduce((a, x) => a + (x.eventsWon || 0), 0);
  document.getElementById('sc-won').textContent = totalWon;
  const withArrears = m.filter(x => (x.arrears || 0) > 0).length;
  document.getElementById('sc-arrears').textContent = withArrears;
  const avgCgpa = m.length ? (m.reduce((a, x) => a + (x.cgpa || 0), 0) / m.length).toFixed(2) : '--';
  document.getElementById('sc-cgpa').textContent = avgCgpa;
}

// ═══════════════════════════════════════════
// FILTERS & SEARCH
// ═══════════════════════════════════════════
function populateFilters() {
  const depts = [...new Set(State.members.map(m => m.dept).filter(Boolean))].sort();
  const roles = [...new Set(State.members.map(m => m.role).filter(Boolean))].sort();
  const deptSel = document.getElementById('filterDept');
  const roleSel = document.getElementById('filterRole');
  deptSel.innerHTML = '<option value="">All Departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  roleSel.innerHTML = '<option value="">All Roles</option>' + roles.map(r => `<option value="${r}">${r}</option>`).join('');
}

function applyFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const dept = document.getElementById('filterDept').value;
  const role = document.getElementById('filterRole').value;
  const sort = document.getElementById('sortBy').value;

  let result = State.members.filter(m => {
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.regNo.toLowerCase().includes(q) || (m.dept || '').toLowerCase().includes(q) || (m.role || '').toLowerCase().includes(q);
    const matchDept = !dept || m.dept === dept;
    const matchRole = !role || m.role === role;
    return matchQ && matchDept && matchRole;
  });

  if (sort) {
    result.sort((a, b) => {
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      const aPs = a.ps || {}; const bPs = b.ps || {};
      const map = {
        cgpa: [b.cgpa, a.cgpa],
        rewardPts: [bPs.rewardPts || 0, aPs.rewardPts || 0],
        activityPts: [bPs.activityPts || 0, aPs.activityPts || 0],
        eventsAttended: [b.eventsAttended || 0, a.eventsAttended || 0],
      };
      return (map[sort] || [0,0])[0] - (map[sort] || [0,0])[1];
    });
  }

  State.filteredMembers = result;
  document.getElementById('filterCount').textContent = `Showing ${result.length} of ${State.members.length} members`;
  renderMemberCards(result);
  renderMemberTable(result);
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterDept').value = '';
  document.getElementById('filterRole').value = '';
  document.getElementById('sortBy').value = '';
  applyFilters();
}

// ═══════════════════════════════════════════
// MEMBER CARDS
// ═══════════════════════════════════════════
function getRoleBadgeClass(role) {
  const r = (role || '').toLowerCase();
  if (r.includes('captain') && r.includes('vice')) return 'badge-vice-captain';
  if (r.includes('captain')) return 'badge-captain';
  if (r.includes('strategist')) return 'badge-strategist';
  if (r.includes('mentor')) return 'badge-mentor';
  return 'badge-member';
}

function renderMemberCards(members) {
  const grid = document.getElementById('membersGrid');
  if (!members.length) { grid.innerHTML = '<p class="empty-state">No members match your search.</p>'; return; }

  grid.innerHTML = members.map(m => {
    const initials = (m.name || '--').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const skills = m.skills || {};
    const skillTags = [skills.primary1, skills.primary2].filter(s => s && s !== 'N/A').slice(0, 2).map(s => `<span class="skill-tag">${s}</span>`).join('');
    const ps = m.ps || {};
    const task = getTask(m.regNo);
    const taskBadge = State.mode === 'captain' && task.title ? `<span class="skill-tag" style="color:var(--gold);border-color:rgba(255,215,0,0.3)">${task.status.toUpperCase()}</span>` : '';
    return `
    <div class="member-card" onclick="openMemberModal('${m.regNo}')">
      <div class="mc-top">
        <div class="mc-avatar">${initials}</div>
        <div>
          <div class="mc-name">${m.name || 'Unknown'}</div>
          <div class="mc-reg">${m.regNo}</div>
        </div>
      </div>
      <div class="mc-details">
        <div class="mc-detail"><span class="mc-detail-label">DEPT</span><span class="mc-detail-val">${m.dept || 'N/A'}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">CGPA</span><span class="mc-detail-val">${m.cgpa || 'N/A'}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">EVENTS WON</span><span class="mc-detail-val">${m.eventsWon || 0}</span></div>
        <div class="mc-detail"><span class="mc-detail-label">REWARD PTS</span><span class="mc-detail-val">${ps.rewardPts || 0}</span></div>
      </div>
      <div class="mc-footer">
        <span class="role-badge ${getRoleBadgeClass(m.role)}">${m.role || 'Member'}</span>
        ${skillTags}
        ${taskBadge}
      </div>
    </div>`;
  }).join('');
}

function renderMemberTable(members) {
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  head.innerHTML = `<tr><th>#</th><th>NAME</th><th>REG. NO.</th><th>DEPT</th><th>ROLE</th><th>CGPA</th><th>ARREARS</th><th>EVENTS WON</th><th>REWARD PTS</th></tr>`;
  body.innerHTML = members.length ? members.map((m, i) => `
    <tr onclick="openMemberModal('${m.regNo}')">
      <td>${i + 1}</td>
      <td><strong>${m.name || 'N/A'}</strong></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">${m.regNo}</td>
      <td>${m.dept || 'N/A'}</td>
      <td><span class="role-badge ${getRoleBadgeClass(m.role)}" style="font-size:9px">${m.role || 'Member'}</span></td>
      <td style="color:var(--green)">${m.cgpa || 'N/A'}</td>
      <td style="color:${(m.arrears || 0) > 0 ? 'var(--red)' : 'var(--text-secondary)'}">${m.arrears || 0}</td>
      <td>${m.eventsWon || 0}</td>
      <td style="color:var(--gold)">${(m.ps || {}).rewardPts || 0}</td>
    </tr>`).join('') : `<tr><td colspan="9" class="empty-td">No members found.</td></tr>`;
}

function setView(mode) {
  document.getElementById('membersGrid').classList.toggle('hidden', mode !== 'card');
  document.getElementById('membersTable').classList.toggle('hidden', mode !== 'table');
  document.getElementById('viewCard').classList.toggle('active', mode === 'card');
  document.getElementById('viewTable').classList.toggle('active', mode === 'table');
}

// ═══════════════════════════════════════════
// EVENTS SECTION
// ═══════════════════════════════════════════
function renderEventsSection() {
  const grid = document.getElementById('eventsGrid');
  if (!State.events.length) return;
  grid.innerHTML = State.events.map(ev => `
    <div class="event-card">
      <div class="event-name">${ev.name || 'Unknown Event'}</div>
      <div class="event-meta">📅 ${ev.monthYear || 'N/A'} &nbsp;|&nbsp; 🏛 ${ev.host || 'N/A'}</div>
      <span class="event-type">${ev.type || 'General'}</span>
    </div>`).join('');
}

// ═══════════════════════════════════════════
// ATTENDANCE TABLE
// ═══════════════════════════════════════════
function renderAttendanceTable() {
  const body = document.getElementById('attendanceBody');
  if (!State.attendance.length) return;
  body.innerHTML = State.attendance.map(a => `
    <tr>
      <td>${a.date}</td>
      <td style="font-family:var(--font-mono);color:var(--cyan)">${a.regNo}</td>
      <td>${a.name}</td>
      <td style="font-size:11px">${a.mail}</td>
      <td style="color:var(--red)">${a.missedHour}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════
// TASK TABLE (Captain Panel)
// ═══════════════════════════════════════════
function renderTaskTable() {
  const body = document.getElementById('taskTableBody');
  const q = (document.getElementById('taskSearchInput').value || '').toLowerCase();
  const statusF = document.getElementById('taskStatusFilter').value;
  const tF = State.taskFilter;

  let members = State.members.filter(m => {
    const task = getTask(m.regNo);
    const matchQ = !q || m.name.toLowerCase().includes(q) || m.regNo.toLowerCase().includes(q);
    const matchStatus = !statusF || task.status === statusF;
    const matchFilter = tF === 'all' ? true : tF === 'pending' ? (task.status === 'pending' || task.status === 'in-progress') : tF === 'completed' ? task.status === 'completed' : tF === 'high' ? task.priority === 'high' : true;
    return matchQ && matchStatus && matchFilter;
  });

  body.innerHTML = members.length ? members.map(m => {
    const t = getTask(m.regNo);
    return `<tr>
      <td><strong>${m.name}</strong></td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${m.regNo}</td>
      <td>${t.title || '<span style="color:var(--text-muted)">Unassigned</span>'}</td>
      <td><span class="priority-${t.priority || 'medium'}">${(t.priority || 'medium').toUpperCase()}</span></td>
      <td style="font-size:11px;font-family:var(--font-mono)">${t.dueDate || '--'}</td>
      <td><span class="status-${t.status || 'pending'}">${(t.status || 'pending').replace('-', ' ').toUpperCase()}</span></td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${t.remarks || ''}">${t.remarks || '--'}</td>
      <td>
        <button class="btn-xs" onclick="openMemberModal('${m.regNo}', 'tasks')">EDIT</button>
        ${t.status !== 'completed' ? `<button class="btn-xs done" onclick="markDone('${m.regNo}')" style="margin-left:4px">✓ DONE</button>` : ''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty-td">No tasks found.</td></tr>`;
}

function markDone(regNo) {
  const t = getTask(regNo);
  t.status = 'completed';
  setTask(regNo, t);
  updateTaskOverview();
  renderTaskTable();
  showToast('Task marked as completed', 'success');
}

// ═══════════════════════════════════════════
// MEMBER MODAL
// ═══════════════════════════════════════════
function openMemberModal(regNo, defaultTab = 'profile') {
  const m = State.members.find(x => x.regNo === regNo);
  if (!m) return;
  State.currentViewMember = m;

  const initials = (m.name || '--').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('mmAvatar').textContent = initials;
  document.getElementById('mmName').textContent = m.name || 'Unknown';
  document.getElementById('mmReg').textContent = `REG: ${m.regNo}`;
  const rb = document.getElementById('mmRoleBadge');
  rb.textContent = m.role || 'Member';
  rb.className = `role-badge ${getRoleBadgeClass(m.role)}`;

  // Profile
  renderModalProfile(m);
  renderModalSkills(m);
  renderModalPS(m);
  renderModalEvents(m);
  if (State.mode === 'captain') renderModalTask(m);

  switchModalTab(defaultTab);

  document.querySelectorAll('.mm-tab[data-tab="tasks"]').forEach(t => {
    t.classList.toggle('hidden', State.mode !== 'captain');
  });
  document.getElementById('tab-tasks').classList.toggle('captain-only', State.mode !== 'captain');

  document.getElementById('memberModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('memberModal').classList.add('hidden');
  State.currentViewMember = null;
}

function switchModalTab(tab) {
  document.querySelectorAll('.mm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.mm-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

function infoItem(label, val) {
  return `<div class="info-item"><div class="info-label">${label}</div><div class="info-val">${val || 'N/A'}</div></div>`;
}

function renderModalProfile(m) {
  const cont = document.getElementById('profileInfo');
  cont.innerHTML = [
    infoItem('DEPARTMENT', m.dept),
    infoItem('MOBILE', m.mobile),
    infoItem('EMAIL', m.mail),
    infoItem('CGPA', m.cgpa),
    infoItem('ARREARS', m.arrears || 0),
    infoItem('SPECIAL LAB', m.specialLab),
    infoItem('SSG MEMBER', m.ssg),
    infoItem('EVENTS ATTENDED', m.eventsAttended || 0),
    infoItem('EVENTS WON', m.eventsWon || 0),
    infoItem('FOREIGN LANGUAGE', m.foreignLang),
    infoItem('MODE OF STUDY', m.modeOfStudy),
    infoItem('CURRENT EVENTS', m.currentEvents || 'None'),
    infoItem('VENUE', State.captainData.venue || 'Not Set'),
  ].join('');
}

function renderModalSkills(m) {
  const s = m.skills || {};
  const cont = document.getElementById('skillsDisplay');
  const chip = (label, cls) => label && label !== 'N/A' ? `<span class="skill-chip ${cls}">${label}</span>` : '';
  cont.innerHTML = `
    <div class="skill-label">PRIMARY SKILLS</div>
    ${chip(s.primary1, 'skill-primary')} ${chip(s.primary2, 'skill-primary')}
    <div class="skill-label">SECONDARY SKILLS</div>
    ${chip(s.secondary1, 'skill-secondary')} ${chip(s.secondary2, 'skill-secondary')}
    <div class="skill-label">SPECIALIZATION</div>
    ${chip(s.spec1, 'skill-spec')} ${chip(s.spec2, 'skill-spec')}
  `;
}

function renderModalPS(m) {
  const ps = m.ps || {};
  const pct = ps.weeklyAttempts ? Math.round((ps.weeklyCleared / ps.weeklyAttempts) * 100) : 0;
  document.getElementById('psDisplay').innerHTML = `
    <div class="info-grid">
      ${infoItem('REWARD POINTS', ps.rewardPts || 0)}
      ${infoItem('ACTIVITY POINTS', ps.activityPts || 0)}
      ${infoItem('MANDATORY COMPLETION', ps.mandatoryCompletion || 'N/A')}
      ${infoItem('WEEKLY ATTEMPTS', ps.weeklyAttempts || 0)}
      ${infoItem('WEEKLY CLEARED', ps.weeklyCleared || 0)}
    </div>
    <div class="skill-label">PS COMPLETION RATE</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
      <div class="ps-progress" style="flex:1"><div class="ps-bar" style="width:${pct}%"></div></div>
      <span style="font-family:var(--font-mono);color:var(--cyan);font-size:13px">${pct}%</span>
    </div>
  `;
}

function renderModalEvents(m) {
  const events = State.events.filter(() => true); // all events for now
  const attended = (m.currentEvents || '').split(',').map(s => s.trim()).filter(Boolean);
  const miss = State.attendance.filter(a => a.regNo === m.regNo);
  let html = '';
  if (attended.length) {
    html += `<div class="skill-label">REGISTERED EVENTS</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">` +
      attended.map(e => `<span class="event-type">${e}</span>`).join('') + `</div>`;
  }
  html += `<div class="skill-label">PARTICIPATION STATS</div>`;
  html += `<div class="info-grid">${infoItem('EVENTS ATTENDED', m.eventsAttended || 0)}${infoItem('EVENTS WON', m.eventsWon || 0)}</div>`;
  if (miss.length) {
    html += `<div class="skill-label">MISSED ATTENDANCE</div><div class="table-wrap"><table class="data-table"><thead><tr><th>DATE</th><th>MISSED HRS</th></tr></thead><tbody>` +
      miss.map(a => `<tr><td>${a.date}</td><td style="color:var(--red)">${a.missedHour}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  document.getElementById('eventsDisplay').innerHTML = html || '<p class="empty-state">No event data available.</p>';
}

function renderModalTask(m) {
  const t = getTask(m.regNo);
  document.getElementById('mmTaskTitle').value = t.title || '';
  document.getElementById('mmPriority').value = t.priority || 'medium';
  document.getElementById('mmDueDate').value = t.dueDate || '';
  document.getElementById('mmStatus').value = t.status || 'pending';
  document.getElementById('mmRemarks').value = t.remarks || '';
}

function saveModalTask() {
  const m = State.currentViewMember;
  if (!m) return;
  const task = {
    title: document.getElementById('mmTaskTitle').value.trim(),
    priority: document.getElementById('mmPriority').value,
    dueDate: document.getElementById('mmDueDate').value,
    status: document.getElementById('mmStatus').value,
    remarks: document.getElementById('mmRemarks').value.trim(),
  };
  setTask(m.regNo, task);
  updateTaskOverview();
  renderTaskTable();
  renderMemberCards(State.filteredMembers);
  showToast(`Task saved for ${m.name}`, 'success');
}

// ═══════════════════════════════════════════
// DASHBOARD CHARTS
// ═══════════════════════════════════════════
const NEON_COLORS = [
  '#00d4ff', '#7c3aed', '#00ff88', '#ffd700',
  '#ff3366', '#4488ff', '#ff8c00', '#00ffcc',
];

function destroyChart(key) {
  if (State.charts[key]) { State.charts[key].destroy(); delete State.charts[key]; }
}

const chartDefaults = {
  plugins: {
    legend: { labels: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } } },
  },
  scales: {
    x: { ticks: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } }, grid: { color: 'rgba(0,212,255,0.05)' } },
    y: { ticks: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } }, grid: { color: 'rgba(0,212,255,0.05)' } },
  },
};

function renderDashboardCharts() {
  const members = State.members;

  // Dept chart
  const deptCount = {};
  members.forEach(m => { deptCount[m.dept || 'N/A'] = (deptCount[m.dept || 'N/A'] || 0) + 1; });
  destroyChart('dept');
  const dCtx = document.getElementById('deptChart');
  if (dCtx) {
    State.charts.dept = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(deptCount),
        datasets: [{ data: Object.values(deptCount), backgroundColor: NEON_COLORS.map(c => c + '99'), borderColor: NEON_COLORS, borderWidth: 1 }],
      },
      options: { plugins: { legend: { labels: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } } } }, cutout: '60%' },
    });
  }

  // Role chart
  const roleCount = {};
  members.forEach(m => { roleCount[m.role || 'Member'] = (roleCount[m.role || 'Member'] || 0) + 1; });
  destroyChart('role');
  const rCtx = document.getElementById('roleChart');
  if (rCtx) {
    State.charts.role = new Chart(rCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(roleCount),
        datasets: [{ data: Object.values(roleCount), backgroundColor: NEON_COLORS.map(c => c + '88'), borderColor: NEON_COLORS, borderWidth: 1 }],
      },
      options: { plugins: { legend: { labels: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } } } } },
    });
  }

  // CGPA bar chart
  const topMembers = [...members].sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0)).slice(0, 8);
  destroyChart('cgpa');
  const cCtx = document.getElementById('cgpaChart');
  if (cCtx) {
    State.charts.cgpa = new Chart(cCtx, {
      type: 'bar',
      data: {
        labels: topMembers.map(m => m.name.split(' ')[0]),
        datasets: [{
          label: 'CGPA',
          data: topMembers.map(m => m.cgpa),
          backgroundColor: NEON_COLORS[0] + '66',
          borderColor: NEON_COLORS[0],
          borderWidth: 1,
        }],
      },
      options: { ...chartDefaults, plugins: { legend: { display: false } }, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, min: 6, max: 10 } } },
    });
  }
}

function renderAnalyticsCharts() {
  const members = State.members;

  // Skill frequency
  const skillCount = {};
  members.forEach(m => {
    const s = m.skills || {};
    [s.primary1, s.primary2, s.secondary1, s.secondary2].forEach(sk => {
      if (sk && sk !== 'N/A') skillCount[sk] = (skillCount[sk] || 0) + 1;
    });
  });
  const top10 = Object.entries(skillCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  destroyChart('skill');
  const skCtx = document.getElementById('skillChart');
  if (skCtx) {
    State.charts.skill = new Chart(skCtx, {
      type: 'bar',
      data: {
        labels: top10.map(x => x[0]),
        datasets: [{ label: 'Members', data: top10.map(x => x[1]), backgroundColor: NEON_COLORS[2] + '66', borderColor: NEON_COLORS[2], borderWidth: 1 }],
      },
      options: { ...chartDefaults, indexAxis: 'y', plugins: { legend: { display: false } } },
    });
  }

  // PS completion
  const psYes = members.filter(m => (m.ps || {}).mandatoryCompletion === 'Yes').length;
  const psNo = members.length - psYes;
  destroyChart('ps');
  const psCtx = document.getElementById('psChart');
  if (psCtx) {
    State.charts.ps = new Chart(psCtx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending'],
        datasets: [{ data: [psYes, psNo], backgroundColor: [NEON_COLORS[2] + '99', NEON_COLORS[4] + '99'], borderColor: [NEON_COLORS[2], NEON_COLORS[4]], borderWidth: 1 }],
      },
      options: { cutout: '65%', plugins: { legend: { labels: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } } } } },
    });
  }

  // Task completion
  const allTasks = Object.values(State.captainData.tasks || {});
  const tc = { completed: allTasks.filter(t => t.status === 'completed').length, inProgress: allTasks.filter(t => t.status === 'in-progress').length, pending: allTasks.filter(t => t.status === 'pending').length, unassigned: members.length - allTasks.length };
  destroyChart('task');
  const tCtx = document.getElementById('taskChart');
  if (tCtx) {
    State.charts.task = new Chart(tCtx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'In Progress', 'Pending', 'Unassigned'],
        datasets: [{ data: [tc.completed, tc.inProgress, tc.pending, tc.unassigned], backgroundColor: [NEON_COLORS[2]+'99', NEON_COLORS[0]+'99', NEON_COLORS[3]+'99', '#445566'], borderColor: [NEON_COLORS[2], NEON_COLORS[0], NEON_COLORS[3], '#667799'], borderWidth: 1 }],
      },
      options: { cutout: '65%', plugins: { legend: { labels: { color: '#8aa8cc', font: { family: 'Share Tech Mono', size: 10 } } } } },
    });
  }

  // Event trend
  const evMonths = {};
  State.events.forEach(ev => { evMonths[ev.monthYear || 'N/A'] = (evMonths[ev.monthYear || 'N/A'] || 0) + 1; });
  destroyChart('eventTrend');
  const etCtx = document.getElementById('eventTrendChart');
  if (etCtx) {
    State.charts.eventTrend = new Chart(etCtx, {
      type: 'line',
      data: {
        labels: Object.keys(evMonths),
        datasets: [{ label: 'Events', data: Object.values(evMonths), borderColor: NEON_COLORS[1], backgroundColor: NEON_COLORS[1] + '22', tension: 0.4, fill: true, pointBackgroundColor: NEON_COLORS[1] }],
      },
      options: { ...chartDefaults, plugins: { legend: { display: false } } },
    });
  }

  // Points scatter
  destroyChart('points');
  const ptCtx = document.getElementById('pointsChart');
  if (ptCtx) {
    State.charts.points = new Chart(ptCtx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Members',
          data: members.map(m => ({ x: (m.ps || {}).activityPts || 0, y: (m.ps || {}).rewardPts || 0, label: m.name })),
          backgroundColor: NEON_COLORS[0] + '99',
          borderColor: NEON_COLORS[0],
          pointRadius: 6,
        }],
      },
      options: {
        ...chartDefaults,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.raw.label}: Activity ${ctx.raw.x}, Reward ${ctx.raw.y}` } },
        },
      },
    });
  }
}

// ═══════════════════════════════════════════
// RECENT ACTIVITY
// ═══════════════════════════════════════════
function renderRecentActivity() {
  const list = document.getElementById('recentList');
  const items = [
    `Loaded ${State.members.length} team members`,
    `${State.events.length} events in the log`,
    `${State.members.filter(m => (m.ps || {}).mandatoryCompletion === 'Yes').length} members completed Mandatory PS`,
    `${State.attendance.length} missed attendance records`,
    `Average CGPA: ${State.members.length ? (State.members.reduce((a, m) => a + (m.cgpa || 0), 0) / State.members.length).toFixed(2) : 'N/A'}`,
  ];
  list.innerHTML = items.map(item => `<div class="recent-item"><div class="recent-dot"></div>${item}</div>`).join('');
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function showToast(msg, type = 'info') {
  const cont = document.getElementById('toastContainer');
  const t = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: '◉' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span style="color:${type === 'success' ? 'var(--green)' : type === 'error' ? 'var(--red)' : type === 'warning' ? 'var(--gold)' : 'var(--cyan)'}">${icons[type] || '◉'}</span>${msg}`;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}