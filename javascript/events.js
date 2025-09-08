class EventManager {
    constructor() {
        this.events = [];
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
        // Create event button
        const createEventBtn = document.querySelector('.create-event-btn');
        if (createEventBtn) {
            createEventBtn.addEventListener('click', () => {
                this.showAddEventForm();
            });
        }

        // Edit event buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.edit-event-btn')) {
                const eventCard = e.target.closest('.event-card');
                const eventTitle = eventCard.querySelector('.event-card-title').textContent;
                const event = this.events.find(evt => evt.eventName === eventTitle);
                if (event) {
                    this.editEvent(event.id);
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
    }

    async loadEvents() {
        try {
            const snapshot = await window.firebaseDatabase.get(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS'));
            this.events = snapshot.val() ? Object.entries(snapshot.val()).map(([id, data]) => ({
                id,
                ...data
            })) : [];
            
            this.renderEvents();
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

        eventsList.innerHTML = sortedEvents.map(event => {
            const eventDate = event.eventDate ? new Date(event.eventDate) : null;
            const isUpcoming = eventDate && eventDate >= new Date();
            const status = this.getEventStatus(event);
            
            return `
                <div class="event-card">
                    <div class="event-image">
                        <div class="event-image-overlay">
                            <div class="event-banner-text">${event.eventName || 'EVENT'}</div>
                            <div class="event-banner-subtitle">${event.location || 'LOCATION'}</div>
                            <div class="event-prize-text">DATE:</div>
                            <div class="event-prize-value">${eventDate ? eventDate.toLocaleDateString() : 'TBD'}</div>
                        </div>
                    </div>
                    <div class="event-card-content">
                        <h3 class="event-card-title">${event.eventName || 'Unnamed Event'}</h3>
                        <button class="edit-event-btn"><i class="fas fa-edit"></i></button>
                    </div>
                </div>
            `;
        }).join('');
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
