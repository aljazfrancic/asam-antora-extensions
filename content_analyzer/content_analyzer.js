'use strict'

function determineTargetPageFromIncludeMacro ( pages, thisPage, includePath ) {
    if (!Array.isArray(includePath)) {
        includePath = includePath.split("/")
    }
    let currentPath = thisPage.out.dirname.split("/")
    includePath.forEach(part => {
        if (part === "..") {currentPath = currentPath.slice(0,-1)}
        else if (part ===".") {}
        else {currentPath.push(part)}
    })
    const targetPath = currentPath.join("/")
    let includedPage = pages.filter(page => page.out && page.out.dirname +"/"+ page.src.basename === targetPath)[0]
    return includedPage
}

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

module.exports = {
    determineTargetPageFromIncludeMacro,
    getAnchorsFromPage,
    getAllKeywordsAsArray
}