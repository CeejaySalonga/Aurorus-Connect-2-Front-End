// Shared modal handler for Create buttons on Products and Events pages
(function () {
    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) {
                document.body.removeChild(overlay);
                document.body.style.overflow = '';
            }
        });
        return { overlay };
    }

    function wireInnerButtons(container, overlay) {
        const backBtn = container.querySelector('.back-btn');
        const clearBtn = container.querySelector('.clear-btn');

        if (backBtn) {
            backBtn.addEventListener('click', function () {
                if (overlay.parentNode) {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                const inputs = container.querySelectorAll('input, textarea, select');
                inputs.forEach(function (el) {
                    if (el.tagName.toLowerCase() === 'select') {
                        el.selectedIndex = 0;
                    } else {
                        el.value = '';
                    }
                });
            });
        }
    }

    function wireImageBase64(container, inputSelector, previewSelector) {
        const fileInput = container.querySelector(inputSelector);
        const preview = container.querySelector(previewSelector);
        if (!fileInput || !preview) return;

        fileInput.addEventListener('change', function () {
            const file = fileInput.files && fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) {
                const dataUrl = e.target && e.target.result ? String(e.target.result) : '';
                container.dataset.imageBase64 = dataUrl;
                // Simple visual preview on the upload area
                preview.style.backgroundImage = dataUrl ? `url(${dataUrl})` : '';
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                preview.style.borderStyle = 'solid';
            };
            reader.readAsDataURL(file);
        });
    }

    function wireCreateEvent(container, overlay) {
        wireImageBase64(container, '#event-image', '.upload-area');

        const confirmBtn = container.querySelector('.confirm-btn');
        if (!confirmBtn) return;
        confirmBtn.addEventListener('click', async function () {
            try {
                const nameEl = container.querySelector('#event-name');
                const dateEl = container.querySelector('#event-date');
                const locationEl = container.querySelector('#event-location');
                const regTimeEl = container.querySelector('#registration-time');
                const tourTimeEl = container.querySelector('#tournament-time');
                const descEl = container.querySelector('#event-description');

                const eventData = {
                    eventName: nameEl ? nameEl.value.trim() : '',
                    eventDate: dateEl ? dateEl.value : '',
                    location: locationEl ? locationEl.value.trim() : '',
                    registrationTime: regTimeEl ? regTimeEl.value : '',
                    tournamentTime: tourTimeEl ? tourTimeEl.value : '',
                    description: descEl ? descEl.value.trim() : '',
                    imageBase64: container.dataset.imageBase64 || null,
                    image: container.dataset.imageBase64 || null,
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString()
                };

                if (!eventData.eventName) {
                    window.eventManager && window.eventManager.showNotification('Event name is required', 'error');
                    return;
                }
                if (!eventData.eventDate) {
                    window.eventManager && window.eventManager.showNotification('Event date is required', 'error');
                    return;
                }

                const newEventRef = window.firebaseDatabase.push(window.firebaseDatabase.ref(window.database, 'TBL_EVENTS'));
                await window.firebaseDatabase.set(newEventRef, eventData);

                window.eventManager && window.eventManager.showNotification('Event added successfully', 'success');
                if (overlay && overlay.parentNode) {
                    document.body.removeChild(overlay);
                    document.body.style.overflow = '';
                }
                window.eventManager && window.eventManager.loadEvents();
            } catch (err) {
                console.error('Error creating event:', err);
                window.eventManager && window.eventManager.showNotification('Error creating event. Please try again.', 'error');
            }
        });
    }

    function openPopup(url, fallbackTemplateId) {
        fetch(url, { cache: 'no-cache' })
            .then(function (response) { return response.text(); })
            .then(function (html) {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) throw new Error('No form-container in fetched HTML');

                const { overlay } = createOverlay();
                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
                wireInnerButtons(formContainer, overlay);
                if (url.indexOf('create-event-popup.html') !== -1) {
                    wireCreateEvent(formContainer, overlay);
                }
            })
            .catch(function () {
                const tpl = document.getElementById(fallbackTemplateId);
                if (!tpl) return;
                const clone = tpl.content.cloneNode(true);
                const formContainer = clone.querySelector('.form-container');
                if (!formContainer) return;
                const { overlay } = createOverlay();
                overlay.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
                wireInnerButtons(formContainer, overlay);
                if (url.indexOf('create-event-popup.html') !== -1) {
                    wireCreateEvent(formContainer, overlay);
                }
            });
    }

    function init() {
        const productBtn = document.querySelector('.create-product-btn');
        if (productBtn) {
            productBtn.addEventListener('click', function () {
                openPopup('create-product-popup.html', 'create-product-popup-template');
            });
        }

        const eventBtn = document.querySelector('.create-event-btn');
        if (eventBtn) {
            eventBtn.addEventListener('click', function () {
                openPopup('create-event-popup.html', 'create-event-popup-template');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();


