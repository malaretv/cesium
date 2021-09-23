import { Color } from "../../../Source/Cesium.js";

const QTSConfig = {
  // ellipsoid radius in x,y,z directions
  ellipsoidRadius: {
    x: 2439700,
    y: 2439700,
    z: 2439700,
  },

  defaultUTCTime: "2022-12-08T03:14:40.000Z",
  defaultMeshMaxError: 10,
  defaultTerrainName: "automatic",
  defaultTerrainNormalsEnabled: true,

  // contours settings
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,

  showContourAlt: 100, // km

  ////////////////////////////////////////////
  // TERRAIN SETTINS

  // use this for having server caching enabled
  terrainServername: "https://lunar-dem-tiles2.quickmap.io",
  // terrainServername: "https://lunar-dem-api.quickmap.io",

  terrainInfoList: {
    // Automatic
    automatic: {
      name: "Automatic Terrain",
      iconUrl: "./images/TerrainProviders/terrain_auto.png",
      tooltip: "Automatic Terrain Selection based on latitude",
    },
    // USGS
    USGS: {
      name: "USGS",
      iconUrl: "./images/TerrainProviders/terrain.png",
      tooltip: "USGS DEM",
      urlSubpath: "/mercury",
      optimizedPolarTerrain: false,
    },
    // GOTM
    GOTM: {
      name: "Polar Optimized",
      iconUrl: "./images/TerrainProviders/gotm.png",
      tooltip: "Polar Optimized",
      urlSubpath: "/mercury_poles",
      optimizedPolarTerrain: true,
    },
  },

  defaultRegularTerrain: "USGS",
  defaultPolarTerrain: "GOTM",

  ////////////////////////////////////
  ///// LAYERS SETTINGS

  layersInfo: {
    WACNoShadows: {
      name: "MDIS Low-Incidence Angle",
      servername: "messenger-act.actgate.com",
      iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
      tooltip: "MDIS low solar incidence map",
      layerName: "mdis_mono_loi_ckd_pds16",
      layerFormat: "png",
    },
  },

  eqcProjectionName: "mercury-eqc",
  polarShiftedEqcProjectionName: "mercury-polarshifted-eqc",

  // LOCATIONS
  defaultLocationName: "Rachmaninoff",

  locationsInfo: {
    Rachmaninoff: {
      name: "Rachmaninoff",
      longitude: 57.37022,
      latitude: 27.66092,
      height: 330000,
      color: Color.WHITE,
    },
    Hill_Top_Near_SP: {
      name: "Hill_Top_Near_SP",
      longitude: 222,
      latitude: -89.44,
      height: 2000,
      color: Color.WHITE,
    },
    Hill_Top_Near_NP: {
      name: "Hill_Top_Near_NP",
      longitude: -45.63,
      latitude: 89.645,
      height: 500,
      color: Color.WHITE,
    },
  },
};

export { QTSConfig };
