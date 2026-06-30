/* ===================================================
   TaskFlow — Application Logic
   app.js
   =================================================== */

'use strict';

// ─── SVG Gradient for progress ring ─────────────────
const svgDefs = `<svg width="0" height="0" style="position:absolute">
  <defs>
    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`;
document.body.insertAdjacentHTML('afterbegin', svgDefs);

// ─── Utilities ───────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target - today) / 86400000);
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, state: 'overdue' };
  if (diff === 0) return { label: 'Due today', state: 'due-today' };
  if (diff === 1) return { label: 'Due tomorrow', state: '' };
  if (diff <= 7) return { label: `${diff}d left`, state: '' };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), state: '' };
}

function formatDateInput(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Toast System ────────────────────────────────────
const Toasts = {
  container: null,
  init() { this.container = $('toast-container'); },
  show(msg, type = 'info', action = null, onAction = null, duration = 3500) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-body">${escapeHtml(msg)}</span>
      ${action ? `<button class="toast-action" id="toast-action-btn">${escapeHtml(action)}</button>` : ''}
    `;
    this.container.appendChild(t);
    if (action && onAction) {
      t.querySelector('#toast-action-btn').addEventListener('click', () => {
        onAction();
        this._dismiss(t);
      });
    }
    const timer = setTimeout(() => this._dismiss(t), duration);
    t.addEventListener('click', () => { clearTimeout(timer); this._dismiss(t); });
    return t;
  },
  _dismiss(t) {
    if (!t.parentNode) return;
    t.classList.add('exit');
    setTimeout(() => t.remove(), 260);
  }
};

// ─── Confetti ────────────────────────────────────────
const Confetti = {
  canvas: null, ctx: null, particles: [], running: false,
  init() {
    this.canvas = $('confetti-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  },
  burst() {
    const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.7) * 14,
        size: Math.random() * 8 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8
      });
    }
    if (!this.running) this._loop();
  },
  _loop() {
    this.running = true;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles = this.particles.filter(p => p.alpha > 0.01);
    this.particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.3; p.alpha -= 0.015;
      p.rotation += p.rotSpeed;
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation * Math.PI / 180);
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    });
    if (this.particles.length) requestAnimationFrame(() => this._loop());
    else { this.running = false; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  }
};

// ─── Storage ─────────────────────────────────────────
const Store = {
  _get(key, def = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
  getUsers() { return this._get('tf_users', {}); },
  saveUsers(u) { this._set('tf_users', u); },
  getTasks(userId) { return this._get(`tf_tasks_${userId}`, []); },
  saveTasks(userId, tasks) { this._set(`tf_tasks_${userId}`, tasks); },
  getProjects(userId) { return this._get(`tf_projects_${userId}`, []); },
  saveProjects(userId, projects) { this._set(`tf_projects_${userId}`, projects); },
  getSession() { return this._get('tf_session', null); },
  saveSession(s) { this._set('tf_session', s); },
  clearSession() { localStorage.removeItem('tf_session'); },
  getTheme() { return this._get('tf_theme', 'dark'); },
  saveTheme(t) { this._set('tf_theme', t); }
};

// ─── Auth Manager ────────────────────────────────────
const Auth = {
  currentUser: null,

  async init() {
    // Seed demo account
    const users = Store.getUsers();
    if (!users['demo@taskflow.app']) {
      const hash = await hashPassword('demo1234');
      users['demo@taskflow.app'] = { id: uid(), name: 'Demo User', email: 'demo@taskflow.app', passwordHash: hash };
      Store.saveUsers(users);
      // Seed demo tasks
      const demoId = users['demo@taskflow.app'].id;
      this._seedDemoData(demoId);
    }

    const session = Store.getSession();
    if (session) {
      const users = Store.getUsers();
      if (users[session.email]) {
        this.currentUser = users[session.email];
        return true;
      }
    }
    return false;
  },

  _seedDemoData(userId) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const projects = [
      { id: 'p1', name: 'Website Redesign', desc: 'Complete overhaul of the company website', color: '#6366f1', createdAt: new Date().toISOString() },
      { id: 'p2', name: 'Mobile App', desc: 'Build the new mobile application', color: '#10b981', createdAt: new Date().toISOString() },
    ];
    Store.saveProjects(userId, projects);

    const tasks = [
      { id: uid(), title: 'Design landing page mockups', desc: 'Create high-fidelity mockups for the new landing page using Figma', priority: 'high', status: 'done', dueDate: yesterday, tags: ['design', 'figma'], projectId: 'p1', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: uid(), title: 'Set up CI/CD pipeline', desc: 'Configure GitHub Actions for automated testing and deployment', priority: 'critical', status: 'inprogress', dueDate: today, tags: ['devops'], projectId: 'p2', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: uid(), title: 'Write API documentation', desc: 'Document all REST endpoints using OpenAPI/Swagger spec', priority: 'medium', status: 'review', dueDate: tomorrow, tags: ['docs', 'api'], projectId: 'p1', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: uid(), title: 'Fix authentication bug', desc: 'Resolve the issue with OAuth token refresh failing silently', priority: 'critical', status: 'todo', dueDate: yesterday, tags: ['bug', 'auth'], projectId: 'p2', createdAt: new Date(Date.now() - 86400000).toISOString() },
      { id: uid(), title: 'Implement dark mode', desc: 'Add dark/light theme toggle across all app screens', priority: 'low', status: 'todo', dueDate: nextWeek, tags: ['ui', 'feature'], projectId: 'p1', createdAt: new Date().toISOString() },
      { id: uid(), title: 'Performance audit', desc: 'Run Lighthouse audits and improve Core Web Vitals scores', priority: 'medium', status: 'todo', dueDate: nextWeek, tags: ['performance'], projectId: 'p2', createdAt: new Date().toISOString() },
      { id: uid(), title: 'Update dependencies', desc: 'Bump all npm packages to latest stable versions', priority: 'low', status: 'done', dueDate: yesterday, tags: ['maintenance'], projectId: null, createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
    ];
    Store.saveTasks(userId, tasks);
  },

  async login(email, password) {
    const users = Store.getUsers();
    const user = users[email.toLowerCase()];
    if (!user) throw new Error('No account found with that email.');
    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) throw new Error('Incorrect password.');
    this.currentUser = user;
    Store.saveSession({ email: email.toLowerCase(), id: user.id });
    return user;
  },

  async signup(name, email, password) {
    const users = Store.getUsers();
    if (users[email.toLowerCase()]) throw new Error('An account with this email already exists.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    const hash = await hashPassword(password);
    const user = { id: uid(), name: name.trim(), email: email.toLowerCase(), passwordHash: hash };
    users[email.toLowerCase()] = user;
    Store.saveUsers(users);
    this.currentUser = user;
    Store.saveSession({ email: email.toLowerCase(), id: user.id });
    return user;
  },

  logout() {
    this.currentUser = null;
    Store.clearSession();
  }
};

// ─── Task Manager ────────────────────────────────────
const Tasks = {
  get userId() { return Auth.currentUser?.id; },

  getAll() { return Store.getTasks(this.userId); },

  save(tasks) {
    Store.saveTasks(this.userId, tasks);
    BroadcastSync.notify('tasks_updated');
  },

  create(data) {
    const tasks = this.getAll();
    const task = {
      id: uid(),
      title: data.title.trim(),
      desc: (data.desc || '').trim(),
      priority: data.priority || 'medium',
      status: data.status || 'todo',
      dueDate: data.dueDate || null,
      tags: (data.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      projectId: data.projectId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    tasks.unshift(task);
    this.save(tasks);
    return task;
  },

  update(id, data) {
    const tasks = this.getAll();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    tasks[idx] = { ...tasks[idx], ...data, updatedAt: new Date().toISOString() };
    this.save(tasks);
    return tasks[idx];
  },

  delete(id) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    const updated = tasks.filter(t => t.id !== id);
    this.save(updated);
    return task;
  },

  toggleDone(id) {
    const tasks = this.getAll();
    const task = tasks.find(t => t.id === id);
    if (!task) return null;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    return this.update(id, { status: newStatus });
  },

  getStats() {
    const tasks = this.getAll();
    const today = new Date().toISOString().split('T')[0];
    return {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'done').length,
      todo: tasks.filter(t => t.status === 'todo').length,
      inprogress: tasks.filter(t => t.status === 'inprogress').length,
      review: tasks.filter(t => t.status === 'review').length,
      overdue: tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length,
      dueToday: tasks.filter(t => t.status !== 'done' && t.dueDate === today).length,
      critical: tasks.filter(t => t.priority === 'critical').length,
      high: tasks.filter(t => t.priority === 'high').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      low: tasks.filter(t => t.priority === 'low').length,
    };
  },

  filter(filters = {}, searchQuery = '') {
    let tasks = this.getAll();
    if (filters.status && filters.status !== 'all') {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.desc || '').toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }
    return tasks;
  },

  sort(tasks, sortBy = 'created-desc') {
    const copy = [...tasks];
    const pMap = { critical: 4, high: 3, medium: 2, low: 1 };
    switch (sortBy) {
      case 'created-asc': return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'created-desc': return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      case 'due-asc': return copy.sort((a, b) => (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : -1);
      case 'due-desc': return copy.sort((a, b) => (a.dueDate || '') < (b.dueDate || '') ? 1 : -1);
      case 'priority-desc': return copy.sort((a, b) => (pMap[b.priority] || 0) - (pMap[a.priority] || 0));
      default: return copy;
    }
  }
};

// ─── Project Manager ─────────────────────────────────
const Projects = {
  get userId() { return Auth.currentUser?.id; },
  getAll() { return Store.getProjects(this.userId); },
  save(projects) { Store.saveProjects(this.userId, projects); BroadcastSync.notify('projects_updated'); },
  create(data) {
    const projects = this.getAll();
    const project = { id: uid(), name: data.name.trim(), desc: (data.desc || '').trim(), color: data.color || '#6366f1', createdAt: new Date().toISOString() };
    projects.unshift(project);
    this.save(projects);
    return project;
  },
  update(id, data) {
    const projects = this.getAll();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    projects[idx] = { ...projects[idx], ...data };
    this.save(projects);
    return projects[idx];
  },
  delete(id) {
    const projects = this.getAll();
    this.save(projects.filter(p => p.id !== id));
    // Remove project from tasks
    const tasks = Tasks.getAll().map(t => t.projectId === id ? { ...t, projectId: null } : t);
    Tasks.save(tasks);
  },
  getById(id) { return this.getAll().find(p => p.id === id) || null; }
};

// ─── BroadcastChannel Real-time Sync ─────────────────
const BroadcastSync = {
  channel: null,
  init() {
    try {
      this.channel = new BroadcastChannel('taskflow_sync');
      this.channel.onmessage = (e) => {
        if (e.data?.userId === Auth.currentUser?.id) {
          UI.refresh();
        }
      };
    } catch { /* BroadcastChannel not supported */ }
  },
  notify(type) {
    try {
      this.channel?.postMessage({ type, userId: Auth.currentUser?.id, ts: Date.now() });
    } catch {}
  }
};

// ─── Router ──────────────────────────────────────────
const Router = {
  currentPage: 'dashboard',
  pages: ['dashboard', 'tasks', 'board', 'projects'],

  init() {
    window.addEventListener('hashchange', () => this.navigate());
    this.navigate();
  },

  navigate(page) {
    const hash = (page || window.location.hash.replace('#', '') || 'dashboard');
    const target = this.pages.includes(hash) ? hash : 'dashboard';
    if (target !== this.currentPage) {
      this.currentPage = target;
      window.location.hash = target;
    } else {
      this.currentPage = target;
    }
    this._activate(target);
  },

  _activate(page) {
    // Pages
    this.pages.forEach(p => {
      const el = $(`page-${p}`);
      if (el) el.classList.toggle('hidden', p !== page);
      if (el) el.classList.toggle('active', p === page);
    });
    // Sidebar nav
    $$('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    // Mobile nav
    $$('.mobile-nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    // Refresh page data
    if (page === 'dashboard') UI.renderDashboard();
    if (page === 'tasks') UI.renderTasksList();
    if (page === 'board') UI.renderKanban();
    if (page === 'projects') UI.renderProjects();

    // Close sidebar on mobile
    if (window.innerWidth < 1024) UI.closeSidebar();
  }
};

// ─── UI Manager ──────────────────────────────────────
const UI = {
  filters: { status: 'all', priority: 'all' },
  sortBy: 'created-desc',
  searchQuery: '',
  editingTaskId: null,
  editingProjectId: null,
  selectedProjectColor: '#6366f1',
  deletedTaskBuffer: null,

  init() {
    this._bindTopbar();
    this._bindSidebar();
    this._bindNavLinks();
    this._bindFilters();
    this._bindTaskModal();
    this._bindProjectModal();
    this._bindSearch();
    this._startClock();
    this._startOverdueCheck();
    this.updateUserInfo();
  },

  refresh() {
    const page = Router.currentPage;
    if (page === 'dashboard') this.renderDashboard();
    if (page === 'tasks') this.renderTasksList();
    if (page === 'board') this.renderKanban();
    if (page === 'projects') this.renderProjects();
    this.updateSidebarStats();
    this.updateNavBadge();
  },

  updateUserInfo() {
    const u = Auth.currentUser;
    if (!u) return;
    const initial = u.name.charAt(0).toUpperCase();
    $('sidebar-name').textContent = u.name;
    $('sidebar-email').textContent = u.email;
    $('sidebar-avatar').textContent = initial;
    $('topbar-avatar').textContent = initial;
  },

  // ---- Clock ----
  _startClock() {
    const el = $('live-clock');
    const tick = () => {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);

    // Greeting
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const name = Auth.currentUser?.name?.split(' ')[0] || '';
    $('dashboard-greeting').textContent = `${greet}, ${name}! 👋`;
  },

  _startOverdueCheck() {
    setInterval(() => {
      this.updateSidebarStats();
      this.updateNavBadge();
    }, 60000);
  },

  // ---- Sidebar ----
  _bindSidebar() {
    $('menu-btn').addEventListener('click', () => this.openSidebar());
    $('sidebar-close').addEventListener('click', () => this.closeSidebar());
    $('sidebar-overlay').addEventListener('click', () => this.closeSidebar());
    $('logout-btn').addEventListener('click', () => this.logout());
    $('theme-toggle').addEventListener('click', () => this.toggleTheme());
  },

  openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebar-overlay').classList.add('open');
    $('sidebar-overlay').classList.remove('hidden');
  },

  closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-overlay').classList.remove('open');
    setTimeout(() => {
      if (!$('sidebar').classList.contains('open')) {
        $('sidebar-overlay').classList.add('hidden');
      }
    }, 300);
  },

  // ---- Theme ----
  toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    Store.saveTheme(next);
    $('theme-label').textContent = next === 'dark' ? 'Dark Mode' : 'Light Mode';
    $('theme-icon-dark').classList.toggle('hidden', next !== 'dark');
    $('theme-icon-light').classList.toggle('hidden', next !== 'light');
  },

  applyTheme() {
    const theme = Store.getTheme();
    document.documentElement.dataset.theme = theme;
    const label = $('theme-label');
    const iconDark = $('theme-icon-dark');
    const iconLight = $('theme-icon-light');
    if (label) label.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
    if (iconDark) iconDark.classList.toggle('hidden', theme !== 'dark');
    if (iconLight) iconLight.classList.toggle('hidden', theme !== 'light');
  },

  // ---- Topbar ----
  _bindTopbar() {
    $('new-task-btn').addEventListener('click', () => this.openTaskModal());
    $('new-task-btn-2').addEventListener('click', () => this.openTaskModal());
    $('new-task-btn-board').addEventListener('click', () => this.openTaskModal());
    $('new-task-btn-3')?.addEventListener('click', () => this.openTaskModal());
    $('create-first-task')?.addEventListener('click', () => this.openTaskModal());
  },

  // ---- Nav Links ----
  _bindNavLinks() {
    $$('.nav-item[data-page], .mobile-nav-item[data-page], .card-link[data-page]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        Router.navigate(el.dataset.page);
      });
    });
    $('nav-projects').addEventListener('click', (e) => {
      e.preventDefault(); Router.navigate('projects');
    });
    $('new-project-btn').addEventListener('click', () => this.openProjectModal());
    $('new-project-btn-2')?.addEventListener('click', () => this.openProjectModal());
  },

  // ---- Filters ----
  _bindFilters() {
    $$('#filter-status .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#filter-status .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filters.status = chip.dataset.val;
        this.renderTasksList();
      });
    });
    $$('#filter-priority .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $$('#filter-priority .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.filters.priority = chip.dataset.val;
        this.renderTasksList();
      });
    });
    $('sort-select').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.renderTasksList();
    });
  },

  // ---- Search ----
  _bindSearch() {
    let debounce;
    $('global-search').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.searchQuery = e.target.value.trim();
        if (Router.currentPage === 'tasks') this.renderTasksList();
        else { Router.navigate('tasks'); }
      }, 250);
    });
  },

  // ---- Stats & Badges ----
  updateSidebarStats() {
    const s = Tasks.getStats();
    const today = new Date().toISOString().split('T')[0];
    $('stat-today').textContent = s.dueToday;
    $('stat-done').textContent = s.done;
    $('stat-overdue').textContent = s.overdue;
  },

  updateNavBadge() {
    const s = Tasks.getStats();
    const badge = $('nav-tasks-badge');
    if (s.overdue > 0) {
      badge.textContent = s.overdue;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  // ---- Logout ----
  logout() {
    Auth.logout();
    $('app-shell').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
    showPanel('login-panel');
    Toasts.show('Signed out successfully.', 'info');
  },

  // ============================================================
  //  DASHBOARD
  // ============================================================
  renderDashboard() {
    const s = Tasks.getStats();
    $('stat-total').textContent = s.total;
    $('stat-completed').textContent = s.done;
    $('stat-overdue-val').textContent = s.overdue;
    $('stat-today-val').textContent = s.dueToday;
    $('stat-done-sub').textContent = s.total ? `${Math.round((s.done / s.total) * 100)}%` : '0%';

    // Ring
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (pct / 100) * circumference;
    $('progress-ring-fill').style.strokeDashoffset = offset;
    $('progress-ring-fill').style.strokeDasharray = circumference;
    $('progress-pct').textContent = `${pct}%`;

    // Breakdown
    $('bd-todo').textContent = s.todo;
    $('bd-inprogress').textContent = s.inprogress;
    $('bd-review').textContent = s.review;
    $('bd-done').textContent = s.done;

    // Priority bars
    const maxP = Math.max(s.critical, s.high, s.medium, s.low, 1);
    [['critical', s.critical], ['high', s.high], ['medium', s.medium], ['low', s.low]].forEach(([k, v]) => {
      $(`pbar-${k}`).style.width = `${(v / maxP) * 100}%`;
      $(`pnum-${k}`).textContent = v;
    });

    // Recent tasks
    const tasks = Tasks.sort(Tasks.getAll(), 'created-desc').slice(0, 6);
    const container = $('recent-tasks-list');
    if (!tasks.length) {
      container.innerHTML = `<div class="empty-state-sm">No tasks yet. <button class="link-btn" id="create-first-task">Create your first task →</button></div>`;
      $('create-first-task')?.addEventListener('click', () => this.openTaskModal());
      return;
    }
    container.innerHTML = tasks.map(t => {
      const due = t.dueDate ? formatDate(t.dueDate) : null;
      return `
        <div class="recent-task-row" data-id="${escapeHtml(t.id)}">
          <div class="recent-task-check ${t.status === 'done' ? 'done' : ''}"></div>
          <span class="recent-task-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</span>
          <div class="recent-task-meta">
            <span class="badge badge-priority-${t.priority}">${t.priority}</span>
            ${due ? `<span class="due-badge ${due.state}">${escapeHtml(due.label)}</span>` : ''}
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.recent-task-row').forEach(row => {
      row.addEventListener('click', () => {
        const task = Tasks.getAll().find(t => t.id === row.dataset.id);
        if (task) this.openTaskModal(task);
      });
    });

    this.updateSidebarStats();
    this.updateNavBadge();
  },

  // ============================================================
  //  TASKS LIST
  // ============================================================
  renderTasksList() {
    let tasks = Tasks.filter(this.filters, this.searchQuery);
    tasks = Tasks.sort(tasks, this.sortBy);

    const list = $('tasks-list');
    const empty = $('tasks-empty');
    const subtitle = $('tasks-subtitle');
    subtitle.textContent = `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`;

    if (!tasks.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
      list.innerHTML = tasks.map((t, i) => this._taskItemHTML(t, i)).join('');
      this._bindTaskItemEvents(list);
    }

    this.updateSidebarStats();
    this.updateNavBadge();
  },

  _taskItemHTML(t, i) {
    const due = t.dueDate ? formatDate(t.dueDate) : null;
    const project = t.projectId ? Projects.getById(t.projectId) : null;
    const tagsHTML = (t.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
    return `
      <div class="task-item priority-${t.priority} ${t.status === 'done' ? 'done-task' : ''}"
           data-id="${escapeHtml(t.id)}" style="animation-delay:${i * 0.03}s">
        <div class="task-checkbox ${t.status === 'done' ? 'checked' : ''}" data-action="toggle" title="Toggle complete"></div>
        <div class="task-main">
          <div class="task-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
          ${t.desc ? `<div class="task-desc-preview">${escapeHtml(t.desc)}</div>` : ''}
          ${tagsHTML ? `<div class="task-tags" style="margin-top:4px">${tagsHTML}</div>` : ''}
        </div>
        <div class="task-meta">
          ${project ? `<span class="badge" style="background:${project.color}22;color:${project.color};border:1px solid ${project.color}55">${escapeHtml(project.name)}</span>` : ''}
          <span class="badge badge-status-${t.status}">${t.status === 'inprogress' ? 'In Progress' : t.status === 'review' ? 'Review' : t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span>
          <span class="badge badge-priority-${t.priority}">${t.priority}</span>
          ${due ? `<span class="due-badge ${due.state}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${escapeHtml(due.label)}</span>` : ''}
        </div>
        <div class="task-actions">
          <button class="task-action-btn" data-action="edit" title="Edit task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="task-action-btn delete-btn" data-action="delete" title="Delete task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
  },

  _bindTaskItemEvents(container) {
    container.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = el.closest('.task-item');
        const id = item.dataset.id;
        const action = el.dataset.action;
        if (action === 'toggle') this.toggleTask(id);
        if (action === 'edit') {
          const task = Tasks.getAll().find(t => t.id === id);
          if (task) this.openTaskModal(task);
        }
        if (action === 'delete') this.deleteTask(id);
      });
    });
    container.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const task = Tasks.getAll().find(t => t.id === item.dataset.id);
        if (task) this.openTaskModal(task);
      });
    });
  },

  toggleTask(id) {
    const task = Tasks.toggleDone(id);
    if (!task) return;
    const wasDone = task.status === 'done';
    if (wasDone) {
      Confetti.burst();
      Toasts.show('Task completed! 🎉', 'success');
    } else {
      Toasts.show('Task marked as to-do', 'info');
    }
    this.refresh();
  },

  deleteTask(id) {
    const task = Tasks.delete(id);
    if (!task) return;
    this.deletedTaskBuffer = task;
    Toasts.show(
      `"${task.title}" deleted`,
      'warning',
      'Undo',
      () => {
        const tasks = Tasks.getAll();
        tasks.unshift(this.deletedTaskBuffer);
        Tasks.save(tasks);
        this.deletedTaskBuffer = null;
        this.refresh();
        Toasts.show('Task restored!', 'success');
      }
    );
    this.refresh();
  },

  // ============================================================
  //  KANBAN BOARD
  // ============================================================
  renderKanban() {
    const all = Tasks.getAll();
    const columns = ['todo', 'inprogress', 'review', 'done'];
    columns.forEach(status => {
      const tasks = all.filter(t => t.status === status);
      const col = $(`col-${status}`);
      const count = $(`col-count-${status}`);
      count.textContent = tasks.length;
      col.innerHTML = tasks.map(t => this._kanbanCardHTML(t)).join('');
    });
    this._initDragDrop();
  },

  _kanbanCardHTML(t) {
    const due = t.dueDate ? formatDate(t.dueDate) : null;
    const tagsHTML = (t.tags || []).slice(0, 2).map(tag => `<span class="tag" style="font-size:10px">${escapeHtml(tag)}</span>`).join('');
    return `
      <div class="kanban-card priority-${t.priority}" draggable="true" data-id="${escapeHtml(t.id)}">
        <div class="kanban-card-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
        <div class="kanban-card-footer">
          <div class="kanban-card-tags">${tagsHTML}</div>
          ${due ? `<span class="kanban-card-due ${due.state}">${escapeHtml(due.label)}</span>` : ''}
          <span class="badge badge-priority-${t.priority}" style="margin-left:auto">${t.priority}</span>
        </div>
      </div>`;
  },

  _initDragDrop() {
    let draggedId = null;

    $$('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        draggedId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        $$('.kanban-col-body').forEach(col => col.classList.remove('drag-over'));
      });
      // Click to edit
      card.addEventListener('click', () => {
        const task = Tasks.getAll().find(t => t.id === card.dataset.id);
        if (task) this.openTaskModal(task);
      });
    });

    $$('.kanban-col-body').forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!draggedId) return;
        const newStatus = col.dataset.status;
        const task = Tasks.getAll().find(t => t.id === draggedId);
        if (!task || task.status === newStatus) return;
        const wasNotDone = task.status !== 'done';
        Tasks.update(draggedId, { status: newStatus });
        if (newStatus === 'done' && wasNotDone) {
          Confetti.burst();
          Toasts.show('Task completed! 🎉', 'success');
        } else {
          Toasts.show(`Moved to "${newStatus === 'inprogress' ? 'In Progress' : newStatus === 'review' ? 'In Review' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}"`, 'info');
        }
        this.renderKanban();
        this.updateSidebarStats();
        draggedId = null;
      });
    });

    // Touch drag support (mobile)
    this._initTouchDrag();
  },

  _initTouchDrag() {
    let dragEl = null, dragId = null, clone = null;
    $$('.kanban-card').forEach(card => {
      card.addEventListener('touchstart', (e) => {
        dragEl = card; dragId = card.dataset.id;
        card.classList.add('dragging');
        clone = card.cloneNode(true);
        clone.style.cssText = `position:fixed;opacity:0.85;z-index:9999;pointer-events:none;width:${card.offsetWidth}px;transform:scale(1.05);`;
        document.body.appendChild(clone);
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!clone) return;
        const touch = e.touches[0];
        clone.style.left = `${touch.clientX - 80}px`;
        clone.style.top = `${touch.clientY - 40}px`;
        $$('.kanban-col-body').forEach(col => col.classList.remove('drag-over'));
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const col = el?.closest('.kanban-col-body');
        if (col) col.classList.add('drag-over');
      }, { passive: true });

      card.addEventListener('touchend', (e) => {
        dragEl?.classList.remove('dragging');
        clone?.remove(); clone = null;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const col = el?.closest('.kanban-col-body');
        $$('.kanban-col-body').forEach(c => c.classList.remove('drag-over'));
        if (col && dragId) {
          const newStatus = col.dataset.status;
          const task = Tasks.getAll().find(t => t.id === dragId);
          if (task && task.status !== newStatus) {
            const wasNotDone = task.status !== 'done';
            Tasks.update(dragId, { status: newStatus });
            if (newStatus === 'done' && wasNotDone) { Confetti.burst(); Toasts.show('Task completed! 🎉', 'success'); }
            this.renderKanban();
          }
        }
        dragEl = null; dragId = null;
      });
    });
  },

  // ============================================================
  //  PROJECTS PAGE
  // ============================================================
  renderProjects() {
    const projects = Projects.getAll();
    const all = Tasks.getAll();
    const grid = $('projects-grid');
    const empty = $('projects-empty');

    if (!projects.length) {
      grid.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = projects.map(p => {
      const pTasks = all.filter(t => t.projectId === p.id);
      const done = pTasks.filter(t => t.status === 'done').length;
      const pct = pTasks.length ? Math.round((done / pTasks.length) * 100) : 0;
      return `
        <div class="project-card" data-id="${escapeHtml(p.id)}">
          <div class="project-card-accent" style="background:${p.color}"></div>
          <div class="project-card-header">
            <h3 class="project-name">${escapeHtml(p.name)}</h3>
            <div class="project-card-actions">
              <button class="task-action-btn" data-action="edit" title="Edit project">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="task-action-btn delete-btn" data-action="delete" title="Delete project">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
              </button>
            </div>
          </div>
          ${p.desc ? `<p class="project-desc">${escapeHtml(p.desc)}</p>` : '<p class="project-desc" style="color:var(--text-muted);font-style:italic">No description</p>'}
          <div class="project-progress-bar">
            <div class="project-progress-fill" style="width:${pct}%;background:${p.color}"></div>
          </div>
          <div class="project-stats">
            <span><strong>${pTasks.length}</strong> tasks</span>
            <span><strong>${done}</strong> done</span>
            <span><strong>${pct}%</strong> complete</span>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.project-card');
        const id = card.dataset.id;
        if (btn.dataset.action === 'edit') {
          const p = Projects.getAll().find(p => p.id === id);
          if (p) this.openProjectModal(p);
        }
        if (btn.dataset.action === 'delete') {
          if (confirm('Delete this project? Tasks will be unassigned.')) {
            Projects.delete(id);
            this.renderProjects();
            this.refreshProjectSelect();
            Toasts.show('Project deleted', 'warning');
          }
        }
      });
    });
  },

  // ============================================================
  //  TASK MODAL
  // ============================================================
  openTaskModal(task = null) {
    this.editingTaskId = task?.id || null;
    $('modal-title').textContent = task ? 'Edit Task' : 'New Task';
    $('task-id').value = task?.id || '';
    $('task-title').value = task?.title || '';
    $('task-desc').value = task?.desc || '';
    $('task-priority').value = task?.priority || 'medium';
    $('task-status').value = task?.status || 'todo';
    $('task-due').value = task?.dueDate ? formatDateInput(task.dueDate) : '';
    $('task-tags').value = (task?.tags || []).join(', ');
    $('task-title-err').textContent = '';
    this.refreshProjectSelect(task?.projectId || '');
    this.updateDescCount();
    $('task-modal').classList.remove('hidden');
    setTimeout(() => $('task-title').focus(), 100);
  },

  refreshProjectSelect(selectedId = '') {
    const sel = $('task-project');
    const projects = Projects.getAll();
    sel.innerHTML = `<option value="">No project</option>` +
      projects.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  },

  closeTaskModal() {
    $('task-modal').classList.add('hidden');
    $('task-form').reset();
    this.editingTaskId = null;
  },

  updateDescCount() {
    const val = $('task-desc').value;
    $('task-desc-count').textContent = `${val.length}/500`;
  },

  _bindTaskModal() {
    $('close-modal').addEventListener('click', () => this.closeTaskModal());
    $('cancel-task').addEventListener('click', () => this.closeTaskModal());
    $('task-modal').addEventListener('click', (e) => {
      if (e.target === $('task-modal')) this.closeTaskModal();
    });
    $('task-desc').addEventListener('input', () => this.updateDescCount());
    $('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('task-title').value.trim();
      if (!title) { $('task-title-err').textContent = 'Title is required.'; return; }
      $('task-title-err').textContent = '';
      const data = {
        title,
        desc: $('task-desc').value.trim(),
        priority: $('task-priority').value,
        status: $('task-status').value,
        dueDate: $('task-due').value || null,
        tags: $('task-tags').value,
        projectId: $('task-project').value || null,
      };
      if (this.editingTaskId) {
        Tasks.update(this.editingTaskId, data);
        Toasts.show('Task updated!', 'success');
      } else {
        Tasks.create(data);
        Toasts.show('Task created!', 'success');
      }
      this.closeTaskModal();
      this.refresh();
    });
    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('task-modal').classList.contains('hidden')) this.closeTaskModal();
        if (!$('project-modal').classList.contains('hidden')) this.closeProjectModal();
      }
    });
  },

  // ============================================================
  //  PROJECT MODAL
  // ============================================================
  openProjectModal(project = null) {
    this.editingProjectId = project?.id || null;
    $('project-modal-title').textContent = project ? 'Edit Project' : 'New Project';
    $('project-id').value = project?.id || '';
    $('project-name').value = project?.name || '';
    $('project-desc').value = project?.desc || '';
    $('project-name-err').textContent = '';
    this.selectedProjectColor = project?.color || '#6366f1';
    $$('#project-color-picker .color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color === this.selectedProjectColor);
    });
    $('project-modal').classList.remove('hidden');
    setTimeout(() => $('project-name').focus(), 100);
  },

  closeProjectModal() {
    $('project-modal').classList.add('hidden');
    $('project-form').reset();
    this.editingProjectId = null;
  },

  _bindProjectModal() {
    $('close-project-modal').addEventListener('click', () => this.closeProjectModal());
    $('cancel-project').addEventListener('click', () => this.closeProjectModal());
    $('project-modal').addEventListener('click', (e) => {
      if (e.target === $('project-modal')) this.closeProjectModal();
    });
    $$('#project-color-picker .color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        $$('#project-color-picker .color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        this.selectedProjectColor = sw.dataset.color;
      });
    });
    $('project-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('project-name').value.trim();
      if (!name) { $('project-name-err').textContent = 'Project name is required.'; return; }
      $('project-name-err').textContent = '';
      const data = { name, desc: $('project-desc').value.trim(), color: this.selectedProjectColor };
      if (this.editingProjectId) {
        Projects.update(this.editingProjectId, data);
        Toasts.show('Project updated!', 'success');
      } else {
        Projects.create(data);
        Toasts.show('Project created!', 'success');
      }
      this.closeProjectModal();
      this.renderProjects();
      this.refreshProjectSelect();
    });
  }
};

// ─── Auth UI ─────────────────────────────────────────
function showPanel(id) {
  $$('.auth-panel').forEach(p => p.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function setLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const spinner = btn.querySelector('.btn-spinner');
  const text = btn.querySelector('.btn-text');
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (text) text.classList.toggle('hidden', loading);
}

function bindAuthUI() {
  $('go-signup').addEventListener('click', () => showPanel('signup-panel'));
  $('go-login').addEventListener('click', () => showPanel('login-panel'));

  // Password toggles
  $$('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Password strength
  $('signup-password').addEventListener('input', () => {
    const pw = $('signup-password').value;
    const bars = document.querySelector('.strength-bars');
    const label = $('strength-label');
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    bars.className = `strength-bars s${score}`;
    const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
    label.textContent = labels[score];
  });

  // Login form
  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const pw = $('login-password').value;
    $('login-email-err').textContent = '';
    $('login-pw-err').textContent = '';
    $('login-error').classList.add('hidden');
    if (!email) { $('login-email-err').textContent = 'Email is required.'; return; }
    if (!pw) { $('login-pw-err').textContent = 'Password is required.'; return; }
    setLoading('login-btn', true);
    try {
      await Auth.login(email, pw);
      await launchApp();
    } catch (err) {
      $('login-error').textContent = err.message;
      $('login-error').classList.remove('hidden');
    } finally {
      setLoading('login-btn', false);
    }
  });

  // Signup form
  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const pw = $('signup-password').value;
    $('signup-name-err').textContent = '';
    $('signup-email-err').textContent = '';
    $('signup-pw-err').textContent = '';
    $('signup-error').classList.add('hidden');
    if (!name) { $('signup-name-err').textContent = 'Name is required.'; return; }
    if (!email) { $('signup-email-err').textContent = 'Email is required.'; return; }
    if (pw.length < 8) { $('signup-pw-err').textContent = 'Password must be at least 8 characters.'; return; }
    setLoading('signup-btn', true);
    try {
      await Auth.signup(name, email, pw);
      await launchApp();
    } catch (err) {
      $('signup-error').textContent = err.message;
      $('signup-error').classList.remove('hidden');
    } finally {
      setLoading('signup-btn', false);
    }
  });
}

// ─── App Launch ──────────────────────────────────────
async function launchApp() {
  $('auth-screen').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  UI.applyTheme();
  UI.init();
  UI.refresh();
  BroadcastSync.init();
  Router.init();
  Toasts.show(`Welcome back, ${Auth.currentUser?.name?.split(' ')[0]}! 👋`, 'success');
}

// ─── Boot ────────────────────────────────────────────
(async function boot() {
  Toasts.init();
  Confetti.init();
  const loggedIn = await Auth.init();
  bindAuthUI();
  if (loggedIn) {
    await launchApp();
  } else {
    $('auth-screen').classList.remove('hidden');
    UI.applyTheme();
  }
})();
