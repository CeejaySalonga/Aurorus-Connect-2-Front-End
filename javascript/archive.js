class ArchiveManager {
    constructor() {
        this.archivedData = [];
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Wait for Firebase to be ready before loading archive data
        if (window.firebaseReady) {
            this.loadArchiveData();
        } else {
            window.addEventListener('firebaseReady', () => {
                this.loadArchiveData();
            });
        }
        // Wire tabs UI (UI only)
        this.initTabs();
        this.initSearch();
        // Initialize page info text for events/products (UI only)
        this.updatePageInfo('#archivesTableBody', '#pageInfo');
        this.updatePageInfo('#archivesEventsTableBody', '#pageInfoEvents');
    }

    setupEventListeners() {
        // Export data button (if it exists)
        const exportDataBtn = document.querySelector('.export-btn, [data-action="export"]');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.showExportOptions();
            });
        }

        // Listen for export buttons in navigation
        document.addEventListener('click', (e) => {
            if (e.target.closest('.nav-item') && e.target.textContent.includes('Export')) {
                this.showExportOptions();
            }
        });
    }

    initTabs() {
        const tabs = document.querySelectorAll('.archives-tabs .tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const target = btn.getAttribute('data-target');
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    if ('#' + pane.id === target) pane.classList.add('active');
                    else pane.classList.remove('active');
                });
                // Refresh page info of the active tab when switching
                if (target === '#tab-events') {
                    this.updatePageInfo('#archivesEventsTableBody', '#pageInfoEvents');
                } else if (target === '#tab-products') {
                    this.updatePageInfo('#archivesTableBody', '#pageInfo');
                }
            });
        });
    }

    updatePageInfo(tbodySelector, pageInfoSelector) {
        const body = document.querySelector(tbodySelector);
        const info = document.querySelector(pageInfoSelector);
        if (!body || !info) return;
        const visibleRows = Array.from(body.querySelectorAll('tr')).filter(tr => tr.style.display !== 'none');
        const total = visibleRows.length;
        info.textContent = `Page 1 of 1 (${total} rows)`;
    }

    async loadArchiveData() {
        try {
            // Load only archived products data
            const archivedProductsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_ARCHIVED_PRODUCTS'));
            const archivedProductsData = archivedProductsSnapshot.val() || {};

            this.archivedData = [];

            // Process only archived products
            Object.entries(archivedProductsData).forEach(([productId, product]) => {
                this.archivedData.push({
                    type: 'Archived Product',
                    description: `${product.productName} - $${product.price}`,
                    date: product.archivedAt || product.createdAt || product.lastUpdated,
                    status: 'Archived',
                    productId: productId,
                    data: product
                });
            });

            // Sort by date (newest first)
            this.archivedData.sort((a, b) => new Date(b.date) - new Date(a.date));

        } catch (error) {
            console.error('Error loading archive data:', error);
            this.showNotification('Error loading archive data', 'error');
        }
    }

    initSearch() {
        const input = document.getElementById('archivesSearch');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            const tbody = document.querySelector('#tab-products.active #archivesTableBody') || document.getElementById('archivesTableBody');
            const etbody = document.querySelector('#tab-events.active #archivesEventsTableBody') || document.getElementById('archivesEventsTableBody');
            const filterRows = (tb) => {
                if (!tb) return;
                Array.from(tb.querySelectorAll('tr')).forEach(tr => {
                    const text = tr.textContent.toLowerCase();
                    tr.style.display = !q || text.includes(q) ? '' : 'none';
                });
            };
            filterRows(tbody);
            filterRows(etbody);
        });
    }

    showExportOptions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Export Data</h3>
                <p>Choose what data you want to export:</p>
                
                <div class="export-options">
                    <div class="export-option">
                        <h4>📊 Dashboard Data</h4>
                        <p>Export check-ins, credits, and statistics</p>
                        <button class="btn-primary" onclick="archiveManager.exportDashboardData()">Export Dashboard</button>
                    </div>
                    
                    <div class="export-option">
                        <h4>📅 Events Data</h4>
                        <p>Export all events and registrations</p>
                        <button class="btn-primary" onclick="archiveManager.exportEventsData()">Export Events</button>
                    </div>
                    
                    <div class="export-option">
                        <h4>📦 Products Data</h4>
                        <p>Export products and inventory</p>
                        <button class="btn-primary" onclick="archiveManager.exportProductsData()">Export Products</button>
                    </div>
                    
                    <div class="export-option">
                        <h4>💰 Credits Data</h4>
                        <p>Export credit transactions and balances</p>
                        <button class="btn-primary" onclick="archiveManager.exportCreditsData()">Export Credits</button>
                    </div>
                    
                    <div class="export-option">
                        <h4>🗄️ Archived Data</h4>
                        <p>Export archived products and records</p>
                        <button class="btn-primary" onclick="archiveManager.exportArchivedData()">Export Archived</button>
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    async exportDashboardData() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Get check-ins
            const checkInsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_CHECKIN'));
            const checkIns = checkInsSnapshot.val() || {};
            const todayCheckIns = Object.values(checkIns).filter(checkIn => 
                checkIn.timestamp && checkIn.timestamp.startsWith(today)
            );

            // Get credits
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

            const dashboardData = {
                date: today,
                checkIns: todayCheckIns,
                totalCreditsIssued: totalCreditsIssued,
                exportDate: new Date().toISOString()
            };

            this.downloadFile(JSON.stringify(dashboardData, null, 2), `dashboard-export-${today}.json`, 'application/json');
            this.showNotification('Dashboard data exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting dashboard data:', error);
            this.showNotification('Error exporting dashboard data', 'error');
        }
    }

    async exportEventsData() {
        try {
            const eventsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS'));
            const events = eventsSnapshot.val() || {};
            
            const eventsArray = Object.entries(events).map(([id, data]) => ({
                id,
                ...data
            }));

            this.downloadFile(JSON.stringify(eventsArray, null, 2), `events-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
            this.showNotification('Events data exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting events data:', error);
            this.showNotification('Error exporting events data', 'error');
        }
    }

    async exportProductsData() {
        try {
            const productsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
            const products = productsSnapshot.val() || {};
            
            const productsArray = Object.entries(products).map(([id, data]) => ({
                id,
                ...data
            }));

            this.downloadFile(JSON.stringify(productsArray, null, 2), `products-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
            this.showNotification('Products data exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting products data:', error);
            this.showNotification('Error exporting products data', 'error');
        }
    }

    async exportCreditsData() {
        try {
            const creditsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_STORE_CREDITS_HISTORY'));
            const credits = creditsSnapshot.val() || {};
            
            const userCreditsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS'));
            const userCredits = userCreditsSnapshot.val() || {};

            const creditsData = {
                transactions: credits,
                userBalances: userCredits,
                exportDate: new Date().toISOString()
            };

            this.downloadFile(JSON.stringify(creditsData, null, 2), `credits-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
            this.showNotification('Credits data exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting credits data:', error);
            this.showNotification('Error exporting credits data', 'error');
        }
    }

    async exportArchivedData() {
        try {
            const archivedProductsSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_ARCHIVED_PRODUCTS'));
            const archivedProducts = archivedProductsSnapshot.val() || {};
            
            const archivedArray = Object.entries(archivedProducts).map(([id, data]) => ({
                id,
                ...data
            }));

            this.downloadFile(JSON.stringify(archivedArray, null, 2), `archived-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
            this.showNotification('Archived data exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting archived data:', error);
            this.showNotification('Error exporting archived data', 'error');
        }
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

// Global archive manager instance
window.archiveManager = new ArchiveManager();
