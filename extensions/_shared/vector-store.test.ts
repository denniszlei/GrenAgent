import { describe, expect, it } from "vitest";
import { cosineSimilarity, decodeVector, encodeVector, topKByCosine } from "./vector-store.js";

describe("encode/decodeVector", () => {
  it("round-trips a float vector (within f32 precision)", () => {
    const v = [0.1, -0.5, 1.25, 3];
    const back = decodeVector(encodeVector(v));
    expect(back.length).toBe(4);
    for (let i = 0; i < v.length; i++) expect(back[i]).toBeCloseTo(v[i], 5);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical direction and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("is 0 against a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("topKByCosine", () => {
  it("ranks by similarity and respects k", () => {
    const rows = [
      { item: "a", vector: [1, 0] },
      { item: "b", vector: [0.9, 0.1] },
      { item: "c", vector: [0, 1] },
    ];
    const hits = topKByCosine([1, 0], rows, 2);
    expect(hits.map((h) => h.item)).toEqual(["a", "b"]);
  });
});
