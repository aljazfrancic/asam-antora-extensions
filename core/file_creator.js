'use strict'

const File = require('./file.js')

function createNewVirtualFile( contentCatalog, filename, path, module, component, version, content, base, type="page" ) {
    if (typeof content === 'string' || content instanceof String){
        content = Buffer.from(content)
    }
    let typeFolder;
    let mediaType
    switch(type){
        case "page":
            typeFolder = "/pages/"
            mediaType = "text/html"
            break;
        case "partial":
            typeFolder = "/partials/"
            mediaType = "text/html"
            break;
    }
    if(!path.endsWith("/") && path !== ""){
        path = path+"/"
    }
    let newFile = new File({ base: base, path: "modules/"+module+typeFolder+path+filename, contents: content, mediaType: mediaType})
    let moduleRootPath = path=== "/" ? ".." : path.replace(/([^//])*/,"..")+".."
    newFile.src = {}
    Object.assign(newFile.src, { path: newFile.path, basename: newFile.basename, stem: newFile.stem, extname: newFile.extname, family: type, relative: path+filename, mediaType: 'text/asciidoc', component: component, version: version, module: module, moduleRootPath: moduleRootPath })
    contentCatalog.addFile(newFile)
    return (newFile)
}


function createVirtualFilesForFolders( contentCatalog, component, version, module, pages, modulePath ) {
    var folderFiles = new Object()
    const base = pages[0].base
    pages.forEach((page) => {
        let relativePath = ""
        if (page.src.basename !== page.src.relative) {
            relativePath = page.src.relative.replace("/"+page.src.basename,"")
            while (true) {
                if (!relativePath ) {
                    return false
                }
                if (Object.keys(folderFiles).indexOf(relativePath) < 0) {
                    let folderName = relativePath
                    if (folderName.startsWith("_") || folderName.startsWith(".")) {
                        return false;
                    }
                    const start = folderName.lastIndexOf("/")
                    if (start > 0) {
                        folderName = folderName.slice(start+1)
                    }
                    let parentPath = relativePath.slice(0,relativePath.lastIndexOf(folderName))
                    parentPath = parentPath.endsWith("/") ? parentPath.slice(0,-1) : parentPath
                    const folderFileName = folderName+".adoc"

                    if(pages.findIndex((element,index) => {
                        if(element.src.relative === parentPath+"/"+folderFileName || element.src.relative === folderFileName) {
                            return true
                        }
                    }) === -1) {
                        let content = new Array(
                            "= "+capitalizeFirstLetter(folderName).replace("_"," "),
                            ":description: Auto-generated folder page",
                            ":keywords: generated, autonav",
                            "",
                            `pages::[path=${folderName}]`
                        )
                        let newFile = createNewVirtualFile( contentCatalog, folderFileName, parentPath, module, component, version, content.join("\n"), base )
                        folderFiles[relativePath]=newFile
                    }
                    const relativePathNew = relativePath.replace("/"+folderName,"")
                    if (relativePathNew === relativePath) {
                        return false
                    }
                    else {
                        relativePath = relativePathNew
                    }
                }
                else {
                    return false
                }
            }
        }
    })
    return (Array.from(Object.values(folderFiles)))
}



function addAllFilesInFolderAsVirtualFiles( inputPath, targetPath, defaultOrigin, abspathPrefix, recursive=false ) {
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
    if(recursive) {
        const folders = filesAndDirectories
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
        for (let folder of folders){
            const extraFiles = addAllFilesInFolderAsVirtualFiles(inputPath+"/"+folder, targetPath+"/"+folder, defaultOrigin, abspathPrefix, recursive )
            newFiles = newFiles.concat(extraFiles)
        }
    }
    return(newFiles)
  }



module.exports = {
    createNewVirtualFile,
    createVirtualFilesForFolders,
    addAllFilesInFolderAsVirtualFiles
}