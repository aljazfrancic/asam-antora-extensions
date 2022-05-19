'use strict'
var spawnSync = require("child_process").spawnSync;
var exec = require("child_process").execSync, child;
const fs = require("fs");
const path = require("path")

// const File = require('../file')
const File = require('../asam-antora-extensions/file')

module.exports.register = function ({config}) {
    let {folderOffset,workdir} = config
    this
      .on('contentAggregated', ({contentAggregate}) => {
        // console.log(fs.readdirSync(process.cwd()+"/"+workdir))

        // ----------------
        // Define variables
        // ----------------
        workdir = workdir ? workdir + "/" : ""
        const converterDirectory = './'+workdir+'doxygen_converter'
        const startPath = process.cwd()
        const temporaryDirectory = "temp"
        const targetOutputDirectory = "gen"
        const convertedOutputDirectory = "converted_interface"
        const navOutputDirectory = "navigation_file"
        // const imgDirectory = "attachments"

        // ----------------
        // Execute on every version and component
        // ----------------
        contentAggregate.forEach(v => {
            console.log(v.version)
            let interfaceVersion = v.asciidoc.attributes.doxygen_interface_version ? v.asciidoc.attributes.doxygen_interface_version : null
            let documentDate = v.asciidoc.attributes.doxygen_document_date ? v.asciidoc.attributes.doxygen_document_date : null
            let doxygenModulePath = v.asciidoc.attributes.doxygen_module ? "modules/"+v.asciidoc.attributes.doxygen_module : "modules/ROOT"
            let pathInModule = v.asciidoc.attributes.doxygen_module_path ? "/"+v.asciidoc.attributes.doxygen_module_path : ""
            let imgDirectory = v.asciidoc.attributes.doxygen_module_path ? "attachments" + pathInModule : "attachments"
            let imgDirOffset = v.asciidoc.attributes.doxygen_module_path ? "../".repeat(pathInModule.split("/").length) + "_" : "_"
            const files = {
                fileList: v.files
            }
            // const attFiles = files.fileList.filter(f => f.src.path.includes("_attachments") && f.src.extname === ".png" )
            // console.log("TEST: ",attFiles[0].src)
            const defaultOrigin = v.files[0].src.origin
            const splitAbsPath = v.files[0].src.abspath ? v.files[0].src.abspath.split("/") : null
            const abspathPrefix = splitAbsPath ? splitAbsPath.slice(0,splitAbsPath.indexOf("modules")).join("/")+"/" : null

            try{
                // ----------------
                // Only execute if the attribute "document_date" has been set in the component descriptor
                // ----------------
                if (documentDate){

                    // ----------------
                    // Enter the target path and execute the doxygen shell script to
                    // a) check out the source repo with the desired version  and the generator files and
                    // b) convert its content using cmake to html (doxygen), then
                    // c) move the generated content to the target folder
                    // ----------------
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
                    newFiles = newFiles.concat(addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix))
                    currentPath = "./"+targetOutputDirectory+"/"+convertedOutputDirectory+"/_attachments";
                    virtualTargetPath = doxygenModulePath+"/"+imgDirectory;
                    newFiles = newFiles.concat(addAllFilesInFolderAsVirtualFiles(currentPath, virtualTargetPath, defaultOrigin, abspathPrefix))
                    currentPath = navOutputDirectory;
                    let navFiles = v.files.filter(x => x.src.stem === "nav" && x.src.path.includes(doxygenModulePath+"/"))
                    // TODO: Add function that creates the nav.adoc file in case it does not exist!

                    navFiles[0].contents = fs.readFileSync(currentPath+"/nav.adoc")
                    v.files = v.files.concat(newFiles).sort((a,b) =>
                    {
                        return a.path - b.path
                    })

                    // ----------------
                    // Clean up temporary files and folders after this is done, then return back to the previous directory for the next version/component.
                    // ----------------
                    // fs.rename(temporaryDirectory, v.version+"__"+temporaryDirectory, function(err) {
                    //     if (err) {
                    //       console.log(err)
                    //     } else {
                    //       console.log("Successfully renamed the directory.")
                    //     }
                    //   })
                    // fs.rename(targetOutputDirectory, v.version+"__"+targetOutputDirectory, function(err) {
                    //     if (err) {
                    //       console.log(err)
                    //     } else {
                    //       console.log("Successfully renamed the directory.")
                    //     }
                    //   })
                    //   fs.rename(navOutputDirectory, v.version+"__"+navOutputDirectory, function(err) {
                    //     if (err) {
                    //       console.log(err)
                    //     } else {
                    //       console.log("Successfully renamed the directory.")
                    //     }
                    //   })

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
      })
  }

  function deleteTemporaryFile( path ) {
    fs.unlink(path, function (err) {
        if (err) {
          console.error(err);
        } else {
          console.log("File removed:", path);
        }
      });
  }

  function addAllFilesInFolderAsVirtualFiles( inputPath, targetPath, defaultOrigin, abspathPrefix ) {
    let newFiles = []
    const filesAndDirectories = fs.readdirSync(inputPath, { withFileTypes: true });
    const files =  filesAndDirectories
    .filter(dirent => dirent.isFile())
    .map(dirent => dirent.name);
    for(let f of files) {
        try {
            const contents = fs.readFileSync(inputPath+"/"+f)
            let src = {
                    "path": targetPath+"/"+f,
                    "basename": f,
                    "stem": path.basename(f,path.extname(f)),
                    "extname": path.extname(f),
                    "origin": {
                        "type": "doxygen"
                }
            }
            if (src.extname === "undefined" || !src.extname) {
                console.log(f, f.split(".")[0], f.split(".")[1])
            }
            let file = new File({
                path: src.path,
                contents: contents,
                src: src
            })
            file.src.origin = defaultOrigin
            if (abspathPrefix) {
                file.src.abspath = abspathPrefix+file.src.path
            }
            newFiles.push(file)

        } catch(e){
            console.log(e)
        }

    }
    return(newFiles)
  }