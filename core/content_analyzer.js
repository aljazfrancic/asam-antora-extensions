'use strict'
//-------------
//-------------
// Core module for analyzing adoc content.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------

/**
 * Analyze a path of an include macro and identifies the linked file, if it exists.
 * @param {Array} pages - An array of all pages.
 * @param {Object} thisPage - The page where the include macro was found.
 * @param {*} includePath - The path extracted from the page.
 * @param {Boolean} published - Optional: If false, also considers content that is not published. Useful for partials.
 * @returns {Object} - The identified page.
 */
function determineTargetPageFromIncludeMacro(pages, thisPage, includePath, published = true) {
    if (!Array.isArray(includePath)) {
        includePath = includePath.split("/")
    }
    let currentPath = thisPage.src.path.split("/")
    currentPath.pop()
    if (thisPage.out) { currentPath = thisPage.out.dirname.split("/") }
    includePath.forEach(part => {
        if (part === "..") { currentPath = currentPath.slice(0, -1) }
        else if (part === ".") { }
        else { currentPath.push(part) }
    })
    const targetPath = currentPath.join("/")
    let includedPage = published ? pages.filter(page => page.out && page.out.dirname + "/" + page.src.basename === targetPath)[0] : pages.filter(page => page.src.path === targetPath)[0]
    return includedPage
}

/**
 * Updates a page's list of attributes based on the provided line from the content.
 * @param {Object} pageAttributes - The currently valid attributes.
 * @param {String} line - The line to be analyzed.
 */
function updatePageAttributes(pageAttributes, line) {
    const reAttribute = /^\s*:(!)?([^:!]+)(!)?:(.*)$/m
    const resAttribute = line.match(reAttribute)
    if (resAttribute) {
        if (resAttribute[1] || resAttribute[3]) {
            delete pageAttributes[resAttribute[2]]
        }
        else { pageAttributes[resAttribute[2]] = resAttribute[4] ? resAttribute[4] : "" }
    }
}

/**
 * Replace all attributes in a line with their value, if possible.
 * @param {Object} componentAttributes - All attributes set in the component or the site.
 * @param {Object} pageAttributes - All attributes set up to the provided line.
 * @param {String} line - The line where any attributes should be replaced.
 * @returns {String} - The updated line, if possible.
 */
function replaceAllAttributesInLine(componentAttributes, pageAttributes, line) {
    const reAttributeApplied = /(\/\/.*)?{([^}]+)}/gm;
    reAttributeApplied.lastIndex = 0;
    let newLine = line
    let m;
    let i = 0
    while ((m = reAttributeApplied.exec(newLine)) !== null) {
        if (m[1]) { break; }
        if (m.index === reAttributeApplied.lastIndex && i >= 20) {
            reAttributeApplied.lastIndex++;
            i = 0;
        }
        else if (m.index === reAttributeApplied.lastIndex) { i++; }
        const replacement = componentAttributes[m[2]] ? componentAttributes[m[2]].trim() : (pageAttributes[m[2]] ? pageAttributes[m[2]].trim() : undefined)
        if (replacement) {
            newLine = newLine.replace(m[0], replacement)
            reAttributeApplied.lastIndex = 0
        }
        else if (m[2] === "nbsp") {

        }
        // else {
        //     console.warn(`Could not replace "${m[2]}" in line: ${newLine}`)
        // }
    }
    return newLine
}

/**
 *
 * Extracts all manually defined anchors from an AsciiDoc file. Also traverses through included files.
 * @param {*} catalog - An array of all pages and partials.
 * @param {Object} thisFile - The current page.
 * @param {Object} componentAttributes - An object containing all attributes of the component.
 * @param {Object} inheritedAttributes - Optional: An object with the previously determined attributes for this file.
 * @param {Array} tags - Optional: An array of tags to filter for.
 * @returns {Map} - A map of anchors and the page(s) where they were found (source: the original source; usedIn: the page(s) where it is used in).
 */
function getAnchorsFromPageOrPartial(catalog, thisFile, componentAttributes, inheritedAttributes = {}, tags = []) {
    const re = /\[\[([^\],]+)(,([^\]]*))?\]\]|\[#([^\]]*)\]|anchor:([^\[]+)\[/
    const reInclude = /^\s*include::(\S*partial\$|\S*page\$)?([^\[]+\.adoc)\[(.+)?\]/m;
    const reTags = /.*,?tags?=([^,]+)/m;
    const reTaggedStart = /\/\/\s*tag::(.+)\[\]/m
    const reTaggedEnd = /\/\/\s*end::(.+)\[\]/m
    let resultMap = new Map
    let results = []
    let ignoreLine = false
    const splitContent = thisFile.contents.toString().split("\n")
    let lineOffset = 0
    let allowInclude = (tags.length > 0) ? false : true
    let taggedRegions = {}
    //-------------
    // Check all tags and set search behavior depending on
    // a) any tag is set?
    // b) at least one negated tag is set?
    //-------------
    for (let t of tags) {
        let v = t.startsWith("!") ? false : true;
        if (!v) {allowInclude = true}
        t = t.startsWith("!") ? t.slice(1) : t
        taggedRegions[t] = {include: v, active: false}
    }
    for (let line of splitContent) {
        //-------------
        // Set search behavior depending on active tags and skip lines explicitly excluded through tagged regions.
        // TODO: Handle wildcard tags!
        //-------------
        if (tags.length > 0) {
            const tagStartMatch = line.match(reTaggedStart)
            const tagEndMatch = line.match(reTaggedEnd)
            if (tagStartMatch && taggedRegions[tagStartMatch[1]]) {
                taggedRegions[tagStartMatch[1]].active = true
            }
            else if (tagEndMatch && taggedRegions[tagEndMatch[1]]) {
                taggedRegions[tagEndMatch[1]].active = false
            }
            allowInclude = Object.entries(taggedRegions).filter(([k,v]) => !v.include).length > 0 ? Object.entries(taggedRegions).filter(([k,v]) => (!v.include && v.active)).length === 0 : Object.entries(taggedRegions).filter(([k,v]) => v.active).length > 0
        }
        if (!allowInclude) {continue;}
        const currentLineIndex = splitContent.indexOf(line)
        //-------------
        // Add special behavior for custom "use-antora-rules" attribute
        //-------------
        if (line.indexOf("ifndef::") > -1 && line.indexOf("use-antora-rules") > -1) {
            ignoreLine = true
        }
        else if (ignoreLine && line.indexOf("endif::") > -1) {
            ignoreLine = false
        }
        if (ignoreLine) { continue; }
        //-------------
        // Get all attributes from this line and parse its content. If a file is included, check it. Otherwise, check if any anchor is found and, if so, add it to the list.
        //-------------
        updatePageAttributes(inheritedAttributes, line)
        let includeSearchResult = line.match(reInclude)
        if (includeSearchResult && includeSearchResult.length > 0) {
            line = replaceAllAttributesInLine(componentAttributes, inheritedAttributes, line)
            includeSearchResult = line.match(reInclude)
        }
        if (includeSearchResult && includeSearchResult.length > 0) {
            let targetFile
            if (includeSearchResult[1]) {
                targetFile = determineTargetPartialFromIncludeMacro(catalog, thisFile, includeSearchResult[1], includeSearchResult[2])
            }
            else {
                targetFile = determineTargetPageFromIncludeMacro(catalog, thisFile, includeSearchResult[2], false)
            }
            if (targetFile) {
                let tags = includeSearchResult[3] ? includeSearchResult[3].match(reTags) : []
                if (!tags){tags=[]}
                if (tags.length > 0) {
                    tags = tags[1].split(";")
                }
                const partialAnchorMap = getAnchorsFromPageOrPartial(catalog, targetFile, componentAttributes, inheritedAttributes, tags)
                partialAnchorMap.forEach((entry) => {
                    entry.line = entry.line + currentLineIndex + lineOffset
                })
                resultMap = mergeAnchorMapEntries(resultMap, partialAnchorMap, thisFile)
                lineOffset += targetFile.contents.toString().split("\n").length
            }
            else {
                console.warn("could not find", includeSearchResult)
            }
        }
        else {
            const result = re.exec(line);
            if (result) {
                result.line = currentLineIndex + lineOffset
                results.push(result)
            }
        }
    }
    //-------------
    // If at least one anchor was found, parse each match and update the corresponding anchor map.
    //-------------
    if (results) {
        for (let entry of results) {
            const e1 = entry[1]
            const e2 = entry[4]
            const e3 = entry[5]
            const line = entry.line

            const resultValue = e1 ? e1 : e2 ? e2 : e3
            if (resultMap.has(resultValue)) {
                updateAnchorMapEntry(resultMap, resultValue, thisFile, line)
            }
            else {
                resultMap.set(resultValue, { source: thisFile, line: line })
            }
        }
    }
    return resultMap
}

/**
 * Update function specifically designed for anchor maps.
 * @param {Map} inputMap - The in put map whose entry needs to be updated.
 * @param {String} key - The key which needs to be updated.
 * @param {*} addedValue - The new value.
 * @param {Integer} line - The line index at which the entry was found.
 */
function updateAnchorMapEntry(inputMap, key, addedValue, line) {
    let entry = inputMap.get(key)
    if (entry.usedIn) {
        entry.usedIn.push(addedValue)
    }
    else {
        entry.usedIn = [addedValue]
    }
    entry.line = line
}

/**
 * Returns the values of the keywords attribute of a file.
 * @param {Object} page - The page that is analyzed.
 * @returns {*} - The match of the regular expression, where the first group contains the list of keywords and res.line is the line the attribute was found in.
 */
function getAllKeywordsAsArray(page) {
    var re = /^\s*:keywords:(.*)/
    var content = page.contents.toString().split("\n")
    var i = 0
    var res;
    for (let line of content) {
        res = re.exec(line)
        if (res) {
            break;
        }
        i++;
    }
    res.line = i
    return (res)
}

/**
 * Determines the number of relevant sections up to a maximum section value.
 * This function also parses all included files that may be relevant depending on their accumulated leveloffset value.
 * @param {Array} pages - An array of pages.
 * @param {Object} page - The current page.
 * @param {Number} targetSectionLevel - The sectionlevel that is currently relevant.
 * @param {String} startText - Optional: If set, finds a specific anchor of type [#anchor] or [[anchor]].
 * @returns {Array} - The determined number of sections for the targetSectionLevel and below.
 */
function getRelativeSectionNumberWithIncludes(pages, page, targetSectionLevel, startText = "") {
    let currentTargetSectionLevel = targetSectionLevel
    let relativeIndex = startText ? [1] : [0]
    let content = page.contents.toString()
    const reSectionStart = /^(=+)\s[^\n]+/
    const reIncludeStart = /^\s*include::([^\[]+)\[(leveloffset=\+(\d+))?\]/
    //-------------
    // If the parameter startText is defined, limit the content to everything above that anchor.
    //-------------
    if (startText) {
        const indexType1 = content.indexOf("[#" + startText + "]")
        const indexType2 = content.indexOf("[[" + startText + "]]")
        if (indexType1 > -1) {
            content = content.slice(0, indexType1);
        }
        else if (indexType2 > -1) {
            content = content.slice(0, indexType2)
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
            if (leveloffset > 0) {
                const targetPage = determineTargetPageFromIncludeMacro(pages, page, includeSearchResult[1])
                if (targetPage) {
                    let includedSectionNumbers = getRelativeSectionNumberWithIncludes(pages, targetPage, leveloffset)
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
            else if (foundSectionLevel === currentTargetSectionLevel - 1) {
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
 * @param {Object} componentAttributes - An object containing all attributes of the component.
 * @param {Map} anchorPageMap - A map containing all found anchors and their pages.
 * @param {Array} pages - An array of all pages.
 * @param {Object} page - The current page.
 * @param {String} anchor - The anchor in question.
 * @param {String} style - Optional: A specific reference style to be returned. Options: "full", "short", or "basic".
 * @returns {String} - The extracted alt text.
 */
function getReferenceNameFromSource(componentAttributes, anchorPageMap, pages, page, anchor, style = "") {
    const reSectionEqualSigns = /^\s*(=+)\s+(.*)$/m
    const reCaptionLabel = /^\.(\S.+)$/m
    const reAnchorType = /#?([^-\]]+)-?[^\]]*/m
    let content = page.contents.toString()
    const resultAnchorType = anchor.match(reAnchorType)
    const indexOfAnchor = content.indexOf(anchor)
    const resultForNextHeading = content.slice(indexOfAnchor).match(reSectionEqualSigns)
    // const resultForPreviousHeading = content.slice(0,indexOfAnchor).match(reSectionEqualSigns)
    const resultNextCaption = content.slice(indexOfAnchor).match(reCaptionLabel)
    // Use special anchor formats: sec, top, fig, tab, ...
    let result
    let returnValue = ""
    let prefix = ""
    let title = ""
    const sectionRefsig = componentAttributes['section-refsig'] ? componentAttributes['section-refsig'] : "Section"
    const appendixRefsig = componentAttributes['appendix-caption'] ? componentAttributes['appendix-caption'] : "Appendix"
    //-------------
    //Only act on anchors that match one of the ASAM anchor types (matching reAnchorType).
    //-------------
    if (resultAnchorType) {
        switch (resultAnchorType[1]) {
            case "fig":
                result = resultNextCaption;
                const figureMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("fig-")))
                let figureIndex = Array.from(figureMap.keys()).indexOf(anchor) + 1
                if (result) {
                    title = result[1];
                    prefix = 'Figure ' + figureIndex;
                    returnValue = title;
                }
                break;
            case "tab":
                result = resultNextCaption;
                const tableMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("fig-")))
                let tableIndex = Array.from(tableMap.keys()).indexOf(anchor)
                if (result) {
                    title = result[1];
                    prefix = 'Table ' + tableIndex;
                    returnValue = title;
                }
                break;
            case "top":
                returnValue = getAltTextFromTitle(page, content);
                title = content.match(/^= (.*)$/m)[1];
                title = title ? title : returnValue;
                const titleoffset = getAttributeFromFile(page, "titleoffset");
                const titleprefix = getAttributeFromFile(page, "tileprefix");
                prefix = titleprefix ? titleprefix : titleoffset ? titleoffset : "";
                break;
            case "sec":
                result = resultForNextHeading ? resultForNextHeading : content.match(/^(=) (.*)$/m);
                let pageNumber = getAttributeFromFile(page, "titleoffset");
                if (!pageNumber) { pageNumber = ""; }
                else { pageNumber = pageNumber.trim(); }
                let relativeSectionNumber = getRelativeSectionNumberWithIncludes(pages, page, result[1].split("=").length - 1, anchor);
                relativeSectionNumber[0] = ""
                prefix = isNaN(pageNumber.charAt(0)) ? `${appendixRefsig} ${pageNumber}` : `${sectionRefsig} ${pageNumber}`;
                prefix = relativeSectionNumber.length > 1 && pageNumber !== "" ? prefix + relativeSectionNumber.join(".") : prefix;
                title = result[2].trim();
                break;
            default:
                console.warn("non-standard anchor type detected: ", anchor);
                returnValue = getAltTextFromTitle(page, content);
                break;
        }
        //-------------
        // Update the return value based on the selected style (if any). Otherwise, leave as is.
        //-------------
        switch (style) {
            case "full":
                returnValue = prefix ? `${prefix}, "${title}"` : `${title}`;
                break;
            case "short":
                returnValue = prefix;
                break;
            case "basic":
                returnValue = `${title}`;
                break;
            default:
                break;
        }
    }
    //-------------
    // Backup: If all else fails (i.e. an invalid anchor was found), get the alt text from the title.
    //-------------
    else {
        returnValue = getAltTextFromTitle(page, content);
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
function getAltTextFromTitle(page, content) {
    const re1 = /:titleprefix:\s*([^\n]+)/m
    const re2 = /:titleoffset:\s*([^\n]+)/m
    const re3 = /^=\s+([^\n\r]+)/m

    let returnValue
    let result = content.match(re1)
    if (!result || result.length <= 1) {
        result = content.match(re2)
    }
    const resultAlt = content.match(re3)
    if (result && result.length > 1) {
        returnValue = "Section " + result[1]
    }
    else {
        returnValue = resultAlt && resultAlt.length > 1 ? resultAlt[1] : page.src.stem
    }
    return returnValue
}

/**
 * Extracts the line index of the title, the index of the navtitle attribute, and the index of the reftext attribute, if applicable.
 * It also returns the contents of that page as an array.
 * @param {Object} page - The page that is analyzed.
 * @returns {Array} - [Content as array, indexOfTitle, indexOfNavtitle, indexOfReftext]
 */
function getPageContentForExtensionFeatures(page) {
    const contentSum = page.contents.toString()
    let newContent = contentSum.split("\n")
    let indexOfTitle = 0
    let indexOfNavtitle = -1
    let indexOfReftext = -1
    for (let line of newContent) {
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
function getNavEntriesByUrl(items = [], accum = {}) {
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
function isPublishableFile(page) {
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
function generateMapForRegEx(re, pages, exclusive = false) {
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
                        generatedMap = updateMapEntry(generatedMap, keywordTrimmed, page)
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
 * @param {Array} pages - An array of relevant pages.
 * @returns {Map} - A map of 'keywords' and the pages where they were found in.
 */
function getKeywordPageMapForPages(useKeywords, pages = []) {
    if (!useKeywords) {
        return (new Map())
    }
    var re = new RegExp("^\s*:keywords:(.*)")
    var keywordMap = generateMapForRegEx(re, pages, true)
    return keywordMap
}

/**
 * Generates a map for the 'role' shorthand.
 * @param {Array} pages - An array of relevant pages
 * @returns {Map} - A map of 'roles' and the pages where they were found in.
 */
function getRolePageMapForPages(pages = []) {
    var re = new RegExp("{role-([^}]*)}")
    var rolesMap = generateMapForRegEx(re, pages)
    return rolesMap
}

/**
 * Generates a map for all anchors with ASAM notation.
 * @param {Array} catalog - An array of relevant pages and partials.
 * @param {Array} pages - An array of relevant pages.
 * @param {Array} navFiles - An array of relevant navigation files.
 * @param {Object} componentAttributes - The attributes defined in the component or site.
 * @returns {Map} - A map of anchors and the pages where they were found in.
 */
function getAnchorPageMapForPages(catalog, pages, navFiles, componentAttributes) {
    var anchorMap = new Map;
    for (let page of pages.filter((page) => page.out)) {
        let hasPriority = false
        for (let nav of navFiles) {
            if (nav.contents.toString().indexOf(page.src.relative) > -1) {
                hasPriority = true;
                break;
            }
        }
        let updateMap = getAnchorsFromPageOrPartial(catalog, page, componentAttributes)
        if (updateMap && updateMap.size > 0) {
            if (hasPriority) {
                anchorMap = mergeAnchorMapEntries(updateMap, anchorMap)
            }
            else {
                anchorMap = mergeAnchorMapEntries(anchorMap, updateMap)
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
    return (inputMap.set(key, newValue))
}

/**
 * Adds or updates an anchor map entry by merging it with another map.
 * @param {Map} anchorMap - The anchor map where one or more entries have to be added.
 * @param {*} updateMap - An additional anchor map that needs to be merged with the original one.
 * @param {Object} overridePage - Optional: If set, replaces the value for each key in the updateMap with a new set containing the overridePage.
 * @returns {Map} - The updated anchor map.
 */
function mergeAnchorMapEntries(anchorMap, updateMap, overridePage = null) {
    for (let key of updateMap.keys()) {
        if (overridePage) {
            if (updateMap.get(key).usedIn) {
                updateMap.get(key).usedIn.push(overridePage)
            }
            else {
                updateMap.get(key).usedIn = [overridePage]
            }
        }
        if (anchorMap.get(key)) {
            anchorMap.get(key).line = anchorMap.get(key).line + updateMap.get(key).line
            if (anchorMap.get(key).usedIn) {
                anchorMap.get(key).usedIn = updateMap.get(key).usedIn ? anchorMap.get(key).usedIn.concat(updateMap.get(key).usedIn) : anchorMap.get(key).usedIn.push(updateMap.get(key).source)
            }
            else {
                anchorMap.get(key).usedIn = updateMap.get(key).usedIn ? updateMap.get(key).usedIn : [updateMap.get(key).source]
            }
        }
        else {
            anchorMap.set(key, updateMap.get(key))
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
function generateMapsForPages(mapInput) {
    let keywordPageMap = getKeywordPageMapForPages(mapInput.useKeywords, mapInput.pages)
    const rolePageMap = getRolePageMapForPages(mapInput.pages)
    let anchorPageMap = getAnchorPageMapForPages(mapInput.catalog, mapInput.pages, mapInput.navFiles, mapInput.componentAttributes)
    let mergedNavContents = []
    for (let nav of mapInput.navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })) {
        const newNavContent = nav.contents.toString().split("\n")
        mergedNavContents = mergedNavContents.concat(newNavContent)
    }
    mergedNavContents = mergedNavContents.join("\n")
    anchorPageMap = new Map(([...anchorPageMap]).sort((a, b) => {
        let indexA = mergedNavContents.indexOf(a[1].usedIn ? a[1].usedIn.at(-1).src.relative : a[1].source.src.relative)
        let indexB = mergedNavContents.indexOf(b[1].usedIn ? b[1].usedIn.at(-1).src.relative : b[1].source.src.relative)
        if (indexA === indexB) {
            indexA = parseInt(a[1].line)
            indexB = parseInt(b[1].line)
        }
        return indexA - indexB
    }))
    return { keywordPageMap, rolePageMap, anchorPageMap }
}

/**
 * Determines the file the link of an include is pointing to in case this is a partial with Antora url.
 * @param {Array} contentFiles - An array of all relevant files.
 * @param {Object} thisPage - The current page.
 * @param {String} pathPrefix - A prefix for the path, as determined from the include macro.
 * @param {String} includePath - The path after the prefix, as determined from the include macro.
 * @returns {Object} - The determined partial, if any.
 */
function determineTargetPartialFromIncludeMacro(contentFiles, thisPage, pathPrefix, includePath) {
    const prefixParts = pathPrefix.split(":")
    return contentFiles.find(file => file.src.family === "partial" && file.src.module === prefixParts.length > 1 ? prefixParts.at(-2) : thisPage.src.module && file.src.relative === includePath)
}

/**
 * Looks for the include macro and tries to identify the corresponding page or partial (.adoc).
 * @param {Object} catalog - A content catalog with all relevant content (files and attributes).
 * @param {Object} thisFile - The current file.
 * @param {String} line - The line that needs to be analyzed.
 * @returns {Object} - The identified target file.
 */
function checkForIncludedFileFromLine(catalog, thisFile, line) {
    let targetFile;
    const re = /^\s*include::((\S*partial\$)|(\S*page\$))?([^\[]+\.adoc)\[[^\]]*\]/
    const match = line.match(re)
    if (match) {
        const includePath = match[4]
        if (match[2]) {
            const prefixParts = match[1].split(":")
            targetFile = catalog.find(file => file.src.family === "partial" && file.src.module === prefixParts.length > 1 ? prefixParts.at(-2) : thisFile.src.module && file.src.relative === includePath)
        }
        else if (match[3]) {
            const prefixParts = match[1].split(":")
            targetFile = catalog.find(file => file.src.family === "page" && file.src.module === prefixParts.length > 1 ? prefixParts.at(-2) : thisFile.src.module && file.src.relative === includePath)
        }
        else {
            targetFile = determineTargetPageFromIncludeMacro(catalog, thisFile, includePath, false)
        }

    }
    return targetFile
}

/**
 * Tries to retrieve the value of an attribute from a file (first occurrence). Returns null if no match is found.
 * @param {Object} file - The file to be analyzed.
 * @param {String} attribute - The attribute in question.
 * @param {Integer} stopAfter - Optional: Defines a maximum number of lines to search before stopping.
 * @returns {*} - The identified attribute value, if found, or null, if not.
 */
function getAttributeFromFile(file, attribute, stopAfter = 0) {
    if (typeof attribute == 'string' || attribute instanceof String) {
        let attributes = {}
        let i = 0
        for (let line of file.contents.toString().split("\n")) {
            if (stopAfter > 0 && i > stopAfter) { break; }
            updatePageAttributes(attributes, line)
            if (attribute in attributes) {
                return attributes[attribute]
            }
            i++;
        }
    }
    return null
}

/**
 * Tries to retrieve the value of an attribute from a content Array (first occurrence). Returns null if no match is found.
 * @param {Array} content - An Array of String containing a file's content.
 * @param {String} attribute  - An attribute name.
 * @param {Integer} stopAfter - Optional: A maximum number of lines to search.
 * @returns {*} - The value of the requested attribute, if found, or null, if not.
 */
function getAttributeFromContent(content, attribute, stopAfter = 0) {
    if (typeof attribute == 'string' || attribute instanceof String) {
        if (typeof content == 'string' || content instanceof String) {
            content = content.split("\n")
        }
        let attributes = {}
        let i = 0
        for (let line of content) {
            console.log(line)
            if (stopAfter > 0 && i > stopAfter) { break; }
            updatePageAttributes(attributes, line)
            if (attribute in attributes) {
                return attributes[attribute]
            }
            i++;
        }
    }
    return null
}

/**
 * Determines the path to a source file from an Antora ID.
 * @param {String} fileId - The ID of an Antora file.
 * @returns {String} - The translated path to the file.
 */
function getSrcPathFromFileId(fileId) {
    let splitFileId = fileId.split("@")
    let version,
        component,
        antoraModule,
        type,
        relative

    if (splitFileId.length === 2) {
        version = splitFileId[0]
        splitFileId.shift()
    }

    splitFileId = splitFileId[0].split(":")
    if (splitFileId.length == 3) {
        component = splitFileId[0]
        splitFileId.shift()
    }
    if (splitFileId.length == 2) {
        antoraModule = splitFileId[0]
        splitFileId.shift()
    }
    splitFileId = splitFileId[0].split("$")
    if (splitFileId.length === 2) {
        type = splitFileId[0]
        splitFileId.shift()
    }
    relative = splitFileId[0]
    return { version: version, component: component, module: antoraModule, type: type, relative: relative }
}

module.exports = {
    determineTargetPageFromIncludeMacro,
    getAllKeywordsAsArray,
    getReferenceNameFromSource,
    determinePageForXrefInLine,
    getPageContentForExtensionFeatures,
    isPublishableFile,
    getNavEntriesByUrl,
    generateMapsForPages,
    getKeywordPageMapForPages,
    determineTargetPartialFromIncludeMacro,
    updatePageAttributes,
    replaceAllAttributesInLine,
    getAnchorsFromPageOrPartial,
    checkForIncludedFileFromLine,
    getAttributeFromFile,
    getSrcPathFromFileId,
    getAttributeFromContent
}