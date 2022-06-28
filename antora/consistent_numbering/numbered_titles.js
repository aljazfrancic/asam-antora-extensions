'use strict'
//-------------
//-------------
// Module for the consistent numbering extension.
// This module provides a central function, 'applySectionAndTitleNumbers', that parses each adoc file in a component-version-combination and determines the relevant section, image, and table offset using the page order in the navigation file.
// Note 1: This addon requires the Asciidoctor extension "sectnumoffset_antora" to work!
// Note 2: This addon also requires the Asciidoctor extension "sectnums_to_iso" when using the iso style numeration.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
const Helper = require('./lib/helper.js')
const ImgTab = require('./lib/images_tables.js')
const ContentAnalyzer = require('../../core/content_analyzer.js')
const ContentManipulator = require('../../core/content_manipulator.js')

/**
 * Determines and applies consistent and consecutive numbers for page titles, sections, ASAM-style images, and ASAM-style tables.
 * This also applies section roles such as "appendix", "bibliography", and "preface". Not all roles are currently supported yet, however!
 * @param {Array <Object>} catalog - An array of pages and partials for a given component-version-combination.
 * @param {Array <Object>} pages - An array of pages for a given component-version-combination.
 * @param {Array <Object>} navFiles - An array of navigation files for a given component-version-combination.
 * @param {String} sectionNumberStyle - The selected style for section numbers. If "iso", the trailing "." is dropped.
 * @param {Object} contentCatalog - The content catalog provided by Antora.
 * @param {String} component - The current component.
 */
function applySectionAndTitleNumbers (catalog, pages, navFiles, sectionNumberStyle, contentCatalog, component) {
    const style = sectionNumberStyle ? sectionNumberStyle.toLowerCase() : "default"
    //-------------
    // Determine the appendix caption and the standard offset for the appendix to be used.
    //-------------
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const appendixCaption = Object.keys(componentAttributes).indexOf("appendix-caption") > -1 ? componentAttributes["appendix-caption"] : "Appendix"
    let appendixOffset = Object.keys(componentAttributes).indexOf("appendix-offset") > -1 ? componentAttributes["appendix-offset"] : 0
    //-------------
    // Sort nav files by index and the process them in order, then generate consistent numbers accordingly.
    //-------------
    navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })
    generateConsistentNumbersBasedOnNavigation(catalog, pages, componentAttributes, navFiles, style, appendixCaption, appendixOffset)
}

/**
 * Create consistent numbering based on ordered navigation files.
 * @param {Array <Object>} catalog - An array of pages and partials.
 * @param {Array <Object>} pages - An array of pages.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {Array <Object>} navFiles - A sorted array of navigation files.
 * @param {String} style - The selected style. If "iso", drop the trailing ".".
 * @param {String} appendixCaption - The caption for appendices.
 * @param {Integer} appendixOffset - An offset value for appendices, if an appendix needs to start with a different letter than "A".
 */
function generateConsistentNumbersBasedOnNavigation(catalog, pages, componentAttributes, navFiles, style, appendixCaption, appendixOffset) {
    const reStartLevel = /:start-level: ([0-9]*)/;
    const reResetLevelOffset = /:reset-level-offset:/;
    let currentRole = "default"
    let generateNumbers = true
    let chapterIndex = Helper.setStartingChapterIndex(style,"0")
    let imageIndex = 0,
        tableIndex = 0,
        exampleIndex = 0
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
            //---
            //workaround!!! TODO: replace
            //
            exampleIndex = 0
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
                    [content, chapterIndex, imageIndex, tableIndex, exampleIndex, generateNumbers,currentRole] = handleAppendix(nav, catalog,  pages, componentAttributes, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, exampleIndex, style, appendixCaption, appendixOffset);
                    break;
                case "glossary":
                    currentRole = "default";
                    break;
                case "bibliography":
                    [currentRole, imageIndex, tableIndex, exampleIndex] = handleBibliography(nav, catalog, pages, componentAttributes, line, imageIndex, tableIndex, exampleIndex)
                    break;
                case "index":
                    currentRole = "default";
                    break;
                case "preface":
                    [currentRole, imageIndex, tableIndex, exampleIndex]  = handlePreface(nav, catalog, pages, componentAttributes, line, imageIndex, tableIndex, exampleIndex)
                    break;
                case "default":
                    [content, chapterIndex, imageIndex, tableIndex, exampleIndex, generateNumbers,currentRole] = tryApplyingPageAndSectionNumberValuesToPage(nav, catalog, pages, componentAttributes, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, exampleIndex, style)
                    break;
            }
        }
        //-------------
        // After having executed on all lines, write the changes back to the navigation file.
        //-------------
        nav._contents = Buffer.from(content.join("\n"))
    })
}

/**
 * Apply section numbers to a page declared as "preface". Resets to "default" afterwards.
 * @param {Object} nav - The navigation file.
 * @param {Array <Object>} catalog - An array of pages and partials.
 * @param {Array <Object>} pages - An array of pages.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {String} line - The next valid line after the role "preface" was declared.
 * @param {Integer} imageIndex - The current image index used for the corresponding offset attribute.
 * @param {Integer} tableIndex - The current table index used for the corresponding offset attribute.
 * @returns {Array <any>} [new role, current image index, current table index]
 */
function handlePreface( nav, catalog, pages, componentAttributes, line, imageIndex, tableIndex, exampleIndex ) {
    const indexOfXref = line.indexOf("xref:")
    let page = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)[0]
    if (!page) {
        return ["default", imageIndex, tableIndex, exampleIndex]
    }
    Helper.unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex,newExampleIndex] = ImgTab.updateImageAndTableIndex(catalog, page, componentAttributes, imageIndex, tableIndex, exampleIndex)
    ContentManipulator.addSpecialSectionTypeToPage(page, "preface")
    return ["default", newImageIndex, newTableIndex, newExampleIndex]
}

/**
 * Apply section numbers to a page declared as "preface". Resets to "default" afterwards.
 * @param {Object} nav - The navigation file.
 * @param {Array <Object>} catalog - An array of pages and partials.
 * @param {Array <Object>} pages - An array of pages.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {Array <String>} content - The content of the navigation file.
 * @param {String} line - The next valid line after the role "preface" was declared.
 * @param {Boolean} generateNumbers - Defines if sectnums are allowed.
 * @param {Integer} startLevel - The section level at which to start, depending on the level of the line in the bullet point list.
 * @param {String} chapterIndex - The current chapter index.
 * @param {Integer} imageIndex - The current image index used for the corresponding offset attribute.
 * @param {Integer} tableIndex - The current table index used for the corresponding offset attribute.
 * @param {String} style - The selected style. If "iso", drop the trailing ".".
 * @param {String} appendixCaption - The caption for appendices.
 * @param {Integer} appendixOffset - An offset value for appendices, if an appendix needs to start with a different letter than "A".
 * @returns {Array <any>} [new role, current image index, current table index]
 */
function handleAppendix( nav, catalog, pages, componentAttributes, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, exampleIndex, style, appendixCaption, appendixOffset ) {
    const appendixStartLevel = isNaN(parseInt(startLevel)+parseInt(appendixOffset)) ? startLevel : (parseInt(startLevel)+parseInt(appendixOffset)).toString()
    return tryApplyingPageAndSectionNumberValuesToPage(nav, catalog, pages, componentAttributes, content, line, generateNumbers, appendixStartLevel, chapterIndex, imageIndex, tableIndex, exampleIndex, style, "appendix", appendixCaption, true)
}

/**
 * Apply section numbers to a page declared as "bibliography". Resets to "default" afterwards.
 * @param {Object} nav - The navigation file.
 * @param {Array <Object>} catalog - An array of pages and partials.
 * @param {Array <Object>} pages - An array of pages.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {String} line - The next valid line after the role "preface" was declared.
 * @param {Integer} imageIndex - The current image index used for the corresponding offset attribute.
 * @param {Integer} tableIndex - The current table index used for the corresponding offset attribute.
 * @returns {Array <any>} [new role, current image index, current table index]
 */
function handleBibliography(nav, catalog, pages, componentAttributes, line, imageIndex, tableIndex, exampleIndex) {
    const indexOfXref = line.indexOf("xref:")
    let bibliographyPage = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)
    let page = bibliographyPage[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    Helper.unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex,newExampleIndex] = ImgTab.updateImageAndTableIndex(catalog, page, componentAttributes, imageIndex, tableIndex, exampleIndex)
    ContentManipulator.addSpecialSectionTypeToPage(page, "bibliography")
    return ["default", newImageIndex, newTableIndex, newExampleIndex]
}

/**
 * Default function for applying consistent and consecutive numbers to a page or a non-page entry in a navigation file.
 * Analyze the given line and parse page, if applicable.
 * Determine level 2 sections, number of valid figures and tables, and apply offsets, if current page and navigation role/settings allows numbering.
 * @param {Object} nav - The navigation file.
 * @param {Array <Object>} catalog - An array of pages and partials.
 * @param {Array <Object>} pages - An array of pages.
 * @param {Object} componentAttributes - The list of inherited component attributes.
 * @param {Array <String>} content - The content of the navigation file.
 * @param {String} line - The next valid line after the role "preface" was declared.
 * @param {Boolean} generateNumbers - Defines if sectnums are allowed.
 * @param {Integer} startLevel - The section level at which to start, depending on the level of the line in the bullet point list.
 * @param {String} chapterIndex - The current chapter index.
 * @param {Integer} imageIndex - The current image index used for the corresponding offset attribute.
 * @param {Integer} tableIndex - The current table index used for the corresponding offset attribute.
 * @param {String} style - The selected style. If "iso", drop the trailing ".".
 * @param {String} option - Optional: If set to anything but "default", the option will be added as page role after the title (e.g. [appendix]).
 * @param {String} appendixCaption - Optional: The caption for appendices. Only relevant for appendix pages.
 * @param {Boolean} isAppendix - Optional: If true, activates the features reserved for appendices.
 * @returns {Array <any>} [Changed content, new chapterIndex, new imageIndex, new tableIndex, generateNumbers = true, new option]
 */
function tryApplyingPageAndSectionNumberValuesToPage( nav, catalog, pages, componentAttributes, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, exampleIndex, style, option="default", appendixCaption="", isAppendix = false ) {
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    let newExampleIndex = exampleIndex
    let numberOfLevelTwoSections = 0
    const indexOfXref = line.indexOf("xref:")
    //-------------
    // Determine the current level by counting the bullet points in this line, then deduct the startlevel offset.
    //-------------
    const level = indexOfXref > 0 ? line.lastIndexOf("*",indexOfXref) + 1 : line.lastIndexOf("*") + 1
    const targetLevel = level - startLevel + 1
    if (indexOfXref > 0 || level >= startLevel) {
        //-------------
        // Execute if no xref was found (i.e. the line contains only a list entry without link).
        // Get the next chapter number (current + 1, depending on previous and current bulletpoint level), then change the line in the navigation file and apply the correct style.
        //-------------
        if (indexOfXref <= 0) {
            if (!generateNumbers) {
                return [content, chapterIndex, newImageIndex, newTableIndex, newExampleIndex, !generateNumbers,"default"]
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
            let foundPage = ContentAnalyzer.determinePageForXrefInLine(line, indexOfXref, pages, nav)
            //-------------
            // Only execute if at least one matching page was found. If so, take the first page that matches.
            //-------------
            if (foundPage.length > 0) {
                let page = foundPage[0]
                if (!generateNumbers) {
                    Helper.unsetSectnumsAttributeInFile(page)
                    let [a,b,c,d] = ImgTab.updateImageAndTableIndex(catalog, page, componentAttributes, imageIndex, tableIndex, exampleIndex)
                    return [content, chapterIndex, a, b, c, !generateNumbers, "default"]
                }
                //-------------
                // If section number shall be applied, apply current values and determine the next ones.
                //-------------
                chapterIndex = Helper.determineNextChapterIndex(targetLevel, chapterIndex, style, appendixCaption, isAppendix)
                Helper.addTitleoffsetAttributeToPage( page, chapterIndex)
                let [a,b,c,d] = ImgTab.updateImageAndTableIndex(catalog, page, componentAttributes, imageIndex, tableIndex, exampleIndex)
                newImageIndex = a
                newTableIndex = b
                newExampleIndex = c
                numberOfLevelTwoSections = d
                let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
                const targetIndex = style === "iso" ? chapterIndex.split(".") : chapterIndex.split(".").slice(0,-1)
                if (isAppendix && targetLevel === 1) {
                    newContent.splice(indexOfTitle+2,0,":titleprefix: "+ appendixCaption+" "+targetIndex.join(".")+":")
                }
                //-------------
                // If the option is passed in this function (e.g. as "appendix") and the value is not "default", it is added to the title.
                // With this, the page is marked as type [option].
                //-------------
                if (option !== "default") {
                    newContent.splice(indexOfTitle,0,"["+option+"]")
                    option = "default"
                }
                page._contents = Buffer.from(newContent.join("\n"))
                //-------------
                // Define the reftext attributes for each xrefstyle for the reference_style_mixing extension.
                //-------------
                let title = page.contents.toString().match(/^= (.*)$/m) ? page.contents.toString().match(/^= (.*)$/m)[1].trim() : ""
                const sectionRefsig = componentAttributes['section-refsig'] ? componentAttributes['section-refsig'] : "Section"
                const reftext_full = isNaN(targetIndex[0]) ? `${appendixCaption} ${targetIndex.join(".")}, "${title}"` : `${sectionRefsig} ${targetIndex.join(".")}, "${title}"`
                const reftext_short = isNaN(targetIndex[0]) ? `${appendixCaption} ${targetIndex.join(".")}` : `${sectionRefsig} ${targetIndex.join(".")}`
                const reftext_basic = `"${title}"`
                const navtitle = (isAppendix && targetLevel === 1) ? `${appendixCaption} ${targetIndex.join(".")}: ${title}` :  `${targetIndex.join(".")} ${title}`
                ContentManipulator.updateAttributeWithValueOnPage(page, "navtitle", navtitle)
                ContentManipulator.updateAttributeWithValueOnPage(page, "reftext_full", reftext_full)
                ContentManipulator.updateAttributeWithValueOnPage(page, "reftext_short", reftext_short)
                ContentManipulator.updateAttributeWithValueOnPage(page, "reftext_basic", reftext_basic)
                const newIndex = style === "iso" ? chapterIndex +"."+ (numberOfLevelTwoSections-1) : chapterIndex + (numberOfLevelTwoSections-1) +"."
                chapterIndex = Helper.determineNextChapterIndex(targetLevel+1, newIndex, style, appendixCaption, isAppendix)
            }
        }
    }
    return [content, chapterIndex, newImageIndex, newTableIndex, newExampleIndex, generateNumbers, option]
}

module.exports = {
    applySectionAndTitleNumbers
}