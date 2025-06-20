'use strict'
var spawnSync = require("child_process").spawnSync;
const fs = require("fs");
const path = require("path");
const lib = require("./lib/doxygen_converter.js")

const FileCreator = require('../../core/file_creator.js')

/**
 * Converts the HTML output generated by Enterprise Architect and located within a specified folder.
 * IMPORTANT: Requires python!
 * The source location has to be provided through each component descriptor file separately with the following Asciidoctor attributes:
 * ea_module: The module where the Enterprise Architect files are located and the converted output will be hosted. Default: "ROOT"
 * ea_module_path: The path within the module where the converted output will be hosted. Default: ""
 * ea_input_path: The path within the module where the source files are located. Default: "/_attachments"
 * At least one of the attributes above has to be defined.
 *
 * @param {String} workdir - The work directory in relation to the Antora pipeline. If not specified, the extension assumes the Antora pipeline runs directly at the root of the site.yml.
 * @param {Object} contentAggregate - The aggregated content provided by Antora.
 */
function convertEnterpriseArchitect ( workdir, contentAggregate ) {

        // ----------------
        // Define variables
        // ----------------
        workdir = workdir ? workdir + "/" : ""
        const converterDirectory = __dirname
        const startPath = process.cwd()
        const targetOutputDirectory = "gen"
        const targetInputDirectory = `./${targetOutputDirectory}/input`
        const convertedOutputDirectory = "converted_interface"
        const navOutputDirectory = "navigation_file"
        // ----------------
        // Execute on every version and component
        // ----------------
        contentAggregate.forEach(v => {
            if(v.asciidoc && (v.asciidoc.attributes.ea_module || v.asciidoc.attributes.ea_module_path || v.asciidoc.attributes.ea_input_path)) {
                console.log("Enterprise Architect documentation conversion for",v.version,"@",v.title)
                let eaModulePath = v.asciidoc.attributes.ea_module ? "modules/"+v.asciidoc.attributes.ea_module : "modules/ROOT"
                let pathInModule = v.asciidoc.attributes.ea_module_path ? "/"+v.asciidoc.attributes.ea_module_path : ""
                let imgDirOffset = v.asciidoc.attributes.ea_module_path ? "../".repeat(pathInModule.split("/").length) + "_" : "_"
                const defaultOrigin = v.files[0].src.origin
                const splitAbsPath = v.files[0].src.abspath ? v.files[0].src.abspath.split("/") : null
                const abspathPrefix = splitAbsPath ? splitAbsPath.slice(0,splitAbsPath.indexOf("modules")).join("/")+"/" : null
                // const eaInputPath = v.asciidoc.attributes.ea_input_path ? abspathPrefix+eaModulePath+"/"+v.asciidoc.attributes.ea_input_path : abspathPrefix+eaModulePath+'/_attachments'
                const eaInputPath = v.asciidoc.attributes.ea_input_path ? eaModulePath+"/"+v.asciidoc.attributes.ea_input_path : eaModulePath+'/attachments'
                const imgDirectory = eaInputPath
                // const imgDirectory = v.asciidoc.attributes.ea_module_path ? "images" + pathInModule : "images"
                const navigationTitle = v.asciidoc.attributes.ea_navigation_title ? v.asciidoc.attributes.ea_navigation_title : "UML model"

                try{
                    // let [virtualFiles,navFile] = lib.htmlToAsciiDoc(eaInputPath, eaModulePath+"/pages"+pathInModule, eaModulePath, imgDirectory, pathInModule)
                    // console.log("read files")
                    // // ----------------
                    // // Finally, parse the created files and add them to Antora for this version
                    // // ----------------
                    // let newFiles = FileCreator.convertArrayToVirtualFiles(virtualFiles,defaultOrigin,abspathPrefix)
                    // let navFiles = v.files.filter(x => x.src.stem.includes("eanav")  && x.src.path.includes(eaModulePath+"/"))
                    // // TODO: Add function that creates the nav.adoc file in case it does not exist!
                    // console.log("got nav files")
                    // navFiles[0].contents = navFile.content
                    // console.log("changed nav file")
                    // v.files = v.files.concat(newFiles).sort((a,b) =>
                    // {
                    //     return a.path - b.path
                    // })
                    // console.log("added virtual files")
                    process.chdir(converterDirectory)
                    // ----------------
                    // Run the python script on the generated files to
                    // a) convert the html content to asciidoc and then
                    // b) return the updated content as virtual files
                    // ----------------
                    const inputFiles = v.files.filter(x => x.src.path.includes(eaInputPath))
                    fs.mkdirSync(targetInputDirectory, {recursive: true})
                    for (let file of inputFiles) {
                        const relPath = path.relative(eaInputPath,file.src.path.replace(file.src.basename,""))
                        try {
                            fs.writeFileSync(`${targetInputDirectory}/${relPath}/${file.src.basename}`, file.contents)
                        }
                        catch (e) {
                            fs.mkdirSync(`${targetInputDirectory}/${relPath}`, {recursive: true})
                            fs.writeFileSync(`${targetInputDirectory}/${relPath}/${file.src.basename}`, file.contents)
                        }
                        v.files = v.files.filter(x => x !== file)
                    }
                    const python = spawnSync('python3', ['ea_converter.py', targetOutputDirectory, convertedOutputDirectory, navOutputDirectory, imgDirOffset+imgDirectory, pathInModule, targetInputDirectory.replace("./",process.cwd()+"/"), navigationTitle])
                    console.log(python.stdout.toString())
                    console.log(python.stderr.toString())
                    console.log("Enterprise Architect documentation conversion done")

                    // ----------------
                    // Finally, parse the created files and add them to Antora for this version
                    // ----------------
                    let newFiles = []
                    let currentPath = "./"+targetOutputDirectory+"/"+convertedOutputDirectory;
                    let virtualTargetPath = eaModulePath+"/pages"+pathInModule;
                    newFiles = newFiles.concat(FileCreator.addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix, true))
                    currentPath = "./"+targetOutputDirectory+"/"+navOutputDirectory;
                    // let navFiles = v.files.filter(x => x.src.stem === "nav" && x.src.path.includes(eaModulePath+"/"))
                    let navFiles = v.files.filter(x => x.src.stem.includes("eanav")  && x.src.path.includes(eaModulePath+"/"))
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