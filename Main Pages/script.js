/* =========================================
   1. AUTHENTICATION CHECK (Supabase)
   =========================================
   This uses Supabase for session management.
   Ensure supabase.js is loaded BEFORE this script.
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is logged in via Supabase
    // This runs on protected pages (index.html, monitoring.html, Streaks.html, etc.)

    // Note: checkAuth() in auth.js handles redirection.
    // getCurrentUser() is also in auth.js now.

    if (typeof getCurrentUser !== 'function') {
        console.warn('auth.js not loaded? getCurrentUser is missing.');
        return;
    }

    const user = await getCurrentUser();

    if (!user) {
        // auth.js checkAuth() should have handled this, but double check for non-auth pages
        // or if we need specific UI updates for non-logged in users on public pages.
        // For now, we trust checkAuth() for protection.
        console.log("No active user session found.");
    } else {
        // User is logged in, display email if a welcome element exists
        const welcomeEl = document.getElementById('user-email');
        if (welcomeEl && user.email) {
            welcomeEl.textContent = user.email;
        }
    }

    // Setup Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (typeof handleLogout === 'function') {
                await handleLogout();
            } else {
                console.error("handleLogout function missing from auth.js");
                window.location.replace("./Login.html");
            }
        });
    }

    // Initialize Components
    // Chatbot is now handled by chat.js
});

/* =========================================
   2. PAGE TRANSITIONS
   ========================================= */
function handleTransition(event, url) {
    event.preventDefault();

    // Add fade-out class to body
    document.body.classList.add('fade-out');

    // Wait for animation to finish then navigate
    setTimeout(() => {
        window.location.href = url;
    }, 500); // 500ms matches CSS transition/animation time
}
