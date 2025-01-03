(() => {
////////////////////////////////////////////////////////////////
///                                                          ///
///  URDS UPLOADER CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.0)  ///
///                                                          ///
///  by Highpoint                last update: 03.01.25       ///
///                                                          ///
///  https://github.com/Highpoint2000/URDSupload             ///
///                                                          ///
////////////////////////////////////////////////////////////////

///  This plugin only works from web server version 1.2.8.1!!!

const updateInfo = true; // Enable or disable version check

/////////////////////////////////////////////////////////////////

    const plugin_version = '1.0';
	const plugin_path = 'https://raw.githubusercontent.com/highpoint2000/URDSuploader/';
	const plugin_JSfile = 'main/URDSuploader/URDSupload.js'
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
			console.log(eventData); 
            if (eventData.type === 'URDSupload' && eventData.source !== sessionId) {
                let { status } = eventData.value;
                switch (status) {
                    case 'success':
                        if (eventData.target === sessionId) {
							if (status === 'on' ) {
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

						if (isTuneAuthenticated && status === 'on' && (eventData.target === '000000000000' || eventData.target === sessionId)) {
							const StatusMessage = `URDS Upload ${URDSActive ? 'activated' : 'deactivated'}`;
							if (status === 'on') {
								const DetailsMessage = URDSActive ? ` URDSupload ist activated` : '';
								console.log(`${StatusMessage}${DetailsMessage}`);
								sendToast('info', 'URDS Upload', `is activated`, false, false);
								} 
						}	 
						break;
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

    // Initialize the alert button once the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        setupSendSocket();
        checkAdminMode();
        setTimeout(initializeURDSButton, 1000);
    });

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
            URDSButton.classList.add('hide-phone');
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
            URDSstartUpload();
            buttonPressStarted = null;
        }, 1000);
    }

    // Cancel the press timer and toggle alert status if needed
    function cancelPressTimer() {
        clearTimeout(pressTimer);
        if (buttonPressStarted) {
            toggleAlert();
			if (isTuneAuthenticated) {
				if (!URDSActive) {
					console.log(`URDS Upload deactivated`);
					sendToast('info', 'URDS Upload', 'Plugin deactivated', false, false);
				}
			}
        }
        buttonPressStarted = null;
    }

    // Funktion zum Senden einer Test-E-Mail
async function URDSstartUpload() {
    if (!isTuneAuthenticated) {
        sendToast('warning', 'URDS Upload', 'You must be authenticated as admin to use the URDS Upload feature!', false, false);
        return;
    }
    // if (!ValidEmailAddress && EmailAlert === 'on') {
        // sendToast('warning', 'URDS Upload', 'Valid email address not set on the webserver or in the URDS Upload config script!', false, false);
        // return;
    // }

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
        console.log(isTuneAuthenticated ? `DX ALERT Authentication successful.` : "Authentication failed.");
    }

})();
