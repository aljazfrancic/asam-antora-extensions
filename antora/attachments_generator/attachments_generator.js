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
const AdmZip = require("adm-zip");
const path = require('path');
const File = require('../../core/file.js');

/**
 * Generates attachments for the download dropdown based on an asciidoc attribute set on the page or the component.
 * @param {Object} contentAggregate - The contentAggregate variable from Antora.
 */
function generateAttachments(contentAggregate) {
    console.log("Checking for generated attachments...")
    contentAggregate.forEach(v => {
        if (!(v.asciidoc && v.asciidoc.attributes)){
            return
        }
        if(v.asciidoc.attributes['generate-attachments'] && v.asciidoc.attributes['generate-attachments'].length > 0) {
            console.log(`Generating attachments for ${v.name}: ${v.version}`)
            const inputAttachmentArray = v.asciidoc.attributes['generate-attachments']
            inputAttachmentArray.forEach(entry => {
                const zip = new AdmZip()
                const clean = entry[2] && entry[2] === "clean" ? true : false
                const inputPath = ContentAnalyzer.getSrcPathFromFileId(entry[0])
                const name = ContentAnalyzer.replaceAllAttributesInLine(v.asciidoc.attributes, {}, entry[1]).replaceAll("{page-component-version}",v.version.replace(" ","_"))
                const files = v.files.filter(x => x.src.path && x.src.path.includes(inputPath.relative))
                if (files) {
                    inputPath.module = files[0].src.path.match(/modules\/([^\/]+)\//)[1]
                    inputPath.component = v.name
                    inputPath.version = v.version
                    inputPath.family = inputPath.type+"s"
                }
                v.asciidoc.attributes['page-download-links'].find(x => x[0].includes(entry[1]))[0] = `${name}`
                files.forEach(file => {
                    const relativePath = path.relative(`modules/${inputPath.module}/${inputPath.family}/${inputPath.relative}`,file.src.path)
                    if (relativePath) { zip.addFile(relativePath,file.contents,"") }
                    else { zip.addFile(file.src.basename,file.contents,"") }
                    if (clean) {
                        v.files = v.files.filter(x => x !== file)
                    }
                })
                const zipBuffer = zip.toBuffer()
                const typeFolder = "attachments";
                const zipFile = new File({ path: `modules/${inputPath.module}/${typeFolder}/${name}`, contents: zipBuffer, src: {}})
                Object.assign(zipFile.src, { path: zipFile.path, basename: zipFile.basename, stem: zipFile.stem, extname: zipFile.extname, origin: {url: 'generated', startPath: 'generated', refname: 'generated', reftype: 'generated', refhash: 'generated'} })
                v.files.push(zipFile)
            })
        }
    })
}

module.exports = {
    generateAttachments
}