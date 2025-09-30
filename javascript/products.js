class ProductManager {
    constructor() {
        this.products = [];
        this.currentImageBase64 = '';
        this.filteredProducts = null;
        this.activeFilters = { category: '', variant: '' };
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Wait for Firebase to be ready before loading products
        if (window.firebaseReady) {
            this.loadProducts();
        } else {
            window.addEventListener('firebaseReady', () => {
                this.loadProducts();
            });
        }
    }

    setupEventListeners() {
        // Create product button is handled by create-popup.js

        // Category dropdowns
        document.addEventListener('click', (e) => {
            if (e.target.closest('.category-dropdown-btn')) {
                const dropdownId = e.target.closest('.category-dropdown-btn').onclick.toString().match(/toggleDropdown\('(\w+)'\)/)[1];
                this.toggleDropdown(dropdownId);
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.matches('.category-dropdown-btn')) {
                const dropdowns = document.querySelectorAll('.dropdown-content');
                dropdowns.forEach(dropdown => {
                    dropdown.classList.remove('show');
                });
            }
        });
    }

    async loadProducts() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
            this.products = snapshot.val() ? Object.entries(snapshot.val()).map(([id, data]) => ({
                id,
                ...data
            })) : [];
            
            this.renderProducts();
            this.updateStats();
            this.wireSearch();
            this.initDropdownFilters();
        } catch (error) {
            console.error('Error loading products:', error);
            this.showNotification('Error loading products', 'error');
        }
    }

    initDropdownFilters() {
        const catMenu = document.getElementById('category-dropdown');
        const varMenu = document.getElementById('variant-dropdown');
        if (!catMenu || !varMenu) return;

        const addItem = (menu, label, value) => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'dropdown-item';
            a.textContent = label;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                if (menu === catMenu) this.activeFilters.category = value;
                if (menu === varMenu) this.activeFilters.variant = value;
                this.applyFiltersAndRender();
                // close menu
                const parent = menu.closest('.dropdown-content');
                parent && parent.classList.remove('show');
            });
            menu.appendChild(a);
        };

        // Build unique lists
        const categories = Array.from(new Set(this.products.map(p => p.category).filter(Boolean))).sort();
        const variants = Array.from(new Set(this.products.map(p => p.variant).filter(Boolean))).sort();

        // Populate menus
        catMenu.innerHTML = '';
        addItem(catMenu, 'All', '');
        categories.forEach(c => addItem(catMenu, c, c));

        varMenu.innerHTML = '';
        addItem(varMenu, 'All', '');
        variants.forEach(v => addItem(varMenu, v, v));
    }

    applyFiltersAndRender() {
        const q = (document.getElementById('productsSearch')?.value || '').trim().toLowerCase();
        const { category, variant } = this.activeFilters;
        const matches = (p) => {
            const qOk = !q || [p.productName, p.category, p.variant, p.sku].some(v => (v || '').toLowerCase().includes(q));
            const cOk = !category || p.category === category;
            const vOk = !variant || p.variant === variant;
            return qOk && cOk && vOk;
        };
        this.filteredProducts = this.products.filter(matches);
        this.renderProducts();
        this.updateStats();
    }

    wireSearch() {
        const input = document.getElementById('productsSearch');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = input.value.trim().toLowerCase();
            if (!q) {
                this.filteredProducts = null;
            } else {
                this.filteredProducts = this.products.filter(p => {
                    const name = (p.productName || '').toLowerCase();
                    const category = (p.category || '').toLowerCase();
                    const variant = (p.variant || '').toLowerCase();
                    const sku = (p.sku || '').toLowerCase();
                    return name.includes(q) || category.includes(q) || variant.includes(q) || sku.includes(q);
                });
            }
            this.renderProducts();
            this.updateStats();
        });
    }

    renderProducts() {
        const tableBody = document.getElementById('productsTableBody');
        if (!tableBody) return;

        const allCount = (this.filteredProducts ?? this.products).length;
        if (allCount === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No products found</td></tr>';
            const pageInfoEl = document.getElementById('pageInfo');
            if (pageInfoEl) pageInfoEl.textContent = 'Page 1 of 1 (0 rows)';
            return;
        }

        const list = (this.filteredProducts ?? this.products);
        tableBody.innerHTML = list.map(product => {
            const stock = product.stock || 0;
            let statusClass, statusText;
            
            if (stock === 0) {
                statusClass = 'out-of-stock';
                statusText = 'Out of Stock';
            } else if (stock <= 5) {
                statusClass = 'low-stock';
                statusText = 'Low Stock';
            } else {
                statusClass = 'in-stock';
                statusText = 'In Stock';
            }
            
            return `
            <tr data-id="${product.id}">
                <td>${product.sku || product.id}</td>
                <td>${product.productName || 'Unnamed Product'}</td>
                <td>
                    <span class="stock-badge ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}">
                        ${product.stock || 0}
                    </span>
                </td>
                <td>${product.category || 'Uncategorized'}</td>
                <td>${product.variant || 'Standard'}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
                <td>
                    <button class="btn-view" data-action="view" aria-label="View product"><i class="fas fa-eye"></i></button>
                    <button class="btn-edit" data-action="edit" aria-label="Edit product"><i class="fas fa-edit"></i></button>
                </td>
            </tr>
        `;
        }).join('');

        // Delegate clicks for view/edit buttons
        tableBody.removeEventListener('click', this._tableClickHandler);
        this._tableClickHandler = (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const row = btn.closest('tr');
            const productId = row && row.getAttribute('data-id');
            if (!productId) return;
            if (btn.dataset.action === 'view') {
                this.viewProduct(productId);
            } else if (btn.dataset.action === 'edit') {
                this.editProduct(productId);
            }
        };
        tableBody.addEventListener('click', this._tableClickHandler);

        // Update simple page info text
        const pageInfoEl = document.getElementById('pageInfo');
        if (pageInfoEl) {
            pageInfoEl.textContent = `Page 1 of 1 (${list.length} rows)`;
        }

        // Re-init pagination if available
        if (window.initTablePagination) {
            window.initTablePagination('.products-table-container');
        }
    }

    updateStats() {
        const totalProducts = this.products.length;
        const lowStock = this.products.filter(p => (p.stock || 0) <= 5).length;
        const categories = new Set(this.products.map(p => p.category).filter(Boolean)).size;
        
        const totalEl = document.getElementById('totalProducts');
        const lowStockEl = document.getElementById('lowStock');
        const categoriesEl = document.getElementById('totalCategories');
        
        if (totalEl) totalEl.textContent = String(totalProducts);
        if (lowStockEl) lowStockEl.textContent = String(lowStock);
        if (categoriesEl) categoriesEl.textContent = String(categories);
    }

    showAddProductForm(productId = null) {
        const isEdit = productId !== null;
        const product = isEdit ? this.products.find(p => p.id === productId) : null;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>${isEdit ? 'Edit Product' : 'Add Product'}</h3>
                <form id="productForm">
                    <div class="form-group">
                        <label for="productName">Product Name *</label>
                        <input type="text" id="productName" required placeholder="Enter product name">
                    </div>
                    <div class="form-group">
                        <label for="productPrice">Price *</label>
                        <input type="number" id="productPrice" step="0.01" min="0" required placeholder="0.00">
                    </div>
                    <div class="form-group">
                        <label for="productStock">Stock *</label>
                        <input type="number" id="productStock" min="0" required placeholder="0">
                    </div>
                    
                    <div class="form-group">
                        <label for="productCategory">Category</label>
                        <input type="text" id="productCategory" placeholder="Enter category">
                    </div>
                    <div class="form-group">
                        <label for="productVariant">Variant</label>
                        <select id="productVariant">
                            <option value="">Select variant</option>
                            <option value="Singles">Singles</option>
                            <option value="Sealed Products">Sealed Products</option>
                            <option value="Pre-Order">Pre-Order</option>
                            <option value="Gaming Accessories">Gaming Accessories</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="productDescription">Description</label>
                        <textarea id="productDescription" placeholder="Enter product description"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="productImage">Image</label>
                        <input type="file" id="productImage" accept="image/*">
                        <div id="imagePreview" class="image-preview"></div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">${isEdit ? 'Update Product' : 'Save Product'}</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Pre-fill form if editing
        if (isEdit && product) {
            setTimeout(() => {
                document.getElementById('productName').value = product.productName || '';
                document.getElementById('productPrice').value = product.price || '';
                document.getElementById('productStock').value = product.stock || '';
                
                document.getElementById('productCategory').value = product.category || '';
                document.getElementById('productVariant').value = product.variant || '';
                document.getElementById('productDescription').value = product.description || '';
                
                if (product.image) {
                    this.currentImageBase64 = product.image;
                    const preview = document.getElementById('imagePreview');
                    preview.innerHTML = `<img src="data:image/jpeg;base64,${product.image}" alt="Preview" style="max-width: 200px; max-height: 200px;">`;
                }
            }, 100);
        }

        // Handle form submission
        const form = document.getElementById('productForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleProductSubmit(productId);
        });

        // Handle image upload
        const imageInput = document.getElementById('productImage');
        imageInput.addEventListener('change', (e) => {
            this.handleImageUpload(e);
        });
    }

    async handleProductSubmit(productId = null) {
        try {
            const productData = {
                productName: document.getElementById('productName').value.trim(),
                price: parseFloat(document.getElementById('productPrice').value),
                stock: parseInt(document.getElementById('productStock').value),
                sku: '',
                category: document.getElementById('productCategory').value.trim(),
                variant: document.getElementById('productVariant').value,
                description: document.getElementById('productDescription').value.trim(),
                image: this.currentImageBase64 || '',
                lastUpdated: new Date().toISOString()
            };

            // Validate required fields
            if (!productData.productName) {
                this.showNotification('Product name is required', 'error');
                return;
            }

            if (productData.price < 0) {
                this.showNotification('Price cannot be negative', 'error');
                return;
            }

            if (productData.stock < 0) {
                this.showNotification('Stock cannot be negative', 'error');
                return;
            }

            if (productId) {
                // Update existing product
                await window.firebaseDatabase.update(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId), productData);
                this.showNotification('Product updated successfully', 'success');
            } else {
                // Add new product
                productData.createdAt = new Date().toISOString();
                const newProductRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
                await window.firebaseDatabase.set(newProductRef, productData);
                this.showNotification('Product added successfully', 'success');
            }

            // Close modal and refresh
            document.querySelector('.modal').remove();
            this.loadProducts();
            
        } catch (error) {
            console.error('Error saving product:', error);
            this.showNotification('Error saving product. Please try again.', 'error');
        }
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.showNotification('Please select a valid image file', 'error');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.showNotification('Image file is too large. Please select a file smaller than 5MB', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                this.currentImageBase64 = e.target.result.split(',')[1];
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 4px;">`;
            };
            reader.readAsDataURL(file);
        }
    }

    async editProduct(productId) {
        try {
            await this.openEditProductPopup(productId);
        } catch (err) {
            console.error('Falling back to inline editor due to error loading edit-product-popup.html:', err);
            this.showAddProductForm(productId);
        }
    }

    viewProduct(productId) {
        const product = this.getProductById(productId);
        if (!product) return;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                if (overlay.parentNode) document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        });

        const container = document.createElement('div');
        container.className = 'form-container';
        container.innerHTML = `
            <div class="form-header">
                <h2><i class="fas fa-eye"></i> Product Preview</h2>
            </div>
            <div class="form-grid">
                <div class="form-column">
                    <div class="form-group"><label>SKU</label><div>${product.sku || ''}</div></div>
                    <div class="form-group"><label>Name</label><div>${product.productName || ''}</div></div>
                    <div class="form-group"><label>Price</label><div>${product.price != null ? `$${Number(product.price).toFixed(2)}` : ''}</div></div>
                    <div class="form-group"><label>Stock</label><div>${product.stock != null ? product.stock : ''}</div></div>
                </div>
                <div class="form-column">
                    <div class="form-group"><label>Category</label><div>${product.category || ''}</div></div>
                    <div class="form-group"><label>Variant</label><div>${product.variant || ''}</div></div>
                    <div class="form-group"><label>Image</label>
                        <div class="upload-area" style="height:auto; border-style:solid;">
                            ${product.image ? `<img alt="Product image" style="max-width:100%;height:auto;border-radius:8px;" src="data:image/jpeg;base64,${product.image}">` : '<span>No image</span>'}
                        </div>
                    </div>
                </div>
            </div>
            <div class="form-section">
                <div class="form-group"><label>Description</label>
                    <textarea readonly style="width:100%; min-height:140px; max-height:260px; resize:vertical; overflow:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; color:#333;">${product.description || ''}</textarea>
                </div>
            </div>
            <div class="button-group">
                <button class="back-btn" type="button"><i class="fas fa-times"></i> Close</button>
                <div class="action-buttons">
                    <button class="confirm-btn" type="button"><i class="fas fa-edit"></i> Edit</button>
                </div>
            </div>
        `;
        const closeBtn = container.querySelector('.back-btn');
        const editBtn = container.querySelector('.confirm-btn');
        closeBtn.addEventListener('click', () => {
            if (overlay.parentNode) document.body.removeChild(overlay);
            document.body.style.overflow = '';
        });
        editBtn.addEventListener('click', () => {
            if (overlay.parentNode) document.body.removeChild(overlay);
            document.body.style.overflow = '';
            this.editProduct(productId);
        });
        overlay.appendChild(container);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    async openEditProductPopup(productId) {
        const product = this.getProductById(productId);
        if (!product) throw new Error('Product not found');

        const response = await fetch('edit-product-popup.html', { cache: 'no-cache' });
        const html = await response.text();
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const formContainer = temp.querySelector('.form-container');
        if (!formContainer) throw new Error('No form-container in fetched HTML');

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                if (overlay.parentNode) document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        });

        // Wire back/clear buttons
        const backBtn = formContainer.querySelector('.back-btn');
        const clearBtn = formContainer.querySelector('.clear-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (overlay.parentNode) document.body.removeChild(overlay);
                document.body.style.overflow = '';
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const inputs = formContainer.querySelectorAll('input, textarea, select');
                inputs.forEach((el) => {
                    if (el.tagName.toLowerCase() === 'select') {
                        el.selectedIndex = 0;
                    } else {
                        el.value = '';
                    }
                });
                formContainer.dataset.imageBase64 = '';
                const uploadArea = formContainer.querySelector('.upload-area');
                if (uploadArea) {
                    uploadArea.style.backgroundImage = '';
                    uploadArea.style.borderStyle = '';
                }
            });
        }

        // Prefill fields
        const nameEl = formContainer.querySelector('#product-name');
        const specsEl = formContainer.querySelector('#product-specs');
        const priceEl = formContainer.querySelector('#product-price');
        const stockEl = formContainer.querySelector('#product-stock');
        const categoryEl = formContainer.querySelector('#product-category');
        const variantEl = formContainer.querySelector('#product-variant');
        const descEl = formContainer.querySelector('#product-description');
        const imageInput = formContainer.querySelector('#product-image');
        const uploadArea = formContainer.querySelector('.upload-area');

        if (nameEl) nameEl.value = product.productName || '';
        if (specsEl) specsEl.value = product.sku || '';
        if (priceEl) priceEl.value = product.price != null ? product.price : '';
        if (stockEl) stockEl.value = product.stock != null ? product.stock : '';
        if (categoryEl) categoryEl.value = product.category || '';
        if (variantEl) variantEl.value = product.variant || '';
        if (descEl) descEl.value = product.description || '';
        if (product.image) {
            formContainer.dataset.imageBase64 = product.image;
            if (uploadArea) {
                uploadArea.style.backgroundImage = `url(data:image/jpeg;base64,${product.image})`;
                uploadArea.style.backgroundSize = 'cover';
                uploadArea.style.backgroundPosition = 'center';
                uploadArea.style.borderStyle = 'solid';
            }
        }

        // Image handler -> store base64 on container and preview on upload area
        if (imageInput && uploadArea) {
            imageInput.addEventListener('change', () => {
                const file = imageInput.files && imageInput.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    this.showNotification('Please select a valid image file', 'error');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    this.showNotification('Image file is too large (max 5MB)', 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target && e.target.result ? String(e.target.result) : '';
                    // Save only the base64 data part to match existing schema
                    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
                    formContainer.dataset.imageBase64 = base64Data;
                    uploadArea.style.backgroundImage = dataUrl ? `url(${dataUrl})` : '';
                    uploadArea.style.backgroundSize = 'cover';
                    uploadArea.style.backgroundPosition = 'center';
                    uploadArea.style.borderStyle = 'solid';
                };
                reader.readAsDataURL(file);
            });
        }

        // Confirm update
        const confirmBtn = formContainer.querySelector('.confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                try {
                    const updated = {
                        productName: nameEl ? nameEl.value.trim() : '',
                        price: priceEl && priceEl.value !== '' ? parseFloat(priceEl.value) : 0,
                        stock: stockEl && stockEl.value !== '' ? parseInt(stockEl.value) : 0,
                        sku: specsEl ? specsEl.value.trim() : '',
                        category: categoryEl ? categoryEl.value.trim() : '',
                        variant: variantEl ? variantEl.value : '',
                        description: descEl ? descEl.value.trim() : '',
                        image: formContainer.dataset.imageBase64 || product.image || '',
                        lastUpdated: new Date().toISOString()
                    };

                    if (!updated.productName) {
                        this.showNotification('Product name is required', 'error');
                        return;
                    }
                    if (updated.price < 0) {
                        this.showNotification('Price cannot be negative', 'error');
                        return;
                    }
                    if (updated.stock < 0) {
                        this.showNotification('Stock cannot be negative', 'error');
                        return;
                    }

                    await window.firebaseDatabase.update(
                        window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId),
                        updated
                    );
                    this.showNotification('Product updated successfully', 'success');
                    if (overlay.parentNode) document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                    this.loadProducts();
                } catch (error) {
                    console.error('Error updating product:', error);
                    this.showNotification('Error updating product. Please try again.', 'error');
                }
            });
        }

        overlay.appendChild(formContainer);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    async deleteProduct(productId) {
        if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            try {
                await window.firebaseDatabase.remove(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId));
                this.showNotification('Product deleted successfully', 'success');
                this.loadProducts();
            } catch (error) {
                console.error('Error deleting product:', error);
                this.showNotification('Error deleting product. Please try again.', 'error');
            }
        }
    }

    async archiveProduct(productId) {
        if (confirm('Are you sure you want to archive this product? It will be moved to archived products.')) {
            try {
                // Get the product data first
                const productSnapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId));
                const productData = productSnapshot.val();
                
                if (productData) {
                    // Add archived timestamp
                    const archivedProductData = {
                        ...productData,
                        archivedAt: new Date().toISOString(),
                        originalId: productId
                    };
                    
                    // Save to archived products
                    const archivedRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_ARCHIVED_PRODUCTS'));
                    await window.firebaseDatabase.set(archivedRef, archivedProductData);
                    
                    // Remove from active products
                    await window.firebaseDatabase.remove(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId));
                    
                    this.showNotification('Product archived successfully', 'success');
                    this.loadProducts();
                } else {
                    this.showNotification('Product not found', 'error');
                }
            } catch (error) {
                console.error('Error archiving product:', error);
                this.showNotification('Error archiving product. Please try again.', 'error');
            }
        }
    }

    async updateProductStock(productId, newStock) {
        try {
            // Check if stock is going to 0, if so archive the product
            if (newStock <= 0) {
                await this.archiveProductToArchived(productId);
                this.showNotification('Product stock reached 0, product archived', 'info');
            } else {
                await window.firebaseDatabase.update(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId), {
                    stock: newStock,
                    lastUpdated: new Date().toISOString()
                });
                this.showNotification('Product stock updated', 'success');
            }
            this.loadProducts();
        } catch (error) {
            console.error('Error updating product stock:', error);
            this.showNotification('Error updating product stock', 'error');
        }
    }

    async archiveProductToArchived(productId) {
        try {
            // Get the product data from TBL_PRODUCTS
            const productRef = window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId);
            const productSnapshot = await window.firebaseDatabase.get(productRef);
            const productData = productSnapshot.val();

            if (!productData) {
                throw new Error('Product not found');
            }

            // Add archived timestamp and set stock to 0
            const archivedProductData = {
                ...productData,
                stock: 0,
                archivedAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString()
            };

            // Move to TBL_ARCHIVED_PRODUCTS
            const archivedRef = window.firebaseDatabase.ref(window.database, 'TBL_ARCHIVED_PRODUCTS/' + productId);
            await window.firebaseDatabase.set(archivedRef, archivedProductData);

            // Remove from TBL_PRODUCTS
            await window.firebaseDatabase.remove(productRef);

            console.log(`Product ${productId} archived successfully`);
        } catch (error) {
            console.error('Error archiving product:', error);
            throw error;
        }
    }

    getProductById(productId) {
        return this.products.find(p => p.id === productId);
    }

    getAvailableProducts() {
        return this.products.filter(p => p.stock > 0);
    }

    async checkAndArchiveZeroStockProducts() {
        try {
            console.log('Checking for zero-stock products to archive...');
            const zeroStockProducts = this.products.filter(p => p.stock <= 0);
            
            if (zeroStockProducts.length === 0) {
                console.log('No zero-stock products found');
                return;
            }

            console.log(`Found ${zeroStockProducts.length} zero-stock products to archive`);
            
            for (const product of zeroStockProducts) {
                try {
                    await this.archiveProductToArchived(product.id);
                    console.log(`Archived product: ${product.name} (ID: ${product.id})`);
                } catch (error) {
                    console.error(`Failed to archive product ${product.name} (ID: ${product.id}):`, error);
                }
            }
            
            this.showNotification(`Archived ${zeroStockProducts.length} zero-stock products`, 'info');
            this.loadProducts(); // Refresh the products list
        } catch (error) {
            console.error('Error checking and archiving zero-stock products:', error);
            this.showNotification('Error archiving zero-stock products', 'error');
        }
    }

    toggleDropdown(dropdownId) {
        const dropdown = document.getElementById(dropdownId + '-dropdown');
        const allDropdowns = document.querySelectorAll('.dropdown-content');
        
        // Close all other dropdowns
        allDropdowns.forEach(dd => {
            if (dd.id !== dropdownId + '-dropdown') {
                dd.classList.remove('show');
            }
        });
        
        // Toggle current dropdown
        dropdown.classList.toggle('show');
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

// Global product manager instance
window.productManager = new ProductManager();
