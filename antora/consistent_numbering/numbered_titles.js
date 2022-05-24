'use strict'

const Helper = require('./lib/helper.js')
const ImgTab = require('./lib/images_tables.js')
const ContentAnalyzer = require('../../core/content_analyzer.js')
const ContentManipulator = require('../../core/content_manipulator.js')

// Main function, responsible for all title and section number actions
// This is the only function exposed as module
// Note: This addon requires the Asciidoctor extension "sectnumoffset_antora" to work!
// Note2: This addon also requires the Asciidoctor extension "sectnums_to_iso" when using the iso style numeration.
function applySectionAndTitleNumbers (pages, navFiles, sectionNumberStyle, contentCatalog, component) {
    // Set style depending on chosen option
    const style = sectionNumberStyle ? sectionNumberStyle.toLowerCase() : "default"

    // Determine the appendix caption and the standard offset for the appendix to be used.
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const appendixCaption = Object.keys(componentAttributes).indexOf("appendix-caption") > -1 ? componentAttributes["appendix-caption"] : "Appendix"
    let appendixOffset = Object.keys(componentAttributes).indexOf("appendix-offset") > -1 ? appendixOffset = componentAttributes["appendix-offset"] : 0

    // Sort nav files by index and the process them in order
    navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })
    generatePageNumberBasedOnNavigation(pages, navFiles, style, appendixCaption, appendixOffset)
}


// Function for handling each navigation file and creating a consistent numbering
// Called by the main function to go through all options and apply the correct one
function generatePageNumberBasedOnNavigation(pages, navFiles, style, appendixCaption, appendixOffset) {
    const reStartLevel = /:start-level: ([0-9]*)/;
    const reResetLevelOffset = /:reset-level-offset:/;
    let currentRole = "default"
    let generateNumbers = true
    let chapterIndex = Helper.setStartingChapterIndex(style,"0")
    let imageIndex = 0,
        tableIndex = 0
    navFiles.forEach(nav => {
        const navContentSum = nav._contents.toString()
        let content = navContentSum.split("\n")
        if (navContentSum.match(reResetLevelOffset)) {
            chapterIndex = Helper.setStartingChapterIndex(style,"0")
        }
        let startLevel = navContentSum.match(reStartLevel) && navContentSum.match(reStartLevel)[1] ? navContentSum.match(reStartLevel)[1] : 1
        for (let line of nav._contents.toString().split("\n")) {
            let hasChanged = false;
            [generateNumbers, content, hasChanged] = Helper.checkForSectnumsAttribute(content,line,generateNumbers)
            if (hasChanged) {continue;}
            [currentRole, content, hasChanged] = Helper.checkForRoleInLine(content, line, currentRole)
            if (hasChanged) {continue;}

            switch (currentRole) {
                case "abstract":
                    currentRole = "default";
                    break;
                case "appendix":
                    [content, chapterIndex, imageIndex, tableIndex, generateNumbers,currentRole] = handleAppendix(nav, pages,content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, appendixCaption, appendixOffset);
                    break;
                case "glossary":
                    currentRole = "default";
                    break;
                case "bibliography":
                    [currentRole, imageIndex, tableIndex] = handleBibliography(nav, pages, line, imageIndex, tableIndex)
                    break;
                case "index":
                    currentRole = "default";
                    break;
                case "preface":
                    [currentRole, imageIndex, tableIndex]  = handlePreface(nav, pages, line, imageIndex, tableIndex)
                    break;
                case "default":
                    [content, chapterIndex, imageIndex, tableIndex, generateNumbers,currentRole] = tryApplyingPageAndSectionNumberValuesToPage(nav, pages,content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style)
                    break;
            }
        }
        nav._contents = Buffer.from(content.join("\n"))
    })
}

function handlePreface( nav, pages,line,imageIndex, tableIndex ) {
    const indexOfXref = line.indexOf("xref:")
    let page = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
    ContentManipulator.addSpecialSectionTypeToPage(page, "preface")
    return ["default", newImageIndex, newTableIndex]
}

function handleAppendix( nav, pages, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, appendixCaption, appendixOffset ) {
    const appendixStartLevel = isNaN(parseInt(startLevel)+parseInt(appendixOffset)) ? startLevel : (parseInt(startLevel)+parseInt(appendixOffset)).toString()
    return tryApplyingPageAndSectionNumberValuesToPage(nav, pages,content, line, generateNumbers, appendixStartLevel, chapterIndex, imageIndex, tableIndex, style, "appendix", appendixCaption)
}

function handleBibliography(nav, pages, line, imageIndex, tableIndex) {
    const indexOfXref = line.indexOf("xref:")
    let bibliographyPage = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)
    let page = bibliographyPage[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    Helper.unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
    ContentManipulator.addSpecialSectionTypeToPage(page, "bibliography")
    return ["default", newImageIndex, newTableIndex]
}

function tryApplyingPageAndSectionNumberValuesToPage( nav, pages, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, option="default", appendixCaption="" ) {
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    let numberOfLevelTwoSections = 0
    const indexOfXref = line.indexOf("xref:")
    const level = indexOfXref > 0 ? line.lastIndexOf("*",indexOfXref) + 1 : line.lastIndexOf("*") + 1
    const targetLevel = level - startLevel + 1
    // Execute only if either a cross reference or a bullet point was found
    if (indexOfXref > 0 || level >= startLevel) {
        // Execute if no xref was found
        if (indexOfXref <= 0) {
            if (!generateNumbers) {
                return [content, chapterIndex, newImageIndex, newTableIndex, !generateNumbers,"default"]
            }
            chapterIndex = Helper.determineNextChapterIndex(targetLevel, chapterIndex, style)
            const changedLine = line.slice(0,level) + " " + chapterIndex + line.slice(level)
            content[content.indexOf(line)] = changedLine
            chapterIndex = style === "iso" ? chapterIndex +"."+ 0 : chapterIndex + 0 +"."

        }
        // Execute if xref was found
        else if (level >= startLevel) {
            let expectedNavtitleIndex = 0
            let expectedReftextIndex = 0
            let number
            let foundPage = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)
            // Only execute if at least one matching page was found
            if (foundPage.length > 0) {
                let page = foundPage[0]
                if (!generateNumbers) {
                    Helper.unsetSectnumsAttributeInFile(page)
                    let [a,b,c] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
                    return [content, chapterIndex, a, b,!generateNumbers, "default"]
                }
                chapterIndex = Helper.determineNextChapterIndex(targetLevel, chapterIndex, style, appendixCaption)
                Helper.addTitleoffsetAttributeToPage( page, chapterIndex)
                let [a,b,c] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
                newImageIndex = a
                newTableIndex = b
                numberOfLevelTwoSections = c
                let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
                if (appendixCaption) {
                    const targetIndex = style === "iso" ? chapterIndex.split(".") : chapterIndex.split(".").slice(0,-1)
                    newContent.splice(indexOfTitle+2,0,":titleprefix: "+ appendixCaption+" "+targetIndex.join(".")+":")
                }
                if (option !== "default") {
                    newContent.splice(indexOfTitle,0,"["+option+"]")
                    expectedNavtitleIndex += 1
                    expectedReftextIndex += 1
                    option = "default"
                }
                if (indexOfNavtitle > expectedNavtitleIndex) {
                    const index = newContent[indexOfNavtitle].indexOf(":navtitle:") + ":navtitle:".length + 1
                    newContent[indexOfNavtitle] = newContent[indexOfNavtitle].slice(0,index) + chapterIndex + " " + newContent[indexOfNavtitle].slice(index)
                }
                if (indexOfReftext > expectedReftextIndex) {
                    const index = newContent[indexOfReftext].indexOf(":reftext:") + ":reftext:".length + 1
                    newContent[indexOfReftext] = newContent[indexOfReftext].slice(0,index) + chapterIndex + " " + newContent[indexOfReftext].slice(index)
                }
                page._contents = Buffer.from(newContent.join("\n"))
                const newIndex = style === "iso" ? chapterIndex +"."+ (numberOfLevelTwoSections-1) : chapterIndex + (numberOfLevelTwoSections-1) +"."
                chapterIndex = Helper.determineNextChapterIndex(targetLevel+1, newIndex, style, appendixCaption)
            }
        }
    }
    return [content, chapterIndex, newImageIndex, newTableIndex,generateNumbers, option]
}




module.exports = {
    applySectionAndTitleNumbers
}