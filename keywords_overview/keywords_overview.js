'use strict'

function createKeywordsOverviewPage( keywordOverviewPageRequested, contentCatalog, pages, keywordPageMap, targetPath, targetName, targetModule, component, version ) {
    if (!keywordOverviewPageRequested) {
        return pages
    }
    const standardContent = new Array(
        "= Used keywords In ASAM Project Guide",
        ":description: Automatically generated overview over all keywords used throughout this Project Guide.",
        ":keywords: generated,keywords,keyword-overview-page,link-concept,structure",
        ":page-partial:",
        "",
        "This page is an automatically generated list of all keywords used throughout this Project Guide.",
        "Every keyword has its own subsection and contains a link to each page as well as the original filename, path and module in the repository.",
        "",
        "== List of keywords",
        ""
    )
    let myBase;
    for (let entry of [...keywordPageMap.entries()].sort()) {
        let val = entry[1].entries().next().value[0]
        myBase = val.base
        if (targetPath !== "" && !targetPath.endsWith("/")){
            targetPath = targetPath+"/"
        }
        if (entry[1].size === 1 && val.src.relative === targetPath+targetName && val.src.module === targetModule) {
            continue;
        }
        standardContent.push("=== "+entry[0])
        for (let value of entry[1]) {
            if (value.src.basename === targetName && value.src.relative === targetPath && value.src.module === targetModule) {
                continue;
            }
            standardContent.push("* xref:"+value.src.module+":"+value.src.relative+"[]")
        }
        standardContent.push("")
    }
    const relative = targetPath === "" ? targetName : targetPath+"/"+targetName
    let existingFile = contentCatalog.findBy({component: component, version: version, module: targetModule, relative: relative})
    if (existingFile.length) {
        existingFile[0].contents = Buffer.from(standardContent.join("\n"))
        return pages
    }
    else {
        let newFile = createNewVirtualFile(contentCatalog, targetName, targetPath, targetModule, component, version, standardContent.join("\n"),myBase)
        return [...pages,newFile]
    }
}

module.exports = {
    createKeywordsOverviewPage
}