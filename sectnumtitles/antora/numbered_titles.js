'use strict'

const style = sectionNumberStyle ? sectionNumberStyle : "default"
let appendixCaption = "Appendix"
let appendixOffset = 0
const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
if (Object.keys(componentAttributes).indexOf("appendix-caption") > -1) {
    appendixCaption = componentAttributes["appendix-caption"]
}
if (Object.keys(componentAttributes).indexOf("appendix-offset") > -1) {
    appendixOffset = componentAttributes["appendix-offset"]
}
generatePageNumberBasedOnNavigation(pages, navFiles, style, appendixCaption, appendixOffset)

