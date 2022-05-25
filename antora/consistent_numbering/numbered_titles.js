'use strict'

const Helper = require('./lib/helper.js')
const ImgTab = require('./lib/images_tables.js')
const ContentAnalyzer = require('../../core/content_analyzer.js')
const ContentManipulator = require('../../core/content_manipulator.js')

//-------------
//-------------
// Main function, responsible for all title and section number actions
// This is the only function exposed as module
// Note: This addon requires the Asciidoctor extension "sectnumoffset_antora" to work!
// Note2: This addon also requires the Asciidoctor extension "sectnums_to_iso" when using the iso style numeration.
//-------------
function applySectionAndTitleNumbers (pages, navFiles, sectionNumberStyle, contentCatalog, component) {
    //-------------
    // Set style depending on chosen option
    //-------------
    const style = sectionNumberStyle ? sectionNumberStyle.toLowerCase() : "default"
    //-------------
    // Determine the appendix caption and the standard offset for the appendix to be used.
    //-------------
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const appendixCaption = Object.keys(componentAttributes).indexOf("appendix-caption") > -1 ? componentAttributes["appendix-caption"] : "Appendix"
    let appendixOffset = Object.keys(componentAttributes).indexOf("appendix-offset") > -1 ? componentAttributes["appendix-offset"] : 0
    //-------------
    // Sort nav files by index and the process them in order
    //-------------
    navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })
    generatePageNumberBasedOnNavigation(pages, navFiles, style, appendixCaption, appendixOffset)
}

//-------------
//-------------
// Function for handling each navigation file and creating a consistent numbering
// Called by the main function to go through all options and apply the correct one
//-------------
function generatePageNumberBasedOnNavigation(pages, navFiles, style, appendixCaption, appendixOffset) {
    const reStartLevel = /:start-level: ([0-9]*)/;
    const reResetLevelOffset = /:reset-level-offset:/;
    let currentRole = "default"
    let generateNumbers = true
    let chapterIndex = Helper.setStartingChapterIndex(style,"0")
    let imageIndex = 0,
        tableIndex = 0
    //-------------
    // Iterate over all (sorted) navigation files.
    //-------------
    navFiles.forEach(nav => {
        //-------------
        // Read and interpret the navigation file content
        //-------------
        const navContentSum = nav._contents.toString()
        let content = navContentSum.split("\n")
        if (navContentSum.match(reResetLevelOffset)) {
            chapterIndex = Helper.setStartingChapterIndex(style,"0")
        }
        //-------------
        // Check if the start-level attribute was set and, if so, use its value as an offset
        //-------------
        let startLevel = navContentSum.match(reStartLevel) && navContentSum.match(reStartLevel)[1] ? navContentSum.match(reStartLevel)[1] : 1
        for (let line of nav._contents.toString().split("\n")) {
            //-------------
            // Check if the line contains a role or the sectnums attribute
            //-------------
            let hasChanged = false;
            [generateNumbers, content, hasChanged] = Helper.checkForSectnumsAttribute(content,line,generateNumbers)
            if (hasChanged) {continue;}
            [currentRole, content, hasChanged] = Helper.checkForRoleInLine(content, line, currentRole)
            if (hasChanged) {continue;}

            //-------------
            // If the line contains no role or the sectnums attribute, apply the currently valid role to it.
            // Currently not supported roles are "abstract", "glossary", and "index".
            //-------------
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
        //-------------
        // After having executed on all lines, write the changes back to the navigation file.
        //-------------
        nav._contents = Buffer.from(content.join("\n"))
    })
}

//-------------
//-------------
// This function deals with pages declared as "preface" in the navigation file.
//-------------
function handlePreface( nav, pages,line,imageIndex, tableIndex ) {
    const indexOfXref = line.indexOf("xref:")
    let page = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    Helper.unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
    ContentManipulator.addSpecialSectionTypeToPage(page, "preface")
    return ["default", newImageIndex, newTableIndex]
}

//-------------
//-------------
// This function deals with pages declared as "appendix" in the navigation file.
//-------------
function handleAppendix( nav, pages, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, appendixCaption, appendixOffset ) {
    const appendixStartLevel = isNaN(parseInt(startLevel)+parseInt(appendixOffset)) ? startLevel : (parseInt(startLevel)+parseInt(appendixOffset)).toString()
    return tryApplyingPageAndSectionNumberValuesToPage(nav, pages,content, line, generateNumbers, appendixStartLevel, chapterIndex, imageIndex, tableIndex, style, "appendix", appendixCaption)
}

//-------------
//-------------
// This function deals with pages declared as "bibliography" in the navigation file.
//-------------
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

//-------------
//-------------
// This function takes a given content, analyzes it, and decides what to do with it.
// Pages are parsed, level 2 sections, figures and tables counted, and the offset from the previous page applied.
// Non-pages just increase the section number by one and the line is changed accordingly.
//-------------
function tryApplyingPageAndSectionNumberValuesToPage( nav, pages, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, option="default", appendixCaption="" ) {
    //-------------
    // Prepare variables
    //-------------
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    let numberOfLevelTwoSections = 0
    //-------------
    // Check if the line references a page (xref) or not
    //-------------
    const indexOfXref = line.indexOf("xref:")
    //-------------
    // Determine the current level by counting the bullet points in this line, then deduct the startlevel offset.
    //-------------
    const level = indexOfXref > 0 ? line.lastIndexOf("*",indexOfXref) + 1 : line.lastIndexOf("*") + 1
    const targetLevel = level - startLevel + 1
    //-------------
    // Execute only if either a cross reference or a bullet point was found. Empty lines and non-list entries are ignored.
    //-------------
    if (indexOfXref > 0 || level >= startLevel) {
        //-------------
        // Execute if no xref was found (i.e. the line contains only a list entry without link).
        // Get the next chapter number (current + 1, depending on previous and current bulletpoint level), then change the line in the navigation file and apply the correct style.
        //-------------
        if (indexOfXref <= 0) {
            if (!generateNumbers) {
                return [content, chapterIndex, newImageIndex, newTableIndex, !generateNumbers,"default"]
            }
            chapterIndex = Helper.determineNextChapterIndex(targetLevel, chapterIndex, style)
            const changedLine = line.slice(0,level) + " " + chapterIndex + line.slice(level)
            content[content.indexOf(line)] = changedLine
            chapterIndex = style === "iso" ? chapterIndex +"."+ 0 : chapterIndex + 0 +"."

        }
        //-------------
        // Execute if xref was found (i.e. the line contains a link to a file).
        // Get the referenced page, if the link is correct.
        //-------------
        else if (level >= startLevel) {
            let expectedNavtitleIndex = 0
            let expectedReftextIndex = 0
            let foundPage = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)
            //-------------
            // Only execute if at least one matching page was found. If so, take the first page that matches.
            //-------------
            if (foundPage.length > 0) {
                let page = foundPage[0]
                //-------------
                // If section numbers are deactivated for this page by a previous instruction, do not add numbers.
                // Instead, only count images and tables and reset to default, then return.
                //-------------
                if (!generateNumbers) {
                    Helper.unsetSectnumsAttributeInFile(page)
                    let [a,b,c] = ImgTab.updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
                    return [content, chapterIndex, a, b,!generateNumbers, "default"]
                }
                //-------------
                // If section number shall be applied, determine the applicable and following numbers.
                // Add the determined offset values to the page as attributes.
                // Then, determine the relevant images and tables and set the new offset values.
                // Depending on the title type, add the correct prefix to the page title as attribute.
                // Lastly, write the changes to the file and then update the chapter index for the next page.
                //-------------
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
                //-------------
                // If the option is passed in this function (e.g. as "appendix") and the value is not "default", it is added to the title.
                // With this, the page is marked as type [option].
                //-------------
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