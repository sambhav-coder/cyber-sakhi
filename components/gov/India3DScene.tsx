"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { feature as topoFeature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import {
  GOV_CAMERA_PRESETS,
  GOV_GEO3D_EXTRUSION_DEPTH,
  GOV_LABEL_PRIORITY,
  contextFillForCountry,
  displayNameForGeoName,
  projectLonLat,
  resolveLabelCollisions,
  wrapGeoLabel,
  type GovCameraPresetName,
  type GovLabelBox,
} from "@/lib/gov/govGeo3D";
import { GOV_MAP_SHORT_LABELS } from "@/lib/gov/govMapDisplay";

/**
 * Real WebGL 3D India intelligence scene (three.js, no new dependencies).
 *
 * - Every state/UT polygon from the local boundary asset becomes extruded
 *   3D geometry (THREE.ExtrudeGeometry over projected rings) with a cyan
 *   edge glow. No CSS/perspective fakery, no images.
 * - Ocean: navy disc + faint grid + drifting particles + glow ring, kept
 *   subtle so the map stays an operations tool, not a game.
 * - Navigation: full OrbitControls (rotate/zoom/pan/touch, unrestricted
 *   polar angle so top AND bottom views work) plus animated presets.
 * - Interaction is raycast against real meshes: hover brightens + lifts,
 *   click selects (parent owns drill-down meaning). Tooltip data comes
 *   from the parent's authorized aggregates — this scene only reports
 *   which polygon was hit and where on screen.
 * - District plug-in point: pass `districtShapes` (same FeatureCollection
 *   shape) to render a district layer; null renders states. No district
 *   geometry exists yet, so callers pass null and the state layer stays.
 */

export interface SceneGeoFeature {
  type: "Feature";
  properties: { ST_NM: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface SceneGeoCollection {
  type: "FeatureCollection";
  features: SceneGeoFeature[];
}

export interface CameraPresetRequest {
  id: number;
  name: GovCameraPresetName;
}

export interface India3DSceneProps {
  shapes: SceneGeoCollection;
  /** District layer (same shape); null = state layer only. */
  districtShapes?: SceneGeoCollection | null;
  /** Fill color per region name; called when colors change, no rebuild. */
  fills: ReadonlyMap<string, string>;
  /** Bumps whenever `fills` content changes. */
  fillsId: number;
  selected: string | null;
  /** Region name to frame (state drill-down), null = whole India. */
  focusName: string | null;
  preset: CameraPresetRequest | null;
  onHover: (name: string | null, x: number, y: number) => void;
  onSelect: (name: string | null) => void;
}

interface RegionEntry {
  name: string;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  baseColors: THREE.Color[];
  center: THREE.Vector3;
  radius: number;
  label: THREE.Sprite | null;
}

/** Screen-space label record for the collision layout pass. */
interface LabelRecord {
  id: string;
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  /** Canvas text metrics (px). */
  textW: number;
  textH: number;
  worldH: number;
  getPriority: () => number;
  minDist: number;
}

const HERO_DIR = new THREE.Vector3(0.42, 0.55, 0.85).normalize();

function ringToShape(ring: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < ring.length; i += 1) {
    const p = projectLonLat(ring[i][0], ring[i][1]);
    // Shape plane (x, y) maps to world (x, z): use y = -z so that after
    // rotateX(-90°), world z lands correctly (see buildRegion).
    if (i === 0) shape.moveTo(p.x, -p.z);
    else shape.lineTo(p.x, -p.z);
  }
  return shape;
}

export function India3DScene(props: India3DSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<{
    setFills: (fills: ReadonlyMap<string, string>) => void;
    setSelected: (name: string | null) => void;
    setFocus: (name: string | null) => void;
    goPreset: (name: GovCameraPresetName) => void;
    setHoverEnabled: (enabled: boolean) => void;
  } | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;

  // ---- scene lifecycle (built once per shapes identity) ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { shapes, districtShapes } = cbRef.current;
    const layer = districtShapes ?? shapes;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040b16);
    scene.fog = new THREE.Fog(0x040b16, 110, 260);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 14;
    controls.maxDistance = 170;
    controls.maxPolarAngle = Math.PI; // free rotation incl. below-horizon
    controls.target.set(0, 1, 0);

    scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1420, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(30, 55, 25);
    scene.add(sun);
    const rim = new THREE.PointLight(0x22d3ee, 900, 200, 1.8);
    rim.position.set(-35, 12, -35);
    scene.add(rim);

    // Shared text-sprite factory + label registry. Declared before the
    // country/sea/state blocks that push records into it.
    const labelRecords: LabelRecord[] = [];
    let prevVisibleLabels = new Set<string>();

    const measureCtx = document.createElement("canvas").getContext("2d");

    interface TextStyle {
      fontPx: number;
      weight: number;
      fill: string;
      halo: string;
      opacity: number;
    }
    const STATE_STYLE: TextStyle = {
      fontPx: 44,
      weight: 600,
      fill: "rgba(232,238,248,0.97)",
      halo: "rgba(2,8,18,0.92)",
      opacity: 1,
    };
    const COUNTRY_STYLE: TextStyle = {
      fontPx: 34,
      weight: 500,
      fill: "rgba(168,198,218,0.92)",
      halo: "rgba(2,8,18,0.85)",
      opacity: 0.95,
    };

    const makeTextSprite = (
      lines: string[],
      style: TextStyle,
      worldW: number,
    ): { sprite: THREE.Sprite; textW: number; textH: number; worldH: number } => {
      const lineH = style.fontPx * 1.22;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = Math.ceil(lines.length * lineH + 28);
      const ctx = canvas.getContext("2d");
      let textW = 1;
      if (ctx) {
        ctx.font = `${style.weight} ${style.fontPx}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        textW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
        const cy = canvas.height / 2;
        ctx.lineWidth = 8;
        ctx.strokeStyle = style.halo;
        lines.forEach((line, i) => {
          const y = cy + (i - (lines.length - 1) / 2) * lineH;
          ctx.strokeText(line, 256, y);
        });
        ctx.fillStyle = style.fill;
        lines.forEach((line, i) => {
          const y = cy + (i - (lines.length - 1) / 2) * lineH;
          ctx.fillText(line, 256, y);
        });
      }
      const textH = lines.length * lineH;
      const tex = new THREE.CanvasTexture(canvas);
      tex.anisotropy = 4;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: style.opacity, depthTest: false }),
      );
      const worldH = (worldW * canvas.height) / canvas.width;
      sprite.scale.set(worldW, worldH, 1);
      sprite.renderOrder = 10;
      return { sprite, textW, textH, worldH };
    };

    const measureState = (line: string): number => {
      if (!measureCtx) return line.length * 24;
      measureCtx.font = "600 44px Inter, system-ui, sans-serif";
      return measureCtx.measureText(line).width;
    };

    // Geographic basemap: layered-blue ocean, lat/lon graticule, and
    // subdued neighboring landmasses (real Natural Earth geometry via the
    // world-atlas dependency — never fabricated). India stays the only
    // extruded, interactive, data-driven layer.
    const makeOceanTexture = (): THREE.CanvasTexture => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const g = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
        g.addColorStop(0, "#11405e"); // medium blue around the subcontinent
        g.addColorStop(0.55, "#0a2236");
        g.addColorStop(1, "#040b16"); // deep navy at distance
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 512);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const ocean = new THREE.Mesh(
      new THREE.CircleGeometry(95, 72),
      new THREE.MeshStandardMaterial({ map: makeOceanTexture(), roughness: 0.9, metalness: 0 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.6;
    scene.add(ocean);

    // Faint lat/lon graticule: cartographic context, not decoration.
    {
      const pts: number[] = [];
      const push = (lon: number, lat: number) => {
        const p = projectLonLat(lon, lat);
        pts.push(p.x, -0.5, p.z);
      };
      for (let lon = 50; lon <= 105; lon += 5) {
        for (let lat = -10; lat < 45; lat += 2) {
          push(lon, lat);
          push(lon, lat + 2);
        }
      }
      for (let lat = -10; lat <= 45; lat += 5) {
        for (let lon = 50; lon < 105; lon += 2) {
          push(lon, lat);
          push(lon + 2, lat);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const grat = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: 0x155e75, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      scene.add(grat);
    }

    // Neighboring countries: flat, dark, non-interactive context layer.
    // Included iff the country's real bbox intersects the regional view;
    // India itself is excluded (it owns the 3D data layer above).
    {
      const collection = topoFeature(
        worldAtlas as never,
        (worldAtlas as unknown as { objects: { countries: unknown } }).objects.countries as never,
      ) as unknown as {
        features: Array<{
          properties: { name: string };
          geometry: { type: string; coordinates: unknown };
        }>;
      };
      const inView = (coords: unknown): boolean => {
        if (typeof coords === "number") return false;
        if (Array.isArray(coords) && typeof coords[0] === "number") {
          const [lon, lat] = coords as unknown as [number, number];
          return lon >= 48 && lon <= 108 && lat >= -8 && lat <= 44;
        }
        return (coords as unknown[]).some(inView);
      };
      const toShape = (poly: number[][][]): THREE.Shape | null => {
        if (!poly.length || poly[0].length < 4) return null;
        const s = new THREE.Shape();
        poly[0].forEach(([lon, lat], i) => {
          const p = projectLonLat(lon, lat);
          if (i === 0) s.moveTo(p.x, -p.z);
          else s.lineTo(p.x, -p.z);
        });
        return s;
      };
      for (const country of collection.features) {
        const name = country.properties?.name;
        if (!country.geometry || name === "India" || !inView(country.geometry.coordinates)) continue;
        const polys =
          country.geometry.type === "MultiPolygon"
            ? (country.geometry.coordinates as number[][][][])
            : [(country.geometry.coordinates as number[][][])];
        const countryBox = new THREE.Box3();
        const countryFill = contextFillForCountry(name);
        for (const poly of polys) {
          const s = toShape(poly);
          if (!s) continue;
          const geo = new THREE.ShapeGeometry(s);
          geo.rotateX(-Math.PI / 2);
          const land = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color: new THREE.Color(countryFill), roughness: 1, metalness: 0 }),
          );
          land.position.y = -0.3;
          scene.add(land);
          countryBox.expandByObject(land);
          const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo, 20),
            new THREE.LineBasicMaterial({ color: 0x1e4a5f, transparent: true, opacity: 0.55, depthWrite: false }),
          );
          edge.position.y = -0.3;
          scene.add(edge);
        }
        if (countryBox.isEmpty()) continue;
        // Country label at the rendered landmass center: muted, subordinate
        // to state labels, hidden in favor of higher-priority labels.
        const c = countryBox.getCenter(new THREE.Vector3());
        const t = makeTextSprite([name], COUNTRY_STYLE, 9);
        t.sprite.position.set(c.x, 1.1, c.z);
        scene.add(t.sprite);
        labelRecords.push({
          id: `country:${name}`,
          sprite: t.sprite,
          pos: t.sprite.position.clone(),
          textW: t.textW,
          textH: t.textH,
          worldH: t.worldH,
          getPriority: () => GOV_LABEL_PRIORITY.country,
          minDist: 150,
        });
      }
    }

    // Sea-region labels: real names at mid-region positions (cartographic
    // labels, not boundaries — oceans get no fabricated borders).
    const makeSeaLabel = (text: string, lon: number, lat: number): void => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = "500 40px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        try {
          (ctx as unknown as { letterSpacing: string }).letterSpacing = "10px";
        } catch {
          /* letterSpacing unsupported — plain text still renders */
        }
        ctx.fillStyle = "rgba(148,197,255,0.6)";
        ctx.fillText(text, 256, 48);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
      );
      const p = projectLonLat(lon, lat);
      sprite.position.set(p.x, 0.4, p.z);
      const worldH = (13 * 96) / 512;
      sprite.scale.set(13, worldH, 1);
      scene.add(sprite);
      labelRecords.push({
        id: `sea:${text}`,
        sprite,
        pos: sprite.position.clone(),
        textW: 512,
        textH: 96,
        worldH,
        getPriority: () => GOV_LABEL_PRIORITY.sea,
        minDist: Infinity,
      });
    };
    makeSeaLabel("ARABIAN SEA", 63.5, 15);
    makeSeaLabel("BAY OF BENGAL", 89.5, 13.5);
    makeSeaLabel("INDIAN OCEAN", 74, 0.5);

    // State regions: extruded meshes + cyan edge lines + sprite labels.
    const world = new THREE.Group();
    scene.add(world);
    const entries = new Map<string, RegionEntry>();
    const pickables: THREE.Object3D[] = [];

    for (const feature of layer.features) {
      const name = feature.properties.ST_NM;
      const group = new THREE.Group();
      const materials: THREE.MeshStandardMaterial[] = [];
      const baseColors: THREE.Color[] = [];
      const polys =
        feature.geometry.type === "MultiPolygon"
          ? (feature.geometry.coordinates as number[][][][])
          : [(feature.geometry.coordinates as number[][][])];
      const bbox = new THREE.Box3();
      const outerShapes: THREE.Shape[] = [];
      for (const poly of polys) {
        if (!poly.length || poly[0].length < 4) continue;
        const shape = ringToShape(poly[0]);
        outerShapes.push(shape);
        for (let h = 1; h < poly.length; h += 1) {
          if (poly[h].length >= 4) shape.holes.push(new THREE.Path(ringToShape(poly[h]).getPoints()));
        }
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: GOV_GEO3D_EXTRUSION_DEPTH,
          bevelEnabled: true,
          bevelThickness: 0.07,
          bevelSize: 0.05,
          bevelSegments: 1,
        });
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          roughness: 0.5,
          metalness: 0.3,
          emissive: 0x000000,
          emissiveIntensity: 1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 0.35;
        mesh.userData.geoName = name;
        group.add(mesh);
        pickables.push(mesh);
        materials.push(mat);
        baseColors.push(mat.color.clone());
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 28),
          new THREE.LineBasicMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        edges.position.y = 0.35;
        group.add(edges);
        bbox.expandByObject(mesh);
      }
      if (!materials.length) continue;
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.z) / 2;
      // Coastal glow: slightly enlarged flat silhouettes beneath the states
      // give cyan coastline separation against the ocean (purely visual).
      for (const outer of outerShapes) {
        const glowGeo = new THREE.ShapeGeometry(outer);
        glowGeo.rotateX(-Math.PI / 2);
        const glow = new THREE.Mesh(
          glowGeo,
          new THREE.MeshBasicMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        glow.scale.set(1.04, 1, 1.04);
        glow.position.set(center.x * -0.04, 0.02, center.z * -0.04);
        group.add(glow);
      }
      const areaUnits = Math.max(0.01, size.x * size.z);
      const fullName = displayNameForGeoName(name);
      let label: THREE.Sprite | null = null;
      // Tiered label strategy: full (wrapped to 2 lines when wide) for
      // large regions, short labels for small ones, marker + callout for
      // tiny territories. Full names always survive in tooltip/aria text.
      if (areaUnits < 1.2) {
        // Tiny UT: glow marker keeps it discoverable/hoverable; a short
        // callout sits just above so the name never covers the geometry.
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x67e8f9 }),
        );
        marker.position.set(center.x, 1.4, center.z);
        marker.userData.geoName = name;
        group.add(marker);
        pickables.push(marker);
        const short = GOV_MAP_SHORT_LABELS[name] ?? fullName;
        const t = makeTextSprite([short], STATE_STYLE, 6);
        t.sprite.position.set(center.x, 3.6, center.z);
        group.add(t.sprite);
        labelRecords.push({
          id: `state:${name}`,
          sprite: t.sprite,
          pos: t.sprite.position.clone(),
          textW: t.textW,
          textH: t.textH,
          worldH: t.worldH,
          getPriority: () =>
            selectedName === name ? GOV_LABEL_PRIORITY.selectedState : GOV_LABEL_PRIORITY.smallState,
          minDist: 85,
        });
      } else {
        let lines: string[];
        let worldW: number;
        let priority: number;
        let minDist: number;
        if (areaUnits >= 14) {
          lines = wrapGeoLabel(fullName, measureState, 430);
          worldW = 11;
          priority = GOV_LABEL_PRIORITY.largeState;
          minDist = Infinity;
        } else if (areaUnits >= 4) {
          lines = wrapGeoLabel(fullName, measureState, 430);
          worldW = 8;
          priority = GOV_LABEL_PRIORITY.mediumState;
          minDist = 95;
        } else {
          const short = GOV_MAP_SHORT_LABELS[name] ?? fullName;
          lines = [short];
          worldW = 6.5;
          priority = GOV_LABEL_PRIORITY.smallState;
          minDist = 62;
        }
        const t = makeTextSprite(lines, STATE_STYLE, worldW);
        t.sprite.position.set(center.x, GOV_GEO3D_EXTRUSION_DEPTH + 1.9, center.z);
        group.add(t.sprite);
        label = t.sprite;
        const fixedPriority = priority;
        labelRecords.push({
          id: `state:${name}`,
          sprite: t.sprite,
          pos: t.sprite.position.clone(),
          textW: t.textW,
          textH: t.textH,
          worldH: t.worldH,
          getPriority: () =>
            selectedName === name ? GOV_LABEL_PRIORITY.selectedState : fixedPriority,
          minDist,
        });
      }
      world.add(group);
      entries.set(name, { name, group, materials, baseColors, center, radius, label });
    }

    // Initial hero framing: tight premium-visualization fit so India
    // dominates the viewport while keeping J&K, the northeast, the
    // southern tip, and island territories visible.
    const worldBox = new THREE.Box3().setFromObject(world);
    const worldSphere = worldBox.getBoundingSphere(new THREE.Sphere());
    const fitDist = (worldSphere.radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.02;
    camera.position.copy(worldSphere.center).addScaledVector(HERO_DIR, fitDist);
    camera.lookAt(worldSphere.center);
    controls.target.copy(worldSphere.center);

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let hovered: string | null = null;
    let hoverEnabled = true;
    let downPos: { x: number; y: number } | null = null;
    let rafHover = false;
    let lastClient = { x: 0, y: 0 };

    const setEmissive = (entry: RegionEntry, color: number, intensity: number) => {
      for (const m of entry.materials) {
        m.emissive.setHex(color);
        m.emissiveIntensity = intensity;
      }
    };
    const applyHoverVisual = (name: string | null) => {
      if (hovered && entries.has(hovered) && hovered !== apiSelected()) {
        const e = entries.get(hovered)!;
        setEmissive(e, 0x000000, 1);
        e.group.position.y = 0;
      }
      hovered = name;
      if (name && entries.has(name) && name !== apiSelected()) {
        const e = entries.get(name)!;
        setEmissive(e, 0x0e7490, 0.85);
        e.group.position.y = 0.28;
      }
    };
    let selectedName: string | null = cbRef.current.selected;
    let currentFills: ReadonlyMap<string, string> = cbRef.current.fills;
    const apiSelected = () => selectedName;

    // Single paint path: fills + selection dimming recomputed from scratch
    // so repeated hover/select/fill updates can never stack darkening.
    const repaint = () => {
      for (const [name, entry] of entries) {
        const hex = currentFills.get(name) ?? "#475569";
        const c = new THREE.Color(hex);
        if (selectedName !== null && name !== selectedName) c.multiplyScalar(0.32);
        entry.materials.forEach((m, i) => {
          m.color.copy(c);
          entry.baseColors[i].copy(c);
        });
        if (name === selectedName) setEmissive(entry, 0x854d0e, 0.35);
        else if (name !== hovered) setEmissive(entry, 0x000000, 1);
      }
    };

    const api = {
      setFills: (fills: ReadonlyMap<string, string>) => {
        currentFills = fills;
        repaint();
      },
      setSelected: (name: string | null) => {
        selectedName = name;
        repaint();
      },
      setFocus: (name: string | null) => {
        const target = name && entries.has(name) ? entries.get(name)! : null;
        const center = target ? target.center : worldSphere.center;
        const dist = target
          ? Math.min(90, Math.max(26, target.radius * 4.2))
          : fitDist;
        flyTo(center, HERO_DIR, dist);
      },
      goPreset: (name: GovCameraPresetName) => {
        if (name === "RESET") {
          const focus = cbRef.current.focusName;
          api.setFocus(focus);
          return;
        }
        const dir = new THREE.Vector3(
          GOV_CAMERA_PRESETS[name].x,
          GOV_CAMERA_PRESETS[name].y,
          GOV_CAMERA_PRESETS[name].z,
        ).normalize();
        const focus = cbRef.current.focusName;
        const target = focus && entries.has(focus) ? entries.get(focus)! : null;
        const center = target ? target.center : worldSphere.center;
        const dist = target ? Math.min(90, Math.max(26, target.radius * 4.2)) : fitDist;
        flyTo(center, dir, dist);
      },
      setHoverEnabled: (enabled: boolean) => {
        hoverEnabled = enabled;
      },
    };
    apiRef.current = api;
    api.setFills(cbRef.current.fills);
    api.setSelected(cbRef.current.selected);

    // Camera flight animation state.
    let flight: { t: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null = null;
    const flyTo = (center: THREE.Vector3, dir: THREE.Vector3, dist: number) => {
      flight = {
        t: 0,
        fromP: camera.position.clone(),
        toP: center.clone().addScaledVector(dir, dist),
        fromT: controls.target.clone(),
        toT: center.clone(),
      };
    };

    const reportHover = () => {
      rafHover = false;
      if (!hoverEnabled) return;
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      const name = hits.length ? (hits[0].object.userData.geoName as string) : null;
      if (name !== hovered) applyHoverVisual(name);
      const rect = renderer.domElement.getBoundingClientRect();
      cbRef.current.onHover(name, lastClient.x - rect.left, lastClient.y - rect.top);
      renderer.domElement.style.cursor = name ? "pointer" : "grab";
    };

    const onMove = (e: PointerEvent) => {
      lastClient = { x: e.clientX, y: e.clientY };
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (!rafHover) {
        rafHover = true;
        requestAnimationFrame(reportHover);
      }
    };
    const onDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return; // was a drag, not a click
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(pickables, false);
      const name = hits.length ? (hits[0].object.userData.geoName as string) : null;
      cbRef.current.onSelect(name);
    };
    const onKey = (e: KeyboardEvent) => {
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      if (e.key === "ArrowLeft") sph.theta -= 0.15;
      else if (e.key === "ArrowRight") sph.theta += 0.15;
      else if (e.key === "ArrowUp") sph.phi = Math.max(0.05, sph.phi - 0.1);
      else if (e.key === "ArrowDown") sph.phi = Math.min(Math.PI - 0.05, sph.phi + 0.1);
      else if (e.key === "+" || e.key === "=") sph.radius = Math.max(14, sph.radius * 0.85);
      else if (e.key === "-" || e.key === "_") sph.radius = Math.min(170, sph.radius * 1.18);
      else if (e.key === "Escape") {
        cbRef.current.onSelect(null);
        return;
      } else return;
      e.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    };

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "application");
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D India map. Arrow keys rotate, plus and minus zoom, Escape clears selection.",
    );
    renderer.domElement.addEventListener("keydown", onKey);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const layoutProbe = new THREE.Vector3();
    // Animation state
    const clock = new THREE.Clock();
    let frame = 0;
    let raf: number | null = null;
    // Screen-space label layout: distance-gate, project to px, then the
    // pure collision solver (with stickiness) decides visibility. Runs on
    // a frame stride so camera motion stays smooth and labels don't flicker.
    const layoutLabels = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const boxes: GovLabelBox[] = [];
      const candidates: LabelRecord[] = [];
      for (const r of labelRecords) {
        const dist = camera.position.distanceTo(r.pos);
        if (dist > r.minDist) {
          r.sprite.visible = false;
          continue;
        }
        layoutProbe.copy(r.pos).project(camera);
        if (layoutProbe.z > 1) {
          r.sprite.visible = false;
          continue;
        }
        const x = (layoutProbe.x * 0.5 + 0.5) * w;
        const y = (-layoutProbe.y * 0.5 + 0.5) * h;
        if (x < -100 || x > w + 100 || y < -50 || y > h + 50) {
          r.sprite.visible = false;
          continue;
        }
        const pxPerWorld = h / (2 * dist * halfFovTan);
        const hp = Math.max(4, r.worldH * pxPerWorld);
        const wp = hp * (r.textW / Math.max(1, r.textH));
        boxes.push({ id: r.id, x, y, w: wp, h: hp, priority: r.getPriority() });
        candidates.push(r);
      }
      const visible = resolveLabelCollisions(boxes, prevVisibleLabels);
      prevVisibleLabels = visible;
      for (const r of candidates) r.sprite.visible = visible.has(r.id);
    };
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      frame += 1;
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / 0.9);
        const e = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
        camera.position.lerpVectors(flight.fromP, flight.toP, e);
        controls.target.lerpVectors(flight.fromT, flight.toT, e);
        if (flight.t >= 1) flight = null;
      }
      controls.update();
      // Collision layout on a frame stride: smooth motion, no flicker.
      if (frame % 15 === 0) layoutLabels();
      renderer.render(scene, camera);
    };
    layoutLabels();
    animate();

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("keydown", onKey);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => disposeMaterial(m));
        else if (mat) disposeMaterial(mat);
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.shapes, props.districtShapes]);

  // ---- prop bridges (no geometry rebuild) ----
  useEffect(() => {
    apiRef.current?.setFills(props.fills);
  }, [props.fills, props.fillsId]);
  useEffect(() => {
    apiRef.current?.setSelected(props.selected);
  }, [props.selected]);
  useEffect(() => {
    apiRef.current?.setFocus(props.focusName);
  }, [props.focusName]);
  useEffect(() => {
    if (props.preset) apiRef.current?.goPreset(props.preset.name);
  }, [props.preset]);

  return <div ref={hostRef} className="h-full w-full" />;
}

function disposeMaterial(m: THREE.Material): void {
  const withMap = m as THREE.Material & { map?: THREE.Texture | null };
  if (withMap.map) withMap.map.dispose();
  m.dispose();
}
