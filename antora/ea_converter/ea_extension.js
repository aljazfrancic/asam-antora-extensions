'use strict'
var spawnSync = require("child_process").spawnSync;
const fs = require("fs");

const FileCreator = require('../../core/file_creator.js')

function convertEnterpriseArchitect ( workdir, contentAggregate ) {

        // ----------------
        // Define variables
        // ----------------
        workdir = workdir ? workdir + "/" : ""
        const converterDirectory = __dirname
        const startPath = process.cwd()
        const targetOutputDirectory = "gen"
        const convertedOutputDirectory = "converted_interface"
        const navOutputDirectory = "navigation_file"
        // ----------------
        // Execute on every version and component
        // ----------------
        contentAggregate.forEach(v => {
            if(v.asciidoc.attributes.ea_module) {
                console.log("EA conversion for",v.version)
                let eaModulePath = v.asciidoc.attributes.ea_module ? "modules/"+v.asciidoc.attributes.ea_module : "modules/ROOT"
                let pathInModule = v.asciidoc.attributes.ea_module_path ? "/"+v.asciidoc.attributes.ea_module_path : ""
                let imgDirOffset = v.asciidoc.attributes.ea_module_path ? "../".repeat(pathInModule.split("/").length) + "_" : "_"
                const defaultOrigin = v.files[0].src.origin
                const splitAbsPath = v.files[0].src.abspath ? v.files[0].src.abspath.split("/") : null
                const abspathPrefix = splitAbsPath ? splitAbsPath.slice(0,splitAbsPath.indexOf("modules")).join("/")+"/" : null
                const eaInputPath = v.asciidoc.attributes.ea_input_path ? abspathPrefix+eaModulePath+'/pages/'+v.asciidoc.attributes.ea_input_path : abspathPrefix+eaModulePath+'/_attachments'
                const imgDirectory = eaInputPath
                const navigationTitle = v.asciidoc.attributes.ea_navigation_title ? v.asciidoc.attributes.ea_navigation_title : "Model definition"

                try{
                    process.chdir(converterDirectory)

                    // ----------------
                    // Run the python script on the generated files to
                    // a) convert the html content to asciidoc and then
                    // b) return the updated content as virtual files
                    // ----------------
                    const python = spawnSync('python3', ['ea_converter.py', targetOutputDirectory, convertedOutputDirectory, navOutputDirectory, imgDirOffset+imgDirectory, pathInModule, eaInputPath, navigationTitle])
                    console.log(python.stdout.toString())
                    console.log(python.stderr.toString())
                    console.log("Enterprise Architect conversion done")

                    // ----------------
                    // Finally, parse the created files and add them to Antora for this version
                    // ----------------
                    let newFiles = []
                    let currentPath = "./"+targetOutputDirectory+"/"+convertedOutputDirectory;
                    let virtualTargetPath = eaModulePath+"/pages"+pathInModule;
                    newFiles = newFiles.concat(FileCreator.addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix, true))
                    currentPath = "./"+targetOutputDirectory+"/"+navOutputDirectory;
                    let navFiles = v.files.filter(x => x.src.stem === "nav" && x.src.path.includes(eaModulePath+"/"))
                    // TODO: Add function that creates the nav.adoc file in case it does not exist!

                    navFiles[0].contents = fs.readFileSync(currentPath+"/nav.adoc")
                    v.files = v.files.concat(newFiles).sort((a,b) =>
                    {
                        return a.path - b.path
                    })

                    // ----------------
                    // Clean up temporary files and folders after this is done, then return back to the previous directory for the next version/component.
                    // ----------------
                    fs.rmSync(targetOutputDirectory, { recursive: true });
                    console.log("Temporary output files deleted")
                    process.chdir(startPath)
                } catch(e){
                    console.log(e)
                }
            }
        })
  }



  module.exports = {
      convertEnterpriseArchitect
  }