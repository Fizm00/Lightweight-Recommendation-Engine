import test from "node:test";
import assert from "node:assert";

// Create a mock worker interface for the client wrapper to interact with
class ClientMockWorker implements Worker {
  private listeners: { [type: string]: ((ev: MessageEvent) => void)[] } = {};
  public terminated = false;

  public addEventListener(type: string, listener: any): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type]!.push(listener);
  }

  public removeEventListener(type: string, listener: any): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type]!.filter(l => l !== listener);
  }

  public dispatchEvent(event: Event): boolean {
    return true;
  }

  // When client posts a message to worker, route it to the worker script's listener
  public postMessage(message: any, transfer?: any): void {
    if (this.terminated) return;
    setTimeout(() => {
      for (const listener of workerMock.listeners) {
        listener({ data: message } as MessageEvent);
      }
    }, 0);
  }

  // When worker posts a message back, route it to the client's listener
  public postMessageFromWorker(message: any): void {
    if (this.terminated) return;
    const listeners = this.listeners["message"] || [];
    for (const listener of listeners) {
      listener({ data: message } as MessageEvent);
    }
  }

  public terminate(): void {
    this.terminated = true;
  }

  public onmessage = null;
  public onmessageerror = null;
  public onerror = null;
}

const clientMockWorker = new ClientMockWorker();

// Mock the global self scope for the worker script before importing it
const workerMock = {
  listeners: [] as ((ev: any) => void)[],
  addEventListener(type: string, listener: any) {
    if (type === "message") {
      this.listeners.push(listener);
    }
  },
  postMessage(data: any) {
    clientMockWorker.postMessageFromWorker(data);
  }
};

(globalThis as any).self = workerMock;

// Import the client wrapper and the worker script
const { NanoRecommenderWorker } = await import("../worker/recommender-client.js");
await import("../worker/recommender.worker.js");

test("Web Worker - init, load, stats, and recommend workflow", async () => {
  const recommender = new NanoRecommenderWorker(clientMockWorker);

  // Initialize
  await recommender.init({
    defaultStrategy: "item-based"
  });

  // Stats should be zero initially
  const initialStats = await recommender.stats();
  assert.strictEqual(initialStats.userCount, 0);
  assert.strictEqual(initialStats.itemCount, 0);

  // Load interactions
  await recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0, itemCategory: "book", itemTags: ["tech"] },
    { userId: "u1", itemId: "i2", rating: 3.0, itemCategory: "book", itemTags: ["sci-fi"] },
    { userId: "u2", itemId: "i1", rating: 4.0, itemCategory: "book", itemTags: ["tech"] },
    { userId: "u2", itemId: "i2", rating: 3.0, itemCategory: "book", itemTags: ["sci-fi"] },
    { userId: "u2", itemId: "i3", rating: 2.0, itemCategory: "electronics", itemTags: ["gadget"] },
  ]);

  // Check stats after load
  const statsAfterLoad = await recommender.stats();
  assert.strictEqual(statsAfterLoad.userCount, 2);
  assert.strictEqual(statsAfterLoad.itemCount, 3);
  assert.strictEqual(statsAfterLoad.interactionCount, 5);

  // Add real-time interaction
  await recommender.addInteraction({ userId: "u1", itemId: "i3", rating: 4.0, itemCategory: "electronics", itemTags: ["gadget"] });
  const statsAfterAdd = await recommender.stats();
  assert.strictEqual(statsAfterAdd.interactionCount, 6);

  // Recommend query
  const recs = await recommender.recommend("u2", { limit: 1 });
  // Since u2 liked i1, i2, i3, recommend returns empty (excludeInteracted: true)
  assert.strictEqual(recs.length, 0);

  // Recommend item-based
  const itemRecs = await recommender.recommendItemBased("u1", { limit: 5 });
  assert.strictEqual(itemRecs.length, 0);

  // Recommend content-based
  const cbRecs = await recommender.recommendContentBased("u1", { limit: 5 });
  assert.strictEqual(cbRecs.length, 0);

  // Clear data
  await recommender.clear();
  const statsAfterClear = await recommender.stats();
  assert.strictEqual(statsAfterClear.interactionCount, 0);
});

test("Web Worker - Error propagation from worker to main thread", async () => {
  const recommender = new NanoRecommenderWorker(clientMockWorker);

  // Reset the worker's recommender instance to ensure it's not initialized
  await recommender.reset();

  // Calling load before initialization should fail and propagate the error
  await assert.rejects(async () => {
    await recommender.load([{ userId: "u1", itemId: "i1", rating: 5 }]);
  }, /Recommender has not been initialized/);
});

test("Web Worker - Export and import states", async () => {
  const recommender = new NanoRecommenderWorker(clientMockWorker);
  await recommender.init();
  await recommender.load([
    { userId: "u1", itemId: "i1", rating: 5.0 },
    { userId: "u1", itemId: "i2", rating: 4.0 },
  ]);

  const state = await recommender.export();
  assert.strictEqual(state.version, "1");

  const otherRecommender = new NanoRecommenderWorker(clientMockWorker);
  await otherRecommender.init();
  await otherRecommender.import(state);

  const stats = await otherRecommender.stats();
  assert.strictEqual(stats.userCount, 1);
  assert.strictEqual(stats.itemCount, 2);
});

test("Web Worker - filter callback warning and exclusion", async () => {
  const recommender = new NanoRecommenderWorker(clientMockWorker);
  await recommender.init();

  let warningMessage = "";
  const originalWarn = console.warn;
  console.warn = (msg) => {
    warningMessage = msg;
  };

  try {
    // Attempt recommending with a filter callback (should be deleted and raise warning)
    await recommender.recommend("u1", {
      filter: (id) => id === "i1"
    });

    assert.ok(warningMessage.includes("Custom filter functions cannot be passed"));
  } finally {
    console.warn = originalWarn;
  }
});
