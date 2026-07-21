import { describe, it, expect } from "vitest";
import { pickBestPersonMatch } from "./recipientMatch";

const CANDIDATES = [
  { id: 1, name: "Mike Blackham", email: "mike.blackham@merit.com" },
  { id: 2, name: "Mike Torres", email: "mike.torres@merit.com" },
  { id: 3, name: "Scott Ridley", email: null },
];

describe("pickBestPersonMatch", () => {
  it("prefers an exact full-name match", () => {
    expect(pickBestPersonMatch("Scott Ridley", CANDIDATES)).toEqual(CANDIDATES[2]);
  });

  it("declines to guess between two equally plausible first-name matches", () => {
    expect(pickBestPersonMatch("Mike", CANDIDATES)).toBeNull();
  });

  it("picks the sole first-name match when there is only one", () => {
    expect(pickBestPersonMatch("Mike", [CANDIDATES[0], CANDIDATES[2]])).toEqual(CANDIDATES[0]);
  });

  it("matches a partial/substring name", () => {
    expect(pickBestPersonMatch("Blackham", CANDIDATES)).toEqual(CANDIDATES[0]);
  });

  it("returns the only candidate from an already name-filtered search", () => {
    expect(pickBestPersonMatch("Ridley", [CANDIDATES[2]])).toEqual(CANDIDATES[2]);
  });

  it("returns null for an empty name or no candidates", () => {
    expect(pickBestPersonMatch("", CANDIDATES)).toBeNull();
    expect(pickBestPersonMatch("Mike", [])).toBeNull();
  });

  it("returns null when nothing plausible matches", () => {
    expect(pickBestPersonMatch("Zach Nobody", CANDIDATES)).toBeNull();
  });
});
