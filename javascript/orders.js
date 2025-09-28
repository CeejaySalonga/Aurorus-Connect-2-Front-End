// Orders Management JavaScript

class OrdersManager {
    constructor() {
        this.orders = [];
        this.isLoading = false;
        this.init();
    }

	// Utility: normalize proof-of-payment input into a usable <img> src
	// - Accepts: full data URLs, raw base64 payloads, or http(s) URLs
	// - Returns: a string suitable for <img src>
	convertToImageSrc(base64OrUrl) {
		if (!base64OrUrl || typeof base64OrUrl !== 'string') return '';
		const input = base64OrUrl.trim();
		// Already a data URL
		if (input.startsWith('data:image/')) return input;
		// Is a URL
		if (input.startsWith('http://') || input.startsWith('https://')) return input;
		// Detect common base64 headers to infer mime
		const formats = [
			{ header: '/9j/', format: 'jpeg' }, // JPEG
			{ header: 'iVBORw0KGgo', format: 'png' }, // PNG
			{ header: 'R0lGOD', format: 'gif' }, // GIF
			{ header: 'UklGR', format: 'webp' } // WEBP
		];
		for (const { header, format } of formats) {
			if (input.startsWith(header)) {
				return `data:image/${format};base64,${input}`;
			}
		}
		// Fallback to PNG
		return `data:image/png;base64,${input}`;
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
            const root = snapshot.val() || {};

            // Support nested structure: TBL_ORDERS/{userKey}/{orderId} -> order
            const aggregated = [];

            const toArray = (obj) => Array.isArray(obj) ? obj : (obj ? Object.values(obj) : []);
            const normalizeTimestamp = (ts) => {
                if (!ts) return new Date().toISOString();
                if (typeof ts === 'number') {
                    // assume epoch ms or seconds
                    const ms = ts > 2_000_000_000 ? ts : ts * 1000;
                    return new Date(ms).toISOString();
                }
                return ts;
            };

            const isPlainObject = (val) => val && typeof val === 'object' && !Array.isArray(val);

            Object.entries(root).forEach(([maybeUserKey, value]) => {
                // If direct orders flat list, treat keys as orderIds
                if (isPlainObject(value) && (value.orderId || value.items || value.userName)) {
                    const order = value;
                    const items = toArray(order.items);
                    const totals = order.totals || {};
                    const total = Number(order.total ?? totals.grandTotal ?? totals.total ?? 0);
                    aggregated.push({
                        orderId: order.orderId || maybeUserKey,
                        customer: order.userName || order.userId || 'Unknown',
                        items,
                        totals,
                        total,
                        status: order.status || order.payment?.status,
                        paymentMethod: order.payment?.method,
                        payment: order.payment || {},
                        timestamp: normalizeTimestamp(order.timestamp || order.createdAt || order.updatedAt)
                    });
                    return;
                }

                // Skip non-objects like test flags
                if (!isPlainObject(value)) return;

                // value is user node: orders under it
                Object.entries(value).forEach(([orderId, order]) => {
                    if (!isPlainObject(order)) return;
                    const items = toArray(order.items);
                    const totals = order.totals || {};
                    const total = Number(order.total ?? totals.grandTotal ?? totals.total ?? 0);
                    aggregated.push({
                        orderId: order.orderId || orderId,
                        customer: order.userName || maybeUserKey || order.userId || 'Unknown',
                        items,
                        totals,
                        status: order.status || order.payment?.status,
                        paymentMethod: order.payment?.method,
                        total,
                        userEmail: order.userEmail,
                        userId: order.userId,
                        shipping: order.shipping || {},
                        payment: order.payment || {},
                        admin: order.admin || {},
                        timeline: order.timeline || {},
                        timestamp: normalizeTimestamp(order.timestamp || order.createdAt || order.updatedAt)
                    });
                });
            });

            // Sort newest first
            aggregated.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            this.orders = aggregated;
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
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No orders</td></tr>';
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
                    <td>${o.status || 'Pending'}</td>
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
                const paymentStatusEl = formContainer.querySelector('.order-payment-status');
                const proofWrap = formContainer.querySelector('.order-proof-wrap');
                const proofImg = formContainer.querySelector('.order-proof-img');
                const proofLink = formContainer.querySelector('.order-proof-link');
                if (idEl) idEl.textContent = `Order #${order.orderId}`;
                if (dateEl) dateEl.textContent = new Date(order.timestamp).toLocaleString();
                if (customerEl) customerEl.textContent = String(order.customer || 'Unknown');
                if (statusEl) statusEl.textContent = String(order.status || 'Pending');
                if (paymentEl) paymentEl.textContent = String(order.paymentMethod || order.payment?.method || '—');
                if (paymentStatusEl) paymentStatusEl.textContent = String(order.payment?.status || order.status || '—');
				// Proof of payment (supports data URL, raw base64, or URL)
				const proofRaw = order.payment?.proofBase64 || order.payment?.proof || order.paymentProofBase64 || order.paymentProofUrl || order.totals?.proofBase64 || order.totals?.proofUrl;
				const proofSrc = this.convertToImageSrc(proofRaw || '');
				if (proofWrap && proofImg && proofLink) {
					if (proofSrc) {
						proofImg.src = proofSrc;
						proofLink.href = proofSrc;
						proofWrap.style.display = '';
					} else {
						proofWrap.style.display = 'none';
					}
				}

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

                // Shipping
                const ship = order.shipping || {};
                const shipNameEl = formContainer.querySelector('.order-ship-name');
                const shipAddrEl = formContainer.querySelector('.order-ship-address');
                const shipContactEl = formContainer.querySelector('.order-ship-contact');
                if (shipNameEl) shipNameEl.textContent = String(ship.name || ship.recipient || order.customer || '—');
                if (shipAddrEl) shipAddrEl.textContent = [ship.address1, ship.address2, ship.city, ship.state, ship.zip]
                    .filter(Boolean).join(', ') || '—';
                if (shipContactEl) shipContactEl.textContent = ship.phone || ship.contact || order.userEmail || '—';

                // Totals (fallbacks if not present on order)
                const subtotalEls = formContainer.querySelectorAll('.order-subtotal');
                const taxEls = formContainer.querySelectorAll('.order-tax');
                const discountEls = formContainer.querySelectorAll('.order-discount');
                const totalEls = formContainer.querySelectorAll('.order-total');
                const subtotal = (order.items || []).reduce((sum, it) => {
                    const unitPrice = Number(it.price ?? it.unitPrice ?? it.amount ?? 0);
                    const quantity = Number(it.qty ?? it.quantity ?? 1);
                    const lineTotal = Number(it.lineTotal ?? it.totalPrice ?? (unitPrice * quantity));
                    // Prefer explicit lineTotal/totalPrice if present to avoid rounding drift
                    return sum + (isNaN(lineTotal) ? (unitPrice * quantity) : lineTotal);
                }, 0);
                const tax = Number(order.tax ?? order.totals?.tax ?? order.totals?.taxAmount ?? 0);
                const discount = Number(order.discount ?? order.totals?.discount ?? order.totals?.discountsTotal ?? 0);
                const total = Number(
                    order.total ??
                    order.totals?.total ??
                    order.totals?.grandTotal ??
                    (subtotal + tax - discount)
                );
                subtotalEls.forEach(el => { el.textContent = `$${subtotal.toFixed(2)}`; });
                taxEls.forEach(el => { el.textContent = `$${tax.toFixed(2)}`; });
                discountEls.forEach(el => { el.textContent = `$${discount.toFixed(2)}`; });
                totalEls.forEach(el => { el.innerHTML = `<strong>$${total.toFixed(2)}</strong>`; });

                // Wire Close
                const backBtn = formContainer.querySelector('.back-btn');
                if (backBtn) backBtn.addEventListener('click', () => {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                });

                // Status select initial value
                const statusSelect = formContainer.querySelector('.order-status-select');
                if (statusSelect) {
                    const normalized = String(order.status || 'PAYMENT_SUBMITTED').toUpperCase().replace(/\s+/g, '_');
                    statusSelect.value = normalized;
                }

                // Save status handler
                const saveBtn = formContainer.querySelector('.save-status-btn');
                if (saveBtn) {
                    saveBtn.addEventListener('click', async () => {
                        try {
                            const newStatus = statusSelect ? statusSelect.value : 'PAYMENT_SUBMITTED';

                            // Try to find path under TBL_ORDERS/{userKey}/{orderId}
                            const rootRef = window.firebaseDatabase.ref(window.database, 'TBL_ORDERS');
                            const rootSnap = await window.firebaseDatabase.get(rootRef);
                            const rootVal = rootSnap.val() || {};

                            let updated = false;
                            for (const [userKey, ordersNode] of Object.entries(rootVal)) {
                                if (ordersNode && typeof ordersNode === 'object' && ordersNode[order.orderId]) {
                                    const targetRef = window.firebaseDatabase.ref(window.database, `TBL_ORDERS/${userKey}/${order.orderId}`);
                                    await window.firebaseDatabase.update(targetRef, { status: newStatus });
                                    updated = true;
                                    break;
                                }
                            }

                            // Fallback: flat structure TBL_ORDERS/{orderId}
                            if (!updated && rootVal[order.orderId]) {
                                const flatRef = window.firebaseDatabase.ref(window.database, `TBL_ORDERS/${order.orderId}`);
                                await window.firebaseDatabase.update(flatRef, { status: newStatus });
                                updated = true;
                            }

                            // Update local state and UI badge
                            order.status = newStatus;
                            const statusText = formContainer.querySelector('.order-status');
                            if (statusText) statusText.textContent = newStatus.replace(/_/g, ' ');
                            const paymentStatusEl2 = formContainer.querySelector('.order-payment-status');
                            if (paymentStatusEl2) paymentStatusEl2.textContent = newStatus.replace(/_/g, ' ');

                            // Rerender list row
                            this.renderOrdersTable();
                        } catch (err) {
                            console.error('Failed to update order status:', err);
                            alert('Failed to update status');
                        }
                    });
                }

                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
            })
            .catch(err => console.error('Failed to open order view:', err));
    }
}

// Global instance
window.ordersManager = new OrdersManager();


