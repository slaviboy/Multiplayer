// Helper for drawing larger levels without hand-counting columns.
// Coordinates are (column, row), inclusive, row 0 at the top.
//
//   const g = grid(64, 20).border();
//   g.box(12, 14, 17, 18);          // solid block
//   g.box(18, 18, 34, 18, '^');     // a strip of thorns
//   g.put(13, 13, '1');             // a marker
//   export default { map: g.rows(), ... }
export function grid(width, height, fill = '.') {
  const cells = Array.from({ length: height }, () => Array(width).fill(fill));
  const api = {
    box(c0, r0, c1, r1, ch = '#') {
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
        for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
          if (r < 0 || r >= height || c < 0 || c >= width) throw new Error(`box outside the map at ${c},${r}`);
          cells[r][c] = ch;
        }
      return api;
    },
    put(c, r, text) {
      [...text].forEach((ch, i) => {
        if (r < 0 || r >= height || c + i < 0 || c + i >= width) throw new Error(`put outside the map at ${c + i},${r}`);
        cells[r][c + i] = ch;
      });
      return api;
    },
    border(ch = '#') {
      return api.box(0, 0, width - 1, 0, ch).box(0, height - 1, width - 1, height - 1, ch).box(0, 0, 0, height - 1, ch).box(width - 1, 0, width - 1, height - 1, ch);
    },
    rows() {
      return cells.map((r) => r.join(''));
    },
  };
  return api;
}
