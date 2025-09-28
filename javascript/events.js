class EventManager {
    constructor() {
        this.events = [];
        this.imageObjectUrls = new Map();
        this.eventsUnsubscribe = null;
        this.init();
    }

    // Unified paid validation: supports string 'Paid' (any case, trimmed)
    // and legacy object formats { paid: true } or { status: 'Paid' }
    isPaidValue(value) {
        if (typeof value === 'string') {
            return value.trim().toLowerCase() === 'paid';
        }
        if (value && typeof value === 'object') {
            if (value.paid === true) return true;
            if (typeof value.status === 'string' && value.status.trim().toLowerCase() === 'paid') return true;
        }
        return false;
    }

    async markParticipantPaid(eventId, userId) {
        this.showConfirmationModal(
            'Mark as Paid',
            'Are you sure you want to mark this participant as paid?',
            'Mark as Paid',
            async () => {
                try {
                    const participantRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants/${userId}`);
                    await window.firebaseDatabase.set(participantRef, 'Paid');
                    this.showNotification('Participant marked as Paid', 'success');
                    await this.loadParticipants(eventId);
                } catch (error) {
                    console.error('Error marking participant paid:', error);
                    this.showNotification('Error marking participant paid', 'error');
                }
            }
        );
    }

    // Show confirmation modal
    showConfirmationModal(title, message, confirmText, onConfirm) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="form-container" style="width: 400px; max-width: 90%;">
                <div class="form-header">
                    <h2><i class="fas fa-exclamation-triangle"></i> ${title}</h2>
                </div>
                <div style="padding: 30px;">
                    <p style="margin: 0 0 30px 0; font-size: 16px; color: #4a5568; line-height: 1.6; text-align: center;">${message}</p>
                    <div class="form-actions" style="display: flex; gap: 16px; justify-content: center;">
                        <button type="button" class="btn-secondary" id="cancelAction">Cancel</button>
                        <button type="button" class="btn-primary" id="confirmAction">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Handle cancel action
        document.getElementById('cancelAction').addEventListener('click', () => {
            overlay.remove();
        });
        
        // Handle confirm action
        document.getElementById('confirmAction').addEventListener('click', () => {
            overlay.remove();
            onConfirm();
        });
        
        // Handle overlay click
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) {
                overlay.remove();
            }
        });
        
        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    // Utility function to convert base64 to proper image source
    convertToImageSrc(base64Data) {
        if (!base64Data) return '';
        
        // If it's already a data URL, return as is
        if (base64Data.startsWith('data:image/')) {
            return base64Data;
        }
        
        // If it's a URL, return as is
        if (base64Data.startsWith('http')) {
            return base64Data;
        }
        
        // Try to detect image format from base64 header
        const formats = [
            { header: '/9j/', format: 'jpeg' },
            { header: 'iVBORw0KGgo', format: 'png' },
            { header: 'R0lGOD', format: 'gif' },
            { header: 'UklGR', format: 'webp' }
        ];
        
        for (const { header, format } of formats) {
            if (base64Data.startsWith(header)) {
                return `data:image/${format};base64,${base64Data}`;
            }
        }
        
        // Default to PNG if we can't detect the format
        return `data:image/png;base64,${base64Data}`;
    }

    init() {
        this.setupEventListeners();
        // Wait for Firebase to be ready before loading events
        if (window.firebaseReady) {
            this.loadEvents();
        } else {
            window.addEventListener('firebaseReady', () => {
                this.loadEvents();
            });
        }
    }

    setupEventListeners() {
        // Create event button is handled by create-popup.js

        // Event card click to view tournament
        document.addEventListener('click', (e) => {
            if (e.target.closest('.event-card') && !e.target.closest('.event-card-actions')) {
                const eventCard = e.target.closest('.event-card');
                const eventTitle = eventCard.querySelector('.event-card-title').textContent;
                const event = this.events.find(evt => evt.eventName === eventTitle);
                if (event) {
                    this.showTournamentView(event);
                }
            }
        });

        // Edit event buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-event-btn')) {
                e.stopPropagation(); // Prevent event card click
                const eventCard = e.target.closest('.event-card');
                const eventTitle = eventCard.querySelector('.event-card-title').textContent;
                const event = this.events.find(evt => evt.eventName === eventTitle);
                if (event) {
                    this.openEditEventPopup(event);
                }
            }
        });

        // Past events button
        const pastEventsBtn = document.querySelector('.past-events-btn');
        if (pastEventsBtn) {
            pastEventsBtn.addEventListener('click', () => {
                this.showPastEvents();
            });
        }

        // Update status buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.update-status-btn')) {
                e.stopPropagation(); // Prevent event card click
                const eventCard = e.target.closest('.event-card');
                const eventTitle = eventCard.querySelector('.event-card-title').textContent;
                const event = this.events.find(evt => evt.eventName === eventTitle);
                if (event) {
                    this.showStatusUpdateModal(event);
                }
            }
        });
    }

    async loadEvents() {
        try {
            // Detach previous listener if any to avoid duplicate renders
            if (this.eventsUnsubscribe) {
                try { window.firebaseDatabase.off(this.eventsUnsubscribe); } catch (_) { /* no-op */ }
                this.eventsUnsubscribe = null;
            }

            const eventsRef = window.firebaseDatabase.ref(window.database, 'TBL_EVENTS');
            this.eventsUnsubscribe = eventsRef;

            window.firebaseDatabase.onValue(eventsRef, (snapshot) => {
                this.events = snapshot.val() ? Object.entries(snapshot.val()).map(([id, data]) => {
                    // Normalize image field coming from DB
                    const image = (data && (
                        data.image ||
                        data.imageBase64 ||
                        data.eventImageBase64 ||
                        data.bannerImageBase64 ||
                        data.imageUrlBase64
                    )) || null;

                    const imageUrl = (data && (
                        data.imageUrl ||
                        (typeof data.image === 'string' && data.image.startsWith('http') ? data.image : null)
                    )) || null;

                    return {
                        id,
                        ...data,
                        image,
                        imageUrl
                    };
                }) : [];

                this.renderEvents();
            });
        } catch (error) {
            console.error('Error loading events:', error);
            this.showNotification('Error loading events', 'error');
        }
    }

    renderEvents() {
        const eventsList = document.querySelector('.events-list');
        if (!eventsList) return;

        if (this.events.length === 0) {
            eventsList.innerHTML = '<div class="no-events">No events found. Create your first event!</div>';
            return;
        }

        // Sort events by date
        const sortedEvents = [...this.events].sort((a, b) => {
            const dateA = new Date(a.eventDate || 0);
            const dateB = new Date(b.eventDate || 0);
            return dateA - dateB;
        });

        // Revoke any previously created object URLs to avoid leaks before re-render
        this.revokeAllImageObjectUrls();

        eventsList.innerHTML = sortedEvents.map(event => {
            const eventDate = event.eventDate ? new Date(event.eventDate) : null;
            const isUpcoming = eventDate && eventDate >= new Date();
            const status = this.getEventStatus(event);
            
            return `
                <div class="event-card">
                    <div class="event-image" data-event-id="${event.id}"></div>
                    <div class="event-card-content">
                        <h3 class="event-card-title">${event.eventName || 'Unnamed Event'}</h3>
                        <div class="event-card-subtitle">${event.location || 'Location TBD'}</div>
                         <div class="event-card-date"><span class="event-card-date-label">Date:</span> ${eventDate ? eventDate.toLocaleDateString() : 'TBD'}</div>
                         <div class="event-card-status">
                             <span class="status-badge status-${event.status || 'active'}">${(event.status || 'active').charAt(0).toUpperCase() + (event.status || 'active').slice(1)}</span>
                         </div>
                         <div class="event-card-actions">
                             <button class="edit-event-btn" title="Edit Event"><i class="fas fa-edit"></i></button>
                             <button class="update-status-btn" title="Update Status"><i class="fas fa-sync-alt"></i></button>
                         </div>
                    </div>
                </div>
            `;
        }).join('');

        // After rendering, shrink long titles so they fit in the card
        this.autosizeEventTitles();

        // After rendering, hydrate images (base64 or direct URL)
        this.hydrateEventImages(sortedEvents);
    }

    autosizeEventTitles() {
        const titles = document.querySelectorAll('.event-card-title');
        titles.forEach(title => {
            // Start from the declared size and shrink as needed
            const computed = window.getComputedStyle(title);
            let fontSize = parseFloat(computed.fontSize) || 14;
            const minFontSize = 10;
            const maxHeight = title.clientHeight || 32;

            // Guard for empty or hidden elements
            if (maxHeight === 0) return;

            while (title.scrollHeight > maxHeight && fontSize > minFontSize) {
                fontSize -= 1;
                title.style.fontSize = fontSize + 'px';
            }
        });
    }

    revokeAllImageObjectUrls() {
        for (const url of this.imageObjectUrls.values()) {
            try { URL.revokeObjectURL(url); } catch (_) { /* no-op */ }
        }
        this.imageObjectUrls.clear();
    }

    hydrateEventImages(events) {
        if (!Array.isArray(events)) return;
        events.forEach(event => {
            if (!event || !event.id) return;
            const el = document.querySelector(`.event-image[data-event-id="${event.id}"]`);
            if (!el) return;

            // Prefer direct URLs if present
            if (event.imageUrl && typeof event.imageUrl === 'string') {
                el.style.backgroundImage = `url(${event.imageUrl})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                return;
            }

            // Next, check if "image" looks like a URL
            if (event.image && typeof event.image === 'string' && event.image.startsWith('http')) {
                el.style.backgroundImage = `url(${event.image})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                return;
            }

            // Finally, attempt base64 -> blob URL
            if (!event.image) return;
            this.convertBase64ToPngObjectUrl(event.image)
            .then(objectUrl => {
                if (!objectUrl) return;
                this.imageObjectUrls.set(event.id, objectUrl);
                el.style.backgroundImage = `url(${objectUrl})`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
            })
            .catch(() => { /* ignore */ });
        });
    }

    convertBase64ToPngObjectUrl(input) {
        return new Promise((resolve) => {
            if (typeof input !== 'string' || !input) {
                resolve(null);
                return;
            }
            const img = new Image();
            // CORS safe for data URLs and same-origin
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width;
                    canvas.height = img.naturalHeight || img.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (!blob) { resolve(null); return; }
                        const url = URL.createObjectURL(blob);
                        resolve(url);
                    }, 'image/png');
                } catch (_) {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            // If not a data URL, assume it's raw base64 and prefix as PNG data URL
            const src = input.startsWith('data:') ? input : `data:image/png;base64,${input}`;
            img.src = src;
        });
    }

    getEventStatus(event) {
        if (!event.eventDate) return 'No Date';
        
        const eventDate = new Date(event.eventDate);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        
        if (eventDay < today) return 'Past';
        if (eventDay.getTime() === today.getTime()) return 'Today';
        if (eventDay <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) return 'This Week';
        return 'Upcoming';
    }

    showAddEventForm(eventId = null) {
        const isEdit = eventId !== null;
        const event = isEdit ? this.events.find(e => e.id === eventId) : null;
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>${isEdit ? 'Edit Event' : 'Add Event'}</h3>
                <form id="eventForm">
                    <div class="form-group">
                        <label for="eventName">Event Name *</label>
                        <input type="text" id="eventName" required placeholder="Enter event name">
                    </div>
                    <div class="form-group">
                        <label for="eventDate">Event Date *</label>
                        <input type="date" id="eventDate" required>
                    </div>
                    <div class="form-group">
                        <label for="eventTime">Event Time</label>
                        <input type="time" id="eventTime" placeholder="Enter event time">
                    </div>
                    <div class="form-group">
                        <label for="eventLocation">Location</label>
                        <input type="text" id="eventLocation" placeholder="Enter event location">
                    </div>
                    <div class="form-group">
                        <label for="eventDescription">Description</label>
                        <textarea id="eventDescription" placeholder="Enter event description"></textarea>
                    </div>
                    <div class="form-group">
                        <label for="eventCapacity">Capacity</label>
                        <input type="number" id="eventCapacity" min="1" placeholder="Enter maximum capacity">
                    </div>
                    <div class="form-group">
                        <label for="eventCredits">Credits Required</label>
                        <input type="number" id="eventCredits" min="0" step="0.01" placeholder="Enter credits required">
                    </div>
                    <div class="form-group">
                        <label for="eventStatus">Status</label>
                        <select id="eventStatus">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn-primary">${isEdit ? 'Update Event' : 'Save Event'}</button>
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Pre-fill form if editing
        if (isEdit && event) {
            setTimeout(() => {
                document.getElementById('eventName').value = event.eventName || '';
                document.getElementById('eventDate').value = event.eventDate ? event.eventDate.split('T')[0] : '';
                document.getElementById('eventTime').value = event.eventTime || '';
                document.getElementById('eventLocation').value = event.location || '';
                document.getElementById('eventDescription').value = event.description || '';
                document.getElementById('eventCapacity').value = event.capacity || '';
                document.getElementById('eventCredits').value = event.creditsRequired || '';
                document.getElementById('eventStatus').value = event.status || 'active';
            }, 100);
        }

        // Handle form submission
        const form = document.getElementById('eventForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleEventSubmit(eventId);
        });
    }

    async handleEventSubmit(eventId = null) {
        try {
            const eventData = {
                eventName: document.getElementById('eventName').value.trim(),
                eventDate: document.getElementById('eventDate').value,
                eventTime: document.getElementById('eventTime').value,
                location: document.getElementById('eventLocation').value.trim(),
                description: document.getElementById('eventDescription').value.trim(),
                capacity: parseInt(document.getElementById('eventCapacity').value) || null,
                creditsRequired: parseFloat(document.getElementById('eventCredits').value) || 0,
                status: document.getElementById('eventStatus').value,
                lastUpdated: new Date().toISOString()
            };

            // Validate required fields
            if (!eventData.eventName) {
                this.showNotification('Event name is required', 'error');
                return;
            }

            if (!eventData.eventDate) {
                this.showNotification('Event date is required', 'error');
                return;
            }

            // Validate date is not in the past
            const eventDate = new Date(eventData.eventDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (eventDate < today) {
                this.showNotification('Event date cannot be in the past', 'error');
                return;
            }

            if (eventId) {
                // Update existing event
                await window.firebaseDatabase.update(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS/' + eventId), eventData);
                this.showNotification('Event updated successfully', 'success');
            } else {
                // Add new event
                eventData.createdAt = new Date().toISOString();
                const newEventRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS'));
                await window.firebaseDatabase.set(newEventRef, eventData);
                this.showNotification('Event added successfully', 'success');
            }

            // Close modal and refresh
            document.querySelector('.modal').remove();
            this.loadEvents();
            
        } catch (error) {
            console.error('Error saving event:', error);
            this.showNotification('Error saving event. Please try again.', 'error');
        }
    }

    async editEvent(eventId) {
        this.showAddEventForm(eventId);
    }

    openEditEventPopup(eventData) {
        const renderFromContainer = (formContainer) => {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay) {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                }
            });

            overlay.appendChild(formContainer);
            document.body.appendChild(overlay);
            document.body.style.overflow = 'hidden';

            const backBtn = formContainer.querySelector('.back-btn');
            const clearBtn = formContainer.querySelector('.clear-btn');
            const confirmBtn = formContainer.querySelector('.confirm-btn');

            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    if (overlay.parentNode) {
                        document.body.removeChild(overlay);
                        document.body.style.overflow = '';
                    }
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
                });
            }

            // Prefill fields from eventData
            const nameEl = formContainer.querySelector('#event-name');
            const dateEl = formContainer.querySelector('#event-date');
            const locationEl = formContainer.querySelector('#event-location');
            const regTimeEl = formContainer.querySelector('#registration-time');
            const tourTimeEl = formContainer.querySelector('#tournament-time');
            const descEl = formContainer.querySelector('#event-description');

            if (nameEl) nameEl.value = eventData.eventName || '';
            if (dateEl) dateEl.value = eventData.eventDate || '';
            if (locationEl) locationEl.value = eventData.location || '';
            if (regTimeEl) regTimeEl.value = eventData.registrationTime || '';
            if (tourTimeEl) tourTimeEl.value = eventData.tournamentTime || eventData.eventTime || '';
            if (descEl) descEl.value = eventData.description || '';

            if (confirmBtn) {
                confirmBtn.addEventListener('click', async () => {
                    try {
                        const updated = {
                            eventName: nameEl ? nameEl.value.trim() : eventData.eventName,
                            eventDate: dateEl ? dateEl.value : eventData.eventDate,
                            location: locationEl ? locationEl.value.trim() : eventData.location,
                            registrationTime: regTimeEl ? regTimeEl.value : eventData.registrationTime,
                            tournamentTime: tourTimeEl ? tourTimeEl.value : (eventData.tournamentTime || eventData.eventTime),
                            description: descEl ? descEl.value.trim() : eventData.description,
                            image: formContainer.dataset.imageBase64 !== undefined ? (formContainer.dataset.imageBase64 || null) : (eventData.image || null),
                            lastUpdated: new Date().toISOString()
                        };

                        await window.firebaseDatabase.update(
                            window.firebaseDatabase.ref(window.database, 'TBL_EVENTS/' + eventData.id),
                            updated
                        );

                        this.showNotification('Event updated successfully', 'success');
                        if (overlay.parentNode) {
                            document.body.removeChild(overlay);
                            document.body.style.overflow = '';
                        }
                        this.loadEvents();
                    } catch (err) {
                        console.error('Error updating event:', err);
                        this.showNotification('Error updating event. Please try again.', 'error');
                    }
                });
            }
        };

        fetch('edit-event-popup.html', { cache: 'no-cache' })
            .then(response => response.text())
            .then(html => {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) {
                    throw new Error('No form in fetched HTML');
                }
                // Wire image base64 input & preview
                const fileInput = formContainer.querySelector('#event-image');
                const preview = formContainer.querySelector('.upload-area');
                if (fileInput && preview) {
                    fileInput.addEventListener('change', () => {
                        const file = fileInput.files && fileInput.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const dataUrl = e.target && e.target.result ? String(e.target.result) : '';
                            formContainer.dataset.imageBase64 = dataUrl;
                            preview.style.backgroundImage = dataUrl ? `url(${dataUrl})` : '';
                            preview.style.backgroundSize = 'cover';
                            preview.style.backgroundPosition = 'center';
                            preview.style.borderStyle = 'solid';
                        };
                        reader.readAsDataURL(file);
                    });
                }
                renderFromContainer(formContainer);
            });
    }

    async deleteEvent(eventId) {
        if (confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
            try {
                await window.firebaseDatabase.remove(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS/' + eventId));
                this.showNotification('Event deleted successfully', 'success');
                this.loadEvents();
            } catch (error) {
                console.error('Error deleting event:', error);
                this.showNotification('Error deleting event. Please try again.', 'error');
            }
        }
    }

    getUpcomingEvents() {
        const now = new Date();
        return this.events.filter(event => {
            if (!event.eventDate) return false;
            const eventDate = new Date(event.eventDate);
            return eventDate >= now && event.status === 'active';
        }).sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    }

    getTodayEvents() {
        const today = new Date().toISOString().split('T')[0];
        return this.events.filter(event => 
            event.eventDate && event.eventDate.startsWith(today) && event.status === 'active'
        );
    }

    getEventById(eventId) {
        return this.events.find(e => e.id === eventId);
    }

    async registerUserForEvent(userId, eventId) {
        try {
            const event = this.getEventById(eventId);
            if (!event) {
                throw new Error('Event not found');
            }

            // Check if event is active
            if (event.status !== 'active') {
                throw new Error('Event is not active');
            }

            // Check if event date is in the future
            const eventDate = new Date(event.eventDate);
            if (eventDate < new Date()) {
                throw new Error('Event has already passed');
            }

            // Check capacity if set
            if (event.capacity) {
                const registrationsSnapshot = await window.firebaseDatabase.get(
                    window.firebaseDatabase.ref(window.database, 'TBL_EVENT_REGISTRATIONS/' + eventId)
                );
                const registrations = registrationsSnapshot.val() || {};
                const currentRegistrations = Object.keys(registrations).length;
                
                if (currentRegistrations >= event.capacity) {
                    throw new Error('Event is at capacity');
                }
            }

            // Check credits if required
            if (event.creditsRequired > 0) {
                const userCredits = await this.getUserCredits(userId);
                if (userCredits < event.creditsRequired) {
                    throw new Error(`Insufficient credits. Required: ${event.creditsRequired}, Available: ${userCredits}`);
                }
            }

            // Register user
            const registrationData = {
                userId: userId,
                eventId: eventId,
                registeredAt: new Date().toISOString(),
                status: 'registered'
            };

            await window.firebaseDatabase.set(
                window.firebaseDatabase.ref(window.database, 'TBL_EVENT_REGISTRATIONS/' + eventId + '/' + userId),
                registrationData
            );

            this.showNotification('Successfully registered for event', 'success');
            return true;

        } catch (error) {
            console.error('Error registering for event:', error);
            this.showNotification(error.message, 'error');
            return false;
        }
    }

    async getUserCredits(userId) {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_USER_TOTAL_CREDITS/' + userId));
            const data = snapshot.val();
            return data ? data.totalCredits : 0;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    }

    showPastEvents() {
        const pastEvents = this.events.filter(event => {
            if (!event.eventDate) return false;
            const eventDate = new Date(event.eventDate);
            return eventDate < new Date();
        });

        if (pastEvents.length === 0) {
            this.showNotification('No past events found', 'info');
            return;
        }

        fetch('past-events-popup.html', { cache: 'no-cache' })
            .then(response => response.text())
            .then(html => {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) {
                    throw new Error('No form in fetched HTML');
                }

                // Populate list
                const list = formContainer.querySelector('.past-events-list');
                if (list) {
                    list.innerHTML = pastEvents.map(event => `
                        <div class="past-event-item">
                            <h4>${event.eventName}</h4>
                            <p>Date: ${new Date(event.eventDate).toLocaleDateString()}</p>
                            <p>Location: ${event.location || 'N/A'}</p>
                        </div>
                    `).join('');
                }

                // Render overlay consistent with other popups
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.addEventListener('click', (ev) => {
                    if (ev.target === overlay) {
                        document.body.removeChild(overlay);
                        document.body.style.overflow = '';
                    }
                });
                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';

                // Wire back button
                const backBtn = formContainer.querySelector('.back-btn');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        if (overlay.parentNode) {
                            document.body.removeChild(overlay);
                            document.body.style.overflow = '';
                        }
                    });
                }
            })
            .catch(err => {
                console.error('Error loading past events popup:', err);
                this.showNotification('Could not open past events', 'error');
            });
    }

    exportEventsData(format = 'csv') {
        if (format === 'csv') {
            this.exportToCSV();
        } else if (format === 'json') {
            this.exportToJSON();
        }
    }

    exportToCSV() {
        const headers = ['Event Name', 'Date', 'Time', 'Location', 'Capacity', 'Credits Required', 'Status'];
        const rows = this.events.map(event => [
            event.eventName || '',
            event.eventDate ? new Date(event.eventDate).toLocaleDateString() : '',
            event.eventTime || '',
            event.location || '',
            event.capacity || '',
            event.creditsRequired || '0',
            event.status || 'active'
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        this.downloadFile(csvContent, 'events.csv', 'text/csv');
    }

    exportToJSON() {
        const jsonContent = JSON.stringify(this.events, null, 2);
        this.downloadFile(jsonContent, 'events.json', 'application/json');
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

    async exportTournamentResults() {
        try {
            // Get the current event ID from the URL or stored state
            const eventId = this.getCurrentEventId();
            if (!eventId) {
                this.showNotification('No event selected for export', 'error');
                return;
            }

            // Get tournament results data
            const resultsData = await this.getTournamentResults(eventId);
            
            if (!resultsData || resultsData.length === 0) {
                this.showNotification('No results data available to export', 'info');
                return;
            }

            // Create CSV content
            const headers = ['Rank', 'Player Name', 'Score', 'Wins', 'Losses', 'Ties'];
            const rows = resultsData.map((result, index) => [
                index + 1,
                result.playerName || 'Unknown',
                result.score || 0,
                result.wins || 0,
                result.losses || 0,
                result.ties || 0
            ]);

            const csvContent = [headers, ...rows]
                .map(row => row.map(field => `"${field}"`).join(','))
                .join('\n');

            // Generate filename with event name and date
            const event = this.events.find(e => e.id === eventId);
            const eventName = event ? event.eventName.replace(/[^a-zA-Z0-9]/g, '_') : 'Tournament';
            const date = new Date().toISOString().split('T')[0];
            const filename = `${eventName}_Results_${date}.csv`;

            this.downloadFile(csvContent, filename, 'text/csv');
            this.showNotification('Tournament results exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting tournament results:', error);
            this.showNotification('Error exporting tournament results', 'error');
        }
    }

    getCurrentEventId() {
        // First try to get from stored selected event
        if (this.selectedEvent && this.selectedEvent.id) {
            return this.selectedEvent.id;
        }
        
        // Try to get event ID from URL hash
        const hash = window.location.hash;
        if (hash && hash.includes('event=')) {
            return hash.split('event=')[1].split('&')[0];
        }
        
        // Fallback: get from the current tournament view
        const tournamentHeader = document.querySelector('.tournament-header');
        if (tournamentHeader) {
            const eventTitle = tournamentHeader.querySelector('h2')?.textContent;
            if (eventTitle) {
                const event = this.events.find(e => e.eventName === eventTitle);
                return event ? event.id : null;
            }
        }
        
        return null;
    }

    async getTournamentResults(eventId) {
        try {
            // Use the same logic as loadStandings to get current standings
            const standings = await this.loadStandings(eventId);
            
            // Convert standings to the format expected by export
            return standings.map(standing => ({
                playerName: standing.name,
                score: standing.points || 0,
                wins: standing.wins || 0,
                losses: standing.losses || 0,
                ties: standing.ties || 0,
                userId: standing.userId
            }));
        } catch (error) {
            console.error('Error fetching tournament results:', error);
            return [];
        }
    }

     showStatusUpdateModal(event) {
         fetch('update-status-popup.html', { cache: 'no-cache' })
            .then(response => response.text())
            .then(html => {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) {
                    throw new Error('No form in fetched HTML');
                }

                // Populate event info
                const nameEl = formContainer.querySelector('.event-name');
                const dateEl = formContainer.querySelector('.event-date');
                const locationEl = formContainer.querySelector('.event-location');
                const currentStatusEl = formContainer.querySelector('.current-status');
                const statusSelect = formContainer.querySelector('#newStatus');

                if (nameEl) nameEl.textContent = event.eventName || '';
                if (dateEl) dateEl.textContent = event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'TBD';
                if (locationEl) locationEl.textContent = event.location || 'TBD';
                if (currentStatusEl) {
                    const statusText = (event.status || 'active');
                    currentStatusEl.textContent = statusText.charAt(0).toUpperCase() + statusText.slice(1);
                    currentStatusEl.className = `status-badge current-status status-${statusText}`;
                }
                if (statusSelect) {
                    statusSelect.value = (event.status || 'active');
                }

                // Render overlay
                const overlay = document.createElement('div');
                overlay.className = 'modal-overlay';
                overlay.addEventListener('click', (ev) => {
                    if (ev.target === overlay) {
                        document.body.removeChild(overlay);
                        document.body.style.overflow = '';
                    }
                });
                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';

                // Wire back button
                const backBtn = formContainer.querySelector('.back-btn');
                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        if (overlay.parentNode) {
                            document.body.removeChild(overlay);
                            document.body.style.overflow = '';
                        }
                    });
                }

                // Wire confirm button
                const confirmBtn = formContainer.querySelector('.confirm-btn');
                if (confirmBtn && statusSelect) {
                    confirmBtn.addEventListener('click', async () => {
                        const newStatus = statusSelect.value;
                        if (newStatus === (event.status || 'active')) {
                            this.showNotification('Status is already set to ' + newStatus, 'info');
                            if (overlay.parentNode) {
                                document.body.removeChild(overlay);
                                document.body.style.overflow = '';
                            }
                            return;
                        }
                        try {
                            await this.updateEventStatus(event.id, newStatus);
                            this.showNotification(`Event status updated to ${newStatus}`, 'success');
                            if (overlay.parentNode) {
                                document.body.removeChild(overlay);
                                document.body.style.overflow = '';
                            }
                        } catch (error) {
                            console.error('Error updating event status:', error);
                            this.showNotification('Error updating event status', 'error');
                        }
                    });
                }
            })
            .catch(err => {
                console.error('Error loading update status popup:', err);
                this.showNotification('Could not open status update', 'error');
            });
     }

     async updateEventStatus(eventId, newStatus) {
         try {
             const eventRef = window.firebaseDatabase.ref(window.database, 'TBL_EVENTS/' + eventId);
             await window.firebaseDatabase.update(eventRef, {
                 status: newStatus,
                 lastUpdated: new Date().toISOString()
             });
             
             // Update local events array
             const event = this.events.find(e => e.id === eventId);
             if (event) {
                 event.status = newStatus;
                 event.lastUpdated = new Date().toISOString();
             }
             
             // Re-render events to show updated status
             this.renderEvents();
             
         } catch (error) {
             console.error('Error updating event status:', error);
             throw error;
         }
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

     showTournamentView(event) {
         // Store current view state
         this.currentView = 'tournament';
         this.selectedEvent = event;
         
         // Update main content
         this.renderTournamentView(event);
         
         // Update right panel
         this.updateTournamentDashboard(event);
     }

     renderTournamentView(event) {
         const mainContent = document.querySelector('.main-content');
         if (!mainContent) return;

         mainContent.innerHTML = `
             <div class="tournament-header">
                 <button class="back-to-events-btn" onclick="window.eventManager.showEventsList()">
                     <i class="fas fa-arrow-left"></i>
                     Back to Events
                 </button>
                 <h1 class="tournament-title">${event.eventName}</h1>
                 <div class="tournament-meta">
                     <span class="tournament-date">${event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'TBD'}</span>
                     <span class="tournament-location">${event.location || 'Location TBD'}</span>
                     <span class="status-badge status-${event.status || 'active'}">${(event.status || 'active').charAt(0).toUpperCase() + (event.status || 'active').slice(1)}</span>
                 </div>
             </div>

             <div class="tournament-content">
                 <div class="tournament-tabs">
                     <button class="tournament-tab active" data-tab="participants">
                         <i class="fas fa-users"></i>
                         Participants
                     </button>
                     <button class="tournament-tab" data-tab="matchmaking">
                         <i class="fas fa-random"></i>
                         Matchmaking
                     </button>
                     <button class="tournament-tab" data-tab="results">
                         <i class="fas fa-medal"></i>
                         Results
                     </button>
                 </div>

                 <div class="tournament-tab-content">
                     <div class="tab-panel active" id="participants-panel">
                         <div class="participants-header">
                             <h3>Tournament Participants</h3>
                             <div class="participant-tabs">
                                 <button class="participant-tab active" data-participant-tab="paid">
                                     <i class="fas fa-check-circle"></i>
                                     Paid Participants
                                 </button>
                                 <button class="participant-tab" data-participant-tab="pending">
                                     <i class="fas fa-clock"></i>
                                     Pending Participants
                                 </button>
                             </div>
                         </div>
                         <div class="participant-tab-content">
                             <div class="participant-tab-panel active" id="paid-participants-panel">
                                 <div class="participants-list" id="paidParticipantsList">
                                     <!-- Paid participants will be loaded here -->
                                 </div>
                             </div>
                             <div class="participant-tab-panel" id="pending-participants-panel">
                                 <div class="participants-list" id="pendingParticipantsList">
                                     <!-- Pending participants will be loaded here -->
                                 </div>
                             </div>
                         </div>
                     </div>

                    <div class="tab-panel" id="matchmaking-panel">
                        <div class="matchmaking-header">
                            <h3>Swiss Tournament</h3>
                            <div class="tournament-actions">
                                <button class="btn-primary" onclick="window.eventManager.startSwissTournament('${event.id}')">
                                    <i class="fas fa-play"></i>
                                    Start Tournament
                                </button>
                                <button class="btn-secondary" onclick="window.eventManager.generateNextRound('${event.id}')">
                                    <i class="fas fa-forward"></i>
                                    Next Round
                                </button>
                            </div>
                        </div>
                        <div class="bracket-container" id="bracketContainer">
                            <!-- Tournament matches will be displayed here -->
                        </div>
                    </div>

                     <div class="tab-panel" id="rounds-panel">
                         <div class="rounds-header">
                             <h3>Tournament Rounds</h3>
                             <button class="add-round-btn">
                                 <i class="fas fa-plus"></i>
                                 Add Round
                             </button>
                         </div>
                         <div class="rounds-list" id="roundsList">
                             <!-- Rounds will be displayed here -->
                         </div>
                     </div>

                     <div class="tab-panel" id="results-panel">
                         <div class="results-header">
                             <h3>Final Results</h3>
                             <button class="export-results-btn">
                                 <i class="fas fa-download"></i>
                                 Export Results
                             </button>
                         </div>
                         <div class="results-container" id="resultsContainer">
                             <!-- Results will be displayed here -->
                         </div>
                     </div>
                 </div>
             </div>
         `;

         // Setup tab switching
         this.setupTournamentTabs();
         
         // Load tournament data
         this.loadTournamentData(event);
     }

     setupTournamentTabs() {
         const tabs = document.querySelectorAll('.tournament-tab');
         const panels = document.querySelectorAll('.tab-panel');

         tabs.forEach(tab => {
             tab.addEventListener('click', () => {
                 // Remove active class from all tabs and panels
                 tabs.forEach(t => t.classList.remove('active'));
                 panels.forEach(p => p.classList.remove('active'));

                 // Add active class to clicked tab and corresponding panel
                 tab.classList.add('active');
                 const tabId = tab.dataset.tab;
                 const panel = document.getElementById(`${tabId}-panel`);
                 if (panel) {
                     panel.classList.add('active');
                 }
             });
         });

         // Setup participant tabs
         this.setupParticipantTabs();

        // Setup add participant button
        const addParticipantBtns = document.querySelectorAll('.add-participant-btn');
        addParticipantBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showAddParticipantModal();
            });
        });

        // Setup export results button
        const exportResultsBtn = document.querySelector('.export-results-btn');
        if (exportResultsBtn) {
            exportResultsBtn.addEventListener('click', () => {
                this.exportTournamentResults();
            });
        }
    }

     setupParticipantTabs() {
         const participantTabs = document.querySelectorAll('.participant-tab');
         const participantPanels = document.querySelectorAll('.participant-tab-panel');

         participantTabs.forEach(tab => {
             tab.addEventListener('click', () => {
                 // Remove active class from all participant tabs and panels
                 participantTabs.forEach(t => t.classList.remove('active'));
                 participantPanels.forEach(p => p.classList.remove('active'));

                 // Add active class to clicked tab and corresponding panel
                 tab.classList.add('active');
                 const tabType = tab.dataset.participantTab;
                 const panel = document.getElementById(`${tabType}-participants-panel`);
                 if (panel) {
                     panel.classList.add('active');
                 }
             });
         });
     }

     async loadTournamentData(event) {
         try {
             // Load participants
             await this.loadParticipants(event.id);
             
             // Load matchmaking/bracket data
             await this.loadMatchmakingData(event.id);
             
             // Load rounds data
             await this.loadRoundsData(event.id);
             
             // Load results data
             await this.loadResultsData(event.id);
             
             // Update dashboard with accurate round count
             await this.updateDashboardRoundCount(event.id);
         } catch (error) {
             console.error('Error loading tournament data:', error);
             this.showNotification('Error loading tournament data', 'error');
         }
     }

     async loadParticipants(eventId) {
         try {
             // Get participants from TBL_EVENTS/{eventId}/participants
             const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
             const snapshot = await window.firebaseDatabase.get(participantsRef);
             const participants = snapshot.val() || {};

             const paidParticipantsList = document.getElementById('paidParticipantsList');
             const pendingParticipantsList = document.getElementById('pendingParticipantsList');
             
             if (!paidParticipantsList || !pendingParticipantsList) return;

             if (Object.keys(participants).length === 0) {
                 paidParticipantsList.innerHTML = `
                     <div class="no-participants">
                         <i class="fas fa-users"></i>
                         <p>No paid participants yet</p>
                     </div>
                 `;
                 pendingParticipantsList.innerHTML = `
                     <div class="no-participants">
                         <i class="fas fa-users"></i>
                         <p>No pending participants yet</p>
                     </div>
                 `;
                 return;
             }

             // Get all users from the users table
             const usersRef = window.firebaseDatabase.ref(window.database, 'users');
             const usersSnapshot = await window.firebaseDatabase.get(usersRef);
             const users = usersSnapshot.val() || {};

             // Create a map of userId to user data for quick lookup
             const userMap = {};
             Object.entries(users).forEach(([userId, userData]) => {
                 if (userData) {
                     userMap[userId] = userData;
                 }
             });

             // Debug: Log user data structure
             console.log('Users data structure:', {
                 totalUsers: Object.keys(users).length,
                 sampleUser: Object.keys(users).length > 0 ? users[Object.keys(users)[0]] : null,
                 userMapSize: Object.keys(userMap).length
             });

             // Separate participants into paid and pending
             const paidParticipants = [];
             const pendingParticipants = [];

             Object.entries(participants).forEach(([id, participant]) => {
                 const isPaid = this.isPaidValue(participant);
                 const participantData = {
                     id,
                     participant,
                     isPaid
                 };
                 
                 if (isPaid) {
                     paidParticipants.push(participantData);
                 } else {
                     pendingParticipants.push(participantData);
                 }
             });

             // Render paid participants
             if (paidParticipants.length === 0) {
                 paidParticipantsList.innerHTML = `
                     <div class="no-participants">
                         <i class="fas fa-check-circle"></i>
                         <p>No paid participants yet</p>
                     </div>
                 `;
             } else {
                 paidParticipantsList.innerHTML = paidParticipants.map(({id, participant}) => {
               const isPaid = this.isPaidValue(participant);
               const userId = typeof participant === 'string' ? id : (participant.userId || id);
                const userData = userMap[userId];
                
                // Use user data from users table if available, fallback to participant data
               const displayName = userData?.userName || userData?.name || (typeof participant === 'object' && (participant.name || participant.userName)) || 'Unknown Player';
                const userEmail = userData?.email || '';
                const profilePicture = userData?.profilePicture || userData?.profileImage || userData?.avatar || '';

                 // Debug: Log profile picture data
                 if (profilePicture) {
                     console.log(`Profile picture for ${displayName}:`, {
                         original: profilePicture.substring(0, 100) + '...',
                         startsWithData: profilePicture.startsWith('data:image/'),
                         startsWithHttp: profilePicture.startsWith('http'),
                         length: profilePicture.length
                     });
                 }

                 // Convert base64 to proper image source using utility function
                 const imageSrc = this.convertToImageSrc(profilePicture);

                return `
                     <div class="participant-card">
                         <div class="participant-info">
                             <div class="participant-avatar">
                                 ${imageSrc ? 
                                     `<img src="${imageSrc}" alt="${displayName}" class="participant-profile-img" onerror="console.log('Image failed to load for ${displayName}'); this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                      <i class="fas fa-user" style="display: none;"></i>` :
                                     `<i class="fas fa-user"></i>`
                                 }
                             </div>
                             <div class="participant-details">
                                <h4>${displayName}</h4>                               
                                 ${userEmail ? `<p>Email: ${userEmail}</p>` : ''}
                                <p>Payment: <span class="status-badge ${isPaid ? 'status-active' : 'status-inactive'}">${isPaid ? 'Paid' : 'Unpaid'}</span></p>
                             </div>
                         </div>
                         <div class="participant-actions">
                             <button class="remove-participant-btn" title="Remove" onclick="window.eventManager.removeParticipant('${eventId}', '${id}')">
                                 <i class="fas fa-trash"></i>
                             </button>
                            ${!isPaid ? `<button class=\"mark-paid-btn\" title=\"Mark as Paid\" onclick=\"window.eventManager.markParticipantPaid('${eventId}','${userId}')\"><i class=\"fas fa-check\"></i></button>` : ''}
                         </div>
                     </div>
                 `;
                 }).join('');
             }

             // Render pending participants
             if (pendingParticipants.length === 0) {
                 pendingParticipantsList.innerHTML = `
                     <div class="no-participants">
                         <i class="fas fa-clock"></i>
                         <p>No pending participants yet</p>
                     </div>
                 `;
             } else {
                 pendingParticipantsList.innerHTML = pendingParticipants.map(({id, participant}) => {
                     const isPaid = this.isPaidValue(participant);
                     const userId = typeof participant === 'string' ? id : (participant.userId || id);
                     const userData = userMap[userId];
                     
                     // Use user data from users table if available, fallback to participant data
                     const displayName = userData?.userName || userData?.name || (typeof participant === 'object' && (participant.name || participant.userName)) || 'Unknown Player';
                     const userEmail = userData?.email || '';
                     const profilePicture = userData?.profilePicture || userData?.profileImage || userData?.avatar || '';

                     // Convert base64 to proper image source using utility function
                     const imageSrc = this.convertToImageSrc(profilePicture);

                     return `
                         <div class="participant-card">
                             <div class="participant-info">
                                 <div class="participant-avatar">
                                     ${imageSrc ? 
                                         `<img src="${imageSrc}" alt="${displayName}" class="participant-profile-img" onerror="console.log('Image failed to load for ${displayName}'); this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                          <i class="fas fa-user" style="display: none;"></i>` :
                                         `<i class="fas fa-user"></i>`
                                     }
                                 </div>
                                 <div class="participant-details">
                                    <h4>${displayName}</h4>                               
                                     ${userEmail ? `<p>Email: ${userEmail}</p>` : ''}
                                    <p>Payment: <span class="status-badge ${isPaid ? 'status-active' : 'status-inactive'}">${isPaid ? 'Paid' : 'Unpaid'}</span></p>
                                 </div>
                             </div>
                             <div class="participant-actions">
                                 <button class="remove-participant-btn" title="Remove" onclick="window.eventManager.removeParticipant('${eventId}', '${id}')">
                                     <i class="fas fa-trash"></i>
                                 </button>
                                ${!isPaid ? `<button class=\"mark-paid-btn\" title=\"Mark as Paid\" onclick=\"window.eventManager.markParticipantPaid('${eventId}','${userId}')\"><i class=\"fas fa-check\"></i></button>` : ''}
                             </div>
                         </div>
                     `;
                 }).join('');
             }

             // Update participant count in dashboard
             const participantCountEl = document.getElementById('participantCount');
             if (participantCountEl) {
                 participantCountEl.textContent = Object.keys(participants).length;
             }
         } catch (error) {
             console.error('Error loading participants:', error);
             this.showNotification('Error loading participants', 'error');
         }
     }

    async loadMatchmakingData(eventId) {
        try {
            // Derive rounds and render
            const bracketContainer = document.getElementById('bracketContainer');
            if (!bracketContainer) return;
            const roundsRootRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}`);
            const roundsRootSnap = await window.firebaseDatabase.get(roundsRootRef);
            const roundsRoot = roundsRootSnap.val() || {};
            const roundKeys = Object.keys(roundsRoot).filter(k => /^ROUND_\d+$/.test(k));
            if (roundKeys.length === 0) {
                bracketContainer.innerHTML = `
                    <div class="no-tournament">
                        <i class="fas fa-trophy"></i>
                        <p>No tournament started yet</p>
                    </div>
                `;
                return;
            }

            // Get all matches from all rounds
            const matchesByRound = {};
            const totalRounds = Math.max(...roundKeys.map(k => parseInt(k.split('_')[1], 10)));
            
            for (let roundNum = 1; roundNum <= totalRounds; roundNum++) {
                const roundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${roundNum}`);
                const roundSnapshot = await window.firebaseDatabase.get(roundRef);
                const roundMatches = roundSnapshot.val() || {};
                
                if (Object.keys(roundMatches).length > 0) {
                    matchesByRound[roundNum] = Object.entries(roundMatches).map(([matchId, match]) => ({
                        matchId: matchId,
                        round: roundNum,
                        player1: match.Player1,
                        player2: match.Player2,
                        player1Name: match.Player1Name || 'Unknown',
                        player2Name: match.Player2Name || 'Unknown',
                        player1Profile: match.Player1Profile || '',
                        player2Profile: match.Player2Profile || '',
                        winner: match.Winner,
                        status: match.Winner === "undecided" ? 'pending' : 'completed',
                        result: match.Winner === "undecided" ? null :
                                (match.Player2 == null ? 'bye' :
                                 (match.Winner === match.Player1 ? 'player1' :
                                  match.Winner === match.Player2 ? 'player2' : 'bye'))
                    }));
                }
            }

            // Render tournament matches
            const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnap = await window.firebaseDatabase.get(participantsRef);
            const participantsMap = participantsSnap.val() || {};
            // New paid rule with legacy tolerance
            const paidCount = Object.values(participantsMap).filter(v => this.isPaidValue(v)).length;
            const swiss = new window.SwissMatchmaker();
            const tournament = {
                status: 'active',
                currentRound: totalRounds,
                totalRounds: swiss.calculateRounds(paidCount)
            };
            bracketContainer.innerHTML = this.renderSwissMatches(tournament, matchesByRound);

        } catch (error) {
            console.error('Error loading matchmaking data:', error);
            this.showNotification('Error loading matchmaking data', 'error');
        }
    }

     async loadRoundsData(eventId) {
         try {
             const roundsRef = window.firebaseDatabase.ref(window.database, `TBL_TOURNAMENT_ROUNDS/${eventId}`);
             const snapshot = await window.firebaseDatabase.get(roundsRef);
             const rounds = snapshot.val() || {};

             const roundsList = document.getElementById('roundsList');
             if (!roundsList) return;

             if (Object.keys(rounds).length === 0) {
                 roundsList.innerHTML = `
                     <div class="no-rounds">
                         <i class="fas fa-trophy"></i>
                         <p>No rounds created yet</p>
                         <button class="add-round-btn">
                             <i class="fas fa-plus"></i>
                             Create First Round
                         </button>
                     </div>
                 `;
                 return;
             }

             roundsList.innerHTML = Object.entries(rounds).map(([id, round]) => `
                 <div class="round-card">
                     <div class="round-header">
                         <h4>Round ${round.roundNumber || id}</h4>
                         <span class="round-status status-${round.status || 'pending'}">${(round.status || 'pending').charAt(0).toUpperCase() + (round.status || 'pending').slice(1)}</span>
                     </div>
                     <div class="round-details">
                         <p>Matches: ${round.matches ? Object.keys(round.matches).length : 0}</p>
                         <p>Start Time: ${round.startTime ? new Date(round.startTime).toLocaleString() : 'TBD'}</p>
                     </div>
                     <div class="round-actions">
                         <button class="view-round-btn" title="View Details">
                             <i class="fas fa-eye"></i>
                         </button>
                         <button class="edit-round-btn" title="Edit">
                             <i class="fas fa-edit"></i>
                         </button>
                     </div>
                 </div>
             `).join('');
         } catch (error) {
             console.error('Error loading rounds data:', error);
         }
     }

    async loadResultsData(eventId) {
        try {
            // Derive tournament info from ROUND_* nodes
            const resultsContainer = document.getElementById('resultsContainer');
            if (!resultsContainer) return;
            const roundsRootRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}`);
            const roundsRootSnap = await window.firebaseDatabase.get(roundsRootRef);
            const roundsRoot = roundsRootSnap.val() || {};
            const roundKeys = Object.keys(roundsRoot).filter(k => /^ROUND_\d+$/.test(k));
            if (roundKeys.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <i class="fas fa-medal"></i>
                        <p>No tournament started yet</p>
                        <p>Standings will appear here once the tournament is started</p>
                    </div>
                `;
                return;
            }

            // Figure out current round and total rounds expected
            const currentRound = Math.max(...roundKeys.map(k => parseInt(k.replace('ROUND_', ''), 10)));
            const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnap = await window.firebaseDatabase.get(participantsRef);
            const participants = participantsSnap.val() || {};
            const paidCount = Object.values(participants).filter(v => this.isPaidValue(v)).length;
            const swiss = new window.SwissMatchmaker();
            const totalRounds = swiss.calculateRounds(paidCount || 0);

            // Load standings
            const standings = await this.loadStandings(eventId);

            // Determine if tournament is complete: all rounds generated up to totalRounds and all matches decided
            let allRoundsDecided = true;
            for (let r = 1; r <= Math.min(currentRound, totalRounds || currentRound); r++) {
                const rRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${r}`);
                const rSnap = await window.firebaseDatabase.get(rRef);
                const rMatches = rSnap.val() || {};
                const matchesArr = Object.values(rMatches);
                if (matchesArr.length === 0) { allRoundsDecided = false; break; }
                const undecided = matchesArr.some(m => !m || m.Winner === undefined || m.Winner === null || m.Winner === 'undecided');
                if (undecided) { allRoundsDecided = false; break; }
            }

            const tournament = {
                status: allRoundsDecided && currentRound >= (totalRounds || 1) ? 'completed' : 'ongoing',
                currentRound,
                totalRounds: totalRounds || currentRound
            };

            if (standings.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <i class="fas fa-medal"></i>
                        <p>No standings available yet</p>
                        <p>Standings will appear here once matches are played</p>
                    </div>
                `;
                return;
            }

            // Always show full standings table with records
            resultsContainer.innerHTML = this.renderStandings(standings, tournament);

        } catch (error) {
            console.error('Error loading results data:', error);
            this.showNotification('Error loading results data', 'error');
        }
    }

     renderBracket(bracketData) {
         // Simple bracket visualization
         return `
             <div class="bracket-visualization">
                 <div class="bracket-round">
                     <h4>Round 1</h4>
                     <div class="bracket-matches">
                         <!-- Matches will be rendered here -->
                     </div>
                 </div>
             </div>
         `;
     }

     renderResults(results) {
         return `
             <div class="results-podium">
                 <div class="podium-item first">
                     <div class="podium-rank">1st</div>
                     <div class="podium-player">${results.firstPlace || 'TBD'}</div>
                 </div>
                 <div class="podium-item second">
                     <div class="podium-rank">2nd</div>
                     <div class="podium-player">${results.secondPlace || 'TBD'}</div>
                 </div>
                 <div class="podium-item third">
                     <div class="podium-rank">3rd</div>
                     <div class="podium-player">${results.thirdPlace || 'TBD'}</div>
                 </div>
             </div>
         `;
     }

     updateTournamentDashboard(event) {
         const dashboard = document.querySelector('.dashboard');
         if (!dashboard) return;

         dashboard.innerHTML = `
             <h2 class="dashboard-title">${event.eventName}</h2>
             <p class="date">${event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'TBD'}</p>
             
             <div class="stats-section">
                 <div class="stat-item">
                     <div class="stat-label">PARTICIPANTS</div>
                     <div class="stat-value" id="participantCount">0</div>
                 </div>
                 
                 <div class="stat-item">
                     <div class="stat-label">ROUNDS</div>
                     <div class="stat-value" id="roundCount">0</div>
                 </div>
                 
                 <div class="stat-item">
                     <div class="stat-label">MATCHES</div>
                     <div class="stat-value" id="matchCount">0</div>
                 </div>
             </div>
             
             <div class="section-title">TOURNAMENT STATUS</div>
             
             <div class="tournament-status">
                 <div class="status-item">
                     <span class="status-label">Status:</span>
                     <span class="status-badge status-${event.status || 'active'}">${(event.status || 'active').charAt(0).toUpperCase() + (event.status || 'active').slice(1)}</span>
                 </div>
                 <div class="status-item">
                     <span class="status-label">Location:</span>
                     <span class="status-value">${event.location || 'TBD'}</span>
                 </div>
             </div>
         `;
     }

     async updateDashboardRoundCount(eventId) {
         try {
             // Get rounds data from TBL_MATCHES
             const roundsRootRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}`);
             const roundsRootSnap = await window.firebaseDatabase.get(roundsRootRef);
             const roundsRoot = roundsRootSnap.val() || {};
             const roundKeys = Object.keys(roundsRoot).filter(k => /^ROUND_\d+$/.test(k));
             
             // Get participants to calculate total rounds
             const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
             const participantsSnap = await window.firebaseDatabase.get(participantsRef);
             const participants = participantsSnap.val() || {};
             const paidCount = Object.values(participants).filter(v => this.isPaidValue(v)).length;
             
             // Calculate current round and total rounds
             const currentRound = roundKeys.length > 0 ? Math.max(...roundKeys.map(k => parseInt(k.replace('ROUND_', ''), 10))) : 0;
             const swiss = new window.SwissMatchmaker();
             const totalRounds = swiss.calculateRounds(paidCount || 0);
             
             // Update round count display
             const roundCountEl = document.getElementById('roundCount');
             if (roundCountEl) {
                 if (currentRound === 0) {
                     roundCountEl.textContent = `0/${totalRounds}`;
                 } else {
                     roundCountEl.textContent = `${currentRound}/${totalRounds}`;
                 }
             }
             
             // Update match count
             let totalMatches = 0;
             roundKeys.forEach(roundKey => {
                 const roundData = roundsRoot[roundKey];
                 if (roundData) {
                     totalMatches += Object.keys(roundData).length;
                 }
             });
             
             const matchCountEl = document.getElementById('matchCount');
             if (matchCountEl) {
                 matchCountEl.textContent = totalMatches;
             }
             
         } catch (error) {
             console.error('Error updating dashboard round count:', error);
         }
     }

     showEventsList() {
         this.currentView = 'events';
         this.selectedEvent = null;
         
         // Restore original events view
         const mainContent = document.querySelector('.main-content');
         if (mainContent) {
             mainContent.innerHTML = `
                 <div class="events-top-section">
                     <h1 class="page-title">Event Management</h1>
                 </div>
                 
                 <div class="create-event-section">
                     <button class="create-event-btn">
                         <i class="fas fa-plus"></i>
                         Create Event
                     </button>
                 </div>
                 
                 <div class="events-middle-section">
                     <div class="events-list" id="eventsList">
                         <!-- Events will be loaded dynamically -->
                     </div>
                 </div>
                 
                 <div class="events-bottom-section">
                     <button class="past-events-btn">
                         <i class="fas fa-history"></i>
                         Past Events
                     </button>
                 </div>
             `;
         }

         // Restore original dashboard
         const dashboard = document.querySelector('.dashboard');
         if (dashboard) {
             dashboard.innerHTML = `
                 <h2 class="dashboard-title">Aurorus Connect</h2>
                 <p class="date"></p>
                 
                 <div class="stats-section">
                     <div class="stat-item">
                         <div class="stat-label">EVENTS TODAY</div>
                         <div class="stat-value" id="eventsToday">0</div>
                     </div>
                     
                     <div class="stat-item">
                         <div class="stat-label">PARTICIPANTS</div>
                         <div class="stat-value" id="totalParticipants">0</div>
                     </div>
                     
                     <div class="stat-item">
                         <div class="stat-label">TOURNAMENTS</div>
                         <div class="stat-value" id="totalTournaments">0</div>
                     </div>
                 </div>
                 
                 <div class="section-title">UPCOMING</div>
                 
                 <div class="events-section" id="upcomingEvents">
                     <!-- Upcoming events will be loaded dynamically -->
                 </div>
             `;
         }

         // Re-render events
         this.renderEvents();
     }

     async editParticipant(eventId, participantId) {
         // TODO: Implement participant editing functionality
         this.showNotification('Edit participant functionality coming soon', 'info');
     }

    async removeParticipant(eventId, participantId) {
        this.showConfirmationModal(
            'Remove Participant',
            'Are you sure you want to remove this participant from the event?',
            'Remove',
            async () => {
                try {
                    const participantRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants/${participantId}`);
                    await window.firebaseDatabase.remove(participantRef);
                    
                    this.showNotification('Participant removed successfully', 'success');
                    
                    // Reload participants for the current event
                    if (this.selectedEvent && this.selectedEvent.id === eventId) {
                        await this.loadParticipants(eventId);
                    }
                } catch (error) {
                    console.error('Error removing participant:', error);
                    this.showNotification('Error removing participant', 'error');
                }
            }
        );
    }

     async showAddParticipantModal() {
         if (!this.selectedEvent) {
             this.showNotification('No event selected', 'error');
             return;
         }

         try {
             // Get all users from the users table
             const usersRef = window.firebaseDatabase.ref(window.database, 'users');
             const usersSnapshot = await window.firebaseDatabase.get(usersRef);
             const users = usersSnapshot.val() || {};

             // Get existing participants to exclude them from the dropdown
             const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${this.selectedEvent.id}/participants`);
             const participantsSnapshot = await window.firebaseDatabase.get(participantsRef);
             const existingParticipants = participantsSnapshot.val() || {};
             const existingUserIds = Object.keys(existingParticipants);

             // Filter out users who are already participants
             const availableUsers = Object.entries(users).filter(([userId, userData]) => 
                 userData && userData.userName && !existingUserIds.includes(userId)
             );

             const modal = document.createElement('div');
             modal.className = 'modal';
             modal.innerHTML = `
                 <div class="modal-content">
                     <div class="modal-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                         <h3>Add Participant</h3>
                     </div>
                     <div class="modal-body">
                         <div class="event-info">
                             <h4>${this.selectedEvent.eventName}</h4>
                             <div class="event-details">
                                 <div class="detail-row">
                                     <span class="detail-label">Date:</span>
                                     <span class="detail-value">${this.selectedEvent.eventDate ? new Date(this.selectedEvent.eventDate).toLocaleDateString() : 'TBD'}</span>
                                 </div>
                                 <div class="detail-row">
                                     <span class="detail-label">Location:</span>
                                     <span class="detail-value">${this.selectedEvent.location || 'TBD'}</span>
                                 </div>
                             </div>
                         </div>
                         
                         <div class="status-selection">
                             <label for="userSelect">Select User *</label>
                             <select id="userSelect" required>
                                 <option value="">Choose a user...</option>
                                 ${availableUsers.map(([userId, userData]) => 
                                     `<option value="${userId}" data-name="${userData.userName}" data-email="${userData.email || ''}">
                                         ${userData.userName} (${userId})${userData.email ? ` - ${userData.email}` : ''}
                                     </option>`
                                 ).join('')}
                             </select>
                         </div>
                         
                         <div class="status-selection">
                             <label for="participantUserId">User ID (Auto-filled)</label>
                             <input type="text" id="participantUserId" readonly placeholder="Will be filled automatically">
                         </div>
                         
                         <div class="status-selection">
                             <label for="participantUserName">User Name (Auto-filled)</label>
                             <input type="text" id="participantUserName" readonly placeholder="Will be filled automatically">
                         </div>
                     </div>
                     <div class="modal-actions">
                         <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                         <button type="button" class="btn-primary" id="addParticipantConfirm">Add Participant</button>
                     </div>
                 </div>
             `;
             
             document.body.appendChild(modal);

             // Handle user selection
             const userSelect = document.getElementById('userSelect');
             const userIdInput = document.getElementById('participantUserId');
             const userNameInput = document.getElementById('participantUserName');

             userSelect.addEventListener('change', (e) => {
                 const selectedOption = e.target.options[e.target.selectedIndex];
                 if (selectedOption.value) {
                     userIdInput.value = selectedOption.value;
                     userNameInput.value = selectedOption.dataset.name;
                 } else {
                     userIdInput.value = '';
                     userNameInput.value = '';
                 }
             });

             // Handle form submission
             const confirmBtn = document.getElementById('addParticipantConfirm');
             confirmBtn.addEventListener('click', async () => {
                 const userId = userIdInput.value.trim();
                 const userName = userNameInput.value.trim();

                 if (!userId) {
                     this.showNotification('Please select a user', 'error');
                     return;
                 }

                 try {
                     // Add participant
                     const participantData = {
                         userId: userId,
                         name: userName,
                         userName: userName,
                         registeredAt: new Date().toISOString(),
                         status: 'registered'
                     };

                     const participantRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${this.selectedEvent.id}/participants/${userId}`);
                     await window.firebaseDatabase.set(participantRef, participantData);
                     
                     this.showNotification('Participant added successfully', 'success');
                     modal.remove();
                     
                     // Reload participants
                     await this.loadParticipants(this.selectedEvent.id);
                     
                 } catch (error) {
                     console.error('Error adding participant:', error);
                     this.showNotification('Error adding participant', 'error');
                 }
             });

        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Error loading user data', 'error');
        }
    }

    // Swiss Tournament Methods
    async startSwissTournament(eventId) {
        try {
            // Get paid participants
            const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnapshot = await window.firebaseDatabase.get(participantsRef);
            const participants = participantsSnapshot.val() || {};

            // Load users upfront for name lookup
            const usersRefForNames = window.firebaseDatabase.ref(window.database, 'users');
            const usersSnapForNames = await window.firebaseDatabase.get(usersRefForNames);
            const usersForNames = usersSnapForNames.val() || {};

            // Paid rule: use unified helper (case-insensitive, legacy tolerant)
            const paidParticipants = Object.entries(participants)
                .filter(([uid, p]) => this.isPaidValue(p))
                .map(([id]) => ({
                    userId: id,
                    name: (usersForNames[id]?.userName || usersForNames[id]?.name || 'Unknown'),
                    paid: true
                }));

            console.log('[Swiss] Participants snapshot:', participants);
            console.log('[Swiss] Computed paidParticipants:', paidParticipants.map(p => p.userId));

            if (paidParticipants.length < 2) {
                this.showNotification(`Minimum 2 paid participants required (found ${paidParticipants.length}). Ensure participant values are 'Paid'.`, 'error');
                return;
            }

            // Initialize Swiss matchmaker
            const swissMatchmaker = new window.SwissMatchmaker();
            const totalRounds = swissMatchmaker.calculateRounds(paidParticipants.length);

            // Generate first round pairings using seed order (all at 0 points are equal)
            // All players start at 0 points; Swiss generator will handle equal groupings
            const pairings = swissMatchmaker.generatePairings(paidParticipants, 1, []);

            // No tournament meta node per DB structure. Rounds will be derived from ROUND_* nodes.

            // Save first round matches
            const roundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_1`);
            const matchPromises = [];

            // Get user data for names and profile pictures
            const usersRef = window.firebaseDatabase.ref(window.database, 'users');
            const usersSnapshot = await window.firebaseDatabase.get(usersRef);
            const users = usersSnapshot.val() || {};

            // Save regular matches
            pairings.matches.forEach((match, index) => {
                const safeIndex = String(index).replace(/[^0-9]/g, '');
                const matchId = `match_${Date.now()}_${safeIndex}`;
                const matchRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_1/${matchId}`);
                
                const player1Data = users[match.player1] || {};
                const player2Data = users[match.player2] || {};
                
                matchPromises.push(
                    window.firebaseDatabase.set(matchRef, {
                        Player1: match.player1,
                        Player2: match.player2,
                        Player1Name: player1Data.userName || player1Data.name || 'Unknown',
                        Player2Name: player2Data.userName || player2Data.name || 'Unknown',
                        Player1Profile: player1Data.profilePicture || player1Data.profileImage || player1Data.avatar || '',
                        Player2Profile: player2Data.profilePicture || player2Data.profileImage || player2Data.avatar || '',
                        Winner: "undecided"
                    })
                );
            });

            // Save bye matches
            pairings.byes.forEach((userId, index) => {
                const safeIndex = String(index).replace(/[^0-9]/g, '');
                const matchId = `bye_${Date.now()}_${safeIndex}`;
                const matchRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_1/${matchId}`);
                
                const playerData = users[userId] || {};
                
                matchPromises.push(
                    window.firebaseDatabase.set(matchRef, {
                        Player1: userId,
                        Player1Name: playerData.userName || playerData.name || 'Unknown',
                        Player1Profile: playerData.profilePicture || playerData.profileImage || playerData.avatar || '',
                        Player2: null,
                        Winner: userId // Bye winner is the player who got the bye
                    })
                );
            });

            await Promise.all(matchPromises);

            // Save initial standings (all players start with 0 points)
            const standingsRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/STANDINGS`);
            const initialStandings = {};
            paidParticipants.forEach(participant => {
                const userId = participant.userId || participant.id;
                initialStandings[userId] = 0;
            });
            await window.firebaseDatabase.set(standingsRef, initialStandings);

            this.showNotification(`Swiss tournament started with ${paidParticipants.length} paid participants (${totalRounds} rounds)`, 'success');
            
            // Update dashboard with new round count
            await this.updateDashboardRoundCount(eventId);
            
            // Reload tournament data to show the new matches
            await this.loadTournamentData({ id: eventId });

        } catch (error) {
            console.error('Error starting Swiss tournament:', error);
            this.showNotification('Error starting Swiss tournament', 'error');
        }
    }

    async generateNextRound(eventId) {
        try {
            // Derive current round from existing ROUND_* nodes
            const roundsRootRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}`);
            const roundsRootSnap = await window.firebaseDatabase.get(roundsRootRef);
            const roundsRoot = roundsRootSnap.val() || {};
            const roundKeys = Object.keys(roundsRoot).filter(k => /^ROUND_\d+$/.test(k));
            const currentRound = roundKeys.length > 0 ? Math.max(...roundKeys.map(k => parseInt(k.split('_')[1], 10))) : 0;
            if (currentRound === 0) {
                this.showNotification('No rounds found. Start tournament first.', 'error');
                return;
            }
            // Estimate total rounds using participant count
            const participantsRefForRounds = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnapForRounds = await window.firebaseDatabase.get(participantsRefForRounds);
            const participantsMapForRounds = participantsSnapForRounds.val() || {};
            const paidForRounds = Object.values(participantsMapForRounds).filter(v => this.isPaidValue(v));
            const totalRounds = new window.SwissMatchmaker().calculateRounds(paidForRounds.length);

            if (currentRound >= totalRounds) {
                this.showNotification('Tournament is already complete', 'error');
                return;
            }

            // Check if current round is complete (all matches have winners)
            const currentRoundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${currentRound}`);
            const currentRoundSnapshot = await window.firebaseDatabase.get(currentRoundRef);
            const currentRoundMatches = currentRoundSnapshot.val() || {};

            // Check if all matches are completed (no "undecided" winners)
            const incompleteMatches = Object.values(currentRoundMatches).filter(match => 
                match.Winner === "undecided" || match.Winner === null || match.Winner === undefined
            );

            if (incompleteMatches.length > 0) {
                this.showNotification(`Round ${currentRound} is not complete. ${incompleteMatches.length} matches still undecided.`, 'error');
                return;
            }

            const nextRound = currentRound + 1;

            // Get paid participants
            const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnapshot = await window.firebaseDatabase.get(participantsRef);
            const participants = participantsSnapshot.val() || {};
            // Load users upfront once
            const usersRefForNames2 = window.firebaseDatabase.ref(window.database, 'users');
            const usersSnapForNames2 = await window.firebaseDatabase.get(usersRefForNames2);
            const usersForNames2 = usersSnapForNames2.val() || {};
            const paidParticipants = Object.entries(participants)
                .filter(([uid, p]) => this.isPaidValue(p))
                .map(([id]) => ({
                    userId: id,
                    name: (usersForNames2[id]?.userName || usersForNames2[id]?.name || 'Unknown'),
                    paid: true
                }));

            // Get all completed matches from all previous rounds
            const allMatchResults = [];
            for (let roundNum = 1; roundNum <= currentRound; roundNum++) {
                const roundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${roundNum}`);
                const roundSnapshot = await window.firebaseDatabase.get(roundRef);
                const roundMatches = roundSnapshot.val() || {};
                
                Object.values(roundMatches).forEach(match => {
                    if (match.Winner && match.Winner !== "undecided") {
                        allMatchResults.push({
                            player1: match.Player1,
                            player2: match.Player2,
                            result: match.Winner === match.Player1 ? 'player1' : 
                                   match.Winner === match.Player2 ? 'player2' : 'draw',
                            round: roundNum,
                            status: 'completed'
                        });
                    }
                });
            }

            // Generate next round pairings
            const swissMatchmaker = new window.SwissMatchmaker();
            // Compute current standings from completed results, then order participants by points
            const currentStandings = swissMatchmaker.calculateStandings(paidParticipants, allMatchResults);
            const participantsOrdered = currentStandings.map(p => ({ userId: p.userId, name: p.name, paid: true }));
            const pairings = swissMatchmaker.generatePairings(participantsOrdered, nextRound, allMatchResults);

            // Get user data for names and profile pictures
            const usersRef = window.firebaseDatabase.ref(window.database, 'users');
            const usersSnapshot = await window.firebaseDatabase.get(usersRef);
            const users = usersSnapshot.val() || {};

            // Save next round matches
            const nextRoundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${nextRound}`);
            const matchPromises = [];

            // Save regular matches
            pairings.matches.forEach((match, index) => {
                const safeIndex = String(index).replace(/[^0-9]/g, '');
                const matchId = `match_${Date.now()}_${safeIndex}`;
                const matchRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${nextRound}/${matchId}`);
                
                const player1Data = users[match.player1] || {};
                const player2Data = users[match.player2] || {};
                
                matchPromises.push(
                    window.firebaseDatabase.set(matchRef, {
                        Player1: match.player1,
                        Player2: match.player2,
                        Player1Name: player1Data.userName || player1Data.name || 'Unknown',
                        Player2Name: player2Data.userName || player2Data.name || 'Unknown',
                        Player1Profile: player1Data.profilePicture || player1Data.profileImage || player1Data.avatar || '',
                        Player2Profile: player2Data.profilePicture || player2Data.profileImage || player2Data.avatar || '',
                        Winner: "undecided"
                    })
                );
            });

            // Save bye matches
            pairings.byes.forEach((userId, index) => {
                const safeIndex = String(index).replace(/[^0-9]/g, '');
                const matchId = `bye_${Date.now()}_${safeIndex}`;
                const matchRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/ROUND_${nextRound}/${matchId}`);
                
                const playerData = users[userId] || {};
                
                matchPromises.push(
                    window.firebaseDatabase.set(matchRef, {
                        Player1: userId,
                        Player1Name: playerData.userName || playerData.name || 'Unknown',
                        Player1Profile: playerData.profilePicture || playerData.profileImage || playerData.avatar || '',
                        Player2: null,
                        Winner: userId // Bye winner is the player who got the bye
                    })
                );
            });

            await Promise.all(matchPromises);

            // Update standings after round completion
            const standings = swissMatchmaker.calculateStandings(paidParticipants, allMatchResults);
            const standingsRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/STANDINGS`);
            const standingsData = {};
            standings.forEach(player => {
                standingsData[player.userId] = player.totalPoints;
            });
            await window.firebaseDatabase.set(standingsRef, standingsData);

            // Notify
            if (nextRound >= totalRounds) {
                this.showNotification(`Tournament completed! Round ${nextRound} generated.`, 'success');
            } else {
                this.showNotification(`Round ${nextRound} generated successfully`, 'success');
            }
            
            // Update dashboard with new round count
            await this.updateDashboardRoundCount(eventId);

            // Reload tournament data
            await this.loadTournamentData({ id: eventId });

        } catch (error) {
            console.error('Error generating next round:', error);
            this.showNotification('Error generating next round', 'error');
        }
    }

    async loadStandings(eventId) {
        try {
            // Get participants and users for names
            const participantsRef = window.firebaseDatabase.ref(window.database, `TBL_EVENTS/${eventId}/participants`);
            const participantsSnapshot = await window.firebaseDatabase.get(participantsRef);
            const participants = participantsSnapshot.val() || {};
            const usersRef = window.firebaseDatabase.ref(window.database, 'users');
            const usersSnapshot = await window.firebaseDatabase.get(usersRef);
            const users = usersSnapshot.val() || {};
            const paidParticipants = Object.entries(participants)
                .filter(([uid, v]) => this.isPaidValue(v))
                .map(([userId]) => ({ userId, name: (users[userId]?.userName || users[userId]?.name || 'Unknown'), paid: true }));

            // Get all completed matches from all rounds
            const allMatchResults = [];
            
            // Get tournament metadata to know how many rounds exist
            const roundsRootRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}`);
            const roundsRootSnap = await window.firebaseDatabase.get(roundsRootRef);
            const roundsRoot = roundsRootSnap.val() || {};
            const roundKeys = Object.keys(roundsRoot).filter(k => /^ROUND_\d+$/.test(k));
            for (const key of roundKeys) {
                const roundNum = parseInt(key.replace('ROUND_', ''), 10);
                const roundRef = window.firebaseDatabase.ref(window.database, `TBL_MATCHES/${eventId}/${key}`);
                const roundSnapshot = await window.firebaseDatabase.get(roundRef);
                const roundMatches = roundSnapshot.val() || {};
                Object.values(roundMatches).forEach(match => {
                    if (match.Winner && match.Winner !== "undecided") {
                        allMatchResults.push({
                            player1: match.Player1,
                            player2: match.Player2,
                            result: match.Player2 == null ? 'bye' : (match.Winner === match.Player1 ? 'player1' : match.Winner === match.Player2 ? 'player2' : 'draw'),
                            round: roundNum,
                            status: 'completed'
                        });
                    }
                });
            }

            // Calculate standings using Swiss matchmaker
            const swissMatchmaker = new window.SwissMatchmaker();
            const standings = swissMatchmaker.calculateStandings(paidParticipants, allMatchResults);

            return standings;

        } catch (error) {
            console.error('Error loading standings:', error);
            this.showNotification('Error loading standings', 'error');
            return [];
        }
    }


    renderSwissMatches(tournament, matchesByRound) {
        const rounds = Object.keys(matchesByRound).sort((a, b) => parseInt(a) - parseInt(b));
        
        let html = `
            <div class="tournament-info">
                <div class="tournament-status">
                    <span class="status-badge status-${tournament.status}">${tournament.status.toUpperCase()}</span>
                    <span>Round ${tournament.currentRound} of ${tournament.totalRounds}</span>
                </div>
            </div>
        `;

        rounds.forEach(roundNum => {
            const roundMatches = matchesByRound[roundNum];
            const isCurrentRound = parseInt(roundNum) === tournament.currentRound;
            
            html += `
                <div class="round-container ${isCurrentRound ? 'current-round' : ''}">
                    <div class="round-header">
                        <h4>Round ${roundNum}</h4>
                        ${isCurrentRound ? '<span class="current-badge">Current</span>' : ''}
                    </div>
                    <div class="matches-list">
            `;

            roundMatches.forEach(match => {
                if (match.result === 'bye') {
                        html += `
                            <div class="match-card bye-match">
                                <div class="match-players">
                                    <div class="player">
                                        <div class="player-info">
                                            ${match.player1Profile ? `<img src="${match.player1Profile}" alt="${match.player1Name}" class="player-avatar" onerror="this.style.display='none'">` : ''}
                                            <span class="player-name">${match.player1Name}</span>
                                        </div>
                                        <span class="bye-badge">BYE ROUND</span>
                                    </div>
                                </div>
                                <div class="match-status completed">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Completed</span>
                                </div>
                            </div>
                        `;
                } else {
                    const isCompleted = match.status === 'completed';
                    const isPending = match.status === 'pending';
                    
                        html += `
                            <div class="match-card ${isCompleted ? 'completed' : isPending ? 'pending' : ''}">
                                <div class="match-players">
                                    <div class="player ${match.result === 'player1' ? 'winner' : ''}">
                                        <div class="player-info">
                                            ${match.player1Profile ? `<img src="${match.player1Profile}" alt="${match.player1Name}" class="player-avatar" onerror="this.style.display='none'">` : ''}
                                            <span class="player-name">${match.player1Name}</span>
                                        </div>
                                        ${match.result === 'player1' ? '<i class="fas fa-crown winner-icon"></i>' : ''}
                                    </div>
                                    <div class="vs">vs</div>
                                    <div class="player ${match.result === 'player2' ? 'winner' : ''}">
                                        <div class="player-info">
                                            ${match.player2Profile ? `<img src="${match.player2Profile}" alt="${match.player2Name}" class="player-avatar" onerror="this.style.display='none'">` : ''}
                                            <span class="player-name">${match.player2Name}</span>
                                        </div>
                                        ${match.result === 'player2' ? '<i class="fas fa-crown winner-icon"></i>' : ''}
                                    </div>
                                </div>
                                <div class="match-status ${isCompleted ? 'completed' : isPending ? 'pending' : ''}">
                                    ${isCompleted ? 
                                        `<i class="fas fa-check-circle"></i><span>Completed</span>` :
                                        isPending ?
                                        `<i class="fas fa-clock"></i><span>Pending (Mobile App)</span>` :
                                        `<i class="fas fa-times-circle"></i><span>Not Started</span>`
                                    }
                                </div>
                            </div>
                        `;
                }
            });

            html += `
                    </div>
                </div>
            `;
        });

        return html;
    }

    renderStandings(standings, tournament) {
        let html = `
            <div class="standings-header">
                <h3>Tournament Standings</h3>
                <div class="tournament-info">
                    <span class="status-badge status-${tournament.status}">${tournament.status.toUpperCase()}</span>
                    <span>Round ${tournament.currentRound} of ${tournament.totalRounds}</span>
                </div>
            </div>
            <div class="standings-table">
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Record</th>
                            <th>Points</th>
                            <th>OWP</th>
                            <th>Games</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        standings.forEach((player, index) => {
            const rank = index + 1;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
            
            html += `
                <tr class="standings-row ${rank <= 3 ? 'podium' : ''}">
                    <td class="rank">
                        <span class="rank-number">${rank}</span>
                        ${medal}
                    </td>
                    <td class="player-name">${player.name}</td>
                    <td class="record">${player.record}</td>
                    <td class="points">${player.totalPoints}</td>
                    <td class="owp">${(player.owp * 100).toFixed(1)}%</td>
                    <td class="games">${player.gamesPlayed}</td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        return html;
    }
}

// Global event manager instance
window.eventManager = new EventManager();
