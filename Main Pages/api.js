// api.js — Centralized API client for Plant Scope AI
// Replaces Supabase with JWT-based auth against our own backend.

const API_BASE = window.location.origin || 'http://localhost:3000';

/**
 * Get the stored JWT token.
 */
function getToken() {
    return localStorage.getItem('plantscope_token');
}

/**
 * Get the stored user info.
 */
function getUser() {
    const raw = localStorage.getItem('plantscope_user');
    return raw ? JSON.parse(raw) : null;
}

/**
 * Check if user is logged in.
 */
function isLoggedIn() {
    return !!getToken();
}

/**
 * Save auth data after login/signup.
 */
function saveAuth(token, user) {
    localStorage.setItem('plantscope_token', token);
    localStorage.setItem('plantscope_user', JSON.stringify(user));
}

/**
 * Clear auth data on logout.
 */
function clearAuth() {
    localStorage.removeItem('plantscope_token');
    localStorage.removeItem('plantscope_user');
    // Also clear legacy Supabase flags
    localStorage.removeItem('isLoggedIn');
}

/**
 * Make an authenticated API request.
 */
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    // If token expired, redirect to login
    if (response.status === 401) {
        clearAuth();
        window.location.replace('./Login.html');
        return null;
    }

    return response;
}

/**
 * Signup — create a new account.
 */
async function apiSignup(username, email, password) {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
    }

    saveAuth(data.token, data.user);
    return data;
}

/**
 * Login — authenticate with email and password.
 */
async function apiLogin(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Login failed');
    }

    saveAuth(data.token, data.user);
    return data;
}

/**
 * Logout — clear token and redirect.
 */
function apiLogout() {
    clearAuth();
    window.location.replace('./Login.html');
}

/**
 * Google OAuth — send ID token to backend for verification.
 */
async function apiGoogleLogin(credential) {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || 'Google sign-in failed');
    }

    saveAuth(data.token, data.user);
    return data;
}

/**
 * Protect a page — redirect to login if not authenticated.
 * Call this at the top of protected pages.
 */
function requireAuth() {
    if (!isLoggedIn()) {
        window.location.replace('./Login.html');
        return false;
    }
    return true;
}

/**
 * Redirect away from auth pages if already logged in.
 */
function redirectIfLoggedIn() {
    if (isLoggedIn()) {
        window.location.replace('./index.html');
    }
}
