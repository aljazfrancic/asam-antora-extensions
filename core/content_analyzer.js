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

function getNavEntriesByUrl (items = [], accum = {}) {
    items.forEach((item) => {
        if (item.urlType === 'internal') accum[item.url.split('#')[0]] = item
        getNavEntriesByUrl(item.items, accum)
    })
    return accum
    }

function isPublishableFile( page ) {
    return (page.src.relative.indexOf("/_") < 0 && page.src.relative.indexOf("/.") < 0 && !page.src.relative.startsWith("_") && !page.src.relative.startsWith("."))
}

function determinePageForXrefInLine(line, indexOfXref, pages, nav) {
    const endOfXref = line.indexOf("[")
    const targetFile = line.slice(indexOfXref + 5, endOfXref)
    let foundPage = pages.filter(x => x.src.relative === targetFile && x.src.module === nav.src.module)
    return foundPage
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
    getNavEntriesByUrl
}