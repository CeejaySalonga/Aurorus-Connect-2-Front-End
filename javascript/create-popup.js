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
        const content = document.createElement('div');
        content.className = 'modal-content';
        overlay.appendChild(content);
        return { overlay, content };
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

    function openPopup(url, fallbackTemplateId) {
        fetch(url, { cache: 'no-cache' })
            .then(function (response) { return response.text(); })
            .then(function (html) {
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const formContainer = temp.querySelector('.form-container');
                if (!formContainer) throw new Error('No form-container in fetched HTML');

                const { overlay, content } = createOverlay();
                content.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
                wireInnerButtons(formContainer, overlay);
            })
            .catch(function () {
                const tpl = document.getElementById(fallbackTemplateId);
                if (!tpl) return;
                const clone = tpl.content.cloneNode(true);
                const formContainer = clone.querySelector('.form-container');
                if (!formContainer) return;
                const { overlay, content } = createOverlay();
                content.appendChild(formContainer);
                document.body.appendChild(overlay);
                document.body.style.overflow = 'hidden';
                wireInnerButtons(formContainer, overlay);
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


