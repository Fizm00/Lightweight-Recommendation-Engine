import type { Interaction } from "../types/index.js";

/**
 * Randomly splits a dataset of interactions into training and testing sets.
 *
 * @param interactions The full dataset of interactions.
 * @param trainRatio The proportion of interactions to assign to the training set (between 0.0 and 1.0).
 * @returns An object containing the train and test interaction arrays.
 */
export function splitRandom(
  interactions: Interaction[],
  trainRatio: number
): { train: Interaction[]; test: Interaction[] } {
  if (trainRatio < 0.0 || trainRatio > 1.0) {
    throw new RangeError("trainRatio must be between 0.0 and 1.0");
  }

  const shuffled = [...interactions];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }

  const splitIndex = Math.floor(shuffled.length * trainRatio);
  const train = shuffled.slice(0, splitIndex);
  const test = shuffled.slice(splitIndex);

  return { train, test };
}

/**
 * Splits a dataset of interactions chronologically into training and testing sets.
 *
 * @param interactions The full dataset of interactions.
 * @param trainRatio The proportion of interactions to assign to the training set (between 0.0 and 1.0).
 * @returns An object containing the train and test interaction arrays.
 */
export function splitTemporal(
  interactions: Interaction[],
  trainRatio: number
): { train: Interaction[]; test: Interaction[] } {
  if (trainRatio < 0.0 || trainRatio > 1.0) {
    throw new RangeError("trainRatio must be between 0.0 and 1.0");
  }

  const sorted = [...interactions].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });

  const splitIndex = Math.floor(sorted.length * trainRatio);
  const train = sorted.slice(0, splitIndex);
  const test = sorted.slice(splitIndex);

  return { train, test };
}

/**
 * Splits a dataset of interactions by holding out a proportion of interactions for each user.
 * Ensures that users with interactions have at least one interaction in the training set.
 *
 * @param interactions The full dataset of interactions.
 * @param trainRatio The proportion of interactions to assign to the training set (between 0.0 and 1.0).
 * @returns An object containing the train and test interaction arrays.
 */
export function splitUserHoldout(
  interactions: Interaction[],
  trainRatio: number
): { train: Interaction[]; test: Interaction[] } {
  if (trainRatio < 0.0 || trainRatio > 1.0) {
    throw new RangeError("trainRatio must be between 0.0 and 1.0");
  }

  const userGroups = new Map<string, Interaction[]>();
  for (const interaction of interactions) {
    let list = userGroups.get(interaction.userId);
    if (!list) {
      list = [];
      userGroups.set(interaction.userId, list);
    }
    list.push(interaction);
  }

  const train: Interaction[] = [];
  const test: Interaction[] = [];

  for (const list of userGroups.values()) {
    const shuffled = [...list];
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = temp;
    }

    let splitIndex = Math.floor(shuffled.length * trainRatio);
    if (splitIndex === 0 && shuffled.length > 0) {
      splitIndex = 1;
    }

    const userTrain = shuffled.slice(0, splitIndex);
    const userTest = shuffled.slice(splitIndex);

    train.push(...userTrain);
    test.push(...userTest);
  }

  return { train, test };
}
