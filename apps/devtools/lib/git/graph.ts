/**
 * Lane assignment for the history graph: commits newest first, each with
 * its parents, become rows with a lane (a column) and the edges to draw
 * from this row to the next. A simple algorithm: open lanes hold the hash
 * they wait for; a commit takes the first lane waiting for it (or a new
 * one), its first parent inherits the lane, other parents get the lane
 * already waiting for them or a new one, and lanes that waited for the
 * same commit (several children) close into its lane.
 */

export type GraphEdge = {
  /** The lane the edge leaves from, on this row. */
  from: number;
  /** The lane it arrives at, on the next row. */
  to: number;
  /** The lane whose colour the edge takes. */
  color: number;
};

export type GraphRow = {
  hash: string;
  lane: number;
  /** The colour index of the commit's lane. */
  color: number;
  edges: GraphEdge[];
  /** Lanes open before this row; sizes the SVG. */
  width: number;
  /** More than one parent. */
  merge: boolean;
};

type Lane = { hash: string; color: number };

/** Rows in the commits' order, with lanes and the edges to the next row. */
export function assignLanes(commits: { hash: string; parents: string[] }[]): GraphRow[] {
  const rows: GraphRow[] = [];
  let lanes: (Lane | undefined)[] = [];
  let nextColor = 0;
  const shrink = () => {
    while (lanes.length && lanes[lanes.length - 1] === undefined) lanes.pop();
  };
  for (const c of commits) {
    const before = [...lanes];
    // The commit's lane: the first one waiting for it.
    let lane = before.findIndex((l) => l?.hash === c.hash);
    let color: number;
    if (lane === -1) {
      lane = before.findIndex((l) => l === undefined);
      if (lane === -1) lane = before.length;
      color = nextColor++;
    } else {
      color = before[lane]!.color;
    }
    const edges: GraphEdge[] = [];
    const after: (Lane | undefined)[] = [...before];
    while (after.length <= lane) after.push(undefined);
    /** Lanes this row redirected, so they get no straight edge. */
    const moved = new Set<number>();
    // Lanes that waited for this commit from other children close into it.
    for (let i = 0; i < before.length; i++) {
      if (i !== lane && before[i]?.hash === c.hash) {
        edges.push({ from: i, to: lane, color: before[i]!.color });
        after[i] = undefined;
        moved.add(i);
      }
    }
    // Parents: the first inherits the lane, the rest join a waiting lane or open one.
    const [first, ...others] = c.parents;
    if (first) {
      const waiting = after.findIndex((l, i) => i !== lane && l?.hash === first);
      if (waiting === -1) {
        after[lane] = { hash: first, color };
        edges.push({ from: lane, to: lane, color });
      } else if (waiting < lane) {
        // The first parent is already expected in a lane to the left: this branch closes into it.
        edges.push({ from: lane, to: waiting, color });
        after[lane] = undefined;
      } else {
        // Expected in a lane to the right: pull that lane into this one, so the mainline stays left.
        edges.push({ from: waiting, to: lane, color: after[waiting]!.color });
        after[waiting] = undefined;
        moved.add(waiting);
        after[lane] = { hash: first, color };
        edges.push({ from: lane, to: lane, color });
      }
    } else {
      after[lane] = undefined;
    }
    for (const p of others) {
      let target = after.findIndex((l) => l?.hash === p);
      let edgeColor: number;
      if (target === -1) {
        target = after.findIndex((l, i) => l === undefined && i > lane);
        if (target === -1) target = after.length;
        edgeColor = nextColor++;
        after[target] = { hash: p, color: edgeColor };
      } else {
        edgeColor = after[target]!.color;
      }
      edges.push({ from: lane, to: target, color: edgeColor });
    }
    // Every other open lane continues straight down.
    for (let i = 0; i < before.length; i++) {
      if (i !== lane && before[i] && !moved.has(i)) edges.push({ from: i, to: i, color: before[i]!.color });
    }
    rows.push({ hash: c.hash, lane, color, edges, width: Math.max(before.length, after.length, lane + 1), merge: c.parents.length > 1 });
    lanes = after;
    shrink();
  }
  return rows;
}

/** The widest row, for the SVG column. */
export function graphWidth(rows: GraphRow[]): number {
  return rows.reduce((w, r) => Math.max(w, r.width, ...r.edges.map((e) => Math.max(e.from, e.to) + 1)), 1);
}
