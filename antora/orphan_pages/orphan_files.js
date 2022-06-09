'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')

function listAllUnusedPartialsAndDraftPages(contentCatalog, component, version, logger) {
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const pages = contentCatalog.findBy({ component, version, family: 'page' }).filter((page) => page.out)
    const unpublished = contentCatalog.findBy({ component, version, family: 'page' }).filter((page) => !page.out)
    const partials = contentCatalog.findBy({ component, version ,family: 'partial'}).filter((partial) => partial.mediaType === "text/asciidoc")
    const contentFiles = contentCatalog.findBy({component,version})
    let includedPartials = []
    let publishedDraftPages = [],
        unpublishedDraftPages = [],
        draftPartials = []
    pages.forEach((page) => {
        includedPartials = includedPartials.concat(listIncludedPartialsAndPages(contentFiles,pages, page, componentAttributes, logger))
        if (listPagesWithDraftFlag(page)) {
            publishedDraftPages.push(page)
        }
    })
    unpublished.forEach((page) => {
        if (listPagesWithDraftFlag(page)) {
            unpublishedDraftPages.push(page)
        }
    })
    partials.forEach((page) => {
        if (listPagesWithDraftFlag(page)) {
            draftPartials.push(page)
        }
    })

    includedPartials = [...new Set(includedPartials)];
    const notIncludedPartials = contentCatalog
        .findBy({component, version, family: 'partial', mediaType: "text/asciidoc"})
        .filter((partial) => (!includedPartials.includes(partial)))
    notIncludedPartials.forEach((file) => {logger.warn({ file:file.src, source: file.src.origin }, "not included partial detected")})
    publishedDraftPages.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "published page with draft section detected")})
    unpublishedDraftPages.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "unpublished page with draft section detected")})
    draftPartials.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "partial with draft section detected")})

}

function listIncludedPartialsAndPages(contentFiles,pages, page, componentAttributes, logger, inheritedAttributes = {}) {
    const reInclude = /^\s*include::(\S*partial\$|\S*page\$)?([^\[]+\.adoc)\[[^\]]*\]/m;
    const reIncludeAlt = /^\s*include::([^\[]*{[^}]+}[^\]]*)\[[^\]]*\]/m;
    const reAttribute = /^:(!)?([^:!]+)(!)?:(.*)$/m
    const reAttributeApplied = /{([^}]+)}/gm;
    const pageContent = page.contents.toString().split("\n")
    let includedFiles = []
    for (let line of pageContent) {
        let resInclude = reInclude.exec(line)
        const resIncludeAlt = reIncludeAlt.exec(line)
        const resAttribute = reAttribute.exec(line)
        let includedFile
        if (resIncludeAlt) {
            reAttributeApplied.lastIndex = 0;
            let newLine = line
            let m;
            let i = 0
            while ((m = reAttributeApplied.exec(newLine)) !== null) {
                if (m.index === reAttributeApplied.lastIndex && i >= 20) {
                    reAttributeApplied.lastIndex++;
                    i = 0;
                }
                else if (m.index === reAttributeApplied.lastIndex) {i++;}
                const replacement = componentAttributes[m[1]] ? componentAttributes[m[1]].trim() : (inheritedAttributes[m[1]] ? inheritedAttributes[m[1]].trim() : undefined)
                if (replacement) {
                    newLine = newLine.replace(m[0],replacement)
                    reAttributeApplied.lastIndex = 0
                }
                else{
                    logger.warn({ file: page.src, source: page.src.origin }, `could not resolve ${line}`)
                }
            }
            resInclude = reInclude.exec(newLine)
        }
        if (resInclude) {
            if (!resInclude[1]) {
                includedFile = ContentAnalyzer.determineTargetPageFromIncludeMacro(contentFiles, page, resInclude[2])
            }
            else {
                includedFile = determineTargetPartialFromIncludeMacro(contentFiles, page, resInclude[1],resInclude[2])
            }
            if(includedFile) {
                includedFiles.push(includedFile)
                let subIncludes = listIncludedPartialsAndPages(contentFiles, pages, includedFile, componentAttributes, logger, inheritedAttributes)
                if (subIncludes) {
                    includedFiles = includedFiles.concat(subIncludes)
                }
            }
        }
        else if (resAttribute) {
            if(resAttribute[1] || resAttribute[3]) {
                delete inheritedAttributes[resAttribute[2]]
            }
            else {inheritedAttributes[resAttribute[2]] = resAttribute[4]}
        }
    }
    return includedFiles
}

function determineTargetPartialFromIncludeMacro(contentFiles, thisPage, pathPrefix, includePath) {
    const prefixParts = pathPrefix.split(":")
    return contentFiles.find(file => file.src.family === "partial" && file.src.module === prefixParts.length > 1 ? prefixParts.at(-2) : thisPage.src.module &&
    file.src.relative === includePath)
}

function listPagesWithDraftFlag(page) {
    const pageContent = page.contents.toString().split("\n")
    const reDraft = /ifdef::draft\[\]/
    for (let line of pageContent){
        if (reDraft.exec(line)) {return true}
    }
    return false
}

module.exports = {
    listAllUnusedPartialsAndDraftPages
}