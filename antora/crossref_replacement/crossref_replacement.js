'use strict'

const ContentAnalyzer = require("../../core/content_analyzer.js")


function findAndReplaceLocalReferencesToGlobalAnchors( anchorMap, pages ) {
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
            if (anchorMap.get(ref[1])) {
                const referencePage = [...anchorMap.get(ref[1])][0]
                if (page !== referencePage) {
                    let [autoAltText, altLink] = ContentAnalyzer.getReferenceNameFromSource( pages, referencePage, ref[1] )
                    const altText = ref[3] ? ref[3] : autoAltText
                    const anchorLink = altLink ? altLink : ref[1]
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