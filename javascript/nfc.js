class NFCManager {
    constructor() {
        this.reader = null;
        this.isMonitoring = false;
        this.currentMode = 'checkin'; // 'checkin', 'receive', 'pay'
        this.pendingAmount = '';
        // Desktop ACR122U bridge state
        this.useAcrBridge = false;
        this.ws = null;
        
        // AID constants matching VB.NET code
        this.CHECKIN_AID = 'F22334455667';      // For check-in service
        this.STORE_CREDITS_AID = 'F0010203040506';  // For store credits service (receive)
        this.PAY_AID = 'F12345678900';             // For payment
        this.aidHex = this.CHECKIN_AID; // Default
        this.init();
    }

    init() {
        this.checkNFCSupport();
        this.setupEventListeners();
    }

    checkNFCSupport() {
        // Prefer Web NFC on supported Android devices. Otherwise we'll try the local ACR122U bridge.
        const isAndroid = /Android/i.test(navigator.userAgent);
        const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge/i.test(navigator.userAgent);
        const isEdge = /Edg/i.test(navigator.userAgent);
        const isSupportedBrowser = isChrome || isEdge;
        
        if ('NDEFReader' in window && isAndroid && isSupportedBrowser) {
            this.log('Web NFC API is supported on this Android device');
            return true;
        }

        // Try desktop bridge (WebSocket to local PC/SC bridge)
        return false;
    }

    setupEventListeners() {
        // NFC modal cancel button
        const cancelNFCBtn = document.getElementById('cancelNFC');
        if (cancelNFCBtn) {
            cancelNFCBtn.addEventListener('click', () => {
                this.stopMonitoring();
                this.hideNFCModal();
            });
        }
    }

    async initialize() {
        // First try Web NFC
        if (this.checkNFCSupport()) {
            try {
                this.reader = new NDEFReader();
                this.useAcrBridge = false;
                this.log('NFC Reader (Web NFC) initialized successfully');
                return true;
            } catch (error) {
                this.log(`Error initializing Web NFC: ${error.message}`);
            }
        }

        // Fallback: attempt to connect to local ACR122U bridge
        try {
            await this.connectBridge();
            this.useAcrBridge = true;
            this.log('Using local ACR122U bridge for HCE');
            return true;
        } catch (e) {
            const msg = 'Web NFC not available and ACR122U bridge not reachable.';
            this.log(`${msg} ${e && e.message ? e.message : ''}`.trim());
            // Don't show error modal immediately - let the main app handle it
            return false;
        }
    }

    async startMonitoring(mode = 'checkin', amount = '') {
        if (!this.reader && !this.ws) {
            const initialized = await this.initialize();
            if (!initialized) return false;
        }

        this.currentMode = mode;
        this.pendingAmount = amount;
        
        // Set the correct AID based on mode
        switch (mode) {
            case 'receive':
                this.aidHex = this.STORE_CREDITS_AID;
                break;
            case 'pay':
                this.aidHex = this.PAY_AID;
                break;
            case 'checkin':
            default:
                this.aidHex = this.CHECKIN_AID;
                break;
        }

        if (this.useAcrBridge) {
            // Single-shot desktop check-in flow (wait for tap, run APDUs)
            this.isMonitoring = true;
            this.showNFCModal();
            try {
                await this.desktopCheckInOnce();
                this.isMonitoring = false;
                this.hideNFCModal();
                return true;
            } catch (error) {
                this.isMonitoring = false;
                this.hideNFCModal();
                this.log(`Desktop NFC error: ${error.message}`);
                this.showError(`NFC error: ${error.message}`);
                return false;
            }
        }

        try {
            await this.reader.scan();
            this.reader.onreading = (event) => this.handleCardRead(event);
            this.reader.onreadingerror = (error) => this.handleReadError(error);
            this.isMonitoring = true;
            this.log(`NFC monitoring started for ${mode} mode`);
            this.showNFCModal();
            return true;
        } catch (error) {
            this.log(`Error starting NFC monitoring: ${error.message}`);
            this.showError(`Failed to start NFC monitoring: ${error.message}`);
            return false;
        }
    }

    stopMonitoring() {
        if (this.reader && this.isMonitoring && !this.useAcrBridge) {
            this.reader.onreading = null;
            this.reader.onreadingerror = null;
            this.isMonitoring = false;
            this.log('NFC monitoring stopped');
            this.hideNFCModal();
        }
    }

    async handleCardRead(event) {
        try {
            this.log('NFC card detected, processing...');
            
            // Process NDEF messages
            for (const record of event.message.records) {
                const data = new TextDecoder().decode(record.data);
                this.log(`Card data received: ${data.substring(0, 50)}...`);
                
                // Parse the data based on current mode
                await this.processCardData(data);
            }
        } catch (error) {
            this.log(`Error processing card: ${error.message}`);
            this.showError('Error processing NFC card data');
        }
    }

    handleReadError(error) {
        this.log(`NFC read error: ${error.message}`);
        this.showError('Error reading NFC card. Please try again.');
    }

    async processCardData(data) {
        try {
            // Parse user data from NFC card
            const userData = this.parseUserData(data);
            
            if (!userData.userId) {
                this.showError('Invalid card data. Please use a valid NFC card.');
                return;
            }

            if (this.currentMode === 'checkin') {
                await this.processCheckIn(userData);
            } else if (this.currentMode === 'receive') {
                await this.processCreditReceive(userData);
            } else if (this.currentMode === 'pay') {
                await this.processPayment(userData);
            }
        } catch (error) {
            this.log(`Error processing card data: ${error.message}`);
            this.showError('Error processing card data');
        }
    }

    parseUserData(data) {
        try {
            // Try to parse as JSON first
            const jsonData = JSON.parse(data);
            return {
                userId: jsonData.userId || jsonData.id || '',
                userName: jsonData.userName || jsonData.name || 'Unknown User',
                credits: jsonData.credits || jsonData.balance || '0',
                email: jsonData.email || '',
                productName: jsonData.productName || ''
            };
        } catch (jsonError) {
            // Fallback to pipe-separated format
            const parts = data.split('|');
            return {
                userId: parts[0] || '',
                userName: parts[1] || 'Unknown User',
                credits: parts[2] || '0',
                email: parts[3] || '',
                productName: parts[4] || ''
            };
        }
    }

    async processCheckIn(userData) {
        try {
            this.log(`Processing check-in for user: ${userData.userName} (ID: ${userData.userId})`);
            
            // Check if user already checked in today
            const today = new Date().toISOString().split('T')[0];
            const checkInRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN/' + userData.userId);
            const snapshot = await window.firebaseDatabase.get(checkInRef);
            const existingCheckIn = snapshot.val();
            
            if (existingCheckIn && existingCheckIn.timestamp && existingCheckIn.timestamp.startsWith(today)) {
                this.showError('User has already checked in today');
                return;
            }

            // Save check-in to Firebase
            const checkInData = {
                userId: userData.userId,
                userName: userData.userName,
                timestamp: new Date().toISOString(),
                date: today,
                status: 'Present'
            };

            await window.firebaseDatabase.set(checkInRef, checkInData);
            
            this.log('Check-in saved successfully');
            this.showSuccessModal('Check-in', userData.userName, 'Check-in successful');
            
            // Refresh dashboard data
            this.refreshCheckInData();
            
        } catch (error) {
            this.log(`Error saving check-in: ${error.message}`);
            this.showError('Error saving check-in. Please try again.');
        }
    }

    async processCreditReceive(userData) {
        try {
            this.log(`Processing credit receive for user: ${userData.userName}, amount: $${this.pendingAmount}`);
            
            if (!this.pendingAmount || isNaN(parseFloat(this.pendingAmount))) {
                this.showError('Invalid credit amount');
                return;
            }

            const amount = parseFloat(this.pendingAmount);
            
            // Get current user credits to calculate new total
            const currentCredits = await this.getUserCreditsByUsername(userData.userName);
            const newTotal = currentCredits + amount;
            
            // Save credit transaction using username as key (matching Firebase structure)
            const transactionData = {
                userId: userData.userName,
                creditsReceived: amount.toString(),
                newTotalCredits: newTotal,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                transactionType: 'RECEIVED'
            };

            const transactionRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY/' + userData.userName));
            await window.firebaseDatabase.set(transactionRef, transactionData);
            
            // Update user total credits using username as key
            await this.updateUserCreditsByUsername(userData.userName, amount);
            
            this.log('Credits added successfully');
            this.showSuccessModal('Credits Received', userData.userName, `$${amount} credits added`);
            
            // Refresh dashboard data
            this.refreshCreditData();
            
        } catch (error) {
            this.log(`Error processing credits: ${error.message}`);
            this.showError('Error processing credits. Please try again.');
        }
    }

    async processPayment(userData) {
        try {
            this.log(`Processing payment for user: ${userData.userName}`);
            
            // Use the CreditManager to process the payment
            if (window.creditManager) {
                // Use product name from NFC data, fallback to default if not available
                const productName = userData.productName || "Default Product";
                
                this.log(`Processing payment for product: ${productName}`);
                
                const result = await window.creditManager.processProductPayment(userData.userId, productName);
                
                if (result.success) {
                    this.log('Payment processed successfully');
                    this.showSuccessModal('Payment Successful', userData.userName, 
                        `$${result.deducted} deducted for ${result.productName}. New balance: $${result.newBalance}`);
                } else {
                    this.showError(result.message || 'Payment failed');
                }
            } else {
                this.showError('Credit manager not available');
            }
            
        } catch (error) {
            this.log(`Error processing payment: ${error.message}`);
            this.showError('Error processing payment. Please try again.');
        }
    }

    async updateUserCredits(userId, amount) {
        try {
            const userCreditsRef = window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + userId);
            const snapshot = await window.firebaseDatabase.get(userCreditsRef);
            const currentData = snapshot.val();
            const currentCredits = currentData ? currentData.totalCredits : 0;
            const newTotal = Math.max(0, currentCredits + amount); // Ensure credits don't go negative

            await window.firebaseDatabase.set(userCreditsRef, {
                userId: userId,
                totalCredits: newTotal,
                lastUpdated: new Date().toISOString()
            });

            this.log(`Updated user ${userId} credits: ${currentCredits} + ${amount} = ${newTotal}`);
        } catch (error) {
            this.log(`Error updating user credits: ${error.message}`);
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

            this.log(`Updated user ${username} credits: ${currentCredits} + ${amount} = ${newTotal}`);
        } catch (error) {
            this.log(`Error updating user credits by username: ${error.message}`);
            throw error;
        }
    }

    async getUserCredits(userId) {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + userId));
            const data = snapshot.val();
            return data ? data.totalCredits : 0;
        } catch (error) {
            this.log(`Error getting user credits: ${error.message}`);
            return 0;
        }
    }

    async getUserCreditsByUsername(username) {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + username));
            const data = snapshot.val();
            return data ? data.totalCredits : 0;
        } catch (error) {
            this.log(`Error getting user credits by username: ${error.message}`);
            return 0;
        }
    }

    showNFCModal() {
        // Create NFC modal if it doesn't exist
        let modal = document.getElementById('nfcModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'nfcModal';
            modal.className = 'modal hidden';
            modal.innerHTML = `
                    <h3>NFC Reader</h3>
                    <p>Please tap your phone on the reader</p>
                    <button id="cancelNFC" class="btn-secondary">Cancel</button>
            `;
            document.body.appendChild(modal);
            
            // Re-setup event listeners for the new modal
            this.setupEventListeners();
        }
        
        modal.classList.remove('hidden');
    }

    hideNFCModal() {
        const modal = document.getElementById('nfcModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showSuccessModal(type, userName, message) {
        const modal = document.createElement('div');
        modal.className = 'modal success-modal';
        modal.innerHTML = `
                <h3>✅ ${type} Success</h3>
                <p><strong>User:</strong> ${userName}</p>
                <p><strong>Status:</strong> ${message}</p>
                <button class="btn-primary" onclick="this.closest('.modal').remove()">OK</button>
        `;
        document.body.appendChild(modal);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 3000);
    }

    showError(message) {
        const modal = document.createElement('div');
        modal.className = 'modal error-modal';
        modal.innerHTML = `
                <h3>❌ Error</h3>
                <p>${message}</p>
                <button class="btn-primary" onclick="this.closest('.modal').remove()">OK</button>
        `;
        document.body.appendChild(modal);
    }

    showNFCSupportError(message) {
        const modal = document.createElement('div');
        modal.className = 'modal error-modal';
        modal.innerHTML = `
                <h3>⚠️ NFC Not Supported</h3>
                <p>${message}</p>
                <div style="background: #f0f9ff; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
                    <h4>Requirements for Web NFC:</h4>
                    <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                        <li>Android device with NFC hardware</li>
                        <li>Chrome or Edge browser on Android</li>
                        <li>HTTPS or localhost connection</li>
                    </ul>
                </div>
                <div style="background: #fff7ed; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
                    <h4>Desktop alternative (ACR122U):</h4>
                    <ol style="margin: 0.5rem 0; padding-left: 1.5rem;">
                        <li>Install Python 3.10+ and run <code>Aurorus 3/bridge.py</code></li>
                        <li>Install deps: <code>py -m pip install pyscard websockets</code></li>
                        <li>Plug ACR122U, then start: <code>py "Aurorus 3/bridge.py"</code></li>
                    </ol>
                    <p>When running, this app auto-connects to the bridge at <code>ws://127.0.0.1:8765</code>.</p>
                </div>
                <p><strong>Or</strong> continue using the system without NFC features.</p>
                <button class="btn-primary" onclick="this.closest('.modal').remove()">OK</button>
        `;
        document.body.appendChild(modal);
    }

    log(message, type = 'info') {
        console.log(`[NFC] ${message}`);
        
        // Try to log to terminal if it exists
        const terminal = document.getElementById('terminalContent');
        if (terminal) {
            const timestamp = new Date().toLocaleTimeString();
            const className = type !== 'info' ? ` class="${type}"` : '';
            terminal.innerHTML += `<div${className}>[${timestamp}] ${message}</div>`;
            terminal.scrollTop = terminal.scrollHeight;
        }
    }

    refreshCheckInData() {
        // Trigger refresh of check-in data
        if (window.dashboardManager) {
            window.dashboardManager.loadCheckInData();
        }
    }

    refreshCreditData() {
        // Trigger refresh of credit data
        if (window.dashboardManager) {
            window.dashboardManager.loadCreditData();
        }
    }

    // Public methods for external use
    async startCheckIn() {
        return await this.startMonitoring('checkin');
    }

    async startCreditReceive(amount) {
        return await this.startMonitoring('receive', amount);
    }

    async startPayment() {
        return await this.startMonitoring('pay');
    }

    isNFCAvailable() {
        // Always return true to allow attempting bridge connection
        return true;
    }

    // ===== Desktop ACR122U bridge (WebSocket) =====
    connectBridge() {
        return new Promise((resolve, reject) => {
            try {
                this.log('Attempting to connect to ACR122U bridge at ws://127.0.0.1:8765...', 'info');
                const ws = new WebSocket('ws://127.0.0.1:8765');
                ws.onopen = () => {
                    this.ws = ws;
                    this.log('✅ Connected to ACR122U bridge successfully', 'success');
                    resolve();
                };
                ws.onerror = () => {
                    this.log('❌ Failed to connect to ACR122U bridge. Make sure bridge.py is running.', 'error');
                    reject(new Error('Bridge not reachable. Run bridge.py'));
                };
            } catch (e) { 
                this.log(`❌ WebSocket error: ${e.message}`, 'error');
                reject(e); 
            }
        });
    }

    wsCall(obj) {
        return new Promise((resolve, reject) => {
            const onMessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    this.ws.removeEventListener('message', onMessage);
                    if (data.ok) {
                        this.log(`📡 Bridge response: ${JSON.stringify(data)}`, 'info');
                        resolve(data);
                    } else {
                        this.log(`❌ Bridge error: ${data.error || 'unknown error'}`, 'error');
                        reject(new Error(data.error || 'bridge error'));
                    }
                } catch (e) { 
                    this.log(`❌ Bridge response parse error: ${e.message}`, 'error');
                    reject(e); 
                }
            };
            this.ws.addEventListener('message', onMessage);
            this.log(`📤 Sending to bridge: ${JSON.stringify(obj)}`, 'info');
            this.ws.send(JSON.stringify(obj));
        });
    }

    buildSelectAid(aidHex) {
        const clean = aidHex.replace(/\s+/g, '').toUpperCase();
        const aidBytes = this.hexToBytes(clean);
        const apdu = new Uint8Array(6 + aidBytes.length);
        apdu[0] = 0x00; apdu[1] = 0xA4; apdu[2] = 0x04; apdu[3] = 0x00; apdu[4] = aidBytes.length;
        apdu.set(aidBytes, 5);
        apdu[5 + aidBytes.length] = 0x00;
        return apdu;
    }

    buildGetData(fileNo) {
        return new Uint8Array([0x00, 0xCA, 0x00, 0x00, 0x01, fileNo & 0xFF]);
    }

    hexToBytes(hex) {
        const clean = hex.replace(/\s+/g, '').toLowerCase();
        const out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i*2,2),16);
        return out;
    }

    rapduToUtf8(rapduHex) {
        // rapduHex is hex string from bridge
        let hex = rapduHex;
        if (hex.length >= 4 && hex.slice(-4).toUpperCase() === '9000') {
            hex = hex.slice(0, -4);
        }
        const bytes = this.hexToBytes(hex);
        try { return new TextDecoder('utf-8').decode(bytes).trim(); }
        catch { return hex.toUpperCase(); }
    }

    async desktopCheckInOnce() {
        this.log('🔄 Waiting for card/phone… tap now.', 'warning');
        const res = await this.wsCall({ cmd: 'connect', index: 0, wait: true });
        const atr = res.atr || '';
        this.log(`📱 Card detected! ATR: ${atr}`, 'success');

        // Select AID
        const selectHex = Array.from(this.buildSelectAid(this.aidHex)).map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
        this.log(`🔍 Selecting AID: ${this.aidHex} (APDU: ${selectHex})`, 'info');
        const selResp = await this.wsCall({ cmd: 'xfr', apdu: selectHex });
        if (!selResp.rapdu || !selResp.rapdu.toUpperCase().endsWith('9000')) {
            this.log(`❌ SELECT AID failed. Response: ${selResp.rapdu}`, 'error');
            throw new Error('SELECT AID failed');
        }
        this.log(`✅ AID selected successfully. Response: ${selResp.rapdu}`, 'success');

        // Read data based on mode (matching Android HCE service)
        this.log('📖 Reading data from HCE app...', 'info');
        const get1 = await this.wsCall({ cmd: 'xfr', apdu: '00CA00000101' });
        const get2 = await this.wsCall({ cmd: 'xfr', apdu: '00CA00000102' });
        const file1Data = this.rapduToUtf8(get1.rapdu || '');
        const file2Data = this.rapduToUtf8(get2.rapdu || '');
        
        let userName, userEmail, productName, userId;
        
        if (this.currentMode === 'receive') {
            // Credits receive: File 1 = username, File 2 = email
            userName = file1Data;
            userEmail = file2Data;
            this.log(`👤 Username: ${userName}`, 'info');
            this.log(`📧 Email: ${userEmail}`, 'info');
            userId = (userEmail || userName || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        } else if (this.currentMode === 'pay') {
            // Payment: File 1 = username, File 2 = product name
            userName = file1Data;
            productName = file2Data;
            this.log(`👤 Username: ${userName}`, 'info');
            this.log(`🛍️ Product: ${productName}`, 'info');
            userId = (userName || 'UNKNOWN').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        } else {
            // Check-in: File 1 = userId, File 2 = userName
            userId = file1Data;
            userName = file2Data;
            this.log(`🆔 User ID: ${userId}`, 'info');
            this.log(`👤 Username: ${userName}`, 'info');
        }

        const userData = { 
            userId, 
            userName: userName || 'Unknown User', 
            credits: '0',
            email: userEmail || '',
            productName: productName || ''
        };
        
        this.log(`🆔 Generated User ID: ${userId}`, 'info');

        if (this.currentMode === 'checkin') {
            this.log('✅ Processing check-in...', 'info');
            await this.processCheckIn(userData);
        } else if (this.currentMode === 'receive') {
            this.log(`💰 Processing credit receive ($${this.pendingAmount})...`, 'info');
            await this.processCreditReceive(userData);
        } else if (this.currentMode === 'pay') {
            this.log('💳 Processing payment...', 'info');
            await this.processPayment(userData);
        }

        // Disconnect after one run
        try { 
            await this.wsCall({ cmd: 'disconnect' }); 
            this.log('🔌 Disconnected from card', 'info');
        } catch (_) {}
        this.log('🎉 Desktop NFC flow complete!', 'success');
    }
}

// Global NFC manager instance
window.nfcManager = new NFCManager();
