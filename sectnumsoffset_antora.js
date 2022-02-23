module.exports = function (registry) {
    registry.treeProcessor(function () {
      var self = this
      self.process(function (doc) {
        // Check if sectnums and sectnumoffset is found. Only act if true
        if (doc.hasAttribute("sectnums") && (doc.hasAttribute("sectnumoffset") || doc.hasAttribute("titleoffset") || doc.hasAttribute("imageoffset") || doc.hasAttribute("tableoffset"))) {
            let offsetValue = Math.abs(doc.getAttribute("sectnumoffset",0))
            let pageTitle = doc.getTitle()
            let titleOffset = doc.getAttribute("titleoffset",null)
            let titlePrefix = doc.getAttribute("titleprefix","")
            let imageOffset = Math.abs(doc.getAttribute("imageoffset",0))
            let tableOffset = Math.abs(doc.getAttribute("tableoffset",0))

            if (titlePrefix) {
                pageTitle = doc.setTitle(titlePrefix + " " + pageTitle)
            }
            else if (titleOffset) {
                pageTitle = doc.setTitle(titleOffset+" "+pageTitle)
            }
            titleOffset = titleOffset.endsWith(".") ? titleOffset : titleOffset+"."
            doc.getSections().filter(s => s.getLevel() === 1).forEach(sect => {
                offsetValue = 1 + offsetValue
                sect.setNumeral(titleOffset+offsetValue)
            })
            // console.log(doc.getBlocks().filter(x=>x.getNodeName() === "image"))
            doc.getBlocks().filter(x=>x.getNodeName() === "image").forEach(image => {
                imageOffset = 1 + imageOffset
                const oldNumeral = image.getNumeral()
                image.setNumeral(imageOffset)
                if(image.getCaption()) {
                    image.setCaption(image.getCaption().replace(oldNumeral,imageOffset))
                }
            })
            doc.getBlocks().filter(x=>x.getNodeName() === "table" && x.getStyle() === "table").forEach(table => {
                tableOffset = 1+ tableOffset
                const oldNumeral = table.getNumeral()
                table.setNumeral(tableOffset)
                if (table.getCaption())
                {
                    table.setCaption("Table "+tableOffset+". ")
                }
            })
        }
      })
    })
  }