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

        // CSS is now loaded statically in HTML

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
                
                <!-- Description Section - Full Width -->
                <div class="description-section">
                    <div class="form-group">
                        <label for="event-description">Description</label>
                        <textarea id="event-description" placeholder="Enter event description..." rows="6"></textarea>
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
        
        this.bindModalEvents();
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
