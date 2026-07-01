// ===== SHARED FRONTEND UTILITIES =====

const API = '/api';

// ===== AUTH =====
const Auth = {
  getToken: () => localStorage.getItem('blog_token'),
  getUser: () => {
    const u = localStorage.getItem('blog_user');
    return u ? JSON.parse(u) : null;
  },
  setSession: (token, user) => {
    localStorage.setItem('blog_token', token);
    localStorage.setItem('blog_user', JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem('blog_token');
    localStorage.removeItem('blog_user');
  },
  isLoggedIn: () => !!localStorage.getItem('blog_token'),
  logout: () => {
    Auth.clear();
    window.location.href = '/';
  }
};

// ===== API FETCH =====
async function apiFetch(path, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ===== FORMAT DATE =====
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

// ===== AVATAR INITIALS =====
function getInitials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ===== AVATAR HTML =====
function avatarHTML(username, size = 36) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:var(--gradient-hero);display:flex;align-items:center;justify-content:center;font-size:${size * 0.35}px;font-weight:700;color:white;flex-shrink:0;">${getInitials(username)}</div>`;
}

// ===== RENDER NAVBAR =====
function renderNavbar(activePage = '') {
  const user = Auth.getUser();
  const isLoggedIn = Auth.isLoggedIn();

  const navbarEl = document.getElementById('navbar');
  if (!navbarEl) return;

  navbarEl.innerHTML = `
    <a href="/" class="navbar-brand">
      <div class="logo-icon">✍️</div>
      <span>Inkwell</span>
    </a>
    <nav class="navbar-nav">
      <a href="/" class="nav-link ${activePage === 'home' ? 'active' : ''}">Home</a>
      ${isLoggedIn ? `<a href="/dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>` : ''}
    </nav>
    <div class="navbar-actions">
      ${isLoggedIn ? `
        <a href="/create.html" class="btn btn-primary btn-sm">✏️ Write</a>
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.8rem;background:var(--bg-glass);border:1px solid var(--border);border-radius:var(--radius-full);font-size:0.85rem;font-weight:500;">
          ${avatarHTML(user?.username, 24)}
          <span>${user?.username}</span>
        </div>
        <button onclick="Auth.logout()" class="btn btn-ghost btn-sm">Sign out</button>
      ` : `
        <a href="/login.html" class="btn btn-ghost btn-sm">Sign in</a>
        <a href="/register.html" class="btn btn-primary btn-sm">Get started</a>
      `}
    </div>
  `;
}

// ===== POST CARD HTML =====
function postCardHTML(post) {
  const coverEl = post.cover_image
    ? `<img src="${post.cover_image}" class="post-card-cover" alt="${escapeHtml(post.title)}" onerror="this.parentElement.innerHTML=defaultCover()">`
    : `<div class="post-card-cover-placeholder">${randomEmoji()}</div>`;

  return `
    <a href="/post.html?slug=${post.slug}" class="card post-card">
      ${coverEl}
      <div class="post-card-body">
        <div class="post-card-meta">
          <div class="author-avatar">${getInitials(post.author_name)}</div>
          <span>${escapeHtml(post.author_name)}</span>
          <span>·</span>
          <span>${timeAgo(post.created_at)}</span>
        </div>
        <div class="post-card-title">${escapeHtml(post.title)}</div>
        <div class="post-card-excerpt">${escapeHtml(post.excerpt)}</div>
        <div class="post-card-footer">
          <div class="comment-badge">💬 ${post.comment_count || 0} comments</div>
          <div class="badge badge-primary">Read more →</div>
        </div>
      </div>
    </a>
  `;
}

function defaultCover() {
  return `<div class="post-card-cover-placeholder">${randomEmoji()}</div>`;
}

const EMOJIS = ['📝', '🌟', '💡', '🚀', '🎨', '🔥', '💻', '🌈', '⚡', '🎯', '🧠', '📖'];
function randomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

// ===== ESCAPE HTML =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ===== SHOW/HIDE ALERT =====
function showAlert(elId, msg, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function hideAlert(elId) {
  const el = document.getElementById(elId);
  if (el) el.className = 'alert';
}

// ===== SET BUTTON LOADING =====
function setLoading(btnId, loading, text = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._originalText = btn.textContent;
    btn.textContent = text || 'Loading...';
  } else {
    btn.textContent = btn._originalText || text;
  }
}
