// ============================================================
// BigQuery Release Notes Hub — Main JavaScript
// ============================================================

const API_URL = '/api/release-notes';

// State
let allUpdates = [];
let activeUpdateId = null;
let activeFilter = 'all';
let searchQuery = '';
let selectedText = '';

// DOM refs
const refreshBtn = document.getElementById('refresh-btn');
const updatesList = document.getElementById('updates-list');
const resultsCount = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const errorCloseBtn = document.getElementById('error-close-btn');
const filterChips = document.querySelectorAll('.filter-chip');

// Share panel refs
const emptyState = document.getElementById('empty-state');
const shareCard = document.getElementById('share-card');
const shareTypeBadge = document.getElementById('share-type-badge');
const shareDate = document.getElementById('share-date');
const selectedContentPreview = document.getElementById('selected-content-preview');
const tweetTextarea = document.getElementById('tweet-textarea');
const tweetBtn = document.getElementById('tweet-btn');
const resetTweetBtn = document.getElementById('reset-tweet-btn');
const charCountText = document.getElementById('char-count-text');
const originalLink = document.getElementById('original-link');
const selectionTip = document.getElementById('selection-tip');
const insertSelectionBtn = document.getElementById('insert-selection-btn');

// ============================================================
// Utility helpers
// ============================================================

function getBadgeClass(type) {
    if (!type) return 'update';
    const t = type.toLowerCase();
    if (t === 'feature') return 'feature';
    if (t === 'announcement') return 'announcement';
    if (t === 'issue' || t === 'fix' || t === 'bug') return 'issue';
    if (t === 'deprecation' || t === 'deprecated' || t === 'breaking') return 'deprecation';
    return 'update';
}

function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen).trimEnd() + '...';
}

function formatDate(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return isoString;
    }
}

// ============================================================
// API & Data Loading
// ============================================================

async function loadReleaseNotes(forceRefresh = false) {
    setLoadingState(true);
    hideError();

    try {
        const url = forceRefresh ? `${API_URL}?refresh=true` : API_URL;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Unknown server error');
        }

        if (data.warning) {
            showError(data.warning, 'warning');
        }

        allUpdates = data.updates || [];
        renderUpdates();

    } catch (err) {
        showError(`Failed to load release notes: ${err.message}`);
        if (allUpdates.length === 0) {
            updatesList.innerHTML = `
                <div style="text-align:center;padding:3rem;color:var(--text-muted);">
                    <p>Could not load updates. Try refreshing.</p>
                </div>`;
        }
    } finally {
        setLoadingState(false);
    }
}

// ============================================================
// Render
// ============================================================

function getFilteredUpdates() {
    return allUpdates.filter(update => {
        const matchesType = activeFilter === 'all'
            || getBadgeClass(update.type) === activeFilter;

        const q = searchQuery.toLowerCase();
        const matchesSearch = !q
            || update.date.toLowerCase().includes(q)
            || update.type.toLowerCase().includes(q)
            || (update.content_text || '').toLowerCase().includes(q);

        return matchesType && matchesSearch;
    });
}

function renderUpdates() {
    const filtered = getFilteredUpdates();
    resultsCount.textContent = `${filtered.length} update${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        updatesList.innerHTML = `
            <div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);">
                <p style="font-size:1.5rem;margin-bottom:.5rem;">🔍</p>
                <p>No updates match your current filter or search.</p>
            </div>`;
        return;
    }

    updatesList.innerHTML = '';
    filtered.forEach(update => {
        const card = createUpdateCard(update);
        updatesList.appendChild(card);
    });
}

function createUpdateCard(update) {
    const badgeClass = getBadgeClass(update.type);
    const card = document.createElement('article');
    card.className = `update-card ${badgeClass}${update.id === activeUpdateId ? ' active' : ''}`;
    card.dataset.id = update.id;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', update.id === activeUpdateId ? 'true' : 'false');
    card.setAttribute('aria-label', `${update.type} update from ${update.date}`);

    card.innerHTML = `
        <div class="card-header">
            <span class="date-label">${update.date}</span>
            <span class="badge ${badgeClass}">${update.type}</span>
        </div>
        <div class="card-content">${update.content_html}</div>
        <div class="card-actions">
            <span class="select-indicator">
                <span class="active-dot"></span>
                ${update.id === activeUpdateId ? 'Selected' : 'Click to select & tweet'}
            </span>
        </div>`;

    card.addEventListener('click', () => selectUpdate(update));
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectUpdate(update);
        }
    });

    return card;
}

// ============================================================
// Share Panel
// ============================================================

function selectUpdate(update) {
    activeUpdateId = update.id;

    // Highlight active card
    document.querySelectorAll('.update-card').forEach(card => {
        const isActive = card.dataset.id === update.id;
        card.classList.toggle('active', isActive);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const indicator = card.querySelector('.select-indicator');
        if (indicator) {
            indicator.innerHTML = `<span class="active-dot"></span>${isActive ? 'Selected' : 'Click to select & tweet'}`;
        }
    });

    // Show share panel
    emptyState.classList.add('hidden');
    shareCard.classList.remove('hidden');

    // Populate share panel
    const badgeClass = getBadgeClass(update.type);
    shareTypeBadge.textContent = update.type;
    shareTypeBadge.className = `badge ${badgeClass}`;
    shareDate.textContent = update.date;
    originalLink.href = update.link || '#';

    const plainText = stripHtml(update.content_html);
    selectedContentPreview.textContent = truncate(plainText, 150);

    // Auto-populate tweet draft
    composeTweetDraft(update);

    // Scroll to top of right panel on mobile
    if (window.innerWidth <= 1024) {
        document.querySelector('.share-column').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function composeTweetDraft(update) {
    const plainText = stripHtml(update.content_html);
    const date = update.date;
    const type = update.type;
    const link = update.link || 'https://cloud.google.com/bigquery/docs/release-notes';

    // Build a compact tweet
    const hashtags = '#GoogleCloud #BigQuery';
    const prefix = `📦 BigQuery ${type} (${date}):\n`;
    const maxBodyLen = 280 - prefix.length - link.length - hashtags.length - 5;
    const body = truncate(plainText, maxBodyLen);

    const tweet = `${prefix}${body}\n\n${link}\n${hashtags}`;
    tweetTextarea.value = tweet.substring(0, 280);
    updateCharCounter();
}

// ============================================================
// Tweet Composer
// ============================================================

function updateCharCounter() {
    const remaining = 280 - tweetTextarea.value.length;
    charCountText.textContent = remaining;

    const circle = document.querySelector('.progress-ring__circle');
    const radius = 8;
    const circumference = 2 * Math.PI * radius;
    const filled = tweetTextarea.value.length / 280;
    const dashoffset = circumference * (1 - filled);
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${dashoffset}`;

    // Change color based on remaining
    if (remaining < 0) {
        circle.style.stroke = 'var(--badge-issue)';
        charCountText.style.color = 'var(--badge-issue)';
    } else if (remaining < 20) {
        circle.style.stroke = 'var(--badge-deprecation)';
        charCountText.style.color = 'var(--badge-deprecation)';
    } else {
        circle.style.stroke = 'var(--twitter-color)';
        charCountText.style.color = 'var(--text-secondary)';
    }
}

tweetTextarea.addEventListener('input', updateCharCounter);

tweetBtn.addEventListener('click', () => {
    const text = tweetTextarea.value.trim();
    if (!text) return;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
});

resetTweetBtn.addEventListener('click', () => {
    if (activeUpdateId) {
        const update = allUpdates.find(u => u.id === activeUpdateId);
        if (update) composeTweetDraft(update);
    }
});

// ============================================================
// Text Selection → Insert into Tweet
// ============================================================

document.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const sel = selection.toString().trim();
    if (sel.length > 0 && activeUpdateId) {
        selectedText = sel;
        selectionTip.classList.remove('hidden');
    } else {
        selectionTip.classList.add('hidden');
    }
});

insertSelectionBtn.addEventListener('click', () => {
    if (!selectedText) return;

    const currentVal = tweetTextarea.value;
    const truncatedSel = selectedText.substring(0, 200);

    // Replace or prepend
    tweetTextarea.value = truncatedSel.length < 180
        ? truncatedSel
        : truncatedSel.substring(0, 177) + '...';

    // Append link and hashtags if activeUpdate exists
    if (activeUpdateId) {
        const update = allUpdates.find(u => u.id === activeUpdateId);
        if (update) {
            const link = update.link || 'https://cloud.google.com/bigquery/docs/release-notes';
            const appendix = `\n\n${link}\n#GoogleCloud #BigQuery`;
            const combined = (tweetTextarea.value + appendix).substring(0, 280);
            tweetTextarea.value = combined;
        }
    }

    updateCharCounter();
    selectionTip.classList.add('hidden');
    selectedText = '';
});

// ============================================================
// Filters & Search
// ============================================================

filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeFilter = chip.dataset.type;
        renderUpdates();
    });
});

let searchDebounce;
searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        renderUpdates();
    }, 250);
});

// ============================================================
// Refresh Button
// ============================================================

refreshBtn.addEventListener('click', () => {
    loadReleaseNotes(true);
});

// ============================================================
// UI State Helpers
// ============================================================

function setLoadingState(isLoading) {
    if (isLoading) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        updatesList.innerHTML = `
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>`;
        resultsCount.textContent = 'Loading updates...';
    } else {
        refreshBtn.classList.remove('loading');
        refreshBtn.disabled = false;
    }
}

function showError(msg, type = 'error') {
    errorText.textContent = msg;
    errorMessage.classList.remove('hidden');
    if (type === 'warning') {
        errorMessage.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        errorMessage.style.background = 'rgba(245, 158, 11, 0.1)';
        errorMessage.style.color = '#fcd34d';
    }
}

function hideError() {
    errorMessage.classList.add('hidden');
    errorMessage.style.removeProperty('border-color');
    errorMessage.style.removeProperty('background');
    errorMessage.style.removeProperty('color');
}

errorCloseBtn.addEventListener('click', hideError);

// ============================================================
// Init
// ============================================================
loadReleaseNotes();
