class CreditManager {
    constructor() {
        this.creditHistory = [];
        this.userCredits = {};
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Wait for Firebase to be ready before loading data
        if (window.firebaseReady) {
            this.loadCreditData();
            this.setupRealtimeListeners();
        } else {
            window.addEventListener('firebaseReady', () => {
                this.loadCreditData();
                this.setupRealtimeListeners();
            });
        }
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

    setupRealtimeListeners() {
        // Listen for credit changes
        window.firebaseDatabase.onValue(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'), (snapshot) => {
            this.loadCreditData();
        });

        // Listen for user credit changes
        window.firebaseDatabase.onValue(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS'), (snapshot) => {
            this.loadUserCredits();
        });
    }

    async loadCreditData() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'));
            const credits = snapshot.val() || {};
            
            this.creditHistory = [];
            Object.entries(credits).forEach(([userId, userCredits]) => {
                Object.entries(userCredits).forEach(([transactionId, transaction]) => {
                    this.creditHistory.push({
                        userId,
                        transactionId,
                        ...transaction
                    });
                });
            });

            // Sort by timestamp (newest first)
            this.creditHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            this.renderCreditTable();
        } catch (error) {
            console.error('Error loading credit data:', error);
            this.showNotification('Error loading credit data', 'error');
        }
    }

    async loadUserCredits() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS'));
            this.userCredits = snapshot.val() || {};
        } catch (error) {
            console.error('Error loading user credits:', error);
        }
    }

    renderCreditTable() {
        const tbody = document.getElementById('creditsTableBody');
        if (!tbody) return;

        if (this.creditHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No credit transactions</td></tr>';
            return;
        }

        tbody.innerHTML = this.creditHistory.slice(0, 50).map(transaction => `
            <tr>
                <td>${transaction.userId}</td>
                <td>
                    <span class="transaction-type ${transaction.transactionType.toLowerCase()}">
                        ${transaction.transactionType}
                    </span>
                </td>
                <td class="amount ${transaction.transactionType === 'RECEIVED' ? 'positive' : 'negative'}">
                    ${transaction.transactionType === 'RECEIVED' ? '+' : '-'}$${transaction.creditsReceived || transaction.creditsDeducted || '0'}
                </td>
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
                        <label for="creditAmount">Credit Amount *</label>
                        <input type="number" id="creditAmount" step="0.01" min="0.01" required placeholder="Enter amount">
                    </div>
                    <div class="form-group">
                        <label for="creditReason">Reason (Optional)</label>
                        <input type="text" id="creditReason" placeholder="e.g., Event participation, bonus">
                    </div>
                    <div class="form-group">
                        <label for="creditMethod">Method</label>
                        <select id="creditMethod" required>
                            <option value="nfc">NFC Card Tap</option>
                            <option value="manual">Manual Entry</option>
                        </select>
                    </div>
                    <div id="manualEntry" class="form-group hidden">
                        <label for="userId">User ID *</label>
                        <input type="text" id="userId" placeholder="Enter user ID">
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Add Credits</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle method change
        const methodSelect = document.getElementById('creditMethod');
        const manualEntry = document.getElementById('manualEntry');
        const userIdInput = document.getElementById('userId');

        methodSelect.addEventListener('change', (e) => {
            if (e.target.value === 'manual') {
                manualEntry.classList.remove('hidden');
                userIdInput.required = true;
            } else {
                manualEntry.classList.add('hidden');
                userIdInput.required = false;
            }
        });

        // Handle form submission
        const form = document.getElementById('addCreditsForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAddCredits();
        });
    }

    async handleAddCredits() {
        try {
            const amount = parseFloat(document.getElementById('creditAmount').value);
            const reason = document.getElementById('creditReason').value.trim();
            const method = document.getElementById('creditMethod').value;
            const userId = document.getElementById('userId').value.trim();

            if (amount <= 0) {
                this.showNotification('Please enter a valid amount', 'error');
                return;
            }

            if (method === 'manual') {
                if (!userId) {
                    this.showNotification('Please enter a user ID', 'error');
                    return;
                }
                await this.addCreditsToUser(userId, amount, reason);
            } else {
                // Close the form modal
                document.querySelector('.modal').remove();

                // Start NFC reader for credit receive
                const started = await window.nfcManager.startCreditReceive(amount.toString());
                if (started) {
                    this.showNotification('NFC reader started. Please tap a card to add credits.', 'success');
                }
            }
        } catch (error) {
            console.error('Error adding credits:', error);
            this.showNotification('Error adding credits. Please try again.', 'error');
        }
    }

    async addCreditsToUser(userId, amount, reason = '') {
        try {
            // Save credit transaction
            const transactionData = {
                userId: userId,
                userName: 'Manual Entry', // In a real app, you'd look up the user name
                creditsReceived: amount.toString(),
                timestamp: new Date().toISOString(),
                transactionType: 'RECEIVED',
                processedBy: 'admin',
                reason: reason
            };

            const transactionRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY/' + userId));
            await window.firebaseDatabase.set(transactionRef, transactionData);
            
            // Update user total credits
            await this.updateUserCredits(userId, amount);
            
            this.showNotification(`$${amount} credits added to user ${userId}`, 'success');
            
            // Close modal and refresh
            document.querySelector('.modal').remove();
            this.loadCreditData();
            
        } catch (error) {
            console.error('Error adding credits to user:', error);
            this.showNotification('Error adding credits to user. Please try again.', 'error');
        }
    }

    async updateUserCredits(userId, amount) {
        try {
            const userCreditsRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + userId);
            const snapshot = await window.firebaseDatabase.get(userCreditsRef);
            const currentData = snapshot.val();
            const currentCredits = currentData ? currentData.totalCredits : 0;
            const newTotal = Math.max(0, currentCredits + amount);

            await window.firebaseDatabase.set(userCreditsRef, {
                userId: userId,
                totalCredits: newTotal,
                lastUpdated: new Date().toISOString()
            });

            console.log(`Updated user ${userId} credits: ${currentCredits} + ${amount} = ${newTotal}`);
        } catch (error) {
            console.error('Error updating user credits:', error);
            throw error;
        }
    }

    async getUserCredits(userId) {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + userId));
            const data = snapshot.val();
            return data ? data.totalCredits : 0;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    }

    async processPayment(userId, amount, productName = '') {
        try {
            // Check if user has enough credits
            const userCredits = await this.getUserCredits(userId);
            if (userCredits < amount) {
                throw new Error(`Insufficient credits. User has $${userCredits}, needs $${amount}`);
            }

            // Process payment
            const transactionData = {
                userId: userId,
                userName: 'NFC User', // In a real app, you'd look up the user name
                creditsDeducted: amount.toString(),
                timestamp: new Date().toISOString(),
                transactionType: 'PAYMENT',
                processedBy: 'admin',
                productName: productName
            };

            const transactionRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY/' + userId));
            await window.firebaseDatabase.set(transactionRef, transactionData);
            
            // Update user total credits
            await this.updateUserCredits(userId, -amount);
            
            this.showNotification(`$${amount} payment processed for user ${userId}`, 'success');
            this.loadCreditData();
            
        } catch (error) {
            console.error('Error processing payment:', error);
            throw error;
        }
    }

    getCreditSummary() {
        const today = new Date().toISOString().split('T')[0];
        const todayTransactions = this.creditHistory.filter(t => 
            t.timestamp && t.timestamp.startsWith(today)
        );

        const received = todayTransactions
            .filter(t => t.transactionType === 'RECEIVED')
            .reduce((sum, t) => sum + parseFloat(t.creditsReceived || 0), 0);

        const paid = todayTransactions
            .filter(t => t.transactionType === 'PAYMENT')
            .reduce((sum, t) => sum + parseFloat(t.creditsDeducted || 0), 0);

        return {
            totalReceived: received,
            totalPaid: paid,
            netCredits: received - paid,
            transactionCount: todayTransactions.length
        };
    }

    exportCreditData(format = 'csv') {
        if (format === 'csv') {
            this.exportToCSV();
        } else if (format === 'json') {
            this.exportToJSON();
        }
    }

    exportToCSV() {
        const headers = ['User ID', 'Transaction Type', 'Amount', 'Date', 'Processed By'];
        const rows = this.creditHistory.map(t => [
            t.userId,
            t.transactionType,
            t.creditsReceived || t.creditsDeducted || '0',
            new Date(t.timestamp).toLocaleString(),
            t.processedBy || 'admin'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        this.downloadFile(csvContent, 'credit-transactions.csv', 'text/csv');
    }

    exportToJSON() {
        const jsonContent = JSON.stringify(this.creditHistory, null, 2);
        this.downloadFile(jsonContent, 'credit-transactions.json', 'application/json');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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

// Global credit manager instance
window.creditManager = new CreditManager();
