// Create Event Modal Functionality
class CreateEventModal {
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
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: none;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(2px);
        `;

        // Create modal container
        this.modal = document.createElement('div');
        this.modal.className = 'modal-container';
        this.modal.style.cssText = `
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            animation: modalSlideIn 0.3s ease-out;
        `;

        // Add CSS animation
        if (!document.getElementById('modal-styles')) {
            const style = document.createElement('style');
            style.id = 'modal-styles';
            style.textContent = `
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-50px) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                
                @keyframes modalSlideOut {
                    from {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translateY(-50px) scale(0.9);
                    }
                }
                
                .modal-container.closing {
                    animation: modalSlideOut 0.3s ease-in forwards;
                }
            `;
            document.head.appendChild(style);
        }

        // Load modal content
        this.loadModalContent();

        // Append to overlay
        this.overlay.appendChild(this.modal);
        document.body.appendChild(this.overlay);
    }

    loadModalContent() {
        // Create the modal content directly instead of fetching
        this.modal.innerHTML = `
            <div class="form-container">
                <!-- Header Section -->
                <div class="form-header">
                    <h2><i class="fas fa-plus"></i> Create New Event</h2>
                </div>
            
                <!-- Form Body -->
                <div class="form-grid">
                    <!-- First Column -->
                    <div class="form-column">
                        <div class="form-group">
                            <label for="event-name">Event Name</label>
                            <input type="text" id="event-name" placeholder="Enter event name...">
                        </div>
                        <div class="form-group">
                            <label for="event-date">Date and Time</label>
                            <input type="datetime-local" id="event-date">
                        </div>
                        <div class="form-group">
                            <label for="event-location">Location</label>
                            <input type="text" id="event-location" placeholder="Enter event location...">
                        </div>
                        <div class="form-group">
                            <label for="registration-time">Registration Time</label>
                            <input type="time" id="registration-time">
                        </div>
                    </div>
            
                    <!-- Second Column -->
                    <div class="form-column">
                        <div class="form-group">
                            <label for="tournament-time">Tournament Time</label>
                            <input type="time" id="tournament-time">
                        </div>
                        <div class="form-group">
                            <label for="event-description">Description</label>
                            <textarea id="event-description" placeholder="Enter event description..." rows="4"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Event Image</label>
                            <div class="upload-area">
                                <input type="file" id="event-image" accept="image/*" style="display: none;">
                                <i class="fas fa-cloud-upload-alt"></i>
                                <span onclick="document.getElementById('event-image').click()">Upload Image</span>
                                <p>Click to select an image file</p>
                            </div>
                        </div>
                    </div>
                </div>
            
                <!-- Button Section -->
                <div class="button-group">
                    <button class="back-btn">
                        <i class="fas fa-arrow-left"></i>
                        Back
                    </button>
                    <div class="action-buttons">
                        <button class="clear-btn">
                            <i class="fas fa-eraser"></i>
                            Clear
                        </button>
                        <button class="confirm-btn">
                            <i class="fas fa-check"></i>
                            Create Event
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Load the CSS for the modal
        this.loadModalCSS();
        this.bindModalEvents();
    }

    loadModalCSS() {
        // Check if CSS is already loaded
        if (document.getElementById('create-event-modal-css')) {
            return;
        }

        // Create and inject the CSS
        const style = document.createElement('style');
        style.id = 'create-event-modal-css';
        style.textContent = `
            /* Reset and base styles */
            .modal-container * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            .modal-container .form-container {
                width: 700px;
                max-width: 100%;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                overflow: hidden;
            }

            .modal-container .form-header {
                background-color: #3482B4;
                color: white;
                padding: 20px 30px;
                border-bottom: 3px solid #50B4E6;
            }

            .modal-container .form-header h2 {
                margin: 0;
                font-size: 24px;
                font-weight: bold;
                display: flex;
                align-items: center;
                gap: 12px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .modal-container .form-header i {
                font-size: 20px;
            }

            .modal-container .form-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                padding: 30px;
            }

            .modal-container .form-column {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }

            .modal-container .form-group {
                display: flex;
                flex-direction: column;
            }

            .modal-container .form-group label {
                font-weight: 600;
                color: #333;
                margin-bottom: 8px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .modal-container .form-group input,
            .modal-container .form-group select,
            .modal-container .form-group textarea {
                width: 100%;
                padding: 12px 15px;
                border: 2px solid #e9ecef;
                border-radius: 8px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                transition: all 0.3s ease;
                background-color: #f8f9fa;
            }

            .modal-container .form-group input:focus,
            .modal-container .form-group select:focus,
            .modal-container .form-group textarea:focus {
                outline: none;
                border-color: #50B4E6;
                background-color: white;
                box-shadow: 0 0 0 3px rgba(80, 180, 230, 0.1);
            }

            .modal-container .form-group textarea {
                resize: vertical;
                min-height: 100px;
                line-height: 1.5;
            }

            .modal-container .form-group .upload-area {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 160px;
                border: 2px dashed #50B4E6;
                border-radius: 8px;
                background-color: #f8f9fa;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
                padding: 20px;
            }

            .modal-container .form-group .upload-area:hover {
                background-color: #e3f2fd;
                border-color: #3482B4;
            }

            .modal-container .form-group .upload-area i {
                font-size: 32px;
                color: #50B4E6;
                margin-bottom: 10px;
            }

            .modal-container .form-group .upload-area span {
                color: #3482B4;
                font-weight: 600;
                font-size: 16px;
                margin-bottom: 5px;
            }

            .modal-container .form-group .upload-area p {
                color: #666;
                font-size: 12px;
                margin: 0;
            }

            .modal-container .button-group {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 25px 30px;
                background-color: #f8f9fa;
                border-top: 2px solid #e9ecef;
            }

            .modal-container .action-buttons {
                display: flex;
                gap: 15px;
            }

            .modal-container .back-btn,
            .modal-container .clear-btn,
            .modal-container .confirm-btn {
                padding: 12px 25px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .modal-container .back-btn {
                background-color: #6c757d;
                color: white;
            }

            .modal-container .back-btn:hover {
                background-color: #5a6268;
                transform: translateY(-1px);
                box-shadow: 0 3px 6px rgba(0,0,0,0.2);
            }

            .modal-container .clear-btn {
                background-color: white;
                color: #dc3545;
                border: 2px solid #dc3545;
            }

            .modal-container .clear-btn:hover {
                background-color: #dc3545;
                color: white;
                transform: translateY(-1px);
                box-shadow: 0 3px 6px rgba(0,0,0,0.2);
            }

            .modal-container .confirm-btn {
                background-color: #3482B4;
                color: white;
            }

            .modal-container .confirm-btn:hover {
                background-color: #2c6a8f;
                transform: translateY(-1px);
                box-shadow: 0 3px 6px rgba(0,0,0,0.2);
            }

            /* Responsive design */
            @media (max-width: 768px) {
                .modal-container .form-container {
                    width: 100%;
                }
                
                .modal-container .form-grid {
                    grid-template-columns: 1fr;
                    gap: 20px;
                    padding: 20px;
                }
                
                .modal-container .form-header {
                    padding: 15px 20px;
                }
                
                .modal-container .form-header h2 {
                    font-size: 20px;
                }
                
                .modal-container .button-group {
                    flex-direction: column;
                    gap: 15px;
                    padding: 20px;
                }
                
                .modal-container .action-buttons {
                    width: 100%;
                    justify-content: center;
                }
                
                .modal-container .back-btn {
                    width: 100%;
                    justify-content: center;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    showErrorModal() {
        this.modal.innerHTML = `
            <div class="form-container">
                <div class="form-header">
                    <h2><i class="fas fa-exclamation-triangle"></i> Error</h2>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <p>Unable to load the create event form. Please try again.</p>
                    <button class="confirm-btn" onclick="createEventModal.close()">
                        <i class="fas fa-times"></i> Close
                    </button>
                </div>
            </div>
        `;
    }

    bindEvents() {
        // Bind to create event button
        const createEventBtn = document.querySelector('.create-event-btn');
        if (createEventBtn) {
            createEventBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
        }

        // Close on overlay click
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    bindModalEvents() {
        // Back button
        const backBtn = this.modal.querySelector('.back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.close());
        }

        // Clear button
        const clearBtn = this.modal.querySelector('.clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearForm());
        }

        // Confirm button
        const confirmBtn = this.modal.querySelector('.confirm-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.submitForm());
        }

        // File upload
        const fileInput = this.modal.querySelector('#event-image');
        const uploadArea = this.modal.querySelector('.upload-area');
        
        if (fileInput && uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e);
            });

            // Drag and drop functionality
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.backgroundColor = '#e3f2fd';
            });

            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadArea.style.backgroundColor = '#f8f9fa';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.backgroundColor = '#f8f9fa';
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    this.handleFileUpload({ target: { files: files } });
                }
            });
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        const uploadArea = this.modal.querySelector('.upload-area');
        
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file.');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('File size must be less than 5MB.');
                return;
            }

            // Update upload area to show selected file
            const span = uploadArea.querySelector('span');
            const p = uploadArea.querySelector('p');
            
            if (span) span.textContent = file.name;
            if (p) p.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
            
            uploadArea.style.borderColor = '#28a745';
            uploadArea.style.backgroundColor = '#d4edda';
        }
    }

    open() {
        this.isOpen = true;
        this.overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Focus first input
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
            document.body.style.overflow = ''; // Restore scrolling
        }, 300);
    }

    clearForm() {
        const form = this.modal.querySelector('.form-container');
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            if (input.type === 'file') {
                input.value = '';
                // Reset upload area
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
        const form = this.modal.querySelector('.form-container');
        const formData = this.collectFormData();
        
        // Basic validation
        if (!this.validateForm(formData)) {
            return;
        }

        // Show loading state
        const confirmBtn = this.modal.querySelector('.confirm-btn');
        const originalText = confirmBtn.innerHTML;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        confirmBtn.disabled = true;

        // Simulate form submission (replace with actual API call)
        setTimeout(() => {
            console.log('Form submitted:', formData);
            
            // Show success message
            alert('Event created successfully!');
            
            // Reset button
            confirmBtn.innerHTML = originalText;
            confirmBtn.disabled = false;
            
            // Close modal
            this.close();
            
            // Optionally refresh the events list or add the new event to the page
            this.refreshEventsList();
            
        }, 1500);
    }

    collectFormData() {
        const form = this.modal.querySelector('.form-container');
        const data = {};
        
        // Collect all form data
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'file') {
                data[input.id] = input.files[0];
            } else {
                data[input.id] = input.value;
            }
        });
        
        return data;
    }

    validateForm(data) {
        const required = ['event-name', 'event-date', 'event-location'];
        const missing = required.filter(field => !data[field] || data[field].trim() === '');
        
        if (missing.length > 0) {
            alert(`Please fill in the following required fields: ${missing.join(', ')}`);
            return false;
        }
        
        // Validate date is in the future
        const eventDate = new Date(data['event-date']);
        const now = new Date();
        if (eventDate <= now) {
            alert('Event date must be in the future.');
            return false;
        }
        
        return true;
    }

    refreshEventsList() {
        // This would typically make an API call to refresh the events
        // For now, we'll just log that it should refresh
        console.log('Events list should be refreshed');
        
        // You can add code here to:
        // 1. Make an API call to get updated events
        // 2. Update the DOM with new events
        // 3. Or trigger a page refresh
    }
}

// Initialize the modal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.createEventModal = new CreateEventModal();
});

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreateEventModal;
}
