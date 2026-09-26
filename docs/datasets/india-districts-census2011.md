# India district boundaries, Census 2011 — geographic staging notes

- Source: DataMeet maps repository, `Districts/Census_2011` (ESRI Shapefile set).
  URLs: https://github.com/datameet/maps/tree/master/Districts/Census_2011
  (raw: `https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/2011_Dist.{shp,shx,dbf,prj}`)
- License: **CC BY 4.0** (repository default; attribution in `public/geo/ATTRIBUTION.txt`).
- This is **boundary geometry only** — it carries zero case data. Case counts always come
  from scoped Cyber-Sakhi aggregates joined at render time.

## Reproduce (repeatable)

```powershell
pip install pyshp
$base = "https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/2011_Dist"
foreach ($ext in @("shp","shx","dbf","prj")) { Invoke-WebRequest -Uri "$base.$ext" -OutFile "<tmp>/2011_Dist.$ext" }
python3 -c "import shapefile; r = shapefile.Reader('<tmp>/2011_Dist'); print(len(r.shapes()), r.fields[1:])"
# expect: 641 shapes, fields DISTRICT/ST_NM/ST_CEN_CD/DT_CEN_CD/censuscode, type POLYGON
```

Conversion (documented, reviewable): parse with pyshp → keep properties verbatim →
round coordinates to 4 decimals → Douglas–Peucker at 0.004° (~440 m) →
write `public/geo/india-districts-census2011.geojson`.

## Verified 2026-09-25

- 641/641 features converted, 548 Polygon + 93 MultiPolygon, 0 empty geometries.
- 636,353 → 113,828 vertices; 12.69 MB → 2.36 MB.
- 35/36 state names join exactly to the state file; Maharashtra: 35 districts.
- BBox 68.19,6.76 → 97.42,37.08 (India, WGS84).

## Limitations (shown in-panel where relevant)

- Census 2011 vintage: no Telangana districts; J&K pre-bifurcation; some
  pre-delimitation northeastern boundaries; documented shifts.
- Display simplification (~440 m tolerance): shapes are approximate; the map is a
  case-volume choropleth, never evidence of exact location.
