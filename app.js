'use strict';

const APP = {
  KEYS: {
    USERS: 'lce_users',
    PROJECTS: 'lce_projects',
    TASKS: 'lce_tasks',
    CURRENT_USER: 'lce_current_user'
  },

  DESIGNATIONS: [
    { title: 'Assistant Vice President', level: 'L0', grade: 'C3' },
    { title: 'Deputy General Manager', level: 'L', grade: 'D3' },
    { title: 'Assistant General Manager', level: 'L', grade: 'D4' },
    { title: 'Manager', level: 'L1', grade: 'E2' },
    { title: 'Deputy Manager', level: 'L2', grade: 'E3' },
    { title: 'Assistant Manager', level: 'L3', grade: 'E4' },
    { title: 'GET', level: 'L3', grade: 'E5' },
    { title: 'Senior Executive Engineer', level: 'L3', grade: 'F1' },
    { title: 'Senior Executive Engineer (Site)', level: 'L3', grade: 'F1' },
    { title: 'Executive Engineer (D)', level: 'L4', grade: 'F2' },
    { title: 'Junior Executive Engineer (D)', level: 'L4', grade: 'F3' },
    { title: 'Junior Executive Engineer Document Controller', level: 'L4', grade: 'F3' },
    { title: 'Diploma Trainee Eng (D)', level: 'L4', grade: 'G4' },
    { title: 'Junior Executive Engineer (T)', level: 'T1', grade: 'F3' },
    { title: 'Senior Draughtsman (T)', level: 'T1', grade: 'G1' },
    { title: 'Junior Executive Engineer (TD)', level: 'T2', grade: 'F3' }
  ],

  DEPARTMENTS: [
    'Civil & Structural',
    'Architecture',
    'MEP',
    'Project Management Office',
    'IT & Systems',
    'HR & Administration',
    'Finance & Accounts',
    'QHSE'
  ],

  // Higher number = more authority
  LEVEL_POWER: { 'L': 8, 'L0': 7, 'L1': 6, 'L2': 5, 'L3': 4, 'L4': 2, 'T1': 2, 'T2': 1 },

  // ─── Access Checks ───────────────────────────────────────────────
  isAdmin: function (u) { return u && (u.level === 'L' || u.level === 'L0'); },
  canCreateProjects: function (u) { return this.isAdmin(u); },
  canCreateTasks: function (u) { return u && !['L4', 'T2'].includes(u.level) || this.isAdmin(u); },

  getAssignableLevels: function (user) {
    if (!user) return [];
    const myPower = this.LEVEL_POWER[user.level] || 0;
    return Object.keys(this.LEVEL_POWER).filter(l => this.LEVEL_POWER[l] < myPower);
  },

  getAssignableUsers: function (user) {
    if (this.isAdmin(user)) return this.getUsers().filter(u => u.id !== user.id);
    const levels = this.getAssignableLevels(user);
    return this.getUsers().filter(u => levels.includes(u.level));
  },

  // ─── Users ───────────────────────────────────────────────────────
  getUsers: function () { return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]'); },
  saveUsers: function (u) { localStorage.setItem(this.KEYS.USERS, JSON.stringify(u)); },
  getUserById: function (id) { return this.getUsers().find(u => u.id === id) || null; },
  getUserName: function (id) { if (!id) return '—'; const u = this.getUserById(id); return u ? u.name : '—'; },
  findUserByEmail: function (email) { return this.getUsers().find(u => u.email === email.toLowerCase().trim()) || null; },

  createUser: function (data) {
    const users = this.getUsers();
    if (this.findUserByEmail(data.email)) return { error: 'Email already registered.' };
    if (users.find(u => u.empId === data.empId.trim())) return { error: 'Employee ID already registered.' };
    const desig = this.DESIGNATIONS.find(d => d.title === data.designation);
    if (!desig) return { error: 'Invalid designation selected.' };
    const user = {
      id: this.generateId(),
      name: data.name.trim(),
      designation: data.designation,
      level: desig.level,
      grade: desig.grade,
      dept: data.dept,
      empId: data.empId.trim(),
      email: data.email.toLowerCase().trim(),
      passcode: data.passcode,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    this.saveUsers(users);
    return { user };
  },

  // ─── Auth ─────────────────────────────────────────────────────────
  getCurrentUser: function () { return JSON.parse(localStorage.getItem(this.KEYS.CURRENT_USER) || 'null'); },
  setCurrentUser: function (u) { localStorage.setItem(this.KEYS.CURRENT_USER, JSON.stringify(u)); },
  logout: function () { localStorage.removeItem(this.KEYS.CURRENT_USER); window.location.href = 'index.html'; },
  requireAuth: function () {
    const u = this.getCurrentUser();
    if (!u) { window.location.href = 'login.html'; return null; }
    return u;
  },

  // ─── Projects ────────────────────────────────────────────────────
  getProjects: function () { return JSON.parse(localStorage.getItem(this.KEYS.PROJECTS) || '[]'); },
  saveProjects: function (p) { localStorage.setItem(this.KEYS.PROJECTS, JSON.stringify(p)); },
  getProjectById: function (id) { return this.getProjects().find(p => p.id === id) || null; },

  createProject: function (data, creatorId) {
    const projects = this.getProjects();
    const project = {
      id: this.generateId(),
      title: data.title.trim(),
      description: (data.description || '').trim(),
      priority: data.priority,
      status: 'Not Started',
      dueDate: data.dueDate || null,
      assignerId: creatorId,
      assigneeId: data.assigneeId || null,
      createdBy: creatorId,
      createdAt: new Date().toISOString()
    };
    projects.push(project);
    this.saveProjects(projects);
    return project;
  },

  updateProject: function (id, data) {
    const projects = this.getProjects();
    const i = projects.findIndex(p => p.id === id);
    if (i === -1) return null;
    projects[i] = { ...projects[i], ...data, updatedAt: new Date().toISOString() };
    this.saveProjects(projects);
    return projects[i];
  },

  deleteProject: function (id) {
    this.saveProjects(this.getProjects().filter(p => p.id !== id));
    this.saveTasks(this.getTasks().filter(t => t.projectId !== id));
  },

  getVisibleProjects: function (user) {
    const all = this.getProjects();
    if (this.isAdmin(user) || user.level === 'L1') return all;
    const myProjectIds = new Set(this.getTasks().filter(t => t.assigneeId === user.id).map(t => t.projectId));
    return all.filter(p => p.assigneeId === user.id || myProjectIds.has(p.id));
  },

  // ─── Tasks ───────────────────────────────────────────────────────
  getTasks: function () { return JSON.parse(localStorage.getItem(this.KEYS.TASKS) || '[]'); },
  saveTasks: function (t) { localStorage.setItem(this.KEYS.TASKS, JSON.stringify(t)); },
  getTaskById: function (id) { return this.getTasks().find(t => t.id === id) || null; },

  createTask: function (data, creatorId) {
    const tasks = this.getTasks();
    const task = {
      id: this.generateId(),
      projectId: data.projectId,
      title: data.title.trim(),
      description: (data.description || '').trim(),
      priority: data.priority || 'Medium',
      status: 'To Do',
      dueDate: data.dueDate || null,
      assignerId: creatorId,
      assigneeId: data.assigneeId || null,
      createdBy: creatorId,
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
    this.saveTasks(tasks);
    return task;
  },

  updateTask: function (id, data) {
    const tasks = this.getTasks();
    const i = tasks.findIndex(t => t.id === id);
    if (i === -1) return null;
    tasks[i] = { ...tasks[i], ...data, updatedAt: new Date().toISOString() };
    this.saveTasks(tasks);
    return tasks[i];
  },

  deleteTask: function (id) { this.saveTasks(this.getTasks().filter(t => t.id !== id)); },

  getProjectTasks: function (projectId, user) {
    const all = this.getTasks().filter(t => t.projectId === projectId);
    if (this.isAdmin(user) || user.level === 'L1') return all;
    return all.filter(t => t.assigneeId === user.id || t.createdBy === user.id);
  },

  // Returns tasks assigned to user OR created by user (for kanban ownership tracking)
  getMyTasks: function (userId) {
    const all = this.getTasks();
    const assignedIds = new Set(all.filter(t => t.assigneeId === userId).map(t => t.id));
    const created     = all.filter(t => t.createdBy === userId && !assignedIds.has(t.id));
    return [...all.filter(t => t.assigneeId === userId), ...created];
  },

  // ─── Utilities ───────────────────────────────────────────────────
  generateId: function () { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); },
  formatDate: function (d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); },
  isOverdue: function (d) { return d && new Date(d) < new Date() && true; },

  priorityColor: function (p) { return ({ High: '#e74c3c', Medium: '#f39c12', Low: '#27ae60' })[p] || '#95a5a6'; },
  statusColor: function (s) {
    return ({ 'Not Started': '#95a5a6', 'In Progress': '#3498db', 'Completed': '#27ae60', 'To Do': '#95a5a6', 'Done': '#27ae60', 'On Hold': '#e67e22' })[s] || '#95a5a6';
  },

  levelLabel: function (l) {
    return ({ L: 'HOD', L0: 'Advisor', L1: 'Team Lead', L2: 'Group Lead', L3: 'Designer', L4: 'Drafting', T1: 'Tekla (Check)', T2: 'Tekla (Detail)' })[l] || l;
  },

  escapeHtml: function (t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },

  showAlert: function (elId, msg, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg;
    el.className = `alert alert-${type} show`;
    setTimeout(() => el.classList.remove('show'), 4000);
  },

  // ─── QC Checklists ───────────────────────────────────────────────
  getChecklists: function () { return JSON.parse(localStorage.getItem('lce_checklists') || '[]'); },
  saveChecklists: function (c) { localStorage.setItem('lce_checklists', JSON.stringify(c)); },
  getProjectChecklists: function (projectId) { return this.getChecklists().filter(c => c.projectId === projectId); },
  getChecklistById: function (id) { return this.getChecklists().find(c => c.id === id) || null; },

  createChecklist: function (data, creatorId) {
    const list = this.getChecklists();
    const cl = {
      id: this.generateId(),
      projectId: data.projectId,
      drawingTitle: data.drawingTitle.trim(),
      description: (data.description || '').trim(),
      // reviewers: [{ userId, name, designation, signed, signedAt, comments }]
      reviewers: data.reviewers || [],
      hodSignOff: { signed: false, signedBy: null, signedAt: null },
      sentToClient: false,
      sentAt: null,
      createdBy: creatorId,
      createdAt: new Date().toISOString()
    };
    list.push(cl);
    this.saveChecklists(list);
    return cl;
  },

  updateChecklist: function (id, data) {
    const list = this.getChecklists();
    const i = list.findIndex(c => c.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...data, updatedAt: new Date().toISOString() };
    this.saveChecklists(list);
    return list[i];
  },

  deleteChecklist: function (id) { this.saveChecklists(this.getChecklists().filter(c => c.id !== id)); },

  // Sign a checklist reviewer entry
  signChecklist: function (checklistId, userId) {
    const list = this.getChecklists();
    const i = list.findIndex(c => c.id === checklistId);
    if (i === -1) return null;
    const r = list[i].reviewers.find(r => r.userId === userId);
    if (r) { r.signed = true; r.signedAt = new Date().toISOString(); }
    this.saveChecklists(list);
    return list[i];
  },

  // HOD final sign-off
  hodSignChecklist: function (checklistId, userId) {
    const list = this.getChecklists();
    const i = list.findIndex(c => c.id === checklistId);
    if (i === -1) return null;
    list[i].hodSignOff = { signed: true, signedBy: userId, signedAt: new Date().toISOString() };
    this.saveChecklists(list);
    return list[i];
  },

  // Mark as sent to client
  markSentToClient: function (checklistId) {
    const list = this.getChecklists();
    const i = list.findIndex(c => c.id === checklistId);
    if (i === -1) return null;
    list[i].sentToClient = true;
    list[i].sentAt = new Date().toISOString();
    this.saveChecklists(list);
    return list[i];
  },

  checklistAllSigned: function (cl) {
    return cl.reviewers.every(r => r.signed);
  },

  // ─── Seed Admin (test account) ───────────────────────────────────
  // Login: admin@lloyds.in  passcode: 1234
  // Has full admin access (L level = HOD) + super flag for all views
  seedAdmin: function () {
    const users = this.getUsers();
    if (users.find(u => u.email === 'admin@lloyds.in')) return; // already seeded
    users.unshift({
      id: 'lce-admin-001',
      name: 'System Admin',
      designation: 'Deputy General Manager',
      level: 'L',
      grade: 'D3',
      dept: 'Civil & Structural',
      empId: 'ADM001',
      email: 'admin@lloyds.in',
      passcode: '1234',
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
    this.saveUsers(users);
  }
};
