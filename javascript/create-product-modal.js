// Create Product Modal Functionality (mirrors CreateEventModal)
class CreateProductModal {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.isOpen = false;
        this.init();
    }

    init() {
        this.createModal();
        this.bindEvents();
    }

    createModal() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';

        this.modal = document.createElement('div');
        this.modal.className = 'modal-container';

        // Modal animations and base styles are now in css/create-product-modal.css

        this.loadModalContent();
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);
    }

    loadModalContent() {
        // Fetch external popup HTML and inject only the .form-container
        fetch('../html/create-product-popup.html', { cache: 'no-store' })
            .then(res => res.text())
            .then(html => {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) throw new Error('Form container not found');
                this.modal.innerHTML = '';
                this.modal.appendChild(formContainer);
                // The form styling is provided by css/create-event-popup.css (shared)
                this.bindModalEvents();
            })
            .catch(err => {
                console.error('Failed to load product popup:', err);
                this.showFallback();
            });
    }

    showFallback() {
        this.modal.innerHTML = `
            <div class="form-container">
                <div class="form-header"><h2><i class="fas fa-exclamation-triangle"></i> Error</h2></div>
                <div style="padding:30px; text-align:center;">
                    <p>Unable to load the create product form. Please try again.</p>
                    <button class="confirm-btn" onclick="createProductModal.close()"><i class="fas fa-times"></i> Close</button>
                </div>
            </div>
        `;
        this.bindModalEvents();
    }

    bindEvents() {
        const createProductBtn = document.querySelector('.create-product-btn');
        if (createProductBtn) {
            createProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
        }

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    }

    bindModalEvents() {
        const backBtn = this.modal.querySelector('.back-btn');
        if (backBtn) backBtn.addEventListener('click', () => this.close());

        const clearBtn = this.modal.querySelector('.clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearForm());

        const confirmBtn = this.modal.querySelector('.confirm-btn');
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.submitForm());

        const fileInput = this.modal.querySelector('#product-image');
        const uploadArea = this.modal.querySelector('.upload-area');
        if (fileInput && uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.backgroundColor = '#e3f2fd'; });
            uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); uploadArea.style.backgroundColor = '#f8f9fa'; });
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault(); uploadArea.style.backgroundColor = '#f8f9fa';
                const files = e.dataTransfer.files; if (files.length > 0) { fileInput.files = files; this.handleFileUpload({ target: { files: files } }); }
            });
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        const uploadArea = this.modal.querySelector('.upload-area');
        if (!file || !uploadArea) return;
        if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('File size must be less than 5MB.'); return; }
        const span = uploadArea.querySelector('span');
        const p = uploadArea.querySelector('p');
        if (span) span.textContent = file.name;
        if (p) p.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        uploadArea.style.borderColor = '#28a745';
        uploadArea.style.backgroundColor = '#d4edda';
    }

    open() {
        this.isOpen = true;
        this.overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
            const firstInput = this.modal.querySelector('input, textarea, select');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.modal.classList.add('closing');
        setTimeout(() => {
            this.overlay.style.display = 'none';
            this.modal.classList.remove('closing');
            document.body.style.overflow = '';
        }, 300);
    }

    clearForm() {
        const form = this.modal.querySelector('.form-container');
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'file') {
                input.value = '';
                const uploadArea = this.modal.querySelector('.upload-area');
                if (uploadArea) {
                    const span = uploadArea.querySelector('span');
                    const p = uploadArea.querySelector('p');
                    if (span) span.textContent = 'Upload Image';
                    if (p) p.textContent = 'Click to select an image file';
                    uploadArea.style.borderColor = '#50B4E6';
                    uploadArea.style.backgroundColor = '#f8f9fa';
                }
            } else {
                input.value = '';
            }
        });
    }

    submitForm() {
        const data = this.collectFormData();
        const required = ['product-sku', 'product-name'];
        const missing = required.filter(id => !data[id] || String(data[id]).trim() === '');
        if (missing.length) { alert('Please fill in required fields: ' + missing.join(', ')); return; }

        const confirmBtn = this.modal.querySelector('.confirm-btn');
        const originalText = confirmBtn.innerHTML;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        confirmBtn.disabled = true;

        setTimeout(() => {
            console.log('Product created:', data);
            alert('Product created successfully!');
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
            this.close();
        }, 1000);
    }

    collectFormData() {
        const form = this.modal.querySelector('.form-container');
        const inputs = form.querySelectorAll('input, textarea, select');
        const data = {};
        inputs.forEach(input => {
            if (input.type === 'file') {
                data[input.id] = input.files[0] || null;
            } else {
                data[input.id] = input.value;
            }
        });
        return data;
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    window.createProductModal = new CreateProductModal();
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreateProductModal;
}


