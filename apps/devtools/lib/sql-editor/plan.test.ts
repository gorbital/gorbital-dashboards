import { describe, expect, it } from "vitest";
import type { PlanRoot } from "../api/sql";
import { costShare, costliest, flattenPlan, nodeConditions, nodeTitle } from "./plan";

const plan: PlanRoot[] = [
  {
    Plan: {
      "Node Type": "Limit",
      "Startup Cost": 21.3,
      "Total Cost": 21.4,
      "Plan Rows": 20,
      Plans: [
        {
          "Node Type": "Sort",
          "Startup Cost": 21.3,
          "Total Cost": 21.6,
          "Plan Rows": 120,
          "Sort Key": ["updated_at DESC"],
          Plans: [
            { "Node Type": "Seq Scan", "Relation Name": "projects", Alias: "p", "Startup Cost": 0, "Total Cost": 15.8, "Plan Rows": 120, Filter: "(status = 'active'::text)" },
            { "Node Type": "Index Scan", "Index Name": "orgs_pkey", "Relation Name": "orgs", Alias: "orgs", "Startup Cost": 0.15, "Total Cost": 2.1, "Plan Rows": 1, "Index Cond": "(id = p.org_id)" },
          ],
        },
      ],
    },
    "Planning Time": 0.1,
  },
];

describe("flattenPlan", () => {
  it("lists every node depth-first with depth, parent and own cost", () => {
    const flat = flattenPlan(plan);
    expect(flat.map((n) => [n.node["Node Type"], n.depth, n.parentId])).toEqual([
      ["Limit", 0, undefined],
      ["Sort", 1, "0"],
      ["Seq Scan", 2, "0.0"],
      ["Index Scan", 2, "0.0"],
    ]);
    const sort = flat[1];
    expect(sort.ownCost).toBeCloseTo(21.6 - 15.8 - 2.1);
    expect(flat[0].ownCost).toBe(0); // a Limit cheaper than its child clamps to 0
    expect(flat[2].ownCost).toBe(15.8);
    expect(flat[2].ownTime).toBeUndefined();
    expect(flat[1].hasChildren).toBe(true);
    expect(flat[2].hasChildren).toBe(false);
  });

  it("uses actual time × loops when analyzed", () => {
    const analyzed: PlanRoot[] = [
      {
        Plan: {
          "Node Type": "Nested Loop",
          "Total Cost": 10,
          "Actual Total Time": 5,
          "Actual Loops": 1,
          Plans: [{ "Node Type": "Index Scan", "Total Cost": 2, "Actual Total Time": 0.5, "Actual Loops": 4 }],
        },
      },
    ];
    const flat = flattenPlan(analyzed);
    expect(flat[1].ownTime).toBe(2); // 0.5 × 4 loops
    expect(flat[0].ownTime).toBe(3); // 5 − 2
  });
});

describe("costliest", () => {
  it("ranks by own cost, skipping nodes that cost nothing", () => {
    const flat = flattenPlan(plan);
    expect([...costliest(flat, 2)]).toEqual(["0.0.0", "0.0"]);
    expect(costliest(flat, 10).has("0")).toBe(false);
  });

  it("ranks by own time once analyzed", () => {
    const flat = flattenPlan([{ Plan: { "Node Type": "A", "Total Cost": 100, "Actual Total Time": 1, Plans: [{ "Node Type": "B", "Total Cost": 1, "Actual Total Time": 0.9 }] } }]);
    expect([...costliest(flat, 1)]).toEqual(["0.0"]);
  });
});

describe("costShare", () => {
  it("is the node's share of the sum of own costs", () => {
    const flat = flattenPlan(plan);
    const total = flat.reduce((s, n) => s + n.ownCost, 0);
    expect(costShare(flat[2], flat)).toBeCloseTo(15.8 / total);
    expect(costShare(flat[0], flat)).toBe(0);
  });
});

describe("nodeTitle and nodeConditions", () => {
  it("describes scans and joins the way EXPLAIN's text form does", () => {
    const flat = flattenPlan(plan);
    expect(nodeTitle(flat[2].node)).toBe("Seq Scan on projects p");
    expect(nodeTitle(flat[3].node)).toBe("Index Scan using orgs_pkey on orgs");
    expect(nodeTitle({ "Node Type": "Hash Join", "Join Type": "Left" })).toBe("Left Hash Join");
    expect(nodeConditions(flat[3].node)).toEqual([{ label: "Index Cond", value: "(id = p.org_id)" }]);
    expect(nodeConditions(flat[1].node)).toEqual([{ label: "Sort Key", value: "updated_at DESC" }]);
  });
});
