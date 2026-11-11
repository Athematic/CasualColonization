# North-east map generator

The scripts that produced `packages/engine/src/maps/north-east.ts` (Beta 3, step 8). Kept so the map can be regenerated or extended; they are not part of the build.

- `landfrac.py` samples land and lake fractions per tile from Natural Earth 1:10m data (`frac.npy`, `lakefrac.npy`).
- `gen.py` turns them into terrain, with the hand corrections and the islands in `islands.json`.
- `regions.py` draws the land-health regions; `patch1.py`, `patch2.py` and `patch12.py` are the hand corrections applied in order.
- `emit.py` writes the TypeScript map file (`header.ts` is its header); `check.py`, `cmp.py` and `probe.py` check the result.

The Natural Earth files (public domain, <https://www.naturalearthdata.com/>) are not committed: download `ne_10m_land`, `ne_10m_lakes`, `ne_10m_lakes_north_america`, `ne_10m_minor_islands` and the `ne_10m_geography_*` layers as GeoJSON next to the scripts. The scripts read and write their files in this folder.
