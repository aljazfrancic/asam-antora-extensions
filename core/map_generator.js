'use strict'
const ContentAnalyzer = require("./content_analyzer.js")

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

function getKeywordPageMapForPages (useKeywords, pages = {}) {
    if (!useKeywords) {
        return (new Map())
    }
    var re = new RegExp("^\s*:keywords:(.*)")
    var keywordMap = generateMapForRegEx(re,pages,true)
    return keywordMap
}

function getRolePageMapForPages (pages = {}) {
    var re = new RegExp("{role-([^}]*)}")
    var rolesMap = generateMapForRegEx(re,pages)
    return rolesMap
}

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
        let updateMap = ContentAnalyzer.getAnchorsFromPage(pages, page)
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

const updateMapEntry = (inputMap, key, addedValue) => {
    const newValue = inputMap.get(key).add(addedValue)
    return (inputMap.set(key,newValue))
}

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

function generateMapsForPages( mapInput ) {
    let keywordPageMap = getKeywordPageMapForPages(mapInput.useKeywords,mapInput.pages)
    const rolePageMap = getRolePageMapForPages(mapInput.pages)
    let anchorPageMap = getAnchorPageMapForPages(mapInput.pages, mapInput.navFiles)
    return { keywordPageMap, rolePageMap, anchorPageMap }
}


module.exports = {
    generateMapsForPages,
    getKeywordPageMapForPages,

}