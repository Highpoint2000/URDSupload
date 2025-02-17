# URDS Uploader Plugin for [FM-DX-Webserver](https://github.com/NoobishSVK/fm-dx-webserver)

This plugin provides automaticly and manual upload functions for the scanner plugin.

![image](https://github.com/user-attachments/assets/d52b2e22-59d6-4b64-81c6-449300ef0f36)

## Version 1.1 (only works from web server version 1.3.5!!!)

- Design adjustments for web server version 1.3.5

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

    URDSautoUpload: 'off', 			// Set Auto Upload after 0:00 UTC 'on' or 'off'
    CombineFiles: 'on',			// Combine all files before uploading / set it 'on' or 'off'/ default is 'on'
    FMLIST_OM_ID: '',               	// Enter your OM ID here, for example: FMLIST_OM_ID: '1234', if no OMID is entered under FMLIST INTEGRATION on the web server
    FMLIST_EMAIL: '',              	 	// Enter your EMAIL here, for example: FMLIST_EMAIL: 'xxx@xxx.com', if no email is entered under IDENTIFICATION & MAP on the web server or it is another email adress
   	ServerName: '', 			// Enter your RaspiID or another name for the server, if left blank the name will be taken from the web server
	ServerDescription: '',			// Enter a comment or description for the server, if left blank the name will be taken from the web server
   	PublicationMode: 'public',		// Enter the publishing mode: 'public', 'owner' or 'restricted' (default: 'public')
	OperatingMode: 'fixed'			// Enter 'mobile' or 'fixed' for stationary operation

## Important notes: 

- To start the upload manually, press the URDS upload button. A short time later a toast message appears indicating whether the upload worked
- To enable/disable automatic upload, long press the URDS upload button. The automatic upload starts at 0:00 UTC with a random delay time (max. 120 minutes)
- The CSV log files originally created by the scanner plugin are saved under /web/logs/backup, all uploaded files are saved under /web/logs/sent after the upload
- Processing on the FMLIST server takes different amounts of time and only takes place if the OMID and email address match the FMLIST account details 
  
## History: 

### v1.0g (only use with Scanner Plugin from Version 3.1!)

- Added dbµV flag

### v1.0f (only use with Scanner Plugin from Version 3.1!)

- Bug fixing and code optimizations

### v1.0e (only use with Scanner Plugin from Version 3.1!)

- Column 30 is now added during upload

### v1.0d (only use with Scanner Plugin from Version 3.0 BETA 11!)

- backups are now saved in a separate directory

### v1.0b (only use with Scanner Plugin from Version 3.0 BETA 11!)

- URDS upload button is now visible on mobile devices
- Added option to merge files before uploading
- Plugin versions used are written to the log

### v1.0a (only use with Scanner Plugin from Version 3.0 BETA 11!)

- URDS upload button function swapped: long press toggles auto upload mode / short press starts manual upload
- Fixed problem with missing form-data module
- Counting PI codes and PS information revised
- Additional information about the system is added to the log file
  
### v1.0 (only use with Scanner Plugin!)

- first edition
