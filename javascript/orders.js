// Orders Management JavaScript

class OrdersManager {
    constructor() {
        this.orders = [];
        this.isLoading = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        if (window.firebaseReady) {
            this.loadOrders();
            this.setupRealtimeListeners();
        } else {
            window.addEventListener('firebaseReady', () => {
                this.loadOrders();
                this.setupRealtimeListeners();
            });
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('ordersSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderOrdersTable());
        }
    }

    setupRealtimeListeners() {
        // Listen for order changes
        if (window.firebaseDatabase && window.database) {
            const ordersRef = window.firebaseDatabase.ref(window.database, 'TBL_ORDERS');
            window.firebaseDatabase.onValue(ordersRef, () => this.loadOrders());
        }
    }

    async loadOrders() {
        try {
            this.isLoading = true;
            const snapshot = await window.firebaseDatabase.get(
                window.firebaseDatabase.ref(window.database, 'TBL_ORDERS')
            );
            const data = snapshot.val() || {};

            // Normalize to array
            const orders = [];
            Object.entries(data).forEach(([orderId, order]) => {
                const items = Array.isArray(order.items)
                    ? order.items
                    : (order.items ? Object.values(order.items) : []);
                const total = parseFloat(order.total || 0);
                orders.push({
                    orderId,
                    customer: order.userName || order.userId || 'Unknown',
                    items,
                    total,
                    timestamp: order.timestamp || order.createdAt || new Date().toISOString()
                });
            });

            // Sort newest first
            orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            this.orders = orders;
            this.updateStats();
            this.renderOrdersTable();
        } catch (error) {
            console.error('Error loading orders:', error);
        } finally {
            this.isLoading = false;
        }
    }

    updateStats() {
        const today = new Date().toISOString().slice(0, 10);
        let ordersToday = 0;
        let revenueToday = 0;
        for (const order of this.orders) {
            const d = (order.timestamp || '').slice(0, 10);
            if (d === today) {
                ordersToday += 1;
                revenueToday += Number(order.total || 0);
            }
        }
        const oEl = document.getElementById('ordersToday');
        const rEl = document.getElementById('revenueToday');
        if (oEl) oEl.textContent = String(ordersToday);
        if (rEl) rEl.textContent = `$${revenueToday.toFixed(2)}`;
    }

    renderOrdersTable() {
        const tbody = document.getElementById('ordersTableBody');
        if (!tbody) return;

        const q = (document.getElementById('ordersSearch')?.value || '').toLowerCase();
        const filtered = this.orders.filter(o =>
            o.orderId.toLowerCase().includes(q) ||
            String(o.customer).toLowerCase().includes(q)
        );

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No orders</td></tr>';
            return;
        }

        const rows = filtered.map(o => {
            const itemsPreview = (o.items || [])
                .slice(0, 2)
                .map(it => `${it.name || it.productName || 'Item'} x${it.qty || it.quantity || 1}`)
                .join(', ');
            const more = (o.items?.length || 0) > 2 ? ` +${o.items.length - 2} more` : '';
            return `
                <tr data-order-id="${o.orderId}">
                    <td>${o.orderId}</td>
                    <td>${o.customer}</td>
                    <td>${itemsPreview}${more}</td>
                    <td>$${Number(o.total || 0).toFixed(2)}</td>
                    <td>${new Date(o.timestamp).toLocaleString()}</td>
                    <td>
                        <button class="btn-view" data-action="view">
                            <i class="fas fa-eye" aria-hidden="true"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = rows.join('');

        // Re-init pagination if available
        if (window.initTablePagination) {
            window.initTablePagination('.transactions-table-container');
        }

        // Wire row actions
        tbody.querySelectorAll('button[data-action="view"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tr = e.currentTarget.closest('tr');
                const id = tr?.getAttribute('data-order-id');
                if (id) this.openDetails(id);
            });
        });
    }

    openDetails(orderId) {
        const order = this.orders.find(o => o.orderId === orderId);
        if (!order) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', (evt) => {
            if (evt.target === overlay) overlay.remove();
        });

        const content = document.createElement('div');
        content.className = 'order-details-modal';
        const itemsHtml = (order.items || []).map(it => {
            const name = it.name || it.productName || 'Item';
            const qty = it.qty || it.quantity || 1;
            const price = Number(it.price || 0);
            return `
                <div class="detail-row">
                    <div class="detail-cell">${name}</div>
                    <div class="detail-cell">x${qty}</div>
                    <div class="detail-cell">$${price.toFixed(2)}</div>
                </div>
            `;
        }).join('');

        content.innerHTML = `
            <div class="details-header">
                <h2><i class="fas fa-receipt"></i> Order ${order.orderId}</h2>
                <button class="btn-close" aria-label="Close">&times;</button>
            </div>
            <div class="details-meta">
                <div><strong>Customer:</strong> ${order.customer}</div>
                <div><strong>Time:</strong> ${new Date(order.timestamp).toLocaleString()}</div>
                <div><strong>Total:</strong> $${Number(order.total || 0).toFixed(2)}</div>
            </div>
            <div class="details-items">
                <div class="detail-row header">
                    <div class="detail-cell">Item</div>
                    <div class="detail-cell">Qty</div>
                    <div class="detail-cell">Price</div>
                </div>
                ${itemsHtml}
            </div>
        `;

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        const closeBtn = content.querySelector('.btn-close');
        if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
    }
}

// Global instance
window.ordersManager = new OrdersManager();


