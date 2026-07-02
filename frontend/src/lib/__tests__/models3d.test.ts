import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MINI_MODELS, miniModelFor } from "../models3d";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(__dirname, "../../../public/models3d");

describe("miniModelFor", () => {
  it("resolves a direct hit", () => {
    expect(miniModelFor("su30_mki")).toBe("su30_mki");
  });

  it("resolves an alias", () => {
    expect(miniModelFor("tejas_mk2")).toBe("tejas_mk1a");
  });

  it("returns null for a platform with no mini", () => {
    expect(miniModelFor("su35")).toBeNull();
  });

  it("has a committed .glb file for every registered mini model", () => {
    for (const id of MINI_MODELS) {
      const file = path.join(modelsDir, `${id}.glb`);
      expect(fs.existsSync(file), `missing ${file}`).toBe(true);
    }
  });
});
