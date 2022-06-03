'use strict'
//-------------
//-------------
// This is the ASAM Antora extension.
// It is the central file bundling all other Antora extensions in one single extension.
// This file handles configurations and accesses the requested addons accordingly.
// Important: Some extensions may have cross-dependencies and impact the result of each other.
// In those instances, this file is responsible for handling priorities and order as well as number of executions correctly.
//-------------
//-------------
// Author: Philip Windecker
//-------------
//-------------
// Include the addons (i.e. the sub-extensions).
// 1) Core includes
//-------------
const CON = require('./core/constants.js');
const ConfigParser = require("./core/parse_config.js");
const ContentAnalyzer = require('./core/content_analyzer.js')
//-------------
// 2) Addons
//-------------
const Macros = require('./antora/asam_macros/asam_macros.js')
const AsciiNav = require('./antora/nav_from_index/nav_from_index.js')
const ConsistentNumbering = require('./antora/consistent_numbering/numbered_titles.js');
const CrossrefReplacement = require('./antora/crossref_replacement/crossref_replacement.js')
const Doxygen = require("./antora/doxygen_converter/doxygen_extension.js")
const EA = require("./antora/ea_converter/ea_extension.js")
const Keywords = require('./antora/keywords_overview/keywords_overview.js');
const Orphans = require('./antora/orphan_pages/orphan_pages.js');
//-------------
//-------------
// Register this module in antora so it is used by the Antora pipeline.
// It receives the configuration set in the site.yml or the CLI.
// According to the configuration, certain addons and/or features are used and variables set.
//-------------
module.exports.register = function ({ config }) {
    const logger = this.require('@antora/logger').get('unlisted-pages-extension')
    // Parse the config file and return the values as the parsedConfig object
    let parsedConfig = ConfigParser.parse(config)

    this
      .on('contentAggregated', ({contentAggregate}) => {
          if (config.enterpriseArchitect) {
              EA.convertEnterpriseArchitect(parsedConfig.workdir,contentAggregate)
          }
          if (config.doxygen) {
              Doxygen.convertDoxygen(parsedConfig.workdir,contentAggregate)
          }
      })

      //-------------
      // Execute features on the "contentClassified" step of the pipeline.
      // At this point, the content has been loaded and analyzed / classified but has not yet been converted.
      //-------------
      .on('contentClassified', ({ contentCatalog }) => {
        console.log("Reacting on contentClassified")

        //-------------
        // Execute all features for each component-version-combination
        //-------------
        contentCatalog.getComponents().forEach(({ versions }) => {
            versions.forEach(({ name: component, version, url: defaultUrl }) => {
                //-------------
                // For each component-version-combo, get all pages and all nav files.
                //-------------
                let pages = contentCatalog.findBy({ component, version, family: 'page'})
                let navFiles = contentCatalog.findBy({ component, version, family: 'nav'})
                //-------------
                // Analyze the pages and create maps for the addons.
                //-------------
                let mapInput = {
                    useKeywords: parsedConfig.useKeywords,
                    pages: pages,
                    navFiles: navFiles
                }
                let { keywordPageMap, rolePageMap, anchorPageMap } = ContentAnalyzer.generateMapsForPages( mapInput )
                //-------------
                // Addon Keywords: Create initial keywords overview page.
                // Required setting: keywords: create_overview: true
                // Optional settings: keywords: path: ""; keywords: module: "ROOT"; keywords: filename: "0_used-keywords.adoc"
                //-------------
                pages = Keywords.createKeywordsOverviewPage(parsedConfig.keywordOverviewPageRequested, contentCatalog, pages, keywordPageMap, parsedConfig.targetPath, parsedConfig.targetName, parsedConfig.targetModule, component, version)
                //-------------
                // Addon Keywords: Get updated keyword page map
                //-------------
                keywordPageMap = ContentAnalyzer.getKeywordPageMapForPages(parsedConfig.useKeywords,pages)
                //-------------
                // Addon Macros: Replace all custom macros. NOTE: This requires the keywords extension!
                //-------------
                pages = Macros.findAndReplaceCustomASAMMacros( contentCatalog, pages, navFiles, keywordPageMap, rolePageMap, CON.macrosRegEx, CON.macrosHeadings, logger, component, version )
                //-------------
                // Addon Keywords: Get updated keyword page map
                //-------------
                keywordPageMap = ContentAnalyzer.getKeywordPageMapForPages(parsedConfig.useKeywords,pages)
                //-------------
                // Addon Keywords: Create final keywords overview page.
                //-------------
                pages = Keywords.createKeywordsOverviewPage(parsedConfig.keywordOverviewPageRequested, contentCatalog, pages, keywordPageMap, parsedConfig.targetPath, parsedConfig.targetName, parsedConfig.targetModule, component, version)
                //-------------
                // Get updated nav files. This is important because one of the macros may have added an additional navigation file or changed an existing one.
                //-------------
                navFiles = contentCatalog.findBy({ component, version, family: 'nav'})
                //-------------
                // Addon AsciiNav: Parse files and create navigation if attribute "antora_mapping" is used.
                //-------------
                AsciiNav.createAntoraNavigationFromIndex(pages, navFiles)
                //-------------
                // Addon ConsistentNumbering: Generate and apply consistent numbers for sections, titles, and (if activated) figures and tables
                // Required setting: numbered_titles: true
                // Optional setting: section_number_style: "iso"
                //-------------
                if (parsedConfig.numberedTitles) {
                    ConsistentNumbering.applySectionAndTitleNumbers(pages, navFiles, parsedConfig.sectionNumberStyle, contentCatalog, component)
                }
                //-------------
                // Addon CrossrefReplacement: Replace Asciidoctor local references ("<<ref>>") where the anchor is now located on a different page.
                // Note that only in case at least one valid anchor could be found and added to the map, the addon actually runs.
                // Required setting: local_to_global_references: true
                //-------------
                if (anchorPageMap.size > 0 && parsedConfig.localToGlobalReferences) {
                    pages = CrossrefReplacement.findAndReplaceLocalReferencesToGlobalAnchors( anchorPageMap, pages )
                }
            })
        })
      })
      //-------------
      //-------------
      // Execute features on the "navigationBuilt" step of the pipeline.
      // At this point, the content has been loaded and analyzed / classified but has not yet been converted. However, its navigation has been structured by analyzing the provided navigation files (nav.adoc).
      //-------------
      .on('navigationBuilt', ({ contentCatalog }) => {
        console.log("Reacting on navigationBuild")
        //-------------
        // Execute all features for each component-version-combination
        //-------------
        Orphans.find_orphan_pages(contentCatalog,parsedConfig.addToNavigation, parsedConfig.unlistedPagesHeading, logger)
      })
  }
