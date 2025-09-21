class EventManager {
    constructor() {
        this.events = [];
        this.imageObjectUrls = new Map();
        this.eventsUnsubscribe = null;
        this.init();
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
                     <button class="tournament-tab" data-tab="rounds">
                         <i class="fas fa-trophy"></i>
                         Rounds
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
                             <button class="add-participant-btn">
                                 <i class="fas fa-plus"></i>
                                 Add Participant
                             </button>
                         </div>
                         <div class="participants-list" id="participantsList">
                             <!-- Participants will be loaded here -->
                         </div>
                     </div>

                     <div class="tab-panel" id="matchmaking-panel">
                         <div class="matchmaking-header">
                             <h3>Tournament Bracket</h3>
                             <button class="generate-bracket-btn">
                                 <i class="fas fa-magic"></i>
                                 Generate Bracket
                             </button>
                         </div>
                         <div class="bracket-container" id="bracketContainer">
                             <!-- Tournament bracket will be displayed here -->
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

         // Setup add participant button
         const addParticipantBtns = document.querySelectorAll('.add-participant-btn');
         addParticipantBtns.forEach(btn => {
             btn.addEventListener('click', () => {
                 this.showAddParticipantModal();
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

             const participantsList = document.getElementById('participantsList');
             if (!participantsList) return;

             if (Object.keys(participants).length === 0) {
                 participantsList.innerHTML = `
                     <div class="no-participants">
                         <i class="fas fa-users"></i>
                         <p>No participants registered yet</p>
                         <button class="add-participant-btn">
                             <i class="fas fa-plus"></i>
                             Add First Participant
                         </button>
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

             participantsList.innerHTML = Object.entries(participants).map(([id, participant]) => {
                 const userId = participant.userId || id;
                 const userData = userMap[userId];
                 
                 // Use user data from users table if available, fallback to participant data
                 const displayName = userData?.userName || userData?.name || participant.name || participant.userName || 'Unknown Player';
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
                                 <p>ID: ${userId}</p>
                                 ${userEmail ? `<p>Email: ${userEmail}</p>` : ''}
                                 <p>Registered: ${participant.registeredAt ? new Date(participant.registeredAt).toLocaleDateString() : 'Unknown'}</p>
                                 ${participant.status ? `<p>Status: <span class="status-badge status-${participant.status}">${participant.status.charAt(0).toUpperCase() + participant.status.slice(1)}</span></p>` : ''}
                             </div>
                         </div>
                         <div class="participant-actions">
                             <button class="edit-participant-btn" title="Edit" onclick="window.eventManager.editParticipant('${eventId}', '${id}')">
                                 <i class="fas fa-edit"></i>
                             </button>
                             <button class="remove-participant-btn" title="Remove" onclick="window.eventManager.removeParticipant('${eventId}', '${id}')">
                                 <i class="fas fa-trash"></i>
                             </button>
                         </div>
                     </div>
                 `;
             }).join('');

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
             const bracketRef = window.firebaseDatabase.ref(window.database, `TBL_TOURNAMENT_BRACKETS/${eventId}`);
             const snapshot = await window.firebaseDatabase.get(bracketRef);
             const bracketData = snapshot.val();

             const bracketContainer = document.getElementById('bracketContainer');
             if (!bracketContainer) return;

             if (!bracketData) {
                 bracketContainer.innerHTML = `
                     <div class="no-bracket">
                         <i class="fas fa-random"></i>
                         <p>No bracket generated yet</p>
                         <button class="generate-bracket-btn">
                             <i class="fas fa-magic"></i>
                             Generate Bracket
                         </button>
                     </div>
                 `;
                 return;
             }

             // Render bracket visualization
             bracketContainer.innerHTML = this.renderBracket(bracketData);
         } catch (error) {
             console.error('Error loading matchmaking data:', error);
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
             const resultsRef = window.firebaseDatabase.ref(window.database, `TBL_TOURNAMENT_RESULTS/${eventId}`);
             const snapshot = await window.firebaseDatabase.get(resultsRef);
             const results = snapshot.val();

             const resultsContainer = document.getElementById('resultsContainer');
             if (!resultsContainer) return;

             if (!results) {
                 resultsContainer.innerHTML = `
                     <div class="no-results">
                         <i class="fas fa-medal"></i>
                         <p>No results available yet</p>
                         <p>Results will appear here once the tournament is completed</p>
                     </div>
                 `;
                 return;
             }

             // Render results
             resultsContainer.innerHTML = this.renderResults(results);
         } catch (error) {
             console.error('Error loading results data:', error);
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
                 <div class="status-item">
                     <span class="status-label">Capacity:</span>
                     <span class="status-value">${event.capacity || 'Unlimited'}</span>
                 </div>
             </div>
         `;
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
         if (confirm('Are you sure you want to remove this participant from the event?')) {
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
}

// Global event manager instance
window.eventManager = new EventManager();
