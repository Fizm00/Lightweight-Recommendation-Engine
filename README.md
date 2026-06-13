<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,100:312e81&height=220&section=header&text=nano-recommender&fontSize=50&fontAlignY=40&desc=Zero-dependency%20collaborative%20filtering%20engine%20for%20TypeScript&descAlignY=60&descAlign=50&fontColor=ffffff&descColor=cbd5e1" width="100%"/>
</p>

<p align="center">
  <strong>Zero-dependency collaborative filtering engine built for performance.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fizm/nano-recommender">
    <img src="https://img.shields.io/npm/v/@fizm/nano-recommender?color=312e81&style=flat-square" alt="npm version" />
  </a>
  <a href="https://bundlephobia.com/package/@fizm/nano-recommender">
    <img src="https://img.shields.io/badge/bundle--size-7.3%20kB%20(minzipped)-312e81?style=flat-square" alt="bundle size" />
  </a>
  <a href="https://github.com/Fizm00/Lightweight-Recommendation-Engine/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-312e81?style=flat-square" alt="license" />
  </a>
  <a href="https://github.com/Fizm00/Lightweight-Recommendation-Engine">
    <img src="https://img.shields.io/badge/typescript-%233178C6.svg?style=flat-square&logo=typescript&logoColor=white" alt="typescript" />
  </a>
  <a href="https://github.com/Fizm00/Lightweight-Recommendation-Engine/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/Fizm00/Lightweight-Recommendation-Engine/ci.yml?branch=main&style=flat-square" alt="build status" />
  </a>
</p>

## Table of Contents

- [Why nano-recommender](#why-nano-recommender)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Packaging Support](#packaging-support)
- [Recommendation Strategies](#recommendation-strategies)
  - [Item-Based Collaborative Filtering](#1-item-based-collaborative-filtering-default)
  - [User-Based Collaborative Filtering](#2-user-based-collaborative-filtering)
  - [Popularity & Cold Start Fallbacks](#3-popularity--cold-start-fallbacks)
  - [Time-Decay Weighting](#4-time-decay-weighting)
- [Performance](#performance)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Why nano-recommender

The library is a lightweight, zero-dependency, in-memory recommendation engine built to run efficiently in Node.js and browser environments.

It is designed for use-cases requiring rapid collaborative filtering and fallback recommendations without the overhead of heavy native dependencies, external databases, or machine learning pipelines.

### Design Pillars

- **Zero Runtime Dependencies**: Avoids dependency bloat. Relies entirely on native JavaScript and TypeScript features.
- **Sparse Matrix Optimization**: Ratings are stored in memory using sparse user-item maps and item-user indices, minimizing memory overhead and avoiding dense matrix allocations.
- **Symmetric Similarity Cache**: Pairwise similarities are computed lazily on demand and cached symmetrically, reducing subsequent query times to O(1) lookups.
- **Dual Packaging**: Ships with full ESM and CommonJS support alongside native TypeScript typings out of the box.
- **Tree-shakable Exports**: Algorithms and core utility classes are exported individually, allowing modern bundlers to remove unused code.

---

## Features

| Feature                                | Supported | Description                                                    |
| :------------------------------------- | :-------: | :------------------------------------------------------------- |
| **Item-Based Collaborative Filtering** |    Yes    | Recommends items based on item-item similarity matrices        |
| **User-Based Collaborative Filtering** |    Yes    | Recommends items based on user-user similarity matrices        |
| **Popularity Fallback Engine**         |    Yes    | Handles cold-start users using view, rate, and purchase counts |
| **Seeded/Symmetric Similarity Cache**  |    Yes    | Optimizes calculations using symmetric pair caching            |
| **Sparse Storage Engine**              |    Yes    | Operates entirely in memory with sparse indices                |
| **Time-Decay Weighting**               |    Yes    | Automatically decays older interaction ratings exponentially   |
| **TypeScript Ready**                   |    Yes    | Written in strict TypeScript with full declaration files       |

---

## Installation

Install via npm:

```bash
npm install @fizm/nano-recommender
```

Install via pnpm:

```bash
pnpm add @fizm/nano-recommender
```

Install via yarn:

```bash
yarn add @fizm/nano-recommender
```

---

## Quick Start

The following is a complete, compilable TypeScript example showing how to load a dataset and generate recommendations.

```typescript
import { NanoRecommender } from "@fizm/nano-recommender";

// 1. Initialize the engine
const recommender = new NanoRecommender({
  defaultStrategy: "item-based",
  defaultSimilarityThreshold: 0.0,
});

// 2. Load interaction datasets
recommender.load([
  { userId: "u1", itemId: "i1", rating: 5.0, type: "rate" },
  { userId: "u1", itemId: "i2", rating: 3.0, type: "rate" },
  { userId: "u2", itemId: "i1", rating: 4.0, type: "rate" },
  { userId: "u2", itemId: "i2", rating: 3.0, type: "rate" },
  { userId: "u2", itemId: "i3", rating: 2.0, type: "rate" },
  { userId: "u3", itemId: "i2", rating: 4.0, type: "rate" },
  { userId: "u3", itemId: "i3", rating: 5.0, type: "rate" },
]);

// 3. Generate recommendations for a user
const recommendations = recommender.recommend("u1", {
  limit: 2,
  strategy: "item-based",
});

// Output: [{ itemId: "i3", score: 3.5 }]
console.log(recommendations);
```

---

## Packaging Support

The package supports both ESM and CommonJS formats.

### ESM Import (Default)

```typescript
import { NanoRecommender, cosineSimilarity, pearsonCorrelation } from "@fizm/nano-recommender";
```

### CommonJS Require

```javascript
const { NanoRecommender, cosineSimilarity, pearsonCorrelation } = require("@fizm/nano-recommender");
```

---

## Recommendation Strategies

### 1. Item-Based Collaborative Filtering (Default)

Finds items similar to those the user has already rated. It supports custom similarity functions (e.g. Cosine, Pearson) over sparse item vectors and computes predicted ratings using a weighted average.

```typescript
import { pearsonCorrelation } from "@fizm/nano-recommender";

const recs = recommender.recommendItemBased("user_id", {
  limit: 10,
  similarityThreshold: 0.1,
  excludeInteracted: true,
  similarityFunction: pearsonCorrelation,
});
```

### 2. User-Based Collaborative Filtering

Finds users similar to the target user and recommends items they liked. It supports custom similarity functions (e.g. Cosine, Jaccard, Pearson).

```typescript
import { jaccardSimilarity } from "@fizm/nano-recommender";

const recs = recommender.recommendUserBased("user_id", {
  limit: 10,
  similarityThreshold: 0.2,
  similarityFunction: jaccardSimilarity,
});
```

### 3. Popularity & Cold Start Fallbacks

If a user has no interaction history (a cold-start user), `recommend()` automatically falls back to popularity recommendations. You can configure which interaction type counts are evaluated.

```typescript
const recs = recommender.recommend("new_user_id", {
  fallbackStrategy: "most-purchased", // 'most-rated' | 'most-viewed' | 'most-purchased' | 'none'
});
```

### 4. Time-Decay Weighting

To prevent recommendations from getting stale, you can configure an exponential decay half-life in days. Interactions will automatically have their ratings scaled down based on how old they are relative to the latest interaction in the dataset (or a custom reference time).

```typescript
const recommender = new NanoRecommender({
  decayHalfLifeDays: 30, // 30-day half-life (interactions 30 days old decay to 50% weight)
});

recommender.load([
  { userId: "u1", itemId: "i1", rating: 5.0, timestamp: "2026-06-12T00:00:00Z" },
  { userId: "u1", itemId: "i2", rating: 5.0, timestamp: "2026-05-13T00:00:00Z" }, // ~30 days old -> scaled to 2.5
]);
```

You can also supply a custom reference time:
```typescript
recommender.load(dataset, { referenceTime: new Date("2026-06-12T00:00:00Z") });
```

---

## Performance

The benchmark suite was run on synthetic datasets generated with 10 interactions per user, measuring loading speed, memory footprint, and query latency (average and P95).

### Loading & Memory Footprint

| Scale      |  Users  | Items | Interactions | Load Time | Load Rate (Ops/sec) | Heap Delta (Loaded) | Heap Delta (Cached) |
| :--------- | :-----: | :---: | :----------: | :-------: | :-----------------: | :-----------------: | :-----------------: |
| **Small**  |  1,000  |  100  |    10,000    |  2.84 ms  |      3,520,755      |       1.75 MB       |       0.55 MB       |
| **Medium** | 10,000  | 1,000 |   100,000    | 20.47 ms  |      4,885,818      |      16.56 MB       |      31.28 MB       |
| **Large**  | 100,000 | 5,000 |  1,000,000   | 228.75 ms |      4,371,610      |      165.98 MB      |      325.79 MB      |

### Recommendation Latency (Item-Based)

| Scale      | Cache-Miss Avg | Cache-Miss P95 | Cache-Hit Avg | Cache-Hit P95 | Speedup Factor |
| :--------- | :------------: | :------------: | :-----------: | :-----------: | :------------: |
| **Small**  |    1.56 ms     |    3.21 ms     |    1.17 ms    |    1.41 ms    |      1.3x      |
| **Medium** |    32.23 ms    |    46.70 ms    |   15.94 ms    |   17.77 ms    |      2.0x      |
| **Large**  |   784.14 ms    |  1,022.55 ms   |   334.23 ms   |   419.22 ms   |      2.3x      |

---

## API Reference

### `class NanoRecommender`

#### `constructor(config?: NanoRecommenderConfig)`

Instantiates the recommendation engine facade.

- **`config.defaultStrategy`**: `"item-based" | "user-based"`. Defaults to `"item-based"`.
- **`config.defaultSimilarityThreshold`**: `number`. Defaults to `0.0`.
- **`config.defaultFallbackStrategy`**: `"most-rated" | "most-viewed" | "most-purchased" | "none"`. Defaults to `"most-rated"`.
- **`config.interactionWeights`**: `Record<string, number>`. Optional. Mapping of interaction types (e.g., `"purchase"`, `"view"`) to positive rating multipliers.
- **`config.decayHalfLifeDays`**: `number`. Optional. Half-life in days for exponential time-decay weighting. Must be a positive number.
- **`config.maxSimilarityCacheSize`**: `number`. Optional. Maximum number of entries in the similarity cache. Once exceeded, the least recently used entries are evicted (LRU eviction).

#### `load(interactions: Interaction[], options?: { referenceTime?: number | string | Date }): void`

Clears existing interactions and loads a new batch dataset. Automatically applies weights from `interactionWeights` and decays ratings based on `decayHalfLifeDays` relative to `options.referenceTime` (defaults to max timestamp or `Date.now()`). Invalidates (clears) similarity caches.

#### `addInteraction(interaction: Interaction): void`

Adds or updates a single user-item interaction in real-time. Automatically applies weights from `interactionWeights` and decays the rating based on `decayHalfLifeDays` relative to the engine's last reference time. Updates the sparse matrix and selectively invalidates only the similarity cache entries associated with the affected user and item, maintaining high retrieval performance for other queries.

#### `recommend(userId: string, options?: RecommendationOptions): Recommendation[]`

Generates recommendation array for a user. Automatically delegates to the selected strategy, falling back to popularity engine if the user has no history.

- **`options.strategy`**: `"item-based" | "user-based"`.
- **`options.limit`**: `number` (default: `10`).
- **`options.similarityThreshold`**: `number` (default: `0.0`).
- **`options.excludeInteracted`**: `boolean` (default: `true`).
- **`options.fallbackStrategy`**: `"most-rated" | "most-viewed" | "most-purchased" | "none"`.

#### `recommendItemBased(userId: string, options?: ItemBasedRecommendationOptions): Recommendation[]`

Directly triggers Item-Based Collaborative Filtering.

#### `recommendUserBased(userId: string, options?: UserBasedRecommendationOptions): Recommendation[]`

Directly triggers User-Based Collaborative Filtering.

#### `clear(): void`

Pushes the engine to a clean state. Clears sparse matrix storage and deletes similarity cache instances.

#### `stats(): RecommenderStats`

Returns descriptive summary statistics (`userCount`, `itemCount`, `interactionCount`).

#### `export(): RecommenderState`

Exports the entire internal state of the recommender engine (including sparse matrix, item index, and popularity metrics) to a JSON-serializable object.

#### `import(state: RecommenderState): void`

Restores the recommender engine state from a serialized state object. Automatically invalidates internal similarity caches. Throws a `ValidationError` if the version or structure is invalid.

---

## Architecture

The project maintains a clean structural modularity:

```text
src/
├── core/
│   ├── cache.ts       # Symmetric cache
│   └── matrix.ts      # Sparse rating matrix
├── algorithms/
│   ├── math.ts        # Sparse vector operations
│   ├── similarity.ts  # Similarity definitions
│   ├── cosine.ts      # Cosine similarity
│   ├── jaccard.ts     # Jaccard similarity
│   ├── pearson.ts     # Pearson correlation
│   ├── item-based.ts  # Item-based collaborative filtering
│   ├── user-based.ts  # User-based collaborative filtering
│   └── popularity.ts  # Popularity ranking indices
├── errors/
│   └── index.ts       # Custom domain exceptions
├── types/
│   └── index.ts       # TS type definitions
├── utils/
│   └── matrix-utils.ts# Common array transformations
└── recommender.ts     # Main public facade
```

---

## Contributing

1. Clone the repository:
   ```bash
   git clone https://github.com/Fizm00/Lightweight-Recommendation-Engine.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run tests to verify setup:
   ```bash
   npm test
   ```
4. Run benchmarks:
   ```bash
   npm run benchmark
   ```

---

## License

MIT License. See [LICENSE](file:///d:/Code/Tools-Library-Project/nano-recommender/LICENSE) for details.
