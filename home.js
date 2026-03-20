const GROUP_ID = 12513;
const API_BASE = 'https://api.wiseoldman.net/v2';

document.addEventListener('DOMContentLoaded', () => {
    loadMemberCount();
    loadEvents();
    setupNav();
    setupSmoothScroll();
});

// Fetch member count for hero
async function loadMemberCount() {
    try {
        const response = await fetch(`${API_BASE}/groups/${GROUP_ID}`);
        if (!response.ok) return;
        const data = await response.json();
        document.getElementById('hero-member-count').textContent = data.memberCount;
    } catch (e) {
        document.getElementById('hero-member-count').textContent = '220+';
    }
}

// Fetch upcoming/active competitions from WOM
async function loadEvents() {
    const grid = document.getElementById('events-grid');

    try {
        const response = await fetch(`${API_BASE}/groups/${GROUP_ID}/competitions`);
        if (!response.ok) throw new Error('Failed to load events');
        const competitions = await response.json();

        const now = new Date();

        // Split into active and upcoming
        const active = competitions.filter(c => new Date(c.startsAt) <= now && new Date(c.endsAt) > now);
        const upcoming = competitions.filter(c => new Date(c.startsAt) > now);
        // Recent past (ended within last 7 days)
        const recentPast = competitions
            .filter(c => {
                const ended = new Date(c.endsAt);
                return ended <= now && (now - ended) < 7 * 24 * 60 * 60 * 1000;
            })
            .slice(0, 3);

        const allEvents = [
            ...active.map(c => ({ ...c, status: 'active' })),
            ...upcoming.slice(0, 5).map(c => ({ ...c, status: 'upcoming' })),
            ...recentPast.map(c => ({ ...c, status: 'ended' }))
        ];

        if (allEvents.length === 0) {
            grid.innerHTML = `
                <div class="events-empty">
                    <p>No upcoming events right now. Check back soon!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = allEvents.map(event => {
            const start = new Date(event.startsAt);
            const end = new Date(event.endsAt);
            const metric = formatMetric(event.metric);

            let statusBadge = '';
            let timeInfo = '';

            if (event.status === 'active') {
                statusBadge = '<span class="event-badge event-badge-active">Active Now</span>';
                timeInfo = `Ends ${formatRelativeTime(end)}`;
            } else if (event.status === 'upcoming') {
                statusBadge = '<span class="event-badge event-badge-upcoming">Upcoming</span>';
                timeInfo = `Starts ${formatRelativeTime(start)}`;
            } else {
                statusBadge = '<span class="event-badge event-badge-ended">Recently Ended</span>';
                timeInfo = `Ended ${formatRelativeTime(end)}`;
            }

            return `
                <div class="event-card event-card-${event.status}">
                    <div class="event-header">
                        ${statusBadge}
                        <span class="event-metric">${metric}</span>
                    </div>
                    <h3 class="event-title">${escapeHtml(event.title)}</h3>
                    <div class="event-details">
                        <span class="event-time">${timeInfo}</span>
                        <span class="event-dates">${formatDate(start)} — ${formatDate(end)}</span>
                        <span class="event-participants">${event.participantCount} participants</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        grid.innerHTML = `
            <div class="events-empty">
                <p>Couldn't load events right now. Check our <a href="https://wiseoldman.net/groups/12513/competitions" target="_blank" rel="noopener">Wise Old Man page</a>.</p>
            </div>
        `;
    }
}

// Mobile nav toggle
function setupNav() {
    const toggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav');

    toggle.addEventListener('click', () => {
        nav.classList.toggle('nav-open');
    });

    // Close mobile nav when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('nav-open');
        });
    });

    // Shrink nav on scroll
    window.addEventListener('scroll', () => {
        nav.classList.toggle('nav-scrolled', window.scrollY > 50);
    });
}

// Smooth scroll for anchor links
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
        link.addEventListener('click', (e) => {
            const target = document.querySelector(link.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// Helpers
function formatMetric(metric) {
    if (!metric) return '';
    return metric.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeTime(date) {
    const now = new Date();
    const diff = date - now;
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (diff > 0) {
        // Future
        if (days > 0) return `in ${days}d`;
        if (hours > 0) return `in ${hours}h`;
        return 'soon';
    } else {
        // Past
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        return 'just now';
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
