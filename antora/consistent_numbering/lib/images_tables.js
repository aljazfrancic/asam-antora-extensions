'use strict'

const Helper = require('./helper.js')
const ContentAnalyzer = require("../../../core/content_analyzer.js")
const ContentManipulator = require("../../../core/content_manipulator.js")

// Core function of this feature. Gets the number of images and tables that fulfill the specified ASAM requirements and adds an attribute as offset value.
// Note: This addon requires the Asciidoctor extension "sectnumoffset_antora" to work!
function updateImageAndTableIndex(pages, page, imageIndex=0, tableIndex=0){
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    addImageOffsetAttributeToPage(page, newImageIndex)
    addTableOffsetAttributeToPage(page, newTableIndex)
    let [numberOfLevelTwoSections, numberOfImages, numberOfTables] = Helper.getIncludedPagesContentForExtensionFeatures(pages, page)
    newImageIndex += parseInt(numberOfImages)
    newTableIndex += parseInt(numberOfTables)
    return ([newImageIndex,newTableIndex,numberOfLevelTwoSections])
}

function addImageOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "imageoffset", value)
}

function addTableOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "tableoffset", value)
}

module.exports = {
    updateImageAndTableIndex
}