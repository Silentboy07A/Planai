/* =========================================
   SUPABASE CLIENT INITIALIZATION
   =========================================
   This file initializes the Supabase client for authentication.
   Place this file in: Main Pages/supabase.js
   ========================================= */

// Supabase Configuration (Replace with your own if needed)
const SUPABASE_URL = "https://onsbkwplfhhimxqtirhf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uc2Jrd3BsZmhoaW14cXRpcmhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMjAzNjQsImV4cCI6MjA3Njg5NjM2NH0.jSQVa5OWDJU4CXd1Tzf8lvGgsuIGqweK5ryIN31s4Rk";

// Initialize the Supabase Client
// Note: 'supabase' is the global object from the CDN script
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =========================================
   HELPER FUNCTIONS
   ========================================= */

/**
 * Send a Magic Link to the user's email
 * @param {string} email - User's email address
 * @returns {Promise} - Supabase response
 */
async function sendMagicLink(email) {
    const { data, error } = await supabaseClient.auth.signInWithOtp({
        email: email,
        options: {
            // After clicking the magic link, redirect here:
            emailRedirectTo: window.location.origin + '/Main Pages/index.html'
        }
    });

    if (error) {
        console.error('Magic Link Error:', error.message);
        throw error;
    }

    return data;
}

/**
 * Check if a user session exists
 * @returns {Promise<object|null>} - User object or null
 */
async function getCurrentUser() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error('Session Error:', error.message);
        return null;
    }

    return session?.user || null;
}

/**
 * Logout the current user
 * @returns {Promise}
 */
async function logoutUser() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error('Logout Error:', error.message);
        throw error;
    }

    // Redirect to login page after logout
    window.location.href = 'Login.html';
}

/**
 * Protect a page - redirect to login if not authenticated
 * Call this at the top of protected pages (e.g., index.html, monitoring.html)
 */
async function requireAuth() {
    const user = await getCurrentUser();

    if (!user) {
        // Not logged in, redirect to login
        window.location.href = 'Login.html';
        return false;
    }

    return true;
}
