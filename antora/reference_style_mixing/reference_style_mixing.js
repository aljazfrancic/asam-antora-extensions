'use strict'

const ContentAnalyzer = require("../../core/content_analyzer.js")

function addXrefStyleToSectionAndPageXrefs (catalog, style) {
    switch(style) {
        case 'full':
            console.log("Replacing with full")
        case 'short':
            console.log("Replacing with short")
        case 'basic':
            console.log("Replacing with basic")
            applyXrefStyle(catalog, style)
            break;
        default:
            console.warn("ERROR - invalid xref style selected. No changes will be applied!")
            break;
    }
}

function applyXrefStyle (catalog, componenAttributes, style) {
    const re = /xref:(.*).adoc(#.*)?(\[)(.*,\s*)*(xrefstyle=([^,\]]*))?(, *.*)*\]/gm
    for (let file of catalog) {
        ContentAnalyzer.attribu
        if (!file.contents) {
            continue
        }
        let content = file.contents.toString().split("\n")
        for (let line of content) {
            re.lastIndex = 0
            let match
            while (match = re.exec(line) !== null) {
                if (match.index === re.lastIndex) {
                    re.lastIndex++;
                }
                if (match[5] || match[4] || match[7]) {continue;}

            }
        }

    }
}

module.exports = {
    addXrefStyleToSectionAndPageXrefs
}