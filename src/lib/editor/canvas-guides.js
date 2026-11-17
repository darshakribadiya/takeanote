/*
 * Alignment guides while dragging on the canvas.
 *
 * The box being dragged (all moving items together) snaps when one of its
 * edges or its centre comes within `threshold` of an edge or centre of
 * another item, and a guide line is drawn along the match.
 *
 * Boxes are { x, y, w, h } in flow coordinates. Returns the offset to
 * add ({ dx, dy }) and the guide lines to draw:
 *   { axis: "x", at, from, to }  a vertical line at x = at, from y to y
 *   { axis: "y", at, from, to }  a horizontal line at y = at
 * Example: moving { x: 103, y: 0, w: 50, h: 20 } next to { x: 100, y: 200, w: 80, h: 20 }
 *   -> { dx: -3, dy: 0, guides: [{ axis: "x", at: 100, from: 0, to: 220 }] }
 */
export function snapToGuides(moving, others, threshold) {
  const best = { x: null, y: null };

  for (const other of others) {
    for (const axis of ["x", "y"]) {
      const size = axis === "x" ? "w" : "h";
      const mine = [moving[axis], moving[axis] + moving[size] / 2, moving[axis] + moving[size]];
      const theirs = [other[axis], other[axis] + other[size] / 2, other[axis] + other[size]];
      for (const a of mine) {
        for (const b of theirs) {
          const distance = Math.abs(b - a);
          if (distance > threshold) continue;
          const current = best[axis];
          if (!current || distance < current.distance - 0.01) {
            best[axis] = { distance, delta: b - a, at: b, boxes: [other] };
          } else if (Math.abs(distance - current.distance) <= 0.01 && Math.abs(b - current.at) <= 0.01) {
            current.boxes.push(other);
          }
        }
      }
    }
  }

  const dx = best.x?.delta ?? 0;
  const dy = best.y?.delta ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides = [];
  for (const axis of ["x", "y"]) {
    const match = best[axis];
    if (!match) continue;
    // The line spans the dragged box and every box it lines up with.
    const cross = axis === "x" ? "y" : "x";
    const crossSize = axis === "x" ? "h" : "w";
    const boxes = [snapped, ...match.boxes];
    guides.push({
      axis,
      at: match.at,
      from: Math.min(...boxes.map((box) => box[cross])),
      to: Math.max(...boxes.map((box) => box[cross] + box[crossSize])),
    });
  }
  return { dx, dy, guides };
}

// Bounding box of several boxes. Example: two 10×10 boxes at 0,0 and 20,0 -> { x: 0, y: 0, w: 30, h: 10 }
export function boundsOf(boxes) {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
