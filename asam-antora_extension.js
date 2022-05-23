'use strict'
// Import helper and other files
// Note: Most functionality as well as constants are defined in external files.
// This extension file mostly serves as a mapper/aggregator.
const CON = require('./helper/constants.js');
const ConfigParser = require("./helper/parse_config.js");
const MapGen = require('./content_analyzer/map_generator.js')
const ContentAnalyzer = require('./content_analyzer/content_analyzer.js')
const Macros = require('./macros/asam_macros.js')
const Keywords = require('./keywords_overview/keywords_overview.js')
// const SecNums = require('./sectnumtitles/antora/numbered_titles.js');

// Register this module in antora. It receives the configuration passed to it through the site.yml or the CLI
module.exports.register = function ({ config }) {
    const logger = this.require('@antora/logger').get('unlisted-pages-extension')
    // Parse the config file and return the values as the parsedConfig object
    let parsedConfig = ConfigParser.parse(config)

    // Execute features on the "contentClassified" step of the pipeline.
    // At this point, the content has been loaded and analyzed / classified but has not yet been converted.
    this
      .on('contentClassified', ({ contentCatalog }) => {
        console.log("Reacting on contentClassified")

        // Execute all features for each component-version-combination
        contentCatalog.getComponents().forEach(({ versions }) => {
            versions.forEach(({ name: component, version, url: defaultUrl }) => {
                let pages = contentCatalog.findBy({ component, version, family: 'page'})
                let navFiles = contentCatalog.findBy({ component, version, family: 'nav'})

                let mapInput = {
                    useKeywords: parsedConfig.useKeywords,
                    pages: pages,
                    navFiles: navFiles
                }

                let { keywordPageMap, rolePageMap, anchorPageMap } = MapGen.generateMapsForPages( mapInput )
                pages = Keywords.createKeywordsOverviewPage(parsedConfig.keywordOverviewPageRequested, contentCatalog, pages, keywordPageMap, parsedConfig.targetPath, parsedConfig.targetName, parsedConfig.targetModule, component, version)
                keywordPageMap = MapGen.getKeywordPageMapForPages(parsedConfig.useKeywords,pages)
                pages = Macros.findAndReplaceCustomASAMMacros( contentCatalog, pages, navFiles, keywordPageMap, rolePageMap, CON.macrosRegEx, CON.macrosHeadings, logger, component, version )
                keywordPageMap = MapGen.getKeywordPageMapForPages(parsedConfig.useKeywords,pages)
                pages = Keywords.createKeywordsOverviewPage(parsedConfig.keywordOverviewPageRequested, contentCatalog, pages, keywordPageMap, parsedConfig.targetPath, parsedConfig.targetName, parsedConfig.targetModule, component, version)
                navFiles = contentCatalog.findBy({ component, version, family: 'nav'})

                if (parsedConfig.numberedTitles) {
                    const style = parsedConfig.sectionNumberStyle ? parsedConfig.sectionNumberStyle : "default"
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
                }
                if (anchorPageMap.size > 0) {
                    pages = findAndReplaceLocalReferencesToGlobalAnchors( anchorPageMap, pages )
                }
            })
        })
      })

      // Execute features on the "navigationBuilt" step of the pipeline.
      // At this point, the content has been loaded and analyzed / classified but has not yet been converted. However, its navigation has been structured by analyzing the provided navigation files (nav.adoc).
      .on('navigationBuilt', ({ contentCatalog }) => {
        console.log("Reacting on navigationBuild")

        // Execute all features for each component-version-combination
        contentCatalog.getComponents().forEach(({ versions }) => {
          versions.forEach(({ name: component, version, navigation: nav, url: defaultUrl }) => {
            const navEntriesByUrl = getNavEntriesByUrl(nav)
            const unlistedPages = contentCatalog
              .findBy({ component, version, family: 'page' })
              .filter((page) => page.out)
              .reduce((collector, page) => {
                if ((page.pub.url in navEntriesByUrl) || page.pub.url === defaultUrl) return collector
                logger.warn({ file: page.src, source: page.src.origin }, 'detected unlisted page')
                return collector.concat(page)
              }, [])
            if (unlistedPages.length && parsedConfig.addToNavigation) {
              nav.push({
                content: parsedConfig.unlistedPagesHeading,
                items: unlistedPages.map((page) => {
                  return { content: page.asciidoc.navtitle, url: page.pub.url, urlType: 'internal' }
                }),
                root: true,
              })
            }
          })
        })
      })
  }


function getNavEntriesByUrl (items = [], accum = {}) {
items.forEach((item) => {
    if (item.urlType === 'internal') accum[item.url.split('#')[0]] = item
    getNavEntriesByUrl(item.items, accum)
})
return accum
}

function generatePageNumberBasedOnNavigation(pages, navFiles, styleSettings, appendixCaption, appendixOffset) {
    const reStartLevel = /:start-level: ([0-9]*)/;
    const reResetLevelOffset = /:reset-level-offset:/;

    let currentRole = "default"
    let generateNumbers = true
    const style = styleSettings.toLowerCase()
    let chapterIndex = setStartingChapterIndex(style,"0")
    let imageIndex = 0,
        tableIndex = 0
    navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })
    navFiles.forEach(nav => {
        const navContentSum = nav._contents.toString()
        let content = navContentSum.split("\n")
        if (navContentSum.match(reResetLevelOffset)) {
            chapterIndex = setStartingChapterIndex(style,"0")
        }
        let startLevel = navContentSum.match(reStartLevel) && navContentSum.match(reStartLevel)[1] ? navContentSum.match(reStartLevel)[1] : 1
        for (let line of nav._contents.toString().split("\n")) {
            let hasChanged = false;
            [generateNumbers, content, hasChanged] = checkForSectnumsAttribute(content,line,generateNumbers)
            if (hasChanged) {continue;}
            [currentRole, content, hasChanged] = checkForRoleInLine(content, line, currentRole)
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

function setStartingChapterIndex( style, value ) {
    return style === "iso" ? value : value+"."
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
            chapterIndex = determineNextChapterIndex(targetLevel, chapterIndex, style)
            const changedLine = line.slice(0,level) + " " + chapterIndex + line.slice(level)
            content[content.indexOf(line)] = changedLine
            chapterIndex = style === "iso" ? chapterIndex +"."+ 0 : chapterIndex + 0 +"."

        }
        // Execute if xref was found
        else if (level >= startLevel) {
            let expectedNavtitleIndex = 0
            let expectedReftextIndex = 0
            let number
            let foundPage = determinePageForXrefInLine(line, indexOfXref, pages, nav)
            // Only execute if at least one matching page was found
            if (foundPage.length > 0) {
                let page = foundPage[0]
                if (!generateNumbers) {
                    unsetSectnumsAttributeInFile(page)
                    let [a,b,c] = updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
                    return [content, chapterIndex, a, b,!generateNumbers, "default"]
                }
                chapterIndex = determineNextChapterIndex(targetLevel, chapterIndex, style, appendixCaption)
                addTitleoffsetAttributeToPage( page, chapterIndex)
                let [a,b,c] = updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
                newImageIndex = a
                newTableIndex = b
                numberOfLevelTwoSections = c
                let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
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
                chapterIndex = determineNextChapterIndex(targetLevel+1, newIndex, style, appendixCaption)
            }
        }
    }
    return [content, chapterIndex, newImageIndex, newTableIndex,generateNumbers, option]
}

function determinePageForXrefInLine(line, indexOfXref, pages, nav) {
    const endOfXref = line.indexOf("[")
    const targetFile = line.slice(indexOfXref + 5, endOfXref)
    let foundPage = pages.filter(x => x.src.relative === targetFile && x.src.module === nav.src.module)
    return foundPage
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
                    let [autoAltText, altLink] = getReferenceNameFromSource( pages, referencePage, ref[1] )
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

function getReferenceNameFromSource( pages, page, anchor ) {
    const reSectionEqualSigns = /^\s*(=+)\s+(.*)$/m
    const reCaptionLabel = /^\.(\S.+)$/m
    const reAnchorType = /([^-\]]+)-?[^\]]*/m

    let content =page.contents.toString()
    const resultAnchorType = anchor.match(reAnchorType)
    const indexOfAnchor = content.indexOf(anchor)
    const resultForNextHeading = content.slice(indexOfAnchor).match(reSectionEqualSigns)
    // const resultForPreviousHeading = content.slice(0,indexOfAnchor).match(reSectionEqualSigns)
    const resultNextCaption = content.slice(indexOfAnchor).match(reCaptionLabel)
    // Use special anchor formats: sec, top, fig, tab, ...
    let result
    let returnValue = ""
    let altLink

    if (resultAnchorType){
        switch (resultAnchorType[1]) {
            case "fig":
                // console.log("found figure: ", anchor);
                result = resultNextCaption
                // console.log(result[1])
                break;
            case "tab":
                // console.log("found table: ", anchor);
                result = resultNextCaption
                // console.log(result[1])
                break;
            case "top":
                // console.log("found top anchor: ", anchor)
                returnValue = getAltTextFromTitle( page, content )
                break;
            case "sec":
                result = resultForNextHeading
                const pageNumber = getAltNumberFromTitle(page,content)
                let relativeSectionNumber = getRelativeSectionNumberWithIncludes(pages,page,result[1].split("=").length-1,anchor)
                if (relativeSectionNumber.length > 1){
                    relativeSectionNumber[0]=""
                    returnValue = "Section " + pageNumber+relativeSectionNumber.join(".")
                }
                else {
                    returnValue = "Section " + pageNumber
                }
                break;
            default:
                console.log("non-standard anchor type detected: ", anchor)
                returnValue = getAltTextFromTitle( page, content )
                break;
        }
    }
    else {
        returnValue = getAltTextFromTitle( page, content )
    }
    return ([returnValue, altLink])
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

function getAltTextFromTitle( page, content ) {
    const re1 = /:titleprefix:\s*([^\n]+)/m
    const re2 = /:titleoffset:\s*([^\n]+)/m
    const re3 = /^=\s+([^\n\r]+)/m

    let returnValue
    let result = content.match(re1)
    if (!result || result.length <=1) {
        result = content.match(re2)
    }
    const resultAlt = content.match(re3)
    if (result && result.length > 1) {
        returnValue = "Section "+result[1]
    }
    else {
        returnValue = resultAlt && resultAlt.length > 1 ? resultAlt[1] : page.src.stem
    }
    return returnValue
}

function getAltNumberFromTitle( page, content ) {
    let value = getAltTextFromTitle(page,content)
    return value.split(" ")[1]
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

function getPageContentForExtensionFeatures( page ) {
    const contentSum = page.contents.toString()
    let newContent = contentSum.split("\n")
    let indexOfTitle = 0
    let indexOfNavtitle = -1
    let indexOfReftext = -1
    for(let line of newContent) {
        // Find title
        if (line.startsWith("= ")) {
            indexOfTitle = newContent.indexOf(line)
        }
        // Find level 2 sections
        // Find optional attribute :navtitle:
        else if (line.startsWith(":navtitle:")) {
            indexOfNavtitle = newContent.indexOf(line)
        }
        // Find optional attribute :reftext:
        else if (line.startsWith(":reftext:")) {
            indexOfReftext = newContent.indexOf(line)
        }
    }
    return [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext]
}

function handlePreface( nav, pages,line,imageIndex, tableIndex ) {
    const indexOfXref = line.indexOf("xref:")
    let page = determinePageForXrefInLine(line, indexOfXref, pages, nav)[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex] = updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
    addSpecialSectionTypeToPage(page, "preface")
    return ["default", newImageIndex, newTableIndex]
}

function handleAppendix( nav, pages, content, line, generateNumbers, startLevel, chapterIndex, imageIndex, tableIndex, style, appendixCaption, appendixOffset ) {
    const appendixStartLevel = isNaN(parseInt(startLevel)+parseInt(appendixOffset)) ? startLevel : (parseInt(startLevel)+parseInt(appendixOffset)).toString()
    return tryApplyingPageAndSectionNumberValuesToPage(nav, pages,content, line, generateNumbers, appendixStartLevel, chapterIndex, imageIndex, tableIndex, style, "appendix", appendixCaption)
}

function handleBibliography(nav, pages, line, imageIndex, tableIndex) {
    const indexOfXref = line.indexOf("xref:")
    let bibliographyPage = determinePageForXrefInLine(line, indexOfXref, pages, nav)
    let page = bibliographyPage[0]
    if (!page) {
        return ["default", imageIndex, tableIndex]
    }
    unsetSectnumsAttributeInFile(page)
    let [newImageIndex,newTableIndex] = updateImageAndTableIndex(pages, page, imageIndex, tableIndex)
    addSpecialSectionTypeToPage(page, "bibliography")
    return ["default", newImageIndex, newTableIndex]
}

function addAttributeWithValueToPage( page, pageContent, indexOfTitle, attribute, value, unset=false ) {
    const attr = unset ? ":"+attribute+"!: "+value : ":"+attribute+": "+value.toString()
    pageContent.splice(indexOfTitle+1,0,attr)
    page.contents = Buffer.from(pageContent.join("\n"))
}

function unsetSectnumsAttributeInFile( page ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
    addAttributeWithValueToPage( page, newContent, indexOfTitle, "sectnums", "", true)
}

function addTitleoffsetAttributeToPage( page, value) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
    addAttributeWithValueToPage(page, newContent, indexOfTitle, "titleoffset", value)
}

function addImageOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
    addAttributeWithValueToPage(page, newContent, indexOfTitle, "imageoffset", value)
}

function addTableOffsetAttributeToPage( page, value ) {
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
    addAttributeWithValueToPage(page, newContent, indexOfTitle, "tableoffset", value)
}

function updateImageAndTableIndex(pages, page, imageIndex=0, tableIndex=0){
    let newImageIndex = imageIndex
    let newTableIndex = tableIndex
    addImageOffsetAttributeToPage(page, newImageIndex)
    addTableOffsetAttributeToPage(page, newTableIndex)
    let [numberOfLevelTwoSections, numberOfImages, numberOfTables] = getIncludedPagesContentForExtensionFeatures(pages, page)
    newImageIndex += parseInt(numberOfImages)
    newTableIndex += parseInt(numberOfTables)
    return ([newImageIndex,newTableIndex,numberOfLevelTwoSections])
}

function addSpecialSectionTypeToPage( page, specialSectionType ){
    let [newContent, indexOfTitle, indexOfNavtitle, indexOfReftext] = getPageContentForExtensionFeatures(page)
    newContent.splice(indexOfTitle+1,0,"["+specialSectionType+"]")
    page.contents = Buffer.from(newContent.join("\n"))
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