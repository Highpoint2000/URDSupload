# URDS Uploader Plugin for [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver)

This plugin provides automaticly and manual upload functions for the scanner plugin.

![image](https://github.com/user-attachments/assets/d52b2e22-59d6-4b64-81c6-449300ef0f36)


### v1.0a (only use with Scanner Plugin!)

- URDS upload button function swapped: long press toggles auto upload mode / short press starts manual upload
- Fixed problem with missing form-data module
- Counting PI codes and PS information revised

## Installation notes:

1. [Download](https://github.com/Highpoint2000/URDSupload/releases) the last repository as a zip
2. Unpack all files from the plugins folder to ..fm-dx-webserver-main\plugins\ 
3. Stop or close the fm-dx-webserver
4. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations
5. Activate the URDS Uploader plugin in the settings
6. Stop or close the fm-dx-webserver
7. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations
8. Configure your personal settings in the automatically created urds-upload.json (in the folder: ../fm-dx-webserver-main/plugins_configs)
9. Stop or close the fm-dx-webserver
10. Start/Restart the fm-dx-webserver with "npm run webserver" on node.js console, check the console informations

 ## Configuration options:

The following variables can be changed in the urds-upload.json:

    URDSautoUpload: 'on', 			// Set Auto Upload after 0:00 UTC 'on' or 'off'
    FMLIST_OM_ID: '',               	// Enter your OM ID here, for example: FMLIST_OM_ID: '1234', if no OMID is entered under FMLIST INTEGRATION on the web server
    FMLIST_EMAIL: '',              	 	// Enter your EMAIL here, for example: FMLIST_EMAIL: 'xxx@xxx.com', if no email is entered under IDENTIFICATION & MAP on the web server or it is another email adress
   	ServerName: '', 			// Enter your RaspiID or another name for the server, if left blank the name will be taken from the web server
	ServerDescription: '',			// Enter a comment or description for the server, if left blank the name will be taken from the web server
   	PublicationMode: 'public',		// Enter the publishing mode: 'public', 'owner' or 'restricted' (default: 'public')
	OperatingMode: 'fixed'			// Enter 'mobile' or 'fixed' for stationary operation

## Important notes: 

- To start the upload manually, press the URDS upload button. A short time later a toast message appears indicating whether the upload worked
- To enable/disable automatic upload, long press the URDS upload button. The automatic upload starts at 0:00 UTC with a random delay time (max. 120 minutes)
- The CSV log files originally created by the scanner plugin are saved as .backup under /web/logs, all uploaded files are saved under /web/logs/sent after the upload
- Processing on the FMLIST server takes different amounts of time and only takes place if the OMID and email address match the FMLIST account details 
  
## History: 
  
## v1.0 (only use with Scanner Plugin!)

- first edition
