'use strict'

const ContentAnalyzer = require("../../core/content_analyzer.js")

function addXrefStyleToSectionAndPageXrefs (catalog, componentAttributes, style) {
    const pages = catalog.filter(x => x.src.family === "page")
    switch(style) {
        case 'full':
        case 'short':
        case 'basic':
            pages.forEach((page) => {
                applyXrefStyle(catalog, componentAttributes, page, style)
            })
            break;
        default:
            console.warn("ERROR - invalid xref style selected. No changes will be applied!");
            break;
    }
}

function applyXrefStyle (catalog, componentAttributes, file, style, inheritedAttributes = {}) {
    const re = /xref:(.*).adoc(#.*)?(\[)(.*,\s*)*(xrefstyle=([^,\]]*))?(, *.*)*\]/gm
    if (!file.contents) {
        return
    }
    let content = file.contents.toString().split("\n")
    for (let line of content) {
        ContentAnalyzer.updatePageAttributes(inheritedAttributes, line)
        let newLine = ContentAnalyzer.replaceAllAttributesInLine(componentAttributes, inheritedAttributes, line)
        re.lastIndex = 0
        let match
        while (match = re.exec(newLine) !== null) {
            if (match.index === re.lastIndex) {
                re.lastIndex++;
            }
            if (match[5] || match[4] || match[7]) {continue;}
            else {
                const start = newLine.indexOf("[",match.index) +1
                newLine = newLine.slice(0,start) + `xrefstyle=${style}` + newLine.slice(start)
            }
        }

        let targetFile = ContentAnalyzer.checkForIncludedFileFromLine(catalog, file, line)
        if (targetFile) {
            applyXrefStyle(catalog, componentAttributes, targetFile, style, inheritedAttributes)
        }
    }
}

module.exports = {
    addXrefStyleToSectionAndPageXrefs
}