module.exports = function (registry) {
    registry.treeProcessor(function () {
      var self = this
      self.process(function (doc) {
        // Check if sectnums and sectnumoffset is found. Only act if true
        if (doc.hasAttribute("sectnums") && (doc.hasAttribute("sectnumoffset") || doc.hasAttribute("titleoffset"))) {
            let offsetValue = Math.abs(doc.getAttribute("sectnumoffset",0))
            let pageTitle = doc.getTitle()
            let titleOffset = doc.getAttribute("titleoffset",null)
            let titlePrefix = doc.getAttribute("titleprefix","")

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
        }
      })
    })
  }