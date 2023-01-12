const ContentAnalyzer = require('../../core/content_analyzer.js')
const {parseBibFile, normalizeFieldValue} = require("bibtex")


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


function applyBibliography(mapInput, bibliographyFiles) {
    if (!mapInput.componentAttributes['asamBibliography']) {return}    
    // Set up regular expressions
    const reException = /ifndef::use-antora-rules\[\](.*\r\n*)*?endif::\[\]/gm
    const reBibliography = /^\s*bibliography::\[\]/gm

    // Find relevant bibliography file and bibliography page
    const antoraBibliography = mapInput.contentCatalog.find(x => x.contents.toString().replaceAll(reException,``).match(reBibliography))
    const bibFile = bibliographyFiles.find(x => x.component === mapInput.component && x.version === mapInput.version)
    // Remove @Comment lines since they do not work with this lib
    let bibFileContents = bibFile.file.contents.toString().replaceAll(/^ *@Comment\{.+$/gm,'')
    let bibEntries = parseBibFile(bibFileContents)

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
    let currentIndex = 1
    mapInput.pages.forEach(f => {
        currentIndex = replaceCitationsWithLinks(f, reException, mapInput, bibEntries, currentIndex, pathToId)
    })

    // Create bibliography page
    createBibliography(antoraBibliography, bibEntries)
}


function replaceCitationsWithLinks(f, reException, mapInput, bibEntries, currentIndex, pathToId) {
    const reReference = /(?<!\/{2} .*)cite:\[([^\]]+)\]/g
    let fileContent = f.contents.toString().replaceAll(reException,``).split("\n")
    for (let line of fileContent) {
        // Check for included file and apply function to that if found. Update the currentIndex accordingly
        const includedFile = ContentAnalyzer.checkForIncludedFileFromLine(mapInput.catalog,f,line)
        if (includedFile) {
            currentIndex = replaceCitationsWithLinks(includedFile, reException, mapInput, bibEntries, currentIndex, pathToId)
        }
        
        let result = line;
        const matches = [...line.matchAll(reReference)]
        for (let m of matches){
            if (m[1] && bibEntries.getEntry(m[1])) {
                if (!bibEntries.entries$[m[1]].index) {
                    bibEntries.entries$[m[1]].index = currentIndex
                    currentIndex++
                }
                const subst = `[xref:${pathToId}#bib-${m[1]}[${bibEntries.entries$[m[1]].index}]]`;
                result = result.replace(m[0], subst);
            }
        }
        fileContent[fileContent.indexOf(line)] = result
    }
    f.contents = Buffer.from(fileContent.join("\n"))    
    return currentIndex
}


function createBibliography(antoraBibliography, bibEntries) {
    // Sort entries by index
    let bibContent = []
    for (let key of Object.keys(bibEntries.entries$)) {
        bibContent.push(convertBibliographyEntry(key, bibEntries.entries$[key]))
    }
    bibContent = bibContent.filter(x => x[0] && x[0] !== "undefined").sort((a,b) => {
        return a[0] - b[0]
    })
    const replacementContent = "\n"+bibContent.map(x => x[1]).join("\n\n")
    let content = antoraBibliography.contents.toString()
    const newContent = content.replace("bibliography::[]",replacementContent)
    // console.log(newContent)
    antoraBibliography.contents = Buffer.from(newContent)
    console.log(antoraBibliography.contents.toString())
}


function convertBibliographyEntry(key, e) {
    let start = `[[bib-${key}]][${e.index}]`;
    let string = []
    let end = []
    switch (e.type) {
        case 'book':
            if (e.getField("TITLE")) {string.push(`__${normalizeFieldValue(e.getField("TITLE"))}__`)};
            if (e.getField("VOLUME")) {string.push(`${normalizeFieldValue(e.getField("VOLUME"))}`)};
            if (e.getField("NUMBER")) {string.push(`${normalizeFieldValue(e.getField("NUMBER"))}`)};
            if (e.getField("PUBLISHER")) {end.push(`${normalizeFieldValue(e.getField("PUBLISHER"))}`)};
            if (e.getField("YEAR")) {end.push(`${normalizeFieldValue(e.getField("YEAR"))}`)};
            if (e.getField("PAGES")) {end.push(`${normalizeFieldValue(e.getField("PAGES"))}`)};
            break;
    }
    string = `${start} ${string.join(", ")}. ${end.join(", ")}.`
    const index  = e.index
    return [index,string]

}

module.exports = {
    applyBibliography,
    getBibliographyFiles
}

// @book{Clinger_1990,
//     autor     = {William D. Clinger},
//     title     = {https://dl.acm.org/doi/abs/10.1145/93548.93557[How to read floating point numbers accurately]},
//     publisher = {ACM SIGPLAN Notices},
//     volume    = {25},
//     number    = {6},
//     year      = {1990},
//     month     = {June},
//     pages     = {92–101}
// }
// --> [14] How to read floating point numbers accurately, vol. 25, no. 6. ACM SIGPLAN Notices, 1990, pp. 92–101.
