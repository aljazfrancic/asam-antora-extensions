'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')

function listAllUnusedPartials(contentCatalog, component, version, logger) {
    const componentAttributes = contentCatalog.getComponents().filter(x => x.name === component)[0].asciidoc.attributes
    const pages = contentCatalog.findBy({ component, version, family: 'page' })
    const contentFiles = contentCatalog.findBy({component,version})
    let includedPartials = []
    pages.forEach((page) => {includedPartials = includedPartials.concat(listIncludedPartialsAndPages(contentFiles,pages, page, componentAttributes))})
    includedPartials = [...new Set(includedPartials)];
    const notIncludedPartials = contentCatalog
        .findBy({component, version, family: 'partial'})
        .filter((partial) => (!includedPartials.includes(partial)))
        notIncludedPartials.forEach((file) => {logger.warn({ file:file.src, source: file.src.origin }, "not included partial detected")})
}

function listIncludedPartialsAndPages(contentFiles,pages, page, componentAttributes, inheritedAttributes = {}) {
    const reInclude = /^\s*include::(\S*partial\$|\S*page\$)?([^\[]+\.adoc)\[[^\]]*\]/gm;
    const reIncludeAlt = /^\s*include::([^\[]*{[^}]*})\[[^\]]*\]/gm;
    const reAttribute = /^:(!)?([^:!]+)(!)?:(.*)$/gm
    const reAttributeApplied = /{([^}]+)}/g;
    const pageContent = page.contents.toString().split("\n")
    let includedFiles = []
    for (let line of pageContent) {
        let resInclude = reInclude.exec(line)
        const resIncludeAlt = reIncludeAlt.exec(line)
        const resAttribute = reAttribute.exec(line)
        let includedFile
        if (resIncludeAlt) {
            let newLine = line
            let m;
            while ((m = reAttributeApplied.exec(line)) !== null) {
                if (m.index === reAttributeApplied.lastIndex) {
                    reAttributeApplied.lastIndex++;
                }
                const replacement = componentAttributes[m[1]] ? componentAttributes[m[1]].trim() : (inheritedAttributes[m[1]] ? inheritedAttributes[m[1]].trim() : undefined)
                if (replacement) {
                    newLine = newLine.replace(m[0],replacement)
                }
                else(logger.warn({ file: page.src, source: page.src.origin }, `could not resolve ${line}`))
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
                let subIncludes = listIncludedPartialsAndPages(contentFiles,pages, includedFile, componentAttributes, inheritedAttributes)
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

module.exports = {
    listAllUnusedPartials
}