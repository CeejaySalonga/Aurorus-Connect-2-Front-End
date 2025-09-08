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
        // Sidebar navigation
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) {
                    this.showSection(section);
                } else if (link.id === 'logoutBtn') {
                    this.logout();
                }
            });
        });

        // NFC toggle
        const nfcToggle = document.getElementById('nfcToggle');
        if (nfcToggle) {
            nfcToggle.addEventListener('click', () => {
                this.toggleNFC();
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

    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Show selected section
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) {
            targetSection.classList.add('active');
            this.currentSection = sectionName;
            document.getElementById('pageTitle').textContent = this.getSectionTitle(sectionName);
            
            // Load section-specific data
            this.loadSectionData(sectionName);
        }

        // Update sidebar active state
        document.querySelectorAll('.sidebar-menu a').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    getSectionTitle(sectionName) {
        const titles = {
            'checkin': 'Check-in Management',
            'credits': 'Store Credits',
            'products': 'Product Management',
            'events': 'Event Management',
            'archive': 'Archive'
        };
        return titles[sectionName] || 'Dashboard';
    }

    loadSectionData(sectionName) {
        if (this.dashboardManager) {
            switch (sectionName) {
                case 'checkin':
                    this.dashboardManager.loadCheckInData();
                    break;
                case 'credits':
                    this.dashboardManager.loadCreditData();
                    break;
                case 'products':
                    if (window.productManager) {
                        window.productManager.loadProducts();
                    }
                    break;
                case 'events':
                    if (window.eventManager) {
                        window.eventManager.loadEvents();
                    }
                    break;
                case 'archive':
                    if (window.archiveManager) {
                        window.archiveManager.loadArchiveData();
                    }
                    break;
            }
        }
    }

    async toggleNFC() {
        const button = document.getElementById('nfcToggle');
        if (!button) return;

        if (window.nfcManager.isMonitoring) {
            window.nfcManager.stopMonitoring();
            button.textContent = 'Start NFC Reader';
            button.classList.remove('active');
        } else {
            // Show terminal when starting NFC (especially useful for ACR122U bridge)
            const terminal = document.getElementById('terminal');
            if (terminal && terminal.classList.contains('hidden')) {
                this.toggleTerminal();
            }

            const started = await window.nfcManager.startCheckIn();
            if (started) {
                button.textContent = 'Stop NFC Reader';
                button.classList.add('active');
            } else {
                // If NFC failed to start, show manual entry option
                this.showManualEntryOption();
            }
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
            const checkInRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN/' + userId);
            const snapshot = await window.firebaseDatabase.get(checkInRef);
            const existingCheckIn = snapshot.val();
            
            if (existingCheckIn && existingCheckIn.timestamp && existingCheckIn.timestamp.startsWith(today)) {
                this.showNotification('User has already checked in today', 'error');
                return;
            }

            // Save check-in to Firebase
            const checkInData = {
                userId: userId,
                userName: userName,
                timestamp: new Date().toISOString(),
                date: today,
                status: 'Present',
                method: 'Manual Entry'
            };

            await window.firebaseDatabase.set(checkInRef, checkInData);
            
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

    async logout() {
        try {
            await window.firebaseAuth.signOut(window.auth);
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error logging out:', error);
            this.showNotification('Error logging out. Please try again.', 'error');
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
        // Add credits button
        const addCreditsBtn = document.getElementById('addCreditsBtn');
        if (addCreditsBtn) {
            addCreditsBtn.addEventListener('click', () => {
                this.showAddCreditsForm();
            });
        }
    }

    async loadDashboardStats() {
        try {
            // Load today's check-ins count
            const today = new Date().toISOString().split('T')[0];
            const checkInsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN'));
            const checkIns = checkInsSnapshot.val() || {};
            const todayCheckIns = Object.values(checkIns).filter(checkIn => 
                checkIn.timestamp && checkIn.timestamp.startsWith(today)
            ).length;

            const todayCheckinsElement = document.getElementById('todayCheckins');
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

            const totalCreditsElement = document.getElementById('totalCreditsIssued');
            if (totalCreditsElement) {
                totalCreditsElement.textContent = `$${totalCreditsIssued.toFixed(2)}`;
            }

            // Load active products count
            const productsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
            const products = productsSnapshot.val() || {};
            const activeProducts = Object.values(products).filter(product => 
                product.stock > 0
            ).length;

            const activeProductsElement = document.getElementById('activeProducts');
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

            const upcomingEventsElement = document.getElementById('upcomingEvents');
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
            const todayCheckIns = Object.entries(checkIns)
                .filter(([_, checkIn]) => checkIn.timestamp && checkIn.timestamp.startsWith(today))
                .map(([userId, checkIn]) => ({
                    userId,
                    userName: checkIn.userName,
                    time: new Date(checkIn.timestamp).toLocaleTimeString(),
                    status: checkIn.status || 'Present'
                }))
                .sort((a, b) => b.time.localeCompare(a.time));

            this.renderCheckInTable(todayCheckIns);
        } catch (error) {
            console.error('Error loading check-in data:', error);
        }
    }

    renderCheckInTable(checkIns) {
        const tbody = document.getElementById('checkinTableBody');
        if (!tbody) return;

        if (checkIns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No check-ins today</td></tr>';
            return;
        }

        tbody.innerHTML = checkIns.map(checkIn => `
            <tr>
                <td>${checkIn.userId}</td>
                <td>${checkIn.userName}</td>
                <td>${checkIn.time}</td>
                <td><span class="status-badge status-present">${checkIn.status}</span></td>
            </tr>
        `).join('');
    }

    async loadCreditData() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'));
            const credits = snapshot.val() || {};
            
            const allTransactions = [];
            Object.entries(credits).forEach(([userId, userCredits]) => {
                Object.entries(userCredits).forEach(([transactionId, transaction]) => {
                    allTransactions.push({
                        userId,
                        transactionId,
                        ...transaction
                    });
                });
            });

            // Sort by timestamp (newest first)
            allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            this.renderCreditTable(allTransactions.slice(0, 50)); // Show last 50 transactions
        } catch (error) {
            console.error('Error loading credit data:', error);
        }
    }

    renderCreditTable(transactions) {
        const tbody = document.getElementById('creditsTableBody');
        if (!tbody) return;

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No credit transactions</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(transaction => `
            <tr>
                <td>${transaction.userId}</td>
                <td><span class="transaction-type ${transaction.transactionType.toLowerCase()}">${transaction.transactionType}</span></td>
                <td>$${transaction.creditsReceived || transaction.creditsDeducted || '0'}</td>
                <td>${new Date(transaction.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
    }

    showAddCreditsForm() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Add Credits</h3>
                <form id="addCreditsForm">
                    <div class="form-group">
                        <label for="creditAmount">Credit Amount</label>
                        <input type="number" id="creditAmount" step="0.01" min="0" required placeholder="Enter amount">
                    </div>
                    <div class="form-group">
                        <label for="creditReason">Reason (Optional)</label>
                        <input type="text" id="creditReason" placeholder="e.g., Event participation, bonus">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Start NFC Reader</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle form submission
        const form = document.getElementById('addCreditsForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('creditAmount').value;
            const reason = document.getElementById('creditReason').value;
            
            if (!amount || parseFloat(amount) <= 0) {
                this.showNotification('Please enter a valid amount', 'error');
                return;
            }

            // Close the form modal
            modal.remove();

            // Start NFC reader for credit receive
            const started = await window.nfcManager.startCreditReceive(amount);
            if (started) {
                this.showNotification('NFC reader started. Please tap a card to add credits.', 'success');
            }
        });
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
