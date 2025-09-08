// Store Credits Management JavaScript

class CreditManager {
    constructor() {
        this.creditHistory = [];
        this.userCredits = {};
        this.pendingAmount = "";
        this.isReceiveMode = false;
        this.isPayMode = false;
        this.isLoadingTransactions = false;
        this.init();
    }

    init() {
        console.log('CreditManager initializing...');
        this.setupEventListeners();
        // Wait for Firebase to be ready before loading data
        if (window.firebaseReady) {
            console.log('Firebase is ready, loading data...');
            this.loadCreditData();
            this.setupRealtimeListeners();
        } else {
            console.log('Firebase not ready, waiting for firebaseReady event...');
            window.addEventListener('firebaseReady', () => {
                console.log('Firebase ready event received, loading data...');
                this.loadCreditData();
                this.setupRealtimeListeners();
            });
        }
    }

    setupEventListeners() {
        // Process credits button
    const processCreditsBtn = document.querySelector('.process-credits-btn');
    if (processCreditsBtn) {
            processCreditsBtn.addEventListener('click', () => {
                this.showAddCreditsForm();
            });
    }

        // Pay with credits button
        const payWithCreditsBtn = document.querySelector('.pay-with-credits-btn');
    if (payWithCreditsBtn) {
            payWithCreditsBtn.addEventListener('click', () => {
                this.showPaymentForm();
            });
    }

        // Show terminal button
        const showTerminalBtn = document.querySelector('.show-terminal-btn');
    if (showTerminalBtn) {
            showTerminalBtn.addEventListener('click', () => {
                this.showTerminal();
            });
    }

        // Numpad popup will be loaded dynamically

    // Initialize table interactions
        this.initializeTableInteractions();
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
            console.log('Loading credit data...');
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'));
            const credits = snapshot.val() || {};
            console.log('Raw credit data:', credits);
            
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

            console.log('Processed credit history:', this.creditHistory);

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

    async renderCreditTable() {
        console.log('Rendering credit table...');
        const tbody = document.querySelector('.transactions-table tbody');
        console.log('Found tbody:', tbody);
        if (!tbody) {
            console.error('Could not find .transactions-table tbody element');
            return;
        }

        if (this.creditHistory.length === 0) {
            console.log('No credit history, showing empty message');
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No credit transactions</td></tr>';
            return;
        }

        const rows = await Promise.all(
            this.creditHistory.slice(0, 50).map(async (transaction) => {
                // Try to get credits by username first, then fallback to userId
                let userCredits = 0;
                if (transaction.userName) {
                    userCredits = await this.getUserCreditsByUsername(transaction.userName);
                } else {
                    userCredits = await this.getUserCredits(transaction.userId);
                }
                
                return `
                    <tr>
                        <td>${transaction.transactionId || 'N/A'}</td>
                        <td>${transaction.userName || transaction.userId}</td>
                        <td>
                            <span class="transaction-type ${transaction.transactionType.toLowerCase()}">
                                ${transaction.transactionType}
                            </span>
                        </td>
                        <td class="amount ${transaction.transactionType === 'RECEIVED' ? 'positive' : 'negative'}">
                            ${transaction.transactionType === 'RECEIVED' ? '+' : '-'}$${transaction.creditsReceived || transaction.creditsDeducted || '0'}
                        </td>
                        <td>${new Date(transaction.timestamp).toLocaleTimeString()}</td>
                        <td>$${userCredits}</td>
                    </tr>
                `;
            })
        );

        tbody.innerHTML = rows.join('');
    }

    showAddCreditsForm() {
        // Set receive mode and show amount input
        this.isReceiveMode = true;
        this.isPayMode = false;
        this.openNumpadPopup('add');
    }

    showPaymentForm() {
        // Set pay mode and start NFC directly (no amount input needed)
        this.isReceiveMode = false;
        this.isPayMode = true;
        this.startPaymentNFC();
    }

    showTerminal() {
        // Create terminal if it doesn't exist
        let terminal = document.getElementById('terminal');
        if (!terminal) {
            terminal = document.createElement('div');
            terminal.id = 'terminal';
            terminal.className = 'terminal';
            terminal.innerHTML = `
                <div class="terminal-header">
                    <h4>Credit Terminal</h4>
                    <div class="terminal-actions">
                        <button id="clearTerminal" class="btn-small">Clear</button>
                        <button id="closeTerminal" class="btn-close">&times;</button>
                    </div>
                </div>
                <div id="terminalContent" class="terminal-content">
                    <!-- Terminal logs will appear here -->
                </div>
            `;
            document.body.appendChild(terminal);
            
            // Setup terminal event listeners
            const clearBtn = document.getElementById('clearTerminal');
            const closeBtn = document.getElementById('closeTerminal');
            
            if (clearBtn) {
                clearBtn.addEventListener('click', () => {
                    const content = document.getElementById('terminalContent');
                    if (content) content.innerHTML = '';
                });
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    terminal.remove();
                });
            }
        }
        
        terminal.classList.remove('hidden');
    }


    initializeTableInteractions() {
    // Add hover effects and click handlers for table rows
    const tableRows = document.querySelectorAll('.transactions-table tbody tr');
    
    tableRows.forEach(row => {
        row.addEventListener('click', function() {
            // Remove active class from all rows
            tableRows.forEach(r => r.classList.remove('active'));
            // Add active class to clicked row
            this.classList.add('active');
            
            // Get transaction data
            const cells = this.querySelectorAll('td');
            const transactionData = {
                id: cells[0].textContent,
                username: cells[1].textContent,
                type: cells[2].textContent,
                amount: cells[3].textContent,
                time: cells[4].textContent,
                balance: cells[5].textContent
            };
            
            console.log('Selected transaction:', transactionData);
        });
    });
}

    openNumpadPopup(mode = 'add') {
        // Store the mode for later use
        this.currentNumpadMode = mode;
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) {
                document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        });
        
        // Create numpad content inline (to avoid CORS issues with file:// protocol)
        const content = document.createElement('div');
        content.className = 'form-container';
        content.innerHTML = `
                <!-- Header Section -->
                <div class="form-header">
                    <h2><i class="fas fa-dollar-sign"></i> Enter Amount</h2>
                </div>
          
                <!-- Amount Input Section -->
                <div class="form-section">
                    <div class="form-group">
                        <input type="text" id="amount-input" class="numpad-input" value="$0.00" readonly>
                    </div>
                </div>
                
                <!-- Numpad Grid -->
                <div class="numpad-grid">
                    <div class="numpad-row">
                        <button class="numpad-btn" data-value="1">1</button>
                        <button class="numpad-btn" data-value="2">2</button>
                        <button class="numpad-btn" data-value="3">3</button>
                    </div>
                    <div class="numpad-row">
                        <button class="numpad-btn" data-value="4">4</button>
                        <button class="numpad-btn" data-value="5">5</button>
                        <button class="numpad-btn" data-value="6">6</button>
                    </div>
                    <div class="numpad-row">
                        <button class="numpad-btn" data-value="7">7</button>
                        <button class="numpad-btn" data-value="8">8</button>
                        <button class="numpad-btn" data-value="9">9</button>
                    </div>
                    <div class="numpad-row">
                        <button class="numpad-btn numpad-clear" data-action="clear">
                            <i class="fas fa-eraser"></i>
                            Clear
                        </button>
                        <button class="numpad-btn" data-value="0">0</button>
                        <button class="numpad-btn numpad-backspace" data-action="backspace">
                            <i class="fas fa-backspace"></i>
                        </button>
                    </div>
                </div>
          
                <!-- Button Section -->
                <div class="button-group">
                    <button class="back-btn" id="closeNumpad">
                        <i class="fas fa-times"></i>
                        Cancel
                    </button>
                    <div class="action-buttons">
                        <button class="confirm-btn" id="confirmAmount">
                            <i class="fas fa-check"></i>
                            Confirm
                        </button>
                    </div>
                </div>
        `;
        
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        
        // Wire up the numpad buttons
        this.wireNumpadButtons(content.querySelector('.form-container'), overlay);
        
        // Focus on input after a short delay
        setTimeout(() => {
            const amountInput = content.querySelector('#amount-input');
            if (amountInput) {
                amountInput.focus();
            }
        }, 100);
    }

    wireNumpadButtons(container, overlay) {
        const backBtn = container.querySelector('.back-btn');
        const clearBtn = container.querySelector('.numpad-clear');
        const confirmBtn = container.querySelector('.confirm-btn');
        const numpadBtns = container.querySelectorAll('.numpad-btn');
        const amountInput = container.querySelector('#amount-input');

        // Close popup when clicking back/cancel button
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (overlay.parentNode) {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                }
            });
        }

        // Clear input when clicking clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (amountInput) {
                    amountInput.value = '';
            }
        });
    }

    // Handle confirm button
    if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                this.handleConfirmAmount(amountInput, overlay);
            });
    }

    // Handle numpad button clicks
    numpadBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.getAttribute('data-value');
                const action = btn.getAttribute('data-action');
            
            if (value) {
                    this.addDigit(value, amountInput);
            } else if (action) {
                    this.handleNumpadAction(action, amountInput);
            }
        });
    });

    // Handle keyboard input
    if (amountInput) {
            amountInput.addEventListener('keydown', (e) => {
            // Allow only numbers and backspace
            if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
                e.preventDefault();
            }
        });
            
            // Handle keyboard input for numbers
            amountInput.addEventListener('keypress', (e) => {
                if (/[0-9]/.test(e.key)) {
                    e.preventDefault();
                    this.addDigit(e.key, amountInput);
            }
        });
    }
}

    addDigit(digit, amountInput) {
        if (amountInput) {
            let currentValue = amountInput.value.replace('$', '').replace('.00', '');
            
            // If current value is 0, replace it with the new digit
            if (currentValue === '0') {
                currentValue = '';
            }
            
            // Limit to 6 digits
            if (currentValue.length < 6) {
                const newValue = currentValue + digit;
                amountInput.value = '$' + newValue + '.00';
            }
        }
    }

    handleNumpadAction(action, amountInput) {
        if (action === 'clear') {
            if (amountInput) {
                amountInput.value = '$0.00';
            }
        } else if (action === 'backspace') {
            if (amountInput) {
                const currentValue = amountInput.value.replace('$', '').replace('.00', '');
                if (currentValue.length > 1) {
                    const newValue = currentValue.slice(0, -1);
                    amountInput.value = '$' + newValue + '.00';
                } else {
                    amountInput.value = '$0.00';
                }
            }
        }
    }

    handleConfirmAmount(amountInput, overlay) {
        const amount = amountInput ? amountInput.value.replace('$', '').replace('.00', '') : '';
        
        if (amount && !isNaN(amount) && parseInt(amount) > 0) {
            console.log('Confirmed amount:', amount);
            
            if (this.currentNumpadMode === 'add') {
                // Start NFC reader for credit receive
                this.startReceiveNFC(parseFloat(amount));
            } else if (this.currentNumpadMode === 'pay') {
                // Start NFC reader for payment
                this.startPaymentNFC();
            }
            
            // Close the popup
            if (overlay.parentNode) {
                document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        } else {
            alert('Please enter a valid amount');
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

    async getUserCreditsByUsername(username) {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + username));
            const data = snapshot.val();
            return data ? data.totalCredits : 0;
        } catch (error) {
            console.error('Error getting user credits by username:', error);
            return 0;
        }
    }

    async addCreditsToUser(username, amount, reason = '') {
        try {
            // Get current user credits to calculate new total
            const currentCredits = await this.getUserCreditsByUsername(username);
            const newTotal = currentCredits + amount;
            
            // Save credit transaction using username as key
            const transactionData = {
                userId: username,
                creditsReceived: amount.toString(),
                newTotalCredits: newTotal,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                transactionType: 'RECEIVED'
            };

            const transactionRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY/' + username));
            await window.firebaseDatabase.set(transactionRef, transactionData);
            
            // Update user total credits using username as key
            await this.updateUserCreditsByUsername(username, amount);
            
            this.showNotification(`$${amount} credits added to user ${username}`, 'success');
            
            // Refresh data
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

    async updateUserCreditsByUsername(username, amount) {
        try {
            const userCreditsRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + username);
            const snapshot = await window.firebaseDatabase.get(userCreditsRef);
            const currentData = snapshot.val();
            const currentCredits = currentData ? currentData.totalCredits : 0;
            const newTotal = Math.max(0, currentCredits + amount);

            await window.firebaseDatabase.set(userCreditsRef, {
                userId: username,
                totalCredits: newTotal,
                lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });

            console.log(`Updated user ${username} credits: ${currentCredits} + ${amount} = ${newTotal}`);
        } catch (error) {
            console.error('Error updating user credits by username:', error);
            throw error;
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

    // Start NFC for receiving credits (after amount confirmation)
    startReceiveNFC(amount) {
        this.pendingAmount = amount.toString();
        this.isReceiveMode = true;
        this.isPayMode = false;
        
        console.log(`Starting NFC receive mode for amount: $${amount}`);
        
        // Start NFC manager in receive mode
        if (window.nfcManager) {
            window.nfcManager.startCreditReceive(amount);
        } else {
            this.showNotification('NFC not available', 'error');
        }
    }

    // Start NFC for payment (no amount needed)
    startPaymentNFC() {
        this.isReceiveMode = false;
        this.isPayMode = true;
        
        console.log('Starting NFC payment mode');
        
        // Start NFC manager in payment mode
        if (window.nfcManager) {
            window.nfcManager.startPayment();
    } else {
            this.showNotification('NFC not available', 'error');
        }
    }

    // Process product payment (called by NFC manager)
    async processProductPayment(username, productName) {
        try {
            console.log(`Processing payment for user: ${username}, product: ${productName}`);
            
            // Get product details from Firebase
            const productSnapshot = await window.firebaseDatabase.get(
                window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS')
            );
            const products = productSnapshot.val() || {};
            
            let product = null;
            let productId = null;
            
            // Find product by name
            for (const [id, prod] of Object.entries(products)) {
                if (prod.name && prod.name.toLowerCase().includes(productName.toLowerCase())) {
                    product = prod;
                    productId = id;
                    break;
                }
            }
            
            if (!product) {
                return { success: false, message: 'Product not found' };
            }
            
            const productPrice = parseFloat(product.price) || 0;
            if (productPrice <= 0) {
                return { success: false, message: 'Invalid product price' };
            }
            
            // Check user credits using username
            const userCredits = await this.getUserCreditsByUsername(username);
            if (userCredits < productPrice) {
                return { 
                    success: false, 
                    message: `Insufficient credits. Required: $${productPrice}, Available: $${userCredits}` 
                };
            }
            
            const newBalance = userCredits - productPrice;
            
            // Record transaction using username as key (matching Firebase structure)
            const transactionData = {
                userId: username,
                creditsDeducted: productPrice.toString(),
                newTotalCredits: newBalance,
                productName: productName,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                transactionType: 'PAYMENT'
            };
            
            const transactionRef = window.firebaseDatabase.push(
                window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY/' + username)
            );
            await window.firebaseDatabase.set(transactionRef, transactionData);
            
            // Update user total credits using username
            await this.updateUserCreditsByUsername(username, -productPrice);
            
            // Update product stock
            if (product.stock > 0) {
                await window.firebaseDatabase.update(
                    window.firebaseDatabase.ref(window.database, `TBL_PRODUCTS/${productId}`),
                    { stock: product.stock - 1 }
                );
            }
            
            this.showNotification(`Payment successful! Deducted: $${productPrice}, New balance: $${newBalance}`, 'success');
            this.loadCreditData(); // Refresh data
            
            return { 
                success: true, 
                deducted: productPrice, 
                newBalance: newBalance,
                productName: productName
            };
            
        } catch (error) {
            console.error('Error processing payment:', error);
            return { success: false, message: error.message };
        }
    }
}

// Global credit manager instance
console.log('Creating CreditManager instance...');
window.creditManager = new CreditManager();
console.log('CreditManager instance created:', window.creditManager);

// Numpad popup functions are now integrated into the CreditManager class

