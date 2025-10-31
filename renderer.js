const GROUP_ID = 12513;
const API_BASE = 'https://api.wiseoldman.net/v2';

// Initialize Supabase client
const SUPABASE_URL = 'https://erhjgzqmhwetbxyrxsro.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyaGpnenFtaHdldGJ4eXJ4c3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2ODA2NjcsImV4cCI6MjA3NzI1NjY2N30.2GXUD7l5zSAbO_mhkvSUaQUbDfWYdy_R1RYPvisB_zI';
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let clanData = null;
let filteredMembers = [];
let ogMembers = new Set(); // Store player IDs of OG members
let ogBonusMonths = 2; // Default bonus months for OG members
let manualJoinDates = {}; // Store player ID -> custom join date mappings

// Load settings from Supabase
async function loadSettings() {
    try {
        const { data, error } = await supabase
            .from('clan_settings')
            .select('key, value');

        if (error) throw error;

        data.forEach(setting => {
            if (setting.key === 'og_members') {
                ogMembers = new Set(setting.value);
            } else if (setting.key === 'og_bonus_months') {
                ogBonusMonths = parseInt(setting.value);
            } else if (setting.key === 'manual_join_dates') {
                manualJoinDates = setting.value;
            }
        });
    } catch (error) {
        console.error('Error loading settings from Supabase:', error);
        // Fall back to localStorage if Supabase fails
        const savedOgMembers = localStorage.getItem('ogMembers');
        if (savedOgMembers) {
            ogMembers = new Set(JSON.parse(savedOgMembers));
        }
        const savedBonusMonths = localStorage.getItem('ogBonusMonths');
        if (savedBonusMonths) {
            ogBonusMonths = parseInt(savedBonusMonths);
        }
        const savedJoinDates = localStorage.getItem('manualJoinDates');
        if (savedJoinDates) {
            manualJoinDates = JSON.parse(savedJoinDates);
        }
    }
}

// Save settings to Supabase
async function saveSettings() {
    try {
        // Save OG members
        await supabase
            .from('clan_settings')
            .upsert({
                key: 'og_members',
                value: [...ogMembers],
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        // Save OG bonus months
        await supabase
            .from('clan_settings')
            .upsert({
                key: 'og_bonus_months',
                value: ogBonusMonths,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        // Save manual join dates
        await supabase
            .from('clan_settings')
            .upsert({
                key: 'manual_join_dates',
                value: manualJoinDates,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        // Also save to localStorage as backup
        localStorage.setItem('ogMembers', JSON.stringify([...ogMembers]));
        localStorage.setItem('ogBonusMonths', ogBonusMonths.toString());
        localStorage.setItem('manualJoinDates', JSON.stringify(manualJoinDates));
    } catch (error) {
        console.error('Error saving settings to Supabase:', error);
        alert('Failed to sync settings to cloud. Changes saved locally only.');
    }
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

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    loadClanData();

    // Set OG bonus input value
    document.getElementById('og-bonus-months').value = ogBonusMonths;
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
    document.getElementById('sort-by').addEventListener('change', filterMembers);

    // Gains
    document.getElementById('load-gains').addEventListener('click', loadGains);

    // Hiscores
    document.getElementById('load-hiscores').addEventListener('click', loadHiscores);

    // Settings modal
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettingsModal);
    document.getElementById('add-bulk-og').addEventListener('click', addBulkOgMembers);
    document.getElementById('remove-all-og').addEventListener('click', removeAllOgMembers);
    document.getElementById('apply-og-date').addEventListener('click', applyOgJoinDate);

    // Close modal on background click
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            closeSettings();
        }
    });
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
        const response = await fetch(`${API_BASE}/groups/${GROUP_ID}`, {
            headers: {
                'User-Agent': 'GnomercyzClanTool/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        clanData = await response.json();

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
    const sortBy = document.getElementById('sort-by').value;

    filteredMembers = clanData.memberships.filter(member => {
        const matchesSearch = member.player.username.toLowerCase().includes(searchTerm);
        const matchesRole = !roleFilter || member.role === roleFilter;
        return matchesSearch && matchesRole;
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
        const ogButtonText = isOg ? 'Remove OG' : 'Make OG';
        const ogButtonClass = isOg ? 'og-toggle-btn active' : 'og-toggle-btn';

        // Check if join date has been manually set
        const joinDate = getJoinDate(player.id, member.createdAt);
        const isManualDate = manualJoinDates.hasOwnProperty(player.id);
        const dateBadge = isManualDate ? '<span class="manual-date-badge">📅</span>' : '';

        return `
            <div class="member-card">
                <div>
                    <div class="member-name">${player.displayName}${ogBadge}${dateBadge}</div>
                    <div class="member-role">${formatRole(member.role)}</div>
                    <div class="member-type">${formatAccountType(player.type)} | ${formatBuild(player.build)}</div>
                    <div style="display: flex; gap: 5px; margin-top: 8px;">
                        <button class="${ogButtonClass}" onclick="toggleOgMember(${player.id})">${ogButtonText}</button>
                        <button class="edit-date-btn" onclick="editJoinDate(${player.id}, '${player.displayName}', '${member.createdAt}')">📅 Edit Date</button>
                    </div>
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
            `${API_BASE}/groups/${GROUP_ID}/gained?metric=${metric}&period=${period}&limit=50`,
            {
                headers: { 'User-Agent': 'GnomercyzClanTool/1.0' }
            }
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
            `${API_BASE}/groups/${GROUP_ID}/hiscores?metric=${metric}&limit=50`,
            {
                headers: { 'User-Agent': 'GnomercyzClanTool/1.0' }
            }
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
            `${API_BASE}/groups/${GROUP_ID}/statistics`,
            {
                headers: { 'User-Agent': 'GnomercyzClanTool/1.0' }
            }
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

// Settings modal functions
function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettingsModal() {
    ogBonusMonths = parseInt(document.getElementById('og-bonus-months').value);
    saveSettings();
    closeSettings();

    // Refresh displays if we're on the promotions tab
    if (clanData) {
        displayPromotions();
    }
}

// Join Date Management functions
function getJoinDate(playerId, apiJoinDate) {
    // Return manual date if set, otherwise return API date
    if (manualJoinDates.hasOwnProperty(playerId)) {
        return manualJoinDates[playerId];
    }
    return apiJoinDate;
}

window.editJoinDate = function(playerId, playerName, currentDate) {
    const currentJoinDate = getJoinDate(playerId, currentDate);
    const dateObj = new Date(currentJoinDate);
    const formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format

    const newDate = prompt(
        `Edit join date for ${playerName}\n\nCurrent: ${dateObj.toLocaleDateString()}\n\nEnter new date (YYYY-MM-DD):`,
        formattedDate
    );

    if (newDate === null) {
        return; // User cancelled
    }

    if (newDate === '') {
        // Remove manual override, revert to API date
        if (manualJoinDates.hasOwnProperty(playerId)) {
            delete manualJoinDates[playerId];
            saveSettings();
            displayMembers();
            if (clanData) {
                displayPromotions();
            }
            alert(`✓ Reverted ${playerName}'s join date to Wise Old Man date.`);
        }
        return;
    }

    // Validate date
    const parsedDate = new Date(newDate);
    if (isNaN(parsedDate.getTime())) {
        alert('Invalid date format! Please use YYYY-MM-DD (e.g., 2024-06-15)');
        return;
    }

    // Save the manual date
    manualJoinDates[playerId] = parsedDate.toISOString();
    saveSettings();
    displayMembers();

    if (clanData) {
        displayPromotions();
    }

    alert(`✓ Updated ${playerName}'s join date to ${parsedDate.toLocaleDateString()}\n\nThis will override the Wise Old Man date permanently.`);
}

// OG Member functions
window.toggleOgMember = function(playerId) {
    if (ogMembers.has(playerId)) {
        ogMembers.delete(playerId);
    } else {
        ogMembers.add(playerId);
    }
    saveSettings();
    displayMembers();

    // Refresh promotions if on that tab
    if (clanData) {
        displayPromotions();
    }
}

function addBulkOgMembers() {
    if (!clanData || !clanData.memberships) {
        alert('Please wait for clan data to load first!');
        return;
    }

    const textarea = document.getElementById('og-usernames');
    const input = textarea.value.trim();

    if (!input) {
        alert('Please enter usernames to add as OG members.');
        return;
    }

    // Parse usernames - handle both newlines and commas
    const usernames = input
        .split(/[\n,]+/)
        .map(name => name.trim().toLowerCase())
        .filter(name => name.length > 0);

    let addedCount = 0;
    let notFoundCount = 0;
    const notFound = [];

    // Find and add members
    clanData.memberships.forEach(member => {
        const username = member.player.username.toLowerCase();
        if (usernames.includes(username)) {
            if (!ogMembers.has(member.player.id)) {
                ogMembers.add(member.player.id);
                addedCount++;
            }
        }
    });

    // Check for not found usernames
    usernames.forEach(username => {
        const found = clanData.memberships.some(m =>
            m.player.username.toLowerCase() === username
        );
        if (!found) {
            notFound.push(username);
            notFoundCount++;
        }
    });

    saveSettings();
    displayMembers();
    if (clanData) {
        displayPromotions();
    }

    // Show results
    let message = `✓ Added ${addedCount} new OG members!\nTotal OG members: ${ogMembers.size}`;
    if (notFoundCount > 0) {
        message += `\n\n⚠ ${notFoundCount} usernames not found in clan:\n${notFound.join(', ')}`;
    }
    alert(message);
}

function removeAllOgMembers() {
    if (!confirm('Are you sure you want to remove ALL OG members?')) {
        return;
    }

    const count = ogMembers.size;
    ogMembers.clear();
    saveSettings();
    displayMembers();

    if (clanData) {
        displayPromotions();
    }

    alert(`✓ Removed ${count} OG members.`);
}

function applyOgJoinDate() {
    if (!clanData || !clanData.memberships) {
        alert('Please wait for clan data to load first!');
        return;
    }

    if (ogMembers.size === 0) {
        alert('No OG members found. Please mark some members as OG first.');
        return;
    }

    const dateInput = document.getElementById('og-join-date').value;
    if (!dateInput) {
        alert('Please select a date first.');
        return;
    }

    const selectedDate = new Date(dateInput);
    if (isNaN(selectedDate.getTime())) {
        alert('Invalid date selected.');
        return;
    }

    // Confirm action
    if (!confirm(`Set join date to ${selectedDate.toLocaleDateString()} for all ${ogMembers.size} OG members?`)) {
        return;
    }

    // Apply the date to all OG members
    let updatedCount = 0;
    ogMembers.forEach(playerId => {
        manualJoinDates[playerId] = selectedDate.toISOString();
        updatedCount++;
    });

    saveSettings();
    displayMembers();

    if (clanData) {
        displayPromotions();
    }

    alert(`✓ Set join date for ${updatedCount} OG members to ${selectedDate.toLocaleDateString()}`);
}

// Promotion functions
function calculateMonthsInClan(apiJoinDate, playerId) {
    // Use manual join date if set, otherwise use API date
    const joinDate = getJoinDate(playerId, apiJoinDate);

    const now = new Date();
    const joined = new Date(joinDate);
    const diffTime = Math.abs(now - joined);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    let months = diffDays / 30; // Approximate months

    // Add OG bonus if applicable
    if (ogMembers.has(playerId)) {
        months += ogBonusMonths;
    }

    return months;
}

function getNextPromotion(currentRole, monthsInClan) {
    // Skip if excluded role
    if (EXCLUDED_ROLES.includes(currentRole.toLowerCase())) {
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
                    <span class="promo-time-value">${new Date(member.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="promo-suggested-rank">
                    <div class="promo-arrow">↑</div>
                    <div class="promo-new-rank">${formatRole(promotion.nextRole)}</div>
                </div>
            </div>
        `;
    }).join('');
}
