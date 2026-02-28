/* =========================================
   NOTIFICATION PANEL — iOS-Inspired
   =========================================
   Handles: open/close, filters, mark-read,
   clear-all, badge counter, keyboard nav,
   and sample plant-themed notifications.
   ========================================= */

(function () {
    'use strict';

    /* ---------- Sample Data ---------- */
    const SAMPLE_NOTIFICATIONS = [
        {
            id: 1,
            type: 'alert',
            icon: 'fa-triangle-exclamation',
            title: 'Leaf Spot Detected',
            desc: 'Your Tomato plant may have early blight. Consider applying a fungicide.',
            time: '12m ago',
            read: false,
            category: 'alerts'
        },
        {
            id: 2,
            type: 'success',
            icon: 'fa-circle-check',
            title: 'Streak Maintained!',
            desc: 'You uploaded today\'s progress photo. 7-day streak! 🔥',
            time: '1h ago',
            read: false,
            category: 'alerts'
        },
        {
            id: 3,
            type: 'tip',
            icon: 'fa-lightbulb',
            title: 'Watering Tip',
            desc: 'Most houseplants prefer being slightly under-watered. Let soil dry between watering.',
            time: '2h ago',
            read: false,
            category: 'tips'
        },
        {
            id: 4,
            type: 'reminder',
            icon: 'fa-clock',
            title: 'Time to Water',
            desc: 'Your Chilli pepper plant is due for watering today.',
            time: '3h ago',
            read: true,
            category: 'alerts'
        },
        {
            id: 5,
            type: 'tip',
            icon: 'fa-lightbulb',
            title: 'Sunlight Guide',
            desc: 'Rotate your indoor plants weekly to ensure even growth and prevent leaning.',
            time: '5h ago',
            read: true,
            category: 'tips'
        },
        {
            id: 6,
            type: 'success',
            icon: 'fa-circle-check',
            title: 'New Level Unlocked',
            desc: 'You\'ve completed the Novice section! Intermediate plants are now available.',
            time: '1d ago',
            read: true,
            category: 'alerts'
        },
        {
            id: 7,
            type: 'tip',
            icon: 'fa-lightbulb',
            title: 'Fertilizer Reminder',
            desc: 'Feed your plants every 2 weeks during the growing season for best results.',
            time: '2d ago',
            read: true,
            category: 'tips'
        }
    ];

    let notifications = JSON.parse(JSON.stringify(SAMPLE_NOTIFICATIONS));
    let activeFilter = 'all';

    /* ---------- DOM Ready ---------- */
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        const bellBtn = document.getElementById('notif-bell-btn');
        const overlay = document.getElementById('notif-overlay');
        const panel = document.getElementById('notif-panel');

        if (!bellBtn || !panel) return;

        // Toggle panel
        bellBtn.addEventListener('click', togglePanel);
        overlay.addEventListener('click', closePanel);

        // Close button inside panel
        const closeBtn = document.getElementById('notif-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        // Filter tabs
        document.querySelectorAll('.notif-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeFilter = tab.dataset.filter;
                document.querySelectorAll('.notif-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderNotifications();
            });
        });

        // Clear all
        const clearBtn = document.getElementById('notif-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                notifications = [];
                renderNotifications();
                updateBadge();
            });
        }

        // Keyboard: Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('open')) {
                closePanel();
            }
        });

        // Initial render
        renderNotifications();
        updateBadge();

        // Bell bounce on load if unread
        const unreadCount = notifications.filter(n => !n.read).length;
        if (unreadCount > 0) {
            setTimeout(() => {
                bellBtn.classList.add('bounce');
                bellBtn.addEventListener('animationend', () => {
                    bellBtn.classList.remove('bounce');
                }, { once: true });
            }, 1000);
        }
    }

    /* ---------- Panel Toggle ---------- */
    function togglePanel() {
        const panel = document.getElementById('notif-panel');
        if (panel.classList.contains('open')) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function openPanel() {
        const panel = document.getElementById('notif-panel');
        const overlay = document.getElementById('notif-overlay');
        panel.classList.add('open');
        overlay.classList.add('active');
        // Trap focus
        panel.setAttribute('aria-hidden', 'false');
        const firstFocusable = panel.querySelector('button, [tabindex]');
        if (firstFocusable) firstFocusable.focus();
    }

    function closePanel() {
        const panel = document.getElementById('notif-panel');
        const overlay = document.getElementById('notif-overlay');
        panel.classList.remove('open');
        overlay.classList.remove('active');
        panel.setAttribute('aria-hidden', 'true');
        // Return focus to bell
        const bellBtn = document.getElementById('notif-bell-btn');
        if (bellBtn) bellBtn.focus();
    }

    /* ---------- Render ---------- */
    function renderNotifications() {
        const list = document.getElementById('notif-list');
        if (!list) return;

        // Filter
        let filtered = notifications;
        if (activeFilter !== 'all') {
            filtered = notifications.filter(n => n.category === activeFilter);
        }

        // Empty state
        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="notif-empty">
                    <div class="notif-empty-icon">
                        <i class="fa-solid fa-leaf"></i>
                    </div>
                    <div class="notif-empty-title">You're all caught up 🌱</div>
                    <div class="notif-empty-desc">No new notifications right now.</div>
                </div>
            `;
            return;
        }

        // Render cards
        list.innerHTML = filtered.map(n => `
            <div class="notif-card ${n.read ? 'read' : ''} ${!n.read ? 'new-pulse' : ''}"
                 data-id="${n.id}"
                 tabindex="0"
                 role="button"
                 aria-label="${n.title}. ${n.desc}. ${n.time}">
                <div class="notif-icon ${n.type}">
                    <i class="fa-solid ${n.icon}"></i>
                </div>
                <div class="notif-content">
                    <div class="notif-title">${n.title}</div>
                    <div class="notif-desc">${n.desc}</div>
                    <div class="notif-time">${n.time}</div>
                </div>
                ${!n.read ? '<div class="notif-unread-dot" aria-hidden="true"></div>' : ''}
            </div>
        `).join('');

        // Click handlers for mark-as-read
        list.querySelectorAll('.notif-card').forEach(card => {
            card.addEventListener('click', () => markAsRead(card.dataset.id));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    markAsRead(card.dataset.id);
                }
            });
        });
    }

    /* ---------- Actions ---------- */
    function markAsRead(id) {
        const notif = notifications.find(n => n.id === parseInt(id));
        if (notif) {
            notif.read = true;
            renderNotifications();
            updateBadge();
        }
    }

    function updateBadge() {
        const badge = document.getElementById('notif-badge');
        if (!badge) return;
        const unreadCount = notifications.filter(n => !n.read).length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

})();
