// Load sidebar partial into .sidebar-container and wire up behaviors
(function () {
    function setActiveLink(container) {
        try {
            var path = window.location.pathname;
            var page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
            var links = container.querySelectorAll('.nav-menu .nav-item');
            links.forEach(function (link) {
                link.classList.remove('active');
                var route = link.getAttribute('data-route');
                if (route && route === page) {
                    link.classList.add('active');
                }
            });
        } catch (e) {
            console.error('Error setting active sidebar link:', e);
        }
    }

    function bindSidebarActions(container) {
        // Logout button
        var logoutBtn = container.querySelector('.logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.authManager && typeof window.authManager.logout === 'function') {
                    window.authManager.logout();
                } else if (window.firebaseAuth && window.auth) {
                    // Fallback
                    window.firebaseAuth.signOut(window.auth).then(function () {
                        window.location.href = 'login.html';
                    });
                }
            });
        }
    }

    function loadSidebar() {
        var container = document.querySelector('.sidebar-container');
        if (!container) return;

        // Resolve path to partial relative to current html directory
        var partialUrl = 'partials/sidebar.html';

        fetch(partialUrl, { cache: 'no-cache' })
            .then(function (res) { return res.text(); })
            .then(function (html) {
                container.innerHTML = html;
                setActiveLink(container);
                bindSidebarActions(container);
            })
            .catch(function (err) {
                console.error('Failed to load sidebar:', err);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSidebar);
    } else {
        loadSidebar();
    }
})();


