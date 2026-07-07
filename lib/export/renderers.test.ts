import { describe, expect, it } from "vitest";
import {
  renderAccountNote,
  renderTaskLine,
  renderCommandCenterTasksFile,
  applyDoneStates,
  CC_TASKS_PATH,
} from "./renderers";
import { parseAccount } from "@/lib/vault/accounts";
import { parseTasks } from "@/lib/vault/tasks";
import type { Account, Task } from "@/lib/vault/types";

const account: Account = {
  slug: "acme-medical",
  name: "Acme Medical",
  path: "300 Merit/Customers/Acme Medical.md",
  workstream: "merit",
  type: "OEM Account",
  region: "West",
  stage: "Active",
  status: "Customer",
  accountNumber: "AC-1001",
  overview: "Key OEM account. Catheter shafts and hubs.",
  situations: ["PCN response due", "2026 pricing refresh"],
  contacts: [
    { name: "Zoya Patel", title: "Quality Manager", email: "zoya@acme.com" },
    { name: "Mike Chen" },
  ],
  links: ["Acme Quality Plan"],
};

const dbTask: Task = {
  done: false,
  title: "Send updated validation memo",
  fields: {},
  description: "",
  notes: "",
  customer: { target: "Acme Medical", basename: "Acme Medical", display: "Acme Medical" },
  due: "2026-07-15",
  priority: "high",
  created: "2026-07-07",
  sourceFile: "db:tasks",
  sourceLine: 12,
};

describe("renderAccountNote round-trip", () => {
  it("parses back to the same account fields", () => {
    const md = renderAccountNote(account);
    const parsed = parseAccount(md, account.path);
    expect(parsed.name).toBe(account.name);
    expect(parsed.slug).toBe(account.slug);
    expect(parsed.type).toBe(account.type);
    expect(parsed.region).toBe(account.region);
    expect(parsed.stage).toBe(account.stage);
    expect(parsed.status).toBe(account.status);
    expect(parsed.accountNumber).toBe(account.accountNumber);
    expect(parsed.overview).toBe(account.overview);
    expect(parsed.situations).toEqual(account.situations);
    expect(parsed.links).toEqual(account.links);
    expect(parsed.contacts.map((c) => c.name)).toEqual(["Zoya Patel", "Mike Chen"]);
    expect(parsed.contacts[0].email).toBe("zoya@acme.com");
    expect(parsed.contacts[0].title).toBe("Quality Manager");
  });
});

describe("task rendering round-trip", () => {
  it("renders a docs/02 task line parseTasks reads back", () => {
    const file = renderCommandCenterTasksFile([
      dbTask,
      { ...dbTask, title: "Closed one", done: true, completed: "2026-07-01", due: undefined },
    ]);
    const parsed = parseTasks(file, CC_TASKS_PATH);
    expect(parsed).toHaveLength(2);
    const open = parsed.find((t) => !t.done)!;
    expect(open.title).toBe(dbTask.title);
    expect(open.due).toBe("2026-07-15");
    expect(open.priority).toBe("high");
    expect(open.customer && open.customer !== "internal" ? open.customer.basename : null)
      .toBe("Acme Medical");
    const done = parsed.find((t) => t.done)!;
    expect(done.completed).toBe("2026-07-01");
  });

  it("renderTaskLine omits empty fields", () => {
    const line = renderTaskLine({ ...dbTask, due: undefined, priority: undefined, customer: undefined, created: undefined });
    expect(line).toBe("- [ ] Send updated validation memo");
  });
});

describe("applyDoneStates", () => {
  const file = [
    "# Tasks",
    "- [ ] Alpha [due:: 2026-07-10]",
    "- [x] Beta [completed:: 2026-07-01]",
    "not a task line",
  ].join("\n");

  it("flips states and stamps completed", () => {
    const next = applyDoneStates(file, [
      { sourceLine: 1, done: true, completed: "2026-07-07" },
      { sourceLine: 2, done: false },
    ]);
    expect(next).toContain("- [x] Alpha [due:: 2026-07-10] [completed:: 2026-07-07]");
    expect(next).toContain("- [ ] Beta");
    expect(next).not.toContain("Beta [completed::");
  });

  it("returns null when nothing changes and skips moved lines", () => {
    expect(applyDoneStates(file, [{ sourceLine: 1, done: false }])).toBeNull();
    expect(applyDoneStates(file, [{ sourceLine: 3, done: true, completed: "2026-07-07" }])).toBeNull();
  });
});
