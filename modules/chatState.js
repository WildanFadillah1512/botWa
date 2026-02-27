const fs = require('fs');
const path = require('path');
const config = require('../config');

const PAUSED_CHATS_PATH = path.join(config.dataDir, 'pausedChats.json');

// Memory store for paused chats [chatId: number (timestamp)]
let pausedChats = {};

// 10 minutes in milliseconds
const PAUSE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Load paused chats from file
 */
function loadPausedChats() {
    try {
        if (!fs.existsSync(PAUSED_CHATS_PATH)) {
            pausedChats = {};
            savePausedChats();
            return;
        }
        const raw = fs.readFileSync(PAUSED_CHATS_PATH, 'utf-8');
        pausedChats = JSON.parse(raw);
        console.log(`[ChatState] ✅ Loaded ${Object.keys(pausedChats).length} paused chats`);
    } catch (err) {
        console.error('[ChatState] ❌ Failed to load pausedChats.json:', err.message);
        pausedChats = {};
    }
}

/**
 * Save paused chats to file
 */
function savePausedChats() {
    try {
        fs.writeFileSync(PAUSED_CHATS_PATH, JSON.stringify(pausedChats, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ChatState] ❌ Failed to save pausedChats.json:', err.message);
    }
}

/**
 * Check if a chat is manually paused by the admin
 * @param {string} chatId - WhatsApp Chat ID string (e.g., 628xxx@c.us)
 * @returns {boolean}
 */
function isPaused(chatId) {
    const pauseTime = pausedChats[chatId];
    if (!pauseTime) return false;

    // Handle legacy boolean value or invalid timestamp
    if (pauseTime === true || typeof pauseTime !== 'number') {
        // Automatically convert to current timestamp so it eventually expires
        pausedChats[chatId] = Date.now();
        savePausedChats();
        return true;
    }

    // Check if 10 minutes have passed
    if (Date.now() - pauseTime > PAUSE_TIMEOUT_MS) {
        // Auto-resume
        delete pausedChats[chatId];
        savePausedChats();
        console.log(`[ChatState] 🔄 Auto-resumed chat ${chatId} after 10 minutes of inactivity.`);
        return false;
    }

    return true;
}

/**
 * Pause bot replies for this chat
 * @param {string} chatId 
 */
function pauseChat(chatId) {
    pausedChats[chatId] = Date.now();
    savePausedChats();
    console.log(`[ChatState] ⏸️ Bot paused for chat: ${chatId}`);
}

/**
 * Get the exact timestamp when a chat was last paused
 * @param {string} chatId 
 * @returns {number} Timestamp in ms (or 0 if not paused)
 */
function getLastPauseTime(chatId) {
    const pauseTime = pausedChats[chatId];
    if (typeof pauseTime === 'number') {
        return pauseTime;
    }
    return 0; // Not paused or invalid timestamp
}

/**
 * Resume bot replies for this chat
 * @param {string} chatId 
 */
function resumeChat(chatId) {
    if (pausedChats[chatId]) {
        delete pausedChats[chatId];
        savePausedChats();
        console.log(`[ChatState] ▶️ Bot resumed for chat: ${chatId}`);
    }
}

// Initialize on require
loadPausedChats();

// Memory store for recent bot messages (anti-pause logic)
const recentBotMessages = new Set();

function markAsBotMessage(text) {
    recentBotMessages.add(text);
    setTimeout(() => recentBotMessages.delete(text), 15000); // 15 seconds allow for network delay
}

function isRecentBotMessage(text) {
    return recentBotMessages.has(text);
}

module.exports = {
    isPaused,
    getLastPauseTime,
    pauseChat,
    resumeChat,
    markAsBotMessage,
    isRecentBotMessage,
};
