const QTSConfig = {
  // ellipsoid radius in x,y,z directions
  ellipsoidRadius: {
    x: 1737400,
    y: 1737400,
    z: 1737400,
  },

  defaultUTCTime: "2022-12-04T00:00:00.000Z",
  defaultMeshMaxError: 10,
  defaultTerrainName: "automatic terrain",
  defaultTerrainNormalsEnabled: true,

  defaultLocationName: "Tycho",

  // contours settings
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,

  showContourAlt: 100, // km
};

export { QTSConfig };
