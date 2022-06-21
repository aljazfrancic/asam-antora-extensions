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

/**
 *
 * @param {Array <Object>} catalog - The filtered content catalog for the current component-version combination.
 * @param {Object} componentAttributes - The attributes of the component.
 * @param {Map <String, Object>} anchorPageMap - A map containing anchors and their associated pages.
 * @param {String} style - The chosen xref style. Valid values: "full", "short", and "basic".
 */
function addXrefStyleToSectionAndPageXrefs (catalog, componentAttributes, anchorPageMap, style) {
    const appendixCaption = Object.keys(componentAttributes).indexOf("appendix-caption") > -1 ? componentAttributes["appendix-caption"] : "Appendix"
    const pages = catalog.filter(x => x.src.family === "page")
    switch(style) {
        case 'full':
        case 'short':
        case 'basic':
            pages.forEach((page) => {
                applyXrefStyle(catalog, componentAttributes, anchorPageMap, page, style, appendixCaption)
            })
            break;
        default:
            console.warn("ERROR - invalid xref style selected. No changes will be applied!");
            break;
    }
}

/**
 * Applies a chosen xref style to all xrefs found in a given page.
 * @param {Array <Object>} catalog - The filtered content catalog for the current component-version combination.
 * @param {Object} componentAttributes - The attributes of the component.
 * @param {Map <String, Object>} anchorPageMap - A map containing anchors and their associated pages.
 * @param {Object} file - The current file/page.
 * @param {String} style - The chosen xref style. Valid values: "full", "short", and "basic".
 * @param {String} appendixCaption - The set value of the appendix caption attribute.
 * @param {Object} inheritedAttributes - Optional: An object containing all aggregated page attributes.
 */
function applyXrefStyle (catalog, componentAttributes, anchorPageMap, file, style, appendixCaption, inheritedAttributes = {}) {
    const re = /xref:([^\[]*\.adoc)(#[^\[]*)?(\[)([^\]]*,\s*)*(xrefstyle=([^,\]]*))?(, *.*)*\]/gm
    if (!file.contents) {
        return
    }
    let reftext
    switch(style) {
        case 'full':
            reftext = ContentAnalyzer.getAttributeFromFile(file,"reftext_full");
            break;
        case 'short':
            reftext = ContentAnalyzer.getAttributeFromFile(file,"reftext_short");
            break;
        case 'basic':
            reftext = ContentAnalyzer.getAttributeFromFile(file,"reftext_basic");
            break;
    }
    if (reftext) {ContentManipulator.updateAttributeWithValueOnPage(file, "reftext", reftext)}
    // else {console.log("skipping file",file.src.relative)}
    let content = file.contents.toString().split("\n")
    for (let line of content) {
        let index = content.indexOf(line)
        ContentAnalyzer.updatePageAttributes(inheritedAttributes, line)
        let newLine = ContentAnalyzer.replaceAllAttributesInLine(componentAttributes, inheritedAttributes, line)
        re.lastIndex = 0
        let match
        while ((match = re.exec(newLine)) !== null) {
            if (match.index === re.lastIndex) {
                re.lastIndex++;
            }
            if (match[5] || match[4] || match[7] || (match[2] && (match[2].startsWith("fig-")||match[2].startsWith("tab-")))) {}
            else if (match[2]) {
                const targetPath = ContentAnalyzer.getSrcPathFromFileId(match[1])
                if (!targetPath.module) {targetPath.module = file.src.module}
                const xrefTarget = catalog.find(x => x.src.module == targetPath.module && x.src.relative === targetPath.relative)
                if (!xrefTarget) {console.warn("could not determine target of xref...", match[0]); continue}
                const xrefLabel = ContentAnalyzer.getReferenceNameFromSource(componentAttributes, anchorPageMap, catalog,xrefTarget,match[2].slice(1), style)
                const start = newLine.indexOf("[",match.index) +1
                if (xrefTarget === file || xrefLabel === "") {
                    newLine = newLine.slice(0,start) + `xrefstyle=${style}` + newLine.slice(start)
                }
                else {
                    newLine = newLine.slice(0,start) + `${xrefLabel}` + newLine.slice(start)
                }
                content[index] = newLine
            }
            else {
                const start = newLine.indexOf("[",match.index) +1
                newLine = newLine.slice(0,start) + `xrefstyle=${style}` + newLine.slice(start)
                content[index] = newLine
            }
        }

        let targetFile = ContentAnalyzer.checkForIncludedFileFromLine(catalog, file, newLine)
        if (targetFile) {
            applyXrefStyle(catalog, componentAttributes, targetFile, style, appendixCaption, inheritedAttributes)
        }
    }
    file.contents = Buffer.from(content.join("\n"))
}

module.exports = {
    addXrefStyleToSectionAndPageXrefs
}