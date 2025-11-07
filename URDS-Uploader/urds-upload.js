(() => {
  /////////////////////////////////////////////////////////////////////
  ///                                                               ///
  ///  URDS UPLOADER CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.1e)      ///
  ///                                                               ///
  ///  by Highpoint                last update: 07.11.25            ///
  ///                                                               ///
  ///  https://github.com/Highpoint2000/URDSupload                  ///
  ///                                                               ///
  /////////////////////////////////////////////////////////////////////

  ///  This plugin only works with scanner version 3.8f !!!

  // Enable or disable version check
  const pluginSetupOnlyNotify = true;
  const CHECK_FOR_UPDATES = true;

  /////////////////////////////////////////////////////////////////////

  const pluginVersion = '1.1e'; 
  const pluginName = "URDS Uploader";
  const pluginHomepageUrl = "https://github.com/Highpoint2000/URDSupload/releases";
  const pluginUpdateUrl = "https://raw.githubusercontent.com/highpoint2000/URDSupload/main/URDS-Uploader/urds-upload.js";


  let wsSendSocket = null; // Global variable for WebSocket connection
  let URDSautoUpload;
  let URDSActive = false;
  let pressTimer;
  let buttonPressStarted = null; // Timestamp for button press start
  var isTuneAuthenticated = false;

  // Generate a random 12-digit session ID to replace the IP address
  let sessionId = Math.floor(Math.random() * 1e12)
    .toString()
    .padStart(12, '0');

  let checkSuccessTimer;

  // Get data for WebserverURL and WebserverPORT from the current URL
  const currentURL = new URL(window.location.href);
  const WebserverURL = currentURL.hostname;
  const WebserverPath = currentURL.pathname.replace(/setup/g, '');
  let WebserverPORT =
    currentURL.port || (currentURL.protocol === 'https:' ? '443' : '80');

  // Determine WebSocket protocol and port
  const protocol = currentURL.protocol === 'https:' ? 'wss:' : 'ws:';
  const WebsocketPORT = WebserverPORT; // Use the same port as HTTP/HTTPS
  const WEBSOCKET_URL = `${protocol}//${WebserverURL}:${WebsocketPORT}${WebserverPath}data_plugins`;

  // Function to check if the notification was shown today
  function shouldShowNotification() {
    const lastNotificationDate = localStorage.getItem(PluginUpdateKey);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (lastNotificationDate === today) {
      return false; // Already shown today
    }
    localStorage.setItem(PluginUpdateKey, today);
    return true;
  }

  // Show update notification only on /setup if setupOnly is true
function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
    if (setupOnly && window.location.pathname !== '/setup') return;

    let pluginVersionCheck = typeof pluginVersion !== 'undefined' ? pluginVersion : typeof pluginVersion !== 'undefined' ? pluginVersion : typeof pluginVersion !== 'undefined' ? pluginVersion : 'Unknown';

    // Fetch the plugin file and extract version
    async function fetchFirstLine() {
        try {
            const response = await fetch(urlFetchLink);
            if (!response.ok) {
                throw new Error(`[${pluginName}] update check HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            const lines = text.split('\n');
            let version;

            if (lines.length > 2) {
				// Try to match any of: pluginVersion, plugin_version, PLUGIN_VERSION
				const versionLine = lines.find(line =>
					/const\s+(pluginVersion|plugin_version|PLUGIN_VERSION)\s*=/.test(line)
				);
				if (versionLine) {
					const match = versionLine.match(/const\s+(?:pluginVersion|plugin_version|PLUGIN_VERSION)\s*=\s*['"]([^'"]+)['"]/);
					if (match) {
						version = match[1];
					}
				}
            }

            if (!version) {
                const firstLine = lines[0].trim();
                version = /^\d/.test(firstLine) ? firstLine : "Unknown";
            }

            return version;
        } catch (error) {
            console.error(`[${pluginName}] error fetching file:`, error);
            return null;
        }
    }

    // Show update info in the setup UI
    function setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink) {
        if (window.location.pathname === '/setup') {
            const pluginSettings = document.getElementById('plugin-settings');
            if (pluginSettings) {
                const currentText = pluginSettings.textContent.trim();
                const newText = `<a href="${urlUpdateLink}" target="_blank">[${pluginName}] Update available: ${pluginVersionCheck} → ${newVersion}</a><br>`;
                if (currentText === 'No plugin settings are available.') {
                    pluginSettings.innerHTML = newText;
                } else {
                    pluginSettings.innerHTML += ' ' + newText;
                }
            }

            // Optional: Red dot on plugin icon
            const updateIcon = document.querySelector('.wrapper-outer #navigation .sidenav-content .fa-puzzle-piece') || document.querySelector('.wrapper-outer .sidenav-content') || document.querySelector('.sidenav-content');
            if (updateIcon) {
                const redDot = document.createElement('span');
                redDot.style.display = 'block';
                redDot.style.width = '12px';
                redDot.style.height = '12px';
                redDot.style.borderRadius = '50%';
                redDot.style.backgroundColor = '#FE0830';
                redDot.style.marginLeft = '82px';
                redDot.style.marginTop = '-12px';
                updateIcon.appendChild(redDot);
            }
        }
    }

    // Perform the version check
    fetchFirstLine().then(newVersion => {
        if (newVersion) {
            if (newVersion !== pluginVersionCheck) {
                let updateConsoleText = "There is a new version of this plugin available";
                console.log(`[${pluginName}] ${updateConsoleText}`);
                setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink);
            }
        }
    });
}

// Run the update check if enabled
if (CHECK_FOR_UPDATES) checkUpdate(pluginSetupOnlyNotify, pluginName, pluginHomepageUrl, pluginUpdateUrl);

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
        wsSendSocket.addEventListener("error", (error) =>
          console.error("Send WebSocket error:", error)
        );
        wsSendSocket.addEventListener("close", (event) => {
          console.log("Send WebSocket closed:", event);
          setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
        });
      } catch (error) {
        console.error("Failed to setup Send WebSocket:", error);
        sendToast('error important', 'URDSupload', 'Failed to setup Send WebSocket', false, false);
        setTimeout(setupSendSocket, 5000);
      }
    }
  }

  // Function to handle WebSocket messages
  function handleWebSocketMessage(event) {
    try {
      const eventData = JSON.parse(event.data);
      // console.log('Received message:', eventData);

      // Check if this is a URDSupload message and the sender is not our own session ID
      if (eventData.type === 'URDSupload' && eventData.source !== sessionId) {
        // Check if the button exists in the DOM
        const btn = document.getElementById('URDSupload-on-off');
        if (!btn) {
          // console.warn('Button not yet present, delaying status update.');
          // If the button is not yet present, delay processing the message by 500 ms
          setTimeout(() => handleWebSocketMessage(event), 500);
          return;
        }

        // Optional: Throttling to prevent multiple processing events
        const currentTime = Date.now();
        if (
          !handleWebSocketMessage.lastProcessedTime ||
          currentTime - handleWebSocketMessage.lastProcessedTime >= 1000
        ) {
          handleWebSocketMessage.lastProcessedTime = currentTime;
          const { status } = eventData.value;
          switch (status) {
            case 'success':
              if (eventData.target === sessionId) {
                if (status === 'on') {
                  sendToast('success important', 'URDS Upload', 'URDSupload activated', false, false);
                  console.log("Server response: URDS Upload activated");
                } else {
                  sendToast('error', 'URDS Upload', 'no services are configured!', false, false);
                }
              }
              break;
            case 'ok':
              console.log('URDS Upload started successfully');
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
              console.warn("URDS Upload has no files to upload.");
              sendToast('warning', 'URDS Upload', 'No files to upload!', false, false);
              break;
            case 'fail':
              console.error("URDS Upload failed to create gzipped file.");
              sendToast('error important', 'URDS Upload', 'Failed to create gzipped file!', false, false);
              break;
            case 'on':
            case 'off':
              // Status 'on' or 'off' is used to toggle the button status
              URDSActive = status === 'on';
              setButtonStatus(URDSActive);
              if (isTuneAuthenticated && (eventData.target === '000000000000' || eventData.target === sessionId)) {
                const StatusMessage = `URDS Upload ${URDSActive ? 'activated' : 'deactivated'}`;
                if (status === 'on') {
                  console.log(StatusMessage);
                  sendToast('info', 'URDS Upload', 'Autoupload activated', false, false);
                } else {
                  console.log(StatusMessage);
                  sendToast('info', 'URDS Upload', 'Autoupload deactivated', false, false);
                }
              }
              break;
            default:
              console.warn('Unknown status received:', status);
          }
        } else {
          console.log("Throttling: Ignored message due to time limit.");
        }
      }

      if (checkSuccessTimer) {
        clearTimeout(checkSuccessTimer);
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  }

  // Send an initial WebSocket message with the session ID
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
    const btn = document.getElementById('URDSupload-on-off');
    if (btn) {
      // console.log('Updating button status:', isActive);
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      // console.log(`Button status set to: ${isActive ? 'Active' : 'Inactive'}`);
      URDSActive = isActive;
    } else {
      console.error('Button not found!');
    }
  }

  // ───────────────────────────────────────────────────────────────
  // New button creation including migration of event listeners
  function createButton(buttonId) {
    (function waitForFunction() {
      const maxWaitTime = 10000;
      let functionFound = false;

      const observer = new MutationObserver((mutationsList, observer) => {
        if (typeof addIconToPluginPanel === 'function') {
          observer.disconnect();
          // Create button via the Plugin Panel
          addIconToPluginPanel(
            buttonId,
            "URDS",
            "solid",
            "upload",
            `Plugin Version: ${pluginVersion}`
          );
          functionFound = true;

          const buttonObserver = new MutationObserver(() => {
            const $pluginButton = $(`#${buttonId}`);
            if ($pluginButton.length > 0) {
              // Add event listeners
              $pluginButton.on('mousedown', startPressTimer);
              $pluginButton.on('mouseup mouseleave', cancelPressTimer);
              buttonObserver.disconnect();
            }
          });
          buttonObserver.observe(document.body, { childList: true, subtree: true });
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        if (!functionFound) {
          console.error(`Function addIconToPluginPanel not found after ${maxWaitTime / 1000} seconds.`);
        }
      }, maxWaitTime);
    })();

    // Additional CSS adjustments for the new button
    const aURDSuploadCss = `
    #${buttonId}:hover {
      color: var(--color-5);
      filter: brightness(120%);
    }
    #${buttonId}.active {
      background-color: var(--color-2) !important;
      filter: brightness(120%);
    }
    `;
    $("<style>")
      .prop("type", "text/css")
      .html(aURDSuploadCss)
      .appendTo("head");
  }

  // Start the press timer to detect a long press
  function startPressTimer() {
    buttonPressStarted = Date.now();
    pressTimer = setTimeout(() => {
      // On long press, toggle the status
      toggleAlert();
      buttonPressStarted = null;
    }, 1000); // 1 second threshold
  }

  // Cancel the press timer and initiate upload on short press
  function cancelPressTimer() {
    clearTimeout(pressTimer);
    if (buttonPressStarted) {
      URDSstartUpload();
    }
    buttonPressStarted = null;
  }

  // Start the upload
  async function URDSstartUpload() {
    if (!isTuneAuthenticated) {
      sendToast(
        'warning',
        'URDS Upload',
        'You must be authenticated as admin to use the URDS Upload feature!',
        false,
        false
      );
      return;
    }

    console.log('URDS Upload initiated.');

    try {
      const message = JSON.stringify({
        type: 'URDSupload',
        value: { status: 'start' },
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
      sendToast('error', 'DX-URDS Upload', 'Error! Failed to start URDS Upload!', false, false);
    }
  }

  // Toggle alert status and update via WebSocket
  async function toggleAlert() {
    if (!isTuneAuthenticated) {
      sendToast(
        'warning',
        'URDS Upload',
        'You must be authenticated as admin to use the URDS Upload feature!',
        false,
        false
      );
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

  // Check if the administrator is logged in
  function checkAdminMode() {
    const bodyText = document.body.textContent || document.body.innerText;
    isTuneAuthenticated =
      bodyText.includes("You are logged in as an administrator.") ||
      bodyText.includes("You are logged in as an adminstrator.");
    console.log(
      isTuneAuthenticated
        ? 'URDS Upload Authentication successful.'
        : 'Authentication failed.'
    );
  }

  // Initialization after DOM load
  document.addEventListener('DOMContentLoaded', () => {
    setupSendSocket();
    checkAdminMode();
    // Create the new button
    createButton('URDSupload-on-off');
  });

})();
