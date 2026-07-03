// ============================================================
// ShareHood - Authentication Module (auth.js)
// Handles login, register, token storage, and boot sequence
// ============================================================

window.sharehoodAuth = {
  token: null,
  currentUser: null,

  getToken() {
    return localStorage.getItem('sharehood_token');
  },

  setToken(token) {
    localStorage.setItem('sharehood_token', token);
    this.token = token;
  },

  clearToken() {
    localStorage.removeItem('sharehood_token');
    this.token = null;
    this.currentUser = null;
  },

  getAuthHeaders() {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },

  async fetchWithAuth(url, options = {}) {
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      this.logout();
      return null;
    }
    return response;
  },

  async verifyToken() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        this.clearToken();
        return null;
      }
      const user = await res.json();
      this.currentUser = user;
      return user;
    } catch {
      this.clearToken();
      return null;
    }
  },

  logout() {
    this.clearToken();
    showAuthOverlay();
    hideApp();
    // Clear nav
    document.getElementById('navAvatar').textContent = '?';
    document.getElementById('navUserName').textContent = 'Loading...';
    document.getElementById('navNeighborhood').textContent = '';
    document.getElementById('walletBalance').textContent = '-- TF';
    document.getElementById('walletLocked').textContent = '(0 Locked)';
  },

  updateNavProfile(user) {
    document.getElementById('navAvatar').textContent = user.avatar || user.name.slice(0, 2).toUpperCase();
    document.getElementById('navUserName').textContent = user.name;
    document.getElementById('navNeighborhood').textContent = user.neighborhood;
    document.getElementById('walletBalance').textContent = `${user.wallet} TF`;
    document.getElementById('walletLocked').textContent = `(${user.lockedFunds || 0} Locked)`;
    document.getElementById('currentNeighborLabel').textContent = user.neighborhood;
  }
};

// ===================== UI HELPERS =====================

function showAuthOverlay() {
  document.getElementById('authOverlay').classList.remove('auth-hidden');
  document.getElementById('authOverlay').classList.add('auth-visible');
}

function hideAuthOverlay() {
  document.getElementById('authOverlay').classList.add('auth-hidden');
  document.getElementById('authOverlay').classList.remove('auth-visible');
}

function showApp() {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.classList.remove('app-hidden');
    appContainer.classList.add('app-visible');
  }
}

function hideApp() {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.classList.add('app-hidden');
    appContainer.classList.remove('app-visible');
  }
}

function showAuthError(formType, message) {
  const el = document.getElementById(formType === 'login' ? 'loginError' : 'registerError');
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.add('auth-error-show');
}

function clearAuthError(formType) {
  const el = document.getElementById(formType === 'login' ? 'loginError' : 'registerError');
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('auth-error-show');
}

function setButtonLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const span = btn.querySelector('span');
  if (span) span.textContent = loading ? 'Please wait...' : defaultText;
  if (loading) btn.classList.add('loading');
  else btn.classList.remove('loading');
}

// ===================== FORM SWITCHER =====================

function switchToForm(form) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginBtn = document.getElementById('showLoginBtn');
  const registerBtn = document.getElementById('showRegisterBtn');

  if (form === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
    clearAuthError('login');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    registerBtn.classList.add('active');
    loginBtn.classList.remove('active');
    clearAuthError('register');
  }
}

// ===================== LOGIN =====================

async function handleLogin(e) {
  e.preventDefault();
  clearAuthError('login');

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    return showAuthError('login', 'Please fill in all fields.');
  }

  setButtonLoading('loginSubmitBtn', true, 'Sign In');
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthError('login', data.error || 'Login failed. Please try again.');
    } else {
      sharehoodAuth.setToken(data.token);
      sharehoodAuth.currentUser = data.user;
      onAuthSuccess(data.user);
    }
  } catch (err) {
    showAuthError('login', 'Network error. Please try again.');
  } finally {
    setButtonLoading('loginSubmitBtn', false, 'Sign In');
  }
}

// ===================== REGISTER =====================

async function handleRegister(e) {
  e.preventDefault();
  clearAuthError('register');

  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const neighborhood = document.getElementById('regNeighborhood').value.trim();
  const password = document.getElementById('regPassword').value;

  if (!name || !email || !neighborhood || !password) {
    return showAuthError('register', 'Please fill in all fields.');
  }

  setButtonLoading('registerSubmitBtn', true, 'Create Account');
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, neighborhood, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showAuthError('register', data.error || 'Registration failed. Please try again.');
    } else {
      sharehoodAuth.setToken(data.token);
      sharehoodAuth.currentUser = data.user;
      onAuthSuccess(data.user);
    }
  } catch (err) {
    showAuthError('register', 'Network error. Please try again.');
  } finally {
    setButtonLoading('registerSubmitBtn', false, 'Create Account');
  }
}

// ===================== POST-AUTH =====================

function onAuthSuccess(user) {
  sharehoodAuth.updateNavProfile(user);
  hideAuthOverlay();
  showApp();

  // Initialize app after auth
  if (window.sharehoodApp && typeof window.sharehoodApp.init === 'function') {
    window.sharehoodApp.init(user);
  }
  // Register socket user
  if (window.sharehoodSocket) {
    window.sharehoodSocket.registerUser(user.id);
  }
}

// ===================== BOOT =====================

document.addEventListener('DOMContentLoaded', async () => {
  // Initially hide app, show auth
  hideApp();
  showAuthOverlay();

  // Wire up tab switchers
  document.getElementById('showLoginBtn').addEventListener('click', () => switchToForm('login'));
  document.getElementById('showRegisterBtn').addEventListener('click', () => switchToForm('register'));
  document.getElementById('toRegisterLink').addEventListener('click', () => switchToForm('register'));
  document.getElementById('toLoginLink').addEventListener('click', () => switchToForm('login'));

  // Wire up forms
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);

  // Wire up logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to sign out?')) {
      sharehoodAuth.logout();
    }
  });

  // Try auto-login from stored token
  const existingUser = await sharehoodAuth.verifyToken();
  if (existingUser) {
    onAuthSuccess(existingUser);
  }
});
