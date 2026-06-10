# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
