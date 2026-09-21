// CAM Types

export type ToolType = "flat" | "vbit" | "ball" | "drill";

export interface Tool {
  type: ToolType;
  diameter: number;       // mm
  angle: number;          // degrees (for vbit: included angle; for ball: ignored)
  fluteCount: number;
  name: string;
}

export interface CamParams {
  // Stock
  stockThickness: number;       // mm
  stockOffsetZ: number;         // top of stock Z (usually 0)

  // Tool
  tool: Tool;

  // Operation strategy
  strategy: "contour" | "pocket" | "vcarve" | "outline" | "centerline";
  contourSide: "outside" | "inside" | "both"; // for contour/outside/inside
  cutDirection: "climb" | "conventional";

  // Depth
  totalDepth: number;           // mm
  stepDown: number;             // mm per pass
  rampAngle: number;            // degrees for ramp entry (0 = vertical plunge)

  // Geometry filters
  ignoreSmallFeatures: number;  // mm - features smaller than this are ignored
  minHoleDiameter: number;      // mm - holes smaller than this are drilled/plunged
  onlyTopLevel: boolean;        // only the highest visible surfaces
  workPlane: "xy" | "xz" | "yz";// the plane to project features onto
  projectFromTop: boolean;      // project all features straight down to XY

  // Cut levels
  cutTopZ: number;              // mm - start cutting below this Z
  cutBottomZ: number;           // mm - stop cutting below this Z (or use total depth)
  useTotalDepth: boolean;

  // Feeds
  feedRate: number;             // mm/min
  plungeRate: number;           // mm/min
  spindleRPM: number;           // rpm
  rapidRate: number;            // mm/min (for G0)

  // Lead-in/out
  leadInDistance: number;       // mm
  leadOutDistance: number;      // mm
  leadAngle: number;            // degrees (relative to cut direction)

  // Tabs
  useTabs: boolean;
  tabWidth: number;             // mm
  tabHeight: number;            // mm
  tabCount: number;

  // Safety
  safeZ: number;                // mm above stock for rapids
  retractZ: number;             // mm between cuts
  useCoolant: boolean;

  // Origin
  originX: number;              // mm
  originY: number;              // mm
  originZ: number;              // mm (workpiece zero in Z)

  // Resolution
  curveResolution: number;      // mm - chord error tolerance for curve fitting
  smoothingPass: boolean;       // extra final pass along walls
  finishPass: boolean;          // leave stock for finishing
  finishStock: number;          // mm

  // Centerline (for text / engraving)
  centerlineDepth: number;      // mm below surface for centerline cuts
  centerlineWidth: number;      // mm
}

export const DEFAULT_PARAMS: CamParams = {
  stockThickness: 10,
  stockOffsetZ: 0,

  tool: {
    type: "flat",
    diameter: 3.0,
    angle: 60,
    fluteCount: 2,
    name: "Flat 3mm"
  },

  strategy: "contour",
  contourSide: "outside",
  cutDirection: "climb",

  totalDepth: 2.0,
  stepDown: 1.0,
  rampAngle: 5,

  ignoreSmallFeatures: 0.5,
  minHoleDiameter: 1.5,
  onlyTopLevel: false,
  workPlane: "xy",
  projectFromTop: true,

  cutTopZ: 0,
  cutBottomZ: -2,
  useTotalDepth: true,

  feedRate: 800,
  plungeRate: 200,
  spindleRPM: 12000,
  rapidRate: 3000,

  leadInDistance: 2,
  leadOutDistance: 2,
  leadAngle: 45,

  useTabs: true,
  tabWidth: 3,
  tabHeight: 0.5,
  tabCount: 4,

  safeZ: 5,
  retractZ: 2,
  useCoolant: false,

  originX: 0,
  originY: 0,
  originZ: 0,

  curveResolution: 0.1,
  smoothingPass: false,
  finishPass: false,
  finishStock: 0.2,

  centerlineDepth: 0.5,
  centerlineWidth: 1.5,
};

// 3D mesh data structure
export interface TriangleMesh {
  positions: Float32Array;   // flat [x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]
  normals?: Float32Array;
  colors?: Float32Array;
}

export interface ModelInfo {
  mesh: TriangleMesh;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  triangleCount: number;
  fileName: string;
  fileSize: number;
}
