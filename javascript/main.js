class App {
    constructor() {
        this.currentSection = 'checkin';
        this.dashboardManager = null;
        this.init();
    }

    init() {
        // Wait for auth to be ready
        if (window.authManager && window.authManager.isAuthenticated()) {
            this.initializeApp();
        } else {
            // Wait for auth state change
            window.firebaseAuth.onAuthStateChanged(window.auth, (user) => {
                if (user && user.email === 'admin@aurorus.org') {
                    this.initializeApp();
                }
            });
        }
    }

    initializeApp() {
        this.setupEventListeners();
        this.initializeDashboard();
        this.loadInitialData();
    }

    setupEventListeners() {
        // NFC toggle
        const nfcToggle = document.getElementById('nfcToggle');
        if (nfcToggle) {
            nfcToggle.addEventListener('click', () => {
                this.toggleNFC();
            });
        }

        // NFC Check-in button
        const nfcCheckInBtn = document.getElementById('nfcCheckInBtn');
        if (nfcCheckInBtn) {
            nfcCheckInBtn.addEventListener('click', () => {
                this.startNFCCheckIn();
            });
        }

        // Terminal toggle
        const terminalToggle = document.getElementById('terminalToggle');
        if (terminalToggle) {
            terminalToggle.addEventListener('click', () => {
                this.toggleTerminal();
            });
        }

        // Close terminal
        const closeTerminal = document.getElementById('closeTerminal');
        if (closeTerminal) {
            closeTerminal.addEventListener('click', () => {
                this.toggleTerminal();
            });
        }

        // Clear terminal
        const clearTerminal = document.getElementById('clearTerminal');
        if (clearTerminal) {
            clearTerminal.addEventListener('click', () => {
                this.clearTerminal();
            });
        }
    }

    initializeDashboard() {
        this.dashboardManager = new DashboardManager();
        window.dashboardManager = this.dashboardManager;
    }

    async toggleNFC() {
        const button = document.getElementById('nfcToggle');
        if (!button) return;

        if (window.nfcManager.isMonitoring) {
            window.nfcManager.stopMonitoring();
            button.innerHTML = '<i class="fas fa-wifi"></i> Start NFC Reader';
            button.classList.remove('active');
        } else {
            // Show terminal when starting NFC (especially useful for ACR122U bridge)
            const terminal = document.getElementById('terminal');
            if (terminal && terminal.classList.contains('hidden')) {
                this.toggleTerminal();
            }

            const started = await window.nfcManager.startCheckIn();
            if (started) {
                button.innerHTML = '<i class="fas fa-wifi"></i> Stop NFC Reader';
                button.classList.add('active');
            } else {
                // If NFC failed to start, show manual entry option
                this.showManualEntryOption();
            }
        }
    }

    async startNFCCheckIn() {
        // Show terminal when starting NFC
        const terminal = document.getElementById('terminal');
        if (terminal && terminal.classList.contains('hidden')) {
            this.toggleTerminal();
        }

        const started = await window.nfcManager.startCheckIn();
        if (!started) {
            this.showManualEntryOption();
        }
    }

    showManualEntryOption() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>NFC Not Available</h3>
                <p>Unable to connect to NFC reader. This could be because:</p>
                <ul style="text-align: left; margin: 1rem 0;">
                    <li>ACR122U bridge is not running (start with: <code>py "Aurorus 3/bridge.py"</code>)</li>
                    <li>Web NFC not supported on this device</li>
                </ul>
                <p>You can manually enter check-in data for testing:</p>
                <form id="manualCheckinForm">
                    <div class="form-group">
                        <label for="manualUserId">User ID</label>
                        <input type="text" id="manualUserId" required placeholder="Enter user ID">
                    </div>
                    <div class="form-group">
                        <label for="manualUserName">User Name</label>
                        <input type="text" id="manualUserName" required placeholder="Enter user name">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Process Check-in</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle form submission
        const form = document.getElementById('manualCheckinForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('manualUserId').value.trim();
            const userName = document.getElementById('manualUserName').value.trim();
            
            if (userId && userName) {
                // Process manual check-in
                await this.processManualCheckIn(userId, userName);
                modal.remove();
            }
        });
    }

    async processManualCheckIn(userId, userName) {
        try {
            // Check if user already checked in today
            const today = new Date().toISOString().split('T')[0];
            // Use userId as the key with nested checkins
            const userRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN/' + userId);
            const snapshot = await window.firebaseDatabase.get(userRef);
            const existing = snapshot.val();

            const alreadyToday = (() => {
                if (!existing) return false;
                if (typeof existing === 'string') return existing.startsWith(today);
                if (existing && typeof existing.timestamp === 'string') return existing.timestamp.startsWith(today);
                if (typeof existing === 'object') {
                    return Object.values(existing).some(v => {
                        if (typeof v === 'string') return v.startsWith(today);
                        return v && typeof v.timestamp === 'string' && v.timestamp.startsWith(today);
                    });
                }
                return false;
            })();
            if (alreadyToday) {
                this.showNotification('User has already checked in today', 'error');
                return;
            }

            // Save check-in as child node with timestamp
            const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
            const checkinRef = window.firebaseDatabase.push(userRef);
            await window.firebaseDatabase.set(checkinRef, { timestamp });
            
            this.showNotification(`Check-in successful for ${userName}`, 'success');
            
            // Refresh dashboard data
            if (window.dashboardManager) {
                window.dashboardManager.loadCheckInData();
            }
            
        } catch (error) {
            console.error('Error processing manual check-in:', error);
            this.showNotification('Error processing check-in', 'error');
        }
    }

    toggleTerminal() {
        const terminal = document.getElementById('terminal');
        const button = document.getElementById('terminalToggle');
        
        if (!terminal || !button) return;

        if (terminal.classList.contains('hidden')) {
            terminal.classList.remove('hidden');
            button.textContent = 'Hide Terminal';
        } else {
            terminal.classList.add('hidden');
            button.textContent = 'Show Terminal';
        }
    }

    clearTerminal() {
        const terminalContent = document.getElementById('terminalContent');
        if (terminalContent) {
            terminalContent.innerHTML = '';
        }
    }

    async loadInitialData() {
        if (this.dashboardManager) {
            await this.dashboardManager.loadDashboardStats();
            await this.dashboardManager.loadCheckInData();
        }
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
}

class DashboardManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add any dashboard-specific event listeners here
    }

    async loadDashboardStats() {
        try {
            // Load today's check-ins count
            const today = new Date().toISOString().split('T')[0];
            const checkInsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN'));
            const checkIns = checkInsSnapshot.val() || {};
            let todayCheckIns = 0;
            Object.values(checkIns).forEach(value => {
                if (typeof value === 'string') {
                    if (value.startsWith(today)) todayCheckIns += 1;
                } else if (value && typeof value.timestamp === 'string') {
                    if (value.timestamp.startsWith(today)) todayCheckIns += 1;
                } else if (value && typeof value === 'object') {
                    Object.values(value).forEach(v => {
                        if (typeof v === 'string') {
                            if (v.startsWith(today)) todayCheckIns += 1;
                        } else if (v && typeof v.timestamp === 'string') {
                            if (v.timestamp.startsWith(today)) todayCheckIns += 1;
                        }
                    });
                }
            });

            const todayCheckinsElement = document.querySelector('.stat-item:nth-child(1) .stat-value');
            if (todayCheckinsElement) {
                todayCheckinsElement.textContent = todayCheckIns;
            }

            // Load total credits issued today
            const creditsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'));
            const credits = creditsSnapshot.val() || {};
            let totalCreditsIssued = 0;
            
            Object.values(credits).forEach(userCredits => {
                Object.values(userCredits).forEach(transaction => {
                    if (transaction.timestamp && transaction.timestamp.startsWith(today) && 
                        transaction.transactionType === 'RECEIVED') {
                        totalCreditsIssued += parseFloat(transaction.creditsReceived || 0);
                    }
                });
            });

            const totalCreditsElement = document.querySelector('.stat-item:nth-child(2) .stat-value');
            if (totalCreditsElement) {
                totalCreditsElement.textContent = `$${totalCreditsIssued.toFixed(2)}`;
            }

            // Load active products count
            const productsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
            const products = productsSnapshot.val() || {};
            const activeProducts = Object.values(products).filter(product => 
                product.stock > 0
            ).length;

            const activeProductsElement = document.querySelector('.stat-item:nth-child(3) .stat-value');
            if (activeProductsElement) {
                activeProductsElement.textContent = activeProducts;
            }

            // Load upcoming events count
            const eventsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS'));
            const events = eventsSnapshot.val() || {};
            const todayDate = new Date();
            const upcomingEvents = Object.values(events).filter(event => 
                event.eventDate && new Date(event.eventDate) >= todayDate
            ).length;

            const upcomingEventsElement = document.querySelector('.stat-item:nth-child(4) .stat-value');
            if (upcomingEventsElement) {
                upcomingEventsElement.textContent = upcomingEvents;
            }

        } catch (error) {
            console.error('Error loading dashboard stats:', error);
        }
    }

    async loadCheckInData() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN'));
            const checkIns = snapshot.val() || {};
            
            const today = new Date().toISOString().split('T')[0];
            const todayCheckIns = [];
            Object.entries(checkIns).forEach(([userId, value]) => {
                if (typeof value === 'string') {
                    if (value.startsWith(today)) {
                        todayCheckIns.push({
                            userId,
                            userName: userId,
                            time: new Date(value.replace(' ', 'T')).toLocaleTimeString(),
                            status: 'Present'
                        });
                    }
                } else if (value && typeof value.timestamp === 'string') {
                    if (value.timestamp.startsWith(today)) {
                        todayCheckIns.push({
                            userId,
                            userName: value.userName || userId,
                            time: new Date(value.timestamp).toLocaleTimeString(),
                            status: value.status || 'Present'
                        });
                    }
                } else if (value && typeof value === 'object') {
                    Object.values(value).forEach(v => {
                        if (typeof v === 'string') {
                            if (v.startsWith(today)) {
                                todayCheckIns.push({
                                    userId,
                                    userName: userId,
                                    time: new Date(v.replace(' ', 'T')).toLocaleTimeString(),
                                    status: 'Present'
                                });
                            }
                        } else if (v && typeof v.timestamp === 'string') {
                            if (v.timestamp.startsWith(today)) {
                                todayCheckIns.push({
                                    userId,
                                    userName: v.userName || userId,
                                    time: new Date(v.timestamp).toLocaleTimeString(),
                                    status: v.status || 'Present'
                                });
                            }
                        }
                    });
                }
            });
            todayCheckIns.sort((a, b) => b.time.localeCompare(a.time));

            this.renderCheckInTable(todayCheckIns);
        } catch (error) {
            console.error('Error loading check-in data:', error);
        }
    }

    renderCheckInTable(checkIns) {
        const tableBody = document.querySelector('.table-body');
        if (!tableBody) return;

        if (checkIns.length === 0) {
            tableBody.innerHTML = '<div class="table-row"><div class="table-cell" style="grid-column: 1 / -1; text-align: center;">No check-ins today</div></div>';
            return;
        }

        tableBody.innerHTML = checkIns.map(checkIn => `
            <div class="table-row">
                <div class="table-cell">${checkIn.userId}</div>
                <div class="table-cell">${checkIn.userName}</div>
                <div class="table-cell">${checkIn.time}</div>
                <div class="table-cell status-active">${checkIn.status}</div>
            </div>
        `).join('');
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
}

// Initialize app when DOM is loaded and Firebase is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the main page (not login)
    if (!window.location.pathname.includes('login.html')) {
        // Wait for Firebase to be ready
        if (window.firebaseReady) {
            window.app = new App();
        } else {
            window.addEventListener('firebaseReady', () => {
                window.app = new App();
            });
        }
    }
});
