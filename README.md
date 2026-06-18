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
- [WebAssembly (Wasm) Acceleration](#webassembly-wasm-acceleration)
- [Recommendation Strategies](#recommendation-strategies)
  - [Item-Based Collaborative Filtering](#1-item-based-collaborative-filtering-default)
  - [User-Based Collaborative Filtering](#2-user-based-collaborative-filtering)
  - [Popularity & Cold Start Fallbacks](#3-popularity--cold-start-fallbacks)
  - [Time-Decay Weighting](#4-time-decay-weighting)
  - [Recommendation Filtering & Blacklisting](#5-recommendation-filtering--blacklisting)
  - [Similarity Intersection Threshold](#6-similarity-intersection-threshold)
  - [K-Nearest Neighbors (KNN) Limit](#7-k-nearest-neighbors-knn-limit)
  - [Content-Based Filtering](#8-content-based-filtering)
  - [Hybrid Recommendation Strategy](#9-hybrid-recommendation-strategy)
  - [Explainable Recommendations](#10-explainable-recommendations)
  - [Session-Based Recommendations](#11-session-based-recommendations)
- [Web Worker Support](#web-worker-support)
- [Offline Evaluation Suite](#offline-evaluation-suite)
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

| Feature                                     | Supported | Description                                                    |
| :------------------------------------------ | :-------: | :------------------------------------------------------------- |
| **WebAssembly Acceleration**                |    Yes    | Accelerates vector math calculations (Cosine, Jaccard, Pearson) using Rust |
| **Item-Based Collaborative Filtering**      |    Yes    | Recommends items based on item-item similarity matrices        |
| **User-Based Collaborative Filtering**      |    Yes    | Recommends items based on user-user similarity matrices        |
| **K-Nearest Neighbors (KNN) Limit**         |    Yes    | Limits calculations to top K nearest neighbors for performance |
| **Similarity Intersection Threshold**       |    Yes    | Avoids statistical coincidences by enforcing minimum overlap   |
| **Custom Similarity Metrics**               |    Yes    | Built-in Cosine, Jaccard, and Pearson correlation coefficients |
| **Custom Filtering & Blacklisting**         |    Yes    | Filters recommendations dynamically via callback or blacklist  |
| **Real-Time Incremental Updates**           |    Yes    | Live interaction updates with selective cache invalidation     |
| **Popularity Fallback Engine**              |    Yes    | Handles cold-start users using view, rate, and purchase counts |
| **Time-Decay Weighting**                    |    Yes    | Automatically decays older interaction ratings exponentially   |
| **Dynamic Interaction Weighting**           |    Yes    | Scales rating scores based on interaction types at load time   |
| **LRU Similarity Cache**                    |    Yes    | Prevents memory bloat with configurable LRU eviction limits   |
| **Sparse Storage Engine**                   |    Yes    | Operates entirely in memory with sparse indices                |
| **TypeScript Ready**                        |    Yes    | Written in strict TypeScript with full declaration files       |

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

## WebAssembly (Wasm) Acceleration

The library contains a high-performance WebAssembly backend compiled from Rust using `wasm-bindgen`. It accelerates vector mathematics calculations (Cosine Similarity, Jaccard Similarity, and Pearson Correlation) on large-scale datasets while maintaining zero runtime dependencies.

### Features
- **Zero-Dependency base64 Inlining**: The Wasm binary is encoded as a Base64 string and embedded directly inside the code (`wasm-binary.ts`). This allows it to run out of the box in both Node.js and browser environments without needing file system reads or network requests.
- **Automatic Loading**: Instantiating `NanoRecommender` automatically triggers asynchronous loading of the Wasm module in the background. If the module is not yet loaded or if the environment doesn't support WebAssembly, the engine silently falls back to pure JavaScript/TypeScript calculations.
- **Web Worker Compatibility**: The Wasm module is automatically pre-loaded when using the Web Worker API, providing asynchronous multithreaded recommendation queries fully accelerated by WebAssembly.

### Manual Pre-loading (Optional)
If you want to ensure WebAssembly is loaded and compiled before running any calculations, you can call the `loadWasm` helper:

```typescript
import { loadWasm, isWasmLoaded } from "@fizm/nano-recommender";

// Pre-load and compile WebAssembly
await loadWasm();
console.log("Is WebAssembly Active:", isWasmLoaded()); // true
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

### 5. Recommendation Filtering & Blacklisting

You can filter recommendations using built-in metadata, custom filter callbacks, or explicit blacklists:

#### Built-in Category & Tag Filtering

When loading your dataset, you can attach an optional `itemCategory` and list of `itemTags` to each interaction. The engine will store these attributes and allow you to filter recommendations directly without writing manual callbacks:

```typescript
// Load dataset with item metadata
recommender.load([
  { userId: "u1", itemId: "i1", rating: 5, itemCategory: "Book", itemTags: ["fantasy", "fiction"] },
  { userId: "u1", itemId: "i2", rating: 4, itemCategory: "Movie", itemTags: ["sci-fi"] },
]);

// Filter recommendations for a specific category
const bookRecs = recommender.recommend("user_id", {
  filterCategory: "Book",
});

// Filter recommendations that match at least one tag (OR match)
const tagRecs = recommender.recommend("user_id", {
  filterTags: ["fantasy", "adventure"],
});
```

#### Custom Callback & Blacklisting

You can also supply a custom filter function or an explicit blacklist of item IDs:

```typescript
const recs = recommender.recommend("user_id", {
  strategy: "item-based",
  excludeItemIds: ["item_out_of_stock_1", "item_out_of_stock_2"],
  filter: (itemId) => {
    const isAdultOnly = checkAdultCategory(itemId);
    const isUserMinor = checkUserIsMinor("user_id");
    return !(isAdultOnly && isUserMinor);
  }
});
```

### 6. Similarity Intersection Threshold

To avoid statistical anomalies in sparse datasets (such as a similarity score of `1.0` between two entities sharing only a single rated item), you can enforce a minimum intersection threshold. Similarity computations will immediately exit and return `0.0` for any pairs sharing fewer than this number of common interactions:

```typescript
const recs = recommender.recommend("user_id", {
  minIntersectionSize: 3, // Requires at least 3 shared ratings to compute similarity
});
```

### 7. K-Nearest Neighbors (KNN) Limit

To maximize prediction accuracy and reduce computational complexity under dense vectors, you can limit similarity scoring to the top K nearest neighbors (similar items in Item-Based CF, or similar users in User-Based CF):

```typescript
const recs = recommender.recommend("user_id", {
  k: 20, // Only compute score using the top 20 nearest neighbors
});
```

### 8. Content-Based Filtering

Recommends items similar to those the user has already interacted with based on item metadata (categories and tags). Item-to-item similarity is computed by blending exact category matches and Jaccard similarity of tags. Weights can be configured (e.g. `categoryWeight` and `tagWeight`).

```typescript
const recs = recommender.recommend("user_id", {
  strategy: "content-based",
  categoryWeight: 0.4, // 40% weight to category similarity
  tagWeight: 0.6,      // 60% weight to tag Jaccard similarity
});
```

### 9. Hybrid Recommendation Strategy

Combines personal collaborative filtering preferences with global popularity trends or content-based matching to deliver more dynamic and balanced recommendations. Both components are normalized to the range `[0.0, 1.0]` using Min-Max scaling, then blended using the weighting parameter `hybridAlpha` ($\alpha$):

$$\text{Final Score} = \alpha \cdot \text{Normalized Base Score} + (1 - \alpha) \cdot \text{Normalized Secondary Score}$$

#### Collaborative Filtering + Popularity Blending
```typescript
const recs = recommender.recommend("user_id", {
  strategy: "hybrid",
  hybridAlpha: 0.7, // 70% weight to CF, 30% to popularity
  hybridBaseStrategy: "item-based",
  hybridPopularityStrategy: "most-purchased",
});
```

#### Collaborative Filtering + Content-Based Blending (Content-Aware Hybrid)
```typescript
const recs = recommender.recommend("user_id", {
  strategy: "hybrid",
  hybridAlpha: 0.5, // 50% weight to CF, 50% to Content-Based
  hybridBaseStrategy: "item-based",
  hybridPopularityStrategy: "content-based", // uses content-based as the secondary strategy
});
```

### 10. Explainable Recommendations

To improve transparency and allow developers to display labels like *"Because you liked item X"* or *"Because similar user Y rated it Z"*, the engine can generate detailed explanation reasons when `explain: true` is passed:

```typescript
const recs = recommender.recommend("user_id", {
  strategy: "item-based",
  explain: true,
});

console.log(recs[0]);
/*
Output:
{
  itemId: "item_3",
  score: 4.5,
  reasons: [
    {
      triggerItemId: "item_1",
      similarity: 0.95,
      ratingGiven: 5.0,
      explanation: "Because you liked item item_1"
    }
  ]
}
*/
```

Depending on the active strategy, the `reasons` field will contain:
- **Item-Based CF**: Triggers showing which previously-rated items (`triggerItemId`, `similarity`, and target user's `ratingGiven`) influenced the candidate's score.
- **User-Based CF**: Triggers showing which similar users (`triggerUserId`, `similarity` with target user, and their `ratingGiven` for the candidate) influenced the prediction.
- **Content-Based Filtering**: Triggers showing which items with similar content (`triggerItemId` and `similarity` match) influenced the prediction.
- **Popularity (Fallback/Cold-Start)**: Global descriptions like `"One of the most rated items"`.
- **Hybrid**: Combined reasons merged from the base and secondary strategies.

### 11. Session-Based Recommendations

Generate recommendations dynamically based on the chronological sequence of item interactions within an active session. This is ideal for e-commerce shopping carts or real-time anonymous browsing where long-term history is either absent or doesn't reflect the user's immediate intent.

The engine supports two session recommendation strategies:
- `"transition"`: Calculates transition probabilities between items using a simple Markov Chain model ($A \to B$) built from historical sequence data.
- `"similarity"` (Default): Builds a pseudo-user profile from the active session, decays past items exponentially, and delegates to item-based or content-based similarity.

#### Direct Session Recommendation

To generate recommendations for a session directly (e.g. for an anonymous user cart):

```typescript
const cartItems = ["item_a", "item_b"];

const recs = recommender.recommendSession(cartItems, {
  sessionStrategy: "transition", // 'transition' | 'similarity'
  decayFactor: 0.5,             // Weights older session items lower exponentially
  limit: 5,
  explain: true,
});
```

#### Auto-Session Detection

If your interactions have `timestamp` fields, the engine automatically compiles transition and sequence histories. You can query standard recommendations while letting the engine automatically reconstruct the active session from the user's chronological history:

```typescript
// Reconstructs the user's active session from their history and generates sequence recommendations
const recs = recommender.recommend("user_id", {
  useSession: true,
  sessionStrategy: "transition",
});
```

## Web Worker Support

For browser environments processing larger datasets (e.g. 50,000+ interactions), calling recommendation queries directly on the main thread might block the UI, dropping frames. To keep your UI running at a smooth 60 FPS, the library offers asynchronous background processing using **Web Workers**.

The class `NanoRecommenderWorker` acts as an asynchronous facade to the Web Worker. It exposes the same API as `NanoRecommender`, but every method returns a `Promise`.

### Usage

1. **Instantiation**:
   Pass a new `Worker` pointing to the library's compiled worker script (located at `@fizm/nano-recommender/dist/recommender.worker.js`):

   ```typescript
   import { NanoRecommenderWorker } from "@fizm/nano-recommender";

   const recommender = new NanoRecommenderWorker(
     new Worker(
       new URL("@fizm/nano-recommender/dist/recommender.worker.js", import.meta.url),
       { type: "module" }
     )
   );
   ```

2. **Operations**:
   All operations are executed asynchronously in the background:

   ```typescript
   // 1. Initialize the engine inside the worker
   await recommender.init({ defaultStrategy: "item-based" });

   // 2. Load dataset in background
   await recommender.load(interactions);

   // 3. Query recommendations asynchronously
   const recs = await recommender.recommend("user_id", { limit: 5 });
   console.log(recs);

   // 4. Terminate the worker thread when done (optional)
   recommender.terminate();
   ```

> [!WARNING]
   > Because Web Workers communicate via message passing using the structured clone algorithm, custom filter callback functions (`options.filter`) cannot be passed to `NanoRecommenderWorker`. Instead, perform post-filtering of the returned recommendations on the main thread.

## Offline Evaluation Suite

The library includes a built-in evaluation suite under the `evaluation` namespace, enabling developers to partition interaction datasets and calculate recommendation quality metrics.

### Splitting Strategies

You can split your interaction arrays into training and testing sets using one of three splitter functions:

*   **`splitRandom(interactions, trainRatio)`**: Randomly splits interactions.
*   **`splitTemporal(interactions, trainRatio)`**: Splits interactions chronologically based on timestamps.
*   **`splitUserHoldout(interactions, trainRatio)`**: Groups interactions by user, shuffling and holding out a percentage of interactions for each user. This guarantees that test users have history in the training set.

```typescript
import { splitUserHoldout } from "@fizm/nano-recommender";

const { train, test } = splitUserHoldout(dataset, 0.8); // 80% train, 20% test
```

### Running Evaluations

The `evaluate` function automates training a recommender and testing its accuracy, returning standard ranking and rating prediction metrics. It automatically handles exporting, clearing, and fully restoring the original state of the recommender instance once evaluation completes.

```typescript
import { NanoRecommender, evaluate } from "@fizm/nano-recommender";

const recommender = new NanoRecommender();

const results = evaluate(recommender, train, test, {
  topK: 10, // K for Precision@K, Recall@K, and NDCG@K
  strategyOptions: {
    strategy: "item-based",
    similarityThreshold: 0.1,
  }
});

console.log(results);
/*
Output:
{
  rmse: 0.854,     // Root Mean Squared Error (rating prediction quality)
  mae: 0.652,      // Mean Absolute Error
  precision: 0.15, // Mean Precision@10 across test users
  recall: 0.32,    // Mean Recall@10 across test users
  ndcg: 0.28,      // Mean NDCG@10 (ranking quality)
  coverage: 0.45   // Catalog Coverage (ratio of recommended items / total catalog items)
}
*/
```

---

## Performance

The benchmark suite was run on synthetic datasets generated with 10 interactions per user, measuring loading speed, memory footprint, and query latency (average and P95).

### Loading & Memory Footprint

| Scale      |  Users  | Items | Interactions | Load Time | Load Rate (Ops/sec) | Heap Delta (Loaded) | Heap Delta (Cached) |
| :--------- | :-----: | :---: | :----------: | :-------: | :-----------------: | :-----------------: | :-----------------: |
| **Small**  |  1,000  |  100  |    10,000    |  9.09 ms  |      1,100,098      |       2.20 MB       |       0.88 MB       |
| **Medium** | 10,000  | 1,000 |   100,000    | 89.04 ms  |      1,123,039      |      20.68 MB       |      31.04 MB       |
| **Large**  | 100,000 | 5,000 |  1,000,000   | 1146.66 ms|       872,101       |      205.32 MB      |      165.71 MB      |

### Recommendation Latency (Item-Based)

| Scale      | Cache-Miss Avg | Cache-Miss P95 | Cache-Hit Avg | Cache-Hit P95 | Speedup Factor |
| :--------- | :------------: | :------------: | :-----------: | :-----------: | :------------: |
| **Small**  |    2.06 ms     |    7.38 ms     |    1.09 ms    |    1.62 ms    |      1.9x      |
| **Medium** |    41.17 ms    |    72.06 ms    |    5.23 ms    |    6.76 ms    |      7.9x      |
| **Large**  |   373.42 ms    |   563.20 ms    |   20.85 ms    |   25.05 ms    |     17.9x      |

---

## API Reference

### `class NanoRecommender`

#### `constructor(config?: NanoRecommenderConfig)`

Instantiates the recommendation engine facade.

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `defaultStrategy` | `"item-based" \| "user-based" \| "hybrid"` | `"item-based"` | The default strategy to use in the `recommend()` method. |
| `defaultSimilarityThreshold` | `number` | `0.0` | The default similarity threshold score between entities. |
| `defaultMinIntersectionSize` | `number` | `1` | The default minimum number of shared items/users required to compute similarity. |
| `defaultK` | `number` | `undefined` | The default neighborhood limit (K) to use in recommendation calculations. |
| `defaultFallbackStrategy` | `"most-rated" \| "most-viewed" \| "most-purchased" \| "none"` | `"most-rated"` | The default fallback strategy for cold start users. |
| `interactionWeights` | `Record<string, number>` | `undefined` | Optional mapping of interaction types to positive rating multipliers. |
| `decayHalfLifeDays` | `number` | `undefined` | Optional half-life in days for exponential time-decay weighting. |
| `maxSimilarityCacheSize` | `number` | `undefined` | Optional capacity limit for similarity cache (LRU eviction). |
| `defaultHybridAlpha` | `number` | `0.5` | The default weighting parameter alpha for hybrid strategy. Must be between 0.0 and 1.0. |
| `defaultExplain` | `boolean` | `false` | The default explain option to include reasons in recommendation results. |

#### `load(interactions: Interaction[], options?: { referenceTime?: number | string | Date }): void`

Clears existing interactions and loads a new batch dataset. Automatically applies weights from `interactionWeights` and decays ratings based on `decayHalfLifeDays` relative to `options.referenceTime` (defaults to max timestamp or `Date.now()`). Invalidates (clears) similarity caches.

#### `addInteraction(interaction: Interaction): void`

Adds or updates a single user-item interaction in real-time. Automatically applies weights from `interactionWeights` and decays the rating based on `decayHalfLifeDays` relative to the engine's last reference time. Updates the sparse matrix and selectively invalidates only the similarity cache entries associated with the affected user and item, maintaining high retrieval performance for other queries.

#### `recommend(userId: string, options?: RecommendationOptions): Recommendation[]`

Generates recommendation array for a user. Automatically delegates to the selected strategy, falling back to popularity engine if the user has no history.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `strategy` | `"item-based" \| "user-based" \| "hybrid"` | `defaultStrategy` | The recommendation strategy to use. |
| `limit` | `number` | `10` | Maximum number of recommendations to return. |
| `similarityThreshold` | `number` | `defaultSimilarityThreshold` | Minimum similarity score required between entities. |
| `minIntersectionSize` | `number` | `defaultMinIntersectionSize` | Minimum number of shared items/users required to compute similarity. |
| `k` | `number` | `defaultK` | Limit the similarity calculation to the top K nearest neighbors. |
| `excludeInteracted` | `boolean` | `true` | Whether to exclude items the user has already rated/interacted with. |
| `fallbackStrategy` | `"most-rated" \| "most-viewed" \| "most-purchased" \| "none"` | `defaultFallbackStrategy` | Fallback strategy for cold start users. |
| `excludeItemIds` | `string[]` | `undefined` | Optional array of item IDs to blacklist/exclude. |
| `filter` | `(itemId: string) => boolean` | `undefined` | Optional custom callback to dynamically filter item recommendations. |
| `filterCategory` | `string` | `undefined` | Optional category classification to filter recommendations by. |
| `filterTags` | `string[]` | `undefined` | Optional tags array to filter recommendations by (matches items with at least one tag). |
| `hybridAlpha` | `number` | `defaultHybridAlpha` | Weighting parameter alpha for hybrid strategy (0.0 to 1.0). |
| `hybridBaseStrategy` | `"item-based" \| "user-based"` | `defaultStrategy` (or `item-based`) | Collaborative filtering base strategy for hybrid. |
| `hybridPopularityStrategy` | `"most-rated" \| "most-viewed" \| "most-purchased"` | `defaultFallbackStrategy` (or `most-rated`) | Popularity strategy for hybrid. |
| `explain` | `boolean` | `defaultExplain` | Whether to include explanation reasons for the recommendations. |
| `useSession` | `boolean` | `false` | Whether to automatically detect and use the user's chronological interaction session. |
| `sessionStrategy` | `"transition" \| "similarity"` | `"similarity"` | The strategy mode for session-based recommendation. |
| `decayFactor` | `number` | `0.5` | Decay factor for positional items weighting. |
| `similarityStrategy` | `"item-based" \| "content-based"` | `"item-based"` | The similarity strategy to use when session strategy is `"similarity"`. |

#### `recommendSession(sessionItemIds: string[], options?: SessionRecommendationOptions): Recommendation[]`

Generates recommendations based on the items in the current active session (e.g., anonymous browsing or cart items).

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `sessionStrategy` | `"transition" \| "similarity"` | `"similarity"` | The strategy mode for session-based recommendation. |
| `decayFactor` | `number` | `0.5` | Decay factor for positional items (older items get decayed by `decayFactor^(N-1-j)`). |
| `limit` | `number` | `10` | Maximum number of recommendations to return. |
| `explain` | `boolean` | `defaultExplain` | Whether to include explanation reasons for the recommendations. |
| `filterCategory` | `string` | `undefined` | Optional category classification to filter recommendations by. |
| `filterTags` | `string[]` | `undefined` | Optional tags array to filter recommendations by. |
| `similarityStrategy` | `"item-based" \| "content-based"` | `"item-based"` | The similarity strategy to delegate to. |
| `similarityThreshold` | `number` | `defaultSimilarityThreshold` | Minimum similarity score required. |
| `minIntersectionSize` | `number` | `defaultMinIntersectionSize` | Minimum number of shared interactions. |
| `k` | `number` | `defaultK` | Top K neighborhood limit for similarity. |

#### `recommendItemBased(userId: string, options?: ItemBasedRecommendationOptions): Recommendation[]`

Directly triggers Item-Based Collaborative Filtering. Accepts all filtering options (`excludeItemIds`, `filter`).

#### `recommendUserBased(userId: string, options?: UserBasedRecommendationOptions): Recommendation[]`

Directly triggers User-Based Collaborative Filtering. Accepts all filtering options (`excludeItemIds`, `filter`).

#### `recommendContentBased(userId: string, options?: ContentBasedRecommendationOptions): Recommendation[]`

Directly triggers Content-Based Filtering based on item metadata categories and tags. Accepts filtering options (`excludeItemIds`, `filter`).

#### `recommendHybrid(userId: string, options?: RecommendationOptions): Recommendation[]`

Directly triggers Hybrid Recommendation Strategy blending CF scores and popularity counts. Accepts all filtering options (`excludeItemIds`, `filter`).

#### `clear(): void`

Pushes the engine to a clean state. Clears sparse matrix storage and deletes similarity cache instances.

#### `stats(): RecommenderStats`

Returns descriptive summary statistics (`userCount`, `itemCount`, `interactionCount`).

#### `export(): RecommenderState`

Exports the entire internal state of the recommender engine (including sparse matrix, item index, and popularity metrics) to a JSON-serializable object.

#### `import(state: RecommenderState): void`

Restores the recommender engine state from a serialized state object. Automatically invalidates internal similarity caches. Throws a `ValidationError` if the version or structure is invalid.

### Core Interfaces

#### `interface Interaction`

Represents a single user-item interaction event.

| Property | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `userId` | `string` | Yes | Unique identifier of the user. |
| `itemId` | `string` | Yes | Unique identifier of the item. |
| `rating` | `number` | Yes | Numeric rating, weight, or score for the interaction. |
| `type` | `string` | No | Type of interaction (e.g. `'view'`, `'rate'`, `'purchase'`). Used for weighting and fallback popularity strategy. |
| `timestamp` | `number \| string \| Date` | No | Optional timestamp of when the interaction occurred. Used for exponential time-decay. |
| `itemCategory` | `string` | No | Optional category classification of the item. Used for built-in filtering. |
| `itemTags` | `string[]` | No | Optional descriptive tags/keywords of the item. Used for built-in filtering. |

#### `interface Recommendation`

Represents a single item recommendation result.

| Property | Type | Description |
| :--- | :--- | :--- |
| `itemId` | `string` | Unique identifier of the recommended item. |
| `score` | `number` | Calculated recommendation score (higher scores represent better/stronger recommendations). |
| `reasons` | `RecommendationReason[]` | Optional explanation reasons detailing why this recommendation was generated. |

#### `interface RecommendationReason`

Represents the explanation reason behind a generated recommendation.

| Property | Type | Description |
| :--- | :--- | :--- |
| `triggerItemId` | `string` | Optional item ID that triggered this recommendation (Item-Based CF). |
| `triggerUserId` | `string` | Optional user ID that triggered this recommendation (User-Based CF). |
| `similarity` | `number` | Similarity score between the target and the trigger entity. |
| `ratingGiven` | `number` | Numeric rating value given to/by the trigger entity. |
| `explanation` | `string` | Plain English description of the recommendation reason. |

#### `interface RecommenderState`

Represents the complete serialized state of the engine.

| Property | Type | Description |
| :--- | :--- | :--- |
| `version` | `string` | Serialization schema version (currently `"1"`). |
| `matrix` | `SerializedMatrixState` | The serialized sparse matrix and item popularity indices. |

### Similarity Functions

The library exports the following built-in similarity algorithms that satisfy the `SimilarityFunction` interface:

- **`cosineSimilarity`**: Computes standard Cosine Similarity between two sparse vectors.
- **`jaccardSimilarity`**: Computes Jaccard Similarity coefficient based on the overlap of rated item sets (ignores rating values).
- **`pearsonCorrelation`**: Computes Pearson Correlation Coefficient by mean-centering the vectors before calculating cosine similarity, normalizing user rating scale bias.

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
