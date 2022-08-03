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
const FileCreator = require('../../core/file_creator.js')

/**
 * Parses all files and replaces the nav.adoc file entry in case the antora_mapping attribute is set.
 * Replaces everything between ":antora_mapping: <value>" and one of the following:
 * - ":!antora_mapping:"
 * - ":antora_mapping!:"
 * - EOF
 * If :antora_mapping: is set to 'title', the page title will be used as additional hierarchy entry.
 * @param {Array <Object>} pages - Array of all pages in a component-version-combination.
 * @param {Array <Object>} navFiles - Array of all navigation files in a component-version-combination.
 */
function createAntoraNavigationFromIndex( pages, navFiles ) {
    for (let page of pages) {
        const reAntoraMapping = /:(!)?antora_mapping(!)?:(.*)/;
        const reInclude = /include::([^\[]+)\[([^\]]*)\]/;
        const reSection = /^(=)+ (.*)/;
        const reExceptions = /ifndef::use-antora-rules\[\]|endif::\[\]/
        const reLeveloffset = /leveloffset=\+([^\],;]*)/
        let pageContent = page.contents.toString().split("\n")
        let considerForMapping = false
        let newNavContent = []
        let parentEntry = false
        let offsetEntry = 0
        for (let line of pageContent) {
            const result = reAntoraMapping.exec(line)
            const resExceptions = reExceptions.exec(line)
            if (result && (result[1] || result[2])) {considerForMapping = false}
            else if (result) {considerForMapping = true; parentEntry = result[3].trim() === "title" ? true : false}
            else if (resExceptions) {continue}
            else if (considerForMapping) {
                if (parentEntry) {
                    const xrefLink = `${page.src.component}:${page.src.module}:${page.src.relative}`
                    newNavContent.push("*" + " xref:"+xrefLink+"[]")
                    newNavContent.push(":start-level: 2")
                    offsetEntry = 1
                    parentEntry = false
                }
                const resInclude = reInclude.exec(line)
                const resSection = reSection.exec(line)
                if (resInclude) {
                    const xrefLink = resInclude[1]
                    const resLeveloffset = reLeveloffset.exec(line)
                    const level = resLeveloffset ? parseInt(resLeveloffset[1]) + offsetEntry : 1 + offsetEntry
                    newNavContent.push("*".repeat(level) + " xref:"+xrefLink+"[]")
                }
                else if (resSection) {
                    const level = (line.match(/=/g)||[]).length -1 + offsetEntry
                    const sectionText = line.substring(level+1).trim()
                    newNavContent.push("*".repeat(level) + " " +sectionText)
                }
                else if (line.trim().length>0) {newNavContent.push(line)}
            }
        }
        if (newNavContent.length>0) {
            if (navFiles && navFiles.length > 0) {
                let nav = navFiles.filter(x => {x.src.module === page.src.component})
                if (nav && nav.length > 0) {nav[0].contents = Buffer.from(newNavContent.join("\n"))}
                else {navFiles[0].contents = Buffer.from(newNavContent.join("\n"))}
            }
            else {
                console.warn("Cannot convert mapping to navigation. Missing nav file for",page.src.path)
            }
        }
    }
}

module.exports = {
    createAntoraNavigationFromIndex
}
