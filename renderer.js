const GROUP_ID = 12513;
const API_BASE = 'https://api.wiseoldman.net/v2';

let clanData = null;
let filteredMembers = [];
let ogMembers = new Set(); // Store player IDs of OG members
let ogMemberUsernames = []; // Store usernames from data.json
let ogJoinDate = '2025-04-04'; // Default OG join date
let manualJoinDates = {}; // Store player ID -> custom join date mappings

// Load settings from data.json (deployed with the site)
async function loadSettings() {
    try {
        const response = await fetch('./data.json');
        if (response.ok) {
            const data = await response.json();
            ogMemberUsernames = data.ogMembers || [];
            ogJoinDate = data.ogJoinDate || '2025-04-04';
            manualJoinDates = data.manualJoinDates || {};
        }
    } catch (error) {
        console.log('Could not load data.json, using defaults');
    }
}

// Convert usernames to player IDs after clan data loads
function resolveOgMemberIds() {
    if (!clanData || !clanData.memberships) return;

    ogMembers.clear();
    ogMemberUsernames.forEach(username => {
        const member = clanData.memberships.find(m =>
            m.player.username.toLowerCase() === username.toLowerCase()
        );
        if (member) {
            ogMembers.add(member.player.id);
        }
    });
}

// Promotion rules based on time in clan
const PROMOTION_RULES = [
    { role: 'squire', minMonths: 0, nextRole: 'duellist', displayName: 'Newbie → Squire' },
    { role: 'duellist', minMonths: 1, nextRole: 'striker', displayName: '1 Month → Duellist' },
    { role: 'striker', minMonths: 2, nextRole: 'ninja', displayName: '2 Months → Striker' },
    { role: 'ninja', minMonths: 3, nextRole: 'inquisitor', displayName: '3 Months → Ninja' },
    { role: 'inquisitor', minMonths: 6, nextRole: 'expert', displayName: '6 Months → Inquisitor' },
    { role: 'expert', minMonths: 9, nextRole: 'knight', displayName: '9 Months → Expert' },
    { role: 'knight', minMonths: 12, nextRole: 'paladin', displayName: '1 Year → Knight' },
    { role: 'paladin', minMonths: 18, nextRole: null, displayName: '1.5 Years → Paladin' }
];

// Roles that are excluded from auto-promotion (leadership/special roles)
const EXCLUDED_ROLES = ['owner', 'deputy_owner', 'marshal', 'admiral', 'maxed', 'colonel', 'slayer', 'hellcat', 'bob', 'justiciar', 'competitor', 'sheriff'];

// Only these ranks are eligible for promotion tracking (knight and paladin are excluded as they're special/end-game ranks)
const PROMOTABLE_RANKS = ['squire', 'duellist', 'striker', 'ninja', 'inquisitor', 'expert'];

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    loadClanData();
});

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', loadClanData);

    // Member filters
    document.getElementById('search').addEventListener('input', filterMembers);
    document.getElementById('role-filter').addEventListener('change', filterMembers);
    document.getElementById('og-filter').addEventListener('change', filterMembers);
    document.getElementById('sort-by').addEventListener('change', filterMembers);

    // Gains
    document.getElementById('load-gains').addEventListener('click', loadGains);

    // Hiscores
    document.getElementById('load-hiscores').addEventListener('click', loadHiscores);
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    // Load data for specific tabs
    if (tabName === 'stats' && clanData) {
        loadClanStats();
    } else if (tabName === 'promotions' && clanData) {
        displayPromotions();
    }
}

async function loadClanData() {
    showLoading(true);
    hideError();

    try {
        const response = await fetch(`${API_BASE}/groups/${GROUP_ID}`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        clanData = await response.json();

        // Resolve OG member usernames to IDs
        resolveOgMemberIds();

        // Update UI
        updateMemberCount();
        populateRoleFilter();
        displayMembers();

        showLoading(false);
    } catch (error) {
        showError(`Failed to load clan data: ${error.message}`);
        showLoading(false);
    }
}

function updateMemberCount() {
    const countEl = document.getElementById('member-count');
    countEl.textContent = `${clanData.memberCount} Members`;
}

function populateRoleFilter() {
    const roleFilter = document.getElementById('role-filter');
    const roles = [...new Set(clanData.memberships.map(m => m.role))].sort();

    roleFilter.innerHTML = '<option value="">All Roles</option>';
    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = formatRole(role);
        roleFilter.appendChild(option);
    });
}

function filterMembers() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const roleFilter = document.getElementById('role-filter').value;
    const ogFilter = document.getElementById('og-filter').value;
    const sortBy = document.getElementById('sort-by').value;

    filteredMembers = clanData.memberships.filter(member => {
        const matchesSearch = member.player.username.toLowerCase().includes(searchTerm);
        const matchesRole = !roleFilter || member.role === roleFilter;
        const isOg = ogMembers.has(member.player.id);
        const matchesOgFilter = !ogFilter ||
            (ogFilter === 'og' && isOg) ||
            (ogFilter === 'non-og' && !isOg);
        return matchesSearch && matchesRole && matchesOgFilter;
    });

    // Sort
    filteredMembers.sort((a, b) => {
        switch (sortBy) {
            case 'username':
                return a.player.username.localeCompare(b.player.username);
            case 'exp':
                return b.player.exp - a.player.exp;
            case 'ehp':
                return b.player.ehp - a.player.ehp;
            case 'ehb':
                return b.player.ehb - a.player.ehb;
            default:
                return 0;
        }
    });

    displayMembers();
}

function displayMembers() {
    const membersList = document.getElementById('members-list');
    const members = filteredMembers.length > 0 ? filteredMembers : clanData.memberships;

    membersList.innerHTML = members.map(member => {
        const player = member.player;
        const isOg = ogMembers.has(player.id);
        const ogBadge = isOg ? '<span class="og-badge">OG</span>' : '';
        const joinDate = getJoinDate(player.id, member.createdAt);

        return `
            <div class="member-card">
                <div>
                    <div class="member-name">${player.displayName}${ogBadge}</div>
                    <div class="member-role">${formatRole(member.role)}</div>
                    <div class="member-type">${formatAccountType(player.type)} | ${formatBuild(player.build)}</div>
                </div>
                <div class="member-stat">
                    <span class="stat-label">Joined</span>
                    <span class="stat-value">${new Date(joinDate).toLocaleDateString()}</span>
                </div>
                <div class="member-stat">
                    <span class="stat-label">Total XP</span>
                    <span class="stat-value">${formatNumber(player.exp)}</span>
                </div>
                <div class="member-stat">
                    <span class="stat-label">EHP</span>
                    <span class="stat-value">${player.ehp.toFixed(1)}</span>
                </div>
                <div class="member-stat">
                    <span class="stat-label">EHB</span>
                    <span class="stat-value">${player.ehb.toFixed(1)}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function loadGains() {
    const metric = document.getElementById('gains-metric').value;
    const period = document.getElementById('gains-period').value;
    const gainsList = document.getElementById('gains-list');

    gainsList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch(
            `${API_BASE}/groups/${GROUP_ID}/gained?metric=${metric}&period=${period}&limit=50`
        );

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const gains = await response.json();

        gainsList.innerHTML = gains.map((entry, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            return `
                <div class="gain-card">
                    <div class="rank ${rankClass}">#${index + 1}</div>
                    <div>
                        <div class="member-name">${entry.player.displayName}</div>
                        <div class="member-type">${formatAccountType(entry.player.type)}</div>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">Gained</span>
                        <span class="gain-amount">+${formatNumber(entry.gained)}</span>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">Start → End</span>
                        <span class="stat-value">${formatNumber(entry.data.start.value)} → ${formatNumber(entry.data.end.value)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        gainsList.innerHTML = `<div class="error">Failed to load gains: ${error.message}</div>`;
    }
}

async function loadHiscores() {
    const metric = document.getElementById('hiscores-metric').value;
    const hiscoresList = document.getElementById('hiscores-list');

    hiscoresList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch(
            `${API_BASE}/groups/${GROUP_ID}/hiscores?metric=${metric}&limit=50`
        );

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const hiscores = await response.json();

        hiscoresList.innerHTML = hiscores.map((entry, index) => {
            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            return `
                <div class="hiscore-card">
                    <div class="rank ${rankClass}">#${index + 1}</div>
                    <div>
                        <div class="member-name">${entry.player.displayName}</div>
                        <div class="member-type">${formatAccountType(entry.player.type)}</div>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">Level</span>
                        <span class="stat-value">${entry.data.level}</span>
                    </div>
                    <div class="member-stat">
                        <span class="stat-label">Experience</span>
                        <span class="stat-value">${formatNumber(entry.data.experience)}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        hiscoresList.innerHTML = `<div class="error">Failed to load hiscores: ${error.message}</div>`;
    }
}

async function loadClanStats() {
    const statsContainer = document.getElementById('clan-stats');

    try {
        const response = await fetch(
            `${API_BASE}/groups/${GROUP_ID}/statistics`
        );

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const stats = await response.json();

        statsContainer.innerHTML = `
            <div class="stat-box">
                <h3>Total Members</h3>
                <div class="big-number">${clanData.memberCount}</div>
            </div>
            <div class="stat-box">
                <h3>Maxed Players</h3>
                <div class="big-number">${stats.maxedCombatCount || 0}</div>
            </div>
            <div class="stat-box">
                <h3>Total Clan XP</h3>
                <div class="big-number">${formatNumber(clanData.memberships.reduce((sum, m) => sum + m.player.exp, 0))}</div>
            </div>
            <div class="stat-box">
                <h3>Average XP per Member</h3>
                <div class="big-number">${formatNumber(Math.floor(clanData.memberships.reduce((sum, m) => sum + m.player.exp, 0) / clanData.memberCount))}</div>
            </div>
            <div class="stat-box">
                <h3>Total EHP</h3>
                <div class="big-number">${formatNumber(Math.floor(clanData.memberships.reduce((sum, m) => sum + m.player.ehp, 0)))}</div>
            </div>
            <div class="stat-box">
                <h3>Total EHB</h3>
                <div class="big-number">${formatNumber(Math.floor(clanData.memberships.reduce((sum, m) => sum + m.player.ehb, 0)))}</div>
            </div>
        `;
    } catch (error) {
        statsContainer.innerHTML = `<div class="error">Failed to load statistics: ${error.message}</div>`;
    }
}

// Utility functions
function formatRole(role) {
    return role.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function formatAccountType(type) {
    const types = {
        'regular': 'Main',
        'ironman': 'Ironman',
        'hardcore': 'HCIM',
        'ultimate': 'UIM',
        'unknown': 'Unknown'
    };
    return types[type] || type;
}

function formatBuild(build) {
    const builds = {
        'main': 'Main',
        'def1': '1 Def',
        'f2p': 'F2P',
        'lvl3': 'Lvl 3',
        'zerker': 'Zerker'
    };
    return builds[build] || build;
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showError(message) {
    const error = document.getElementById('error');
    error.textContent = message;
    error.classList.remove('hidden');
}

function hideError() {
    const error = document.getElementById('error');
    error.classList.add('hidden');
}

// Join Date Management functions
function getJoinDate(playerId, apiJoinDate) {
    // If player is OG, return OG join date (unless manually overridden)
    if (ogMembers.has(playerId)) {
        // Check if there's a manual override
        if (manualJoinDates.hasOwnProperty(playerId)) {
            return manualJoinDates[playerId];
        }
        // Return the OG join date
        return new Date(ogJoinDate).toISOString();
    }
    // Return manual date if set, otherwise return API date
    if (manualJoinDates.hasOwnProperty(playerId)) {
        return manualJoinDates[playerId];
    }
    return apiJoinDate;
}

// Promotion functions
function calculateMonthsInClan(apiJoinDate, playerId) {
    // Use getJoinDate which handles OG members automatically
    const joinDate = getJoinDate(playerId, apiJoinDate);

    const now = new Date();
    const joined = new Date(joinDate);
    const diffTime = Math.abs(now - joined);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let months = diffDays / 30; // Approximate months

    return months;
}

function getNextPromotion(currentRole, monthsInClan) {
    // Skip if excluded role
    if (EXCLUDED_ROLES.includes(currentRole.toLowerCase())) {
        return null;
    }

    // Only show promotions for members with promotable ranks (excludes knight, paladin, and special ranks)
    if (!PROMOTABLE_RANKS.includes(currentRole.toLowerCase())) {
        return null;
    }

    // Find the current role in promotion rules
    const currentRuleIndex = PROMOTION_RULES.findIndex(rule => rule.role === currentRole.toLowerCase());

    if (currentRuleIndex === -1) {
        // Role not in promotion path, might be a newbie without rank
        // Check if they qualify for squire
        if (monthsInClan >= 0) {
            return {
                nextRole: 'squire',
                requiredMonths: 0,
                currentMonths: monthsInClan
            };
        }
        return null;
    }

    // Check if there's a next role
    const currentRule = PROMOTION_RULES[currentRuleIndex];
    if (!currentRule.nextRole) {
        return null; // Already at max promotion level
    }

    // Find the next promotion
    const nextRule = PROMOTION_RULES.find(rule => rule.role === currentRule.nextRole);

    if (!nextRule) {
        return null;
    }

    // Check if they meet the time requirement
    if (monthsInClan >= nextRule.minMonths) {
        return {
            nextRole: nextRule.role,
            requiredMonths: nextRule.minMonths,
            currentMonths: monthsInClan
        };
    }

    return null;
}

function displayPromotions() {
    const promotionsList = document.getElementById('promotions-list');

    if (!clanData || !clanData.memberships) {
        promotionsList.innerHTML = '<p>No data available</p>';
        return;
    }

    const membersNeedingPromotion = [];

    clanData.memberships.forEach(member => {
        const monthsInClan = calculateMonthsInClan(member.createdAt, member.player.id);
        const promotion = getNextPromotion(member.role, monthsInClan);

        if (promotion) {
            membersNeedingPromotion.push({
                member,
                promotion,
                monthsInClan
            });
        }
    });

    if (membersNeedingPromotion.length === 0) {
        promotionsList.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #a5d6a7;">
                <h3>No promotions needed!</h3>
                <p style="margin-top: 10px; opacity: 0.8;">All eligible members are at their appropriate rank.</p>
            </div>
        `;
        return;
    }

    // Sort by months in clan (descending)
    membersNeedingPromotion.sort((a, b) => b.monthsInClan - a.monthsInClan);

    promotionsList.innerHTML = membersNeedingPromotion.map(({ member, promotion, monthsInClan }) => {
        const monthsDisplay = monthsInClan.toFixed(1);
        const yearsMonths = monthsInClan >= 12
            ? `${Math.floor(monthsInClan / 12)}y ${Math.floor(monthsInClan % 12)}m`
            : `${Math.floor(monthsInClan)}m`;

        const isOg = ogMembers.has(member.player.id);
        const ogBadge = isOg ? '<span class="og-badge">OG</span>' : '';

        return `
            <div class="promotion-card">
                <div class="promo-player-info">
                    <div class="promo-player-name">${member.player.displayName}${ogBadge}</div>
                    <div class="promo-current-rank">Current: ${formatRole(member.role)}</div>
                </div>
                <div class="promo-time-info">
                    <span class="promo-time-label">Time in Clan</span>
                    <span class="promo-time-value">${yearsMonths}</span>
                </div>
                <div class="promo-time-info">
                    <span class="promo-time-label">Joined</span>
                    <span class="promo-time-value">${new Date(getJoinDate(member.player.id, member.createdAt)).toLocaleDateString()}</span>
                </div>
                <div class="promo-suggested-rank">
                    <div class="promo-arrow">↑</div>
                    <div class="promo-new-rank">${formatRole(promotion.nextRole)}</div>
                </div>
            </div>
        `;
    }).join('');
}
