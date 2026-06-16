# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-06-16

### Added
- **Content-Based Filtering (CBF)**: Introduced new `"content-based"` strategy option to `recommend()` that scores candidates using item-to-item similarity based on categories and tag Jaccard indices. Includes adjustable weights for category and tags.
- **Content-Aware Hybrid Blending**: Enhanced `"hybrid"` strategy to support blending Collaborative Filtering (base) with Content-Based Filtering (secondary), enabling better recommendation variety and solving the cold-start problem.
- **Explainable CBF reasons**: Added support for detailed reasons when `explain: true` is requested on content-based queries, detailing matching categories/tags.

## [1.6.0] - 2026-06-15

### Added
- **Built-in Tag/Category Filtering**: Extended interaction schema and matrix storage to support item categories (`itemCategory`) and tags (`itemTags`). Added query options `filterCategory` and `filterTags` to filter recommendation results automatically.

## [1.5.0] - 2026-06-15

### Added
- **Explainable Recommendations**: Added `explain` option to recommendation queries and `defaultExplain` to recommender config to include a detailed `reasons` array explaining why items are recommended under all strategies.

## [1.4.0] - 2026-06-15

### Added
- **Hybrid Recommendation Strategy**: Introduced `"hybrid"` strategy option to `recommend()` to blend Collaborative Filtering scores with global item popularity counts using min-max normalization and weight scaling ($\alpha$).

## [1.3.0] - 2026-06-14

### Added
- **K-Nearest Neighbors (KNN) Limit**: Added option `k` to recommendation parameters and `defaultK` to `NanoRecommenderConfig` to limit similarity calculation/candidate selection to top K nearest neighbors, boosting both accuracy and performance.
- **Similarity Intersection Threshold**: Added option `minIntersectionSize` to recommendation parameters and `defaultMinIntersectionSize` to `NanoRecommenderConfig` to filter out similarities computed from low-intersection pairs.

## [1.2.1] - 2026-06-13

### Changed
- **Incremental Transpose Matrix**: Refactored `SparseMatrix` to maintain the transpose index dynamically, optimizing recommendation query latency by up to 8.4x.

## [1.2.0] - 2026-06-13

### Added
- **Pearson Correlation Coefficient**: Introduced `pearsonCorrelation` similarity function to normalize user rating bias.
- **Custom Similarity in Item-Based CF**: Item-based collaborative filtering now supports custom similarity functions via the `similarityFunction` option.
- **Custom Recommendation Filtering & Blacklisting**: Added `filter` callback and `excludeItemIds` blacklist options to `recommend()`, `recommendItemBased()`, and `recommendUserBased()` to allow real-time business logic filtering.
- **Similarity Cache Capacity Limit (LRU)**: Added LRU cache eviction policy with configurable capacity via `maxSimilarityCacheSize`.
- **Real-Time Incremental Updates**: Added `addInteraction()` for real-time additions and updates with selective cache invalidation.

## [1.1.0] - 2026-06-12

### Added
- **State Serialization**: Added `export()` and `import()` methods on `NanoRecommender` to save and restore the internal matrix state.
- **Dynamic Interaction Weighting**: Added support for custom interaction weights (`interactionWeights`) to scale ratings based on interaction type at load time.
- **Time-Decay Weighting**: Added exponential time-decay weighting (`decayHalfLifeDays`) to automatically discount older interactions, with support for custom `referenceTime`.

## [1.0.0] - 2026-06-10

This is the initial production release of **nano-recommender**, a zero-dependency, lightweight, in-memory collaborative filtering recommendation engine for Node.js and TypeScript.

### Added

- **Unified Recommender Facade**: Main entrypoint `NanoRecommender` class coordinating matrix storage, algorithms, and options.
- **Sparse Matrix Core**: Optimized memory layout supporting sparse user-item interaction maps and item-user indices with data validation.
- **Vector Math Engine**: Reusable math utilities (dot product, Euclidean magnitude, vector intersections) optimized for sparse data structures.
- **Similarity Engine**: Cosine and Jaccard similarity algorithms with a flexible injection contract.
- **Item-Based Collaborative Filtering**: Recommendation strategy using item-item similarity and weighted averages.
- **User-Based Collaborative Filtering**: Recommendation strategy using user-user similarity and custom similarity metrics.
- **Popularity Engine**: Fallback strategies tracking frequency of ratings, views, and purchases to handle cold-start users.
- **Performance Cache**: Local symmetric similarity caching to prevent redundant computations and reduce latency.
- **Benchmark Suite**: Complete performance metrics runner measuring loading speed, memory footprint, and query latency across Small, Medium, and Large scales.
- **Distribution Formats**: Support for dual ESM and CommonJS builds with bundled TypeScript typings.
