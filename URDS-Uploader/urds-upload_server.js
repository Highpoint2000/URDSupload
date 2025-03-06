/////////////////////////////////////////////////////////////////////
///                                                               ///
///  URDS Uploader Server Script for FM-DX-Webserver (V1.1b)      ///
///                                                               ///
///  by Highpoint                last update: 06.03.25            ///
///                                                               ///
///  https://github.com/Highpoint2000/URDSupload                  ///
///                                                               ///
/////////////////////////////////////////////////////////////////////

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { logInfo, logError, logWarn } = require('./../../server/console');

// Define the path to the configuration file
const configFilePath = path.join(__dirname, './../../plugins_configs/urds-upload.json');

// Default values for the configuration file
const defaultConfig = {
    URDSautoUpload: 'off',          // Enable auto upload after 0:00 UTC: 'on' or 'off'
    CombineFiles: 'on',             // Combine all files before uploading; set to 'on' or 'off' (default is 'on')
    FMLIST_OM_ID: '',               // Enter your OM ID here, for example: FMLIST_OM_ID: '1234'. If no OMID is entered under FMLIST INTEGRATION on the web server.
    FMLIST_EMAIL: '',               // Enter your email here, for example: FMLIST_EMAIL: 'xxx@xxx.com'. If no email is entered under IDENTIFICATION & MAP on the web server or if a different email is used.
    ServerName: '',                 // Enter your RaspiID or another name for the server. If left blank, the name will be taken from the web server.
    ServerDescription: '',          // Enter a comment or description for the server. If left blank, the description will be taken from the web server.
    PublicationMode: 'public',      // Publishing mode: 'public', 'owner' or 'restricted' (default: 'public')
    OperatingMode: 'fixed'          // Operation mode: 'mobile' or 'fixed' for stationary operation
};

// Function to merge default config with existing config
function mergeConfig(defaultConfig, existingConfig) {
    const updatedConfig = {};
    for (const key in defaultConfig) {
        updatedConfig[key] = key in existingConfig ? existingConfig[key] : defaultConfig[key];
    }
    return updatedConfig;
}

// Function to load or create the configuration file
function loadConfig(filePath) {
    let existingConfig = {};
    const oldConfigPath = path.join(__dirname, 'configPlugin.json');

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(oldConfigPath)) {
        existingConfig = JSON.parse(fs.readFileSync(oldConfigPath, 'utf-8'));
        logInfo('Old configuration found at configPlugin.json. Migrating to new file.');
        fs.writeFileSync(filePath, JSON.stringify(existingConfig, null, 2), 'utf-8');
        fs.unlinkSync(oldConfigPath);
        logInfo('Old configuration file configPlugin.json deleted after migration.');
    } else if (fs.existsSync(filePath)) {
        existingConfig = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
        logInfo('DX-Alert configuration not found. Creating configPlugin.json.');
    }

    const finalConfig = mergeConfig(defaultConfig, existingConfig);
    fs.writeFileSync(filePath, JSON.stringify(finalConfig, null, 2), 'utf-8');
    return finalConfig;
}

const configPlugin = loadConfig(configFilePath);

let URDSautoUpload = configPlugin.URDSautoUpload;
let CombineFiles = configPlugin.CombineFiles;
let FMLIST_OM_ID = configPlugin.FMLIST_OM_ID;
let FMLIST_EMAIL = configPlugin.FMLIST_EMAIL;
let ServerName = configPlugin.ServerName; 
let ServerDescription = configPlugin.ServerDescription; 
let PublicationMode = configPlugin.PublicationMode;
let OperatingMode = configPlugin.OperatingMode;

////////////////////////////////////////////////////////////////

const config = require('./../../config.json');
const WebSocket = require('ws');
let ws;

const checkInterval = 1000;
const clientID = 'Server';
const webserverPort = config.webserver.webserverPort || 8080;
const externalWsUrl = `ws://127.0.0.1:${webserverPort}`;
let source;
let header;
let MessageLog;
let MessageWarn;
let MessageError;
let currentStatus = 'off';

const sentMessages = new Set();
const { execSync } = require('child_process');
const NewModules = ['axios', 'form-data', 'os'];

// Check and install required modules if missing
function checkAndInstallNewModules() {
    NewModules.forEach(module => {
        const modulePath = path.join(__dirname, './../../node_modules', module);
        if (!fs.existsSync(modulePath)) {
            logInfo(`Module ${module} is missing. Installing...`);
            try {
                execSync(`npm install ${module}`, { stdio: 'inherit' });
                logInfo(`Module ${module} installed successfully.`);
            } catch (error) {
                logError(`Error installing module ${module}:`, error);
                process.exit(1);
            }
        }
    });
}

checkAndInstallNewModules();

const axios = require('axios'); 
const FormData = require('form-data');
const os = require('os');

if (URDSautoUpload === 'on') {
    currentStatus = 'on';
}

if (!FMLIST_OM_ID) {
    FMLIST_OM_ID = config.extras.fmlistOmid;
}

if (FMLIST_OM_ID === '') {
    logError("No valid FMLIST OMID found. URDS Upload not started.");
    return;
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function getValidEmail() {
    if (validateEmail(FMLIST_EMAIL)) {
        return FMLIST_EMAIL;
    }
    if (!FMLIST_EMAIL && validateEmail(config.identification.contact)) {
        return config.identification.contact;
    }
    return '';
}

const ValidEmailAddressTo = getValidEmail();

if (ValidEmailAddressTo === '') {
    logError("No valid email address found. URDS Upload not started.");
    return;
}

if (!ServerName) {
    ServerName = encodeURIComponent(config.identification.tunerName)
        .replace(/%20/g, ' '); // Encode and replace encoded spaces with a space character
}

if (!ServerDescription) {
    ServerDescription = config.identification.tunerDesc
        .replace(/%20/g, ' '); // Encode and replace encoded spaces with a space character
}

// Read the plugin version from the uploader file
let UploaderPluginVersion;
const UploaderfilePath = path.join(__dirname, 'urds-upload.js');
fs.readFile(UploaderfilePath, 'utf8', (err, data) => {
    if (err) {
        logError('URDS Upload error reading file:', err);
        return;
    }
    const versionMatch = data.match(/const\s+plugin_version\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch && versionMatch[1]) {
        UploaderPluginVersion = versionMatch[1];
    } else {
        logError('URDS Upload error! Plugin version not found.');
    }
});

// Read the plugin version from the scanner file
let ScannerPluginVersion;
const ScannerfilePath = path.join(__dirname, '..', 'Scanner', 'scanner.js');
fs.readFile(ScannerfilePath, 'utf8', (err, data) => {
    if (err) {
        logError('URDS Upload error reading Scanner file:', err);
        return;
    }
    const versionMatch = data.match(/const\s+plugin_version\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch && versionMatch[1]) {
        ScannerPluginVersion = versionMatch[1];
    } else {
        logError('URDS Upload error! Scanner plugin version not found.');
    }
});

// Directory paths
const logDir = path.join(__dirname, '../../web/logs');
const uploadDir = path.join(__dirname, '../../web/logs/upload');
const sentDir = path.join(__dirname, '../../web/logs/sent');

// Function to check and create a directory if it doesn't exist
function checkAndCreateDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    logInfo(`URDS Upload created directory ${directory}`);
  }
}

// Check and create directories
checkAndCreateDir(uploadDir);
checkAndCreateDir(sentDir);

// Create backup folder and move files with .backup extension
function createBackupFolderAndMoveFiles() {
    // Path for the backup folder
    const backupDir = path.join(logDir, 'backup');

    // Ensure the backup folder exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        logInfo(`URDS Upload created backup folder`);
    }

    // Read files in the logDir folder
    const files = fs.readdirSync(logDir);
    let filesMoved = false;

    files.forEach(file => {
        const filePath = path.join(logDir, file);

        // Check if it is a file with the .backup extension
        if (fs.lstatSync(filePath).isFile() && file.endsWith('.backup')) {
            const targetPath = path.join(backupDir, file.replace('.backup', ''));

            // Move and rename the file
            fs.renameSync(filePath, targetPath);
            filesMoved = true;
        }
    });

    if (filesMoved) {
        logInfo(`URDS Upload moved all *.backup files and removed their .backup extension`);
    }
}

createBackupFolderAndMoveFiles();

// Function to create an overview of the file
const createFMOverview = (filePath) => {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
        logError(`File ${fullPath} not found!`);
        return;
    }

    const content = fs.readFileSync(fullPath);
    const lines = content.toString().split('\n');

    const outputPath = `${filePath}.overview.txt`;
    fs.writeFileSync(outputPath, `Line count: ${lines.length}`);
    // logInfo(`Overview saved to ${outputPath}.`);
};

const uploadFile = async (file) => {
    // logInfo(`Attempting to upload ${file}...`);
    const ws = new WebSocket(externalWsUrl + '/data_plugins');

    try {
        const formData = new FormData();
        formData.append('mfile', fs.createReadStream(file));

        const response = await axios.post('https://www.fmlist.org/urds/csvup.php', formData, {
            headers: {
                ...formData.getHeaders()
            }
        });

        if (response.data === 'Thank you!') {

            const fileName = path.basename(file);
            logInfo(`URDS Upload => ${fileName} succeeded. Moving to sent directory`);

            // Move the .gz file to the sent directory
            const gzTargetPath = path.join(sentDir, path.basename(file));
            if (fs.existsSync(file)) {
                fs.renameSync(file, gzTargetPath);
                // logInfo(`Gzipped file moved to ${sentDir}`);
            } else {
                logWarn(`URDS Upload could not find gzipped file ${file} to move.`);
            }

            // logInfo(`Creating overview for ${gzTargetPath}`);
            createFMOverview(gzTargetPath);

            // Move the corresponding .csv file to the sent directory
            const csvFilePath = file.replace('_upload.csv.gz', '_fm_rds.csv'); // Match _fm_rds for CSV files
            if (fs.existsSync(csvFilePath)) {
                const csvTargetPath = path.join(sentDir, path.basename(csvFilePath));
                fs.renameSync(csvFilePath, csvTargetPath);
                // logInfo(`CSV file moved to ${sentDir}`);
            } else {
                logWarn(`URDS Upload could not find CSV file for ${file}.`);
            }

            // Mark to send WebSocket message once all files are processed
            MessageLog = true;

        } else {
            logWarn('URDS Upload => failed! Keeping file for later upload.');
            MessageWarn = true;
        }
    } catch (error) {
        logError(`Error uploading ${file}:`, error.message);
        MessageError = true;
    }

};

// Function to handle multiple file uploads
const uploadAllFiles = async (ws, source) => {
    const files = fs.readdirSync(uploadDir);

    // DEBUG: Show found files
    logInfo(`DEBUG: uploadAllFiles() - Found ${files.length} items in uploadDir`);

    // Filter for .gz files
    const gzFiles = files.filter(file => file.endsWith('.gz')).map(file => path.join(uploadDir, file));

    if (gzFiles.length === 0) {
        logInfo('No .gz files found in the upload directory.');
        return;
    }

    logInfo(`DEBUG: uploadAllFiles() - GZ-Files to upload: ${gzFiles.length}`);

    // Process each file
    for (const file of gzFiles) {
        await uploadFile(file); // Wait for each upload to finish before proceeding to the next
    }
    
    // Send WebSocket message once after all uploads are processed
    if (ws.readyState === WebSocket.OPEN) {
        if (MessageError) {
            ws.send(JSON.stringify(createMessage(`error`, source)));
        } else if (MessageWarn) {
            ws.send(JSON.stringify(createMessage(`warn`, source)));
        } else if (MessageLog) {
            ws.send(JSON.stringify(createMessage(`ok`, source)));
        }
        // logInfo("WebSocket message sent.");
    }
};

function countPicodesAndPSInfo(fileContent) {
    const lines = fileContent.split('\n');
    const freqData = {}; // Object to store frequency data

    // Iterate through all lines of the input text
    lines.forEach((line, index) => {
        const columns = line.split(',');

        // Ensure there are enough columns
        if (columns.length > 14) {
            const freq = columns[2].trim();    // 3rd column (index 2) for Frequency
            const picode = columns[12].trim(); // 13th column (index 12) for Picodes
            const psInfo = columns[14].trim(); // 15th column (index 14) for PS Info

            // Initialize if the frequency doesn't exist in the object
            if (!freqData[freq]) {
                freqData[freq] = {
                    picodes: new Set(),  // Set for unique Picodes
                    validPsInfo: false,  // Track if a valid PS Info exists
                    distinctPicode: false, // Track if distinct Picodes exist
                };
            }

            // Add Picodes to the set if valid
            if (picode && !picode.includes('?')) {
                freqData[freq].picodes.add(picode);
            }

            // Check for valid PS Info
            if (picode && !picode.includes('?') && psInfo.trim().replace(/["']/g, '') !== '?' && !psInfo.includes('?')) {
                freqData[freq].validPsInfo = true;
            }

            // Check for distinct Picodes
            if (picode && !picode.includes('?') && psInfo.trim().replace(/["']/g, '') === '?') {
                freqData[freq].distinctPicode = true;
            }
        }
    });

    // Count the totals
    let picodeCount = 0;
    let psInfoCount = 0;
    let distinctPicodeCount = 0;

    // Iterate over frequencies to calculate totals
    for (const freq in freqData) {
        if (freqData[freq].picodes.size > 0) {
            picodeCount += 1; // Each frequency with at least one valid Picode
        }

        if (freqData[freq].validPsInfo) {
            psInfoCount += 1; // Count frequencies with at least one valid PS Info
        } else if (freqData[freq].distinctPicode) {
            distinctPicodeCount += 1; // Count frequencies with distinct Picodes
        }
    }

    return { picodeCount, psInfoCount, distinctPicodeCount };
}

async function processFilesWithCombination(logDir, uploadDir, ws, source) {
    const timestamp = new Date().toISOString().replace(/:/g, '').replace(/\..+/, '');
    const combinedFilePath = path.join(logDir, `${timestamp}_combined_fm_rds.csv`);
    const combinedFileContent = [];

    const backupDir = path.join(logDir, 'backup');

    // Ensure that the backup folder exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        logInfo(`URDS Upload created backup folder`);
    }

    // Filter all relevant files in the folder
    const filesToCombine = fs.readdirSync(logDir)
        .filter(file => file.endsWith('_fm_rds.csv') && !file.startsWith('SCANNER') && !file.startsWith('scan'))
        .map(file => {
            const filePath = path.join(logDir, file);
            const fileSize = fs.statSync(filePath).size;

            // Check for 0-KB files and delete them
            if (fileSize === 0) {
                try {
                    fs.unlinkSync(filePath);
                    logInfo(`URDS Upload deleted empty CSV file ${file}`);
                } catch (error) {
                    logError(`URDS Upload error deleting file ${file}: ${error.message}`);
                }
                return null; // Do not add the file for processing
            }

            return {
                file,
                time: fs.statSync(filePath).mtime.getTime()
            };
        })
        .filter(Boolean) // Remove null values
        .sort((a, b) => a.time - b.time);

    if (filesToCombine.length > 1) {
        filesToCombine.forEach(({ file }) => {
            const filePath = path.join(logDir, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const sanitizedContent = fileContent.split('\n').filter(line => line.trim() !== '').join('\n');
            combinedFileContent.push(sanitizedContent);

            // Move file to backup folder
            const backupPath = path.join(backupDir, `${file}`);
            fs.renameSync(filePath, backupPath);
            logInfo(`URDS Upload moved file ${file} to backup folder`);
        });

        // Write the combined file
        fs.writeFileSync(combinedFilePath, combinedFileContent.join('\n'), 'utf-8');
        logInfo(`URDS Upload combined ${filesToCombine.length} files into ${timestamp}_combined_fm_rds.csv`);
    } else {
        // DEBUG: Info when no combination is needed or performed
        logInfo('DEBUG: No multiple files found to combine or only one file found. Skipping combination.');
    }
}

function copyCsvFilesWithHeader(ws, source) {
    logInfo('DEBUG: Start copyCsvFilesWithHeader() - Checking for new CSV files to upload...');
    
    // Ensure the destination directories exist
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        logInfo(`URDS Upload created directory ${uploadDir}`);
    }
    if (!fs.existsSync(sentDir)) {
        fs.mkdirSync(sentDir, { recursive: true });
        logInfo(`URDS Upload created directory ${sentDir}`);
    }

    // If "CombineFiles" is on, attempt to combine first
    if (CombineFiles === 'on') {
        processFilesWithCombination(logDir, uploadDir, ws, source);
    }

    const filesToUpload = new Set(); // Track files to be uploaded
    const pendingGzCreations = new Set(); // Track ongoing .gz creations

    // Process files in logDir
    fs.readdirSync(logDir).forEach(file => {
        processFile(file, logDir, filesToUpload, pendingGzCreations, ws, source);
    });

    // Process files directly in uploadDir
    fs.readdirSync(uploadDir).forEach(file => {
        processUploadDirFile(file, filesToUpload, pendingGzCreations, ws, source);
    });

    // DEBUG: Log which files are queued for upload
    logInfo(`DEBUG: Found ${filesToUpload.size} .gz files queued for upload (after GZ creation).`);

    // Monitor completion of .gz creations and trigger upload
    const monitorInterval = setInterval(() => {
        if (pendingGzCreations.size === 0) {
            clearInterval(monitorInterval);
            logInfo('DEBUG: All pending .gz creations finished.');

            if (filesToUpload.size > 0) {
                uploadAllFiles(ws, source); // Upload once all files are ready
            } else {
                logInfo('URDS Upload has no files to upload');
                ws.send(JSON.stringify(createMessage(`no`, source)));
            }
        } else {
            // DEBUG: Log that we are still waiting
            logInfo(`DEBUG: Waiting for .gz creation to finish. Remaining: ${pendingGzCreations.size}`);
        }
    }, 500); // Check every 500ms
}

async function setHeader() {
    return new Promise((resolve) => {
        header = `10,"${FMLIST_EMAIL}"\n`;
        const singleLineServerName = ServerName.replace(/\n/g, ' '); // Remove line breaks from ServerName
        header += `11,"${FMLIST_OM_ID}","${singleLineServerName}"\n`;
        header += `111,"os-release ${os.platform()} ${os.release()}"\n`;
        header += `112,"architecture ${os.arch()}"\n`;
        header += `113,"UploaderPluginVersion ${UploaderPluginVersion}", "ScannerPluginVersion ${ScannerPluginVersion}"\n`;
        const singleLineDescription = ServerDescription.replace(/\n/g, ' '); // Remove line breaks from ServerDescription
        header += `12,"${singleLineDescription}"\n`;
        header += `13,"${PublicationMode}",""\n`;
        header += `14,"${OperatingMode}"`;
        resolve(header);
    });
}

async function processFile(file, baseDir, filesToUpload, pendingGzCreations, ws, source) {
    const filePath = path.join(baseDir, file);
    const uploadFilePath = path.join(uploadDir, file);
    const gzFileName = file.replace('_fm_rds.csv', '_upload.csv.gz');
    const gzFilePath = path.join(uploadDir, gzFileName);

    const backupDir = path.join(baseDir, 'backup');

    // Ensure the backup folder exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        logInfo(`URDS Upload created backup folder`);
    }

    // Check if filename ends with '_fm_rds.csv' and ignore files starting with 'SCANNER' or 'scan'
    if (!file.endsWith('_fm_rds.csv') || file.startsWith('SCANNER') || file.startsWith('scan')) {
        return;
    }

    const fileStat = fs.statSync(filePath);
    if (fileStat.isFile()) {
        // Handle 0 KB files
        if (fileStat.size === 0) {
            try {
                fs.unlinkSync(filePath);
                logInfo(`URDS Upload deleted empty CSV file ${file}`);
            } catch (error) {
                logError(`URDS Upload error deleting file ${file}: ${error.message}`);
            }
            return; // Exit early after deletion
        }

        if (!fs.existsSync(uploadFilePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const { picodeCount, psInfoCount, distinctPicodeCount } = countPicodesAndPSInfo(fileContent);

            const header = await setHeader(); // Wait for the header to be ready
            const newHeader = header
                + '\n15,"' + picodeCount + ', ' + psInfoCount + ', ' + distinctPicodeCount + '"'
                + '\n17,"dbµV"';  

            // Start building the new content with the header
            let newContent = newHeader + '\n';

            // Process each line and ensure it starts with "30,"
            const lines = fileContent.split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine) { // Skip empty lines
                    if (!trimmedLine.startsWith("30,")) {
                        newContent += "30," + trimmedLine + '\n';
                    } else {
                        newContent += trimmedLine + '\n';
                    }
                }
            });

            fs.writeFileSync(uploadFilePath, newContent);

            // Move original file to the backup folder
            const backupPath = path.join(backupDir, file);
            if (!fs.existsSync(filePath)) {
                // logInfo(`Source file ${filePath} does not exist, skipping move.`);
                return;
            }

            try {
                fs.renameSync(filePath, backupPath);
                logInfo(`URDS Upload moved file ${file} to backup folder`);
            } catch (error) {
                logError(`Error moving file ${file} to backup folder: ${error.message}`);
            }

            if (!fs.existsSync(gzFilePath)) {
                createGzFile(uploadFilePath, gzFilePath, filesToUpload, pendingGzCreations, gzFileName, ws, source);
            } else {
                filesToUpload.add(gzFileName); // Mark for upload if .gz already exists
            }
        }
    }
}

// Helper function to process files in uploadDir
function processUploadDirFile(file, filesToUpload, pendingGzCreations, ws, source) {
    const filePath = path.join(uploadDir, file);
    const gzFileName = file.replace('_fm_rds.csv', '_upload.csv.gz');
    const gzFilePath = path.join(uploadDir, gzFileName);

    if (file.endsWith('_fm_rds.csv') && fs.existsSync(gzFilePath)) {
        filesToUpload.add(gzFileName); // Both CSV and .gz exist, mark for upload
        // logInfo(`Marking ${gzFileName} for upload.`);
    } else if (file.endsWith('.csv') && !fs.existsSync(gzFilePath)) {
        createGzFile(filePath, gzFilePath, filesToUpload, pendingGzCreations, gzFileName, ws, source);
    }
}

// Create a .gz file and mark it for upload
function createGzFile(inputPath, outputPath, filesToUpload, pendingGzCreations, gzFileName, ws, source) {
    if (pendingGzCreations.has(inputPath)) {
        return; // Avoid duplicate gzipping
    }

    pendingGzCreations.add(inputPath);

    const gzip = zlib.createGzip();
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);

    input.pipe(gzip).pipe(output);

    output.on('finish', () => {
        pendingGzCreations.delete(inputPath);
        if (fs.existsSync(outputPath)) {
            filesToUpload.add(gzFileName); // Mark file as ready for upload
            logInfo(`URDS Upload created gzipped file ${gzFileName}`);
        }
    });

    output.on('error', (err) => {
        pendingGzCreations.delete(inputPath);
        logError(`URDS Upload failed to create gzipped file ${gzFileName}: ${err.message}`);
        ws.send(JSON.stringify(createMessage(`fail`, source)));
    });
}

function createMessage(currentStatus, source) {
    return {
        type: 'URDSupload',
        value: {
            status: currentStatus,
        },
        source: clientID,
        target: source
    };
}

// Handle incoming WebSocket messages
let processingAlert = false;
let firstAlert = true;

// Send a WebSocket notification
function sendWebSocketNotification(status, subject, message, source) {
    if (data_pluginsWs && data_pluginsWs.readyState === WebSocket.OPEN) {
        const notification = {
            type: 'URDSupload',
            value: {
                status: status,
            },
            source: clientID,
            target: source
        };
        try {
            data_pluginsWs.send(JSON.stringify(notification));
        } catch (error) {
            logError("URDS Upload error sending WebSocket notification:", error);
        }
    } else {
        logError("URDS Upload data_plugins WebSocket is not open or not defined.");
    }
}

// Connect to the main WebSocket server
function connectToWebSocket() {
    if (!ValidEmailAddressTo.includes('@')) {
        logError("Email address not set or invalid format! URDS Upload not started.");
        return;
    }

    if (FMLIST_OM_ID === '') {
        logError("No valid FMLIST OMID found. URDS Upload not started.");
        return;
    }

    ws = new WebSocket(externalWsUrl + '/data_plugins');

    ws.on('open', () => {
        // logInfo(`URDS Upload connected to ${ws.url}`);
        ws.send(JSON.stringify(createMessage(currentStatus, '000000000000'))); // Send initial status
        // Delay the logging of broadcast info by 100 ms
        setTimeout(() => {
            logBroadcastInfo();
        }, 100);
    });

    ws.on('message', (data) => handleWebSocketMessage(data, ws));

    ws.on('error', (error) => logError('URDS Upload WebSocket error:', error));

    ws.on('close', (code, reason) => {
        logInfo(`WebSocket connection closed. Code: ${code}, Reason: ${reason}`);
        setTimeout(connectToWebSocket, Math.min(5000 * 2 ** sentMessages.size, 30000)); // Exponential backoff
    });

    // Setup data_plugins WebSocket connection for additional features
    setupdata_pluginsWebSocket();
}

// Log broadcast information based on current status
function logBroadcastInfo() {
    if (currentStatus === 'on' && URDSautoUpload === 'on') {
        logInfo(`URDS Upload service is turned on`);
    } else {
        logInfo(`URDS Upload service is turned off`);
    }
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(data, ws) {
    try {
        const message = JSON.parse(data.toString());
        if (message.source === clientID) return; // Ignore messages from self

        if (message.type === 'URDSupload') {
            handleURDSMessage(message, ws);
        }
    } catch (error) {
        logError('URDS Upload error processing WebSocket message:', error);
    }
}

if (CombineFiles === 'on') {
    logInfo(`URDS Upload "combine all files" function is on`);
}

// Handle URDSupload specific WebSocket messages
let lastStartTimestamp = 0;

function handleURDSMessage(message, ws) {
    const { status } = message.value;
    const now = Date.now();

    if (status === 'request') {
        if (currentStatus === 'on') {
            ws.send(JSON.stringify(createMessage('on', message.source)));
            logInfo(`URDS Upload responding with "Auto upload on"`);
            currentStatus = 'on';
        } else if (currentStatus === 'off') {
            ws.send(JSON.stringify(createMessage('off', message.source)));
            logInfo(`URDS Upload responding with "Auto upload off"`);
            currentStatus = 'off';
        }
    } else if (status === 'on') {
        ws.send(JSON.stringify(createMessage('on', message.source)));
        logInfo(`URDS Upload responding with "Auto upload on"`);
        currentStatus = 'on';
    } else if (status === 'off') {
        ws.send(JSON.stringify(createMessage('off', message.source)));
        logInfo(`URDS Upload responding with "Auto upload off"`);
        currentStatus = 'off';
    } else if (status === 'start') {
        if (now - lastStartTimestamp >= 5000) {
            logInfo(`URDS Upload received "Start upload" from ${message.source}`);
            lastStartTimestamp = now;
            source = message.source;
            MessageLog = false;
            MessageWarn = false;
            MessageError = false;
            copyCsvFilesWithHeader(ws, source);
        } else {
            logInfo(`"Start upload" message from ${message.source} ignored due to throttle limit.`);
        }
    }
}

// Set up a separate connection for the /data_plugins WebSocket endpoint
function setupdata_pluginsWebSocket() {
    data_pluginsWs = new WebSocket(`ws://127.0.0.1:${webserverPort}/data_plugins`);

    data_pluginsWs.on('open', () => {
        logInfo("URDS Upload data_plugins WebSocket connected.");
    });

    data_pluginsWs.on('error', (error) => logError("URDS data_plugins WebSocket error:", error));

    data_pluginsWs.on('close', (event) => {
        logInfo("data_plugins WebSocket closed:", event);
        setTimeout(setupdata_pluginsWebSocket, 5000); // Retry connection after 5 seconds
    });
}

function scheduleTask() {
    // Calculate the remaining time until midnight UTC
    const now = new Date();
    const midnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const timeUntilMidnight = midnightUTC - now;

    logInfo(`Scheduled auto upload in ${Math.floor(timeUntilMidnight / 1000)} seconds.`);

    setTimeout(() => {
        logInfo("Midnight reached, preparing upload...");

        // Delay the upload with a random delay as before
        const MAX_MINUTES = 120;
        const waitSeconds = Math.floor(Math.random() * MAX_MINUTES * 60);
        logInfo(`Waiting an additional ${Math.floor(waitSeconds / 60)} minutes and ${waitSeconds % 60} seconds.`);

        setTimeout(() => {
            if (currentStatus === 'on') {
                logInfo("Executing scheduled upload task.");
                MessageLog = false;
                MessageWarn = false;
                MessageError = false;
                let source = "000000000000";
                copyCsvFilesWithHeader(ws, source);
            } else {
                logInfo("Upload skipped because currentStatus is not 'on'.");
            }
            // Reschedule for the next day after upload (or skip)
            scheduleTask();
        }, waitSeconds * 1000);
    }, timeUntilMidnight);
}

// Start the scheduled task if auto upload is enabled
if (URDSautoUpload === 'on' && currentStatus === 'on') {
    logInfo('DEBUG: URDSautoUpload is on and currentStatus is on => scheduling daily task.');
    scheduleTask();
} else {
    logInfo('DEBUG: Automatic upload is off or currentStatus is off => No scheduling done.');
}

// Initialize connections after a delay
setTimeout(connectToWebSocket, 1000);
