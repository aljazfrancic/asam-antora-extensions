'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')
const FileCreator = require('../../core/file_creator.js')
const Helper = require('./lib/helper.js')

function replaceRoleRelatedMacro( page, pageContent, line, macroResult, heading, rolePageMap, keywordPageMap, logger ) {
    var resultValues = Helper.parseCustomXrefMacro(macroResult, line, heading)
    var exclusionSet = Helper.excludeSelf(page)
    var content = ""
    if (resultValues.parameters) {
        content = "\n"
    }
    else {
        content = resultValues.newLine
    }
    resultValues.attributes.split(",").forEach((el) => {
        const elTrimmed = el.trim()
        if (rolePageMap.has(elTrimmed)) {
            rolePageMap.get(elTrimmed).forEach((rolePage) => {
                var pageRelevant = true
                if (resultValues.parameters) {
                    pageRelevant = false
                    const keywords = ContentAnalyzer.getAllKeywordsAsArray(rolePage)
                    if (keywords) {
                        for (var k of resultValues.parameters.split(",").map(x => x.trim())) {
                            if (keywords[1].split(",").map(x => x.trim()).indexOf(k)>-1) {
                                pageRelevant = true
                            }
                        }
                    }
                }
                if (!exclusionSet.has(rolePage) && pageRelevant) {
                    const moduleName = rolePage.src.module
                    const modulePath = rolePage.src.relative
                    const linkText = `xref:${moduleName}:${modulePath}[]`
                    content = content.concat("\n",Helper.addNewBulletPoint(linkText))
                }
            })
        }
        else {
            logger.warn("Role not found")
        }
    })
    pageContent.splice(pageContent.indexOf(line),1,content)
    return (pageContent)
}

function replaceRelatedMacro( page, pageContent, line, macroResult, heading, keywordPageMap ) {
    var resultValues = Helper.parseCustomXrefMacro(macroResult, line, heading)
    var exclusionSet = Helper.excludeSelf(page)
    exclusionSet = Helper.excludeNegatedAttributes(exclusionSet, resultValues.attributes, keywordPageMap)
    var content = resultValues.newLine
    resultValues.attributes.split(",").forEach((el) => {
        const elTrimmed = el.trim()
        if (elTrimmed.startsWith("!")) {
        }
        else if (keywordPageMap.has(elTrimmed)) {
            keywordPageMap.get(elTrimmed).forEach((keywordPage) => {
                if (!exclusionSet.has(keywordPage)) {
                    const moduleName = keywordPage.src.module
                    const modulePath = keywordPage.src.relative
                    const linkText = `xref:${moduleName}:${modulePath}[]`
                    content = content.concat("\n",Helper.addNewBulletPoint(linkText))
                }
            })
        }
        else {
            // logger.warn({ file: page.src, source: page.src.origin }, 'No page for keyword found')
            const filename = page.src
            console.log(`No page for keyword ${el} found: file: ${filename}`)
            console.log(exclusionSet)
            console.log(keywordPageMap.keys())
        }
    })
    pageContent.splice(pageContent.indexOf(line),1,content)
    return (pageContent)
}

function replaceReferenceMacro( page, pageContent, line, macroResult, heading, keywordPageMap ) {
    return (replaceRelatedMacro(page, pageContent, line, macroResult, heading, keywordPageMap))
}

function replacePagesMacro( page, pageContent, line, macroResult, heading, pages ) {
    var resultValues = Helper.parseCustomXrefMacro(macroResult, line, heading)
    var exclusionSet = Helper.excludeSelf(page)
    const parameterArray = resultValues.parameters.split(",")
    var content = resultValues.newLine
    var doAll = false
    var targetPath = page.dirname
    for (let par of parameterArray) {
        var param = par.trim()
        if (param === "all") {
            doAll = true
        }
        else {
            param = param.split("=").map((e) => {
                e = e.trim()
                return (e);
            })
            if (param.indexOf("path") > -1) {
                const path = param[1]
                targetPath=targetPath+"/"+path
            }
        }
    }
    const childPagesArray = Helper.getChildPagesOfPath(pages, targetPath, doAll)

    for (let child of childPagesArray) {
        if (!exclusionSet.has(child)) {
            const moduleName = child.src.module;
            const modulePath = child.src.relative;
            const linkText = `xref:${moduleName}:${modulePath}[]`
            content = content.concat("\n",Helper.addNewBulletPoint(linkText))
        }
    }
    content += "\n"
    pageContent.splice(pageContent.indexOf(line),1,content)
    return(pageContent)
}

function replaceAutonavMacro( contentCatalog, pages, nav, component, version, findModuleMainPage=true ) {
    const modulePath = nav.dirname+"/pages"
    const moduleName = nav.src.module
    let modulePages = pages.filter(page => page.src.module === moduleName)

    let addedVirtualPages = FileCreator.createVirtualFilesForFolders(contentCatalog,component,version,moduleName,modulePages,modulePath)
    modulePages = [...modulePages,...addedVirtualPages]
    pages = [...pages,...addedVirtualPages]

    let moduleStartPage = modulePages[0].basename
    const rootLevelPages = modulePages.filter(x => x.src.moduleRootPath === "..").map(x => x.stem)

    if (rootLevelPages.indexOf(moduleName) > -1) {
        moduleStartPage = moduleName+".adoc"
    }
    else if (rootLevelPages.indexOf("index") > -1){
        moduleStartPage = rootLevelPages[rootLevelPages.indexOf("index")]
    }
    else if (rootLevelPages.indexOf("main") > -1){
        moduleStartPage = "main.adoc"
    }

    let navBody = [""]
    if (findModuleMainPage) {
        navBody = ["* xref:"+moduleStartPage+"[]"]
    }

    modulePages.sort((a,b) => {
        var relA = a.src.path.replace(".adoc","").split("/")
        var relB = b.src.path.replace(".adoc","").split("/")
        var l = Math.max(relA.length, relB.length)
        for (var i = 0; i < l; i += 1) {
            if (!(i in relA)) return -1
            if (!(i in relB)) return 1
            if (relA[i] > relB[i]) return +1
            if (relA[i] < relB[i]) return -1
        }
    })

    modulePages.forEach( (page) => {
        let currentLevel = findModuleMainPage ? 2 : 1
        let moduleRootPath = page.src.moduleRootPath
        if (moduleRootPath.indexOf("/")>-1 ) {
            currentLevel = currentLevel-1 + moduleRootPath.split("/").length
        }
        let line = "*".repeat(currentLevel) + " xref:"+page.src.relative+"[]"
        if ((page.src.relative !== moduleStartPage || !findModuleMainPage) && ContentAnalyzer.isPublishableFile(page))  {
            navBody.push(line)
        }
    })
    nav.contents = Buffer.from(navBody.join("\n"))
    return pages
}


function findAndReplaceCustomASAMMacros( contentCatalog, pages, navFiles, keywordPageMap, rolePageMap, macrosRegEx, macrosHeadings, logger, component, version) {
    const re = macrosRegEx.find(x => x.macro === "autonav").re;
    for (let nav of navFiles) {
        var m;
        let result;
        const content = nav.contents.toString().split("\n")
        for (let line in content) {
            result = re.exec(content[line])
            if (result){
                break;
            }
        }
        if (result) {
            const findModuleMainPage = result[2].split(",").indexOf("none") > -1 ? false : true

            pages = replaceAutonavMacro(contentCatalog, pages, nav, component, version, findModuleMainPage)
        }
    }

    for (const page of pages) {
        var pageContent = page.contents.toString().split("\n")
        for (const line of pageContent) {
            for (const entry of macrosRegEx) {
                const macro = entry.macro
                const re = entry.re
                const heading = macrosHeadings.find(x => x.macro === macro).heading
                const macroResult = re.exec(line)
                if (macroResult) {
                    var newContent = ""
                    switch (macro) {
                        case "role":
                            pageContent = replaceRoleRelatedMacro(page, pageContent, line, macroResult, heading, rolePageMap, keywordPageMap,logger)
                            break;
                        case "related":
                            newContent = replaceRelatedMacro(page, pageContent, line, macroResult, heading, keywordPageMap, macrosRegEx)
                            break;
                        case "reference":
                            newContent = replaceReferenceMacro(page, pageContent, line, macroResult, heading, keywordPageMap, macrosRegEx)
                            break;
                        case "pages":
                            newContent = replacePagesMacro(page, pageContent, line, macroResult, heading, pages)
                            break;
                    }
                }
            }
        }
        page.contents = Buffer.from(pageContent.join("\n"))
    }
    return pages

}

module.exports = {
    findAndReplaceCustomASAMMacros
}