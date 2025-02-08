(() => {
////////////////////////////////////////////////////////////////
///                                                          ///
///  URDS UPLOADER CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.0g) ///
///                                                          ///
///  by Highpoint                last update: 08.02.25       ///
///                                                          ///
///  https://github.com/Highpoint2000/URDSupload             ///
///                                                          ///
////////////////////////////////////////////////////////////////

const updateInfo = true; // Enable or disable version check

/////////////////////////////////////////////////////////////////

    const plugin_version = '1.0g';
	const plugin_path = 'https://raw.githubusercontent.com/highpoint2000/URDSupload/';
	const plugin_JSfile = 'main/URDS-Uploader/urds-upload.js'
	const plugin_name = 'URDS Uploader';
  
	let wsSendSocket = null; // Global variable for WebSocket connection
	let URDSautoUpload;
    let URDSActive = false;
    let pressTimer;
    let buttonPressStarted = null; // Timestamp for button press start
    var isTuneAuthenticated = false;
	const PluginUpdateKey = `${plugin_name}_lastUpdateNotification`; // Unique key for localStorage

    // Generate a random 12-digit session ID to replace the IP address
    let sessionId = Math.floor(Math.random() * 1e12).toString().padStart(12, '0'); // Generates a 12-digit random session ID

    const ipApiUrl = 'https://api.ipify.org?format=json'; // Placeholder URL (not used anymore)

    let checkSuccessTimer;

    // CSS styles for buttonWrapper
    const buttonWrapperStyles = `
        display: flex;
        justify-content: left;
        align-items: center;
        margin-top: 0px;
    `;
	
    // data_pluginsct WebserverURL and WebserverPORT from the current page URL
    const currentURL = new URL(window.location.href);
    const WebserverURL = currentURL.hostname;
    const WebserverPath = currentURL.pathname.replace(/setup/g, '');
    let WebserverPORT = currentURL.port || (currentURL.protocol === 'https:' ? '443' : '80'); // Default ports if not specified

    // Determine WebSocket protocol and port
    const protocol = currentURL.protocol === 'https:' ? 'wss:' : 'ws:'; // Determine WebSocket protocol
    const WebsocketPORT = WebserverPORT; // Use the same port as HTTP/HTTPS
    const WEBSOCKET_URL = `${protocol}//${WebserverURL}:${WebsocketPORT}${WebserverPath}data_plugins`; // WebSocket URL with /data_plugins

	// Function to check if the notification was shown today
  function shouldShowNotification() {
    const lastNotificationDate = localStorage.getItem(PluginUpdateKey);
    const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

    if (lastNotificationDate === today) {
      return false; // Notification already shown today
    }
    // Update the date in localStorage to today
    localStorage.setItem(PluginUpdateKey, today);
    return true;
  }

  // Function to check plugin version
  function checkplugin_version() {
    // Fetch and evaluate the plugin script
    fetch(`${plugin_path}${plugin_JSfile}`)
      .then(response => response.text())
      .then(script => {
        // Search for plugin_version in the external script
        const plugin_versionMatch = script.match(/const plugin_version = '([\d.]+[a-z]*)?';/);
        if (!plugin_versionMatch) {
          console.error(`${plugin_name}: Plugin version could not be found`);
          return;
        }

        const externalplugin_version = plugin_versionMatch[1];

        // Function to compare versions
		function compareVersions(local, remote) {
			const parseVersion = (version) =>
				version.split(/(\d+|[a-z]+)/i).filter(Boolean).map((part) => (isNaN(part) ? part : parseInt(part, 10)));

			const localParts = parseVersion(local);
			const remoteParts = parseVersion(remote);

			for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
				const localPart = localParts[i] || 0; // Default to 0 if part is missing
				const remotePart = remoteParts[i] || 0;

				if (typeof localPart === 'number' && typeof remotePart === 'number') {
					if (localPart > remotePart) return 1;
					if (localPart < remotePart) return -1;
				} else if (typeof localPart === 'string' && typeof remotePart === 'string') {
					// Lexicographical comparison for strings
					if (localPart > remotePart) return 1;
					if (localPart < remotePart) return -1;
				} else {
					// Numeric parts are "less than" string parts (e.g., `3.5` < `3.5a`)
					return typeof localPart === 'number' ? -1 : 1;
				}
			}

			return 0; // Versions are equal
		}


        // Check version and show notification if needed
        const comparisonResult = compareVersions(plugin_version, externalplugin_version);
        if (comparisonResult === 1) {
          // Local version is newer than the external version
          console.log(`${plugin_name}: The local version is newer than the plugin version.`);
        } else if (comparisonResult === -1) {
          // External version is newer and notification should be shown
          if (shouldShowNotification()) {
            console.log(`${plugin_name}: Plugin update available: ${plugin_version} -> ${externalplugin_version}`);
			sendToast('warning important', `${plugin_name}`, `Update available:<br>${plugin_version} -> ${externalplugin_version}`, false, false);
            }
        } else {
          // Versions are the same
          console.log(`${plugin_name}: The local version matches the plugin version.`);
        }
      })
      .catch(error => {
        console.error(`${plugin_name}: Error fetching the plugin script:`, error);
      });
	}

    // Function to set up WebSocket connection for sending messages
    async function setupSendSocket() {
        if (!wsSendSocket || wsSendSocket.readyState === WebSocket.CLOSED) {
            try {
                wsSendSocket = new WebSocket(WEBSOCKET_URL);
                wsSendSocket.addEventListener("open", () => {
                    console.log("Send WebSocket connected.");
                    sendInitialWebSocketMessage();
                });
                wsSendSocket.addEventListener("message", handleWebSocketMessage);
                wsSendSocket.addEventListener("error", (error) => console.error("Send WebSocket error:", error));
                wsSendSocket.addEventListener("close", (event) => {
                    console.log("Send WebSocket closed:", event);
                    setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
                });
            } catch (error) {
                console.error("Failed to setup Send WebSocket:", error);
				sendToast('error important', 'URDSupload', `Failed to setup Send WebSocket`, false, false);	
                setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
            }
        }
    }

// Function to handle WebSocket messages
function handleWebSocketMessage(event) {
    try {
        const eventData = JSON.parse(event.data);
        //console.log(eventData);

        // Throttle processing to one message every 1000ms
        if (eventData.type === 'URDSupload' && eventData.source !== sessionId) {
            const currentTime = Date.now();
            if (!handleWebSocketMessage.lastProcessedTime || currentTime - handleWebSocketMessage.lastProcessedTime >= 1000) {
                handleWebSocketMessage.lastProcessedTime = currentTime;

                let { status } = eventData.value;
                switch (status) {
                    case 'success':
                        if (eventData.target === sessionId) {
                            if (status === 'on') {
                                sendToast('success important', 'URDS Upload', `URDSupload activated!!!`, false, false);
                                console.log("Server response: URDS Upload activated!!!");
                            } else {
                                sendToast('error', 'URDS Upload', `no services are configured!`, false, false);
                            }
                        }
                        break;
                    case 'ok':
                        console.log(`URDS Upload started successfully`);
                        if (isTuneAuthenticated) {
                            sendToast('success important', 'URDS Upload', 'successfully!', false, false);
                        }
                        break;
                    case 'warn':
                        console.warn("URDS Upload started with errors");
                        sendToast('warning', 'URDS Upload', 'Warning! Started with errors!', false, false);
                        break;
                    case 'error':
                        console.error("URDS Upload request failed.");
                        sendToast('error important', 'URDS Upload', 'Error! Failed to Upload!', false, false);
                        break;
                    case 'no':
                        console.warn("URDS Upload have no files to upload.");
                        sendToast('warning', 'URDS Upload', 'No files to upload!', false, false);
                        break;
                    case 'fail':
                        console.error("URDS Upload failed to create gzipped file.");
                        sendToast('error important', 'URDS Upload', 'Failed to create gzipped file!', false, false);
                        break;
                    case 'on':
                    case 'off':
                        // Update button status based on the received status
                        if (URDSButton) {
                            URDSActive = status === 'on';
                            setButtonStatus(URDSActive); // Update button immediately
                        }

                        if (isTuneAuthenticated && (eventData.target === '000000000000' || eventData.target === sessionId)) {
                            const StatusMessage = `URDS Upload ${URDSActive ? 'activated' : 'deactivated'}`;
                            if (status === 'on') {
                                const DetailsMessage = URDSActive ? `URDS Upload activated` : '';
                                console.log(`${StatusMessage}${DetailsMessage}`);
                                sendToast('info', 'URDS Upload', `Autoupload activated`, false, false);
                            } else {
                                const DetailsMessage = URDSActive ? `URDS Upload deactivated` : '';
                                console.log(`${StatusMessage}${DetailsMessage}`);
                                sendToast('info', 'URDS Upload', `Autoupload deactivated`, false, false);
                            }
                        }
                        break;
                }
            } else {
                console.log("Throttling: Ignored message due to time limit.");
            }
        }

        // Check if no case was matched and execute the 500ms check
        if (checkSuccessTimer) {
            clearTimeout(checkSuccessTimer);
        }
    } catch (error) {
        console.error("Error handling WebSocket message:", error);
    }
}


    // Function to send an initial WebSocket message with the session ID
    async function sendInitialWebSocketMessage() {
        try {
            if (wsSendSocket && wsSendSocket.readyState === WebSocket.OPEN) {
                const message = JSON.stringify({
                    type: 'URDSupload',
                    value: { status: 'request' },
                    source: sessionId,
                    target: 'Server'
                });
                wsSendSocket.send(message);
            } else {
                console.error('WebSocket connection is not open.');
            }
        } catch (error) {
            console.error('Failed to send WebSocket message:', error);
        }
    }

// Update button status based on whether alerts are active
function setButtonStatus(isActive) {
    if (URDSButton) {
        // Adjust classes based on active/inactive status
        URDSButton.classList.toggle('bg-color-4', isActive);
        URDSButton.classList.toggle('bg-color-2', !isActive);
        console.log(`Button status set to: ${isActive ? 'Active' : 'Inactive'}`);
        URDSActive = isActive;
    }
}

// Create the alert button and append it to the button wrapper
const URDSButton = document.createElement('button');

function initializeURDSButton() {
    const buttonWrapper = document.getElementById('button-wrapper') || createDefaultButtonWrapper();

    if (buttonWrapper) {
        URDSButton.id = 'URDSupload-on-off';
        //URDSButton.classList.add('hide-phone');
        URDSButton.setAttribute('data-tooltip', 'URDS Upload on/off');
        URDSButton.innerHTML = '<strong>URDS Upload</strong>';
        URDSButton.style.marginTop = '16px';
        URDSButton.style.marginLeft = '5px';
        URDSButton.style.width = '100px';
        URDSButton.classList.add('bg-color-2');
        URDSButton.style.borderRadius = '0px';
        URDSButton.title = `Plugin Version: ${plugin_version}`;
        buttonWrapper.appendChild(URDSButton);
        URDSButton.addEventListener('mousedown', startPressTimer);
        URDSButton.addEventListener('mouseup', cancelPressTimer);
        URDSButton.addEventListener('mouseleave', cancelPressTimer);
        console.log('URDS Upload Button successfully added.');
    } else {
        console.error('Unable to add button.');
    }
}

// Create a default button wrapper if it does not exist
function createDefaultButtonWrapper() {
    const wrapperElement = document.querySelector('.tuner-info');
    if (wrapperElement) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.classList.add('button-wrapper');
        buttonWrapper.id = 'button-wrapper';
        buttonWrapper.appendChild(URDSButton);
        wrapperElement.appendChild(buttonWrapper);
        wrapperElement.appendChild(document.createElement('br'));
        return buttonWrapper;
    } else {
        console.error('Standard location not found. Unable to add URDS Upload Button.');
        return null;
    }
}

// Start a timer to handle long presses of the button
function startPressTimer() {
    buttonPressStarted = Date.now();
    pressTimer = setTimeout(() => {
        // If it's a long press, toggle the button's active/inactive status
        toggleAlert();
        buttonPressStarted = null;
    }, 1000);  // Threshold for long press (1 second)
}

// Cancel the press timer and execute a short press action
function cancelPressTimer() {
    clearTimeout(pressTimer);
    if (buttonPressStarted) {
        // If it's a short press, trigger the URDSstartUpload function
        URDSstartUpload();
    }
    buttonPressStarted = null;
}


    // Funktion zum Senden einer Test-E-Mail
async function URDSstartUpload() {
    if (!isTuneAuthenticated) {
        sendToast('warning', 'URDS Upload', 'You must be authenticated as admin to use the URDS Upload feature!', false, false);
        return;
    }

    console.log('URDS Upload initiated.');

    try {
        const message = JSON.stringify({
            type: 'URDSupload',
            value: {
                status: 'start',
            },
            source: sessionId,
            target: 'Server'
        });

        if (wsSendSocket && wsSendSocket.readyState === WebSocket.OPEN) {
            wsSendSocket.send(message);
            sendToast('info', 'URDS Upload', 'URDS Upload starting, please wait!', false, false);
            console.log('URDS Upload start via WebSocket.');
        } else {
            console.error('WebSocket connection is not open.');
            sendToast('error', 'DX-URDS Upload', 'WebSocket connection is not open.', false, false);
        }
    } catch (error) {
        console.error('Failed to start URDS Upload via WebSocket:', error);
        // Korrektur: Verwendung von Template-Literalen
        sendToast('error', 'DX-URDS Upload', `Error! Failed to start URDS Upload!`, false, false);
    }
}


    // Toggle alert status and update WebSocket
    async function toggleAlert() {
        if (!isTuneAuthenticated) {
            sendToast('warning', 'URDS Upload', 'You must be authenticated as admin to use the URDS Upload feature!', false, false);
			return;
		}

        URDSActive = !URDSActive;

        try {
            const message = JSON.stringify({
                type: 'URDSupload',
                value: { status: URDSActive ? 'on' : 'off' },
                source: sessionId,
                target: 'Server'
            });

            if (wsSendSocket && wsSendSocket.readyState === WebSocket.OPEN) {
                wsSendSocket.send(message);
            } else {
                console.error('WebSocket connection is not open.');
            }
        } catch (error) {
            console.error('Failed to send WebSocket message:', error);
        }

    }

    function checkAdminMode() {
        const bodyText = document.body.textContent || document.body.innerText;
        isTuneAuthenticated = bodyText.includes("You are logged in as an administrator.") || bodyText.includes("You are logged in as an adminstrator.");
        console.log(isTuneAuthenticated ? `URDS Upload Authentication successful.` : "Authentication failed.");
    }
	
	// Initialize the alert button once the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        setupSendSocket();
        checkAdminMode();
        setTimeout(initializeURDSButton, 1000);
    });
	
	setTimeout(() => {
	// Execute the plugin version check if updateInfo is true and admin ist logged on
	if (updateInfo && isTuneAuthenticated) {
		checkplugin_version();
		}
	}, 200);

})();
