import { Color } from "../../../Source/Cesium.js";

const QTSConfig = {
  // ellipsoid radius in x,y,z directions
  ellipsoidRadius: {
    x: 2439700,
    y: 2439700,
    z: 2439700,
  },

  solarDayNumHours: 4224, // 176 earth days

  defaultUTCTime: "2022-10-21T01:00:00.000Z",
  defaultMeshMaxError: 10,
  defaultTerrainName: "automatic",
  // defaultTerrainName: "USGS",
  defaultTerrainNormalsEnabled: true,

  // contours settings
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,

  showContourAlt: 100, // km

  //////////////////////////////////////////////
  // ILLUMINATION SETTINGS
  observer: "MERCURY",
  lightSource: {
    SUN: {
      // magnify sun, just to see it better
      radius: 6.955e8,
      radiusScaleFactor: 1.0,
      lightParams: {
        lightColor: Color.WHITE,
        lightIntensity: 2,
      },
      primitiveParams: {
        material: sunPrimitiveMaterial,
        // adjust rotation based on terrain reference system rotation
        dependsOnTerrainModelRotation: false,
      },
      entityVectorParams: {
        width: 10,
        color: Color.YELLOW,
      },
    },
  },

  ////////////////////////////////////////////
  // TERRAIN SETTINS

  // use this for having server caching enabled
  terrainServername: "https://lunar-dem-tiles2.quickmap.io",
  // terrainServername: "https://lunar-dem-api.quickmap.io",

  terrainInfoList: {
    // Automatic
    // automatic: {
    //   name: "Automatic Terrain",
    //   iconUrl: "./images/TerrainProviders/terrain_auto.png",
    //   tooltip: "Automatic Terrain Selection based on latitude",
    // },
    // USGS
    USGS: {
      name: "USGS",
      iconUrl: "./images/TerrainProviders/terrain.png",
      tooltip: "USGS DEM",
      urlSubpath: "/mercury",
      optimizedPolarTerrain: false,
    },
  },

  defaultRegularTerrain: "USGS",
  defaultPolarTerrain: "USGS",

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
