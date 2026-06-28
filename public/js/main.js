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

function logout(redirectTo = '../index.html') {
  ['careerai_token', 'careerai_user', 'careerai_profile', 'careerai_cv', 'careerai_cl']
    .forEach(key => localStorage.removeItem(key));
  window.location.href = redirectTo;
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
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (auth) {
    const token = getAuthToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    // Let deliberate cancellations propagate so callers can treat them as a
    // cancel rather than a failure.
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
