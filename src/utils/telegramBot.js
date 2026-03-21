// Telegram Bot Handler for Hintio
// Processes images received via Telegram and forwards to Hintio for analysis

const https = require('https');
const fs = require('fs');
const path = require('path');

let botToken = null;
let botUserId = null;
let ipcSendCallback = null;
let pollingInterval = null;
let updateOffset = 0;

/**
 * Initialize Telegram bot
 * @param {string} token - Telegram bot token
 * @param {number} userId - Allowed user ID (optional, for security)
 * @param {Function} sendCallback - Callback to send messages to frontend via IPC
 */
function initTelegramBot(token, userId = null, sendCallback = null) {
    if (!token || token.trim().length === 0) {
        console.warn('[Telegram] Bot token not provided, Telegram integration disabled');
        return false;
    }

    botToken = token.trim();
    botUserId = userId;
    ipcSendCallback = sendCallback;

    console.log('[Telegram] Bot initialized with token:', botToken.slice(0, 10) + '...');
    return true;
}

/**
 * Download file from Telegram
 * @param {string} fileId - Telegram file ID
 * @returns {Promise<Buffer>}
 */
async function downloadTelegramFile(fileId) {
    if (!botToken) throw new Error('Telegram bot not initialized');

    return new Promise((resolve, reject) => {
        // Get file info
        const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;

        https.get(fileInfoUrl, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.ok) {
                        reject(new Error(`Telegram API error: ${json.description}`));
                        return;
                    }

                    const filePath = json.result.file_path;
                    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

                    // Download file
                    https.get(downloadUrl, fileRes => {
                        let fileData = '';
                        fileRes.on('data', chunk => { fileData += chunk; });
                        fileRes.on('end', () => {
                            resolve(Buffer.from(fileData, 'binary'));
                        });
                    }).on('error', reject);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Convert buffer to Base64 for Hintio
 * @param {Buffer} buffer
 * @returns {string}
 */
function bufferToBase64(buffer) {
    return buffer.toString('base64');
}

/**
 * Handle incoming Telegram message with photo or text
 * @param {Object} update - Telegram update object
 * @param {Function} onImageReceived - Callback when image is processed
 * @param {Function} onTextReceived - Callback when text is processed
 */
async function handleTelegramUpdate(update, onImageReceived = null, onTextReceived = null) {
    try {
        const message = update.message || update.channel_post;
        if (!message) return;

        // Check user ID if whitelist is set
        if (botUserId && message.from?.id !== botUserId) {
            console.warn('[Telegram] Unauthorized user:', message.from?.id);
            return;
        }

        const telegramMessage = {
            chatId: message.chat?.id,
            messageId: message.message_id,
            userId: message.from?.id,
            timestamp: message.date,
        };

        // Handle photo
        if (message.photo && message.photo.length > 0) {
            // Get largest photo (best quality)
            const photo = message.photo.reduce((prev, current) => {
                return (prev.file_size > current.file_size) ? prev : current;
            });

            console.log(`[Telegram] Processing photo from user ${message.from?.id} (file_id: ${photo.file_id.slice(0, 20)}...)`);

            // Download photo
            const photoBuffer = await downloadTelegramFile(photo.file_id);
            const base64Photo = bufferToBase64(photoBuffer);

            const caption = message.caption || 'Image analysis from Telegram';

            // Trigger callback if provided
            if (onImageReceived) {
                onImageReceived(base64Photo, caption, telegramMessage);
            }

            console.log(`[Telegram] Photo processed successfully, ${Math.round(base64Photo.length / 1024)}KB`);

            return {
                success: true,
                type: 'image',
                base64: base64Photo,
                caption: caption,
                metadata: telegramMessage,
            };
        }

        // Handle text
        if (message.text) {
            const text = message.text.trim();
            console.log(`[Telegram] Processing text from user ${message.from?.id}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`);

            // Trigger callback if provided
            if (onTextReceived) {
                onTextReceived(text, telegramMessage);
            }

            return {
                success: true,
                type: 'text',
                text: text,
                metadata: telegramMessage,
            };
        }

        console.log('[Telegram] No photo or text in update, skipping');
        return { success: false, error: 'No photo or text content' };
    } catch (error) {
        console.error('[Telegram] Error handling update:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send message to Telegram chat
 * @param {number} chatId
 * @param {string} text
 */
async function sendTelegramMessage(chatId, text) {
    if (!botToken) return false;

    return new Promise((resolve, reject) => {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const postData = JSON.stringify({
            chat_id: chatId,
            text: text.slice(0, 4096), // Telegram limits to 4096 chars
            parse_mode: 'HTML',
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        https.request(url, options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.ok);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject).end(postData);
    });
}

/**
 * Poll Telegram for new messages
 * @param {Function} onImageReceived - Callback for images
 * @param {Function} onTextReceived - Callback for text
 */
async function pollTelegramUpdates(onImageReceived = null, onTextReceived = null) {
    if (!botToken) {
        console.warn('[Telegram] Bot not initialized, skipping poll');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${updateOffset}&timeout=5`;

        https.get(url, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', async () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.ok) {
                        console.error('[Telegram] Poll error:', json.description);
                        return;
                    }

                    const updates = json.result || [];
                    if (updates.length > 0) {
                        console.log('[Telegram] Received', updates.length, 'update(s)');

                        for (const update of updates) {
                            await handleTelegramUpdate(update, onImageReceived, onTextReceived);
                            updateOffset = Math.max(updateOffset, update.update_id + 1);
                        }
                    }
                } catch (error) {
                    console.error('[Telegram] Poll parse error:', error.message);
                }
            });
        }).on('error', error => {
            console.error('[Telegram] Poll request error:', error.message);
        });
    } catch (error) {
        console.error('[Telegram] Poll error:', error.message);
    }
}

/**
 * Start polling for Telegram updates
 * @param {number} pollIntervalMs - Polling interval in milliseconds (default 2000)
 * @param {Function} onImageReceived - Callback for images
 * @param {Function} onTextReceived - Callback for text
 */
function startPolling(pollIntervalMs = 2000, onImageReceived = null, onTextReceived = null) {
    if (!botToken) {
        console.warn('[Telegram] Bot not initialized, cannot start polling');
        return false;
    }

    if (pollingInterval) {
        console.log('[Telegram] Polling already running');
        return false;
    }

    console.log(`[Telegram] ✓ Starting polling with ${pollIntervalMs}ms interval`);

    pollingInterval = setInterval(() => {
        pollTelegramUpdates(onImageReceived, onTextReceived);
    }, pollIntervalMs);

    // Initial poll
    pollTelegramUpdates(onImageReceived, onTextReceived);

    return true;
}

/**
 * Stop polling for Telegram updates
 */
function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('[Telegram] Polling stopped');
        return true;
    }
    return false;
}

module.exports = {
    initTelegramBot,
    handleTelegramUpdate,
    sendTelegramMessage,
    downloadTelegramFile,
    bufferToBase64,
    startPolling,
    stopPolling,
};
