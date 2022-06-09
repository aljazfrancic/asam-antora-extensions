'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')

/**
 * Lists all partials that are not included in any hosted Antora page directly or indirectly.
 * Additionally, it lists all pages and partials where the tag "draft" is used to comment out parts.
 * @param {Object} contentCatalog - The aggregated and classified content catalog by Antora.
 * @param {String} component - The current Antora component.
 * @param {String} version - The current Antora component version.
 * @param {*} logger - The logger for creating logs.
 */
function listAllUnusedPartialsAndDraftPages(contentCatalog, component, version, logger) {
    //-------------
    // Create sets of relevant pages and partials for the analysis.
    //-------------
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const pages = contentCatalog.findBy({ component, version, family: 'page' }).filter((page) => page.out)
    const unpublished = contentCatalog.findBy({ component, version, family: 'page' }).filter((page) => !page.out)
    const partials = contentCatalog.findBy({ component, version ,family: 'partial'}).filter((partial) => partial.mediaType === "text/asciidoc")
    const contentFiles = contentCatalog.findBy({component,version})
    let includedPartials = []
    let publishedDraftPages = [],
        unpublishedDraftPages = [],
        draftPartials = []
    //-------------
    // Analyze all pages and partials.
    //-------------
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
    //-------------
    // Print the results to the console via the logger.
    //-------------
    notIncludedPartials.forEach((file) => {logger.warn({ file:file.src, source: file.src.origin }, "not included partial detected")})
    publishedDraftPages.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "published page with draft section detected")})
    unpublishedDraftPages.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "unpublished page with draft section detected")})
    draftPartials.forEach((page) => {logger.warn({ file:page.src, source: page.src.origin }, "partial with draft section detected")})

}

/**
 * Lists all included pages and partials for a page, applying attributes in include lines first.
 * @param {Array} contentFiles - All relevant files.
 * @param {Array} pages - All relevant published pages.
 * @param {Object} page - The current page.
 * @param {Object} componentAttributes - The attributes set in the component or the site.yml.
 * @param {*} logger - The logger for creating logs.
 * @param {Object} inheritedAttributes - The already aggregated attributes from this page. If child page, pass the attributes of the parent page that have been set up to this line.
 * @returns {Array} - The files that are correctly included in this page.
 */
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
    return contentFiles.find(file => file.src.family === "partial" && file.src.module === prefixParts.length > 1 ? prefixParts.at(-2) : thisPage.src.module &&
    file.src.relative === includePath)
}

/**
 * Checks a virtual file on the use of "ifdef::draft[]".
 * @param {Object} page - The current page.
 * @returns {Boolean} - States whether the "draft" flag was found or not.
 */
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