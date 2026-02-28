// auth.js - Authentication Logic for Plant Scope AI

// =========================================================================
// BUG FIX: "An unexpected error occurred" on login
// =========================================================================
// ROOT CAUSE: This file previously used `supabase.auth.signInWithPassword()`
// but `supabase` is the RAW CDN global object (window.supabase) which only
// has the `createClient` method. The actual initialized Supabase client is
// `supabaseClient`, created in supabase.js via:
//     const supabaseClient = supabase.createClient(URL, KEY);
//
// Calling `supabase.auth.signInWithPassword()` on the CDN object throws a
// TypeError (supabase.auth is undefined), which was caught by the generic
// catch block and displayed as "An unexpected error occurred."
//
// FIX: All auth calls now use `supabaseClient` (the initialized instance).
// =========================================================================

/**
 * Handle User Login
 * Logs in existing user with email and password via Supabase Auth.
 */
async function handleLogin(email, password) {
    try {
        // Use supabaseClient (the initialized instance), NOT the CDN's `supabase` global
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Show the specific Supabase error message to the user
            // Common errors: "Invalid login credentials", "Email not confirmed", etc.
            console.error("Login error from Supabase:", error.message);
            alert("Login Failed: " + error.message);
            return;
        }

        // Login succeeded — verify we have a valid session
        if (data && data.session) {
            // Set localStorage flag for auth guard and redirect to dashboard
            localStorage.setItem("isLoggedIn", "true");
            window.location.replace("./index.html");
        } else {
            // Edge case: no error but also no session (e.g. email not confirmed)
            alert("Login issue: Please check your email to confirm your account.");
        }

    } catch (err) {
        // This catch only fires if there's a network/JS error, NOT a Supabase auth error
        console.error("Unexpected error during login:", err);
        alert("Network error: Please check your connection and try again.");
    }
}

/**
 * Handle User Signup
 * Creates a new user in Supabase Auth and inserts a profile row.
 */
async function handleSignup(username, email, password) {
    try {
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) {
            alert("Signup Error: " + authError.message);
            return;
        }

        if (authData.user) {
            // Insert into user_profiles table
            const { error: profileError } = await supabaseClient
                .from('user_profiles')
                .insert([
                    { id: authData.user.id, username: username }
                ]);

            if (profileError) {
                console.error("Profile creation failed:", profileError);
                alert("Account created but profile setup failed. Please contact support.");
            } else {
                alert("Signup successful! Please log in.");
                window.location.href = "./Login.html";
            }
        }
    } catch (err) {
        console.error("Unexpected error during signup:", err);
        alert("Network error: Please check your connection and try again.");
    }
}

/**
 * Handle User Logout
 * Signs out the user and redirects to login page.
 */
async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error("Logout error:", error.message);
        }
        // Clear login flag and redirect to login page
        localStorage.removeItem("isLoggedIn");
        window.location.replace("./Login.html");
    } catch (err) {
        console.error("Unexpected error during logout:", err);
        localStorage.removeItem("isLoggedIn");
        window.location.replace("./Login.html");
    }
}

/**
 * Check Authentication Session
 * Protects pages by redirecting based on Supabase session state.
 */
async function checkAuth() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const session = data ? data.session : null;
        const path = window.location.pathname;

        const isAuthPage = path.includes('Login.html') || path.includes('signup.html');

        if (!session && !isAuthPage) {
            localStorage.removeItem("isLoggedIn");
            window.location.replace("./Login.html");
        } else if (session && isAuthPage) {
            localStorage.setItem("isLoggedIn", "true");
            window.location.replace("./index.html");
        }
    } catch (err) {
        console.error("Error checking auth session:", err);
    }
}

/**
 * Get Current User Helper
 * Returns the user object if logged in, null otherwise.
 */
async function getCurrentUser() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        return data?.session?.user || null;
    } catch (err) {
        console.error("Error getting current user:", err);
        return null;
    }
}

// Listen for auth state changes (e.g. token expiration, sign out)
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        const path = window.location.pathname;
        if (!path.includes('Login.html') && !path.includes('signup.html')) {
            localStorage.removeItem("isLoggedIn");
            window.location.replace("./Login.html");
        }
    }
});
