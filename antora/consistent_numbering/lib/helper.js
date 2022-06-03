'use strict'
//-------------
//-------------
// This is a collection of helper functions for the consistent_numbering extension.
// The following functions are included:
// * setStartingChapterIndex
// * determineNextChapterIndex
// * unsetSectnumsAttributeInFile
// * addTitleoffsetAttributeToPage
// * checkForSectnumsAttribute
// * checkForRoleInLine
// * getIncludedPagesContentForExtensionFeatures
//
// All included functions are exposed in the module.
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
const ContentAnalyzer = require('../../../core/content_analyzer.js')
const ContentManipulator = require('../../../core/content_manipulator.js')

/**
 * Determines the correct starting index of a chapter/section depending on the style (ends with "." or not).
 * @param {String} style - The chosen section number style. If "iso", will not contain the default "." at the end.
 * @param {String} value - The value where the style is to be applied to.
 * @returns {String} - The updated value.
 */
function setStartingChapterIndex( style, value ) {
    return style === "iso" ? value : value+"."
}

/**
 * Determine the next chapter index based on the current value and the new target level.
 * For Appendices, also determine the correct starting letter.
 * @param {Number} targetLevel - The level of section or page heading.
 * @param {String} chapterIndex - The current chapter index for which the next value is to be determined.
 * @param {String} style - The chosen section number style. If "iso", will not contain the default "." at the end."
 * @param {String} appendixCaption - Optional: Applies to appendices. If set, the first element of the index will be a letter.
 * @returns {String} - The next chapter index value.
 */
function determineNextChapterIndex( targetLevel, chapterIndex="0.", style, appendixCaption="" ) {
    //-------------
    // Apply style behavior and, if requested, determine the current Appendix value.
    //-------------
    let chapterElements = chapterIndex.split(".")
    if (style !== "iso") {chapterElements.pop()}
    const currentChapterIndexLength = Math.max(1,chapterElements.length)
    if (appendixCaption) {
        if (targetLevel === 1) {
            if (isNaN(parseInt(chapterElements[0]))) {
                chapterElements[0] = String.fromCharCode(chapterElements[0].charCodeAt(0) + 1)
            }
            else {
                chapterElements[0] = "A"
            }
        }
    }
    //-------------
    // Add 1s to the end if the current number is shorter than the target number.
    // Otherwise, increase the targetlevel if it is a number (letters are increased above) and cut all now obsolete levels.
    //-------------
    if (currentChapterIndexLength < targetLevel) {
        for (let i in [...Array(targetLevel-currentChapterIndexLength)]) {
            chapterElements.splice(-1,0,"1")
        }
    }
    else {
        if (!isNaN(parseInt(chapterElements[targetLevel-1]))) {
            chapterElements[targetLevel-1] = (parseInt(chapterElements[targetLevel-1]) + 1).toString()
        }
        if (currentChapterIndexLength > targetLevel) {
            chapterElements = chapterElements.slice(0,targetLevel)
        }
    }
    if (style !== "iso") {
        chapterElements.push("")
    }
    chapterIndex = chapterElements.join(".")
    return chapterIndex
}

/**
 * Adds "sectnums!" to a page's header.
 * @param {Object} page - The page that needs to unset the sectnums attribute in its header.
 */
function unsetSectnumsAttributeInFile( page ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage( page, newContent, indexOfTitle, "sectnums", "", true)
}

/**
 * Set the 'titleoffset' attribute in a page's header.
 * This attribute is used by an Asciidoctor extension to then add its value as a prefix to the page's title when compiling the final result.
 * @param {Object} page - The page where the titleoffset attribute is to be set.
 * @param {String} value - The value the titleoffset attribute is to be set to.
 */
function addTitleoffsetAttributeToPage( page, value) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "titleoffset", value)
}

/**
 * Checks if the sectnums attribute is set or unset in a given line and, if so, applies its implications in the context of consistent numbering.
 * @param {Array} content - The content of a file/page.
 * @param {String} line - The line that needs to be checked for the sectnums attribute.
 * @param {Boolean} previousValue - Optional: Sets the default return value in case the sectnums attribute is not matched.
 * @returns {Array} - [The return value (Boolean), the changed content, hasChanged]
 */
function checkForSectnumsAttribute( content, line, previousValue=true ) {
    const reSectnums = /^\s*:sectnums(!)?:/;
    const result = line.match(reSectnums)
    let returnValue;
    let hasChanged = false
    if (result) {
        returnValue = result[1] ? false : true
        hasChanged = true
        content.splice(content.indexOf(line),1)
    }
    else {
        returnValue = previousValue
    }
    return [returnValue, content, hasChanged]
}

/**
 * Checks if a section role attribute is defined in a given line and, if so, applies its implications in the context of consistent numbering.
 * @param {Array} content - The content of a file/page.
 * @param {String} line - The line that needs to be checked for occurring section roles.
 * @param {String} currentRole - The currently valid role (i.e. section number behavior).
 * @returns {Array} - [The determined active role, the changed content, hasChanged]
 */
function checkForRoleInLine( content, line, currentRole ) {
    const reRoles = /^\s*\[([^\]]+)\]/;
    const result = line.match(reRoles)
    const returnValue = result ? result[1] : currentRole
    const hasChanged = result ? true : false
    if (result) {
        content.splice(content.indexOf(line),1)
    }
    return [returnValue, content, hasChanged]
}

/**
 * Determines the number of images and tables that follow ASAM's anchor conventions as well as level 2 sections.
 * Also traverses through included files.
 * TODO: Join with features of getRelativeSectionNumberWithIncludes from content_analyzer.js (core).
 * @param {*} pages - - An array of pages.
 * @param {Object} page - The current page.
 * @param {Number} leveloffset - A given leveleoffset for sections and other numbers.
 * @returns {Array} - [Number of relevant sections, number of images, number of tables]
 */
function getIncludedPagesContentForExtensionFeatures( pages, page, leveloffset=0 ) {
    const contentSum = page.contents.toString()
    let newContent = contentSum.split("\n")
    let numberOfLevelTwoSections = 0
    let numberOfImages = 0
    let numberOfTables = 0.
    let ignoreLine = false
    //-------------
    // Ignore everything between "ifndef::use-antora-rules[]" and the next "endif::[]"
    //-------------
    for(let line of newContent) {
        if (line.indexOf("ifndef::") > -1 && line.indexOf("use-antora-rules") > -1) {
            ignoreLine = true
        }
        else if (ignoreLine && line.indexOf("endif::") > -1) {
            ignoreLine = false
        }
        if (!ignoreLine)
        {
            //-------------
            // Find all sections that will be level 2 in final result.
            //-------------
            if ((leveloffset === 0 && line.startsWith("== ")) || (leveloffset === 1 && line.startsWith("= "))) {
                numberOfLevelTwoSections += 1
            }
            //-------------
            // A page containing the attribute "pagesmacro" gets its number of level 2 sections reduced.
            // The reason is that the pages macro creates a level 2 section that is to be excluded from the count.
            // NOTE: This will break if the pages macro is used in a partial or included page!
            //-------------
            else if (line.match(/^:pagesmacro:/)) {
                numberOfLevelTwoSections -= 1
            }
            //-------------
            // Also look for included files and handle them accordingly, depending on the optional leveloffset attribute.
            //-------------
            else if (line.match(/^\s*include::/)) {
                const re = /^\s*include::([^\[]+)\[(leveloffset=\+(\d+))?/
                let result = line.match(re)
                const includePath = result[1].split("/")
                const includeLeveloffset = result[3] ? parseInt(result[3]) + leveloffset : leveloffset
                let currentPath = page.out.dirname.split("/")
                includePath.forEach(part => {
                    if (part === "..") {currentPath = currentPath.slice(0,-1)}
                    else if (part ===".") {}
                    else {currentPath.push(part)}
                })
                const targetPath = currentPath.join("/")
                let filteredPagesList = pages.filter(page => page.out && page.out.dirname +"/"+ page.src.basename === targetPath)
                if (filteredPagesList.length > 0) {
                    let includedPage = filteredPagesList[0]
                    let [numberOfLevelTwoSectionsIncluded, numberOfImagesIncluded, numberOfTablesIncluded] = getIncludedPagesContentForExtensionFeatures(pages, includedPage, includeLeveloffset)
                    numberOfLevelTwoSections += numberOfLevelTwoSectionsIncluded
                    numberOfImages += numberOfImagesIncluded
                    numberOfTables += numberOfTablesIncluded
                }
            }
            //-------------
            // Find all valid images (with "fig-" caption) and tables (with "tab-" caption).
            //-------------
            else {
                const reFigures = /\[#fig-[^\]]+\]/g
                if ([...line.matchAll(reFigures)].length > 0) {
                    numberOfImages += [...line.matchAll(reFigures)].length
                }
                const reTables = /\[#tab-[^\]]+\]/g
                if ([...line.matchAll(reTables)].length > 0) {
                    numberOfTables += [...line.matchAll(reTables)].length
                }
            }
        }
    }
    return [numberOfLevelTwoSections, numberOfImages, numberOfTables]
}

module.exports = {
    setStartingChapterIndex,
    determineNextChapterIndex,
    unsetSectnumsAttributeInFile,
    addTitleoffsetAttributeToPage,
    checkForSectnumsAttribute,
    checkForRoleInLine,
    getIncludedPagesContentForExtensionFeatures
}