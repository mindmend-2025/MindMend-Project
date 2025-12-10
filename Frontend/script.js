// State management
let isMoodLogged = false;
let currentMoodValue = 50;
let currentMonthDate = new Date();
let currentSelectedDate = null;
let currentHistoryId = null;
let currentUser = null;

// Clerk authentication
const waitForClerk = () => new Promise(resolve => {
  const check = () => {
    if (window.Clerk && window.Clerk.user) {
      currentUser = window.Clerk.user;
      resolve(window.Clerk);
    } else if (window.Clerk && typeof window.Clerk.load === 'function') {
      window.Clerk.load()
        .then(() => {
          currentUser = window.Clerk.user;
          resolve(window.Clerk);
        })
        .catch(() => {
          window.location.href = '/login.html';
        });
    } else {
      setTimeout(check, 100);
    }
  };
  check();
});

// Mouse tracking for glow effect
function handleMouseMove(e) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--mouse-x', e.clientX - rect.left + 'px');
  card.style.setProperty('--mouse-y', e.clientY - rect.top + 'px');
}

// Load entries from backend
async function loadEntries() {
  try {
    const isAdmin = currentUser?.publicMetadata?.role === 'admin';
    const params = new URLSearchParams({
      userId: currentUser?.id || '',
      isAdmin: isAdmin.toString()
    });
    const response = await fetch(`/entries?${params}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Error loading entries:', error);
    return [];
  }
}

// Save entry to backend
async function saveEntry(entry) {
  try {
    if (currentUser) {
      entry.userId = currentUser.id;
      entry.userEmail = currentUser.primaryEmailAddress?.emailAddress || '';
    }
    const response = await fetch('/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`HTTP error! status: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error saving entry:', error);
    showToast(`Failed to save entry: ${error.message || 'Failed to save entry. Please try again.'}`);
    throw error;
  }
}

// Delete entry from backend
async function deleteEntry(id) {
  try {
    const params = new URLSearchParams({ userId: currentUser?.id || '' });
    const response = await fetch(`/entries/${id}?${params}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return true;
  } catch (error) {
    console.error('Error deleting entry:', error);
    return false;
  }
}

// Initialize user and profile dropdown
waitForClerk()
  .then(clerk => {
    const profileBtn = document.getElementById('profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    const userEmail = document.getElementById('user-email');
    const adminLink = document.getElementById('admin-link');
    const logoutBtn = document.getElementById('logout-btn');

    if (currentUser) {
      userEmail.textContent = currentUser.primaryEmailAddress?.emailAddress || 'User';
      if (currentUser.publicMetadata?.role === 'admin') {
        adminLink.classList.remove('hidden');
      }
    }

    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
        profileDropdown.classList.remove('show');
      }
    });

    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to logout?')) {
        await clerk.signOut();
        window.location.href = '/login.html';
      }
    });
  })
  .catch(() => {
    window.location.href = '/login.html';
  });

// DOM elements for mood
const moodLabel = document.getElementById('mood-label');
const orb1 = document.getElementById('bg-orb-1');
const orb2 = document.getElementById('bg-orb-2');
const sliderFill = document.getElementById('slider-fill');

// Color interpolation for mood visualization
function interpolateColor(value) {
  let h1, s1, l1, h2, s2, l2;
  if (value < 50) {
    const t = value / 50;
    h1 = 230 + (-60 * t);
    s1 = 60;
    l1 = 40;
    h2 = 260 + (-60 * t);
    s2 = 70;
    l2 = 45;
  } else {
    const t = (value - 50) / 50;
    h1 = 170 + (170 * t);
    s1 = 60 + (20 * t);
    l1 = 40 + (10 * t);
    h2 = 200 + (-160 * t);
    s2 = 70 + (20 * t);
    l2 = 45 + (10 * t);
  }
  return {
    c1: `hsl(${h1}, ${s1}%, ${l1}%)`,
    c2: `hsl(${h2}, ${s2}%, ${l2}%)`
  };
}

// Update mood display
function updateMood(value) {
  value = Number(value);
  currentMoodValue = value;
  let label = 'Neutral';
  if (value <= 20) label = 'Burdened';
  else if (value <= 40) label = 'Uneasy';
  else if (value <= 60) label = 'Neutral';
  else if (value <= 80) label = 'Content';
  else label = 'Radiant';

  moodLabel.innerText = label;
  const colors = interpolateColor(value);
  orb1.style.background = `radial-gradient(circle, ${colors.c1} 0%, rgba(0,0,0,0) 70%)`;
  orb2.style.background = `radial-gradient(circle, ${colors.c2} 0%, rgba(0,0,0,0) 70%)`;
  sliderFill.style.width = value + '%';
  sliderFill.style.background = colors.c2;
}

// Toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.querySelector('span').innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Navigation highlighting
function setNavActive(navId) {
  [document.getElementById('nav-log'), document.getElementById('nav-journal'), document.getElementById('nav-history')].forEach(el => {
    el.classList.remove('nav-item-active');
    if (!el.classList.contains('nav-item-inactive')) {
      el.classList.add('nav-item-inactive');
    }
  });
  const activeNav = document.getElementById(navId);
  activeNav.classList.remove('nav-item-inactive');
  activeNav.classList.add('nav-item-active');
}

// Commit mood selection
function commitMood() {
  isMoodLogged = true;
  document.getElementById('journal-lock').classList.add('hidden');
  switchView('journal');
}

// Switch between views
function switchView(viewName) {
  const viewLog = document.getElementById('view-log');
  const viewJournal = document.getElementById('view-journal');
  const viewHistory = document.getElementById('view-history');

  if (viewName === 'journal' && !isMoodLogged) {
    showToast('Please log your mood first.');
    const panel = document.querySelector('#view-log .glass-panel');
    if (panel) {
      panel.style.transform = 'translateX(-5px)';
      setTimeout(() => (panel.style.transform = 'translateX(5px)'), 100);
      setTimeout(() => (panel.style.transform = 'translateX(0)'), 200);
    }
    return;
  }

  viewLog.classList.add('hidden');
  viewJournal.classList.add('hidden');
  viewHistory.classList.add('hidden');

  if (viewName === 'log') {
    viewLog.classList.remove('hidden');
    viewLog.classList.add('animate-enter');
    setNavActive('nav-log');
  } else if (viewName === 'journal') {
    viewJournal.classList.remove('hidden');
    viewJournal.classList.add('animate-enter');
    setNavActive('nav-journal');
  } else if (viewName === 'history') {
    viewHistory.classList.remove('hidden');
    viewHistory.classList.add('animate-enter');
    setNavActive('nav-history');
  }
}

// Return to calendar view
function backToCalendar() {
  switchView('log');
}

// Navigate months in calendar
function changeMonth(offset) {
  currentMonthDate.setMonth(currentMonthDate.getMonth() + offset);
  renderCalendar();
}

// Render calendar grid
async function renderCalendar() {
  const calendarGrid = document.getElementById('calendar-grid');
  const monthLabel = document.getElementById('calendar-month-label');
  if (!calendarGrid || !monthLabel) return;

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  monthLabel.innerText = currentMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const entries = await loadEntries();
  const entryDates = {};
  entries.forEach(entry => {
    entryDates[entry.date] = true;
  });

  calendarGrid.innerHTML = '';
  for (let i = 0; i < firstDay; i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'h-9 rounded-xl';
    calendarGrid.appendChild(emptyDay);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'h-9 rounded-xl text-xs flex flex-col items-center justify-center bg-white/0 text-white/70 hover:bg-white/10 transition relative';

    if (dateStr === today) {
      dayBtn.className += ' border border-white/30 bg-white/5';
    }
    if (currentSelectedDate === dateStr) {
      dayBtn.className += ' ring-1 ring-white/60';
    }

    dayBtn.innerHTML = `<span>${day}</span>`;

    if (entryDates[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 absolute bottom-1';
      dayBtn.appendChild(dot);
    }

    dayBtn.addEventListener('click', () => {
      currentSelectedDate = dateStr;
      renderCalendar();
      renderEntriesForDate(dateStr);
    });

    calendarGrid.appendChild(dayBtn);
  }
}

// Format date nicely
function formatDateNice(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Format time
function formatTime(datetime) {
  const date = datetime instanceof Date ? datetime : new Date(datetime);
  return isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Render entries for selected date
async function renderEntriesForDate(dateStr) {
  const entriesList = document.getElementById('entries-list');
  const entriesTitle = document.getElementById('entries-title');
  if (!entriesList || !entriesTitle) return;

  const allEntries = await loadEntries();
  const dayEntries = allEntries.filter(e => e.date === dateStr).sort((a, b) => {
    const aTime = new Date(a.createdAt || a._id);
    const bTime = new Date(b.createdAt || b._id);
    return bTime - aTime;
  });

  entriesTitle.innerText = `Entries for ${formatDateNice(dateStr)}`;

  if (dayEntries.length) {
    entriesList.innerHTML = '';
    dayEntries.forEach(entry => {
      const entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      entryBtn.className = 'w-full text-left p-2 rounded-xl bg-white/0 hover:bg-white/5 transition flex flex-col gap-1';

      const text = (entry.text || '').replace(/\s+/g, ' ');
      const preview = text.length > 120 ? text.slice(0, 120) + '…' : text;

      entryBtn.innerHTML = `
            <div class="flex items-center justify-between text-[10px] text-white/40 mb-0.5">
                <span class="uppercase tracking-[0.16em]">${entry.moodLabel}</span>
                <span>${formatTime(entry.createdAt)}</span>
            </div>
            <p class="text-xs text-white/70 truncate">${preview}</p>
        `;

      entryBtn.addEventListener('click', () => openHistory(entry._id));
      entriesList.appendChild(entryBtn);
    });
  } else {
    entriesList.innerHTML = '<p class="text-xs text-white/40">No entries for this day.</p>';
  }
}

// Render history entry list
async function renderHistoryList(entries, selectedId) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  historyList.innerHTML = '';

  if (entries.length) {
    const sorted = entries.slice().sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    sorted.forEach(entry => {
      const entryBtn = document.createElement('button');
      entryBtn.type = 'button';
      const isSelected = entry._id === selectedId;
      entryBtn.className = `w-full text-left rounded-2xl px-3 py-2 transition flex flex-col gap-1 border ${isSelected ? 'bg-white/10 border-white/30' : 'bg-white/0 border-white/5 hover:bg-white/5'}`;

      const text = (entry.text || '').replace(/\s+/g, ' ');
      const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;

      entryBtn.innerHTML = `
                <div class="flex items-center justify-between text-[10px] text-white/40 mb-0.5">
                    <span class="uppercase tracking-[0.16em]">${entry.moodLabel}</span>
                    <span>${formatTime(entry.createdAt)}</span>
                </div>
                <div class="text-xs text-white/70 truncate">${preview}</div>
            `;

      entryBtn.addEventListener('click', () => openHistory(entry._id));
      historyList.appendChild(entryBtn);
    });
  } else {
    historyList.innerHTML = '<p class="text-xs text-white/40">No entries yet.</p>';
  }
}

// Display history entry details
async function showHistoryEntry(entry) {
  if (!entry) return;
  currentHistoryId = entry._id;

  const dateLabel = document.getElementById('history-date-label');
  const moodLabel = document.getElementById('history-mood-label');
  const affirmationEl = document.getElementById('history-affirmation');
  const textEl = document.getElementById('history-text');

  dateLabel.innerText = formatDateNice(entry.date);
  moodLabel.innerText = `Mood: ${entry.moodLabel} (${entry.moodValue}/100)`;
  affirmationEl.innerText = entry.affirmation ? `"${entry.affirmation}"` : '';
  textEl.innerText = entry.text;
}

// Open history view
async function openHistory(id) {
  const entries = await loadEntries();
  if (!entries.length) {
    showToast('No history yet.');
    return;
  }

  let selectedEntry = null;
  if (id) {
    selectedEntry = entries.find(e => e._id === id);
  }
  if (!selectedEntry) {
    selectedEntry = entries.slice().sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)[0];
  }

  switchView('history');
  renderHistoryList(entries, selectedEntry._id);
  showHistoryEntry(selectedEntry);
}

// Delete current entry
async function deleteCurrentEntry() {
  if (!currentHistoryId) {
    showToast('No entry selected.');
    return;
  }

  if (!await deleteEntry(currentHistoryId)) {
    showToast('Failed to delete entry.');
    return;
  }

  await renderCalendar();

  const historyList = document.getElementById('history-list');
  const dateLabel = document.getElementById('history-date-label');
  const moodLabel = document.getElementById('history-mood-label');
  const affirmationEl = document.getElementById('history-affirmation');
  const textEl = document.getElementById('history-text');

  const remainingEntries = await loadEntries();
  if (!remainingEntries.length) {
    if (historyList) historyList.innerHTML = '<p class="text-xs text-white/40">No entries yet.</p>';
    currentHistoryId = null;
    if (dateLabel) dateLabel.innerText = '';
    if (moodLabel) moodLabel.innerText = '';
    if (affirmationEl) affirmationEl.innerText = '';
    if (textEl) textEl.innerText = 'No entries yet.';
    showToast('Entry deleted.');
    return;
  }

  const nextEntry = remainingEntries.slice().sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)[0];
  currentHistoryId = nextEntry._id;
  await renderHistoryList(remainingEntries, nextEntry._id);
  await showHistoryEntry(nextEntry);
  showToast('Entry deleted.');
}

// Open delete confirmation modal
async function openDeleteConfirm() {
  const entries = await loadEntries();
  if (!currentHistoryId || !entries.find(e => e._id === currentHistoryId)) {
    showToast('No entry selected.');
    return;
  }

  const overlay = document.getElementById('delete-modal-overlay');
  const content = document.getElementById('delete-modal-content');
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  });
}

// Close delete modal
function closeDeleteModal() {
  const overlay = document.getElementById('delete-modal-overlay');
  const content = document.getElementById('delete-modal-content');
  overlay.classList.add('opacity-0');
  content.classList.remove('scale-100');
  content.classList.add('scale-95');
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 300);
}

// Confirm delete entry
function confirmDeleteEntry() {
  deleteCurrentEntry();
  closeDeleteModal();
}

// Fallback affirmations
const affirmations = [
  'Peace comes from within. Do not seek it without.',
  'This moment is all there is.',
  'You are the sky. Everything else is just the weather.',
  'Inhale the future, exhale the past.'
];

// Process journal entry and generate affirmation
async function processAffirmation() {
  const journalText = document.getElementById('journal-text').value.trim();
  if (journalText.length < 2) {
    showToast('Please write something first.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let affirmation = '';

  try {
    const response = await fetch('/generate-affirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: journalText })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || errorData.message || `Server returned ${response.status}`;
      console.error('Affirmation API error:', errorMsg);
      showToast(`Could not generate affirmation: ${errorMsg}`);
      return;
    }

    const result = await response.json();
    if (!result || !result.affirmation) {
      console.error('Affirmation API returned no affirmation:', result);
      showToast('Could not generate affirmation. Please try again.');
      return;
    }

    affirmation = result.affirmation;
  } catch (error) {
    console.error('Error fetching affirmation:', error);
    showToast('Network error generating affirmation. Please try again.');
    return;
  }

  const entry = {
    date: today,
    moodValue: currentMoodValue,
    moodLabel: moodLabel.innerText,
    text: journalText,
    affirmation: affirmation
  };

  try {
    await saveEntry(entry);
    currentSelectedDate = today;
    await renderCalendar();
    await renderEntriesForDate(today);
  } catch (error) {
    console.error('Failed to save entry:', error);
    return;
  }

  const overlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');
  document.getElementById('affirmation-result').innerText = `"${affirmation}"`;
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.remove('opacity-0');
    modalContent.classList.remove('scale-95');
    modalContent.classList.add('scale-100');
  });
}

// Close affirmation modal
function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');
  overlay.classList.add('opacity-0');
  modalContent.classList.remove('scale-100');
  modalContent.classList.add('scale-95');
  setTimeout(() => {
    overlay.classList.add('hidden');
    document.getElementById('journal-text').value = '';
    switchView('log');
    document.getElementById('progress-ring').style.strokeDashoffset = '0';
    isMoodLogged = false;
    document.getElementById('journal-lock').classList.remove('hidden');
  }, 500);
}

// Initialize on page load
updateMood(50);
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  currentSelectedDate = today;
  await renderCalendar();
  await renderEntriesForDate(today);
})();
