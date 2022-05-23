'use strict'

const defaultKeywordsFilename = "0_used-keywords.adoc"

function parse(config) {
    const { numberedTitles, sectionNumberStyle, addToNavigation, unlistedPagesHeading = 'Unlisted Pages' } = config
    const useKeywords = config.keywords ? true : false
    let targetPath = useKeywords && config.keywords.path ? config.keywords.path : "",
        targetModule = useKeywords && config.keywords.module ? config.keywords.module : "ROOT",
        targetName = useKeywords && config.keywords.filename ? config.keywords.filename : defaultKeywordsFilename,
        keywordOverviewPageRequested = useKeywords && config.keywords.createOverview ? true : false

    return { numberedTitles, sectionNumberStyle, addToNavigation, unlistedPagesHeading, useKeywords, targetPath, targetModule, targetName, keywordOverviewPageRequested }

}

module.exports = {
    parse
}