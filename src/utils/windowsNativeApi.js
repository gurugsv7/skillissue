/**
 * Windows Window Management Helper
 * 
 * This module provides methods to ensure Electron windows stay on top
 * of aggressive window managers like Mettl Secure Browser.
 * 
 * It uses Electron APIs with aggressive periodic reassertion
 * to combat z-order manipulation by security-focused browsers.
 */

const process = require('process');

// Only have active implementations on Windows
if (process.platform !== 'win32') {
    module.exports = {
        setWindowAsTopmost: () => false,
        enforceWindowOnTop: () => null,
        forceWindowToFront: () => false,
    };
} else {
    /**
     * Set window as topmost using Electron APIs
     * @param {BrowserWindow} electronWindow - Electron BrowserWindow instance
     * @returns {boolean} Success status
     */
    function setWindowAsTopmost(electronWindow) {
        if (!electronWindow || electronWindow.isDestroyed()) {
            return false;
        }

        try {
            electronWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            return true;
        } catch (error) {
            console.warn('[WindowManager] Error setting window topmost:', error.message);
            return false;
        }
    }

    /**
     * Periodically enforce window topmost status
     * This helps combat aggressive window managers that continuously manipulate z-order
     * 
     * @param {BrowserWindow} electronWindow - Electron BrowserWindow instance
     * @param {number} intervalMs - Interval in milliseconds (default 500ms)
     * @returns {number} Interval ID for cleanup
     */
    function enforceWindowOnTop(electronWindow, intervalMs = 500) {
        if (!electronWindow || electronWindow.isDestroyed()) {
            return null;
        }

        return setInterval(() => {
            if (electronWindow && !electronWindow.isDestroyed() && electronWindow.isVisible()) {
                try {
                    setWindowAsTopmost(electronWindow);
                } catch (error) {
                    console.debug('[WindowManager] Enforcement interval error:', error.message);
                }
            }
        }, intervalMs);
    }

    /**
     * Force window to foreground/focus using Electron APIs
     * @param {BrowserWindow} electronWindow - Electron BrowserWindow instance
     * @returns {boolean} Success status
     */
    function forceWindowToFront(electronWindow) {
        if (!electronWindow || electronWindow.isDestroyed()) {
            return false;
        }

        try {
            // Try to show window and make it visible
            electronWindow.showInactive();
            electronWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            
            // Attempt to focus (may be blocked by Windows focus-stealing prevention)
            try {
                electronWindow.focus();
            } catch (focusError) {
                // Silently ignore focus errors - window might be focused from another process
            }

            return true;
        } catch (error) {
            console.warn('[WindowManager] Error forcing window to front:', error.message);
            return false;
        }
    }

    module.exports = {
        setWindowAsTopmost,
        enforceWindowOnTop,
        forceWindowToFront,
    };
}


