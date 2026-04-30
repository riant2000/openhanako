import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();

describe("server startup diagnostics contract", () => {
  it("records child process identity when server startup times out without output", () => {
    const mainSource = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf-8");

    expect(mainSource).toContain("Server PID:");
    expect(mainSource).toContain("Server command:");
    expect(mainSource).toContain("Server args:");
    expect(mainSource).toContain("Server child alive:");
  });
});
