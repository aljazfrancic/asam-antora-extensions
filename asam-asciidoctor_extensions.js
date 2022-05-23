// This extension collects all other extensions with an anonymous function.
// To add more custom extensions, add them as "require" on top and then call their "register" function in the modules.exports part below.

// Import modules here
const tabs = require('./tabs-block/extension.js');
const iso = require('./sectnumtitles/asciidoctor/sectnums_to_iso.js');
const off = require('./sectnumtitles/asciidoctor/sectnumsoffset_antora.js');

// Export every module's anonymous function within one wrapper function
module.exports = function (registry) {
    iso(registry);
    off(registry);
}