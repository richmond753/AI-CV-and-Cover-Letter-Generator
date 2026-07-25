// CareerAI – Shared JS utilities
// Loaded on every page. Provides navigation helpers, a central authenticated
// fetch wrapper with global session-expiry handling, toast notifications,
// identity rendering, and an unsaved-changes guard.

const API_BASE = '';

function toggleNav() {
  const nav = document.getElementById('navMobile');
  if (nav) nav.classList.toggle('open');
}

// Toggle the dashboard sidebar on mobile (hamburger button).
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// Escape user/AI-supplied text before inserting it into innerHTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Storage helpers ─────────────────────────────────────────
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('careerai_user') || '{}'); }
  catch { return {}; }
}

function getAuthToken() {
  return localStorage.getItem('careerai_token') || '';
}

function getStoredProfile() {
  try { return JSON.parse(localStorage.getItem('careerai_profile') || '{}'); }
  catch { return {}; }
}

function setStoredProfile(profile) {
  const current = getStoredProfile();
  const next = {
    ...current,
    ...profile,
    cv: { ...(current.cv || {}), ...(profile.cv || {}) }
  };
  localStorage.setItem('careerai_profile', JSON.stringify(next));
  return next;
}

function getProfileName() {
  const profile = getStoredProfile();
  return profile.fullname || profile.name || getStoredUser().fullname || '';
}

// ── Auth / session ──────────────────────────────────────────
function requireAuth(redirectTo = 'login.html') {
  if (!getAuthToken()) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

function logout(redirectTo = '../index.html', { confirm: ask = true } = {}) {
  if (ask && !window.confirm('Log out of CareerAI? Unsaved form edits on this page will be lost.')) return;
  markUnsaved(false);
  ['careerai_token', 'careerai_user', 'careerai_profile', 'careerai_cv', 'careerai_cl', 'careerai_ats', 'careerai_downloaded']
    .forEach(key => localStorage.removeItem(key));
  window.location.href = redirectTo;
}

// Journey progress flags used by the dashboard checklist.
function markJourney(step) {
  try {
    const flags = JSON.parse(localStorage.getItem('careerai_journey') || '{}');
    flags[step] = true;
    localStorage.setItem('careerai_journey', JSON.stringify(flags));
    if (typeof maybeCelebrateJourney === 'function') maybeCelebrateJourney();
  } catch { /* ignore */ }
}
function getJourney() {
  try { return JSON.parse(localStorage.getItem('careerai_journey') || '{}'); }
  catch { return {}; }
}

// Called when the API reports the session is no longer valid (401).
let _sessionExpiredHandled = false;
function handleSessionExpired() {
  if (_sessionExpiredHandled) return;
  _sessionExpiredHandled = true;
  ['careerai_token', 'careerai_user'].forEach(key => localStorage.removeItem(key));
  const onLogin = /login\.html$/.test(window.location.pathname);
  if (!onLogin) {
    window.location.href = 'login.html?expired=1';
  }
}

// ── Central authenticated fetch ─────────────────────────────
// Returns { ok, status, data } for JSON endpoints. Automatically attaches the
// bearer token and, on a 401, clears the session and redirects to login.
// Throws a NetworkError when the request can't reach the server.
class NetworkError extends Error {
  constructor(message) { super(message); this.name = 'NetworkError'; }
}

async function apiFetch(path, options = {}) {
  const { method = 'GET', body, auth = true, raw = false, headers = {}, signal } = options;

  const finalHeaders = { ...headers };
  const isForm = (typeof FormData !== 'undefined') && body instanceof FormData;
  if (body !== undefined && !isForm && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = getAuthToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new NetworkError("Couldn't reach the server. Check your internet connection and try again.");
  }

  if (res.status === 401 && auth) {
    handleSessionExpired();
    return { ok: false, status: 401, data: { success: false, message: 'Your session has expired. Please log in again.' } };
  }

  if (raw) return { ok: res.ok, status: res.status, response: res };

  let data = {};
  try { data = await res.json(); } catch { data = {}; }

  if (res.status === 402 && data && data.message) {
    showToast(data.message, 'error', 7000);
    updateUsageMeter(data.usage);
  } else if (data && data.usage) {
    updateUsageMeter(data.usage);
  }

  if (res.status === 429 && data && data.message) {
    showToast(data.message, 'error', 6000);
  }

  return { ok: res.ok, status: res.status, data };
}

// Turn any thrown error into a user-facing message.
function describeError(err, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof NetworkError) return err.message;
  return (err && err.message) || fallback;
}

// ── Toast notifications ─────────────────────────────────────
function _toastContainer() {
  let el = document.getElementById('toastContainer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

// showToast(message, type, duration, action)
// `action` (optional): { label, onClick } renders an inline button (e.g. Undo)
// and extends the default lifetime so the user can react.
function showToast(message, type = 'info', duration, action = null) {
  const container = _toastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const text = document.createElement('span');
  text.className = 'toast-msg';
  text.textContent = message;
  toast.appendChild(text);

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  };

  if (action && action.label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { dismiss(); action.onClick && action.onClick(); });
    toast.appendChild(btn);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(dismiss, duration || (action ? 6000 : 4000));
}

// ── Staged progress for long operations ─────────────────────
// Cycles through messages inside an output element so a ~20s wait shows
// movement. Returns a stop() function.
function startStagedProgress(el, messages, intervalMs = 2500) {
  if (!el) return () => {};
  let i = 0;
  const render = () =>
    (el.innerHTML = `<p class="output-placeholder"><span class="loading-spinner"></span> ${escapeHtml(messages[i])}</p>`);
  el.setAttribute('aria-busy', 'true');
  render();
  const id = setInterval(() => {
    i = Math.min(i + 1, messages.length - 1);
    render();
  }, intervalMs);
  return () => { clearInterval(id); el.removeAttribute('aria-busy'); };
}

// ── Identity (sidebar user pill + greeting) ─────────────────
function setUserIdentity() {
  const name = getProfileName();
  const nameEl = document.getElementById('userName');
  const avatarEl = document.getElementById('userAvatar');
  if (name) {
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase();
  }
  const greetingEl = document.getElementById('greetingText');
  if (greetingEl && name) {
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    greetingEl.textContent = `${greet}, ${name.split(' ')[0]} 👋`;
  }
}

// ── Unsaved-changes guard ───────────────────────────────────
let _hasUnsaved = false;
function markUnsaved(value = true) { _hasUnsaved = value; }
window.addEventListener('beforeunload', (e) => {
  if (_hasUnsaved) { e.preventDefault(); e.returnValue = ''; }
});
// Don't warn when the user deliberately navigates via an in-app link/button.
document.addEventListener('click', (e) => {
  const link = e.target.closest && e.target.closest('a[href], .nav-item, [data-nav]');
  if (link) _hasUnsaved = false;
});

// ── Character counters for long text fields ─────────────────
function attachCharCounter(input, max) {
  if (!input || input.dataset.counterBound) return;
  input.dataset.counterBound = '1';
  const wrap = document.createElement('div');
  wrap.className = 'char-counter';
  wrap.setAttribute('aria-live', 'polite');
  input.insertAdjacentElement('afterend', wrap);
  const update = () => {
    const len = (input.value || '').length;
    wrap.textContent = max ? `${len.toLocaleString()} / ${max.toLocaleString()}` : `${len.toLocaleString()} characters`;
    wrap.classList.toggle('near-limit', max && len > max * 0.9);
    wrap.classList.toggle('over-limit', max && len > max);
  };
  input.addEventListener('input', update);
  update();
}

function wireCharCounters(map) {
  Object.entries(map).forEach(([id, max]) => {
    const el = document.getElementById(id);
    if (el) attachCharCounter(el, max);
  });
}

// ── Skip link + main landmark (a11y) ────────────────────────
function ensureSkipLink() {
  if (document.getElementById('skipToContent')) return;
  const main = document.querySelector('main') || document.querySelector('.main-content');
  if (!main) return;
  if (!main.id) main.id = 'main-content';
  const a = document.createElement('a');
  a.id = 'skipToContent';
  a.className = 'skip-link';
  a.href = `#${main.id}`;
  a.textContent = 'Skip to main content';
  document.body.prepend(a);
}

// ── Keyboard shortcuts help (? key) ─────────────────────────
function openShortcutsHelp() {
  let overlay = document.getElementById('shortcutsOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'shortcutsOverlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcutsTitle');
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2 id="shortcutsTitle">Keyboard shortcuts</h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <ul class="shortcut-list">
          <li><kbd>?</kbd> <span>Show this help</span></li>
          <li><kbd>Esc</kbd> <span>Close dialogs / cancel focus</span></li>
          <li><kbd>Ctrl</kbd> + <kbd>Enter</kbd> <span>Generate on tool pages</span></li>
          <li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> <span>Move between fields</span></li>
        </ul>
        <p class="modal-foot">Tip: edit AI output before downloading — your tweaks are kept locally.</p>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.modal-close')) closeShortcutsHelp();
    });
    document.body.appendChild(overlay);
  }
  overlay.hidden = false;
  overlay.querySelector('.modal-close')?.focus();
}

function closeShortcutsHelp() {
  const overlay = document.getElementById('shortcutsOverlay');
  if (overlay) overlay.hidden = true;
}

function showFailedOutput(el, message, onRetry) {
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state">
      <p class="empty-title">${escapeHtml(message || 'Something went wrong.')}</p>
      <p class="empty-sub">You can try again — your form inputs are still filled in.</p>
      ${onRetry ? '<button type="button" class="btn-mint" id="retryActionBtn">Try again</button>' : ''}
    </div>`;
  if (onRetry) {
    const btn = document.getElementById('retryActionBtn');
    if (btn) btn.addEventListener('click', onRetry);
  }
}

function printElementText(text, title = 'CareerAI document') {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) { showToast('Allow pop-ups to print.', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body{font-family:Georgia,serif;line-height:1.55;color:#111;max-width:720px;margin:32px auto;padding:0 20px;white-space:pre-wrap}
      @media print{body{margin:0}}
    </style></head><body>${escapeHtml(text || '')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}

// ── Bootstrapping shared chrome ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ensureSkipLink();
  initTheme();
  mountThemeToggle();
  if (document.body.classList.contains('dashboard-layout')) {
    mountUsageMeter();
    mountFeedbackWidget();
    maybeStartOnboarding();
  }
  watchOnlineStatus();
});

document.addEventListener('keydown', (e) => {
  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target?.isContentEditable) return;
    e.preventDefault();
    openShortcutsHelp();
  }
  if (e.key === 'Escape') closeShortcutsHelp();
});

// ── Theme (light / dark) ────────────────────────────────────
function getPreferredTheme() {
  const saved = localStorage.getItem('careerai_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('careerai_theme', theme);
}
function initTheme() { applyTheme(getPreferredTheme()); }
function toggleTheme() {
  const next = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
  applyTheme(next);
  showToast(next === 'light' ? 'Light mode on.' : 'Dark mode on.', 'info', 2000);
}
function mountThemeToggle() {
  if (document.getElementById('themeToggleBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'themeToggleBtn';
  btn.type = 'button';
  btn.className = 'theme-toggle';
  btn.setAttribute('aria-label', 'Toggle colour theme');
  btn.title = 'Toggle theme';
  btn.textContent = '◐';
  btn.addEventListener('click', toggleTheme);
  document.body.appendChild(btn);
}

// ── Usage meter (freemium visibility) ───────────────────────
function updateUsageMeter(usage) {
  if (!usage) return;
  const el = document.getElementById('usageMeter');
  if (!el) return;
  const rem = usage.remaining ?? Math.max(0, (usage.limit || 0) - (usage.used || 0));
  el.innerHTML = `<strong>${rem}</strong> AI credits left today <span class="usage-sub">${usage.used || 0}/${usage.limit || 0} used</span>`;
  el.classList.toggle('low', rem <= 3);
  el.hidden = false;
}
async function mountUsageMeter() {
  if (!getAuthToken() || document.getElementById('usageMeter')) return;
  const el = document.createElement('div');
  el.id = 'usageMeter';
  el.className = 'usage-meter';
  el.hidden = true;
  el.setAttribute('aria-live', 'polite');
  const header = document.querySelector('.page-header');
  if (header) header.appendChild(el);
  else document.querySelector('.main-content')?.prepend(el);
  try {
    const { data } = await apiFetch('/api/usage/me');
    if (data.success) updateUsageMeter(data.usage);
  } catch { /* optional */ }
}

// ── Feedback widget (customer satisfaction) ─────────────────
function mountFeedbackWidget() {
  if (document.getElementById('feedbackFab') || !getAuthToken()) return;
  const fab = document.createElement('button');
  fab.id = 'feedbackFab';
  fab.type = 'button';
  fab.className = 'feedback-fab';
  fab.setAttribute('aria-label', 'Send feedback');
  fab.textContent = '💬';
  fab.addEventListener('click', openFeedbackModal);
  document.body.appendChild(fab);
}
function openFeedbackModal() {
  let overlay = document.getElementById('feedbackOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'feedbackOverlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h2>How is CareerAI working for you?</h2>
          <button type="button" class="modal-close" aria-label="Close">&times;</button>
        </div>
        <p class="modal-foot" style="margin-top:0;margin-bottom:12px;">Your rating helps us prioritise what to improve next.</p>
        <div class="rating-row" id="ratingRow">
          ${[1,2,3,4,5].map(n => `<button type="button" class="rating-star" data-r="${n}" aria-label="${n} stars">★</button>`).join('')}
        </div>
        <textarea class="form-control" id="feedbackMsg" rows="3" placeholder="Optional: what should we improve?" maxlength="1000" style="margin-top:12px;"></textarea>
        <button type="button" class="btn-mint btn-full" id="feedbackSend" style="margin-top:12px;">Send feedback</button>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.modal-close')) overlay.hidden = true;
    });
    document.body.appendChild(overlay);
    let selected = 0;
    overlay.querySelectorAll('.rating-star').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = Number(btn.dataset.r);
        overlay.querySelectorAll('.rating-star').forEach(s => {
          s.classList.toggle('on', Number(s.dataset.r) <= selected);
        });
      });
    });
    overlay.querySelector('#feedbackSend').addEventListener('click', async () => {
      if (!selected) { showToast('Please pick a star rating.', 'error'); return; }
      const message = document.getElementById('feedbackMsg').value.trim();
      const page = location.pathname.split('/').pop();
      try {
        const { data } = await apiFetch('/api/usage/feedback', { method: 'POST', body: { rating: selected, message, page } });
        if (data.success) {
          overlay.hidden = true;
          showToast(data.message || 'Thanks for the feedback!', 'success');
        } else showToast(data.message || 'Could not send feedback.', 'error');
      } catch (err) {
        showToast(describeError(err), 'error');
      }
    });
  }
  overlay.hidden = false;
}

// ── First-run onboarding ────────────────────────────────────
function maybeStartOnboarding() {
  if (!getAuthToken()) return;
  if (localStorage.getItem('careerai_onboarded')) return;
  if (!/dashboard\.html$/.test(location.pathname)) return;
  setTimeout(() => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'onboardOverlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header"><h2>Welcome to CareerAI 👋</h2></div>
        <ol class="onboard-steps">
          <li><strong>Build your CV</strong> — fill your details once, generate a polished resume.</li>
          <li><strong>Write a cover letter</strong> — paste a job post and tailor your pitch.</li>
          <li><strong>Check ATS score</strong> — upload or paste your CV against a JD.</li>
          <li><strong>Prep interviews</strong> — practice with AI questions and answers.</li>
        </ol>
        <p class="modal-foot">You have a daily free AI credit allowance. Press <kbd>?</kbd> anytime for shortcuts.</p>
        <button type="button" class="btn-mint btn-full" id="onboardGo">Got it — start with my CV</button>
        <button type="button" class="btn-outline btn-full" id="onboardSkip" style="margin-top:8px;">Skip for now</button>
      </div>`;
    document.body.appendChild(overlay);
    const done = (goCv) => {
      localStorage.setItem('careerai_onboarded', '1');
      overlay.remove();
      if (goCv) location.href = 'cv-builder.html';
    };
    overlay.querySelector('#onboardGo').onclick = () => done(true);
    overlay.querySelector('#onboardSkip').onclick = () => done(false);
  }, 600);
}

function watchOnlineStatus() {
  window.addEventListener('offline', () => showToast("You're offline. Changes won't sync until you're back online.", 'error', 6000));
  window.addEventListener('online', () => showToast("You're back online.", 'success', 2500));
}

// Celebrate completing the full journey once.
function maybeCelebrateJourney() {
  const j = getJourney();
  const complete = j.account && j.cv && j.cl && j.ats && j.interview && j.download;
  if (complete && !localStorage.getItem('careerai_celebrated')) {
    localStorage.setItem('careerai_celebrated', '1');
    showToast("You've completed the CareerAI journey — you're application-ready! 🎉", 'success', 7000);
  }
}

// ── Landing-page niceties ───────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', event => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

window.addEventListener('scroll', () => {
  const nav = document.querySelector('.navbar');
  if (nav) nav.style.boxShadow = window.scrollY > 10 ? '0 4px 24px rgba(0,0,0,0.4)' : 'none';
});
