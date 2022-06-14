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
    const re = /xref:(.*\.adoc)(#.*)?(\[)(.*,\s*)*(xrefstyle=([^,\]]*))?(, *.*)*\]/gm
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
        while ((match = re.exec(newLine)) !== null) {
            if (line.includes("#top-lc-syntax-grammar")) {console.log(match.index)}
            if (match.index === re.lastIndex) {
                re.lastIndex++;
            }
            if (match[5] || match[4] || match[7]) {continue;}
            // else if (match[2]) {
            //     const start = newLine.indexOf("[",match.index) +1
            //     let label = ""
            //     console.log("anchor found: "+match[2])
            //     const targetPath = ContentAnalyzer.getSrcPathFromFileId(match[1])
            //     if (!targetPath.module) {targetPath.module = file.src.module}
            //     const xrefTarget = catalog.find(x => x.src.module == targetPath.module && x.src.relative === targetPath.relative)
            //     if (xrefTarget) {
            //         const reAnchor = new RegExp(`\[\[${match[2].slice(1)}(,([^\]]*))?\]\]|\[${match[2]}\]|anchor:${match[2].slice(1)}\[`)
            //         const xrefContent =xrefTarget.contents.toString()
            //         const startIndex = xrefContent.match(reAnchor)
            //         if (startIndex) {
            //             let titleMatch
            //             const forwardContent = xrefContent.slice(startIndex).split("\n")
            //             const backwardContent = xrefContent.slice(0,startIndex).split("\n").reverse()
            //             const reTitle = /^=+ +(.*)|^\.(\S.*)/
            //             for (let i = 0; i <= 3; i++) {
            //                 titleMatch = forwardContent[i].match(reTitle)
            //                 if (titleMatch) {
            //                     break;
            //                 }
            //             }
            //             if (!titleMatch) {
            //                 for (let i = 0; i <= 3; i++) {
            //                     titleMatch = backwardContent[i].match(reTitle)
            //                     if (titleMatch) {
            //                         break;
            //                     }
            //                 }
            //             }
            //             if (titleMatch[1]) {
            //                 label = titleMatch[1].trim().starts
            //             }
            //             else if (titleMatch[2])
            //         }
            //         else {
            //             console.warn("could not solve anchor in xref")
            //         }
            //     }
            //     newLine = newLine.slice(0,start) + label + newLine.slice(start)
            //     content[content.indexOf(line)] = newLine
            // }
            else {
                const start = newLine.indexOf("[",match.index) +1
                newLine = newLine.slice(0,start) + `xrefstyle=${style}` + newLine.slice(start)
                content[content.indexOf(line)] = newLine
            }
        }

        let targetFile = ContentAnalyzer.checkForIncludedFileFromLine(catalog, file, line)
        if (targetFile) {
            applyXrefStyle(catalog, componentAttributes, targetFile, style, appendixCaption, inheritedAttributes)
        }
    }
    file.contents = Buffer.from(content.join("\n"))
}

module.exports = {
    addXrefStyleToSectionAndPageXrefs
}