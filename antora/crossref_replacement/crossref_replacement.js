'use strict'
//-------------
//-------------
// Module for replacing local crossrefs to content located on different pages with xref macro.
// This module provides a central function, 'findAndReplaceLocalReferencesToGlobalAnchors', that, if at least one valid anchor was found, parses each adoc file in a component-version-combination.
// It then checks if any unresolved local references are found and tries to replace them with global xrefs.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
const ContentAnalyzer = require("../../core/content_analyzer.js")

/**
 * If a non-empty anchorMap is supplied, this function parses all pages and tries to replace unresolved local links with global xrefs.
 * @param {Object} componentAttributes - An object containing all component attributes.
 * @param {Map <String, Object>} anchorMap - A map of anchors and their page.
 * @param {Array <Object>} pages - An array of pages.
 * @param {String} alternateXrefStyle - (Optional) A string with an alternate xref style when using the xref style replacement.
 * @returns {Array <Object>} The updated array of pages.
 */
function findAndReplaceLocalReferencesToGlobalAnchors( componentAttributes, anchorMap, pages, alternateXrefStyle=null ) {
    if (anchorMap.size === 0) {return pages}
    const re = /<<([^>,]+)(,\s*([^>]+))?>>/g
    const reAlt = /xref:{1,2}#([^\[]+)\[(([^\]]*))\]/gm
    pages.forEach(page => {
        let content = page.contents.toString()
        let references = [...content.matchAll(re)]
        const referencesAlt = [...content.matchAll(reAlt)]
        if (references.length < 1 ) {references = referencesAlt}
        else {
            if (referencesAlt.length > 0) {references = references + referencesAlt}
        }
        references.forEach(ref => {
            let debug = false
            if(ref[1] === "fig-60c22aa8-d229-456a-b39d-645b894d4cad") {console.log("fig-60c22aa8-d229-456a-b39d-645b894d4cad"); debug = true}
            if (anchorMap.get(ref[1])) {
                const val = anchorMap.get(ref[1])
                let referencePage
                if (val.usedIn && val.usedIn.length > 1) {
                    console.log(`Anchor ${ref[1]} used in multiple pages. Cannot determine actual source for local link in page ${page.src.relative}. Using fist valid entry instead...`)
                    referencePage = val.usedIn[0]
                }
                else if (val.usedIn) {
                    referencePage = val.usedIn[0]
                }
                else {
                    referencePage = val.source
                }

                // if (page !== referencePage )
                // if ( ref[1].startsWith("top-") || ref[1].startsWith("sec-") ) {
                if ( true ) {
                    const tempStyle = componentAttributes.xrefstyle ? componentAttributes.xrefstyle.replace("@","") : ""
                    let autoAltText = ref[1].startsWith("top-") ? "" : ref[1].startsWith("sec-") && alternateXrefStyle && alternateXrefStyle !== "" ? "" : ContentAnalyzer.getReferenceNameFromSource( componentAttributes, anchorMap, pages, referencePage, ref[1], tempStyle )
                    const altText = ref[3] ? ref[3] : autoAltText
                    const anchorLink = ref[1]
                    const replacementXref = "xref:"+referencePage.src.component+":"+referencePage.src.module+":"+referencePage.src.relative+"#"+anchorLink+"["+altText+"]"
                    content = content.replace(ref[0],replacementXref)
                }
            }
        })
        page.contents = Buffer.from(content)
    })
    return pages
}

module.exports = {
    findAndReplaceLocalReferencesToGlobalAnchors
}