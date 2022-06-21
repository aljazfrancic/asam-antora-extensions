'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')
const FileCreator = require('../../core/file_creator.js')


function createLoft(componentAttributes, contentCatalog, anchorPageMap, navFiles, catalog, component, version) {
    let mergedNavContents = []
    navFiles.sort((a,b) => {
        return a.nav.index - b.nav.index
    })
    const targetModule = navFiles.at(-1).src.module
    for (let nav of navFiles) {
        const newNavContent = nav.contents.toString().split("\n")
        mergedNavContents = mergedNavContents.concat(newNavContent)
    }
    mergedNavContents = mergedNavContents.join("\n")
    const figureMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("fig-")))
    const tableMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("tab-")))
    let figuresPage = createListOfFiguresPage(componentAttributes, contentCatalog, catalog, figureMap, targetModule, component, version)
    let tablesPage = createListOfTablesPage(componentAttributes, contentCatalog, catalog, tableMap, targetModule, component, version)

    if (figuresPage) {
        navFiles.at(-1).contents = Buffer.from(navFiles.at(-1).contents.toString().concat("\n",`* xref:${figuresPage.src.relative}[]\n`))
    }

    if (tablesPage) {
        navFiles.at(-1).contents = Buffer.from(navFiles.at(-1).contents.toString().concat("\n",`* xref:${tablesPage.src.relative}[]\n`))
    }

}

function createListOfFiguresPage( componentAttributes, contentCatalog, catalog, figureMap, targetModule, component, version ){
    if (!figureMap || figureMap.length === 0) {return null;}
    let newContent = ['= List of figures']
    newContent.push('')
    newContent.push('[%header, cols="10,90", grid=none, frame=none]')
    newContent.push('|===')
    newContent.push('|Figure      |Description')
    let entryIndex = 1
    const base = figureMap.entries().next().value[1].source.base
    for (let entry of figureMap) {
        const page = entry[1].usedIn ? entry[1].usedIn.at(-1) : entry[1].source
        const anchor = entry[0]
        const srcModule = page.src.module
        const path = page.src.relative
        const src = entry[1].source
        let title = ContentAnalyzer.getReferenceNameFromSource(componentAttributes, figureMap, catalog, src, anchor)
        title = replaceXrefsInTitleLink(title)

        if (title !== "") {
            newContent.push(`|Figure ${entryIndex}:  |xref:${srcModule}:${path}#${anchor}[${title}]`)
            entryIndex += 1
        }
    }
    newContent.push("|===")
    let targetPage = catalog.find(x => x.src.relative === "loft/list_of_figures.adoc")
    if (targetPage) {
        targetPage.contents = Buffer.from(newContent.join("\n"))
        return null;
    }
    return (FileCreator.createNewVirtualFile(contentCatalog, "list_of_figures.adoc", "loft", targetModule, component, version, newContent.join("\n"), base))
}

function createListOfTablesPage( componentAttributes, contentCatalog, catalog, tableMap, targetModule, component, version ){
    if (!tableMap || tableMap.length === 0) {return null;}
    let newContent = ['= List of tables']
    newContent.push('')
    newContent.push('[%header, cols="10,90", grid=none, frame=none]')
    newContent.push('|===')
    newContent.push('|Table      |Description')
    let entryIndex = 1
    const base = tableMap.entries().next().value[1].source.base
    for (let entry of tableMap) {
        const page = entry[1].usedIn ? entry[1].usedIn.at(-1) : entry[1].source
        const anchor = entry[0]
        const srcModule = page.src.module
        const path = page.src.relative
        const src = entry[1].source
        let title = ContentAnalyzer.getReferenceNameFromSource(componentAttributes, tableMap, catalog, src, anchor)
        title = replaceXrefsInTitleLink(title)

        if (title !== "") {
            newContent.push(`|Table ${entryIndex}:  |xref:${srcModule}:${path}#${anchor}[${title}]`)
            entryIndex += 1
        }
    }
    newContent.push("|===")
    let targetPage = catalog.find(x => x.src.relative === "loft/list_of_tables.adoc")
    if (targetPage) {
        targetPage.contents = Buffer.from(newContent.join("\n"))
        return null;
    }
    return (FileCreator.createNewVirtualFile(contentCatalog, "list_of_tables.adoc", "loft", targetModule, component, version, newContent.join("\n"), base))
}

function replaceXrefsInTitleLink(titleText) {
    const re = /(xref:[^\[]+\[(.*)\])/m
    const match = titleText.match(re)
    if (match) {
        let newTitleText = titleText.replace(match[1], match[2])
        return newTitleText
    }
    else {
        return titleText
    }
}

module.exports = {
    createLoft
}