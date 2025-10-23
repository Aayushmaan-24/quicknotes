// app.js (ES module) - QuickNotes with theme toggle

/* ---------- DOM helper needs to be defined first ---------- */
const qs = sel => document.querySelector(sel);

const SUPABASE_ENABLED =
  typeof window !== 'undefined' &&
  !!window.SUPABASE_URL &&
  !!window.SUPABASE_ANON_KEY &&
  typeof window.supabase !== 'undefined';

const supabase = SUPABASE_ENABLED
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

/* ---------- Theme Handling ---------- */
const THEME_KEY = 'quicknotes.theme';

function preferredTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function updateThemeToggleButton(theme) {
  const toggle = qs('#themeToggle');
  if (!toggle) return;
  const icon = toggle.querySelector('.theme-toggle__icon');
  const isLight = theme === 'light';
  toggle.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light'} theme`);
  if (icon) icon.textContent = isLight ? '🌞' : '🌙';
}

function applyTheme(theme) {
  const effectiveTheme = theme || preferredTheme();
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  try {
    localStorage.setItem(THEME_KEY, effectiveTheme);
  } catch (err) {
    console.warn('Theme persistence skipped:', err);
  }
  updateThemeToggleButton(effectiveTheme);
}

function initTheme() {
  let theme = preferredTheme();
  try {
    theme = localStorage.getItem(THEME_KEY) || theme;
  } catch (err) {
    console.warn('Theme load skipped:', err);
  }
  applyTheme(theme);
}

const themeToggle = qs('#themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || preferredTheme();
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}
initTheme();

/* ---------- Element references ---------- */
const createNoteBtn = qs('#createNoteBtn');
const noteListEl = qs('#noteList');
const emptyEl = qs('#empty');
const countEl = qs('#count');

const authForm = qs('#authForm');
const emailInput = qs('#emailInput');
const signOutBtn = qs('#signOutBtn');
const userEmailEl = qs('#userEmail');
const authMsg = qs('#authMsg');

const noteModal = qs('#noteModal');
const noteForm = qs('#noteForm');
const noteTitleInput = qs('#noteTitleInput');
const noteContentInput = qs('#noteContentInput');
const closeModalBtn = qs('#closeModal');
const cancelBtn = qs('#cancelBtn');
const modalTitle = qs('#modalTitle');

/* ---------- State ---------- */
let currentUser = null;
let isSyncing = false;
let notes = []; // {id, title, content, created}
let editingNoteId = null;
let statusTimeoutId = null;

/* ---------- Enhanced Helpers ---------- */
function updateAuthStatus(message, autoHide = true) {
  if (!authMsg) return;
  
  // Clear any existing timeout
  if (statusTimeoutId) {
    clearTimeout(statusTimeoutId);
    statusTimeoutId = null;
  }
  
  authMsg.textContent = message || '';
  authMsg.classList.toggle('visually-hidden', !message);
  
  // Auto-hide success/info messages after 3 seconds
  if (message && autoHide && !message.toLowerCase().includes('error') && !message.toLowerCase().includes('failed')) {
    statusTimeoutId = setTimeout(() => {
      if (authMsg.textContent === message) { // Only clear if message hasn't changed
        authMsg.textContent = '';
        authMsg.classList.add('visually-hidden');
      }
    }, 3000);
  }
}

function updateAuthUI(user) {
  const signedOut = qs('#authSignedOut');
  const signedIn = qs('#authSignedIn');
  const isSignedIn = !!user;
  if (signedOut) signedOut.style.display = isSignedIn ? 'none' : 'block';
  if (signedIn) signedIn.style.display = isSignedIn ? 'flex' : 'none';
  if (userEmailEl) userEmailEl.textContent = isSignedIn ? (user.email || user.id) : '-';
  if (createNoteBtn) createNoteBtn.disabled = !isSignedIn;
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  
  if (isLoading) {
    button.disabled = true;
    button.style.position = 'relative';
    button.style.color = 'transparent';
    
    // Create and add spinner
    const spinner = document.createElement('div');
    spinner.className = 'button-spinner';
    spinner.innerHTML = '⟳';
    button.appendChild(spinner);
  } else {
    button.disabled = false;
    button.style.position = '';
    button.style.color = '';
    
    // Remove spinner
    const spinner = button.querySelector('.button-spinner');
    if (spinner) spinner.remove();
  }
}

// Enhanced sign-out with timeout and fallback
async function performSignOut() {
  const originalText = signOutBtn.textContent;
  
  try {
    setButtonLoading(signOutBtn, true);
    updateAuthStatus('Signing out...');
    
    // Create a promise that times out after 8 seconds
    const signOutPromise = supabase.auth.signOut();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Sign out timed out')), 8000);
    });
    
    // Race between sign-out and timeout
    await Promise.race([signOutPromise, timeoutPromise]);
    
    // Success path
    currentUser = null;
    updateAuthUI(null);
    notes = [];
    render();
    updateAuthStatus('Signed out successfully.');
    
  } catch (err) {
    console.warn('Network sign-out failed, using local fallback:', err);
    
    // Fallback: Clear local state even if network fails
    currentUser = null;
    updateAuthUI(null);
    notes = [];
    render();
    
    if (err.message.includes('timed out')) {
      updateAuthStatus('Signed out (network timeout, using local fallback).');
    } else {
      updateAuthStatus('Signed out (network error, using local fallback).');
    }
  } finally {
    setButtonLoading(signOutBtn, false);
  }
}

function jsUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
async function uid() {
  return jsUid();
}

function noteCountText() {
  const n = notes.length;
  return n === 1 ? '1 note' : `${n} notes`;
}

/* ---------- Supabase CRUD ---------- */
async function cloudLoadNotes(user) {
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, created')
    .eq('user_id', user.id)
    .order('created', { ascending: false });

  if (error) throw error;

  notes = (data || []).map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    created: new Date(r.created).getTime(),
  }));
  console.log(`Loaded ${notes.length} notes from cloud`);
}

async function cloudAddNote(user, note) {
  const payload = {
    id: note.id,
    user_id: user.id,
    title: note.title,
    content: note.content,
    created: new Date(note.created).toISOString(),
  };
  const { error } = await supabase.from('notes').insert([payload]);
  if (error) throw error;
  console.log('Note added to cloud:', note.id);
}

async function cloudUpdateNote(user, note) {
  const { error } = await supabase
    .from('notes')
    .update({ title: note.title, content: note.content })
    .eq('id', note.id)
    .eq('user_id', user.id);
  if (error) throw error;
  console.log('Note updated in cloud:', note.id);
}

async function cloudDeleteNote(user, id) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
  console.log('Note deleted from cloud:', id);
}

/* ---------- Session management ---------- */
async function applySession(session) {
  if (isSyncing) return;
  isSyncing = true;

  currentUser = session?.user ?? null;
  updateAuthUI(currentUser);

  if (currentUser) {
    updateAuthStatus('Loading notes...', false); // Don't auto-hide loading message
    try {
      await cloudLoadNotes(currentUser);
      updateAuthStatus(''); // Clear loading message
    } catch (err) {
      console.error('Failed to load notes:', err);
      updateAuthStatus(`Load failed: ${err.message}`, false); // Don't auto-hide errors
      notes = [];
    }
  } else {
    notes = [];
    updateAuthStatus('');
  }

  render();
  isSyncing = false;
}

async function recoverSessionFromUrl() {
  try {
    const url = new URL(window.location.href);
    const hash = url.hash.startsWith('#') ? new URLSearchParams(url.hash.slice(1)) : null;
    const accessToken = hash?.get('access_token');
    const refreshToken = hash?.get('refresh_token');
    const code = url.searchParams.get('code');

    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) console.warn('setSession error:', error.message);
      history.replaceState({}, document.title, url.pathname);
    } else if (code && supabase.auth.exchangeCodeForSession) {
      await supabase.auth.exchangeCodeForSession(code);
      history.replaceState({}, document.title, url.pathname);
    }
  } catch (err) {
    console.warn('Session recovery skipped:', err);
  }
}

async function initializeAuth() {
  await recoverSessionFromUrl();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) console.warn('getSession error:', error.message);

  await applySession(session);
  supabase.auth.onAuthStateChange((_event, newSession) => applySession(newSession));
}

/* ---------- Auth form handlers ---------- */
if (authForm && supabase) {
  authForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = (emailInput?.value || '').trim();
    if (!email) return;

    updateAuthStatus('Sending magic link...', false);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      console.error('Sign-in error:', error);
      updateAuthStatus(`Error: ${error.message}`, false);
    } else {
      console.log('Magic link sent for:', email);
      updateAuthStatus('Check your email for the login link.');
    }
  });
}

if (signOutBtn && supabase) {
  signOutBtn.addEventListener('click', performSignOut);
}

/* ---------- Modal logic ---------- */
function openModal(editNote = null) {
  editingNoteId = editNote?.id || null;
  modalTitle.textContent = editingNoteId ? 'Edit Note' : 'Create Note';
  noteTitleInput.value = editNote?.title || '';
  noteContentInput.value = editNote?.content || '';
  noteModal.setAttribute('open', '');
  noteModal.setAttribute('aria-hidden', 'false');
  noteTitleInput.focus();
}

function closeModal() {
  editingNoteId = null;
  noteForm.reset();
  noteModal.removeAttribute('open');
  noteModal.setAttribute('aria-hidden', 'true');
}

if (createNoteBtn) {
  createNoteBtn.addEventListener('click', () => {
    if (!currentUser) {
      updateAuthStatus('Please sign in to create notes.');
      return;
    }
    openModal();
  });
}
if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
if (noteModal) {
  noteModal.addEventListener('click', e => {
    if (e.target === noteModal) closeModal();
  });
}

if (noteForm && supabase) {
  noteForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser || isSyncing) return;

    const title = (noteTitleInput?.value || '').trim();
    const content = (noteContentInput?.value || '').trim();
    if (!title || !content) {
      updateAuthStatus('Title and content are required.');
      return;
    }

    updateAuthStatus(editingNoteId ? 'Updating note...' : 'Saving note...', false);
    try {
      if (editingNoteId) {
        const existing = notes.find(n => n.id === editingNoteId);
        if (existing) {
          existing.title = title;
          existing.content = content;
          await cloudUpdateNote(currentUser, existing);
        }
      } else {
        const note = { id: await uid(), title, content, created: Date.now() };
        notes.unshift(note);
        await cloudAddNote(currentUser, note);
      }
      closeModal();
      render();
      updateAuthStatus(editingNoteId ? 'Note updated successfully!' : 'Note saved successfully!');
    } catch (err) {
      console.error('Note save failed:', err);
      updateAuthStatus(`Save failed: ${err.message}`, false);
    }
  });
}

/* ---------- Rendering ---------- */
function render() {
  noteListEl.innerHTML = '';

  if (notes.length === 0) {
    emptyEl.style.display = 'block';
  } else {
    emptyEl.style.display = 'none';
    for (const note of notes) {
      const li = document.createElement('li');
      li.className = 'note-item';

      const titleEl = document.createElement('h3');
      titleEl.className = 'note-title';
      titleEl.textContent = note.title;

      const contentEl = document.createElement('p');
      contentEl.className = 'note-content';
      contentEl.textContent = note.content;

      const actions = document.createElement('div');
      actions.className = 'note-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'Edit';
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => {
        if (!currentUser) {
          updateAuthStatus('Please sign in to edit notes.');
          return;
        }
        openModal(note);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn danger';
      deleteBtn.title = 'Delete';
      deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', async () => {
        if (!currentUser) {
          updateAuthStatus('Please sign in to delete notes.');
          return;
        }
        if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) return;

        try {
          await cloudDeleteNote(currentUser, note.id);
          notes = notes.filter(n => n.id !== note.id);
          render();
          updateAuthStatus('Note deleted successfully!');
        } catch (err) {
          console.error('Delete failed:', err);
          updateAuthStatus(`Delete failed: ${err.message}`, false);
        }
      });

      actions.append(editBtn, deleteBtn);
      li.append(titleEl, contentEl, actions);
      noteListEl.appendChild(li);
    }
  }

  countEl.textContent = noteCountText();
}

/* ---------- Boot ---------- */
if (supabase) {
  initializeAuth();
} else {
  notes = [];
  updateAuthUI(null);
  render();
}