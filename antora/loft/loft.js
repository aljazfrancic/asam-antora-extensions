'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')
const FileCreator = require('../../core/file_creator.js')


function createLoft(contentCatalog, anchorPageMap, navFiles, pages, component, version) {
    let mergedNavContents = []
    const targetModule = navFiles[0].src.module
    for (let nav of navFiles) {
        const newNavContent = nav.contents.toString().split("\n")
        mergedNavContents = mergedNavContents.concat(newNavContent)
    }
    mergedNavContents = mergedNavContents.join("\n")
    const figureMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("fig-")).sort((a,b) => {
        let indexA = mergedNavContents.indexOf(a[1].values().next().value.src.relative)
        let indexB = mergedNavContents.indexOf(b[1].values().next().value.src.relative)
        return indexA - indexB
    }))
    const tableMap = new Map([...anchorPageMap].filter(([k,v]) => k.startsWith("tab-")).sort((a,b) => {
        let indexA = mergedNavContents.indexOf(a[1].values().next().value.src.relative)
        let indexB = mergedNavContents.indexOf(b[1].values().next().value.src.relative)
        return indexA - indexB
    }))

    let figuresPage = createListOfFiguresPage(contentCatalog, pages, figureMap, targetModule, component, version)
    let tablesPage = createListOfTablesPage(contentCatalog, pages, tableMap, targetModule, component, version)

    navFiles[0].contents = Buffer.from(navFiles[0].contents.toString().concat("\n",`* xref:${figuresPage.src.relative}[]`,"\n",`* xref:${tablesPage.src.relative}[]`))

}

function createListOfFiguresPage( contentCatalog, pages, figureMap, targetModule, component, version ){
    if (!figureMap || figureMap.length === 0) {return {}}
    let newContent = ['= List of figures']
    newContent.push('')
    newContent.push('[%header, cols="10,90", grid=none, frame=none]')
    newContent.push('|===')
    newContent.push('|Figure      |Description')
    let entryIndex = 1
    const base = figureMap.entries().next().value[1].values().next().value.base
    for (let entry of figureMap) {
        const page = entry[1].values().next().value
        const anchor = entry[0]
        const srcModule = page.src.module
        const path = page.src.relative
        const title = ContentAnalyzer.getReferenceNameFromSource(pages, page, anchor)
        newContent.push(`|Figure ${entryIndex}:  |xref:${srcModule}:${path}#${anchor}[${title}]`)
        entryIndex += 1
    }
    return (FileCreator.createNewVirtualFile(contentCatalog, "list_of_figures.adoc", "loft", targetModule, component, version, newContent.join("\n"), base))
}

function createListOfTablesPage( contentCatalog, pages, tableMap, targetModule, component, version ){
    if (!tableMap || tableMap.length === 0) {return {}}
    let newContent = ['= List of tables']
    newContent.push('')
    newContent.push('[%header, cols="10,90", grid=none, frame=none]')
    newContent.push('|===')
    newContent.push('|Table      |Description')
    let entryIndex = 1
    const base = tableMap.entries().next().value[1].values().next().value.base
    for (let entry of tableMap) {
        const page = entry[1].values().next().value
        const anchor = entry[0]
        const srcModule = page.src.module
        const path = page.src.relative
        const title = ContentAnalyzer.getReferenceNameFromSource(pages, page, anchor)
        newContent.push(`|Table ${entryIndex}:  |xref:${srcModule}:${path}#${anchor}[${title}]`)
        entryIndex += 1
    }
    return (FileCreator.createNewVirtualFile(contentCatalog, "list_of_tables.adoc", "loft", targetModule, component, version, newContent.join("\n"), base))
}

module.exports = {
    createLoft
}