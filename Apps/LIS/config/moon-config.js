import { Color, Material } from "../../../Source/Cesium.js";

let sunPrimitiveMaterial = Material.fromType(Material.RimLightingType);
sunPrimitiveMaterial.uniforms.color = Color.YELLOW;

let earthPrimitiveMaterial = Material.fromType(Material.ImageType);
const earthTextureUrl = "https://files.actgate.com/earth/earthSmall.jpg";
earthPrimitiveMaterial.uniforms.image = earthTextureUrl;
earthPrimitiveMaterial.translucent = false;

const QTSConfig = {
  // ellipsoid radius in x,y,z directions
  ellipsoidRadius: {
    x: 1737400,
    y: 1737400,
    z: 1737400,
  },

  solarDayNumHours: 708.7, // 29.5 earth days

  defaultUTCTime: "2022-12-04T00:00:00.000Z",
  defaultMeshMaxError: 10,
  defaultTerrainName: "automatic",
  defaultTerrainNormalsEnabled: true,

  defaultLocationName: "Tycho",

  // contours settings
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,

  showContourAlt: 100, // km

  //////////////////////////////////////////////
  // ILLUMINATION SETTINGS
  observer: "MOON",
  lightSource: {
    SUN: {
      // magnify sun, just to see it better
      radius: 6.955e8 * 2,
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
    EARTH: {
      radius: 6.371e6,
      // apply a scale factor to earth size/distance in order to have it nearer to the viewer
      // when too far away the earth is not rendered some time when not in the near frustum
      radiusScaleFactor: 5.0,
      lightParams: {
        lightColor: new Color(0.9, 0.925, 1.0),
        lightIntensity: 1,
      },
      primitiveParams: {
        material: earthPrimitiveMaterial,

        // adjust rotation based on terrain reference system rotation
        dependsOnTerrainModelRotation: true,
      },
      entityVectorParams: {
        width: 10,
        color: Color.BLUE,
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
    automatic: {
      name: "Automatic Terrain",
      iconUrl: "./images/TerrainProviders/terrain_auto.png",
      tooltip: "Automatic Terrain Selection based on latitude",
    },
    // SLDEM LOLA
    sldem_lola: {
      name: "SLDEM LOLA",
      iconUrl: "./images/TerrainProviders/terrain.png",
      tooltip: "SLDEM LOLA",
      urlSubpath: "/sldem_lola",
      optimizedPolarTerrain: false,
    },
    // GOTM (HI RES)
    GOTM: {
      name: "Polar Optimized",
      iconUrl: "./images/TerrainProviders/gotm.png",
      tooltip: "Polar Optimized",
      urlSubpath: "/alt_poles_hires",
      optimizedPolarTerrain: true,
    },
  },

  defaultRegularTerrain: "sldem_lola",
  defaultPolarTerrain: "GOTM",

  ////////////////////////////////////
  ///// LAYERS SETTINGS

  layersInfo: {
    WACNoShadows: {
      name: "WAC Global Albedo",
      servername: "act-test.lroc.asu.edu",
      iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
      tooltip: "WAC Global Albedo",
      layerName: "wac_albedo",
      layerFormat: "jpg",
    },
    sunVisibilty60m: {
      name: "Sun Visibility 60m",
      servername: "act-test.lroc.asu.edu",
      iconUrl: "./images/ImageryProviders/sun_visibility_60m.png",
      tooltip: "Sun Visibility 60m",
      layerName: "lavgvis_s_60m",
      layerFormat: "png",
    },
    NACPolarMosaics: {
      name: "NAC Polar Mosaics",
      servername: "act-test.lroc.asu.edu",
      iconUrl: "./images/ImageryProviders/nac_polar_mosaics.png",
      tooltip: "NAC Polar Mosaics",
      layerName: "lnpole",
      layerFormat: "png",
    },
    ACTSunlitModel: {
      name: "ACT Sun Visibility 60m",
      servername: "mare3.actgate.com",
      iconUrl: "./images/ImageryProviders/act_sunlit_model.png",
      tooltip: "ACT Sun Visibility 60m",
      layerName: "act_sunlit_model",
      layerFormat: "png",
    },
  },

  eqcProjectionName: "lunar-fulleqc",
  polarShiftedEqcProjectionName: "lunar-polarshifted-eqc",

  // LOCATIONS
  locationsInfo: {
    Tycho: {
      name: "Tycho",
      longitude: -11.34246,
      latitude: -43.33986,
      height: -1000,
      color: Color.WHITE,
    },
    Haworth_1: {
      name: "Haworth_1",
      longitude: -17.665,
      latitude: -86.744,
      height: 1300,
      color: Color.WHITE,
    },
    Haworth_2: {
      name: "Haworth_2",
      longitude: -19.023,
      latitude: -86.516,
      height: 1300,
      color: Color.TOMATO,
    },
    PSR0: {
      name: "PSR0",
      longitude: 135.36409,
      latitude: -81.87225,
      height: -4100,
      color: Color.TOMATO,
    },
    PSR1: {
      name: "PSR1",
      longitude: -11.77213,
      latitude: -85.61268,
      height: 2500,
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
    testing2: {
      name: "testing2",
      longitude: -2.146,
      latitude: 0.667,
      height: -900,
      color: Color.WHITE,
    },
  },
};

export { QTSConfig };
