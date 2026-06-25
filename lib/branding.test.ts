import { describe, it, expect } from "vitest";
import { tint, brandToCssVars, brandStyleAttr, APP_NEUTRAL } from "./branding";

describe("branding", () => {
  it("tints a hex to rgba", () => {
    expect(tint("#dc2626", 0.1)).toBe("rgba(220, 38, 38, 0.1)");
    expect(tint("not-a-hex", 0.1)).toBe("not-a-hex");
  });
  it("maps a kit to the brand CSS variables", () => {
    const vars = brandToCssVars({ ...APP_NEUTRAL, primary: "#dc2626", accent: "#2563eb" });
    expect(vars["--brand-primary"]).toBe("#dc2626");
    expect(vars["--brand-accent"]).toBe("#2563eb");
    expect(vars["--brand-primary-soft"]).toBe("rgba(220, 38, 38, 0.1)");
  });
  it("renders an inline style attr string", () => {
    expect(brandStyleAttr(APP_NEUTRAL)).toContain("--brand-primary: #5145e6");
  });
});
