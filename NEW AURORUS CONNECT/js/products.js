class ProductManager {
    constructor() {
        this.products = [];
        this.currentImageBase64 = '';
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
        // Add product button
        const addProductBtn = document.getElementById('addProductBtn');
        if (addProductBtn) {
            addProductBtn.addEventListener('click', () => {
                this.showAddProductForm();
            });
        }
    }

    async loadProducts() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS'));
            this.products = snapshot.val() ? Object.entries(snapshot.val()).map(([id, data]) => ({
                id,
                ...data
            })) : [];
            
            this.renderProducts();
        } catch (error) {
            console.error('Error loading products:', error);
            this.showNotification('Error loading products', 'error');
        }
    }

    renderProducts() {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (this.products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No products found</td></tr>';
            return;
        }

        tbody.innerHTML = this.products.map(product => `
            <tr>
                <td>${product.productName || 'Unnamed Product'}</td>
                <td>$${product.price ? product.price.toFixed(2) : '0.00'}</td>
                <td><span class="stock-badge ${product.stock > 0 ? 'in-stock' : 'out-of-stock'}">${product.stock || 0}</span></td>
                <td>
                    ${product.image ? 
                        `<img src="data:image/jpeg;base64,${product.image}" alt="${product.productName}" class="product-image">` :
                        '<div class="no-image">No Image</div>'
                    }
                </td>
                <td>
                    <button class="btn-small" onclick="productManager.editProduct('${product.id}')">Edit</button>
                    <button class="btn-small btn-secondary" onclick="productManager.archiveProduct('${product.id}')">Archive</button>
                    <button class="btn-small btn-danger" onclick="productManager.deleteProduct('${product.id}')">Delete</button>
                </td>
            </tr>
        `).join('');
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
        this.showAddProductForm(productId);
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
            await window.firebaseDatabase.update(window.firebaseDatabase.ref(window.database, 'TBL_PRODUCTS/' + productId), {
                stock: newStock,
                lastUpdated: new Date().toISOString()
            });
            this.showNotification('Product stock updated', 'success');
            this.loadProducts();
        } catch (error) {
            console.error('Error updating product stock:', error);
            this.showNotification('Error updating product stock', 'error');
        }
    }

    getProductById(productId) {
        return this.products.find(p => p.id === productId);
    }

    getAvailableProducts() {
        return this.products.filter(p => p.stock > 0);
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
