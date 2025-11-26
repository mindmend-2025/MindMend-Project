// public/script.js

// --- STATE ---
let isMoodLogged = false;
let currentMoodValue = 50;
let currentMonthDate = new Date();
let currentSelectedDate = null;
let currentHistoryId = null;
let allEntries = []; // We will fetch these from the DB

// --- SPOTLIGHT ---
function handleMouseMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
}

// --- API HELPERS (Replaces LocalStorage) ---
async function fetchEntries() {
    try {
        const response = await fetch('/api/entries');
        allEntries = await response.json();
    } catch (e) {
        console.error("Failed to fetch entries", e);
        showToast("Error loading data.");
    }
}

async function saveEntryToDB(data) {
    const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

async function deleteEntryFromDB(id) {
    await fetch(`/api/entries/${id}`, { method: 'DELETE' });
}

// --- MOOD LOGIC ---
const moodLabel = document.getElementById('mood-label');
const orb1 = document.getElementById('bg-orb-1');
const orb2 = document.getElementById('bg-orb-2');
const sliderFill = document.getElementById('slider-fill');

function interpolateColor(val) {
    let h1, s1, l1, h2, s2, l2;
    if (val < 50) {
        const p = val / 50; 
        h1 = 230 + (170 - 230) * p; s1 = 60; l1 = 40;
        h2 = 260 + (200 - 260) * p; s2 = 70; l2 = 45;
    } else {
        const p = (val - 50) / 50;
        h1 = 170 + (340 - 170) * p; s1 = 60 + (20 * p); l1 = 40 + (10 * p);
        h2 = 200 + (40 - 200) * p; s2 = 70 + (20 * p); l2 = 45 + (10 * p);
    }
    return { c1: `hsl(${h1}, ${s1}%, ${l1}%)`, c2: `hsl(${h2}, ${s2}%, ${l2}%)` };
}

function updateMood(val) {
    val = Number(val);
    currentMoodValue = val;

    let label = "Neutral";
    if (val <= 20) label = "Burdened";
    else if (val <= 40) label = "Uneasy";
    else if (val <= 60) label = "Neutral";
    else if (val <= 80) label = "Content";
    else label = "Radiant";
    
    moodLabel.innerText = label;
    const colors = interpolateColor(val);
    orb1.style.background = `radial-gradient(circle, ${colors.c1} 0%, rgba(0,0,0,0) 70%)`;
    orb2.style.background = `radial-gradient(circle, ${colors.c2} 0%, rgba(0,0,0,0) 70%)`;
    sliderFill.style.width = val + '%';
    sliderFill.style.background = colors.c2;
}

// --- TOAST ---
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('span').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- NAV / VIEW SWITCHING ---
function setNavActive(target) {
    const navLog = document.getElementById('nav-log');
    const navJournal = document.getElementById('nav-journal');
    const navHistory = document.getElementById('nav-history');

    [navLog, navJournal, navHistory].forEach(btn => {
        btn.classList.remove('nav-item-active');
        if (!btn.classList.contains('nav-item-inactive')) {
            btn.classList.add('nav-item-inactive');
        }
    });

    const activeBtn = document.getElementById(target);
    activeBtn.classList.remove('nav-item-inactive');
    activeBtn.classList.add('nav-item-active');
}

function commitMood() {
    isMoodLogged = true;
    document.getElementById('journal-lock').classList.add('hidden');
    switchView('journal');
}

function switchView(view) {
    const logView = document.getElementById('view-log');
    const journalView = document.getElementById('view-journal');
    const historyView = document.getElementById('view-history');

    if (view === 'journal' && !isMoodLogged) {
        showToast("Please log your mood first.");
        const logCard = document.querySelector('#view-log .glass-panel');
        if (logCard) {
            logCard.style.transform = "translateX(-5px)";
            setTimeout(() => logCard.style.transform = "translateX(5px)", 100);
            setTimeout(() => logCard.style.transform = "translateX(0)", 200);
        }
        return;
    }

    logView.classList.add('hidden');
    journalView.classList.add('hidden');
    historyView.classList.add('hidden');

    if (view === 'log') {
        logView.classList.remove('hidden');
        logView.classList.add('animate-enter');
        setNavActive('nav-log');
    } else if (view === 'journal') {
        journalView.classList.remove('hidden');
        journalView.classList.add('animate-enter');
        setNavActive('nav-journal');
    } else if (view === 'history') {
        historyView.classList.remove('hidden');
        historyView.classList.add('animate-enter');
        setNavActive('nav-history');
        // Refresh data when entering history
        fetchEntries().then(() => {
            const lastEntry = allEntries[0]; // entries are sorted by server
            if(lastEntry) {
                 renderHistoryList(allEntries, lastEntry.timestamp);
                 showHistoryEntry(lastEntry);
            } else {
                 renderHistoryList([], null);
                 showHistoryEntry(null);
            }
        });
    }
}

function backToCalendar() {
    switchView('log');
}

// --- CALENDAR ---
function changeMonth(delta) {
    currentMonthDate.setMonth(currentMonthDate.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month-label');
    if (!grid || !monthLabel) return;

    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    monthLabel.innerText = currentMonthDate.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
    });

    // Use fetched entries
    const markers = {};
    allEntries.forEach(e => { markers[e.date] = true; });

    grid.innerHTML = '';

    for (let i = 0; i < startWeekday; i++) {
        const cell = document.createElement('div');
        cell.className = 'h-9 rounded-xl';
        grid.appendChild(cell);
    }

    const todayKey = new Date().toISOString().slice(0, 10);

    for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'h-9 rounded-xl text-xs flex flex-col items-center justify-center bg-white/0 text-white/70 hover:bg-white/10 transition relative';

        if (dateKey === todayKey) {
            cell.className += ' border border-white/30 bg-white/5';
        }
        if (currentSelectedDate === dateKey) {
            cell.className += ' ring-1 ring-white/60';
        }

        cell.innerHTML = `<span>${d}</span>`;

        if (markers[dateKey]) {
            const dot = document.createElement('div');
            dot.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 absolute bottom-1';
            cell.appendChild(dot);
        }

        cell.addEventListener('click', () => {
            currentSelectedDate = dateKey;
            renderCalendar();
            renderEntriesForDate(dateKey);
        });

        grid.appendChild(cell);
    }
}

function formatDateNice(dateStr) {
    if(!dateStr) return "";
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatTime(isoStr) {
    if(!isoStr) return "";
    const dt = new Date(isoStr);
    return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function renderEntriesForDate(dateKey) {
    const list = document.getElementById('entries-list');
    const title = document.getElementById('entries-title');
    if (!list || !title) return;

    // Filter from global state
    const entries = allEntries
        .filter(e => e.date === dateKey)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    title.innerText = `Entries for ${formatDateNice(dateKey)}`;

    if (!entries.length) {
        list.innerHTML = `<p class="text-xs text-white/40">No entries for this day.</p>`;
        return;
    }

    list.innerHTML = '';
    entries.forEach(entry => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full text-left p-2 rounded-xl bg-white/0 hover:bg-white/5 transition flex flex-col gap-1';

        const previewText = entry.text.replace(/\s+/g, ' ');
        const shortText = previewText.length > 120 ? previewText.slice(0, 120) + '…' : previewText;

        item.innerHTML = `
            <div class="flex items-center justify-between text-[10px] text-white/40 mb-0.5">
                <span class="uppercase tracking-[0.16em]">${entry.moodLabel}</span>
                <span>${formatTime(entry.timestamp)}</span>
            </div>
            <p class="text-xs text-white/70 truncate">${shortText}</p>
        `;

        item.addEventListener('click', () => openHistory(entry.timestamp));
        list.appendChild(item);
    });
}

// --- HISTORY VIEW ---
function renderHistoryList(entries, selectedId) {
    const list = document.getElementById('history-list');
    if (!list) return;
    list.innerHTML = '';

    if (!entries.length) {
        list.innerHTML = `<p class="text-xs text-white/40">No entries yet.</p>`;
        return;
    }

    entries.forEach(entry => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = entry.timestamp === selectedId;
        btn.className =
            'w-full text-left rounded-2xl px-3 py-2 transition flex flex-col gap-1 border ' +
            (isActive
                ? 'bg-white/10 border-white/30'
                : 'bg-white/0 border-white/5 hover:bg-white/5');

        const previewText = entry.text.replace(/\s+/g, ' ');
        const shortText = previewText.length > 80 ? previewText.slice(0, 80) + '…' : previewText;

        btn.innerHTML = `
            <div class="flex items-center justify-between text-[10px] text-white/40 mb-0.5">
                <span class="uppercase tracking-[0.16em]">${entry.moodLabel}</span>
                <span>${formatTime(entry.timestamp)}</span>
            </div>
            <div class="text-xs text-white/70 truncate">${shortText}</div>
        `;
        btn.addEventListener('click', () => openHistory(entry.timestamp));
        list.appendChild(btn);
    });
}

function showHistoryEntry(entry) {
    const dateEl = document.getElementById('history-date-label');
    const moodEl = document.getElementById('history-mood-label');
    const affirmEl = document.getElementById('history-affirmation');
    const textEl = document.getElementById('history-text');

    if (!entry) {
         if (dateEl) dateEl.innerText = '';
         if (moodEl) moodEl.innerText = '';
         if (affirmEl) affirmEl.innerText = '';
         if (textEl) textEl.innerText = 'No entries yet.';
         return;
    }

    currentHistoryId = entry.timestamp;
    
    dateEl.innerText = formatDateNice(entry.date);
    moodEl.innerText = `Mood: ${entry.moodLabel} (${entry.moodValue}/100)`;
    affirmEl.innerText = entry.affirmation ? `"${entry.affirmation}"` : '';
    textEl.innerText = entry.text;
}

function openHistory(id) {
    if (!allEntries.length) {
        showToast("No history yet.");
        return;
    }

    let selected = null;
    if (id) {
        selected = allEntries.find(e => e.timestamp === id);
    }
    if (!selected) {
        selected = allEntries[0];
    }

    switchView('history');
    renderHistoryList(allEntries, selected.timestamp);
    showHistoryEntry(selected);
}

// --- DELETE LOGIC ---
async function deleteCurrentEntry() {
    if (!currentHistoryId) {
        showToast("No entry selected.");
        return;
    }

    await deleteEntryFromDB(currentHistoryId);
    await fetchEntries(); // reload data

    // update calendar dots
    renderCalendar();

    if (!allEntries.length) {
        showHistoryEntry(null);
        renderHistoryList([], null);
        showToast("Entry deleted.");
        return;
    }

    const next = allEntries[0];
    currentHistoryId = next.timestamp;
    renderHistoryList(allEntries, next.timestamp);
    showHistoryEntry(next);
    showToast("Entry deleted.");
}

function openDeleteConfirm() {
    if (!currentHistoryId || !allEntries.find(e => e.timestamp === currentHistoryId)) {
        showToast("No entry selected.");
        return;
    }
    const modal = document.getElementById('delete-modal-overlay');
    const content = document.getElementById('delete-modal-content');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    });
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal-overlay');
    const content = document.getElementById('delete-modal-content');
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function confirmDeleteEntry() {
    deleteCurrentEntry();
    closeDeleteModal();
}

// --- PROCESS ENTRY + AI ---
async function processAffirmation() {
    const textArea = document.getElementById('journal-text');
    const submitBtn = document.querySelector('button[onclick="processAffirmation()"]');
    const text = textArea.value.trim();

    if (text.length < 2) {
        showToast("Please write something first.");
        return;
    }

    // UX: Loading state
    const originalBtnText = submitBtn.innerText;
    submitBtn.innerText = "Generating Insight...";
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-50', 'cursor-not-allowed');

    try {
        const now = new Date();
        const dateKey = now.toISOString().slice(0, 10);

        const newEntry = await saveEntryToDB({
            date: dateKey,
            moodValue: currentMoodValue,
            moodLabel: moodLabel.innerText,
            text: text
        });

        // Add to local state immediately
        allEntries.unshift(newEntry);

        currentSelectedDate = dateKey;
        renderCalendar();
        renderEntriesForDate(dateKey);

        const modal = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        document.getElementById('affirmation-result').innerText = `"${newEntry.affirmation}"`;

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        });
    } catch (err) {
        showToast("Failed to save entry. Try again.");
    } finally {
        submitBtn.innerText = originalBtnText;
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function closeModal() {
    const modal = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('journal-text').value = "";
        switchView('log');

        document.getElementById('progress-ring').style.strokeDashoffset = "0";

        isMoodLogged = false;
        document.getElementById('journal-lock').classList.remove('hidden');
    }, 500);
}

// --- INIT ---
updateMood(50);
(async function init() {
    const todayKey = new Date().toISOString().slice(0, 10);
    currentSelectedDate = todayKey;
    
    // Load from DB
    await fetchEntries();

    renderCalendar();
    renderEntriesForDate(todayKey);
})();