'use strict'
//-------------
//-------------
// Core module for analyzing adoc content.
// Contains the following functions:
// determineTargetPageFromIncludeMacro (exposed)
// getAnchorsFromPage (exposed)
// getAllKeywordsAsArray (exposed)
// getReferenceNameFromSource (exposed)
// getAltTextFromTitle (exposed)
// getAltNumberFromTitle (exposed)
// getPageContentForExtensionFeatures (exposed)
// getNavEntriesByUrl (exposed)
// isPublishableFile (exposed)
// determinePageForXrefInLine (exposed)
// generateMapForRegEx
// getKeywordPageMapForPages (exposed)
// getRolePageMapForPages
// getAnchorPageMapForPages
// updateMapEntry
// addOrUpdateAnchorMapEntry (exposed)
// generateMapsForPages (exposed)
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------


/**
 * Analyze a path of an include macro and identifies the linked file, if it exists.
 * @param {*} pages - An array of all pages.
 * @param {Object} thisPage - The page where the include macro was found.
 * @param {*} includePath - The path extracted from the page.
 * @returns {Object} - The identified page.
 */
function determineTargetPageFromIncludeMacro ( pages, thisPage, includePath ) {
    if (!Array.isArray(includePath)) {
        includePath = includePath.split("/")
    }
    let currentPath = thisPage.src.path.split("/")
    currentPath.pop()
    if (thisPage.out) {currentPath = thisPage.out.dirname.split("/")}
    includePath.forEach(part => {
        if (part === "..") {currentPath = currentPath.slice(0,-1)}
        else if (part ===".") {}
        else {currentPath.push(part)}
    })
    const targetPath = currentPath.join("/")
    let includedPage = pages.filter(page => page.out && page.out.dirname +"/"+ page.src.basename === targetPath)[0]
    return includedPage
}

/**
 * Extracts all manually defined anchors from an AsciiDoc file. Also traverses through included files.
 * @param {*} pages - An array of all pages.
 * @param {Object} page - The current page.
 * @returns {Map} - A map of anchors and the page(s) where they were found.
 */
function getAnchorsFromPage( pages, page ) {
    var re = /\[\[([^\],]+)(,([^\]]*))?\]\]|\[#([^\]]*)\]|anchor:([^\[]+)\[/
    var resultMap = new Map
    var results = []
    let ignoreLine = false
    for (var line of page.contents.toString().split("\n")) {
        if (line.indexOf("ifndef::") > -1 && line.indexOf("use-antora-rules") > -1) {
            ignoreLine = true
        }
        else if (ignoreLine && line.indexOf("endif::") > -1) {
            ignoreLine = false
        }
        if (ignoreLine) {continue;}
        const includeSearchResult = line.match(/^\s*include::([^\[]+)\[(leveloffset=\+(\d+))?\]/)
        if (includeSearchResult && includeSearchResult.length > 0) {
            const targetPage = determineTargetPageFromIncludeMacro ( pages, page, includeSearchResult[1] )
            if (targetPage) {
                const partialAnchorMap = getAnchorsFromPage(pages,targetPage)
                resultMap = addOrUpdateAnchorMapEntry( resultMap, partialAnchorMap, page )
            }
        }
        else {
            const result = re.exec(line);
            if (result) {
                results.push(result)
            }
        }
    }
    if (results) {
        for (let entry of results) {
            const e1 = entry[1]
            const e2 = entry[4]
            const e3 = entry[5]

            const resultValue = e1 ? e1 : e2 ? e2 : e3
            if (resultMap.has(resultValue)) {
                resultMap = updateMapEntry(resultMap,resultValue,page)
            }
            else {
                resultMap.set(resultValue, new Set([page]))
            }
        }
    }
    return resultMap
}

/**
 * Returns the values of the keywords attribute of a file.
 * @param {Object} page - The page that is analyzed.
 * @returns {*} - The match of the regular expression, where the first group contains the list of keywords and res.line is the line the attribute was found in.
 */
function getAllKeywordsAsArray( page ) {
    var re = /^\s*:keywords:(.*)/
    var content = page.contents.toString().split("\n")
    var i = 0
    var res;
    for (let line of content) {
        res = re.exec(line)
        if (res){
            break;
        }
        i++;
    }
    res.line = i
    return(res)
}

/**
 * Determines the number of relevant sections up to a maximum section value.
 * This function also parses all included files that may be relevant depending on their accumulated leveloffset value.
 * @param {*} pages - An array of pages.
 * @param {Object} page - The current page.
 * @param {Number} targetSectionLevel - The sectionlevel that is currently relevant.
 * @param {String} startText - Optional: If set, finds a specific anchor of type [#anchor] or [[anchor]].
 * @returns {Array} - The determined number of sections for the targetSectionLevel and below.
 */
 function getRelativeSectionNumberWithIncludes(pages,page,targetSectionLevel,startText="") {
    let currentTargetSectionLevel = targetSectionLevel
    let relativeIndex = startText ? [1] : [0]
    let content = page.contents.toString()
    const reSectionStart = /^(=+)\s[^\n]+/
    const reIncludeStart = /^\s*include::([^\[]+)\[(leveloffset=\+(\d+))?\]/
    //-------------
    // If the parameter startText is defined, limit the content to everything above that anchor.
    //-------------
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
    //-------------
    // Reverse through the remaining content line by line and get all relevant sections.
    // If any files are included and they are adoc files, also traverse through them to determine the complete number of sections the page will have after Asciidoctor has compiled the final content.
    //-------------
    content.split("\n").reverse().forEach(line => {
        const sectionSearchResult = line.match(reSectionStart)
        const includeSearchResult = line.match(reIncludeStart)
        //-------------
        // Handle an included file in case the included sections could be of relevance (i.e. they are level 2 after inclusion).
        // This takes the leveloffset attribute into account.
        // NOTE: This does NOT handle included files with tags correctly!
        //-------------
        if (includeSearchResult && includeSearchResult.length > 0) {
            const leveloffset = includeSearchResult[3] ? targetSectionLevel - includeSearchResult[3] : targetSectionLevel
            if (leveloffset > 0)
            {
                const targetPage = determineTargetPageFromIncludeMacro(pages, page, includeSearchResult[1])
                if (targetPage){
                    let includedSectionNumbers = getRelativeSectionNumberWithIncludes(pages,targetPage,leveloffset)
                    for (let i in includedSectionNumbers) {
                        relativeIndex[i] += includedSectionNumbers[i]
                    }
                }
            }
        }
        //-------------
        // Handle a found section depending on its level vs. the target level.
        //-------------
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

/**
 * Retrieves the name associated with an anchor so it can be used as label when linking to other pages.
 * @param {*} pages - An array of all pages.
 * @param {Object} page - The current page.
 * @param {String} anchor - The anchor in question.
 * @returns {String} - The extracted alt text.
 */
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
    //-------------
    //Only act on anchors that match one of the ASAM anchor types (matching reAnchorType).
    //-------------
    if (resultAnchorType){
        switch (resultAnchorType[1]) {
            case "fig":
                result = resultNextCaption;
                if (result) {returnValue = result[1]}
                break;
            case "tab":
                result = resultNextCaption;
                if (result) {returnValue = result[1]}
                break;
            case "top":
                returnValue = getAltTextFromTitle( page, content );
                break;
            case "sec":
                result = resultForNextHeading;
                const pageNumber = getAltNumberFromTitle(page,content);
                let relativeSectionNumber = getRelativeSectionNumberWithIncludes(pages,page,result[1].split("=").length-1,anchor);
                if (relativeSectionNumber.length > 1){
                    relativeSectionNumber[0]="";
                    returnValue = "Section " + pageNumber+relativeSectionNumber.join(".");
                }
                else {
                    returnValue = "Section " + pageNumber;
                }
                break;
            default:
                console.log("non-standard anchor type detected: ", anchor);
                returnValue = getAltTextFromTitle( page, content );
                break;
        }

    }
    else {
        returnValue = getAltTextFromTitle( page, content );
    }
    return (returnValue)
}

/**
 * Determines the alt text for a link from the tile of a page. This includes set titleprefix and titleoffset attributes.
 * Defaults to the filename if all else fails.
 * @param {Object} page - The page for which the title needs to be extracted.
 * @param {String} content - The contents of that page.
 * @returns {String} - The extracted title.
 */
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

/**
 * Extracts the section number from the title of a numbered page.
 * @param {Object} page - The page for which the number needs to be extracted.
 * @param {String} content - The contents of that page.
 * @returns {String} - The extracted number(s)
 */
function getAltNumberFromTitle( page, content ) {
    let value = getAltTextFromTitle(page,content)
    return value.split(" ")[1]
}

/**
 * Extracts the line index of the title, the index of the navtitle attribute, and the index of the reftext attribute, if applicable.
 * It also returns the contents of that page as an array.
 * @param {Object} page - The page that is analyzed.
 * @returns {Array} - [Content as array, indexOfTitle, indexOfNavtitle, indexOfReftext]
 */
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

/**
 * Extracts links by url from an array of items.
 * Function provided by Antora project.
 * @param {Array} items - The items that need to be analyzed.
 * @param {Object} accum - A previously already aggregated Object of extracted links.
 * @returns {Object} - The extracted links.
 */
function getNavEntriesByUrl (items = [], accum = {}) {
    items.forEach((item) => {
        if (item.urlType === 'internal') accum[item.url.split('#')[0]] = item
        getNavEntriesByUrl(item.items, accum)
    })
    return accum
}

/**
 * Determines if a page is publishable, i.e. it does not start with "_" or ".".
 * @param {Object} page - The page that is to be analyzed.
 * @returns {Boolean} - States if a page will be published.
 */
function isPublishableFile( page ) {
    return (page.src.relative.indexOf("/_") < 0 && page.src.relative.indexOf("/.") < 0 && !page.src.relative.startsWith("_") && !page.src.relative.startsWith("."))
}

/**
 * Determines the page for an xref entry from a line.
 * @param {String} line - The line where the xref macro is located.
 * @param {Number} indexOfXref - the index of the xref in the line.
 * @param {*} pages - An array of all pages.
 * @param {Object} nav - The relevant navigation file.
 * @returns {Object} - The matched page.
 */
function determinePageForXrefInLine(line, indexOfXref, pages, nav) {
    const endOfXref = line.indexOf("[")
    const targetFile = line.slice(indexOfXref + 5, endOfXref)
    let foundPage = pages.filter(x => x.src.relative === targetFile && x.src.module === nav.src.module)
    return foundPage
}

/**
 * Generates a map for a regular expression where each matched keyword is an entry and each page it was matched in a value for that entry.
 * @param {*} re - A regular expression that is to be matched for each page.
 * @param {*} pages - An array of relevant pages.
 * @param {Boolean} exclusive - Optional: If true, the function will only look for the first match in the file.
 * @returns {Map} - A map of matched keywords and the pages where that match occurred.
 */
function generateMapForRegEx(re,pages,exclusive=false) {
    var generatedMap = new Map;
    for (let page of pages.filter((page) => page.out)) {
        var results = []
        for (var line of page.contents.toString().split("\n")) {
            const result = re.exec(line);
            if (result) {
                results.push(result)
                if (exclusive) {
                    break;
                }
            }
        }
        if (results) {
            for (let entry of results) {
                const split_results = entry[1].split(",")
                for (let keyword of split_results) {
                    const keywordTrimmed = keyword.trim()
                    if (generatedMap.has(keywordTrimmed)) {
                        generatedMap = updateMapEntry(generatedMap,keywordTrimmed,page)
                    }
                    else {
                        generatedMap.set(keywordTrimmed, new Set([page]))
                    }
                }
            }
        }
    }
    return (generatedMap)
}

/**
 * Generates a map for the 'keywords' attribute.
 * @param {Boolean} useKeywords - The function is only executed if this is set to true.
 * @param {*} pages - An array of relevant pages.
 * @returns {Map} - A map of 'keywords' and the pages where they were found in.
 */
function getKeywordPageMapForPages (useKeywords, pages = {}) {
    if (!useKeywords) {
        return (new Map())
    }
    var re = new RegExp("^\s*:keywords:(.*)")
    var keywordMap = generateMapForRegEx(re,pages,true)
    return keywordMap
}

/**
 * Generates a map for the 'role' shorthand.
 * @param {*} pages - An array of relevant pages
 * @returns {Map} - A map of 'roles' and the pages where they were found in.
 */
function getRolePageMapForPages (pages = {}) {
    var re = new RegExp("{role-([^}]*)}")
    var rolesMap = generateMapForRegEx(re,pages)
    return rolesMap
}

/**
 * Generates a map for all anchors with ASAM notation.
 * @param {*} pages - An array of relevant pages.
 * @param {*} navFiles - An array of relevant navigation files.
 * @returns {Map} - A map of anchors and the pages where they were found in.
 */
function getAnchorPageMapForPages( pages, navFiles ) {
    var anchorMap = new Map;
    for (let page of pages.filter((page) => page.out)) {
        let hasPriority = false
        for (let nav of navFiles) {
            if (nav.contents.toString().indexOf(page.src.relative) > -1) {
                hasPriority = true;
                break;
            }
        }
        let updateMap = getAnchorsFromPage(pages, page)
        if (updateMap && updateMap.size > 0) {
            if (hasPriority) {
                anchorMap = addOrUpdateAnchorMapEntry(updateMap,anchorMap)
            }
            else {
                anchorMap = addOrUpdateAnchorMapEntry(anchorMap, updateMap)
            }
        }
    }
    return anchorMap
}

/**
 * Updates a map entry by adding a new value to it. Does not work for anchor maps.
 * @param {Map} inputMap - The map that needs to be updated.
 * @param {String} key - The key that is to receive an additional value
 * @param {*} addedValue - The new added value.
 * @returns {Map} - The updated map.
 */
const updateMapEntry = (inputMap, key, addedValue) => {
    const newValue = inputMap.get(key).add(addedValue)
    return (inputMap.set(key,newValue))
}

/**
 * Adds or updates an anchor map entry by merging it with another map.
 * @param {Map} anchorMap - The anchor map where one or more entries have to be added.
 * @param {*} updateMap - An additional anchor map that needs to be merged with the original one.
 * @param {Object} overridePage - Optional: If set, replaces the value for each key in the updateMap with a new set containing the overridePage.
 * @returns {Map} - The updated anchor map.
 */
function addOrUpdateAnchorMapEntry( anchorMap, updateMap, overridePage = null ) {
    for (let key of updateMap.keys()) {
        if (overridePage) {
            updateMap.set(key, new Set([overridePage]))
        }
        if (anchorMap.has(key)) {
            const mergedSet = new Set([...anchorMap.get(key),...updateMap.get(key)])
            anchorMap = anchorMap.set(key, mergedSet)
        }
        else {
            anchorMap.set(key,updateMap.get(key))
        }
    }
    return anchorMap
}

/**
 * Generator for all relevant maps.
 * This function generates maps for keywords, roles, and anchors.
 * @param {Object} mapInput - A set of configuration parameters relevant for the map generator. Must contain 'useKeywords', 'pages', and 'navFiles'.
 * @returns {Object} - Object containing the determined maps: keywordPageMap, rolePageMap, anchorPageMap.
 */
function generateMapsForPages( mapInput ) {
    let keywordPageMap = getKeywordPageMapForPages(mapInput.useKeywords,mapInput.pages)
    const rolePageMap = getRolePageMapForPages(mapInput.pages)
    let anchorPageMap = getAnchorPageMapForPages(mapInput.pages, mapInput.navFiles)
    return { keywordPageMap, rolePageMap, anchorPageMap }
}


module.exports = {
    determineTargetPageFromIncludeMacro,
    getAnchorsFromPage,
    getAllKeywordsAsArray,
    getReferenceNameFromSource,
    getAltTextFromTitle,
    getAltNumberFromTitle,
    determinePageForXrefInLine,
    getPageContentForExtensionFeatures,
    isPublishableFile,
    getNavEntriesByUrl,
    generateMapsForPages,
    getKeywordPageMapForPages,
    addOrUpdateAnchorMapEntry
}