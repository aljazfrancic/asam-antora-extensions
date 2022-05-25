'use strict'

const ContentAnalyzer = require('../../core/content_analyzer.js')

function find_orphan_pages(contentCatalog, addToNavigation) {
contentCatalog.getComponents().forEach(({ versions }) => {
    versions.forEach(({ name: component, version, navigation: nav, url: defaultUrl }) => {
      const navEntriesByUrl = ContentAnalyzer.getNavEntriesByUrl(nav)
      const unlistedPages = contentCatalog
        .findBy({ component, version, family: 'page' })
        .filter((page) => page.out)
        .reduce((collector, page) => {
          if ((page.pub.url in navEntriesByUrl) || page.pub.url === defaultUrl) return collector
          //-------------
          // Create logger entry for any page that was has been found but is not entered in at least one navigation file
          //-------------
          logger.warn({ file: page.src, source: page.src.origin }, 'detected unlisted page')
          return collector.concat(page)
        }, [])
      //-------------
      // Optional: Add found unlisted files to a new navigation entry
      // Optional settings: add_to_navigation: true; unlisted_pages_heading: "Unlisted pages"
      //-------------
      if (unlistedPages.length && addToNavigation) {
        nav.push({
          content: parsedConfig.unlistedPagesHeading,
          items: unlistedPages.map((page) => {
            return { content: page.asciidoc.navtitle, url: page.pub.url, urlType: 'internal' }
          }),
          root: true,
        })
      }
    })
  })
}

module.exports = {
    find_orphan_pages
}