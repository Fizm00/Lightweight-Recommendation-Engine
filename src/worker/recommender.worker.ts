import { NanoRecommender } from "../recommender.js";
import type { WorkerRequest } from "./types.js";
import { loadWasm } from "../wasm/loader.js";

let recommender: NanoRecommender | null = null;

const ctx: Worker = self as any;

ctx.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case "init": {
        recommender = new NanoRecommender(payload?.config);
        try {
          await loadWasm();
        } catch (err) {
          // Fallback silently to JS/TS
        }
        ctx.postMessage({ id, type: "init_success" });
        break;
      }
      case "load": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        recommender.load(payload.interactions, payload.options);
        ctx.postMessage({ id, type: "load_success" });
        break;
      }
      case "addInteraction": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        recommender.addInteraction(payload.interaction);
        ctx.postMessage({ id, type: "addInteraction_success" });
        break;
      }
      case "recommend": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommend(payload.userId, payload.options);
        ctx.postMessage({ id, type: "recommend_success", payload: recs });
        break;
      }
      case "recommendSession": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommendSession(payload.sessionItemIds, payload.options);
        ctx.postMessage({ id, type: "recommendSession_success", payload: recs });
        break;
      }
      case "recommendItemBased": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommendItemBased(payload.userId, payload.options);
        ctx.postMessage({ id, type: "recommendItemBased_success", payload: recs });
        break;
      }
      case "recommendUserBased": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommendUserBased(payload.userId, payload.options);
        ctx.postMessage({ id, type: "recommendUserBased_success", payload: recs });
        break;
      }
      case "recommendContentBased": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommendContentBased(payload.userId, payload.options);
        ctx.postMessage({ id, type: "recommendContentBased_success", payload: recs });
        break;
      }
      case "recommendHybrid": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const recs = recommender.recommendHybrid(payload.userId, payload.options);
        ctx.postMessage({ id, type: "recommendHybrid_success", payload: recs });
        break;
      }
      case "clear": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        recommender.clear();
        ctx.postMessage({ id, type: "clear_success" });
        break;
      }
      case "stats": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const statsResult = recommender.stats();
        ctx.postMessage({ id, type: "stats_success", payload: statsResult });
        break;
      }
      case "export": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        const stateResult = recommender.export();
        ctx.postMessage({ id, type: "export_success", payload: stateResult });
        break;
      }
      case "import": {
        if (!recommender) {
          throw new Error("Recommender has not been initialized. Call 'init' first.");
        }
        recommender.import(payload.state);
        ctx.postMessage({ id, type: "import_success" });
        break;
      }
      case "reset": {
        recommender = null;
        ctx.postMessage({ id, type: "reset_success" });
        break;
      }
      default: {
        throw new Error(`Unknown request type: ${type}`);
      }
    }
  } catch (err) {
    ctx.postMessage({ id, type: `${type}_error`, error: (err as Error).message });
  }
});
