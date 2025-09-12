class EventManager {
    constructor() {
        this.events = [];
        this.imageObjectUrls = new Map();
        this.eventsUnsubscribe = null;
        this.init();
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

        // Edit event buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-event-btn')) {
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

        // Create modal to show past events
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Past Events</h3>
                <div class="past-events-list">
                    ${pastEvents.map(event => `
                        <div class="past-event-item">
                            <h4>${event.eventName}</h4>
                            <p>Date: ${new Date(event.eventDate).toLocaleDateString()}</p>
                            <p>Location: ${event.location || 'N/A'}</p>
                        </div>
                    `).join('')}
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
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

     showStatusUpdateModal(event) {
         const modal = document.createElement('div');
         modal.className = 'modal';
         modal.innerHTML = `
             <div class="modal-content">
                 <div class="modal-header">
                     <h3>Update Event Status</h3>
                 </div>
                 <div class="modal-body">
                     <div class="event-info">
                         <h4>${event.eventName}</h4>
                         <div class="event-details">
                             <div class="detail-row">
                                 <span class="detail-label">Date:</span>
                                 <span class="detail-value">${event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'TBD'}</span>
                             </div>
                             <div class="detail-row">
                                 <span class="detail-label">Location:</span>
                                 <span class="detail-value">${event.location || 'TBD'}</span>
                             </div>
                             <div class="detail-row">
                                 <span class="detail-label">Current Status:</span>
                                 <span class="status-badge status-${event.status || 'active'}">${(event.status || 'active').charAt(0).toUpperCase() + (event.status || 'active').slice(1)}</span>
                             </div>
                         </div>
                     </div>
                     <div class="status-selection">
                         <label for="newStatus">Select New Status</label>
                         <select id="newStatus" class="status-select">
                             <option value="active" ${(event.status || 'active') === 'active' ? 'selected' : ''}>Active</option>
                             <option value="ongoing" ${(event.status || 'active') === 'ongoing' ? 'selected' : ''}>Ongoing</option>
                             <option value="completed" ${(event.status || 'active') === 'completed' ? 'selected' : ''}>Completed</option>
                             <option value="inactive" ${(event.status || 'active') === 'inactive' ? 'selected' : ''}>Inactive</option>
                             <option value="cancelled" ${(event.status || 'active') === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                         </select>
                     </div>
                     <div class="modal-actions">
                         <button type="button" class="btn-primary" id="updateStatusBtn">Update Status</button>
                         <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                     </div>
                 </div>
             </div>
         `;
         document.body.appendChild(modal);

         // Handle status update
         const updateBtn = document.getElementById('updateStatusBtn');
         const statusSelect = document.getElementById('newStatus');
         
         updateBtn.addEventListener('click', async () => {
             const newStatus = statusSelect.value;
             if (newStatus === (event.status || 'active')) {
                 this.showNotification('Status is already set to ' + newStatus, 'info');
                 modal.remove();
                 return;
             }

             try {
                 await this.updateEventStatus(event.id, newStatus);
                 this.showNotification(`Event status updated to ${newStatus}`, 'success');
                 modal.remove();
             } catch (error) {
                 console.error('Error updating event status:', error);
                 this.showNotification('Error updating event status', 'error');
             }
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
}

// Global event manager instance
window.eventManager = new EventManager();
