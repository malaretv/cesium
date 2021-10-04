window.CESIUM_BASE_URL = "../../Source/";

import * as Cesium from "../../Source/Cesium.js";

import { QTSConfig } from "./config/config.js";

import { resetStateUpdateTimer, viewModel } from "./viewModel.js";

import {
  isOptimizedPolarTerrain,
  maybeUpdateTerrainProvider,
  newTerrainNameSelected,
  resetTerrain,
  updateTerrainMeshAlgorithm,
  updateTerrainMeshMaxError,
  updateTerrainMeshMaxErrorParams,
  updateTerrainVertexNormalsEnabled,
} from "./terrainProvider.js";

import {
  getBodySPICEPosition,
  getLightSourceSPICEPosition,
  getIlluminationOptions,
  initializeBodiesSPICE,
  setSceneLight,
  updateBodiesPosSPICE,
  updateBodiesPosAtCurrentTime,
  updateBodiesPosition,
} from "./illumination.js";

import {
  createLayerNACImageProvider,
  createLayerQMapImageProvider,
  setLayerImageryEnabled,
  updateBaseLayerPickerImageryLayers,
} from "./imageryProvider.js";

import {
  cartesianToDummyPolar,
  dummyPolarToCartesian,
  adjustCartesianCoords,
  invAdjustCartesianCoords,
  matrixToDummyPolar,
  matrixDummyPolarToRegular,
} from "./adjustCartesian.js";

import {
  addStatusBarDetailInfo,
  initializeUI,
  refreshMeshControlsParams,
  setMapLoadingIconVisible,
  setStatusBarCameraHeight,
  setStatusBarCursorPosition,
  setStatusBarObs2CursorDist,
} from "./UIcontrols.js";

import { cameraFlyToLookDownNorthUp } from "./utils.js";

Cesium.Ellipsoid.WGS84 = new Cesium.Ellipsoid(
  QTSConfig.ellipsoidRadius.x,
  QTSConfig.ellipsoidRadius.y,
  QTSConfig.ellipsoidRadius.z
);

// tiles settings
// https://lunar-dem-tiles2.quickmap.io/sldem_lola/docs#/default/serve_layer_info_layer_json_get

export var viewer = new Cesium.Viewer("cesiumContainer", {
  //  terrainProvider: createTerrainProvider(),
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: false,
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,
  scene3DOnly: true,
});

var scene = viewer.scene;
var globe = scene.globe;
globe.enableLighting = true;
globe.showGroundAtmosphere = false;
globe.baseColor = Cesium.Color.GRAY;
scene.fog.enabled = false;

var shadowMap = viewer.shadowMap;
// var defaultShadowMapMaxDistance = 100.0; // km
var defaultShadowMapMaxDistance = "auto";
shadowMap.softShadows = false;
shadowMap.size = 4096;
shadowMap.normalOffset = false;
shadowMap.darkness = 0; // lower -> darker shadows

viewer.imageryLayers.removeAll();

function updateEntitiesPos() {
  for (var locationName in QTSConfig.locationsInfo) {
    if (QTSConfig.locationsInfo.hasOwnProperty(locationName)) {
      var location = QTSConfig.locationsInfo[locationName];
      var entity = location.entity;
      entity.position.setValue(
        adjustCartesianCoords(
          Cesium.Cartesian3.fromDegrees(
            location.longitude,
            location.latitude,
            location.height,
            Cesium.Ellipsoid.WGS84
          ),
          isOptimizedPolarTerrain
        )
      );
    }
  }
}

var newCameraPos;
var newCameraDir;
var newCameraUp;
var cameraR = new Cesium.Matrix3();
var cameraT = new Cesium.Cartesian3();
export function updateGlobeCartesianPositions() {
  var transform = camera.transform;
  var updateTransform = false;
  if (!Cesium.Matrix4.equals(transform, Cesium.Matrix4.IDENTITY)) {
    transform = camera.transform;
    Cesium.Matrix4.getMatrix3(transform, cameraR);
    Cesium.Matrix4.getTranslation(transform, cameraT);
    if (viewer.trackedEntity) {
      // untrack the current entity in order to custom update the camera transform matrix
      viewer.trackedEntity = undefined;
    } else {
      // reset camera transform
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    }
    updateTransform = true;
  }
  updateBodiesPosition();
  updateEntitiesPos();
  updateEntityVectors(true);
  updateBaseLayerPickerImageryLayers();
  updateNACImage();
  updateQMapImage();

  // preserve camera position/orientation
  if (isOptimizedPolarTerrain) {
    newCameraPos = cartesianToDummyPolar(camera.position);
    newCameraDir = cartesianToDummyPolar(camera.direction);
    newCameraUp = cartesianToDummyPolar(camera.up);
    if (updateTransform) {
      // update camera rotation/translation
      cameraR = matrixToDummyPolar(cameraR);
      cameraT = cartesianToDummyPolar(cameraT);
    }
  } else {
    newCameraPos = dummyPolarToCartesian(camera.position);
    newCameraDir = dummyPolarToCartesian(camera.direction);
    newCameraUp = dummyPolarToCartesian(camera.up);
    if (updateTransform) {
      // update camera rotation/translation
      cameraR = matrixDummyPolarToRegular(cameraR);
      cameraT = dummyPolarToCartesian(cameraT);
    }
  }

  if (updateTransform) {
    // update transform
    Cesium.Matrix4.fromRotationTranslation(cameraR, cameraT, transform);
    camera.lookAtTransform(transform);
    var invTransform = camera.inverseTransform;

    // update camera position and orientation based on camera transformation
    Cesium.Matrix4.multiplyByPoint(invTransform, newCameraPos, newCameraPos);

    Cesium.Matrix4.multiplyByPointAsVector(
      invTransform,
      newCameraDir,
      newCameraDir
    );

    Cesium.Matrix4.multiplyByPointAsVector(
      invTransform,
      newCameraUp,
      newCameraUp
    );
  }

  camera.position = newCameraPos;
  camera.direction = newCameraDir;
  camera.up = newCameraUp;

  if (mouseClickPosCartesian) {
    // update mouse click position
    if (isOptimizedPolarTerrain) {
      mouseClickPosCartesian = cartesianToDummyPolar(mouseClickPosCartesian);
    } else {
      mouseClickPosCartesian = dummyPolarToCartesian(mouseClickPosCartesian);
    }
  }
}

// avoid to flood the server with requests
// let us send a request when a certain amount of events is reached
// or when a timer expires
// define some constants
var lastBodiesUpdateTime;
function maybeUpdateBodiesPosSPICE() {
  if (
    !Cesium.JulianDate.equals(lastBodiesUpdateTime, viewer.clock.currentTime)
  ) {
    lastBodiesUpdateTime = Cesium.JulianDate.clone(viewer.clock.currentTime);
    updateBodiesPosAtCurrentTime();
  }
}

// viewer.timeline.addEventListener('settime', maybeUpdateBodiesPosSPICE, false);
// catch click on home button
viewer.homeButton.viewModel.command.beforeExecute.addEventListener(
  resetTerrain
);
// time tick event
viewer.clock.onTick.addEventListener(maybeUpdateBodiesPosSPICE);
viewer.clock.onTick.addEventListener(timeUpdated);

function timeUpdated() {
  // update view model
  viewModel.UTCTime = viewer.clock.currentTime;

  maybeUpdateSubSolarPoint();
}

export function initializeTime(
  currentTimeIso8601,
  startTimeIso8601,
  stopTimeIso8601
) {
  var currentTime = Cesium.JulianDate.fromIso8601(currentTimeIso8601);
  var stopTime;
  if (stopTimeIso8601 === undefined) {
    stopTime = Cesium.JulianDate.addHours(
      currentTime,
      QTSConfig.solarDayNumHours,
      new Cesium.JulianDate()
    );
  } else {
    stopTime = Cesium.JulianDate.fromIso8601(stopTimeIso8601);
  }

  var startTime;
  if (startTimeIso8601 === undefined) {
    startTime = currentTime;
  } else {
    startTime = Cesium.JulianDate.fromIso8601(startTimeIso8601);
  }

  setTimes(startTime, stopTime, currentTime);
}

export function setTimes(startTime, stopTime, currentTime) {
  var isTimeRangeChanged = false;
  if (
    viewer.clock.startTime !== startTime ||
    viewer.clock.stopTime !== stopTime
  ) {
    isTimeRangeChanged = true;
  }

  viewer.clock.startTime = Cesium.JulianDate.clone(startTime);
  viewer.clock.stopTime = Cesium.JulianDate.clone(stopTime);
  viewer.timeline.zoomTo(startTime, stopTime);
  viewer.clock.currentTime = Cesium.JulianDate.clone(currentTime);

  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;

  viewModel.startUTCTime = startTime;
  viewModel.stopUTCTime = stopTime;
  viewModel.UTCTime = currentTime;

  if (isTimeRangeChanged) {
    updateBodiesPosSPICE();
  }
}

function setTime(iso8601) {
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(iso8601);
}

function reset() {
  // Set scene defaults
  // Don't show the default Sun
  scene.sun.show = false;
  scene.moon.show = false;
  // Turn off the sky box
  scene.skyBox.show = false;

  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.dynamicAtmosphereLightingFromSun = false;
  resetStateUpdateTimer();
}

var coordsDisplay = document.createElement("div");
function updateCoordsDisplay(msg) {
  coordsDisplay.innerHTML = msg;
}

function updateCameraCoordsDisplay(msg) {
  cameraCoordsDisplay.innerHTML = msg;
}

var camera2CursorDistance = document.createElement("div");
function setCamera2CursorDistanceLabel(msg) {
  camera2CursorDistance.innerHTML = msg;
}

function updateSubSolarPointDisplay(lon, lat) {
  let subSolarPointValueS = "";
  if (lon && lat) {
    if (lon > 180) {
      // lon in [-180,180] range
      lon -= 360;
    }
    subSolarPointValueS = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  }

  let msg = `Sub Solar Point (Lon,Lat): ${subSolarPointValueS}`;
  subSolarPointDisplay.innerHTML = msg;
}

export function updateTerrainDisplay(msg) {
  if (terrainDisplay) {
    terrainDisplay.innerHTML = msg;
  }
}

export function updateShadowsMaxDistanceDisplay(shadowsMaxDist) {
  if (shadowsMaxDistanceDisplay) {
    shadowsMaxDistanceDisplay.innerHTML =
      "Shadows Max Distance: " + (shadowsMaxDist / 1000).toFixed(0) + " km";
  }
}

// CONTROLS

globe.tileLoadProgressEvent.addEventListener(terrainTileLoaded);

var terrainShadowsRefreshStarted = false;
var forceTerrainShadowsRefreshTimeoutId = -1;
function forceTerrainShadowsRefresh() {
  // NOTE: trick for fixing bad tiles shadows
  // when the terrain tiles update finishes, force tiles shadows refresh
  // changing scene.globe.showGroundAtmosphere state

  // console.log("forcing shadows refresh...");

  // make sure no new force requests are done
  terrainShadowsRefreshStarted = true;
  forceTerrainShadowsRefreshTimeoutId = -1;

  // force shadows update
  scene.globe.showGroundAtmosphere = !scene.globe.showGroundAtmosphere;

  // restore previous state after timeout
  setTimeout(finishForceTerrainShadowsRefresh, 100);
}

function finishForceTerrainShadowsRefresh() {
  // console.log("restoring simu atm state " + enableAtmSimCbx.checked);
  scene.globe.showGroundAtmosphere = false;
  terrainShadowsRefreshStarted = false;
}

function terrainTileLoaded(loadTilesQueueCount) {
  if (!terrainShadowsRefreshStarted) {
    setMapLoadingIconVisible(true);
    // schedule force terrain shadows refresh
    // it can take time loading all the tiles. Let us force a shadows refresh before load finishes
    forceTerrainShadowsRefreshTimeoutId = setTimeout(
      forceTerrainShadowsRefresh,
      3000
    );
    terrainShadowsRefreshStarted = true;
  }

  if (loadTilesQueueCount === 0) {
    if (forceTerrainShadowsRefreshTimeoutId >= 0) {
      clearTimeout(forceTerrainShadowsRefreshTimeoutId);
    }
    forceTerrainShadowsRefresh();
    setMapLoadingIconVisible(false);
  }
}

export function setCurrTerrainLabelVisible(showLbl) {
  if (terrainDisplay) {
    if (showLbl) {
      terrainDisplay.removeAttribute("hidden");
    } else {
      terrainDisplay.setAttribute("hidden", "");
    }
  }
}

export function setCurrShadowsMaxDistVisible(showLbl) {
  if (shadowsMaxDistanceDisplay) {
    if (showLbl) {
      shadowsMaxDistanceDisplay.removeAttribute("hidden");
    } else {
      shadowsMaxDistanceDisplay.setAttribute("hidden", "");
    }
  }
}

var illuminationOptions = getIlluminationOptions();
Sandcastle.addToolbarMenu(illuminationOptions);
var illuminationMenu = document.getElementById("toolbar").lastChild;

var polesHiresDataPolarUrl =
  "https://files.actgate.com/temp/poles_hires.geojson";
var polesHiresDataPolarFilename = polesHiresDataPolarUrl.split("/").pop();
var polesHiresDataPolar = Cesium.GeoJsonDataSource.load(
  polesHiresDataPolarUrl,
  {
    fill: Cesium.Color.PINK.withAlpha(0.1),
    clampToGround: true,
  }
);
viewer.dataSources.add(polesHiresDataPolar);

var polesHiresDataUrl =
  "https://files.actgate.com/temp/poles_hires_normal.geojson";
var polesHiresDataFilename = polesHiresDataUrl.split("/").pop();
var polesHiresData = Cesium.GeoJsonDataSource.load(polesHiresDataUrl, {
  fill: Cesium.Color.PINK.withAlpha(0.1),
  clampToGround: true,
});
viewer.dataSources.add(polesHiresData);

var polesHiresDataSource;
var polesHiresDataSourcePolar;
var dataSourceLastIndex = -1;

var polesHiresDataSourceEnabled = false;
function setHiresDemRegionsEnabledFunction() {
  return function (checked) {
    // store here in case the data sources have not been loaded yet
    polesHiresDataSourceEnabled = checked;

    if (!polesHiresDataSourcePolar || !polesHiresDataSource) {
      return;
    }

    if (checked) {
      if (isOptimizedPolarTerrain) {
        polesHiresDataSourcePolar.show = true;
      } else {
        polesHiresDataSource.show = true;
      }
    } else {
      polesHiresDataSource.show = false;
      polesHiresDataSourcePolar.show = false;
    }

    // update view model
    viewModel.hiresDemRegionsEnabled = checked;
  };
}

// Sandcastle.addToggleButton(
//   "Highlight 5m DEM regions",
//   false,
//   setHiresDemRegionsEnabledFunction()
// );
// // get checkbox input to be able to modify it programmatically
// var enableHiresDemRegionsButton = document.getElementById("toolbar").lastChild;
// var enableHiresDemRegionsCbx = enableHiresDemRegionsButton.firstChild.firstChild; // input

viewer.dataSources.dataSourceAdded.addEventListener(function () {
  if (viewer.dataSources.length > dataSourceLastIndex) {
    dataSourceLastIndex = viewer.dataSources.length - 1;
    var dataSource = viewer.dataSources.get(dataSourceLastIndex);
    dataSource.show = false;
    if (dataSource.name === polesHiresDataFilename) {
      polesHiresDataSource = dataSource;
      polesHiresDataSource.show = polesHiresDataSourceEnabled;
    } else {
      polesHiresDataSourcePolar = dataSource;
      polesHiresDataSourcePolar.show = polesHiresDataSourceEnabled;
    }
  }
});

var maxErrorList = ["auto", /*0.01, 0.1, */ 1, 10, 20, 50];
var terrainMaxErrOptions = [];
for (var i = 0; i < maxErrorList.length; i++) {
  var maxError = maxErrorList[i];
  var maxErrorS;
  if (maxError === "auto") {
    maxErrorS = maxError;
  } else {
    maxErrorS = maxError.toString() + "m";
  }
  var maxErrorEntryName = "mesh surf. max_err: " + maxErrorS;
  terrainMaxErrOptions.push({
    text: maxErrorEntryName,
    onselect: setTerrainMeshMaxErrorFunction(maxError),
  });
}

Sandcastle.addToolbarMenu(terrainMaxErrOptions);
var terrainMaxErrMenu = document.getElementById("toolbar").lastChild;

// terrain mesh algorithm
var terrainMeshAlgorithmList = ["delatin", "martini"];
var terrainMeshAlgorithmOptions = [];
for (var i = 0; i < terrainMeshAlgorithmList.length; i++) {
  var meshAlg = terrainMeshAlgorithmList[i];
  var meshAlgEntryName = "mesh alg: " + meshAlg;
  terrainMeshAlgorithmOptions.push({
    text: meshAlgEntryName,
    onselect: setTerrainMeshAlgorithmFunction(meshAlg),
  });
}

if (window.LIS_MODE === "development") {
  Sandcastle.addToolbarMenu(terrainMeshAlgorithmOptions);
  var terrainMeshAlgMenu = document.getElementById("toolbar").lastChild;
}

function setContourEnabledFunction() {
  return function (checked) {
    // update view model
    viewModel.contourEnabled = checked;
    updateContours();
  };
}

Sandcastle.addToggleButton(
  "Contours @ " + QTSConfig.contourSpacing.toFixed(0) + "m",
  viewModel.contourEnabled,
  setContourEnabledFunction()
);

// get checkbox input to be able to modify it programmatically
var enableContourButton = document.getElementById("toolbar").lastChild;
var enableContourCbx = enableContourButton.firstChild.firstChild; // input

function setSkirtsEnabledFunction() {
  return function (checked) {
    scene.globe.showSkirts = checked;

    // update view model
    viewModel.skirtsEnabled = checked;
  };
}

if (window.LIS_MODE === "development") {
  Sandcastle.addToggleButton(
    "Skirts",
    scene.globe.showSkirts,
    setSkirtsEnabledFunction()
  );

  // get checkbox input to be able to modify it programmatically
  var enableSkirtsButton = document.getElementById("toolbar").lastChild;
  var enableSkirtsCbx = enableSkirtsButton.firstChild.firstChild; // input
}

function setTerrainNormalsEnabledFunction() {
  return function (checked) {
    updateTerrainVertexNormalsEnabled(checked);
  };
}

Sandcastle.addToggleButton(
  "shadow relief, cos(I)",
  viewModel.terrainVertexNormalsEnabled,
  setTerrainNormalsEnabledFunction()
);

// get checkbox input to be able to modify it programmatically
var enableVertexNormalsButton = document.getElementById("toolbar").lastChild;
var enableVertexNormalsCbx = enableVertexNormalsButton.firstChild.firstChild; // input

function setTerrainMeshMaxErrorFunction(maxErr) {
  return function () {
    updateTerrainMeshMaxError(maxErr);
  };
}

function setTerrainMeshAlgorithmFunction(alg) {
  return function () {
    updateTerrainMeshAlgorithm(alg);
  };
}

function setTerrainShadowsEnabledFunction() {
  return function (checked) {
    viewer.terrainShadows = checked
      ? Cesium.ShadowMode.ENABLED
      : Cesium.ShadowMode.DISABLED;

    // update view model
    viewModel.terrainShadowsEnabled = checked;
  };
}

Sandcastle.addToggleButton(
  "Terrain Shadows",
  viewer.terrainShadows === Cesium.ShadowMode.ENABLED,
  setTerrainShadowsEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var terrainShadowsButton = document.getElementById("toolbar").lastChild;
var terrainShadowsLbl = terrainShadowsButton.lastChild; // label
var terrainShadowsCbx = terrainShadowsLbl.firstChild; // input

function setShadowsFadingEnabledFunction() {
  return function (checked) {
    shadowMap.fadingEnabled = checked;

    // update view model
    viewModel.shadowsFadingEnabled = checked;
  };
}

Sandcastle.addToggleButton(
  "Shadows Fading",
  shadowMap.fadingEnabled,
  setShadowsFadingEnabledFunction()
);

// get checkbox input to be able to modify it programmatically
var enableShadowsFadingButton = document.getElementById("toolbar").lastChild;
var enableShadowsFadingCbx = enableShadowsFadingButton.firstChild.firstChild; // input

/*
Sandcastle.addToggleButton(
"Soft Shadows",
shadowMap.softShadows,
function (checked) {
shadowMap.softShadows = checked;
}
);
*/

/*
Sandcastle.addToggleButton(
"Fog simu",
scene.fog.enabled,
function (checked) {
scene.fog.enabled = checked;
}
);
*/

/*
var dummyPolesBodies = false;
Sandcastle.addToggleButton(
"Dummy Pole Light",
dummyPolesBodies,
function (checked) {
dummyPolesBodies = checked;
udpateBodiesPosToDummyPolar(!checked);
}
);
*/

function resetCameraPivotPoint() {
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  if (referenceFramePrimitive) {
    scene.primitives.remove(referenceFramePrimitive);
    referenceFramePrimitive = undefined;
  }
  if (cancelOrbitEventHandler) {
    cancelOrbitEventHandler();
  }
  mouseClickPosCartesian = undefined;
}

function setRotateCameraAroundPointEnabledFunction() {
  return function (checked) {
    if (rotateCameraAroundPointEnabled === checked) {
      return;
    }
    rotateCameraAroundPointEnabled = checked;

    // make sure fly around is disabled
    if (
      rotateCameraAroundPointEnabled &&
      rotateCameraAroundPointLightInFrontEnabled
    ) {
      enableRotateAroundPointSunInFrontCbx.checked = false;
      rotateCameraAroundPointLightInFrontEnabled = false;
    }

    if (
      !rotateCameraAroundPointEnabled &&
      !Cesium.defined(scene.trackedEntity)
    ) {
      resetCameraPivotPoint();
    } else {
      rotateCameraAroundPoint(mouseClickPosCartesian);
    }
  };
}

function setRotateCameraAroundPointLightInFrontEnabledFunction() {
  return function (checked) {
    if (rotateCameraAroundPointLightInFrontEnabled === checked) {
      return;
    }
    rotateCameraAroundPointLightInFrontEnabled = checked;

    // make sure fly around is disabled
    if (
      rotateCameraAroundPointLightInFrontEnabled &&
      rotateCameraAroundPointEnabled
    ) {
      // re-use current POI
      enableRotateAroundPointCbx.checked = false;
      rotateCameraAroundPointEnabled = false;
      if (cancelOrbitEventHandler) {
        cancelOrbitEventHandler();
      }

      // var mouseClickPosCartesianBack = mouseClickPosCartesian;
      // var setRotateCameraAroundPointEnabled = setRotateCameraAroundPointEnabledFunction();
      // setRotateCameraAroundPointEnabled(false);
      // mouseClickPosCartesian = mouseClickPosCartesianBack;
    }

    if (
      !rotateCameraAroundPointLightInFrontEnabled &&
      !Cesium.defined(scene.trackedEntity)
    ) {
      resetCameraPivotPoint();
    } else {
      rotateCameraAroundPointLightInFront(mouseClickPosCartesian);
    }
  };
}

function setRotateAroundPointDisabled() {
  if (rotateCameraAroundPointEnabled) {
    enableRotateAroundPointCbx.checked = false;
    var setRotateCameraAroundPointEnabled = setRotateCameraAroundPointEnabledFunction();
    setRotateCameraAroundPointEnabled(false);
  } else if (rotateCameraAroundPointLightInFrontEnabled) {
    enableRotateAroundPointSunInFrontCbx.checked = false;
    var setRotateCameraAroundPointSunInFrontEnabled = setRotateCameraAroundPointLightInFrontEnabledFunction();
    setRotateCameraAroundPointSunInFrontEnabled(false);
  }
}

var flyingToNewPositionStarted = false;
export function flyingToNewPosition() {
  flyingToNewPositionStarted = true;
  setRotateAroundPointDisabled();
}
// find first valid view row given a view column (recursive)
function findFirstValidRowPixelBinarySearchRec(
  col,
  startRow,
  endRow,
  statsObj
) {
  statsObj.nit += 1;
  let middle = Math.floor((startRow + endRow) / 2);
  let posCartesian = getScreenPixelCoords(new Cesium.Cartesian2(col, middle));

  if (middle == startRow) {
    if (posCartesian) {
      return [startRow, posCartesian];
    } else {
      // check next row
      posCartesian = getScreenPixelCoords(new Cesium.Cartesian2(col, endRow));
      if (posCartesian) {
        return [endRow, posCartesian];
      } else {
        // not found
        return [undefined, undefined];
      }
    }
  }

  if (!posCartesian) {
    // go ahead in finding first valid pixel
    return findFirstValidRowPixelBinarySearchRec(col, middle, endRow, statsObj);
  } else {
    // go back and find first valid pixel
    return findFirstValidRowPixelBinarySearchRec(
      col,
      startRow,
      middle,
      statsObj
    );
  }
}

// find first valid view row. Binary search is used for better performance.
function findFirstValidRowCoords(col, viewHeight) {
  let startRow = 0;
  let endRow = viewHeight - 1;
  let statsObj = { nit: 0 }; // just to keep track of number of iterations

  const [validRow, posCartesian] = findFirstValidRowPixelBinarySearchRec(
    col,
    startRow,
    endRow,
    statsObj
  );
  // console.log("Found valid row " + validRow + " - nit (" + statsObj.nit + ")");
  return posCartesian;
}

// return the pixel coord on the ellipsoid. Note: if the camera height is negative
// then the coordinate on the actual terrain will be returned as the previous approch
// would return the coordinate of point at the opposite position in the ellipsoid
function getScreenPixelCoords(pixelCoors) {
  let pixelPosCartesian;
  // pickEllipsoid does not work when camera height is negative
  // if (cartographicCamera.height >= 0) {
  //   pixelPosCartesian = camera.pickEllipsoid(pixelCoors, ellipsoid);
  // } else {
  // more precise way for finding ground interception (a bit slower)
  let pixelPosRay = viewer.camera.getPickRay(pixelCoors);
  pixelPosCartesian = viewer.scene.globe.pick(pixelPosRay, viewer.scene);
  // }
  return pixelPosCartesian;
}

// const SHADOWS_MAX_DISTANCE_DEFAULT = 10000.0 * 1000.0;
const SHADOWS_MAX_DISTANCE_DEFAULT =
  Cesium.Ellipsoid.WGS84.maximumRadius * 10.0;
function getBestShadowsMaxDistance() {
  // do not update shadows max distance when not needed
  if (viewModel.terrainShadowsEnabled === false) {
    return SHADOWS_MAX_DISTANCE_DEFAULT;
  }

  var camH = cartographicCamera.height * 0.001; // km
  // if (camH > 500) {
  //   // high elevation
  //   return SHADOWS_MAX_DISTANCE_DEFAULT;
  // }

  const canvas = scene.canvas;
  let w = canvas.width,
    h = canvas.height;

  // pickEllipsoid does not work when camera height is negative
  let posULCartesian = getScreenPixelCoords(new Cesium.Cartesian2(0, 0));
  let posURCartesian = getScreenPixelCoords(new Cesium.Cartesian2(w - 1, 0));
  let posLLCartesian = getScreenPixelCoords(new Cesium.Cartesian2(0, h - 1));
  let posLRCartesian = getScreenPixelCoords(
    new Cesium.Cartesian2(w - 1, h - 1)
  );

  // find corner points if they are not valid
  if (!posULCartesian && posLLCartesian) {
    posULCartesian = findFirstValidRowCoords(0, h);
  }
  if (!posURCartesian && posLRCartesian) {
    posURCartesian = findFirstValidRowCoords(w - 1, h);
  }

  let maxDist = 0;
  let posCartesianArray = [
    posULCartesian,
    posLRCartesian,
    posLLCartesian,
    posURCartesian,
  ];
  for (let i = 0; i < posCartesianArray.length; i++) {
    let posCartesian = posCartesianArray[i];
    if (posCartesian) {
      let c2cDistance = Cesium.Cartesian3.distance(
        posCartesian,
        camera.positionWC
      );

      if (c2cDistance > maxDist) {
        maxDist = c2cDistance;
      }
    }
  }

  if (maxDist > 0) return maxDist * 1.2; // increase a little bit the shadows max dist (20%)

  return SHADOWS_MAX_DISTANCE_DEFAULT;
}

function updateShadowsMaxDist(maxDist) {
  if (viewModel.shadowsMaxDistance == maxDist) {
    return;
  }

  var shadowsMaxDistance = maxDist;
  if (maxDist !== "auto") {
    shadowsMaxDistance = maxDist * 1000.0; // m
  }
  viewModel.shadowsMaxDistance = shadowsMaxDistance;
  var effectiveShadowsMaxDistance = shadowsMaxDistance;
  setCurrShadowsMaxDistVisible(shadowsMaxDistance === "auto");
  if (shadowsMaxDistance === "auto") {
    effectiveShadowsMaxDistance = getBestShadowsMaxDistance();
    console.log(
      "best shadows max dist " +
        (effectiveShadowsMaxDistance / 1000.0).toFixed(3) +
        "km"
    );
    updateShadowsMaxDistanceDisplay(effectiveShadowsMaxDistance);
  }
  shadowMap.maximumDistance = effectiveShadowsMaxDistance;
}

function maybeUpdateShadowsMaxDistance() {
  if (viewModel.shadowsMaxDistance === "auto") {
    shadowMap.maximumDistance = getBestShadowsMaxDistance();
    console.log(
      "Updating shadow max distance: " +
        (shadowMap.maximumDistance / 1000.0).toFixed(3) +
        "km"
    );
    updateShadowsMaxDistanceDisplay(shadowMap.maximumDistance);
  }
}

function setShadowsMaxDistanceFunction(maxDist) {
  return function () {
    updateShadowsMaxDist(maxDist);
  };
}

var shadowsMaxDistList = ["auto", 10, 25, 50, 100, 200, 300, 600, 1000]; // km
var shadowsMaxDistOptions = [];
for (var i = 0; i < shadowsMaxDistList.length; i++) {
  var shadowsMaxDist = shadowsMaxDistList[i];
  var shadowsMaxDistS;
  if (shadowsMaxDist === "auto") {
    shadowsMaxDistS = shadowsMaxDist;
  } else {
    shadowsMaxDistS = shadowsMaxDist.toString() + "km";
  }
  var shadowsMaxDistEntryName = "Shadows Max Distance: " + shadowsMaxDistS;
  shadowsMaxDistOptions.push({
    text: shadowsMaxDistEntryName,
    onselect: setShadowsMaxDistanceFunction(shadowsMaxDist),
  });
}

Sandcastle.addToolbarMenu(shadowsMaxDistOptions);
var shadowsMaxDistMenu = document.getElementById("toolbar").lastChild;

function setAtmSimuEnabledFunction() {
  return function (checked) {
    scene.globe.showGroundAtmosphere = checked;

    // update view model
    viewModel.atmSimuEnabled = checked;
  };
}

var rotateCameraAroundPointEnabled = false;
Sandcastle.addToggleButton(
  "Fly Around Point",
  rotateCameraAroundPointEnabled,
  setRotateCameraAroundPointEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var enableRotateAroundPointButton = document.getElementById("toolbar")
  .lastChild;
enableRotateAroundPointButton.title = "Fly around selected point";
var enableRotateAroundPointCbx =
  enableRotateAroundPointButton.firstChild.firstChild; // input

var rotateCameraAroundPointLightInFrontEnabled = false;
Sandcastle.addToggleButton(
  "Force Sun in Front Point",
  rotateCameraAroundPointLightInFrontEnabled,
  setRotateCameraAroundPointLightInFrontEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var enableRotateAroundPointSunInFrontButton = document.getElementById("toolbar")
  .lastChild;
enableRotateAroundPointSunInFrontButton.title =
  "Rotate around selected point, forcing the sun to be in front of the viewer";
var enableRotateAroundPointSunInFrontCbx =
  enableRotateAroundPointSunInFrontButton.firstChild.firstChild; // input

/*
Sandcastle.addToggleButton(
  "Atm simu",
  scene.globe.showGroundAtmosphere,
  setAtmSimuEnabledFunction()
);
// button
var enableAtmSimButton = document.getElementById("toolbar").lastChild;
// button input (checkbox)
var enableAtmSimCbx = enableAtmSimButton.firstChild.firstChild;
*/

/*
Sandcastle.addToolbarMenu(locationToolbarOptions);
var locationMenu = document.getElementById("toolbar").lastChild;
*/

// NAC IMAGE
function setNACImageEnabledFunction() {
  return function (checked) {
    viewModel.NACImageEnabled = checked;
    enableNACCbx.checked = viewModel.NACImageEnabled;

    if (NACImageLayer === undefined) {
      console.log("Warning: no NAC Image available");
      return;
    }

    if (checked) {
      NACImageLayer.show = true;
    } else {
      NACImageLayer.show = false;
    }
  };
}

Sandcastle.addToggleButton("NAC Image", false, setNACImageEnabledFunction());
// get checkbox input to be able to modify it programmatically
var enableNACButton = document.getElementById("toolbar").lastChild;
var enableNACCbx = enableNACButton.firstChild.firstChild; // input
var enableNACLbl = enableNACButton.firstChild.lastChild; // label
setNACButtonVisible(false);

function setNACButtonVisible(yes) {
  if (!yes) {
    document.getElementById("toolbar").removeChild(enableNACButton);
  } else {
    document.getElementById("toolbar").appendChild(enableNACButton);
  }
}

function setNACImageID(NACImageID) {
  enableNACLbl.nodeValue = "NAC Image: " + NACImageID;

  viewModel.NACImageID = NACImageID;
}

var NACImageLayer;
function addNACImage(NACImageID) {
  if (NACImageLayer !== undefined) {
    viewer.imageryLayers.remove(NACImageLayer);
  }
  NACImageLayer = new Cesium.ImageryLayer(
    createLayerNACImageProvider(NACImageID)
  );
  viewer.imageryLayers.add(NACImageLayer);

  setNACImageID(NACImageID);
  setNACButtonVisible(true);
  var setNACImageEnabled = setNACImageEnabledFunction();
  setNACImageEnabled(viewModel.NACImageEnabled);
}

function updateNACImage() {
  if (!Cesium.defined(viewModel.NACImageID)) {
    return;
  }

  if (NACImageLayer !== undefined) {
    viewer.imageryLayers.remove(NACImageLayer);
  }
  NACImageLayer = undefined;

  // force NAC Image refresh
  addNACImage(viewModel.NACImageID);
}

// Generic QMap supported image
function setQMapImageEnabledFunction() {
  return function (checked) {
    viewModel.QMapImageEnabled = checked;
    enableQMapImageCbx.checked = viewModel.QMapImageEnabled;

    if (QMapImageLayer === undefined) {
      console.log("Warning: no image available");
      return;
    }

    if (checked) {
      QMapImageLayer.show = true;
    } else {
      QMapImageLayer.show = false;
    }
  };
}

Sandcastle.addToggleButton("Image", false, setQMapImageEnabledFunction());
// get checkbox input to be able to modify it programmatically
var enableQMapImageButton = document.getElementById("toolbar").lastChild;
var enableQMapImageCbx = enableQMapImageButton.firstChild.firstChild; // input
var enableQMapImageLbl = enableQMapImageButton.firstChild.lastChild; // label
setQMapImageButtonVisible(false);

function setQMapImageButtonVisible(yes) {
  if (!yes) {
    document.getElementById("toolbar").removeChild(enableQMapImageButton);
  } else {
    document.getElementById("toolbar").appendChild(enableQMapImageButton);
  }
}

//  info for supported data sources
const QMapImageInfoList = {
  lis2d_tif: {
    serverName: "vineview.quickmap.io",
    lblName: "QTS-2D Image",
  },
  lrocnac: {
    serverName: "act-test.lroc.asu.edu",
    lblName: "NAC Image",
  },
};

function setQMapImageInfo(serverName, layerName, imageID) {
  var lblName = QMapImageInfoList[layerName]?.lblName;
  if (!lblName) {
    lblName = "Image";
  }
  enableQMapImageLbl.nodeValue = lblName + ": " + imageID;

  viewModel.setQMapImageInfo(serverName, layerName, imageID);
}

var QMapImageLayer;
function addQMapImage(serverName, layerName, imageID) {
  if (QMapImageLayer !== undefined) {
    viewer.imageryLayers.remove(QMapImageLayer);
  }
  serverName = serverName ?? QMapImageInfoList[layerName]?.serverName;
  if (!serverName) {
    console.log(
      layerName +
        " not supported. 'QMapImageServerName' must be provided in input URL"
    );
    return false;
  }

  QMapImageLayer = new Cesium.ImageryLayer(
    createLayerQMapImageProvider(serverName, layerName, imageID)
  );
  viewer.imageryLayers.add(QMapImageLayer);

  setQMapImageInfo(serverName, layerName, imageID);
  setQMapImageButtonVisible(true);
  var setQMapImageEnabled = setQMapImageEnabledFunction();
  setQMapImageEnabled(viewModel.QMapImageEnabled);
  return true;
}

function updateQMapImage() {
  if (!Cesium.defined(viewModel.QMapImageID)) {
    return;
  }

  if (QMapImageLayer !== undefined) {
    viewer.imageryLayers.remove(QMapImageLayer);
  }
  QMapImageLayer = undefined;

  // force NAC Image refresh
  addQMapImage(
    viewModel.QMapImageServerName,
    viewModel.QMapImageLayerName,
    viewModel._QMapImageID
  );
}

// SHOW COORDINATES
var mousePosCartesian = new Cesium.Cartesian3();
var cartesianCamera = new Cesium.Cartesian3();
export var cartographicCamera = new Cesium.Cartographic();
var cartographic = new Cesium.Cartographic();
var camera = viewer.scene.camera;
var ellipsoid = viewer.scene.globe.ellipsoid;
var height = 1;

// EVENTS HANDLING
let handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

// MOUSE MOVE
handler.setInputAction(({ endPosition }) => {
  const ray = viewer.camera.getPickRay(endPosition);
  mousePosCartesian = viewer.scene.globe.pick(ray, viewer.scene);
  if (mousePosCartesian) {
    cartographic = ellipsoid.cartesianToCartographic(
      invAdjustCartesianCoords(mousePosCartesian, isOptimizedPolarTerrain)
    );
    //console.log(cartographic);
    // var longitudeString = Cesium.Math.toDegrees(cartographic.longitude).toFixed(
    //   3
    // );
    // var latitudeString = Cesium.Math.toDegrees(cartographic.latitude).toFixed(
    //   3
    // );

    // height = cartographic.height;
    // var lbl =
    //   "Cursor: (Lon,Lat,H)=" +
    //   longitudeString +
    //   ",&nbsp;" +
    //   latitudeString +
    //   ",&nbsp;" +
    //   (height * 0.001).toFixed(1);
    // updateCoordsDisplay(lbl);
    setStatusBarCursorPosition(
      Cesium.Math.toDegrees(cartographic.longitude),
      Cesium.Math.toDegrees(cartographic.latitude),
      cartographic.height
    );

    var c2cDistance = Cesium.Cartesian3.distance(
      mousePosCartesian,
      camera.positionWC
    );
    // var c2cDistanceS;
    // if (c2cDistance < 1000.0) {
    //   c2cDistanceS = c2cDistance.toFixed(3) + " m";
    // } else {
    //   c2cDistanceS = (c2cDistance / 1000.0).toFixed(3) + " km";
    // }
    // var c2cDistanceLbl = "Observer to Cursor Distance: " + c2cDistanceS;
    // setCamera2CursorDistanceLabel(c2cDistanceLbl);
    setStatusBarObs2CursorDist(c2cDistance);
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// LEFT DOUBLE CLICK
handler.setInputAction(() => {
  if (
    !Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY) &&
    !viewer.trackedEntity
  ) {
    // console.log("reset transform");
    // reset camera transfor to emulate Cesium behavior when an entity is tracked
    camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

// LEFT CLICK
var mouseClickPosCartesian;
handler.setInputAction(() => {
  if (
    (rotateCameraAroundPointEnabled ||
      rotateCameraAroundPointLightInFrontEnabled) &&
    !mouseClickPosCartesian
  ) {
    mouseClickPosCartesian = Cesium.Cartesian3.clone(mousePosCartesian);
    // start rotating
    if (rotateCameraAroundPointLightInFrontEnabled) {
      initializeRotateCameraAroundPointLightInFront(mouseClickPosCartesian);
    } else {
      rotateCameraAroundPoint(mouseClickPosCartesian);
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

///////////////////////////////////////////////////////////
// KEYBOARD NAVIGATION
//// !!!!SHARED WITH QUICKMAP-3D
// viewer.canvas.setAttribute('tabindex', '0'); // needed to put focus on the canvas
function getFlagForKeyCode(keyCode) {
  switch (keyCode) {
    case "Down": // IE/Edge specific value
    case "ArrowDown":
      return "up";
    case "Up": // IE/Edge specific value
    case "ArrowUp":
      return "down";
    case "Left": // IE/Edge specific value
    case "ArrowLeft":
      return "left";
    case "Right": // IE/Edge specific value
    case "ArrowRight":
      return "right";
    case "a":
      return "forward";
    case "z":
      return "back";
    default:
      return undefined;
  }
}
const flags = {
  up: {
    action: "rotateUp",
    shiftAction: "lookUp",
  },
  down: {
    action: "rotateDown",
    shiftAction: "lookDown",
  },
  left: {
    action: "rotateLeft",
    shiftAction: "twistLeft",
  },
  right: {
    action: "rotateRight",
    shiftAction: "twistRight",
  },
  forward: {
    action: "moveForward",
  },
  back: {
    action: "moveBackward",
  },
};

// for optimization. Will contain the active keys
const flagsActive = {};

let isShiftPressed = false;
function handleKeyDown(e) {
  if (e.defaultPrevented) {
    return; // Do nothing if the event was already processed
  }
  if (e.key === "Shift") {
    isShiftPressed = true;
    return;
  }
  var flagName = getFlagForKeyCode(e.key);

  if (typeof flagName !== "undefined") {
    flags[flagName].active = true;
    // add to active flags
    flagsActive[flagName] = flags[flagName];
  }
}
function handleKeyUp(e) {
  if (e.defaultPrevented) {
    return; // Do nothing if the event was already processed
  }
  if (e.key === "Shift") {
    isShiftPressed = false;
    return;
  }
  var flagName = getFlagForKeyCode(e.key);
  if (typeof flagName !== "undefined") {
    if (flags[flagName].active === true) {
      flags[flagName].active = false;
      // remove from active flags
      delete flagsActive[flagName];
    }
  }
}
document.addEventListener("keydown", handleKeyDown, false);

document.addEventListener("keyup", handleKeyUp, false);

const _rotateRateRangeAdjustment = viewer.scene.globe.ellipsoid.maximumRadius;
const _rotateFactor = 1.0 / _rotateRateRangeAdjustment;
const _rotateMaximum = 1.77;
const _rotateMinimum = 1.0 / 5000.0;
function handleKeyboardControls(clock) {
  var moveRate;
  var rotationRate;

  Object.entries(flagsActive).forEach(([key, { action, shiftAction }]) => {
    const op = (isShiftPressed ? shiftAction : action) ?? action;
    let rate;
    if (op.includes("move")) {
      if (moveRate == null) {
        const cameraHeight = cartographicCamera.height;
        moveRate = cameraHeight / 100.0;
      }
      rate = moveRate;
    }
    if (op.includes("rotate")) {
      if (rotationRate == null) {
        var rho = Cesium.Cartesian3.magnitude(viewer.camera.positionWC);

        rotationRate =
          Math.max(
            Math.min(
              _rotateMaximum,
              _rotateFactor * (rho - _rotateRateRangeAdjustment)
            ),
            _rotateMinimum
          ) * 0.01;
      }
      rate = rotationRate;
      // console.log(rotationRate);
    }
    if (op.includes("look")) {
      rate = 0.01;
    }
    viewer?.camera?.[op]?.(rate);
  });
}

viewer.clock.onTick.addEventListener(handleKeyboardControls);
// KEYBOARD NAVIGATION - END
///////////////////////////////////////////////////////////

function rad2deg(radians) {
  return radians * (180.0 / Math.PI);
}

function deg2rad(degrees) {
  return degrees * (Math.PI / 180.0);
}

function cameraPositionUpdated() {
  // console.log("updating camera position...");
  ellipsoid.cartesianToCartographic(
    invAdjustCartesianCoords(camera.positionWC, isOptimizedPolarTerrain),
    cartographicCamera
  );
  // the camera stopped moving
  var camLat = Cesium.Math.toDegrees(cartographicCamera.latitude);
  var camLon = Cesium.Math.toDegrees(cartographicCamera.longitude);
  var camH = cartographicCamera.height * 0.001; // km
  var lbl =
    "Camera: (Lon,Lat,H)=" +
    camLon.toFixed(3) +
    ",&nbsp;" +
    camLat.toFixed(3) +
    ",&nbsp;" +
    camH.toFixed(1) +
    "&nbsp;&nbsp;--&nbsp;&nbsp;" +
    "(R,P,Y)=" +
    rad2deg(camera.roll).toFixed(1) +
    ",&nbsp;" +
    rad2deg(camera.pitch).toFixed(1) +
    ",&nbsp;" +
    rad2deg(camera.heading).toFixed(1);
  updateCameraCoordsDisplay(lbl);
  setStatusBarCameraHeight(camH);

  maybeUpdateTerrainProvider(camLat, camH);
  maybeUpdateContours(camH);

  // update view model
  // viewModel.camera_position = camera.position;
  // viewModel.camera_direction = camera.direction;
  // viewModel.camera_up = camera.up;

  viewModel.setCameraPandO(camera.position, camera.direction, camera.up);

  maybeUpdateShadowsMaxDistance();
}

viewer.camera.moveEnd.addEventListener(() => {
  cameraPositionUpdated();
  if (flyingToNewPositionStarted) {
    flyingToNewPositionStarted = false;
  }
});

viewer.camera.changed.addEventListener(() => {
  // this is exected after the camera has changed by percentageChanged
  if (flyingToNewPositionStarted) {
    // avoid too many camera updates
    return;
  }
  cameraPositionUpdated();
});

function setHeightKm(heightInKilometers) {
  ellipsoid.cartesianToCartographic(camera.position, cartographicCamera);
  cartographicCamera.height = heightInKilometers * 1000; // convert to meters
  ellipsoid.cartographicToCartesian(cartographicCamera, cartesianCamera);
  camera.position = cartesianCamera;
}

// TBD: need to move the UI initialization code inside initializeUI for better UI-engine separation
initializeUI();

// Show the coords display below the toobar buttons.
// var cameraCoordsDisplay = document.createElement("div");
// cameraCoordsDisplay.style.background = "rgba(42, 42, 42, 0.7)";
// cameraCoordsDisplay.style.padding = "5px 10px";
// document.getElementById("toolbar-label").appendChild(cameraCoordsDisplay);

var cameraCoordsDisplay = addStatusBarDetailInfo();

var subSolarPointDisplay = addStatusBarDetailInfo();

// // Show the coords display below the toobar buttons.
// coordsDisplay.style.background = "rgba(42, 42, 42, 0.7)";
// coordsDisplay.style.padding = "5px 10px";
// document.getElementById("toolbar-label").appendChild(coordsDisplay);

// // Show camera to cursor distance.
// camera2CursorDistance.style.background = "rgba(42, 42, 42, 0.7)";
// camera2CursorDistance.style.padding = "5px 10px";
// document.getElementById("toolbar-label").appendChild(camera2CursorDistance);

// current terrain label
// var terrainDisplay = document.createElement("div");
// terrainDisplay.style.background = "rgba(42, 42, 42, 0.7)";
// terrainDisplay.style.padding = "5px 10px";
// if (window.LIS_MODE === "development") {
//   document.getElementById("toolbar-label").appendChild(terrainDisplay);
// }
var terrainDisplay;
if (window.LIS_MODE === "development") {
  terrainDisplay = addStatusBarDetailInfo();
}

// current shadows max distance label
// var shadowsMaxDistanceDisplay = document.createElement("div");
// shadowsMaxDistanceDisplay.style.background = "rgba(42, 42, 42, 0.7)";
// shadowsMaxDistanceDisplay.style.padding = "5px 10px";
// if (window.LIS_MODE === "development") {
//   document
//     .getElementById("toolbar-label")
//     .appendChild(shadowsMaxDistanceDisplay);
// }

var shadowsMaxDistanceDisplay;
if (window.LIS_MODE === "development") {
  shadowsMaxDistanceDisplay = addStatusBarDetailInfo();
}

//Move the far wall of the viewing frustum.
viewer.scene.camera.frustum.far = 1e12;

initializeBodiesSPICE();

document.addEventListener("bodiesPosUpdated", function (e) {
  updateEntityVectors(false);
  if (rotateCameraAroundPointLightInFrontEnabled) {
    rotateCameraAroundPointLightInFront(mouseClickPosCartesian);
  }
});

/////
// add entities
var entitySphereRadius = 50;
for (var locationName in QTSConfig.locationsInfo) {
  var location = QTSConfig.locationsInfo[locationName];
  // add entity
  location.entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(
      location.longitude,
      location.latitude,
      location.height,
      Cesium.Ellipsoid.WGS84
    ),
    ellipsoid: {
      radii: new Cesium.Cartesian3(
        entitySphereRadius,
        entitySphereRadius,
        entitySphereRadius
      ),
      material: location.color,
      shadows: Cesium.ShadowMode.ENABLED,
    },
  });
  // console.log(location.entity.position.getValue(viewer.clock.currentTime));
}

var entitySelected;
function setSelectedEntity(location) {
  entitySelected = location.entity;

  updateEntityVectors(true);

  // update view model
  viewModel.selectedLocationName = location.name;
}

const deltaT = 10;
var entities = viewer.entities.values;
export function setLocation(location) {
  if (location.entity) {
    setSelectedEntity(location);
    //   viewer.zoomTo(entity, new Cesium.HeadingPitchRange(0.5,-0.2,20000));
    //    viewer.zoomTo(entitySelected, new Cesium.HeadingPitchRange(0,-3.14,20000));

    var newCameraPos = Cesium.Cartesian3.fromDegrees(
      location.longitude,
      location.latitude,
      location.height + 20000,
      ellipsoid
    );

    cameraFlyToLookDownNorthUp(scene.camera, newCameraPos, ellipsoid, deltaT);
  }
}

function setCustomCameraView() {
  // Set view with heading, pitch and roll
  viewer.camera.setView({
    destination: adjustCartesianCoords(
      Cesium.Cartesian3.fromDegrees(
        68.924,
        -89.394,
        4900,
        Cesium.Ellipsoid.WGS84
      ),
      isOptimizedPolarTerrain
    ),
    orientation: {
      heading: Cesium.Math.toRadians(215.2),
      pitch: Cesium.Math.toRadians(-19.3),
      roll: Cesium.Math.toRadians(360.0),
    },
  });
}

// ENTITY TO SUN/EARTH VECTORS
var itemToBodyArrowEntities = {};
var entityToBodyArrowTipPos = {};
function getSelectedEntityToBodyLinePositionsCallbackFunction(body) {
  return function selectedEntityToBodyLinePositionsFunction() {
    return [entityCartesianPos, entityToBodyArrowTipPos[body]];
  };
}

for (var body in QTSConfig.lightSource) {
  if (QTSConfig.lightSource[body].hasOwnProperty("entityVectorParams")) {
    var itemToBodyArrow = viewer.entities.add({
      name: "Item to " + body + " vector",
      polyline: {
        // for synchronously line drawing
        positions: new Cesium.CallbackProperty(
          getSelectedEntityToBodyLinePositionsCallbackFunction(body),
          false
        ),
        width: QTSConfig.lightSource[body].entityVectorParams.width,
        arcType: Cesium.ArcType.NONE,
        material: new Cesium.PolylineArrowMaterialProperty(
          QTSConfig.lightSource[body].entityVectorParams.color
        ),
      },
      show: true,
    });
    itemToBodyArrowEntities[body] = itemToBodyArrow;
    // initialize arrow tips
    entityToBodyArrowTipPos[body] = new Cesium.Cartesian3();
  }
}

var entityCartesianPos;
var entityToBodyVec = new Cesium.Cartesian3();
var entityToBodyVecNorm = new Cesium.Cartesian3();
var entityToBodyVecScaled = new Cesium.Cartesian3();
function updateEntityVectors(entityChanged) {
  if (entityChanged) {
    entityCartesianPos = entitySelected.position.getValue(
      viewer.clock.currentTime
    );
  }

  var bodySPICEPosition;
  for (var body in itemToBodyArrowEntities) {
    if (itemToBodyArrowEntities[body].show) {
      bodySPICEPosition = getBodySPICEPosition(body);
      if (bodySPICEPosition) {
        Cesium.Cartesian3.subtract(
          bodySPICEPosition,
          entityCartesianPos,
          entityToBodyVec
        );
        Cesium.Cartesian3.normalize(entityToBodyVec, entityToBodyVecNorm);
        Cesium.Cartesian3.multiplyByScalar(
          entityToBodyVecNorm,
          4 * entitySphereRadius,
          entityToBodyVecScaled
        );
        Cesium.Cartesian3.add(
          entityToBodyVecScaled,
          entityCartesianPos,
          entityToBodyArrowTipPos[body]
        );
      }
    }
  }
}

var SUBSOLAR_POINT_UPDATE_TRIGGER_INTERVAL = 1000; // ms
var updateSubSolarPointTimerId = -1;
var lastSubSolarPointTriggerTime;
export function resetSubSolarPointUpdateTimer() {
  if (updateSubSolarPointTimerId > 0) {
    // stop timer
    clearInterval(updateSubSolarPointTimerId);
    updateSubSolarPointTimerId = -1;
  }
}

function maybeUpdateSubSolarPoint() {
  if (
    lastSubSolarPointTriggerTime &&
    Cesium.JulianDate.equals(lastSubSolarPointTriggerTime, viewModel.UTCTime)
  ) {
    // nothing to be done
    return;
  }

  lastSubSolarPointTriggerTime = Cesium.JulianDate.clone(viewModel.UTCTime);

  if (updateSubSolarPointTimerId >= 0) {
    // reset the timer
    resetSubSolarPointUpdateTimer();
  }

  // let us set the timer
  updateSubSolarPointTimerId = setInterval(
    updateSubSolarPoint,
    SUBSOLAR_POINT_UPDATE_TRIGGER_INTERVAL
  );

  // reset subsolar point info
  updateSubSolarPointDisplay();
}

// compute sub solar point
async function updateSubSolarPoint() {
  resetSubSolarPointUpdateTimer();

  // build url to get sub solar point
  var act_subsolar_points_url =
    "https://mare3.actgate.com/fcgi-bin/fprovweb.exe?_xtype=text/plain&dsource=satview&verbose=0&version=0&target=" +
    QTSConfig.observer +
    "&time=" +
    Cesium.JulianDate.toIso8601(viewModel.UTCTime, 3).replace("Z", "") +
    "&oformat=json&cmd_script=satview_get_subsolar_records.msh";

  // console.log(act_subsolar_points_url);
  var response = await fetch(act_subsolar_points_url);
  var subSolarPos = await response.json();
  if (subSolarPos.status !== 0) {
    console.log("subsolar pos retrieve error: " + subSolarPos.error);
    return;
  }
  if (subSolarPos.records?.length !== 1) {
    console.log("invalid sub solar record");
    return;
  }
  let subSolarPosRecord = subSolarPos.records[0];
  updateSubSolarPointDisplay(
    subSolarPosRecord.SubSolLON,
    subSolarPosRecord.SubSolLAT
  );
}

var POICartesianPos = new Cesium.Cartesian3();
var POIToLightVec = new Cesium.Cartesian3();
var POIToCameraVec = new Cesium.Cartesian3();
var POIToLightOVec = new Cesium.Cartesian3();
var POIToCameraOVec = new Cesium.Cartesian3();
var crossVec = new Cesium.Cartesian3();

const pithCorrectTh = deg2rad(0.01);
var referenceFramePrimitive;
function setCameraPivotPoint(pointCartesianCoords) {
  if (cancelOrbitEventHandler) cancelOrbitEventHandler();
  if (!pointCartesianCoords) return false;

  var transform = Cesium.Transforms.eastNorthUpToFixedFrame(
    pointCartesianCoords,
    ellipsoid
  );

  // console.log("camera pitch: " + camera.pitch + "(deg: " + rad2deg(camera.pitch) +")");
  if (Math.abs(camera.pitch) > Math.PI / 2 - pithCorrectTh) {
    // note: slightly change the pitch as there could be rotation issues around Z axis when changing transformation
    // Cesium issue???
    const p = camera.pitch + pithCorrectTh;
    const h = 0;
    const m = Cesium.Cartesian3.distance(
      camera.positionWC,
      pointCartesianCoords
    );
    camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(h, p, m));
  } else {
    // View in east-north-up frame
    // camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    camera.lookAtTransform(transform);
  }

  // console.log("camera pitch: " + camera.pitch + "(deg: " + rad2deg(camera.pitch) +")");

  // referenceFramePrimitive = scene.primitives.add(
  //   new Cesium.DebugModelMatrixPrimitive({
  //     modelMatrix: transform,
  //     length: 10000.0,
  //   })
  // );

  return true;
}

var cancelOrbitEventHandler = null;
function rotateCameraAroundPoint(pointCartesianCoords) {
  if (!setCameraPivotPoint(pointCartesianCoords)) {
    return;
  }

  const deltaAngle = deg2rad(0.05);
  cancelOrbitEventHandler = viewer.clock.onTick.addEventListener(() => {
    viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, deltaAngle);
  });
}

function initializeRotateCameraAroundPointLightInFront(pointCartesianCoords) {
  if (!setCameraPivotPoint(pointCartesianCoords)) {
    return;
  }

  rotateCameraAroundPointLightInFront(pointCartesianCoords);
}

const PI2 = 2 * Math.PI;
function rotateCameraAroundPointLightInFront(pointCartesianCoords) {
  if (!pointCartesianCoords) return;

  let lightPosSPICE = getLightSourceSPICEPosition();
  if (!lightPosSPICE) return;

  // POI to sun vector
  Cesium.Cartesian3.subtract(
    lightPosSPICE,
    pointCartesianCoords,
    POIToLightVec
  );
  Cesium.Cartesian3.normalize(POIToLightVec, POIToLightVec);
  // POI to camera vector
  Cesium.Cartesian3.subtract(
    camera.positionWC,
    pointCartesianCoords,
    POIToCameraVec
  );
  Cesium.Cartesian3.normalize(POIToCameraVec, POIToCameraVec);

  // compute orthogonal vectors (they are on the same plane)
  Cesium.Cartesian3.normalize(pointCartesianCoords, POICartesianPos);
  Cesium.Cartesian3.cross(POIToLightVec, POICartesianPos, POIToLightOVec);
  Cesium.Cartesian3.cross(POIToCameraVec, POICartesianPos, POIToCameraOVec);
  // compute angle between then
  // var toLightVsToCameraAngle = Cesium.Cartesian3.angleBetween(POIToLightOVec, POIToCameraOVec);
  // Note: Extracted from Cartesian3.angleBetween, for optimization purposes
  var cosine = Cesium.Cartesian3.dot(POIToLightOVec, POIToCameraOVec);
  Cesium.Cartesian3.cross(POIToLightOVec, POIToCameraOVec, crossVec);
  var sine = Cesium.Cartesian3.magnitude(crossVec);
  var toLightVsToCameraAngle = Math.atan2(sine, cosine);

  // adjust the sign of the angle
  // Use cross product of the two vectors to get the normal of the plane formed by the two vectors.
  // Then check the dotproduct between that and the original plane normal to see if they are facing
  // the same direction.
  if (Cesium.Cartesian3.dot(POICartesianPos, crossVec) < 0) {
    toLightVsToCameraAngle = PI2 - toLightVsToCameraAngle;
  }

  // rotate camera for having the sun in front
  const deltaAngle = toLightVsToCameraAngle - Math.PI;
  // console.log("rotate camera by angle: " + rad2deg(deltaAngle));
  viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, deltaAngle);
}

// set initial state
reset();
setSceneLight("SUN");
updateTerrainMeshMaxError(QTSConfig.defaultMeshMaxError);
// terrain mesh error
var terrainMeshMaxErrorIdx = maxErrorList.indexOf(
  QTSConfig.defaultMeshMaxError
);
if (terrainMeshMaxErrorIdx >= 0) {
  terrainMaxErrMenu.selectedIndex = terrainMeshMaxErrorIdx;
}
newTerrainNameSelected(
  QTSConfig.defaultTerrainName,
  QTSConfig.defaultTerrainNormalsEnabled,
  true
);
let defaultStartUTCTime;
if (QTSConfig.hasOwnProperty("defaultStartUTCTime")) {
  defaultStartUTCTime = TSConfig.defaultStartUTCTime;
}
let defaultStopUTCTime;
if (QTSConfig.hasOwnProperty("defaultStoptUTCTime")) {
  defaultStopUTCTime = TSConfig.defaultStoptUTCTime;
}
initializeTime(
  QTSConfig.defaultUTCTime,
  defaultStartUTCTime,
  defaultStopUTCTime
);

// set location
/*
locationMenu.selectedIndex = defaultLocationIndex;
locationToolbarOptions[defaultLocationIndex].onselect();
*/
var defaultLocation = QTSConfig.locationsInfo[QTSConfig.defaultLocationName];
if (defaultLocation) {
  setLocation(defaultLocation);
}

// shadows max distance
var shadowsMaxDistanceIdx = shadowsMaxDistList.indexOf(
  defaultShadowMapMaxDistance
);
if (shadowsMaxDistanceIdx >= 0) {
  shadowsMaxDistMenu.selectedIndex = shadowsMaxDistanceIdx;
  shadowsMaxDistOptions[shadowsMaxDistanceIdx].onselect();
}

var setContourEnabled = setContourEnabledFunction();
setContourEnabled(QTSConfig.enableContour);

// CONTOUR
var contourColor = Cesium.Color.RED.clone();
var contourUniforms = {};
var countoursVisible = false;

function maybeUpdateContours(height) {
  if (!viewModel.contourEnabled) {
    // nothing to do
    return;
  }

  if (!height) {
    // get current camera lat
    ellipsoid.cartesianToCartographic(
      invAdjustCartesianCoords(camera.positionWC, isOptimizedPolarTerrain),
      cartographicCamera
    );
    height = cartographicCamera.height * 0.001; // km
  }

  if (
    (countoursVisible && height > QTSConfig.showContourAlt) ||
    (!countoursVisible && height < QTSConfig.showContourAlt)
  ) {
    updateContours(height);
  }
}

function updateContours(height) {
  var hasContour = viewModel.contourEnabled;
  var material;
  countoursVisible = false;
  if (hasContour) {
    if (!height) {
      // get current camera lat
      ellipsoid.cartesianToCartographic(
        invAdjustCartesianCoords(camera.positionWC, isOptimizedPolarTerrain),
        cartographicCamera
      );
      height = cartographicCamera.height * 0.001; // km
    }

    if (height < QTSConfig.showContourAlt) {
      material = Cesium.Material.fromType("ElevationContour");
      contourUniforms = material.uniforms;
      contourUniforms.width = QTSConfig.contourWidth;
      contourUniforms.spacing = QTSConfig.contourSpacing;
      contourUniforms.color = contourColor;

      countoursVisible = true;
    }
  }

  globe.material = material;
}

maybeUpdateContours();

function loadStateFromQueryString() {
  var searchParams = new URL(window.location).searchParams;

  // time
  var startUTCTime;
  if (searchParams.has("startUTCTime")) {
    startUTCTime = searchParams.get("startUTCTime");
  }

  var stopUTCTime;
  if (searchParams.has("stopUTCTime")) {
    stopUTCTime = searchParams.get("stopUTCTime");
  }

  var currTime;
  if (searchParams.has("UTCTime")) {
    currTime = searchParams.get("UTCTime");
    setTime(currTime);
  } else {
    currTime = Cesium.JulianDate.toIso8601(viewModel.UTCTime, 3);
  }

  // if (startUTCTime !== undefined || stopUTCTime !== undefined) {
  initializeTime(currTime, startUTCTime, stopUTCTime);
  // }

  // illumination
  if (searchParams.has("lightSource")) {
    var lightSource = searchParams.get("lightSource");
    let lightSourceOpt = illuminationOptions.find((option) => {
      return option.text.toLowerCase().startsWith(lightSource.toLowerCase());
    });
    let lightSourceIdx = illuminationOptions.indexOf(lightSourceOpt);
    if (lightSourceIdx >= 0) {
      illuminationMenu.selectedIndex = lightSourceIdx;
      illuminationOptions[lightSourceIdx].onselect();
    }
  }

  // terrain mesh max error
  if (searchParams.has("terrainMeshMaxError")) {
    var terrainMeshMaxError = searchParams.get("terrainMeshMaxError");
    terrainMeshMaxErrorIdx = maxErrorList.indexOf(
      terrainMeshMaxError === "auto"
        ? terrainMeshMaxError
        : parseFloat(terrainMeshMaxError)
    );
    if (terrainMeshMaxErrorIdx >= 0) {
      terrainMaxErrMenu.selectedIndex = terrainMeshMaxErrorIdx;
      terrainMaxErrOptions[terrainMeshMaxErrorIdx].onselect();
    }
  }

  // terrain mesh algorithm
  if (searchParams.has("terrainMeshAlgorithm")) {
    var terrainMeshAlgorithm = searchParams.get("terrainMeshAlgorithm");
    var terrainMeshAlgorithmIdx = terrainMeshAlgorithmList.indexOf(
      terrainMeshAlgorithm
    );
    if (terrainMeshAlgorithmIdx >= 0) {
      if (Cesium.defined(terrainMeshAlgMenu)) {
        terrainMeshAlgMenu.selectedIndex = terrainMeshAlgorithmIdx;
      }
      terrainMeshAlgorithmOptions[terrainMeshAlgorithmIdx].onselect();
    }
  }

  // terrain vertex normals enabled
  if (searchParams.has("terrainVertexNormalsEnabled")) {
    var checked = searchParams.get("terrainVertexNormalsEnabled") === "true";
    enableVertexNormalsCbx.checked = checked;
    var setVertextNormalsEnabled = setTerrainNormalsEnabledFunction();
    setVertextNormalsEnabled(checked);
  }

  // terrain provider
  if (searchParams.has("terrainProviderName")) {
    var terrainProviderName = searchParams.get("terrainProviderName");
    // terrainMenu.selectedIndex = terrainProviderIdx;
    // terrainOptions[terrainProviderIdx].onselect();
    newTerrainNameSelected(terrainProviderName, true);
  }

  // camera position and orientation
  if (
    searchParams.has("camera_position") &&
    searchParams.has("camera_direction") &&
    searchParams.has("camera_up")
  ) {
    var camera_position = Cesium.Cartesian3.unpack(
      searchParams.get("camera_position").split(",").map(Number)
    );
    var camera_direction = Cesium.Cartesian3.unpack(
      searchParams.get("camera_direction").split(",").map(Number)
    );
    var camera_up = Cesium.Cartesian3.unpack(
      searchParams.get("camera_up").split(",").map(Number)
    );

    // adjust coordinates based on current terrain
    camera_position = adjustCartesianCoords(
      camera_position,
      isOptimizedPolarTerrain
    );
    camera_direction = adjustCartesianCoords(
      camera_direction,
      isOptimizedPolarTerrain
    );
    camera_up = adjustCartesianCoords(camera_up, isOptimizedPolarTerrain);

    viewer.scene.camera.flyTo({
      destination: camera_position,
      orientation: {
        direction: camera_direction,
        up: camera_up,
      },
    });
  } else if (
    searchParams.has("ul") &&
    searchParams.has("ur") &&
    searchParams.has("lr") &&
    searchParams.has("ll")
  ) {
    var ul = Cesium.Cartesian3.unpack(
      searchParams.get("ul").split(",").map(Number)
    );
    var ur = Cesium.Cartesian3.unpack(
      searchParams.get("ur").split(",").map(Number)
    );
    var lr = Cesium.Cartesian3.unpack(
      searchParams.get("lr").split(",").map(Number)
    );
    var ll = Cesium.Cartesian3.unpack(
      searchParams.get("ll").split(",").map(Number)
    );

    var rrCartesianCoords = [ul, ur, lr, ll];
    var rectangle = Cesium.Rectangle.fromCartesianArray(rrCartesianCoords);

    // var redRectangle = viewer.entities.add({
    //   rectangle: {
    //     coordinates: rectangle,
    //     // material: Cesium.Color.RED.withAlpha(0.5),
    //     outline: true,
    //     outlineColor: Cesium.Color.RED,
    //     // height: 2000,
    //     fill: false,
    //     // clampToGround: true,
    //   },
    // });

    cameraFlyToLookDownNorthUp(viewer.scene.camera, rectangle, ellipsoid);
  }

  // contour enabled
  if (searchParams.has("contourEnabled")) {
    var checked = searchParams.get("contourEnabled") === "true";
    enableContourCbx.checked = checked;
    var setContourEnabled = setContourEnabledFunction();
    setContourEnabled(checked);
  }

  /*
  // shadows fading enabled
  if (searchParams.has("atmSimuEnabled")) {
    var checked = searchParams.get("atmSimuEnabled") === "true";
    enableAtmSimCbx.checked = checked;
    var setAtmSimuEnabled = setAtmSimuEnabledFunction();
    setAtmSimuEnabled(checked);
  }
  */

  // shadows max distance
  if (searchParams.has("shadowsMaxDistance")) {
    var shadowsMaxDistance = searchParams.get("shadowsMaxDistance");
    shadowsMaxDistanceIdx = shadowsMaxDistList.indexOf(
      shadowsMaxDistance === "auto"
        ? shadowsMaxDistance
        : parseFloat(shadowsMaxDistance) / 1000.0
    );
    if (shadowsMaxDistanceIdx >= 0) {
      shadowsMaxDistMenu.selectedIndex = shadowsMaxDistanceIdx;
      shadowsMaxDistOptions[shadowsMaxDistanceIdx].onselect();
    }
  }

  // location
  if (searchParams.has("selectedLocationName")) {
    var locationName = searchParams.get("selectedLocationName");
    if (locationName in QTSConfig.locationsInfo) {
      setSelectedEntity(QTSConfig.locationsInfo[locationName]);
    }
    /*
    var locationNamesList = Object.keys(locationsInfo);
    var locationIdx = locationNamesList.indexOf(locationName);
    if (locationIdx >= 0) {
      locationMenu.selectedIndex = locationIdx;
    }
    */
  }

  // skirts enabled
  if (searchParams.has("skirtsEnabled")) {
    var checked = searchParams.get("skirtsEnabled") === "true";
    if (Cesium.defined(enableSkirtsCbx)) {
      enableSkirtsCbx.checked = checked;
    }
    var setSkirtsEnabled = setSkirtsEnabledFunction();
    setSkirtsEnabled(checked);
  }

  // terrain shadows enabled
  if (searchParams.has("terrainShadowsEnabled")) {
    var checked = searchParams.get("terrainShadowsEnabled") === "true";
    terrainShadowsCbx.checked = checked;
    var setTerrainShadowsEnabled = setTerrainShadowsEnabledFunction();
    setTerrainShadowsEnabled(checked);
  }

  // shadows fading enabled
  if (searchParams.has("shadowsFadingEnabled")) {
    var checked = searchParams.get("shadowsFadingEnabled") === "true";
    enableShadowsFadingCbx.checked = checked;
    var setShadowsFadingEnabled = setShadowsFadingEnabledFunction();
    setShadowsFadingEnabled(checked);
  }

  // layers
  if (searchParams.has("hiresDemRegionsEnabled")) {
    var checked = searchParams.get("hiresDemRegionsEnabled") === "true";
    // enableHiresDemRegionsCbx.checked = checked;
    var setHiresDemRegionsEnabled = setHiresDemRegionsEnabledFunction();
    setHiresDemRegionsEnabled(checked);
  }

  // find layers enabled
  for (var layerObj in QTSConfig.layersInfo) {
    if (searchParams.has(layerObj + "Enabled")) {
      setLayerImageryEnabled(layerObj);
    }
  }

  // nac image
  if (searchParams.has("NACImageID")) {
    var NACImageID = searchParams.get("NACImageID");
    addNACImage(NACImageID);
    var checked = true;
    if (searchParams.has("NACImageEnabled")) {
      checked = searchParams.get("NACImageEnabled") === "true";
    }
    var setNACImageEnabled = setNACImageEnabledFunction();
    setNACImageEnabled(checked);
  }

  // qmap image
  if (
    searchParams.has("QMapImageLayerName") &&
    searchParams.has("QMapImageID")
  ) {
    var QMapImageServerName = searchParams.get("QMapImageServerName");
    var QMapImageLayerName = searchParams.get("QMapImageLayerName");
    var QMapImageID = searchParams.get("QMapImageID");
    var res = addQMapImage(
      QMapImageServerName,
      QMapImageLayerName,
      QMapImageID
    );
    if (res) {
      var checked = true;
      if (searchParams.has("QMapImageEnabled")) {
        checked = searchParams.get("QMapImageEnabled") === "true";
      }
      var setQMapImageEnabled = setQMapImageEnabledFunction();
      setQMapImageEnabled(checked);
    }
  }

  if (
    searchParams.has("terrainAutoMeshMaxErrorMult") &&
    searchParams.has("terrainAutoMeshMaxErrorMin") &&
    searchParams.has("terrainAutoMeshMaxErrorMax") &&
    searchParams.has("terrainAutoMeshMaxErrorThMult")
  ) {
    var terrainAutoMeshMaxErrorMult = searchParams.get(
      "terrainAutoMeshMaxErrorMult"
    );
    var terrainAutoMeshMaxErrorMin = searchParams.get(
      "terrainAutoMeshMaxErrorMin"
    );
    var terrainAutoMeshMaxErrorMax = searchParams.get(
      "terrainAutoMeshMaxErrorMax"
    );
    var terrainAutoMeshMaxErrorThMult = searchParams.get(
      "terrainAutoMeshMaxErrorThMult"
    );
    updateTerrainMeshMaxErrorParams(
      terrainAutoMeshMaxErrorMult,
      terrainAutoMeshMaxErrorMin,
      terrainAutoMeshMaxErrorMax,
      terrainAutoMeshMaxErrorThMult
    );
    refreshMeshControlsParams();
  }

  viewModel.viewModelLoadFinished = true;
}

//Sandcastle_End
Sandcastle.finishedLoading();

// Load QueryString on initial app load
// Note: load after the Sandcastle interface has been fully loaded in order to properly
// override default initial state
loadStateFromQueryString();
