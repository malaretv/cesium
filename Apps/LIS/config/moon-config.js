const QTSConfig = {
  // ellipsoid radius in x,y,z directions
  ellipsoidRadius: {
    x: 1737400,
    y: 1737400,
    z: 1737400,
  },

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

  // terrain settings
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
};

export { QTSConfig };
