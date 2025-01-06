////////////////////////////////////////////////////////////////
///                                                          ///
///  URDS UPLOADER SERVER SCRIPT FOR FM-DX-WEBSERVER (V1.0b) ///
///                                                          ///
///  by Highpoint                last update: 06.01.25       ///
///                                                          ///
///  https://github.com/Highpoint2000/URDSupload             ///
///                                                          ///
////////////////////////////////////////////////////////////////

///  This plugin only works from web server version 1.2.8.1!!!

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { logInfo, logError, logWarn } = require('./../../server/console');

// Define the path to the configuration file
const configFilePath = path.join(__dirname, './../../plugins_configs/urds-upload.json');

// Default values for the configuration file
const defaultConfig = {
	URDSautoUpload: 'on', 			// Set Auto Upload after 0:00 UTC 'on' or 'off'
	CombineFiles: 'off',			// Combine all files before uploading / set it 'on' or 'off'/ default is 'off'
    FMLIST_OM_ID: '',               // Enter your OM ID here, for example: FMLIST_OM_ID: '1234', if no OMID is entered under FMLIST INTEGRATION on the web server
    FMLIST_EMAIL: '',               // Enter your EMAIL here, for example: FMLIST_EMAIL: 'xxx@xxx.com', if no email is entered under IDENTIFICATION & MAP on the web server or it is another email adress
	ServerName: '', 				// Enter your RaspiID or another name for the server, if left blank the name will be taken from the web server
	ServerDescription: '',			// Enter a comment or description for the server, if left blank the name will be taken from the web server
	PublicationMode: 'public',		// Enter the publishing mode: 'public', 'owner' or 'restricted' (default: 'public')
	OperatingMode: 'fixed'			// Enter 'mobile' or 'fixed' for stationary operation
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

if (ValidEmailAddressTo === '' && URDSautoUpload === 'on') {
    logError("URDS Upload No valid email address found. URDS Upload not started.");
    return;
}

if (!ServerName) {
    ServerName = encodeURIComponent(config.identification.tunerName)
        .replace(/%20/g, ' '); // Encode and replace spaces with a space character
}

if (!ServerDescription) {
	ServerDescription = config.identification.tunerDesc
		.replace(/%20/g, ' '); // Encode and replace spaces with a space character
}

// Read the plugin version from the client file
let UploaderPluginVersion
const UploaderfilePath = path.join(__dirname, 'urds-upload.js');
fs.readFile(UploaderfilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('URDS Upload Fehler beim Lesen der Datei:', err);
        return;
    }
    const versionMatch = data.match(/const\s+plugin_version\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch && versionMatch[1]) {
        UploaderPluginVersion = versionMatch[1];
    } else {
        LogError('URDS Upload Error! Plugin version nicht gefunden.');
    }
});

// Read the plugin version from the client file
let ScannerPluginVersion
const ScannerfilePath = path.join(__dirname, '..', 'Scanner', 'scanner.js');
fs.readFile(ScannerfilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('URDS Upload Fehler beim Lesen der Scanner Datei:', err);
        return;
    }
    const versionMatch = data.match(/const\s+plugin_version\s*=\s*['"]([^'"]+)['"]/);
    if (versionMatch && versionMatch[1]) {
        ScannerPluginVersion = versionMatch[1];
    } else {
        LogError('URDS Upload Error! Scanner plugin version nicht gefunden.');
    }
});

// Directory paths
const logDir = path.join(__dirname, '../../web/logs');
const uploadDir = path.join(__dirname, '../../web/logs/upload');
const sentDir = path.join(__dirname, '../../web/logs/sent');

// Function to check and create the directory if it doesn't exist
function checkAndCreateDir(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    logInfo(`URDS Upload created directory ${directory}`);
  }
}

// Check and create directories
checkAndCreateDir(uploadDir);
checkAndCreateDir(sentDir);

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
    //logInfo(`Overview saved to ${outputPath}.`);
};

const uploadFile = async (file) => {
    //logInfo(`Trying to upload ${file} ..`);
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
			logInfo(`URDS Upload => ${fileName} success. Moving to sent directory`);		

            // Move the .gz file to the SENT directory
            const gzTargetPath = path.join(sentDir, path.basename(file));
            if (fs.existsSync(file)) {
                fs.renameSync(file, gzTargetPath);
                //logInfo(`Gzipped file moved to ${sentDir}`);
            } else {
                logWarn(`URDS Upload not found Gzipped file ${file}, cannot move.`);
            }

            //logInfo(`Creating overview for ${gzTargetPath}`);
            createFMOverview(gzTargetPath);

            // Move the corresponding .csv file to the SENT directory
            const csvFilePath = file.replace('_upload.csv.gz', '_fm_rds.csv'); // Match _fm_rds for CSV files
            if (fs.existsSync(csvFilePath)) {
                const csvTargetPath = path.join(sentDir, path.basename(csvFilePath));
                fs.renameSync(csvFilePath, csvTargetPath);
                //logInfo(`CSV file moved to ${sentDir}`);
            } else {
                logWarn(`URDS Upload not found CSV file for ${file}.`);
            }

            // Mark to send WebSocket message once all files are processed
			MessageLog = true;
			
        } else {
            logWarn(' URDS Upload => fail! keeping file for later upload.');
			MessageWarn = true;
        }
    } catch (error) {
        logError(`Error uploading ${file}:`, error.message);
		MessageError = true;
    }

};

// Function to handle multiple file uploads
const uploadAllFiles = async (ws,source) => {
    const files = fs.readdirSync(uploadDir);

    // Filter for .gz files
    const gzFiles = files.filter(file => file.endsWith('.gz')).map(file => path.join(uploadDir, file));

    if (gzFiles.length === 0) {
        logInfo('No .gz files found in the upload directory.');
        return;
    }

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
		//logInfo("WebSocket message sent.");
	}
	
};

function countPicodesAndPSInfo(fileContent) {
  const lines = fileContent.split('\n');
  const freqData = {}; // Object to store frequency data
  
  // Iterate through all lines of the input text
  lines.forEach(line => {
    const columns = line.split(',');

    // Ensure there are enough columns
    if (columns.length > 15) {
      const freq = columns[3].trim(); // 4th column (Index 3) for Frequency
      const picode = columns[13].trim(); // 14th column (Index 13) for Picodes
      const psInfo = columns[15].trim(); // 16th column (Index 15) for PS Info

      // Initialize if the frequency doesn't exist in the object
      if (!freqData[freq]) {
        freqData[freq] = {
          picodes: new Set(), // Set for unique Picodes
          psInfo: new Set(),  // Set for unique PS Infos
          picodesWithoutPSInfo: new Set() // Set for Picodes without PS Info
        };
      }

      // Add Picodes and PS Infos to the corresponding frequency
      if (picode && !picode.includes('?')) {
        freqData[freq].picodes.add(picode); // Add Picodes to the set
      }

      if (psInfo && !psInfo.includes('?')) {
        freqData[freq].psInfo.add(psInfo); // Add PS Infos to the set
      }

      // If there is no valid PS Info for this Picode, add it to the set
      if (picode && !psInfo.includes('?') && !freqData[freq].psInfo.has(psInfo)) {
        freqData[freq].picodesWithoutPSInfo.add(picode); // Add Picodes without PS Info
      }
    }
  });

  // Count the totals
  let picodeCount = 0;
  let psInfoCount = 0;
  let distinctPicodeCount = 0;
  
  // Count Picodes, PS Infos, and Picodes without PS Info across all frequencies
  for (const freq in freqData) {
    picodeCount += freqData[freq].picodes.size; // Count unique Picodes per frequency
    psInfoCount += freqData[freq].psInfo.size; // Count unique PS Infos per frequency
    distinctPicodeCount += freqData[freq].picodesWithoutPSInfo.size; // Count Picodes without PS Info
  }

  return { picodeCount, psInfoCount, distinctPicodeCount };
}

async function processFilesWithCombination(logDir, uploadDir, ws, source) {
    const timestamp = new Date().toISOString().replace(/:/g, '').replace(/\..+/, '');
    const combinedFilePath = path.join(logDir, `${timestamp}_combined_fm_rds.csv`);
    const combinedFileContent = [];

    const filesToCombine = fs.readdirSync(logDir)
      .filter(file => file.endsWith('_fm_rds.csv') && !file.startsWith('SCANNER') && !file.startsWith('scan'))
      .map(file => ({
        file,
        time: fs.statSync(path.join(logDir, file)).mtime.getTime()
      }))
      .sort((a, b) => a.time - b.time);

    if (filesToCombine.length > 0) {
      filesToCombine.forEach(({ file }) => {
        const filePath = path.join(logDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const sanitizedContent = fileContent.split('\n').filter(line => line.trim() !== '').join('\n');
        combinedFileContent.push(sanitizedContent);

        // Rename original file to .backup
        const backupFilePath = filePath + '.backup';
        fs.renameSync(filePath, backupFilePath);
        logInfo(`URDS Upload renamed file ${file} to ${file}.backup`);
      });

      fs.writeFileSync(combinedFilePath, combinedFileContent.join('\n'), 'utf-8');
      logInfo(`URDS Upload combined ${filesToCombine.length} files into ${timestamp}_combined_fm_rds.csv`);

    } else {
      logInfo('URDS Upload found no files to combine in logDir.');
    }
}

function copyCsvFilesWithHeader(ws, source) {
  // Ensure the destination directories exist
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    logInfo(`URDS Upload created Directory ${uploadDir}`);
  }
  if (!fs.existsSync(sentDir)) {
    fs.mkdirSync(sentDir, { recursive: true });
    logInfo(`URDS Upload created Directory ${sentDir}`);
  }
  
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

  // Monitor completion of .gz creations and trigger upload
  const monitorInterval = setInterval(() => {
    if (pendingGzCreations.size === 0) {
      clearInterval(monitorInterval);
      if (filesToUpload.size > 0) {
        uploadAllFiles(ws, source); // Only upload once
      } else {
        logInfo('URDS Upload have no files to upload');
		ws.send(JSON.stringify(createMessage(`no`, source)));
      }
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

async function processFile(file, baseDir, filesToUpload, pendingGzCreations) {
  const filePath = path.join(baseDir, file);
  const uploadFilePath = path.join(uploadDir, file);
  const gzFileName = file.replace('_fm_rds.csv', '_upload.csv.gz');
  const gzFilePath = path.join(uploadDir, gzFileName);

  // Check if file name ends with '_fm_rds.csv' and ignore 'SCANNER*.csv'
  if (!file.endsWith('_fm_rds.csv') || file.startsWith('SCANNER') || file.startsWith('scan')) {
    //logInfo(`Ignoring file ${file} as it does not match the criteria.`);
    return;
  }

  const fileStat = fs.statSync(filePath);
  if (fileStat.isFile()) {
    if (fileStat.size === 0) {
      fs.unlinkSync(filePath);
      logInfo(`URDS Upload deleted empty CSV file ${file}`);
      return;
    }

    if (!fs.existsSync(uploadFilePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { picodeCount, psInfoCount, distinctPicodeCount } = countPicodesAndPSInfo(fileContent);

      const header = await setHeader(); // Wait for the header to be ready
      const newHeader = header + '\n15, ' + picodeCount + ', ' + psInfoCount + ', ' + distinctPicodeCount;
      const newContent = newHeader + '\n' + fileContent;

      fs.writeFileSync(uploadFilePath, newContent);

      const backupFilePath = filePath + '.backup';
      fs.renameSync(filePath, backupFilePath);
      logInfo(`URDS Upload backed up CSV file ${file}`);
    }

    if (!fs.existsSync(gzFilePath)) {
      createGzFile(uploadFilePath, gzFilePath, filesToUpload, pendingGzCreations, gzFileName, ws, source);
    } else {
      filesToUpload.add(gzFileName); // Mark for upload if .gz already exists
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
    //logInfo(`Marking ${gzFileName} for upload.`);
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
      logInfo(`URDS Upload created Gzipped file ${gzFileName}`);
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
            logError("URDS Upload Error sending WebSocket notification:", error);
        }
    } else {
        logError("URDS Upload data_plugins WebSocket is not open or not defined.");
    }
}

// Connect to the main WebSocket server
function connectToWebSocket() {
    if (URDSautoUpload === 'on' && !ValidEmailAddressTo.includes('@')) {
        logError("Email Address not set or invalid format! URDS Upload not started.");
        return;
    }

    ws = new WebSocket(externalWsUrl + '/data_plugins');

    ws.on('open', () => {
        // logInfo(`DX-Alert connected to ${ws.url}`);
        ws.send(JSON.stringify(createMessage(currentStatus, '000000000000'))); // Send initial status
        // Delay the logging of broadcast info by 100 ms
        setTimeout(() => {
            logBroadcastInfo();
        }, 100);

    });

    ws.on('message', (data) => handleWebSocketMessage(data, ws));

    ws.on('error', (error) => logError('DX-Alert WebSocket error:', error));

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
				logInfo(`URDS Upload service are turned on`);
			} else {
				logInfo(`URDS Upload service are turned off`);
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
        logError('URDS Upload Error processing WebSocket message:', error);
    }
}

if (CombineFiles === 'on') {
    logInfo(`URDS Upload combine all files`);
}

// Handle DX-Alert specific WebSocket messages
function handleURDSMessage(message, ws) {
    const { status } = message.value;

    if (status === 'request') {
		if (currentStatus === 'on') { 
				ws.send(JSON.stringify(createMessage('on', message.source)));
				logInfo(`URDS Upload responding with "Autoupload on"`);
				currentStatus = 'on';
		} else if (currentStatus === 'off') {
					ws.send(JSON.stringify(createMessage('off', message.source)));
					logInfo(`URDS Upload responding with "Autoupload off"`);
					currentStatus = 'off';
		}
	} else if (status === 'on') { 
				ws.send(JSON.stringify(createMessage('on', message.source)));
				logInfo(`URDS Upload responding with "Autoupload on"`);
				currentStatus = 'on';
		} else if (status === 'off') {
					ws.send(JSON.stringify(createMessage('off', message.source)));
					logInfo(`URDS Upload responding with "Autoupload off"`);
					currentStatus = 'off';
			} else if (status === 'start') {
				logInfo(`URDS Upload received "Start upload" from ${message.source}`);
					source = message.source;
					MessageLog = false; 
					MessageWarn = false; 
					MessageError = false;
					MessageCode = 0;
					copyCsvFilesWithHeader(ws,source);
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
    const midnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    let timeUntilMidnight = midnightUTC - now;

    // If it's already past midnight UTC, calculate time until the next midnight
    if (timeUntilMidnight < 0) {
        timeUntilMidnight += 24 * 60 * 60 * 1000; // Add 24 hours in milliseconds
    }

    logInfo(`URDS Auto Upload scheduled to start at UTC midnight.`);

    // Wait until midnight UTC
    setTimeout(() => {
        logInfo("URDS Upload running random delay function...");

        // Function to check status and execute the upload task
        const executeTask = () => {
            if (currentStatus === 'on') {
                // Execute the function with a maximum wait time of 120 minutes
                const MAX_MINUTES = 120;
                const waitSeconds = Math.floor(Math.random() * MAX_MINUTES * 60);

                logInfo(`URDS Auto Upload waiting for ${Math.floor(waitSeconds / 60)} minutes and ${waitSeconds % 60} seconds.`);

                setTimeout(() => {
                    logInfo(`URDS Auto Upload executing upload task`);
                    MessageLog = false; 
                    MessageWarn = false; 
                    MessageError = false;
                    let source = 000000000000;
                    copyCsvFilesWithHeader(ws, source);
                }, waitSeconds * 1000);
            } else {
                logInfo("URDS Auto Upload skipped: currentStatus is not 'on'.");
            }
        };

        // Monitor the status and execute when appropriate
        const intervalId = setInterval(() => {
            if (currentStatus === 'on') {
                clearInterval(intervalId); // Stop monitoring once the status is 'on'
                executeTask();
            }
        }, 5000); // Check status every 5 seconds

    }, timeUntilMidnight);
}

// Start the scheduled task
if (URDSautoUpload && currentStatus === 'on') {
    scheduleTask();
}

// Initialize connections after a delay
setTimeout(connectToWebSocket, 1000);