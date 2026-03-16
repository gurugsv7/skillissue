const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('fs');
const path = require('path');

const windowsCertificateFile = process.env.WIN_CSC_LINK;
const windowsCertificatePassword = process.env.WIN_CSC_KEY_PASSWORD;
const remoteReleases = process.env.SQUIRREL_REMOTE_RELEASES;

const baseDir = __dirname;
const extraResource = [path.join(baseDir, 'src/assets/SystemAudioDump')];
const optionalWindowsBundle = path.join(baseDir, 'build/windows');
if (fs.existsSync(optionalWindowsBundle)) {
    extraResource.push(optionalWindowsBundle);
}

const requiredVcRuntimeDlls = [
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'msvcp140.dll',
];

function resolveSystemDllPath(fileName) {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const searchDirs = [
        path.join(systemRoot, 'System32'),
        path.join(systemRoot, 'SysWOW64'),
    ];

    for (const dir of searchDirs) {
        const candidate = path.join(dir, fileName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function copyVcRuntimeDllsToApp(appPath) {
    const missingSources = [];

    for (const dllName of requiredVcRuntimeDlls) {
        const sourcePath = resolveSystemDllPath(dllName);
        if (!sourcePath) {
            missingSources.push(dllName);
            continue;
        }

        const targetPath = path.join(appPath, dllName);
        fs.copyFileSync(sourcePath, targetPath);
    }

    if (missingSources.length > 0) {
        throw new Error(`Missing VC++ runtime DLLs on build machine: ${missingSources.join(', ')}`);
    }
}

function resolvePackagedOutputPaths(options = {}) {
    if (Array.isArray(options.outputPaths)) return options.outputPaths;
    if (typeof options.outputPath === 'string' && options.outputPath) return [options.outputPath];
    return [];
}

module.exports = {
    packagerConfig: {
        asar: {
            unpack: '**/{onnxruntime-node,onnxruntime-common,@huggingface/transformers,sharp,@img}/**',
        },
        extraResource,
        name: 'Hintio',
        win32metadata: {
            CompanyName: 'Hintio',
            FileDescription: 'Hintio',
            OriginalFilename: 'Hintio.exe',
            ProductName: 'Hintio',
            InternalName: 'Hintio',
        },
        icon: 'src/assets/logo',
        ...(windowsCertificateFile
            ? {
                windowsSign: {
                    certificateFile: windowsCertificateFile,
                    certificatePassword: windowsCertificatePassword || undefined,
                    timestampServer: process.env.WIN_TIMESTAMP_SERVER || 'http://timestamp.digicert.com',
                },
            }
            : {}),
        // use `security find-identity -v -p codesigning` to find your identity
        // for macos signing
        // also fuck apple
        // osxSign: {
        //    identity: '<paste your identity here>',
        //   optionsForFile: (filePath) => {
        //       return {
        //           entitlements: 'entitlements.plist',
        //       };
        //   },
        // },
        // notarize if off cuz i ran this for 6 hours and it still didnt finish
        // osxNotarize: {
        //    appleId: 'your apple id',
        //    appleIdPassword: 'app specific password',
        //    teamId: 'your team id',
        // },
    },
    rebuildConfig: {},
    hooks: {
        postPackage: async (forgeConfig, options) => {
            const outputPaths = resolvePackagedOutputPaths(options);
            if (outputPaths.length === 0) {
                throw new Error('No packaged output paths found in postPackage hook');
            }

            for (const appPath of outputPaths) {
                if (process.platform === 'win32') {
                    copyVcRuntimeDllsToApp(appPath);
                }
            }
        },
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'Hintio',
                productName: 'Hintio',
                shortcutName: 'Hintio',
                createDesktopShortcut: true,
                createStartMenuShortcut: true,
                ...(remoteReleases ? { remoteReleases } : {}),
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32'],
        },
        {
            name: '@electron-forge/maker-dmg',
            platforms: ['darwin'],
        },
        {
            name: '@reforged/maker-appimage',
            platforms: ['linux'],
            config: {
                options: {
                    name: 'Hintio',
                    productName: 'Hintio',
                    genericName: 'AI Assistant',
                    description: 'AI assistant for interviews and learning',
                    categories: ['Development', 'Education'],
                    icon: 'src/assets/logo.png'
                }
            },
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};
