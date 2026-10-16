import { describe, expect, it } from "vitest";
import { isAllowedUpdateFile, parseRepo, sameSecret } from "./updateFeed";

describe("private update feed", () => {
  it("only serves Windows update files", () => {
    expect(isAllowedUpdateFile("latest.yml")).toBe(true);
    expect(isAllowedUpdateFile("Zeros-Setup-1.0.42.exe")).toBe(true);
    expect(isAllowedUpdateFile("Zeros-Setup-1.0.42.exe.blockmap")).toBe(true);
    expect(isAllowedUpdateFile("../secret.txt")).toBe(false);
    expect(isAllowedUpdateFile("source.zip")).toBe(false);
  });
  it("reads owner/repo", () => {
    expect(parseRepo("https://github.com/ammarsafaa/grocery-mate-setup")).toEqual({ owner: "ammarsafaa", repo: "grocery-mate-setup" });
    expect(parseRepo("bad")).toBeNull();
  });
  it("rejects a wrong download key", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
  });
});