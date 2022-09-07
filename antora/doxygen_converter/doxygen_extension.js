'use strict'
var spawnSync = require("child_process").spawnSync;
var exec = require("child_process").execSync, child;
const fs = require("fs");

// const File = require('../file')
const FileCreator = require('../../core/file_creator.js')

/**
 * Creates Doxygen output and converts it to Antora pages.
 * @param {String} workdir - The work directory in relation to where the Antora pipeline is running. Typically used with specific Docker images.
 * @param {Object} contentAggregate - The aggregated content provided by Antora.
 */
function convertDoxygen(workdir, contentAggregate) {
        // ----------------
        // Define variables
        // ----------------
        workdir = workdir ? workdir + "/" : ""
        const converterDirectory = __dirname
        const startPath = process.cwd()
        const temporaryDirectory = "temp"
        const targetOutputDirectory = "gen"
        const convertedOutputDirectory = "converted_interface"
        const navOutputDirectory = "navigation_file"

        // ----------------
        // Execute on every version and component
        // ----------------
        contentAggregate.filter(v => v.asciidoc && v.asciidoc.attributes).forEach(v => {
            console.log("Doxygen conversion for",v.version)
            let interfaceVersion = v.asciidoc.attributes.doxygen_interface_version ? v.asciidoc.attributes.doxygen_interface_version : null
            let documentDate = v.asciidoc.attributes.doxygen_document_date ? v.asciidoc.attributes.doxygen_document_date : null
            let doxygenModulePath = v.asciidoc.attributes.doxygen_module ? "modules/"+v.asciidoc.attributes.doxygen_module : "modules/ROOT"
            let pathInModule = v.asciidoc.attributes.doxygen_module_path ? "/"+v.asciidoc.attributes.doxygen_module_path : ""
            let imgDirectory = v.asciidoc.attributes.doxygen_module_path ? "attachments" + pathInModule : "attachments"
            let imgDirOffset = v.asciidoc.attributes.doxygen_module_path ? "../".repeat(pathInModule.split("/").length) + "_" : "_"
            const files = {
                fileList: v.files
            }
            const defaultOrigin = v.files[0].src.origin
            const splitAbsPath = v.files[0].src.abspath ? v.files[0].src.abspath.split("/") : null
            const abspathPrefix = splitAbsPath ? splitAbsPath.slice(0,splitAbsPath.indexOf("modules")).join("/")+"/" : null

            try{
                // ----------------
                // Only execute if any of the doxygen attributes has been set in the component descriptor
                // ----------------
                if (documentDate || interfaceVersion || v.asciidoc.attributes.doxygen_module || v.asciidoc.attributes.doxygen_module_path){

                    // ----------------
                    // Enter the target path and execute the doxygen shell script to
                    // a) check out the source repo with the desired version  and the generator files and
                    // b) convert its content using cmake to html (doxygen), then
                    // c) move the generated content to the target folder
                    // ----------------
                    // TODO: Replace this part if the doxygen generator is not triggered by the Antora pipeline anymore.
                    // May be replaced with a function retrieving the content per component-version-combination instead, if not stored in the same repo anyway.
                    process.chdir(converterDirectory)
                    fs.mkdirSync(temporaryDirectory, { recursive: true })
                    let doxygen_generator = exec(`sh local_build_doxygen.sh ${interfaceVersion} ${documentDate} ${temporaryDirectory} ${targetOutputDirectory}`, {stdio: 'inherit'})
                    console.log("Doxygen build done")

                    // ----------------
                    // Run the python script on the generated files to
                    // a) convert the html and js content to asciidoc,
                    // b) delete the obsolete html files and then
                    // c) return the updated content as virtual files
                    // ----------------
                    // TODO: Integrate the python features directly into this function.
                    const python = spawnSync('python3', ['doxygen_converter.py', targetOutputDirectory, convertedOutputDirectory, navOutputDirectory,imgDirOffset+imgDirectory, pathInModule])
                    console.log(python.stdout.toString())
                    console.log(python.stderr.toString())
                    console.log("Doxygen conversion done")

                    // ----------------
                    // Finally, parse the created files and add them to Antora for this version
                    // ----------------
                    let newFiles = []
                    let currentPath = "./"+targetOutputDirectory+"/"+convertedOutputDirectory;
                    let virtualTargetPath = doxygenModulePath+"/pages"+pathInModule;
                    newFiles = newFiles.concat(FileCreator.addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix))
                    currentPath = "./"+targetOutputDirectory+"/"+convertedOutputDirectory+"/_attachments";
                    virtualTargetPath = doxygenModulePath+"/"+imgDirectory;
                    newFiles = newFiles.concat(FileCreator.addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix))
                    currentPath = navOutputDirectory;
                    let navFiles = v.files.filter(x => x.src.stem.includes("doxynav")  && x.src.path.includes(doxygenModulePath+"/"))
                    // TODO: Add function that creates the nav.adoc file in case it does not exist!

                    navFiles[0].contents = fs.readFileSync(currentPath+"/nav.adoc")
                    v.files = v.files.concat(newFiles).sort((a,b) =>
                    {
                        return a.path - b.path
                    })

                    // ----------------
                    // Clean up temporary files and folders after this is done, then return back to the previous directory for the next version/component.
                    // ----------------
                    fs.rmSync(temporaryDirectory, { recursive: true });
                    fs.rmSync(targetOutputDirectory, { recursive: true });
                    fs.rmSync(navOutputDirectory, { recursive: true });
                    console.log("Temporary output files deleted")
                    process.chdir(startPath)
                }
            } catch(e){
                console.log(e)
            }
        })
  }



module.exports = {
    convertDoxygen
}