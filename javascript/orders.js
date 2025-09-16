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

        fetch('view-order-popup.html', { cache: 'no-cache' })
            .then(res => res.text())
            .then(html => {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) return;

                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.addEventListener('click', (evt) => {
                    if (evt.target === overlay) {
                        document.body.removeChild(overlay);
                        document.body.style.overflow = '';
                    }
                });

                // Populate header/info
                const idEl = formContainer.querySelector('.order-id');
                const dateEl = formContainer.querySelector('.order-date');
                const customerEl = formContainer.querySelector('.order-customer');
                const statusEl = formContainer.querySelector('.order-status');
                const paymentEl = formContainer.querySelector('.order-payment-method');
                if (idEl) idEl.textContent = `Order #${order.orderId}`;
                if (dateEl) dateEl.textContent = new Date(order.timestamp).toLocaleString();
                if (customerEl) customerEl.textContent = String(order.customer || 'Unknown');
                if (statusEl) statusEl.textContent = String(order.status || 'Pending');
                if (paymentEl) paymentEl.textContent = String(order.paymentMethod || 'TBD');

                // Populate items
                const itemsWrap = formContainer.querySelector('.order-items');
                if (itemsWrap) {
                    const items = (order.items || []).map(it => {
                        const name = it.name || it.productName || 'Item';
                        const variant = it.variant || it.sku || '';
                        const qty = it.qty || it.quantity || 1;
                        const price = Number(it.price || 0);
                        const lineTotal = qty * price;
                        return `
                            <div class="list-item">
                              <div class="item-main">
                                <div class="item-title">${name}</div>
                                <div class="item-subtitle">${variant}</div>
                              </div>
                              <div class="item-meta">${qty} x $${price.toFixed(2)} = $${lineTotal.toFixed(2)}</div>
                            </div>
                        `;
                    }).join('');
                    itemsWrap.innerHTML = items || '<div class="list-item">No items</div>';
                }

                // Totals (fallbacks if not present on order)
                const subtotalEl = formContainer.querySelector('.order-subtotal');
                const taxEl = formContainer.querySelector('.order-tax');
                const discountEl = formContainer.querySelector('.order-discount');
                const totalEl = formContainer.querySelector('.order-total');
                const subtotal = (order.items || []).reduce((sum, it) => sum + (Number(it.price || 0) * (Number(it.qty || it.quantity || 1))), 0);
                const tax = Number(order.tax || 0);
                const discount = Number(order.discount || 0);
                const total = Number(order.total || (subtotal + tax - discount));
                if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
                if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;
                if (discountEl) discountEl.textContent = `$${discount.toFixed(2)}`;
                if (totalEl) totalEl.innerHTML = `<strong>$${total.toFixed(2)}</strong>`;

                // Wire Close
                const backBtn = formContainer.querySelector('.back-btn');
                if (backBtn) backBtn.addEventListener('click', () => {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                });

                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
            })
            .catch(err => console.error('Failed to open order view:', err));
    }
}

// Global instance
window.ordersManager = new OrdersManager();


