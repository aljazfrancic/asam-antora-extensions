'use strict'
//-------------
//-------------
// Module for adding explicit xref styles to certain xrefs.
// This module provides a central function, 'addXrefStyleToSectionAndPageXrefs'.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------

const ContentAnalyzer = require("../../core/content_analyzer.js")
const ContentManipulator = require("../../core/content_manipulator.js")

function addXrefStyleToSectionAndPageXrefs (catalog, componentAttributes, style) {
    const appendixCaption = Object.keys(componentAttributes).indexOf("appendix-caption") > -1 ? componentAttributes["appendix-caption"] : "Appendix"
    const pages = catalog.filter(x => x.src.family === "page")
    switch(style) {
        case 'full':
        case 'short':
        case 'basic':
            pages.forEach((page) => {
                applyXrefStyle(catalog, componentAttributes, page, style, appendixCaption)
            })
            break;
        default:
            console.warn("ERROR - invalid xref style selected. No changes will be applied!");
            break;
    }
}

function applyXrefStyle (catalog, componentAttributes, file, style, appendixCaption, inheritedAttributes = {}) {
    const re = /xref:(.*).adoc(#.*)?(\[)(.*,\s*)*(xrefstyle=([^,\]]*))?(, *.*)*\]/gm
    if (!file.contents) {
        return
    }
    let content = file.contents.toString().split("\n")
    let title = file.contents.toString().match(/^= (.*)$/m) ? file.contents.toString().match(/^= (.*)$/m)[1].trim() : ""
    if (title === "") {
        return
    }
    let titleoffset = ContentAnalyzer.getAttributeFromFile(file, "titleoffset")
    const titleprefix = ContentAnalyzer.getAttributeFromFile(file, "titleprefix", 10)
    let navtitle = title
    if (titleprefix) {
        navtitle = `${titleprefix.trim()} ${title}`
        title = `${titleprefix.trim()}, "${title}"`
    }
    else if (titleoffset) {
       navtitle = `${titleoffset.trim()} ${title}`
       title = `${titleoffset.trim()}, "${title}"`
       title = isNaN(title.charAt(0)) ? `${appendixCaption} ${title}` : "Section " + title
    }
    else {
        title = `"${title}"`
    }
    ContentManipulator.updateAttributeWithValueOnPage(file, "navtitle", navtitle)
    ContentManipulator.updateAttributeWithValueOnPage(file, "reftext", title)
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
            applyXrefStyle(catalog, componentAttributes, targetFile, style, appendixCaption, inheritedAttributes)
        }
    }
}

module.exports = {
    addXrefStyleToSectionAndPageXrefs
}