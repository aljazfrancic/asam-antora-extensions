'use strict'
//-------------
//-------------
// Module for creating a navigation file from an Asciidoctor mapping file.
// This module provides a central function, 'createAntoraNavigationFromIndex', that scans each file for the attribute "antora_mapping".
// If the attribute is found, it starts to generate a navigation file content from every line following it until the attribute is unset or set to false.
//
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------


function createAntoraNavigationFromIndex( pages, navFiles ) {
    for (let page of pages) {
        const reAntoraMapping = /:(!)?antora_mapping(!)?:(.*)/;
        const reInclude = /include::([^\[]+)\[([^\]]*)\]/;
        const reSection = /^(=)+ (.*)/;
        const reExceptions = /ifndef::use-antora-rules\[\]|endif::\[\]/
        const reLeveloffset = /leveloffset=\+([^\],;]*)/
        let pageContent = page.contents.toString().split("\n")
        let considerForMapping = False
        let newNavContent = []
        for (let line of pageContent) {
            const result = reAntoraMapping.exec(line)
            const resExceptions = reExceptions.exec(line)
            if (result[1] || result[2]) {considerForMapping = False}
            else if (result) {considerForMapping = True}
            else if (resExceptions) {continue}
            else if (considerForMapping) {
                const resInclude = reInclude.exec(line)
                const resSection = reSection.exec(line)
                if (resInclude) {
                    const xrefLink = resInclude[1]
                    const resLeveloffset = reLeveloffset.exec(line)
                    const level = resLeveloffset ? resLeveloffset[1] + 1 : 1
                    newNavContent.push("*"*level + " xref:"+xrefLink+"[]")
                }
                else if (resSection) {
                    const level = (line.match(/=/g)||[]).length -1
                    const sectionText = line.substring(level+1).trim()
                    newNavContent.push("*"*level + " " +sectionText)
                }
            }
        }
        console.log(newNavContent)
    }
    // const modulePath = page.src.relative

    // const linkText = `xref:${moduleName}:${modulePath}[]`

}

module.exports = {
    createAntoraNavigationFromIndex
}
