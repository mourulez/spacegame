/**
 * Tileable fractal value noise on a size x size grid, values in [0, 1].
 * Seeded, so generated textures look the same on every load.
 */
export function fractalNoise(size: number, seed: number, octaves = 5, baseCells = 4): Float32Array {
  const random = mulberry32(seed);
  const lattices = Array.from({ length: octaves }, (_, o) => {
    const cells = baseCells << o;
    return Float32Array.from({ length: cells * cells }, random);
  });

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      let amp = 0.5;
      let total = 0;
      for (let o = 0; o < octaves; o++) {
        const cells = baseCells << o;
        n += amp * periodicNoise(lattices[o], cells, (x / size) * cells, (y / size) * cells);
        total += amp;
        amp *= 0.5;
      }
      out[y * size + x] = n / total;
    }
  }
  return out;
}

/** Smoothly interpolated value noise on a lattice that wraps every `cells` cells. */
function periodicNoise(lattice: Float32Array, cells: number, fx: number, fy: number): number {
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const x0 = ix % cells;
  const y0 = iy % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const a = lattice[y0 * cells + x0];
  const b = lattice[y0 * cells + x1];
  const c = lattice[y1 * cells + x0];
  const d = lattice[y1 * cells + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** Small seeded PRNG. */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
