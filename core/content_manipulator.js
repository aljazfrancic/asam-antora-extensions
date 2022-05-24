'use strict'

const ContentAnalyzer = require('./content_analyzer.js')

function addAttributeWithValueToPage( page, pageContent, indexOfTitle, attribute, value, unset=false ) {
    const attr = unset ? ":"+attribute+"!: "+value : ":"+attribute+": "+value.toString()
    pageContent.splice(indexOfTitle+1,0,attr)
    page.contents = Buffer.from(pageContent.join("\n"))
}

function addSpecialSectionTypeToPage( page, specialSectionType ){
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    newContent.splice(indexOfTitle+1,0,"["+specialSectionType+"]")
    page.contents = Buffer.from(newContent.join("\n"))
}




module.exports = {
    addAttributeWithValueToPage,
    addSpecialSectionTypeToPage
}