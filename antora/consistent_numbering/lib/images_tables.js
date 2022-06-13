'use strict'
//-------------
//-------------
// Sub-extension that provides features for updating image and table counts with attributes.
// The following functions are included:
// * updateImageAndTableIndex
// * addImageOffsetAttributeToPage
// * addTableOffsetAttributeToPage
//
// The updateImageAndTableIndex function is exposed in the module.
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
const Helper = require('./helper.js')
const ContentAnalyzer = require("../../../core/content_analyzer.js")
const ContentManipulator = require("../../../core/content_manipulator.js")

// Core function of this feature. Gets the number of images and tables that fulfill the specified ASAM requirements and adds an attribute as offset value.
// Note: This addon requires the Asciidoctor extension "sectnumoffset_antora" to work!
/**
 * Updates a page's index attribute for images and tables.
 * @param {*} catalog - An array of pages and partials.
 * @param {Object} page - The current page.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {Number} imageIndex - The image index that needs to be applied as offset.
 * @param {Number} tableIndex - The table index that needs to be applied as offset.
 * @returns {Array} - [Updated image index, updated table index, number of level 2 sections ]
 */
function updateImageAndTableIndex(catalog, page, componentAttributes, imageIndex=0, tableIndex=0){
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    addImageOffsetAttributeToPage(page, newImageIndex)
    addTableOffsetAttributeToPage(page, newTableIndex)
    let [numberOfLevelTwoSections, numberOfImages, numberOfTables] = Helper.getIncludedPagesContentForExtensionFeatures(catalog, page, componentAttributes)
    // if (page.src.stem === "entity") {console.log(numberOfImages, numberOfTables, numberOfLevelTwoSections); throw ""}
    newImageIndex += parseInt(numberOfImages)
    newTableIndex += parseInt(numberOfTables)
    return ([newImageIndex,newTableIndex,numberOfLevelTwoSections])
}

/**
 * Adds an imageoffset attribute to a page with a given value.
 * @param {Object} page - The page the value needs to be applied to.
 * @param {Number} value - The value that is to be applied as image offset.
 */
function addImageOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "imageoffset", value)
}

/**
 * Adds an tableoffset attribute to a page with a given value.
 * @param {Object} page - The page the value needs to be applied to.
 * @param {Number} value - The value that is to be applied as table offset.
 */
function addTableOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "tableoffset", value)
}

module.exports = {
    updateImageAndTableIndex
}