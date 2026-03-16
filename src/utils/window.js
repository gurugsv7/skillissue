const { BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('node:path');
const storage = require('../storage');

let mouseEventsIgnored = false;
let currentView = 'main';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 560;
const LIVE_WIDTH = 850;
const LIVE_HEIGHT = 400;

function createWindow(sendToRenderer, providerSessionRef) {
    const visibleMode = false;

    // Default app shell size for navigation pages
    const workArea = screen.getPrimaryDisplay().workAreaSize;
    let windowWidth = Math.min(Math.floor(workArea.width * 0.92), DEFAULT_WIDTH);
    let windowHeight = Math.min(Math.floor(workArea.height * 0.85), DEFAULT_HEIGHT);

    const mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: 840,
        minHeight: 420,
        maxHeight: workArea.height,
        frame: false,
        transparent: !visibleMode,
        hasShadow: visibleMode,
        alwaysOnTop: !visibleMode,
        skipTaskbar: !visibleMode,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // TODO: change to true
            backgroundThrottling: false,
            enableBlinkFeatures: 'GetDisplayMedia',
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: !require('electron').app.isPackaged,
        },
        backgroundColor: visibleMode ? '#0A0A0A' : '#00000000',
    });

    mouseEventsIgnored = false;
    mainWindow.setIgnoreMouseEvents(false);

    const { session, desktopCapturer } = require('electron');
    session.defaultSession.setDisplayMediaRequestHandler(
        (request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
                callback({ video: sources[0], audio: 'loopback' });
            });
        },
        { useSystemPicker: true }
    );

    mainWindow.setResizable(true);
    mainWindow.setContentProtection(!visibleMode);
    mainWindow.setVisibleOnAllWorkspaces(!visibleMode, { visibleOnFullScreen: !visibleMode });

    // Hide from Mission Control on macOS
    if (!visibleMode && process.platform === 'darwin') {
        try {
            mainWindow.setHiddenInMissionControl(true);
        } catch (error) {
            console.warn('Could not hide from Mission Control:', error.message);
        }
    }

    // Center window horizontally and align to top work area
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const x = Math.floor((screenWidth - windowWidth) / 2);
    const y = 0;
    mainWindow.setPosition(x, y);

    if (!visibleMode && process.platform === 'win32') {
        mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // After window is created, initialize keybinds
    mainWindow.webContents.once('dom-ready', () => {
        setTimeout(() => {
            const defaultKeybinds = getDefaultKeybinds();
            let keybinds = defaultKeybinds;

            // Load keybinds from storage
            const savedKeybinds = storage.getKeybinds();
            if (savedKeybinds) {
                keybinds = { ...defaultKeybinds, ...savedKeybinds };
            }

            updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, providerSessionRef);
        }, 150);
    });

    setupWindowIpcHandlers(mainWindow, sendToRenderer, providerSessionRef);

    return mainWindow;
}

function getDefaultKeybinds() {
    const isMac = process.platform === 'darwin';
    return {
        moveUp: isMac ? 'Alt+Up' : 'Ctrl+Up',
        moveDown: isMac ? 'Alt+Down' : 'Ctrl+Down',
        moveLeft: isMac ? 'Alt+Left' : 'Ctrl+Left',
        moveRight: isMac ? 'Alt+Right' : 'Ctrl+Right',
        toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
        toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
        nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
        previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
        nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
        scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
        scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
        dockLeft: isMac ? 'Cmd+Shift+R' : 'Ctrl+Shift+R',
        dockRight: isMac ? 'Cmd+Shift+Q' : 'Ctrl+Shift+Q',
        dockDefault: isMac ? 'Cmd+Shift+T' : 'Ctrl+Shift+T',
        emergencyErase: isMac ? 'Cmd+Shift+X' : 'Ctrl+Shift+X',
    };
}

function updateGlobalShortcuts(keybinds, mainWindow, sendToRenderer, providerSessionRef) {
    console.log('Updating global shortcuts with:', keybinds);

    // Unregister all existing shortcuts
    globalShortcut.unregisterAll();

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const moveIncrement = Math.floor(Math.min(width, height) * 0.1);

    // Register window movement shortcuts
    const movementActions = {
        moveUp: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY - moveIncrement);
        },
        moveDown: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX, currentY + moveIncrement);
        },
        moveLeft: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX - moveIncrement, currentY);
        },
        moveRight: () => {
            if (!mainWindow.isVisible()) return;
            const [currentX, currentY] = mainWindow.getPosition();
            mainWindow.setPosition(currentX + moveIncrement, currentY);
        },
    };

    // Register each movement shortcut
    Object.keys(movementActions).forEach(action => {
        const keybind = keybinds[action];
        if (keybind) {
            try {
                globalShortcut.register(keybind, movementActions[action]);
                console.log(`Registered ${action}: ${keybind}`);
            } catch (error) {
                console.error(`Failed to register ${action} (${keybind}):`, error);
            }
        }
    });

    // Register toggle visibility shortcut
    if (keybinds.toggleVisibility) {
        try {
            globalShortcut.register(keybinds.toggleVisibility, () => {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.showInactive();
                }
            });
            console.log(`Registered toggleVisibility: ${keybinds.toggleVisibility}`);
        } catch (error) {
            console.error(`Failed to register toggleVisibility (${keybinds.toggleVisibility}):`, error);
        }
    }

    // Register toggle click-through shortcut
    if (keybinds.toggleClickThrough) {
        try {
            globalShortcut.register(keybinds.toggleClickThrough, () => {
                if (currentView !== 'assistant') {
                    if (mouseEventsIgnored) {
                        mouseEventsIgnored = false;
                        mainWindow.setIgnoreMouseEvents(false);
                        mainWindow.webContents.send('click-through-toggled', false);
                    }
                    return;
                }

                mouseEventsIgnored = !mouseEventsIgnored;
                if (mouseEventsIgnored) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    console.log('Mouse events ignored');
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                    console.log('Mouse events enabled');
                }
                mainWindow.webContents.send('click-through-toggled', mouseEventsIgnored);
            });
            console.log(`Registered toggleClickThrough: ${keybinds.toggleClickThrough}`);
        } catch (error) {
            console.error(`Failed to register toggleClickThrough (${keybinds.toggleClickThrough}):`, error);
        }
    }

    // Register next step shortcut (either starts session or takes screenshot based on view)
    if (keybinds.nextStep) {
        try {
            globalShortcut.register(keybinds.nextStep, async () => {
                console.log('Next step shortcut triggered');
                try {
                    // Determine the shortcut key format
                    const isMac = process.platform === 'darwin';
                    const shortcutKey = isMac ? 'cmd+enter' : 'ctrl+enter';

                    // Use the new handleShortcut function
                    mainWindow.webContents.executeJavaScript(`
                        hintio.handleShortcut('${shortcutKey}');
                    `);
                } catch (error) {
                    console.error('Error handling next step shortcut:', error);
                }
            });
            console.log(`Registered nextStep: ${keybinds.nextStep}`);
        } catch (error) {
            console.error(`Failed to register nextStep (${keybinds.nextStep}):`, error);
        }
    }

    // Register previous response shortcut
    if (keybinds.previousResponse) {
        try {
            globalShortcut.register(keybinds.previousResponse, () => {
                console.log('Previous response shortcut triggered');
                sendToRenderer('navigate-previous-response');
            });
            console.log(`Registered previousResponse: ${keybinds.previousResponse}`);
        } catch (error) {
            console.error(`Failed to register previousResponse (${keybinds.previousResponse}):`, error);
        }
    }

    // Register next response shortcut
    if (keybinds.nextResponse) {
        try {
            globalShortcut.register(keybinds.nextResponse, () => {
                console.log('Next response shortcut triggered');
                sendToRenderer('navigate-next-response');
            });
            console.log(`Registered nextResponse: ${keybinds.nextResponse}`);
        } catch (error) {
            console.error(`Failed to register nextResponse (${keybinds.nextResponse}):`, error);
        }
    }

    // Register scroll up shortcut
    if (keybinds.scrollUp) {
        try {
            globalShortcut.register(keybinds.scrollUp, () => {
                console.log('Scroll up shortcut triggered');
                sendToRenderer('scroll-response-up');
            });
            console.log(`Registered scrollUp: ${keybinds.scrollUp}`);
        } catch (error) {
            console.error(`Failed to register scrollUp (${keybinds.scrollUp}):`, error);
        }
    }

    // Register scroll down shortcut
    if (keybinds.scrollDown) {
        try {
            globalShortcut.register(keybinds.scrollDown, () => {
                console.log('Scroll down shortcut triggered');
                sendToRenderer('scroll-response-down');
            });
            console.log(`Registered scrollDown: ${keybinds.scrollDown}`);
        } catch (error) {
            console.error(`Failed to register scrollDown (${keybinds.scrollDown}):`, error);
        }
    }

    // Register emergency erase shortcut
    if (keybinds.emergencyErase) {
        try {
            globalShortcut.register(keybinds.emergencyErase, () => {
                console.log('Emergency Erase triggered!');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.hide();

                    if (providerSessionRef.stopSTT) {
                        providerSessionRef.stopSTT();
                        providerSessionRef.stopSTT = null;
                    }
                    if (providerSessionRef.current) {
                        providerSessionRef.current.close();
                        providerSessionRef.current = null;
                    }

                    sendToRenderer('clear-sensitive-data');

                    setTimeout(() => {
                        const { app } = require('electron');
                        app.quit();
                    }, 300);
                }
            });
            console.log(`Registered emergencyErase: ${keybinds.emergencyErase}`);
        } catch (error) {
            console.error(`Failed to register emergencyErase (${keybinds.emergencyErase}):`, error);
        }
    }

    // Register dock-left shortcut (switch to coding + dock left)
    if (keybinds.dockLeft) {
        try {
            globalShortcut.register(keybinds.dockLeft, async () => {
                console.log('Dock-left shortcut triggered');
                try {
                    mainWindow.webContents.executeJavaScript(`
                        hintio.handleShortcut('dock-left');
                    `);
                } catch (error) {
                    console.error('Error handling dock-left shortcut:', error);
                }
            });
            console.log(`Registered dockLeft: ${keybinds.dockLeft}`);
        } catch (error) {
            console.error(`Failed to register dockLeft (${keybinds.dockLeft}):`, error);
        }
    }

    // Register dock-right shortcut
    if (keybinds.dockRight) {
        try {
            globalShortcut.register(keybinds.dockRight, async () => {
                console.log('Dock-right shortcut triggered');
                try {
                    mainWindow.webContents.executeJavaScript(`
                        hintio.handleShortcut('dock-right');
                    `);
                } catch (error) {
                    console.error('Error handling dock-right shortcut:', error);
                }
            });
            console.log(`Registered dockRight: ${keybinds.dockRight}`);
        } catch (error) {
            console.error(`Failed to register dockRight (${keybinds.dockRight}):`, error);
        }
    }

    // Register dock-default shortcut
    if (keybinds.dockDefault) {
        try {
            globalShortcut.register(keybinds.dockDefault, async () => {
                console.log('Dock-default shortcut triggered');
                try {
                    mainWindow.webContents.executeJavaScript(`
                        hintio.handleShortcut('dock-default');
                    `);
                } catch (error) {
                    console.error('Error handling dock-default shortcut:', error);
                }
            });
            console.log(`Registered dockDefault: ${keybinds.dockDefault}`);
        } catch (error) {
            console.error(`Failed to register dockDefault (${keybinds.dockDefault}):`, error);
        }
    }
}

function setupWindowIpcHandlers(mainWindow, sendToRenderer, providerSessionRef) {
    ipcMain.on('view-changed', (event, view) => {
        if (!mainWindow.isDestroyed()) {
            currentView = view;
            const primaryDisplay = screen.getPrimaryDisplay();
            const workArea = primaryDisplay.workArea;
            const { width: screenWidth, x: workX, y: workY } = workArea;

            if (view === 'assistant') {
                // Shrink window for live view
                const liveWidth = Math.min(Math.floor(workArea.width * 0.88), LIVE_WIDTH);
                const liveHeight = Math.min(Math.floor(workArea.height * 0.65), LIVE_HEIGHT);
                const x = workX + Math.floor((screenWidth - liveWidth) / 2);
                mainWindow.setSize(liveWidth, liveHeight);
                mainWindow.setPosition(x, workY);
            } else {
                // Restore full size
                const fullWidth = Math.min(Math.floor(workArea.width * 0.92), DEFAULT_WIDTH);
                const fullHeight = Math.min(Math.floor(workArea.height * 0.85), DEFAULT_HEIGHT);
                const x = workX + Math.floor((screenWidth - fullWidth) / 2);
                mainWindow.setSize(fullWidth, fullHeight);
                mainWindow.setPosition(x, workY);
                mouseEventsIgnored = false;
                mainWindow.setIgnoreMouseEvents(false);
                mainWindow.webContents.send('click-through-toggled', false);
            }
        }
    });

    ipcMain.handle('window-minimize', () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.minimize();
        }
    });

    ipcMain.on('update-keybinds', (event, newKeybinds) => {
        if (!mainWindow.isDestroyed()) {
            updateGlobalShortcuts(newKeybinds, mainWindow, sendToRenderer, providerSessionRef);
        }
    });

    ipcMain.handle('toggle-window-visibility', async event => {
        try {
            if (mainWindow.isDestroyed()) {
                return { success: false, error: 'Window has been destroyed' };
            }

            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.showInactive();
            }
            return { success: true };
        } catch (error) {
            console.error('Error toggling window visibility:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('update-sizes', async event => {
        // With the sidebar layout, the window size is user-controlled.
        // This handler is kept for compatibility but is a no-op now.
        return { success: true };
    });

    // Reposition window to the opposite side of where the user's input area is
    ipcMain.handle('reposition-window', async (event, hint) => {
        if (!mainWindow || mainWindow.isDestroyed()) return { success: false };

        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workArea;
        const screenWidth = workArea.width;
        const screenHeight = workArea.height;
        const workX = workArea.x;
        const workY = workArea.y;
        const [winW, winH] = mainWindow.getSize();
        const margin = 20;
        const sideWidth = Math.max(360, Math.floor(screenWidth * 0.42));

        let x, y;
        let width = winW;
        let height = winH;

        const dockLeftFullHeight = () => {
            x = workX;
            y = workY;
            width = sideWidth;
            height = screenHeight;
        };

        const dockRightFullHeight = () => {
            x = workX + screenWidth - sideWidth;
            y = workY;
            width = sideWidth;
            height = screenHeight;
        };

        switch (hint) {
            case 'right':
                // Input on right → window goes left
                dockLeftFullHeight();
                break;
            case 'left':
                // Input on left → window goes right
                dockRightFullHeight();
                break;
            case 'bottom-right':
                dockLeftFullHeight();
                break;
            case 'bottom-left':
                dockRightFullHeight();
                break;
            case 'top-right':
                dockLeftFullHeight();
                break;
            case 'top-left':
                dockRightFullHeight();
                break;
            case 'default': {
                const defaultWidth = Math.min(Math.floor(screenWidth * 0.92), DEFAULT_WIDTH);
                const defaultHeight = Math.min(Math.floor(screenHeight * 0.85), DEFAULT_HEIGHT);
                width = defaultWidth;
                height = defaultHeight;
                x = workX + Math.floor((screenWidth - defaultWidth) / 2);
                y = workY;
                break;
            }
            case 'center':
            default:
                // Default: top-right corner
                x = workX + screenWidth - winW - margin;
                y = workY + margin;
                break;
        }

        if (width !== winW || height !== winH) {
            mainWindow.setBounds({
                x: Math.max(workX, Math.round(x)),
                y: Math.max(workY, Math.round(y)),
                width: Math.round(width),
                height: Math.round(height),
            });
        } else {
            mainWindow.setPosition(Math.max(workX, Math.round(x)), Math.max(workY, Math.round(y)));
        }
        return { success: true };
    });
}

module.exports = {
    createWindow,
    getDefaultKeybinds,
    updateGlobalShortcuts,
    setupWindowIpcHandlers,
};
