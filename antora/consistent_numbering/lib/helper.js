'use strict'

const ContentAnalyzer = require('../../../core/content_analyzer.js')
const ContentManipulator = require('../../../core/content_manipulator.js')

function setStartingChapterIndex( style, value ) {
    return style === "iso" ? value : value+"."
}

function determineNextChapterIndex( targetLevel, chapterIndex="0.", style, appendixCaption="" ) {
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
    // Add 1s to the end if the current number is shorter than the target number
    if (currentChapterIndexLength < targetLevel) {
        for (let i in [...Array(targetLevel-currentChapterIndexLength)]) {
            chapterElements.splice(-1,0,"1")
        }
    }
    else {
        // Increase if the targetlevel is a number (letters are increased above)
        if (!isNaN(parseInt(chapterElements[targetLevel-1]))) {
            chapterElements[targetLevel-1] = (parseInt(chapterElements[targetLevel-1]) + 1).toString()
        }
        // Cut all elements beyond the target
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

function getRelativeSectionNumberWithIncludes(pages,page,targetSectionLevel,startText="") {
    let currentTargetSectionLevel = targetSectionLevel
    let relativeIndex = startText ? [1] : [0]
    let content = page.contents.toString()
    if (startText){
        const indexType1 = content.indexOf("[#"+startText+"]")
        const indexType2 = content.indexOf("[["+startText+"]]")
        if (indexType1 > -1) {
            content = content.slice(0,indexType1);
        }
        else if(indexType2 > -1) {
            content = content.slice(0,indexType2)
        }
    }
    const reSectionStart = /^(=+)\s[^\n]+/
    content.split("\n").reverse().forEach(line => {
        const sectionSearchResult = line.match(reSectionStart)
        const includeSearchResult = line.match(/^\s*include::([^\[]+)\[(leveloffset=\+(\d+))?\]/)
        if (includeSearchResult && includeSearchResult.length > 0) {
            const leveloffset = includeSearchResult[3] ? targetSectionLevel - includeSearchResult[3] : targetSectionLevel
            if (leveloffset > 0)
            {
                const targetPage = ContentAnalyzer.determineTargetPageFromIncludeMacro ( pages, page, includeSearchResult[1] )
                if (targetPage){
                    let includedSectionNumbers = getRelativeSectionNumberWithIncludes(pages,targetPage,leveloffset)
                    for (let i in includedSectionNumbers) {
                        relativeIndex[i] += includedSectionNumbers[i]
                    }
                }
            }
        }
        if (sectionSearchResult && sectionSearchResult.length > 0) {
            const foundSectionLevel = sectionSearchResult[1].split("=").length - 1
            if (foundSectionLevel === currentTargetSectionLevel) {
                relativeIndex[0] = relativeIndex[0] + 1
            }
            else if(foundSectionLevel === currentTargetSectionLevel - 1) {
                relativeIndex.reverse()
                relativeIndex.push(1)
                relativeIndex.reverse()
                currentTargetSectionLevel = foundSectionLevel
            }
            // else {console.log("irrelevant section")}
        }
    })
    return relativeIndex
}

function unsetSectnumsAttributeInFile( page ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage( page, newContent, indexOfTitle, "sectnums", "", true)
}

function addTitleoffsetAttributeToPage( page, value) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = ContentAnalyzer.getPageContentForExtensionFeatures(page)
    ContentManipulator.addAttributeWithValueToPage(page, newContent, indexOfTitle, "titleoffset", value)
}

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

function getIncludedPagesContentForExtensionFeatures( pages, page, leveloffset=0 ) {
    const contentSum = page.contents.toString()
    let newContent = contentSum.split("\n")
    let numberOfLevelTwoSections = 0
    let numberOfImages = 0
    let numberOfTables = 0.
    let ignoreLine = false
    for(let line of newContent) {
        // Find level 2 sections
        if (line.indexOf("ifndef::") > -1 && line.indexOf("use-antora-rules") > -1) {
            ignoreLine = true
        }
        else if (ignoreLine && line.indexOf("endif::") > -1) {
            ignoreLine = false
        }
        if (!ignoreLine)
        {
            if ((leveloffset === 0 && line.startsWith("== ")) || (leveloffset === 1 && line.startsWith("= "))) {
                numberOfLevelTwoSections += 1
            }
            else if (line.match(/^:pagesmacro:/)) {
                numberOfLevelTwoSections -= 1
            }
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
    getRelativeSectionNumberWithIncludes,
    unsetSectnumsAttributeInFile,
    addTitleoffsetAttributeToPage,
    checkForSectnumsAttribute,
    checkForRoleInLine,
    getIncludedPagesContentForExtensionFeatures
}