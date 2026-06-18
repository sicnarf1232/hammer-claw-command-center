import { describe, it, expect } from "vitest";
import { classifyTaskType } from "./taskType";

describe("classifyTaskType", () => {
  it("maps OEM keywords to the right type", () => {
    expect(classifyTaskType("Submit PCN for Dash catheter")).toBe("PCN");
    expect(classifyTaskType("Confirm GTIN with Terumo")).toBe("PCN");
    expect(classifyTaskType("Close CAPA from the audit finding")).toBe("Quality & Reg");
    expect(classifyTaskType("Send validation memos")).toBe("Quality & Reg");
    expect(classifyTaskType("Build a quote for MSS031")).toBe("Pricing/Quote");
    expect(classifyTaskType("Approve the PO and contract terms")).toBe("Pricing/Quote");
    expect(classifyTaskType("Ship the sample prototype")).toBe("Samples/Dev");
    expect(classifyTaskType("Check lead time and expedite the shipment")).toBe("Supply/Logistics");
    expect(classifyTaskType("Schedule the quarterly business review")).toBe("Commercial");
  });

  it("falls back to Admin/Other when nothing matches", () => {
    expect(classifyTaskType("Update my notes")).toBe("Admin/Other");
  });

  it("respects precedence (PCN before Quality)", () => {
    // Mentions both 'change notice' (PCN) and 'quality'; PCN wins by order.
    expect(classifyTaskType("Quality review of the change notice")).toBe("PCN");
  });
});
