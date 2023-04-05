'use strict'
//-------------
//-------------
// Module for the custom ASAM bibtex extension.
// This module provides two central functions, 'getBibliographyFiles', that retrieves and parses the specified bibliography files, and 'applyBibliography', that applies the citations and the bibliography macro.
// This extension currently only supports IEEE style citation for books and proceedings.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
const ContentAnalyzer = require('../../core/content_analyzer.js')
const CSL = require('citeproc')
require("@citation-js/plugin-bibtex")
const Cite = require("@citation-js/core");
const fs = require('fs')
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
const jsdom = require('jsdom')

/**
 * Replaces all cite:[] macros with links and the bibliography::[] with a sorted list of referenced bibliography entries.
 * @param {Object} mapInput - A set of configuration parameters. Must contain 'componentAttributes', 'pages', 'version', 'navFiles'.
 * @param {Array <Object>} bibliographyFiles - An array of all bibliography (.bib) files, one per component & version.
 * @param {String} styleID - The name of the style (csl) that is to be applied for the bibliography.
 */
function applyBibliography(mapInput, bibliographyFiles, styleID="iso690-numeric-brackets-cs", language="en") {
    if (!mapInput.componentAttributes['asamBibliography']) {return}
    // Set up regular expressions
    const reException = /ifndef::use-antora-rules\[\](.*\r\n*)*?endif::\[\]/gm
    const reBibliography = /^\s*bibliography::\[\]/gm
    // styleID = "ieee-with-url" // For Testing ONLY: TODO

    // Find relevant bibliography file and bibliography page
    const antoraBibliography = mapInput.pages.find(x => x.contents.toString().replaceAll(reException,``).match(reBibliography))
    const bibFile = bibliographyFiles.find(x => x.component === mapInput.component && x.version === mapInput.version)
    if (!bibFile) {throw "No .bib file found!"}
    if (!antoraBibliography) {throw "Found .bib file but no page with 'bibliography::[]'!"}

    // Set up bibliography data
    const bibEntries = new Cite.Cite(bibFile.file.contents.toString())
    const citeprocSys = {
        retrieveLocale: function (lang){
            try {
                return fs.readFileSync(`${__dirname}/lib/locales/locales-${lang}.xml`, 'utf8')
            }
            catch {
                try {
                    console.log("Submodule for csl locale not found. Falling back to remote.")
                    let xhr = new XMLHttpRequest();
                    xhr.open('GET', 'https://raw.githubusercontent.com/Juris-M/citeproc-js-docs/master/locales-' + lang + '.xml', false);
                    xhr.send(null);
                    return xhr.responseText;
                }
                catch {
                    return false
                }
            }
        },
        retrieveItem: function(id){
          return bibEntries.data.find((x) => {
            return x.id === id
          })
        }
      }
    let style
    try {
        style = fs.readFileSync(`${__dirname}/lib/styles/${styleID}.csl`, 'utf8')
    }
    catch {
        console.log("Submodule for csl styles not found. Falling back to remote.")
        let xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://raw.githubusercontent.com/citation-style-language/styles/master/' + styleID + '.csl', false);
        xhr.send(null);
        style = xhr.responseText;
    }
    let citeproc = new CSL.Engine(citeprocSys, style, language, true)

    // Sort pages by entry in navigation
    const mergedNavContent = ContentAnalyzer.createdSortedNavFileContent(mapInput)
    mapInput.pages.sort((a,b) => {
        const indexA = a.src.relative === "index.adoc" ? 0 : mergedNavContent.indexOf(a.src.relative) === -1 ? -1 : mergedNavContent.indexOf(a.src.relative) + 1
        const indexB = b.src.relative === "index.adoc" ? 0 : mergedNavContent.indexOf(b.src.relative) === -1 ? -1 : mergedNavContent.indexOf(b.src.relative) + 1

        if (indexA === indexB) {return 0}
        if (indexA === -1) {return 1}
        if (indexB === -1) {return -1}
        return indexA - indexB
    })

    // Identify the references actually used throughout this document and replace them with links
    const pathToId = `${antoraBibliography.src.module}:${antoraBibliography.src.relative}`
    let itemIDs = []
    mapInput.pages.forEach(page => {
        itemIDs = replaceCitationsWithLinks(page, reException, mapInput, bibEntries, pathToId, itemIDs, citeprocSys)
    })

    // Create bibliography page
    createBibliography(antoraBibliography, bibEntries, itemIDs, citeproc)

    // /**
    //  * Replaces all citations within a file by the respective link to the bibliography page. Also processes included pages and partials.
    //  * @param {Object} f - The file where the citations are to be replaced.
    //  * @param {String} reException - The regular expression for content that is to be excepted from replacement (e.g. in comments).
    //  * @param {Object} mapInput - A set of configuration parameters. Must contain 'catalog'.
    //  * @param {Object} bibEntries - An object containing all entries of the bibliography (using the bibtex library).
    //  * @param {Integer} currentIndex - The current index for new bibtex references.
    //  * @param {String} pathToId - The path to the identified bibliography page.
    //  * @returns {Integer} - The current index after processing the file.
    //  */
    function replaceCitationsWithLinks(page, reException, mapInput, bibEntries, pathToId, itemIDs, citeprocSys, pageAttributes = {}) {
        const reReference = /(?<!\/{2} .*)cite:\[([^\]]+)\]/g
        let fileContentReplaced = page.contents.toString().replaceAll(reException,``).split("\n")
        let fileContent = page.contents.toString()
        for (let line of fileContentReplaced) {
            // Check for included file and apply function to that if found. Update the currentIndex accordingly
            ContentAnalyzer.updatePageAttributes(pageAttributes,line)
            const lineWithoutAttributes = ContentAnalyzer.replaceAllAttributesInLine(mapInput.componentAttributes, pageAttributes, line)
            const includedFile = ContentAnalyzer.checkForIncludedFileFromLine(mapInput.catalog,page,lineWithoutAttributes)
            if (includedFile) {
                itemIDs = replaceCitationsWithLinks(includedFile, reException, mapInput, bibEntries, pathToId, itemIDs, citeprocSys, pageAttributes)
            }
            let result = line;
            const matches = [...line.matchAll(reReference)]
            for (let m of matches){
                // If a match was found and an entry in the bib file exists                
                if (m[1] && citeprocSys.retrieveItem(m[1])) {
                    // If it has no number yet, generate one
                    if (!itemIDs.includes(m[1])) {
                        itemIDs.push(m[1])
                    }
                    // TODO: Replace this with a style-specific citation
                    const subst = `[xref:${pathToId}#bib-${m[1].toLowerCase()}[${1 + itemIDs.indexOf(m[1])}]]`;
                    result = result.replace(m[0], subst);
                }
                // If there is a match but no entry in the bib file
                else if (m[1]) {
                    console.log("Could not find bibliography entry for",m[1])
                }
            }
            fileContent = fileContent.replace(line,result)
            fileContentReplaced[fileContentReplaced.indexOf(line)] = result
        }

        // f.contents = Buffer.from(fileContentReplaced.join("\n"))    
        page.contents = Buffer.from(fileContent)
        return itemIDs
    }

    /**
     * Creates the bibliography page from the indexed bibEntries.
     * @param {Object} antoraBibliography - The (first) file with the bibliography::[] macro in this component-version.
     * @param {Object} bibEntries - An object containing all entries of the bibliography (using the bibtex library), annotated with indices. 
     * @param {Array <String>} itemIDs - An ordered array containing the items of the bibliography that were used throughout the documentation.
     * @param {Object} citeproc - The citeproc object for creating the bibliography based on the defined style.
     */
    function createBibliography(antoraBibliography, bibEntries, itemIDs, citeproc) {
        // Sort entries by index
        citeproc.updateItems(itemIDs)
        // citeproc.setOutputFormat("rtf")
        // throw "HERE"
        const result = citeproc.makeBibliography()
        let dom = new jsdom.JSDOM(`<!DOCTYPE html>${result[1].join("").replaceAll("\n","").replaceAll(/> +</g,"><")}`)
        const entries = dom.window.document.getElementsByClassName("csl-entry")
        let content = antoraBibliography.contents.toString()
        // const replacementContent = `\n\n++++\n${result[0].bibstart}${result[1].join("\n\n")}\n${result[0].bibend}\n++++\n`
        let replacementContent = []
        result[0].entry_ids.forEach((id, index) => {
            const identifier = entries[index].getElementsByClassName("csl-left-margin")[0]
            const text = entries[index].getElementsByClassName("csl-right-inline")[0]
            console.log(identifier.innerHTML, text.innerHTML)
            replacementContent.push(`[[bib-${id[0]}]]${identifier.innerHTML}pass:m,p[${text.innerHTML.replaceAll("]","\\]")}]`)
            // for (const e of entries) {
            //     const identifier = e.getElementsByClassName("csl-left-margin")[0]
            //     const text = e.getElementsByClassName("csl-right-inline")[0]
            //     console.log(identifier.innerHTML, text.innerHTML)
            //     replacementContent.push(`[[bib-${id[0]}]]${result[1][index]}`.replaceAll("\\tab","").replaceAll(/{\\i{}([^}].+[^{])}/g, `__$1__`).replaceAll(/{\\b{}([^}].+[^{])}/g, `*$1*`).replaceAll(/\\super (.+)\\nosupersub{}/g, `^$1^`).replaceAll(/\\sub (.+)\\nosupersub{}/g, `~$1~`).replaceAll("\\uc0\\u8212{}", "--"))
            // }
            // replacementContent.push(`[[bib-${id[0]}]]${result[1][index]}`.replaceAll("\\tab","").replaceAll(/{\\i{}([^}].+[^{])}/g, `__$1__`).replaceAll(/{\\b{}([^}].+[^{])}/g, `*$1*`).replaceAll(/\\super (.+)\\nosupersub{}/g, `^$1^`).replaceAll(/\\sub (.+)\\nosupersub{}/g, `~$1~`).replaceAll("\\uc0\\u8212{}", "--"))
        })
        // console.log(replacementContent.join("\n"))
        replacementContent = replacementContent.join("\n\n")
        // let replacementContent = `\n\n${result[1].join("\n")}\n`
        const newContent = content.replace("bibliography::[]",replacementContent)
        antoraBibliography.contents = Buffer.from(newContent)
    }
}

/**
 * Retrieves and parses the .bib files.
 * @param {Object} contentAggregate - The contentAggregate variable from Antora.
 * @returns {Array} All found bibliography files as objects in an array, each entry consisting of "component", "version", and "file"
 */
function getBibliographyFiles(contentAggregate) {
    let bibliographyFiles = []
    contentAggregate.forEach(v => {
        if(v.asciidoc && v.asciidoc.attributes.asamBibliography) {
            const pathToBibFile = ContentAnalyzer.getSrcPathFromFileId(v.asciidoc.attributes.asamBibliography)
            bibliographyFiles.push({component:v.name, version:v.version, file: v.files.find(x => x.src.path && x.src.path.includes(pathToBibFile.relative))})
        }
    })
    return bibliographyFiles
}

module.exports = {
    applyBibliography,
    getBibliographyFiles
}
