const { Config } = require('@remotion/cli/config');

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Las capturas son JPEG y ocupan casi toda la pantalla: con CRF más bajo el
// archivo crece sin que se note, y este video se manda por WhatsApp.
Config.setCrf(20);
