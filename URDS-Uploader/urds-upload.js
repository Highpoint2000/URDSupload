(() => {
  /////////////////////////////////////////////////////////////////////
  ///                                                               ///
  ///  URDS UPLOADER CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.1)       ///
  ///                                                               ///
  ///  by Highpoint                last update: 17.02.25            ///
  ///                                                               ///
  ///  https://github.com/Highpoint2000/URDSupload                  ///
  ///                                                               ///
  /////////////////////////////////////////////////////////////////////

  ///  This plugin only works from web server version 1.3.5 !!!

  const updateInfo = true; // Enable or disable version check

  /////////////////////////////////////////////////////////////////////

  const plugin_version = '1.1';
  const plugin_path = 'https://raw.githubusercontent.com/highpoint2000/URDSupload/';
  const plugin_JSfile = 'main/URDS-Uploader/urds-upload.js';
  const plugin_name = 'URDS Uploader';

  let wsSendSocket = null; // Global variable for WebSocket connection
  let URDSautoUpload;
  let URDSActive = false;
  let pressTimer;
  let buttonPressStarted = null; // Timestamp for button press start
  var isTuneAuthenticated = false;
  const PluginUpdateKey = `${plugin_name}_lastUpdateNotification`; // Unique key for localStorage

  // Generate a random 12-digit session ID to replace the IP address
  let sessionId = Math.floor(Math.random() * 1e12)
    .toString()
    .padStart(12, '0');

  const ipApiUrl = 'https://api.ipify.org?format=json'; // Placeholder URL (not used anymore)

  let checkSuccessTimer;

  // data_pluginsct WebserverURL and WebserverPORT from the current page URL
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

  // Function to check plugin version
  function checkplugin_version() {
    fetch(`${plugin_path}${plugin_JSfile}`)
      .then((response) => response.text())
      .then((script) => {
        const plugin_versionMatch = script.match(
          /const plugin_version = '([\d.]+[a-z]*)?';/
        );
        if (!plugin_versionMatch) {
          console.error(`${plugin_name}: Plugin version could not be found`);
          return;
        }

        const externalplugin_version = plugin_versionMatch[1];

        function compareVersions(local, remote) {
          const parseVersion = (version) =>
            version
              .split(/(\d+|[a-z]+)/i)
              .filter(Boolean)
              .map((part) => (isNaN(part) ? part : parseInt(part, 10)));

          const localParts = parseVersion(local);
          const remoteParts = parseVersion(remote);

          for (
            let i = 0;
            i < Math.max(localParts.length, remoteParts.length);
            i++
          ) {
            const localPart = localParts[i] || 0;
            const remotePart = remoteParts[i] || 0;

            if (typeof localPart === 'number' && typeof remotePart === 'number') {
              if (localPart > remotePart) return 1;
              if (localPart < remotePart) return -1;
            } else if (
              typeof localPart === 'string' &&
              typeof remotePart === 'string'
            ) {
              if (localPart > remotePart) return 1;
              if (localPart < remotePart) return -1;
            } else {
              return typeof localPart === 'number' ? -1 : 1;
            }
          }
          return 0;
        }

        const comparisonResult = compareVersions(plugin_version, externalplugin_version);
        if (comparisonResult === 1) {
          console.log(`${plugin_name}: The local version is newer than the plugin version.`);
        } else if (comparisonResult === -1) {
          if (shouldShowNotification()) {
            console.log(
              `${plugin_name}: Plugin update available: ${plugin_version} -> ${externalplugin_version}`
            );
            sendToast(
              'warning important',
              `${plugin_name}`,
              `Update available:<br>${plugin_version} -> ${externalplugin_version}`,
              false,
              false
            );
          }
        } else {
          console.log(`${plugin_name}: The local version matches the plugin version.`);
        }
      })
      .catch((error) => {
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
        wsSendSocket.addEventListener("error", (error) =>
          console.error("Send WebSocket error:", error)
        );
        wsSendSocket.addEventListener("close", (event) => {
          console.log("Send WebSocket closed:", event);
          setTimeout(setupSendSocket, 5000); // Reconnect after 5 seconds
        });
      } catch (error) {
        console.error("Failed to setup Send WebSocket:", error);
        sendToast('error important', 'URDSupload', `Failed to setup Send WebSocket`, false, false);
        setTimeout(setupSendSocket, 5000);
      }
    }
  }

  // Function to handle WebSocket messages
  function handleWebSocketMessage(event) {
    try {
      const eventData = JSON.parse(event.data);
      if (eventData.type === 'URDSupload' && eventData.source !== sessionId) {
        const currentTime = Date.now();
        if (
          !handleWebSocketMessage.lastProcessedTime ||
          currentTime - handleWebSocketMessage.lastProcessedTime >= 1000
        ) {
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
              if (document.getElementById('URDSupload-on-off')) {
                URDSActive = status === 'on';
                setButtonStatus(URDSActive);
              }
              if (
                isTuneAuthenticated &&
                (eventData.target === '000000000000' || eventData.target === sessionId)
              ) {
                const StatusMessage = `URDS Upload ${URDSActive ? 'activated' : 'deactivated'}`;
                if (status === 'on') {
                  console.log(`${StatusMessage}`);
                  sendToast('info', 'URDS Upload', `Autoupload activated`, false, false);
                } else {
                  console.log(`${StatusMessage}`);
                  sendToast('info', 'URDS Upload', `Autoupload deactivated`, false, false);
                }
              }
              break;
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
    if (isActive) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    console.log(`Button status set to: ${isActive ? 'Active' : 'Inactive'}`);
    URDSActive = isActive;
  }
}

  // ───────────────────────────────────────────────────────────────
  // Neue Button-Erstellung inklusive Migration der Event-Listener
  function createButton(buttonId) {
    (function waitForFunction() {
      const maxWaitTime = 10000;
      let functionFound = false;

      const observer = new MutationObserver((mutationsList, observer) => {
        if (typeof addIconToPluginPanel === 'function') {
          observer.disconnect();
          // Button über das Plugin-Panel erstellen
          addIconToPluginPanel(
            buttonId,
            "URDS",
            "solid",
            "upload",
            `Plugin Version: ${plugin_version}`
          );
          functionFound = true;

          const buttonObserver = new MutationObserver(() => {
            const $pluginButton = $(`#${buttonId}`);
            if ($pluginButton.length > 0) {
              // Event-Listener hinzufügen
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

    // Zusätzliche CSS-Anpassungen für den neuen Button
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

  // Startet den Press-Timer zur Erkennung eines langen Drucks
  function startPressTimer() {
    buttonPressStarted = Date.now();
    pressTimer = setTimeout(() => {
      // Bei langem Druck den Status umschalten
      toggleAlert();
      buttonPressStarted = null;
    }, 1000); // 1 Sekunde als Schwelle
  }

  // Bricht den Press-Timer ab und führt bei kurzem Druck den Upload aus
  function cancelPressTimer() {
    clearTimeout(pressTimer);
    if (buttonPressStarted) {
      URDSstartUpload();
    }
    buttonPressStarted = null;
  }

  // Startet den Upload
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
      sendToast('error', 'DX-URDS Upload', `Error! Failed to start URDS Upload!`, false, false);
    }
  }

  // Umschalten des Alert-Status und Aktualisierung via WebSocket
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

  // Prüft, ob der Administrator angemeldet ist
  function checkAdminMode() {
    const bodyText = document.body.textContent || document.body.innerText;
    isTuneAuthenticated =
      bodyText.includes("You are logged in as an administrator.") ||
      bodyText.includes("You are logged in as an adminstrator.");
    console.log(
      isTuneAuthenticated
        ? `URDS Upload Authentication successful.`
        : "Authentication failed."
    );
  }

  // Initialisierung nach DOM-Load
  document.addEventListener('DOMContentLoaded', () => {
    setupSendSocket();
    checkAdminMode();
    // Neuen Button erstellen
    createButton('URDSupload-on-off');
  });

  setTimeout(() => {
    if (updateInfo && isTuneAuthenticated) {
      checkplugin_version();
    }
  }, 200);

})();
