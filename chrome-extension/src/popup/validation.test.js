import { normalizeServer, passwordScore, validateServer } from "./validation";

describe("popup validation", () => {
  it("normalizes server origins without changing the scheme", () => {
    expect(normalizeServer(" https://notes.example.com/// ")).toBe(
      "https://notes.example.com",
    );
  });

  it("accepts secure remote servers and local HTTP development", () => {
    expect(validateServer("https://notes.example.com")).toBe("");
    expect(validateServer("http://127.0.0.1:18555")).toBe("");
    expect(validateServer("http://localhost:3000")).toBe("");
  });

  it("rejects unsafe or ambiguous server addresses", () => {
    expect(validateServer("http://notes.example.com")).toMatch(/HTTPS/);
    expect(validateServer("https://user:pass@notes.example.com")).toMatch(
      /without credentials/,
    );
    expect(validateServer("https://notes.example.com/api")).toMatch(
      /without a path/,
    );
    expect(validateServer("javascript:alert(1)")).toMatch(/HTTP/);
  });

  it("scores password strength without accepting length alone as maximum", () => {
    expect(passwordScore("")).toBe(0);
    expect(passwordScore("abcdefgh")).toBe(1);
    expect(passwordScore("longpasswordvalue")).toBe(2);
    expect(passwordScore("LongPassword1!")).toBe(4);
  });
});
