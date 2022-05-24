'use strict'

function excludeNegatedAttributes( exclusionSet = new Set(), attributes, keywordPageMap ) {
    const attributesArray = attributes.split(",").filter(attr => attr.trim().startsWith("!"))
    for (let attr of attributesArray) {
        let attrPage;
        attr = attr.slice(1)
        if (keywordPageMap.has(attr)) {
            attrPage = keywordPageMap.get(attr)
            exclusionSet = new Set([...exclusionSet,...attrPage])
        }
    }
    return (exclusionSet)
}

function excludeSelf( page, exclusionSet = new Set() ) {
    exclusionSet.add(page)
    return exclusionSet
}

function addNewBulletPoint( content ) {
    return "* ".concat(content)
}

function parseCustomXrefMacro( macroResult, line, heading ) {
    var resultValues = new Object;
    resultValues.attributes = macroResult[1]
    resultValues.parameters = macroResult[2]
    resultValues.indexStart = macroResult.index
    resultValues.indexStop = line.indexOf("]",resultValues.indexStart) +1
    const newLine = line.substring(0,resultValues.indexStart) + heading + " "+ line.substring(resultValues.indexStop)
    resultValues.newLine = newLine
    return resultValues
}

function getChildPagesOfPath( pages, path, doAll=false ) {
    var childPages = new Array();
    if (doAll) {
        pages.forEach((page) => {
            if (page.dirname.indexOf(path) >-1) {
                childPages.push(page)
            }
        })
    }
    else {
        pages.forEach((page) => {
            if (page.dirname === path) {
                childPages.push(page)
            }
        })
    }
    return (childPages);
}


module.exports = {
    excludeNegatedAttributes,
    excludeSelf,
    addNewBulletPoint,
    parseCustomXrefMacro,
    getChildPagesOfPath
}