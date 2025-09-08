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
    }

    setupEventListeners() {
        // Export data button
        const exportDataBtn = document.getElementById('exportDataBtn');
        if (exportDataBtn) {
            exportDataBtn.addEventListener('click', () => {
                this.showExportOptions();
            });
        }
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

            this.renderArchiveTable();
        } catch (error) {
            console.error('Error loading archive data:', error);
            this.showNotification('Error loading archive data', 'error');
        }
    }


    renderArchiveTable() {
        const tbody = document.getElementById('archiveTableBody');
        if (!tbody) return;

        if (this.archivedData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No archived data found</td></tr>';
            return;
        }

        tbody.innerHTML = this.archivedData.slice(0, 100).map(item => `
            <tr>
                <td><span class="archive-type ${item.type.toLowerCase().replace(' ', '-')}">${item.type}</span></td>
                <td>${item.description}</td>
                <td>${new Date(item.date).toLocaleString()}</td>
                <td><span class="archive-status ${item.status.toLowerCase().replace(' ', '-')}">${item.status}</span></td>
            </tr>
        `).join('');
    }

    showExportOptions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Export Archived Products</h3>
                <p>Export archived products data in your preferred format:</p>
                
                <div class="form-group">
                    <label>Date Range (Optional)</label>
                    <div class="date-range">
                        <input type="date" id="startDate" placeholder="Start date">
                        <span>to</span>
                        <input type="date" id="endDate" placeholder="End date">
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Format</label>
                    <select id="exportFormat">
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                    </select>
                </div>
                
                <div class="form-actions">
                    <button id="exportBtn" class="btn-primary">Export Archived Products</button>
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Set default date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('endDate').value = endDate.toISOString().split('T')[0];

        // Handle export
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.handleExport();
        });
    }

    async handleExport() {
        try {
            const format = document.getElementById('exportFormat').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;

            const exportData = {
                archivedProducts: await this.getArchivedProductData(startDate, endDate)
            };

            if (format === 'csv') {
                this.exportToCSV(exportData);
            } else if (format === 'json') {
                this.exportToJSON(exportData);
            }

            document.querySelector('.modal').remove();
            this.showNotification('Archived products exported successfully', 'success');

        } catch (error) {
            console.error('Error exporting data:', error);
            this.showNotification('Error exporting data. Please try again.', 'error');
        }
    }


    async getArchivedProductData(startDate, endDate) {
        const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_ARCHIVED_PRODUCTS'));
        const data = snapshot.val() || {};
        
        const products = Object.entries(data).map(([productId, product]) => ({
            productId,
            ...product
        }));

        // Filter by date range if provided
        if (startDate || endDate) {
            return products.filter(item => {
                const itemDate = new Date(item.archivedAt || item.createdAt || item.lastUpdated);
                const start = startDate ? new Date(startDate) : new Date(0);
                const end = endDate ? new Date(endDate) : new Date();
                return itemDate >= start && itemDate <= end;
            });
        }

        return products;
    }


    exportToCSV(exportData) {
        const allData = [];
        
        if (exportData.archivedProducts.length > 0) {
            allData.push(['ARCHIVED PRODUCTS']);
            allData.push(['Product ID', 'Name', 'Price', 'Stock', 'Status', 'Archived At', 'Description']);
            exportData.archivedProducts.forEach(item => {
                allData.push([
                    item.productId,
                    item.productName,
                    item.price,
                    item.stock,
                    'Archived',
                    item.archivedAt || item.createdAt,
                    item.description || ''
                ]);
            });
        } else {
            allData.push(['No archived products found']);
        }

        const csvContent = allData
            .map(row => row.map(field => `"${field || ''}"`).join(','))
            .join('\n');

        this.downloadFile(csvContent, `archived-products-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    }

    exportToJSON(exportData) {
        const jsonContent = JSON.stringify(exportData, null, 2);
        this.downloadFile(jsonContent, `archived-products-export-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
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
