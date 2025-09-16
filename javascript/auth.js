class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Check if user is already logged in
        window.firebaseAuth.onAuthStateChanged(window.auth, (user) => {
            if (user && user.email === 'admin@aurorus.org') {
                this.currentUser = user;
                this.redirectToDashboard();
            } else if (window.location.pathname.includes('login.html') || window.location.pathname === '/') {
                this.showLogin();
            } else {
                // Redirect to login if not authenticated
                window.location.href = 'login.html';
            }
        });
    }

    async login(email, password) {
        try {
            this.showLoading(true);
            const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(window.auth, email, password);
            
            if (userCredential.user.email === 'admin@aurorus.org') {
                this.currentUser = userCredential.user;
                this.showSuccessMessage('Login successful! Redirecting...');
                setTimeout(() => {
                    this.redirectToDashboard();
                }, 1000);
            } else {
                throw new Error('Access denied. Admin privileges required.');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError(this.getErrorMessage(error));
        } finally {
            this.showLoading(false);
        }
    }

    async logout() {
        try {
            await window.firebaseAuth.signOut(window.auth);
            this.currentUser = null;
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Logout error:', error);
            this.showError('Error logging out. Please try again.');
        }
    }

    redirectToDashboard() {
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'index.html';
        }
    }

    showLogin() {
        // This method is called when user needs to login
        // The login form is already visible on login.html
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
            
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                errorDiv.classList.add('hidden');
            }, 5000);
        } else {
            this.showNotification(message, 'error');
        }
    }

    showSuccessMessage(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    showLoading(show) {
        const submitBtn = document.querySelector('#loginForm button[type="submit"]');
        if (submitBtn) {
            if (show) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner"></span> Signing in...';
            } else {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Sign In';
            }
        }
    }

    getErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found':
                return 'No user found with this email address.';
            case 'auth/wrong-password':
                return 'Incorrect password. Please try again.';
            case 'auth/invalid-email':
                return 'Invalid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your connection.';
            default:
                return error.message || 'An error occurred during login.';
        }
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// Initialize auth when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
    
    // Set up login form if it exists
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            if (!email || !password) {
                window.authManager.showError('Please fill in all fields.');
                return;
            }
            
            await window.authManager.login(email, password);
        });
    }

    // Set up logout button if it exists
    const logoutBtn = document.querySelector('.logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.authManager.logout();
        });
    }

    // Update the right sidebar date to today's date
    try {
        const dateElements = document.querySelectorAll('.dashboard .date');
        if (dateElements && dateElements.length > 0) {
            const now = new Date();
            const formatted = now.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });
            dateElements.forEach(el => {
                el.textContent = formatted;
            });
        }
    } catch (err) {
        console.error('Error setting sidebar date:', err);
    }
});
