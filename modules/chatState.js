const fs = require('fs');
const path = require('path');
const config = require('../config');

const PAUSED_CHATS_PATH = path.join(config.dataDir, 'pausedChats.json');

// Memory store for paused chats [chatId: boolean]
let pausedChats = {};

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
    return !!pausedChats[chatId];
}

/**
 * Pause bot replies for this chat
 * @param {string} chatId 
 */
function pauseChat(chatId) {
    if (!pausedChats[chatId]) {
        pausedChats[chatId] = true;
        savePausedChats();
        console.log(`[ChatState] ⏸️ Bot paused for chat: ${chatId}`);
    }
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
    pauseChat,
    resumeChat,
    markAsBotMessage,
    isRecentBotMessage,
};
