module.exports = function (registry) {
    registry.treeProcessor(function () {
      var self = this
      var verbose = false
      self.process(function (doc) {
        // Check if sectnums and sectnumoffset is found. Only act if true
        // if (doc && doc.getTitle && doc.getTitle() === "Workflows for auditors/regulators") {verbose = true}
        if (verbose){console.log("Title: ",doc.getTitle())}
        if (verbose){console.log("has imageoffset attribute: ",doc.hasAttribute("imageoffset"))}
        if (verbose){console.log("has tableoffset attribute: ",doc.hasAttribute("tableoffset"))}
        if (doc.hasAttribute("sectnums") && (doc.hasAttribute("sectnumoffset") || doc.hasAttribute("titleoffset") || doc.hasAttribute("imageoffset") || doc.hasAttribute("tableoffset"))) {
            let offsetValue = Math.abs(doc.getAttribute("sectnumoffset",0))
            let pageTitle = doc.getTitle()
            let titleOffset = doc.getAttribute("titleoffset",null)
            let titlePrefix = doc.getAttribute("titleprefix","")
            let imageOffset = Math.abs(doc.getAttribute("imageoffset",0))
            let tableOffset = Math.abs(doc.getAttribute("tableoffset",0))

            if (verbose){console.log("titleoffset attribute: ",titleOffset)}
            if (verbose){console.log("titleprefix attribute: ",titlePrefix)}
            if (verbose){console.log("imageOffset attribute: ",imageOffset)}
            if (verbose){console.log("tableoffset attribute: ",tableOffset)}
            if (verbose){console.log("attributes: ", doc.getAttributes())}

            if (titlePrefix) {
                pageTitle = doc.setTitle(titlePrefix + " " + pageTitle)
            }
            else if (titleOffset) {
                pageTitle = doc.setTitle(titleOffset+" "+pageTitle)
            }
            if (titleOffset) {
                titleOffset = titleOffset.endsWith(".") ? titleOffset : titleOffset+"."
                doc.getSections().filter(s => s.getLevel() === 1).forEach(sect => {
                    offsetValue = 1 + offsetValue
                    sect.setNumeral(titleOffset+offsetValue)
                })
            }
            imageOffset = updateImageOffset(doc, imageOffset, verbose)
            tableOffset = updateTableOffset(doc, tableOffset, verbose)
        }
      })
    })

    /**
     * Updates and applies the image offset to each image.
     * @param {*} doc - The document.
     * @param {Number} imageOffset - The image offset value.
     * @param {Boolean} verbose - Optional: If true, will print verbose output in the console.
     * @returns {Number} . The updated imageOffset.
     */
    function updateImageOffset( doc, imageOffset, verbose=false ) {
        let newImageOffset = imageOffset
        for (let block of doc.getBlocks()) {
            if (verbose){console.log("block: ",block.getNodeName())}
            if (block.getNodeName() === "section" || block.getNodeName() === "preamble") {
                newImageOffset = updateImageOffset( block, newImageOffset, verbose)
            }
            else if(block.getNodeName() === "image") {
                newImageOffset = 1 + newImageOffset
                const oldNumeral = block.getNumeral()
                block.setNumeral(newImageOffset)
                if(block.getCaption()) {
                    block.setCaption(block.getCaption().replace(oldNumeral,newImageOffset))
            }
            }
        }
        return (newImageOffset)
    }

    /**
     * Updates and applies the table offset to each table.
     * @param {*} doc - The document.
     * @param {Number} tableOffset - The table offset value.
     * @param {Boolean} verbose - Optional: If true, will print verbose output in the console.
     * @returns {Number} - The updated tableOffset.
     */
    function updateTableOffset( doc, tableOffset, verbose=false ) {
        let newTableOffset = tableOffset
        for (let block of doc.getBlocks()) {
            if (verbose){console.log("block: ",block.getNodeName())}
            if (block.getNodeName() === "section" || block.getNodeName() === "preamble") {
                newTableOffset = updateTableOffset( block, newTableOffset, verbose)
            }
            else if(block.getNodeName() === "table") {
                newTableOffset = 1 + newTableOffset
                block.setNumeral(newTableOffset)
                if(block.getCaption()) {
                    block.setCaption("Table "+newTableOffset+". ")
            }
            }
        }
        return (newTableOffset)
    }
  }