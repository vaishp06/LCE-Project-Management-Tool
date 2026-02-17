'use strict';

const APP = {
  KEYS: {
    USERS:        'lce_users',
    PROJECTS:     'lce_projects',
    TASKS:        'lce_tasks',
    CURRENT_USER: 'lce_current_user',
    CONCURRENCES: 'lce_concurrences',
    NOTES:        'lce_notes'
  },

  DESIGNATIONS: [
    { title: 'Assistant Vice President',                     level: 'L0', grade: 'C3' },
    { title: 'Deputy General Manager',                       level: 'L',  grade: 'D3' },
    { title: 'Assistant General Manager',                    level: 'L',  grade: 'D4' },
    { title: 'Manager',                                      level: 'L1', grade: 'E2' },
    { title: 'Deputy Manager',                               level: 'L2', grade: 'E3' },
    { title: 'Assistant Manager',                            level: 'L3', grade: 'E4' },
    { title: 'GET',                                          level: 'L3', grade: 'E5' },
    { title: 'Senior Executive Engineer',                    level: 'L3', grade: 'F1' },
    { title: 'Senior Executive Engineer (BBS)',              level: 'L3', grade: 'F1' },
    { title: 'Senior Executive Engineer (Site)',             level: 'L3', grade: 'F1' },
    { title: 'Executive Engineer (D)',                       level: 'L4', grade: 'F2' },
    { title: 'Junior Executive Engineer (D)',                level: 'L4', grade: 'F3' },
    { title: 'Junior Executive Engineer Document Controller',level: 'L4', grade: 'F3' },
    { title: 'Diploma Trainee Eng (D)',                      level: 'L4', grade: 'G4' },
    { title: 'Junior Executive Engineer (T)',                level: 'T1', grade: 'F3' },
    { title: 'Senior Draughtsman (T)',                       level: 'T1', grade: 'G1' },
    { title: 'Junior Executive Engineer (TD)',               level: 'T2', grade: 'F3' }
  ],

  // Org groups from updated Excel
  GROUPS: [
    { id: 'MANAGEMENT',  label: 'Management (L / L0)' },
    { id: 'GROUP-1',     label: 'Group 1 — Pune' },
    { id: 'GROUP-2',     label: 'Group 2 — Pune' },
    { id: 'GROUP-3',     label: 'Group 3 — Pune' },
    { id: 'TASK-FORCE',  label: 'BHQ Task Force' },
    { id: 'SITE-HEDRI',  label: 'Hedri Site Posting' },
    { id: 'SITE-GHUGUS', label: 'Ghugus Site Posting' }
  ],

  // Higher number = more authority
  LEVEL_POWER: { 'L': 8, 'L0': 7, 'L1': 6, 'L2': 5, 'L3': 4, 'L4': 2, 'T1': 2, 'T2': 1 },

  // ─── Access Checks ───────────────────────────────────────────────
  isAdmin: function (u) { return u && (u.level === 'L' || u.level === 'L0'); },
  canCreateProjects:     function (u) { return this.isAdmin(u); },
  canCreateSubprojects:  function (u) { return u && (u.level === 'L1' || this.isAdmin(u)); },
  canCreateTasks:        function (u) { return u && (!['L4', 'T2'].includes(u.level) || this.isAdmin(u)); },
  canCreateConcurrence:  function (u) { return u && (u.level === 'L1' || this.isAdmin(u)); },
  canCreateSubtasks:     function (u) { return u && (['L', 'L0', 'L1', 'L2'].includes(u.level)); },

  // ─── Multi-assignee helpers ──────────────────────────────────────
  getTaskAssigneeIds: function (task) {
    if (task.assigneeIds && task.assigneeIds.length) return task.assigneeIds;
    if (task.assigneeId) return [task.assigneeId];
    return [];
  },
  isTaskAssignedTo: function (task, userId) {
    return this.getTaskAssigneeIds(task).includes(userId);
  },
  getTaskAssigneeNames: function (task) {
    const ids = this.getTaskAssigneeIds(task);
    if (ids.length === 0) return ['Unassigned'];
    return ids.map(id => this.getUserName(id)).filter(n => n !== '—');
  },
  getProjectAssigneeIds: function (project) {
    if (project.assigneeIds && project.assigneeIds.length) return project.assigneeIds;
    if (project.assigneeId) return [project.assigneeId];
    return [];
  },

  // ─── Group-scoped assignee lookup ───────────────────────────────
  // Each user can assign to people in their own group who are below them.
  // L/L0 can assign to anyone. Everyone can always self-assign (handled in UI).
  getAssignableUsers: function (user) {
    if (!user) return [];
    const allUsers = this.getUsers();
    if (this.isAdmin(user)) return allUsers.filter(u => u.id !== user.id);
    const myPower = this.LEVEL_POWER[user.level] || 0;
    return allUsers.filter(u => {
      if (u.id === user.id) return false;
      const theirPower = this.LEVEL_POWER[u.level] || 0;
      if (theirPower >= myPower) return false;
      // Group filter: if both belong to a non-MANAGEMENT group, must be the same group
      const myGroup    = user.group;
      const theirGroup = u.group;
      if (myGroup && theirGroup && myGroup !== 'MANAGEMENT' && theirGroup !== 'MANAGEMENT') {
        if (myGroup !== theirGroup) return false;
      }
      return true;
    });
  },

  // ─── Users ───────────────────────────────────────────────────────
  getUsers:         function () { return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]'); },
  saveUsers:        function (u) { localStorage.setItem(this.KEYS.USERS, JSON.stringify(u)); },
  getUserById:      function (id) { return this.getUsers().find(u => u.id === id) || null; },
  getUserName:      function (id) { if (!id) return '—'; const u = this.getUserById(id); return u ? u.name : '—'; },
  findUserByEmail:  function (email) { return this.getUsers().find(u => u.email === email.toLowerCase().trim()) || null; },

  createUser: function (data) {
    const users = this.getUsers();
    if (this.findUserByEmail(data.email)) return { error: 'Email already registered.' };
    if (users.find(u => u.empId === data.empId.trim())) return { error: 'Employee ID already registered.' };
    const desig = this.DESIGNATIONS.find(d => d.title === data.designation);
    if (!desig) return { error: 'Invalid designation selected.' };
    const user = {
      id:          this.generateId(),
      name:        data.name.trim(),
      designation: data.designation,
      level:       desig.level,
      grade:       desig.grade,
      dept:        data.dept,
      group:       data.group || null,
      empId:       data.empId.trim(),
      email:       data.email.toLowerCase().trim(),
      passcode:    data.passcode,
      createdAt:   new Date().toISOString()
    };
    users.push(user);
    this.saveUsers(users);
    return { user };
  },

  // ─── Auth ────────────────────────────────────────────────────────
  getCurrentUser: function () { return JSON.parse(localStorage.getItem(this.KEYS.CURRENT_USER) || 'null'); },
  setCurrentUser: function (u) { localStorage.setItem(this.KEYS.CURRENT_USER, JSON.stringify(u)); },
  logout: function () { localStorage.removeItem(this.KEYS.CURRENT_USER); window.location.href = 'index.html'; },
  requireAuth: function () {
    const u = this.getCurrentUser();
    if (!u) { window.location.href = 'login.html'; return null; }
    return u;
  },

  // ─── Projects ────────────────────────────────────────────────────
  getProjects:      function () { return JSON.parse(localStorage.getItem(this.KEYS.PROJECTS) || '[]'); },
  saveProjects:     function (p) { localStorage.setItem(this.KEYS.PROJECTS, JSON.stringify(p)); },
  getProjectById:   function (id) { return this.getProjects().find(p => p.id === id) || null; },
  getSubprojects:   function (parentId) { return this.getProjects().filter(p => p.parentProjectId === parentId); },

  createProject: function (data, creatorId) {
    const projects = this.getProjects();
    const assigneeIds = data.assigneeIds || (data.assigneeId ? [data.assigneeId] : []);
    const project = {
      id:              this.generateId(),
      title:           data.title.trim(),
      description:     (data.description || '').trim(),
      priority:        data.priority || 'Medium',
      status:          'Not Started',
      dueDate:         data.dueDate || null,
      scopeLink:       data.scopeLink || null,
      assignerId:      creatorId,
      assigneeIds:     assigneeIds,
      assigneeId:      assigneeIds[0] || null,   // backward compat
      parentProjectId: data.parentProjectId || null,
      createdBy:       creatorId,
      createdAt:       new Date().toISOString()
    };
    projects.push(project);
    this.saveProjects(projects);
    return project;
  },

  updateProject: function (id, data) {
    const projects = this.getProjects();
    const i = projects.findIndex(p => p.id === id);
    if (i === -1) return null;
    if (data.assigneeIds)                         data.assigneeId = data.assigneeIds[0] || null;
    if (data.assigneeId !== undefined && !data.assigneeIds) data.assigneeIds = data.assigneeId ? [data.assigneeId] : [];
    projects[i] = { ...projects[i], ...data, updatedAt: new Date().toISOString() };
    this.saveProjects(projects);
    return projects[i];
  },

  deleteProject: function (id) {
    this.saveProjects(this.getProjects().filter(p => p.id !== id));
    this.saveTasks(this.getTasks().filter(t => t.projectId !== id));
    // cascade delete subprojects
    this.getSubprojects(id).forEach(s => this.deleteProject(s.id));
  },

  getVisibleProjects: function (user) {
    const all = this.getProjects().filter(p => !p.parentProjectId); // top-level only
    if (this.isAdmin(user) || user.level === 'L1') return all;
    const myTaskProjectIds = new Set(
      this.getTasks()
        .filter(t => this.isTaskAssignedTo(t, user.id) || t.createdBy === user.id)
        .map(t => t.projectId)
    );
    return all.filter(p => {
      const ids = this.getProjectAssigneeIds(p);
      return ids.includes(user.id) || myTaskProjectIds.has(p.id);
    });
  },

  // ─── Tasks ───────────────────────────────────────────────────────
  getTasks:     function () { return JSON.parse(localStorage.getItem(this.KEYS.TASKS) || '[]'); },
  saveTasks:    function (t) { localStorage.setItem(this.KEYS.TASKS, JSON.stringify(t)); },
  getTaskById:  function (id) { return this.getTasks().find(t => t.id === id) || null; },

  createTask: function (data, creatorId) {
    const tasks = this.getTasks();
    const assigneeIds = data.assigneeIds || (data.assigneeId ? [data.assigneeId] : []);
    const task = {
      id:                this.generateId(),
      projectId:         data.projectId,
      title:             data.title.trim(),
      description:       (data.description || '').trim(),
      priority:          data.priority || 'Medium',
      status:            'To Do',
      dueDate:           data.dueDate || null,
      assignerId:        creatorId,
      assigneeIds:       assigneeIds,
      assigneeId:        assigneeIds[0] || null,  // backward compat
      concurrenceId:     data.concurrenceId     || null,
      isConcurrenceTask: data.isConcurrenceTask || false,
      createdBy:         creatorId,
      createdAt:         new Date().toISOString()
    };
    tasks.push(task);
    this.saveTasks(tasks);
    return task;
  },

  updateTask: function (id, data) {
    const tasks = this.getTasks();
    const i = tasks.findIndex(t => t.id === id);
    if (i === -1) return null;
    if (data.assigneeIds)                             data.assigneeId = data.assigneeIds[0] || null;
    if (data.assigneeId !== undefined && !data.assigneeIds) data.assigneeIds = data.assigneeId ? [data.assigneeId] : [];
    tasks[i] = { ...tasks[i], ...data, updatedAt: new Date().toISOString() };
    this.saveTasks(tasks);
    return tasks[i];
  },

  deleteTask: function (id) { this.saveTasks(this.getTasks().filter(t => t.id !== id)); },

  // ─── Subtasks (embedded inside a parent task) ────────────────────
  addSubtask: function (taskId, data) {
    const tasks = this.getTasks();
    const i = tasks.findIndex(t => t.id === taskId);
    if (i === -1) return null;
    if (!tasks[i].subtasks) tasks[i].subtasks = [];
    const subtask = {
      id:         this.generateId(),
      title:      data.title.trim(),
      assigneeId: data.assigneeId || null,
      status:     'To Do',
      dueDate:    data.dueDate || null,
      createdAt:  new Date().toISOString()
    };
    tasks[i].subtasks.push(subtask);
    this.saveTasks(tasks);
    return subtask;
  },

  updateSubtask: function (taskId, subtaskId, data) {
    const tasks = this.getTasks();
    const i = tasks.findIndex(t => t.id === taskId);
    if (i === -1) return;
    if (!tasks[i].subtasks) return;
    const si = tasks[i].subtasks.findIndex(s => s.id === subtaskId);
    if (si === -1) return;
    tasks[i].subtasks[si] = { ...tasks[i].subtasks[si], ...data };
    this.saveTasks(tasks);
  },

  deleteSubtask: function (taskId, subtaskId) {
    const tasks = this.getTasks();
    const i = tasks.findIndex(t => t.id === taskId);
    if (i === -1) return;
    tasks[i].subtasks = (tasks[i].subtasks || []).filter(s => s.id !== subtaskId);
    this.saveTasks(tasks);
  },

  getProjectTasks: function (projectId, user) {
    const all = this.getTasks().filter(t => t.projectId === projectId);
    if (!user || this.isAdmin(user) || user.level === 'L1') return all;
    return all.filter(t => this.isTaskAssignedTo(t, user.id) || t.createdBy === user.id);
  },

  // Returns tasks assigned to user OR created by user (for My Board)
  getMyTasks: function (userId) {
    const all         = this.getTasks();
    const assigned    = all.filter(t => this.isTaskAssignedTo(t, userId));
    const assignedIds = new Set(assigned.map(t => t.id));
    const created     = all.filter(t => t.createdBy === userId && !assignedIds.has(t.id));
    return [...assigned, ...created];
  },

  // Get all unique task participants in a project (for concurrence auto-populate)
  getProjectParticipants: function (projectId) {
    const tasks = this.getTasks().filter(t => t.projectId === projectId);
    const ids   = new Set();
    tasks.forEach(t => {
      this.getTaskAssigneeIds(t).forEach(id => ids.add(id));
      if (t.createdBy) ids.add(t.createdBy);
    });
    return [...ids].map(id => this.getUserById(id)).filter(Boolean);
  },

  // ─── Notes ───────────────────────────────────────────────────────
  getAllNotes:      function () { return JSON.parse(localStorage.getItem(this.KEYS.NOTES) || '[]'); },
  saveAllNotes:    function (n) { localStorage.setItem(this.KEYS.NOTES, JSON.stringify(n)); },
  getProjectNotes: function (projectId) {
    return this.getAllNotes()
      .filter(n => n.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  addNote: function (projectId, text, userId) {
    const notes = this.getAllNotes();
    const note  = { id: this.generateId(), projectId, text: text.trim(), createdBy: userId, createdAt: new Date().toISOString() };
    notes.push(note);
    this.saveAllNotes(notes);
    return note;
  },
  deleteNote: function (noteId) { this.saveAllNotes(this.getAllNotes().filter(n => n.id !== noteId)); },

  // ─── Utilities ───────────────────────────────────────────────────
  generateId:   function () { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7); },
  formatDate:   function (d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); },
  formatDateTime: function (d) { if (!d) return '—'; return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); },
  isOverdue:    function (d) { return d && new Date(d) < new Date(); },

  priorityColor: function (p) { return ({ High: '#e74c3c', Medium: '#f39c12', Low: '#27ae60' })[p] || '#95a5a6'; },
  statusColor:   function (s) {
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

  // ─── Concurrences (renamed from QC Checklists) ──────────────────
  getConcurrences:        function ()   { return JSON.parse(localStorage.getItem(this.KEYS.CONCURRENCES) || '[]'); },
  saveConcurrences:       function (c)  { localStorage.setItem(this.KEYS.CONCURRENCES, JSON.stringify(c)); },
  getProjectConcurrences: function (pid){ return this.getConcurrences().filter(c => c.projectId === pid); },
  getConcurrenceById:     function (id) { return this.getConcurrences().find(c => c.id === id) || null; },

  createConcurrence: function (data, creatorId) {
    const list = this.getConcurrences();
    const cl = {
      id:            this.generateId(),
      projectId:     data.projectId,
      drawingTitle:  data.drawingTitle.trim(),
      description:   (data.description || '').trim(),
      reviewers:     data.reviewers || [],
      hodSignOff:    { signed: false, signedBy: null, signedAt: null },
      sentToClient:  false,
      sentAt:        null,
      linkedTaskId:  data.linkedTaskId  || null,
      linkedPdfData: data.linkedPdfData || null,
      linkedPdfName: data.linkedPdfName || null,
      createdBy:     creatorId,
      createdAt:     new Date().toISOString()
    };
    list.push(cl);
    this.saveConcurrences(list);

    // Auto-create a "Concurrence Sign-off" task for every reviewer.
    // If the concurrence is linked to a task that has a PDF, attach that PDF to the sign-off tasks
    // so reviewers can see the drawing directly from their board.
    data.reviewers.forEach(r => {
      this.createTask({
        projectId:         data.projectId,
        title:             `Concurrence: ${cl.drawingTitle}`,
        description:       `Review and sign concurrence for "${cl.drawingTitle}"`,
        priority:          'High',
        dueDate:           data.dueDate || null,
        assigneeIds:       [r.userId],
        assigneeId:        r.userId,
        concurrenceId:     cl.id,
        isConcurrenceTask: true,
        pdfData:           cl.linkedPdfData || null,
        pdfName:           cl.linkedPdfName || null
      }, creatorId);
    });
    return cl;
  },

  updateConcurrence: function (id, data) {
    const list = this.getConcurrences();
    const i    = list.findIndex(c => c.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...data, updatedAt: new Date().toISOString() };
    this.saveConcurrences(list);
    return list[i];
  },

  deleteConcurrence: function (id) {
    this.saveConcurrences(this.getConcurrences().filter(c => c.id !== id));
    // Remove auto-created concurrence tasks too
    this.saveTasks(this.getTasks().filter(t => t.concurrenceId !== id));
  },

  signConcurrence: function (concurrenceId, userId) {
    const list = this.getConcurrences();
    const i    = list.findIndex(c => c.id === concurrenceId);
    if (i === -1) return null;
    const r = list[i].reviewers.find(r => r.userId === userId);
    if (r) { r.signed = true; r.signedAt = new Date().toISOString(); }
    this.saveConcurrences(list);
    // Also mark the linked sign-off task as Done
    const tasks   = this.getTasks();
    const taskIdx = tasks.findIndex(t => t.concurrenceId === concurrenceId && this.isTaskAssignedTo(t, userId));
    if (taskIdx !== -1) {
      tasks[taskIdx].status = 'Done';
      tasks[taskIdx].updatedAt = new Date().toISOString();
      this.saveTasks(tasks);
    }
    return list[i];
  },

  hodSignConcurrence: function (concurrenceId, userId) {
    const list = this.getConcurrences();
    const i    = list.findIndex(c => c.id === concurrenceId);
    if (i === -1) return null;
    list[i].hodSignOff = { signed: true, signedBy: userId, signedAt: new Date().toISOString() };
    this.saveConcurrences(list);
    return list[i];
  },

  markSentToClient: function (concurrenceId) {
    const list = this.getConcurrences();
    const i    = list.findIndex(c => c.id === concurrenceId);
    if (i === -1) return null;
    list[i].sentToClient = true;
    list[i].sentAt       = new Date().toISOString();
    this.saveConcurrences(list);
    return list[i];
  },

  concurrenceAllSigned: function (cl) {
    return cl.reviewers.length > 0 && cl.reviewers.every(r => r.signed);
  },

  // ─── Seed Admin (test account) ──────────────────────────────────
  // Login: admin@lloyds.in  passcode: 1234
  seedAdmin: function () {
    const users = this.getUsers();
    if (users.find(u => u.email === 'admin@lloyds.in')) return;
    users.unshift({
      id:          'lce-admin-001',
      name:        'System Admin',
      designation: 'Deputy General Manager',
      level:       'L',
      grade:       'D3',
      dept:        'Civil & Structural',
      group:       'MANAGEMENT',
      empId:       'ADM001',
      email:       'admin@lloyds.in',
      passcode:    '1234',
      isAdmin:     true,
      createdAt:   new Date().toISOString()
    });
    this.saveUsers(users);
  }
};
