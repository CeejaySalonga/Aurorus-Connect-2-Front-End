// Orders Management JavaScript

class OrdersManager {
    constructor() {
        this.orders = [];
        this.isLoading = false;
        this.smtp = {
            endpoint: typeof window !== 'undefined' ? window.SMTP_ENDPOINT : undefined,
            emailjs: typeof window !== 'undefined' ? window.emailjs : undefined,
            emailjsConfig: typeof window !== 'undefined' ? window.EMAILJS_CONFIG : undefined
        };
        try {
            const mode = this.smtp.endpoint
                ? `SMTP endpoint: ${this.smtp.endpoint}`
                : (this.smtp.emailjs && this.smtp.emailjsConfig?.serviceId && this.smtp.emailjsConfig?.templateId
                    ? `EmailJS: serviceId=${this.smtp.emailjsConfig.serviceId}, templateId=${this.smtp.emailjsConfig.templateId}`
                    : 'Email sending not configured');
            console.info('[Orders] Email configuration:', mode);
        } catch (e) {
            // noop
        }
        this.init();
    }

    showToast(message, type = 'info') {
        try {
            const existing = document.querySelector('.toast-container');
            const container = existing || (() => {
                const c = document.createElement('div');
                c.className = 'toast-container';
                c.style.position = 'fixed';
                c.style.zIndex = '9999';
                c.style.right = '16px';
                c.style.bottom = '16px';
                c.style.display = 'flex';
                c.style.flexDirection = 'column';
                c.style.gap = '8px';
                document.body.appendChild(c);
                return c;
            })();

            const toast = document.createElement('div');
            toast.className = `toast-item toast-${type}`;
            toast.textContent = message;
            toast.style.padding = '10px 12px';
            toast.style.borderRadius = '8px';
            toast.style.color = '#0b1a0f';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
            toast.style.border = '1px solid #e5e7eb';
            toast.style.background = type === 'success' ? '#ecfdf5' : (type === 'error' ? '#fef2f2' : '#f3f4f6');
            container.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity .3s ease';
                setTimeout(() => container.removeChild(toast), 350);
            }, 3500);
        } catch (_) {
            // Fallback
            alert(message);
        }
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
        this.initTabs();
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

    initTabs() {
        const tabs = document.querySelectorAll('.orders-tabs .tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const target = btn.getAttribute('data-target');
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    if ('#' + pane.id === target) pane.classList.add('active');
                    else pane.classList.remove('active');
                });
                // Re-render tables when switching tabs
                this.renderOrdersTable();
            });
        });
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
						userEmail: order.userEmail,
						userId: order.userId,
						shipping: order.shipping || {},
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
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        
        let ordersToday = 0;
        let revenueToday = 0;
        let ordersThisWeek = 0;
        let revenueThisWeek = 0;
        let totalOrders = this.orders.length;
        let totalRevenue = 0;
        
        // Status counts
        const statusCounts = {
            pending: 0,
            'payment-submitted': 0,
            'payment-verified': 0,
            'proof-declined': 0,
            'to-ship': 0,
            'ready-to-pickup': 0,
            completed: 0,
            cancelled: 0
        };
        
        
        for (const order of this.orders) {
            const orderDate = new Date(order.timestamp);
            const orderDateStr = orderDate.toISOString().slice(0, 10);
            const orderTotal = Number(order.total || 0);
            const status = (order.status || 'pending').toLowerCase().replace(/_/g, '-');
            
            // Only include revenue from non-cancelled orders
            if (status !== 'cancelled') {
                totalRevenue += orderTotal;
                
                // Today's stats
                if (orderDateStr === today) {
                ordersToday += 1;
                    revenueToday += orderTotal;
                }
                
                // This week's stats
                if (orderDate >= startOfWeek && orderDate <= endOfWeek) {
                    ordersThisWeek += 1;
                    revenueThisWeek += orderTotal;
                }
            }
            
            // Status counts (include all orders for status tracking)
            if (statusCounts.hasOwnProperty(status)) {
                statusCounts[status]++;
            } else {
                statusCounts.pending++;
            }
            
        }
        
        // Update today's stats
        const oEl = document.getElementById('ordersToday');
        const rEl = document.getElementById('revenueToday');
        if (oEl) oEl.textContent = String(ordersToday);
        if (rEl) rEl.textContent = `₱${revenueToday.toFixed(2)}`;
        
        // Update weekly stats
        const owEl = document.getElementById('ordersThisWeek');
        const rwEl = document.getElementById('revenueThisWeek');
        if (owEl) owEl.textContent = String(ordersThisWeek);
        if (rwEl) rwEl.textContent = `₱${revenueThisWeek.toFixed(2)}`;
        
        // Update status breakdown
        document.getElementById('statusPending').textContent = statusCounts.pending;
        document.getElementById('statusPaymentSubmitted').textContent = statusCounts['payment-submitted'];
        document.getElementById('statusPaymentVerified').textContent = statusCounts['payment-verified'];
        document.getElementById('statusProofDeclined').textContent = statusCounts['proof-declined'];
        document.getElementById('statusToShip').textContent = statusCounts['to-ship'];
        document.getElementById('statusReadyToPickup').textContent = statusCounts['ready-to-pickup'];
        document.getElementById('statusCompleted').textContent = statusCounts.completed;
        
        
        // Update top customers
        this.updateTopCustomers();
        
        // Update performance metrics
        const nonCancelledOrders = totalOrders - statusCounts.cancelled;
        const avgOrderValue = nonCancelledOrders > 0 ? totalRevenue / nonCancelledOrders : 0;
        const completedOrders = statusCounts.completed;
        const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
        
        
        document.getElementById('avgOrderValue').textContent = `₱${avgOrderValue.toFixed(2)}`;
        document.getElementById('totalOrders').textContent = String(totalOrders);
        document.getElementById('completionRate').textContent = `${completionRate.toFixed(1)}%`;
    }
    
    
    updateTopCustomers() {
        const container = document.getElementById('topCustomers');
        if (!container) return;
        
        // Group orders by customer
        const customerStats = {};
        
        for (const order of this.orders) {
            const status = (order.status || 'pending').toLowerCase().replace(/_/g, '-');
            
            // Only include non-cancelled orders in customer stats
            if (status !== 'cancelled') {
                const customer = order.customer || 'Unknown';
                if (!customerStats[customer]) {
                    customerStats[customer] = {
                        name: customer,
                        orderCount: 0,
                        totalSpent: 0
                    };
                }
                customerStats[customer].orderCount++;
                customerStats[customer].totalSpent += Number(order.total || 0);
            }
        }
        
        // Convert to array and sort by total spent
        const topCustomers = Object.values(customerStats)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 5);
        
        if (topCustomers.length === 0) {
            container.innerHTML = '<div class="no-data">No customer data</div>';
            return;
        }
        
        const customersHtml = topCustomers.map(customer => `
            <div class="top-customer-item">
                <div class="top-customer-info">
                    <div class="top-customer-name">${customer.name}</div>
                    <div class="top-customer-orders">${customer.orderCount} orders</div>
                </div>
                <div class="top-customer-amount">₱${customer.totalSpent.toFixed(2)}</div>
            </div>
        `).join('');
        
        container.innerHTML = customersHtml;
    }

    renderOrdersTable() {
        const q = (document.getElementById('ordersSearch')?.value || '').toLowerCase();
        const allFiltered = this.orders.filter(o =>
            o.orderId.toLowerCase().includes(q) ||
            String(o.customer).toLowerCase().includes(q)
        );

        // Filter orders by status for each tab
        const processingOrders = allFiltered.filter(o => {
            const status = (o.status || 'pending').toLowerCase().replace(/_/g, '-');
            return status !== 'completed' && status !== 'cancelled';
        });

        const completedOrders = allFiltered.filter(o => {
            const status = (o.status || 'pending').toLowerCase().replace(/_/g, '-');
            return status === 'completed';
        });

        const cancelledOrders = allFiltered.filter(o => {
            const status = (o.status || 'pending').toLowerCase().replace(/_/g, '-');
            return status === 'cancelled';
        });

        // Render processing orders
        this.renderOrdersForTab(processingOrders, 'processingOrdersTableBody');
        
        // Render completed orders
        this.renderOrdersForTab(completedOrders, 'completedOrdersTableBody');
        
        // Render cancelled orders
        this.renderOrdersForTab(cancelledOrders, 'cancelledOrdersTableBody');
    }

    renderOrdersForTab(orders, tbodyId) {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No orders</td></tr>';
            return;
        }

        const rows = orders.map(o => {
            const itemCount = (o.items || []).length;
            const itemsPreview = itemCount === 1 ? '1 item' : `${itemCount} items`;
            return `
                <tr data-order-id="${o.orderId}">
                    <td>${o.orderId}</td>
                    <td>${o.customer}</td>
                    <td>${itemsPreview}</td>
                    <td>₱${Number(o.total || 0).toFixed(2)}</td>
                    <td>${new Date(o.timestamp).toLocaleString()}</td>
                    <td><span class="status-badge status-${(o.status || 'pending').toLowerCase().replace(/_/g, '-')}">${(o.status || 'Pending').replace(/_/g, ' ')}</span></td>
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

    async updateOrderStatus(orderId, newStatus) {
        try {
            const previous = this.orders.find(o => o.orderId === orderId)?.status || '';
            // Try to find path under TBL_ORDERS/{userKey}/{orderId}
            const rootRef = window.firebaseDatabase.ref(window.database, 'TBL_ORDERS');
            const rootSnap = await window.firebaseDatabase.get(rootRef);
            const rootVal = rootSnap.val() || {};

            let updated = false;
            for (const [userKey, ordersNode] of Object.entries(rootVal)) {
                if (ordersNode && typeof ordersNode === 'object' && ordersNode[orderId]) {
                    const targetRef = window.firebaseDatabase.ref(window.database, `TBL_ORDERS/${userKey}/${orderId}`);
                    await window.firebaseDatabase.update(targetRef, { status: newStatus });
                    updated = true;
                    break;
                }
            }

            // Fallback: flat structure TBL_ORDERS/{orderId}
            if (!updated && rootVal[orderId]) {
                const flatRef = window.firebaseDatabase.ref(window.database, `TBL_ORDERS/${orderId}`);
                await window.firebaseDatabase.update(flatRef, { status: newStatus });
                updated = true;
            }

            if (!updated) {
                throw new Error('Order not found');
            }

            // Update local state
            const order = this.orders.find(o => o.orderId === orderId);
            if (order) {
                order.status = newStatus;
            }

            // Re-render tables to reflect status change
            this.renderOrdersTable();

            // If transitioned to PAYMENT_VERIFIED, send notification
            if (String(previous).toUpperCase() !== 'PAYMENT_VERIFIED' && String(newStatus).toUpperCase() === 'PAYMENT_VERIFIED') {
                this.sendPaymentVerifiedEmail(orderId)
                    .then(() => this.showToast('Payment verified email sent', 'success'))
                    .catch(err => {
                        console.warn('Failed to send payment verified email:', err);
                        this.showToast('Failed to send payment verified email', 'error');
                    });
            }

            // If transitioned to READY_TO_SHIP, send notification
            if (String(previous).toUpperCase() !== 'READY_TO_SHIP' && String(newStatus).toUpperCase() === 'READY_TO_SHIP') {
                this.sendReadyToShipEmail(orderId)
                    .then(() => this.showToast('Ready to ship email sent', 'success'))
                    .catch(err => {
                        console.warn('Failed to send ready to ship email:', err);
                        this.showToast('Failed to send ready to ship email', 'error');
                    });
            }

            return true;
        } catch (error) {
            console.error('Error updating order status:', error);
            throw error;
        }
    }

    getOrderById(orderId) {
        return this.orders.find(o => o.orderId === orderId);
    }

    async sendPaymentVerifiedEmail(orderId) {
        const order = this.getOrderById(orderId);
        if (!order) throw new Error('Order not loaded');

        const recipient = order.userEmail || order.customerEmail || order.shipping?.email || '';
        if (!recipient) {
            const msg = 'No recipient email on order. Add userEmail or shipping.email to the order.';
            console.warn('[Orders] sendPaymentVerifiedEmail:', msg, { orderId });
            alert('Cannot send email: missing customer email on the order.');
            throw new Error(msg);
        }

        const itemCount = (order.items || []).length;
        const total = Number(order.total || 0).toFixed(2);
        const shippingType = (order.shipping?.type || order.shipping?.shippingType || 'Standard');

        const payload = {
            to: recipient,
            subject: `Payment Verified for Order #${order.orderId}`,
            message: `Hi ${order.customer || ''},\n\nYour order #${order.orderId} has been verified.\n\nDetails:\n- Items: ${itemCount}\n- Total: ₱${total}\n- Shipping: ${shippingType}\n- Date: ${new Date(order.timestamp).toLocaleString()}\n\nThank you for shopping with us!`,
            meta: {
                orderId: order.orderId,
                customer: order.customer,
                items: itemCount,
                total: total,
                shippingType
            }
        };

        // Prefer server endpoint if configured
        if (this.smtp.endpoint) {
            console.info('[Orders] Sending email via SMTP endpoint...', { to: payload.to, orderId: order.orderId });
            const res = await fetch(this.smtp.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`SMTP endpoint error: ${res.status}`);
            console.info('[Orders] SMTP email sent.');
            return true;
        }

        // Fallback to EmailJS if configured
        if (this.smtp.emailjs && this.smtp.emailjsConfig?.serviceId && this.smtp.emailjsConfig?.templateId) {
            const templateParams = {
                to_email: recipient,
                to_name: order.customer || 'Customer',
                order_id: order.orderId,
                items_count: String(itemCount),
                total_amount: `₱${total}`,
                shipping_type: shippingType,
                placed_at: new Date(order.timestamp).toLocaleString()
            };
            const { serviceId, templateId } = this.smtp.emailjsConfig;
            console.info('[Orders] Sending email via EmailJS...', { to: templateParams.to_email, orderId: order.orderId, serviceId, templateId });
            await this.smtp.emailjs.send(serviceId, templateId, templateParams);
            console.info('[Orders] EmailJS email sent.');
            return true;
        }

        const msg = 'No SMTP endpoint or EmailJS configured. Set window.SMTP_ENDPOINT or window.EMAILJS_CONFIG.';
        console.warn('[Orders] sendPaymentVerifiedEmail:', msg);
        alert('Email not configured. Please set SMTP endpoint or EmailJS config.');
        throw new Error(msg);
    }

    async sendReadyToShipEmail(orderId) {
        const order = this.getOrderById(orderId);
        if (!order) throw new Error('Order not loaded');

        const recipient = order.userEmail || order.customerEmail || order.shipping?.email || '';
        if (!recipient) {
            const msg = 'No recipient email on order. Add userEmail or shipping.email to the order.';
            console.warn('[Orders] sendReadyToShipEmail:', msg, { orderId });
            this.showToast('Cannot send email: missing customer email on the order.', 'error');
            throw new Error(msg);
        }

        const itemCount = (order.items || []).length;
        const total = Number(order.total || 0).toFixed(2);
        const shippingType = (order.shipping?.type || order.shipping?.shippingType || 'Standard');

        // EmailJS only (this status is informational; no server endpoint fallback)
        if (this.smtp.emailjs && window.EMAILJS_CONFIG?.serviceId && window.EMAILJS_CONFIG?.readyToShipTemplateId) {
            const templateParams = {
                to_email: recipient,
                to_name: order.customer || 'Customer',
                order_id: order.orderId,
                items_count: String(itemCount),
                total_amount: `₱${total}`,
                shipping_type: shippingType,
                placed_at: new Date(order.timestamp).toLocaleString()
            };
            const serviceId = window.EMAILJS_CONFIG.serviceId;
            const templateId = window.EMAILJS_CONFIG.readyToShipTemplateId;
            console.info('[Orders] Sending READY_TO_SHIP email via EmailJS...', { to: templateParams.to_email, orderId: order.orderId, serviceId, templateId });
            await this.smtp.emailjs.send(serviceId, templateId, templateParams);
            console.info('[Orders] READY_TO_SHIP EmailJS email sent.');
            return true;
        }

        const msg = 'READY_TO_SHIP EmailJS not configured. Set window.EMAILJS_CONFIG.readyToShipTemplateId';
        console.warn('[Orders] sendReadyToShipEmail:', msg);
        this.showToast('Email not configured for Ready To Ship. Please set template ID.', 'error');
        throw new Error(msg);
    }

    openProofInNewWindow(proofSrc, orderId) {
        // Create a new window with proper HTML structure for displaying the image
        const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
        
        if (newWindow) {
            newWindow.document.write(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Proof of Payment - Order #${orderId}</title>
                    <style>
                        body {
                            margin: 0;
                            padding: 20px;
                            background-color: #f5f5f5;
                            font-family: Arial, sans-serif;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            min-height: 100vh;
                        }
                        .header {
                            background: white;
                            padding: 20px;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            margin-bottom: 20px;
                            text-align: center;
                            width: 100%;
                            max-width: 800px;
                        }
                        .header h1 {
                            margin: 0 0 10px 0;
                            color: #333;
                            font-size: 24px;
                        }
                        .header p {
                            margin: 0;
                            color: #666;
                            font-size: 14px;
                        }
                        .image-container {
                            background: white;
                            padding: 20px;
                            border-radius: 8px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                            text-align: center;
                            width: 100%;
                            max-width: 800px;
                        }
                        .proof-image {
                            max-width: 100%;
                            max-height: 70vh;
                            border-radius: 8px;
                            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                        }
                        .download-btn {
                            background: #3482B4;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            margin-top: 15px;
                            text-decoration: none;
                            display: inline-block;
                        }
                        .download-btn:hover {
                            background: #2c6b9a;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Proof of Payment</h1>
                        <p>Order #${orderId}</p>
                    </div>
                    <div class="image-container">
                        <img src="${proofSrc}" alt="Proof of Payment" class="proof-image">
                        <br>
                        <a href="${proofSrc}" download="proof-of-payment-${orderId}.png" class="download-btn">
                            Download Image
                        </a>
                    </div>
                </body>
                </html>
            `);
            newWindow.document.close();
        } else {
            // Fallback if popup is blocked
            alert('Popup blocked. Please allow popups for this site to view the proof of payment.');
        }
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
						// Set up proper link behavior for data URLs
						proofLink.href = '#';
						proofLink.addEventListener('click', (e) => {
							e.preventDefault();
							this.openProofInNewWindow(proofSrc, order.orderId);
						});
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
                              <div class="item-meta">${qty} x ₱${price.toFixed(2)} = ₱${lineTotal.toFixed(2)}</div>
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
                const shipTypeEl = formContainer.querySelector('.order-ship-type');
                
                if (shipNameEl) shipNameEl.textContent = String(ship.name || ship.recipient || order.customer || '—');
                if (shipAddrEl) {
                    // Handle different address formats from database
                    const addressParts = [
                        ship.address || ship.address1,
                        ship.address2,
                        ship.city,
                        ship.state,
                        ship.zip
                    ].filter(Boolean);
                    shipAddrEl.textContent = addressParts.length > 0 ? addressParts.join(', ') : '—';
                }
                if (shipContactEl) shipContactEl.textContent = ship.phone || ship.contact || order.userEmail || '—';
                if (shipTypeEl) {
                    const shippingType = ship.type || ship.shippingType || 'standard';
                    shipTypeEl.textContent = shippingType.charAt(0).toUpperCase() + shippingType.slice(1);
                }

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
                subtotalEls.forEach(el => { el.textContent = `₱${subtotal.toFixed(2)}`; });
                taxEls.forEach(el => { el.textContent = `₱${tax.toFixed(2)}`; });
                discountEls.forEach(el => { el.textContent = `₱${discount.toFixed(2)}`; });
                totalEls.forEach(el => { el.innerHTML = `<strong>₱${total.toFixed(2)}</strong>`; });

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
                            const prevStatus = String(order.status || '').toUpperCase();

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

                            // Rerender tables to reflect status change
                            this.renderOrdersTable();

                            // Send email if transitioned to PAYMENT_VERIFIED
                            if (prevStatus !== 'PAYMENT_VERIFIED' && String(newStatus).toUpperCase() === 'PAYMENT_VERIFIED') {
                                this.sendPaymentVerifiedEmail(order.orderId)
                                    .then(() => this.showToast('Payment verified email sent', 'success'))
                                    .catch(err => {
                                        console.warn('Failed to send payment verified email:', err);
                                        this.showToast('Failed to send payment verified email', 'error');
                                    });
                            }

                            // Send email if transitioned to READY_TO_SHIP
                            if (prevStatus !== 'READY_TO_SHIP' && String(newStatus).toUpperCase() === 'READY_TO_SHIP') {
                                this.sendReadyToShipEmail(order.orderId)
                                    .then(() => this.showToast('Ready to ship email sent', 'success'))
                                    .catch(err => {
                                        console.warn('Failed to send ready to ship email:', err);
                                        this.showToast('Failed to send ready to ship email', 'error');
                                    });
                            }

                            // Close the popup after successful update
                            document.body.removeChild(overlay);
                            document.body.style.overflow = '';
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


