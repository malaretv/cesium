window.CESIUM_BASE_URL = "../../Source/";

import * as Cesium from "../../Source/Cesium.js";

import { resetStateUpdateTimer, viewModel } from "./viewModel.js";

import {
  isOptimizedPolarTerrain,
  maybeUpdateTerrainProvider,
  newTerrainNameSelected,
  resetTerrain,
  updateTerrainMeshMaxError,
} from "./terrainProvider.js";

import {
  cartesianToDummyPolar,
  dummyPolarToCartesian,
  adjustCartesianCoords,
  invAdjustCartesianCoords,
} from "./adjustCartesian.js";

import {
  addGoToButton,
  addTimeButton,
  initializeBaseLayerPicker,
  updateBaseLayerPickerImageryLayers,
  NoneModelIdx,
  WACMosaicNSModelIdx,
  sunVisibilty60mModelIdx,
  getImageryLayerIdx,
} from "./UIcontrols.js";

//Sandcastle_Begin
// LIS changelog
// https://docs.google.com/document/d/197lf-E9bC4HIPmyUZ1Qidc0TZOWlY58k3O5qJ24wb0o/edit?usp=sharing
Cesium.Ellipsoid.WGS84 = new Cesium.Ellipsoid(1737400, 1737400, 1737400);

// tiles settings
// https://lunar-dem-tiles2.quickmap.io/sldem_lola/docs#/default/serve_layer_info_layer_json_get

var defaultUTCTime = "2022-12-04T00:00:00.000Z";
var defaultMeshMaxError = 1;
var defaultTerrainName = "automatic terrain";

var defaultLocationName = "Tycho";

// The viewModel tracks the state of our mini application.
var contoursViewModel = {
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,
};

var showContourAlt = 200; // km

export var viewer = new Cesium.Viewer("cesiumContainer", {
  //  terrainProvider: createTerrainProvider(),
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: false,
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,
  scene3DOnly: true,
});

/*
// TBD: enhance the geocoder (search tool)
var geocoder = viewer.geocoder.viewModel;
geocoder.searchText = "Vienna";
geocoder.flightDuration = 0.0;
geocoder.search();
*/

var scene = viewer.scene;
var globe = scene.globe;
globe.enableLighting = true;
globe.showGroundAtmosphere = false;
globe.baseColor = Cesium.Color.GRAY;
scene.fog.enabled = false;

var shadowMap = viewer.shadowMap;
var defaultShadowMapMaxDistance = 100000.0; // m
shadowMap.softShadows = false;
shadowMap.size = 4096;
shadowMap.normalOffset = false;
shadowMap.darkness = 0; // lower -> darker shadows

viewer.imageryLayers.removeAll();

// update celestial bodies positions using ACT SPICE based service
var sunLightDirectionSPICE = new Cesium.Cartesian3(1, 1, 1);
var sunPosSPICE = new Cesium.Cartesian3(1, 1, 1);
var earthLightDirectionSPICE = new Cesium.Cartesian3(1, 1, 1);
var earthPosSPICE = new Cesium.Cartesian3(1, 1, 1);
var bodiesPosList;
var secsFromStartUTCArray = [];
var lastBodiesPosActiveIndex = -1;

async function updateBodiesPosSPICE() {
  // build url to get the source light direction
  var startUTCTime = viewer.clock.startTime;
  var endUTCTime = viewer.clock.stopTime;
  var nSecs = Cesium.JulianDate.secondsDifference(endUTCTime, startUTCTime);
  // Server limit is max 1000 times returned. Do not pass that limit
  var stepSec = nSecs / 700; //
  // var stepSec = 3600 * 2; // 1 hr
  var act_bodies_pos_moon_url =
    "https://mare3.actgate.com/fcgi-bin/fprovweb.exe?_xtype=text/plain&version=0&start_utc_time=" +
    startUTCTime +
    "&end_utc_time=" +
    endUTCTime +
    "&step_sec=" +
    stepSec +
    "&cmd_script=get_bodies_position_moon.msh";
  console.log(act_bodies_pos_moon_url);
  var response = await fetch(act_bodies_pos_moon_url);
  var bodiesPos = await response.json();
  bodiesPosList = bodiesPos.utc_times;
  // reset
  lastBodiesPosActiveIndex = -1;

  console.log("bodies pos num:");
  console.log(bodiesPosList.length);
  var utc_time;
  secsFromStartUTCArray.length = bodiesPosList.length;
  for (var i = 0; i < bodiesPosList.length; i++) {
    secsFromStartUTCArray[i] = Cesium.JulianDate.secondsDifference(
      Cesium.JulianDate.fromIso8601(bodiesPos.utc_times[i].utc_time),
      startUTCTime
    );
    // console.log(secsFromStartUTCArray[i]);
  }

  updateBodiesPos();
}

function nearestTimeIndexBinarySearch(secsFromStartUTC) {
  let start = 0;
  let end = secsFromStartUTCArray.length - 1;

  while (start <= end) {
    let middle = Math.floor((start + end) / 2);

    if (secsFromStartUTCArray[middle] === secsFromStartUTC) {
      // found the key
      return middle;
    } else if (secsFromStartUTCArray[middle] < secsFromStartUTC) {
      // continue searching to the right
      start = middle + 1;
    } else {
      // search searching to the left
      end = middle - 1;
    }
  }

  // key wasn't found
  if (start === 0 || start === secsFromStartUTCArray.length - 1) {
    return start;
  }

  if (
    Math.abs(secsFromStartUTC - secsFromStartUTCArray[start - 1]) <
    Math.abs(secsFromStartUTC - secsFromStartUTCArray[start])
  ) {
    return start - 1;
  }
  return start;
}

// apply a scale factor to earth size/distance in order to have it nearer to the viewer
// when too far away the earth is not rendered some time when not in the near frustum
var earthScaleFactor = 5.0;
// var earthScaleFactor = 1.0;

function updateBodiesPosToDummyPolar() {
  if (lastBodiesPosActiveIndex < 0) {
    // nothing to do
    return;
  }

  var bodiesPos = bodiesPosList[lastBodiesPosActiveIndex];
  // SUN position
  sunLightDirectionSPICE.x = bodiesPos.SUN.light_direction[0];
  sunLightDirectionSPICE.y = bodiesPos.SUN.light_direction[1];
  sunLightDirectionSPICE.z = bodiesPos.SUN.light_direction[2];
  sunLightDirectionSPICE = adjustCartesianCoords(
    sunLightDirectionSPICE,
    isOptimizedPolarTerrain
  );
  sunPosSPICE.x = bodiesPos.SUN.position[0] * 1000.0;
  sunPosSPICE.y = bodiesPos.SUN.position[1] * 1000.0;
  sunPosSPICE.z = bodiesPos.SUN.position[2] * 1000.0;
  sunPosSPICE = adjustCartesianCoords(sunPosSPICE, isOptimizedPolarTerrain);
  // EARTH position
  earthLightDirectionSPICE.x = bodiesPos.EARTH.light_direction[0];
  earthLightDirectionSPICE.y = bodiesPos.EARTH.light_direction[1];
  earthLightDirectionSPICE.z = bodiesPos.EARTH.light_direction[2];
  earthLightDirectionSPICE = adjustCartesianCoords(
    earthLightDirectionSPICE,
    isOptimizedPolarTerrain
  );
  earthPosSPICE.x = (bodiesPos.EARTH.position[0] * 1000.0) / earthScaleFactor;
  earthPosSPICE.y = (bodiesPos.EARTH.position[1] * 1000.0) / earthScaleFactor;
  earthPosSPICE.z = (bodiesPos.EARTH.position[2] * 1000.0) / earthScaleFactor;
  earthPosSPICE = adjustCartesianCoords(earthPosSPICE, isOptimizedPolarTerrain);
}

function updateEntitiesPos() {
  for (var locationName in locationsInfo) {
    if (locationsInfo.hasOwnProperty(locationName)) {
      var location = locationsInfo[locationName];
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

export function updateGlobeCartesianPositions() {
  var trackedEntity = viewer.trackedEntity;
  if (trackedEntity) {
    // untrack the current entity in order to properly rotate around the globe center
    viewer.trackedEntity = undefined;
  }
  updateBodiesPosToDummyPolar();
  updateEntitiesPos();
  updateEntityVectors(true);
  updateImageryLayersUrl();
  updateBaseLayerPickerImageryLayers();

  // preserve camera position/orientation
  var newCameraPos;
  var newCameraDir;
  var newCameraUp;
  if (isOptimizedPolarTerrain) {
    newCameraPos = cartesianToDummyPolar(camera.position);
    newCameraDir = cartesianToDummyPolar(camera.direction);
    newCameraUp = cartesianToDummyPolar(camera.up);
  } else {
    newCameraPos = dummyPolarToCartesian(camera.position);
    newCameraDir = dummyPolarToCartesian(camera.direction);
    newCameraUp = dummyPolarToCartesian(camera.up);
  }

  camera.position = newCameraPos;
  camera.direction = newCameraDir;
  camera.up = newCameraUp;
}

function updateBodiesPos() {
  if (secsFromStartUTCArray.length <= 0) {
    return;
  }

  var currUTCTime = viewer.clock.currentTime;
  var startUTCTime = viewer.clock.startTime;
  var secsFromStartUTC = Cesium.JulianDate.secondsDifference(
    currUTCTime,
    startUTCTime
  );

  var closestTimeIndex = nearestTimeIndexBinarySearch(secsFromStartUTC);
  if (closestTimeIndex >= 0 && lastBodiesPosActiveIndex !== closestTimeIndex) {
    lastBodiesPosActiveIndex = closestTimeIndex;
    // console.log("found pos idx:");
    // console.log(lastBodiesPosActiveIndex);
    var bodiesPos = bodiesPosList[closestTimeIndex];
    // SUN position
    sunLightDirectionSPICE.x = bodiesPos.SUN.light_direction[0];
    sunLightDirectionSPICE.y = bodiesPos.SUN.light_direction[1];
    sunLightDirectionSPICE.z = bodiesPos.SUN.light_direction[2];
    sunLightDirectionSPICE = adjustCartesianCoords(
      sunLightDirectionSPICE,
      isOptimizedPolarTerrain
    );
    sunPosSPICE.x = bodiesPos.SUN.position[0] * 1000.0;
    sunPosSPICE.y = bodiesPos.SUN.position[1] * 1000.0;
    sunPosSPICE.z = bodiesPos.SUN.position[2] * 1000.0;
    sunPosSPICE = adjustCartesianCoords(sunPosSPICE, isOptimizedPolarTerrain);
    // EARTH position
    earthLightDirectionSPICE.x = bodiesPos.EARTH.light_direction[0];
    earthLightDirectionSPICE.y = bodiesPos.EARTH.light_direction[1];
    earthLightDirectionSPICE.z = bodiesPos.EARTH.light_direction[2];
    earthLightDirectionSPICE = adjustCartesianCoords(
      earthLightDirectionSPICE,
      isOptimizedPolarTerrain
    );
    earthPosSPICE.x = (bodiesPos.EARTH.position[0] * 1000.0) / earthScaleFactor;
    earthPosSPICE.y = (bodiesPos.EARTH.position[1] * 1000.0) / earthScaleFactor;
    earthPosSPICE.z = (bodiesPos.EARTH.position[2] * 1000.0) / earthScaleFactor;
    earthPosSPICE = adjustCartesianCoords(
      earthPosSPICE,
      isOptimizedPolarTerrain
    );

    updateEntityVectors(false);

    /*
console.log("sun pos");
console.log(sunPosSPICE);
console.log("earth pos");
console.log(earthPosSPICE);
*/
  }
}

// avoid to flood the server with requests
// let us send a request when a certain amount of events is reached
// or when a timer expires
// define some constants
var lastBodiesUpdateTime = -1;
function maybeUpdateBodiesPosSPICE() {
  if (scene.light === sunLightSPICE || scene.light === earthLightSPICE) {
    var date = viewer.clock.currentTime;
    var time = Cesium.JulianDate.toIso8601(date, 3);
    if (lastBodiesUpdateTime !== time) {
      lastBodiesUpdateTime = time;
      updateBodiesPos();
    }
  }
}

var sunLightSPICE = new Cesium.DirectionalLight({
  direction: sunLightDirectionSPICE,
  color: Cesium.Color.WHITE,
  intensity: 2,
});

var earthLightSPICE = new Cesium.DirectionalLight({
  direction: earthLightDirectionSPICE,
  color: new Cesium.Color(0.9, 0.925, 1.0),
  intensity: 1,
});

scene.preRender.addEventListener(function (scene, time) {
  if (scene.light === sunLightSPICE) {
    scene.light.direction = sunLightDirectionSPICE;
  } else if (scene.light === earthLightSPICE) {
    scene.light.direction = earthLightDirectionSPICE;
  }
});

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
}

function initializeTime(currentTimeIso8601, startTimeIso8601, stopTimeIso8601) {
  var currentTime = Cesium.JulianDate.fromIso8601(currentTimeIso8601);
  var stopTime;
  if (stopTimeIso8601 === undefined) {
    stopTime = Cesium.JulianDate.addDays(
      currentTime,
      29 * 2,
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

  /*
  // lunar day: 29 days, 12 hr, 44 min, 3 sec
  var endTime = Cesium.JulianDate.addDays(
  currentTime,
  29,
  new Cesium.JulianDate()
  );
  endTime = Cesium.JulianDate.addHours(
  endTime,
  12,
  new Cesium.JulianDate()
  );
  endTime = Cesium.JulianDate.addMinutes(
  endTime,
  44,
  new Cesium.JulianDate()
  );
  endTime = Cesium.JulianDate.addSeconds(
  endTime,
  3,
  new Cesium.JulianDate()
  );
  */

  var isTimeRangeChanged = false;
  if (
    viewer.clock.startTime !== startTime ||
    viewer.clock.stopTime !== stopTime
  ) {
    isTimeRangeChanged = true;
  }

  viewer.clock.currentTime = currentTime;
  viewer.clock.startTime = startTime;
  viewer.clock.stopTime = stopTime;
  viewer.timeline.zoomTo(startTime, stopTime);

  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;

  viewModel.startUTCTime = startTime;
  viewModel.stopUTCTime = stopTime;
  viewModel.UTCTime = currentTime;

  if (isTimeRangeChanged) {
    updateBodiesPosSPICE();
  }
}

function setTime(iso8601) {
  var currentTime = Cesium.JulianDate.fromIso8601(iso8601);
  viewer.clock.currentTime = currentTime;
}

function reset() {
  // Set scene defaults
  // Don't show the default Sun
  scene.sun.show = false;
  scene.moon.show = false;
  // Turn off the sky box
  scene.skyBox.show = false;
  sunSPICE.show = true;
  earthSPICE.show = true;

  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.dynamicAtmosphereLightingFromSun = false;
  resetStateUpdateTimer();
}

var coordsDisplay = document.createElement("div");
function updateCoordsDisplay(msg) {
  coordsDisplay.innerHTML = msg;
}

var cameraCoordsDisplay = document.createElement("div");
function updateCameraCoordsDisplay(msg) {
  cameraCoordsDisplay.innerHTML = msg;
}

var terrainDisplay = document.createElement("div");
export function updateTerrainDisplay(msg) {
  terrainDisplay.innerHTML = msg;
}

/*
function updateTimeDisplay() {
  var msg =
    "Time: " + Cesium.JulianDate.toIso8601(viewer.clock.currentTime, 3);
  setTimeDisplay(msg);
}

var timeDisplay = document.createElement("div");
function setTimeDisplay(msg) {
  timeDisplay.innerHTML = msg;
}
*/

// CONTROLS
var illuminationOptions = [
  {
    text: "Sun -> Moon (SatV)",
    onselect: function () {
      console.log("SUN -> Moon selected...");
      reset();
      setSceneLight(sunLightSPICE);
    },
  },
  {
    text: "Earth -> Moon (SatV)",
    onselect: function () {
      console.log("Earth -> Moon selected...");
      reset();
      setSceneLight(earthLightSPICE);
    },
  },
];

function setSceneLight(lightSource) {
  scene.light = lightSource;

  // update model
  viewModel.lightSourceIdx = illuminationMenu.selectedIndex;
}

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
  }
}

export function setCurrTerrainLabelVisible(showLbl) {
  if (showLbl) {
    terrainDisplay.removeAttribute("hidden");
  } else {
    terrainDisplay.setAttribute("hidden", "");
  }
}

//////////////////////////////////////////////////
//////////// TERRAIN /////////////////////////////
//////////////////////////////////////////////////
/*
var terrainNameList = [
  "automatic terrain",
  "automatic terrain" + noNormalsNameSuffix,
  "sldem_lola",
  "sldem_lola" + noNormalsNameSuffix,
  "usgs_lola",
  // "NASA JPL - no normals",
  // "Optimized PolarDEM",
  // "Optimized PolarDEM" + noNormalsNameSuffix,
  "GOTM",
  "GOTM" + noNormalsNameSuffix,
  // "GOTM (High Res)",
  // "GOTM (High Res)" + noNormalsNameSuffix,
];

function setTerrainFunction(terrainName) {
  return function () {
    newTerrainNameSelected(terrainName);
  };
}


var terrainOptions = [];
for (var i = 0; i < terrainNameList.length; i++) {
  var terrainName = terrainNameList[i];
  terrainOptions.push({
    text: terrainName,
    onselect: setTerrainFunction(terrainName),
  });
}
*/

// LOCATIONS
export var locationsInfo = {
  Tycho: {
    name: "Tycho",
    longitude: -11.34246,
    latitude: -43.33986,
    height: -1000,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Haworth_1: {
    name: "Haworth_1",
    longitude: -17.665,
    latitude: -86.744,
    height: 1300,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Haworth_2: {
    name: "Haworth_2",
    longitude: -19.023,
    latitude: -86.516,
    height: 1300,
    color: Cesium.Color.TOMATO,
    entity: null,
  },
  PSR0: {
    name: "PSR0",
    longitude: 135.36409,
    latitude: -81.87225,
    height: -4100,
    color: Cesium.Color.TOMATO,
    entity: null,
  },
  PSR1: {
    name: "PSR1",
    longitude: -11.77213,
    latitude: -85.61268,
    height: 2500,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Hill_Top_Near_SP: {
    name: "Hill_Top_Near_SP",
    longitude: 222,
    latitude: -89.44,
    height: 2000,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Hill_Top_Near_NP: {
    name: "Hill_Top_Near_NP",
    longitude: -45.63,
    latitude: 89.645,
    height: 500,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  testing2: {
    name: "testing2",
    longitude: -2.146,
    latitude: 0.667,
    height: -900,
    color: Cesium.Color.WHITE,
    entity: null,
  },
};

function setLocationFunction(location) {
  return function () {
    setLocation(location);
  };
}

/*
var locationToolbarOptions = [];
var i = 0;
for (var locationName in locationsInfo) {
  if (locationsInfo.hasOwnProperty(locationName)) {
    var location = locationsInfo[locationName];
    locationToolbarOptions.push({
      text: locationName,
      onselect: setLocationFunction(location),
    });
    i += 1;
  }
}
*/

Sandcastle.addToolbarMenu(illuminationOptions);
var illuminationMenu = document.getElementById("toolbar").lastChild;
/*
Sandcastle.addToolbarMenu(terrainOptions);
export var terrainMenu = document.getElementById("toolbar").lastChild;
*/

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

Sandcastle.addToggleButton(
  "5m DEM regions",
  false,
  setHiresDemRegionsEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var enableHiresDemRegionsButton = document.getElementById("toolbar").lastChild;
var enableHiresDemRegionsCbx =
  enableHiresDemRegionsButton.firstChild.firstChild; // input

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

export function createLayerImageryProvider(layerName, bodyView, format) {
  const layer_url_template =
    "https://act-test.lroc.asu.edu/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=__FORMAT__&layer=__LAYER__&bodyview=__BODY_VIEW__&cmd_script=get_tile.msh";

  var layerUrl = layer_url_template.replace("__LAYER__", layerName);
  var layerUrl = layerUrl.replace("__FORMAT__", format);
  if (!bodyView) {
    bodyView = isOptimizedPolarTerrain
      ? "lunar-polarshifted-eqc"
      : "lunar-fulleqc";
  }
  layerUrl = layerUrl.replace("__BODY_VIEW__", bodyView);
  const layerImageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: layerUrl,
    tilingScheme: new Cesium.GeographicTilingScheme({
      ellipsoid,
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    }),
    tileWidth: 512,
    tileHeight: 512,
    customTags: {
      zPlusOne: function (imageryProvider, x, y, z) {
        return z + 1;
      },
    },
  });
  return layerImageryProvider;
}

function createLayer(layerName, bodyView, format) {
  return new Cesium.ImageryLayer(
    createLayerImageryProvider(layerName, bodyView, format)
  );
}

// polar optimized Sun Visibility 60m layer
export var layerSunVis60mPolar = createLayer(
  "lavgvis_s_60m",
  "lunar-polarshifted-eqc",
  "png"
);
layerSunVis60mPolar.show = false;
// viewer.imageryLayers.add(layerSunVis60mPolar);

viewer.imageryLayers.layerAdded.addEventListener(function (layer) {
  if (layer.show === true) {
    var imageryLayerIdx = getImageryLayerIdx(layer.imageryProvider);
    if (imageryLayerIdx === WACMosaicNSModelIdx) {
      var setWACNoShadowsEnabled = setWACNoShadowsEnabledFunction();
      // NOTE: do not update the selected item on the picker in order to avoid bad behavior
      setWACNoShadowsEnabled(true, false);
    } else if (imageryLayerIdx === sunVisibilty60mModelIdx) {
      var setSunVisibility60mEnabled = setSunVisibility60mEnabledFunction();
      // NOTE: do not update the selected item on the picker in order to avoid bad behavior
      setSunVisibility60mEnabled(true, false);
    }
  }
});

viewer.imageryLayers.layerRemoved.addEventListener(function (layer) {
  if (layer.show === true) {
    var imageryLayerIdx = getImageryLayerIdx(layer.imageryProvider);
    if (imageryLayerIdx === WACMosaicNSModelIdx) {
      var setWACNoShadowsEnabled = setWACNoShadowsEnabledFunction();
      // NOTE: do not update the selected item on the picker in order to avoid bad behavior
      setWACNoShadowsEnabled(false, false);
    } else if (imageryLayerIdx === sunVisibilty60mModelIdx) {
      var setSunVisibility60mEnabled = setSunVisibility60mEnabledFunction();
      // NOTE: do not update the selected item on the picker in order to avoid bad behavior
      setSunVisibility60mEnabled(false, false);
    }
  }
});

// regular WAC no shadows layer
var layerWACAlbedo = createLayer("wac_albedo", "lunar-fulleqc", "jpg");
layerWACAlbedo.show = false;
// viewer.imageryLayers.add(layerWACAlbedo);

// polar optimized WAC no shadows layer
var layerWACAlbedoPolar = createLayer(
  "wac_albedo",
  "lunar-polarshifted-eqc",
  "jpg"
);
layerWACAlbedoPolar.show = false;
// viewer.imageryLayers.add(layerWACAlbedoPolar);

function setWACNoShadowsEnabledFunction() {
  return function (checked, updateSelected) {
    // note: if this is called after imagery layerAdded event, then the selected entry on the picker
    // had not been updated yet, so call this with updateSelected set to false in order to avoid bad behavior
    if (updateSelected === undefined) {
      updateSelected = false;
    }

    if (checked) {
      if (isOptimizedPolarTerrain) {
        layerWACAlbedoPolar.show = true;
      } else {
        layerWACAlbedo.show = true;
      }
      if (
        updateSelected &&
        viewer.baseLayerPicker.viewModel.selectedImagery !==
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            WACMosaicNSModelIdx
          ]
      ) {
        viewer.baseLayerPicker.viewModel.selectedImagery =
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            WACMosaicNSModelIdx
          ];
      }
    } else {
      layerWACAlbedo.show = false;
      layerWACAlbedoPolar.show = false;
      if (
        updateSelected &&
        viewer.baseLayerPicker.viewModel.selectedImagery ===
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            WACMosaicNSModelIdx
          ]
      ) {
        viewer.baseLayerPicker.viewModel.selectedImagery =
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            NoneModelIdx
          ];
      }
    }

    // update view model
    viewModel.WACMosaicNSEnabled = checked;
  };
}
/*
Sandcastle.addToggleButton(
  "WAC Mosaic (no shadows)",
  false,
  setWACNoShadowsEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var enableWACNSButton = document.getElementById("toolbar").lastChild;
var enableWACNSCbx = enableWACNSButton.firstChild.firstChild; // input
*/

var sunVisibility60mChecked = false;

function setSunVisibility60mEnabledFunction() {
  return function (checked, updateSelected) {
    sunVisibility60mChecked = checked;

    // note: if this is called after imagery layerAdded event, then the selected entry on the picker
    // had not been updated yet, so call this with updateSelected set to false in order to avoid bad behavior
    if (updateSelected === undefined) {
      updateSelected = false;
    }

    if (checked) {
      if (isOptimizedPolarTerrain) {
        layerSunVis60mPolar.show = true;
      }
      if (
        updateSelected &&
        viewer.baseLayerPicker.viewModel.selectedImagery !==
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            sunVisibilty60mModelIdx
          ]
      ) {
        viewer.baseLayerPicker.viewModel.selectedImagery =
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            sunVisibilty60mModelIdx
          ];
      }
    } else {
      layerSunVis60mPolar.show = false;
      if (
        updateSelected &&
        viewer.baseLayerPicker.viewModel.selectedImagery ===
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            sunVisibilty60mModelIdx
          ]
      ) {
        viewer.baseLayerPicker.viewModel.selectedImagery =
          viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
            NoneModelIdx
          ];
      }
    }

    // update view model
    viewModel.sunVisibility60Enabled = checked;
  };
}
/*
Sandcastle.addToggleButton(
  "Sun Visibility 60m",
  sunVisibility60mChecked,
  setSunVisibility60mEnabledFunction()
);
// get checkbox input to be able to modify it programmatically
var enableSunVisibility60mButton = document.getElementById("toolbar").lastChild;
var enableSunVisibility60mCbx =
  enableSunVisibility60mButton.firstChild.firstChild; // input
*/

function updateImageryLayersUrl() {
  if (isOptimizedPolarTerrain) {
    if (layerWACAlbedo.show) {
      layerWACAlbedo.show = false;
      layerWACAlbedoPolar.show = true;
    }
    if (sunVisibility60mChecked) {
      layerSunVis60mPolar.show = true;
    }
    if (polesHiresDataSourceEnabled) {
      if (polesHiresDataSourcePolar) {
        polesHiresDataSourcePolar.show = true;
        polesHiresDataSource.show = false;
      }
    }
  } else {
    if (layerWACAlbedoPolar.show) {
      layerWACAlbedoPolar.show = false;
      layerWACAlbedo.show = true;
    }
    if (sunVisibility60mChecked) {
      layerSunVis60mPolar.show = false;
    }
    if (polesHiresDataSourceEnabled) {
      if (polesHiresDataSourcePolar) {
        polesHiresDataSourcePolar.show = false;
        polesHiresDataSource.show = true;
      }
    }
  }
}

function setTerrainMeshMaxErrorFunction(maxErr) {
  return function () {
    updateTerrainMeshMaxError(maxErr);
  };
}

var maxErrorList = [0.01, 0.1, 1, 10, 20, 50];
var terrainMaxErrOptions = [];
for (var i = 0; i < maxErrorList.length; i++) {
  var maxError = maxErrorList[i];
  var maxErrorEntryName = "mesh surf. max_err: " + maxError.toString() + "m";
  terrainMaxErrOptions.push({
    text: maxErrorEntryName,
    onselect: setTerrainMeshMaxErrorFunction(maxError),
  });
}

Sandcastle.addToolbarMenu(terrainMaxErrOptions);
var terrainMaxErrMenu = document.getElementById("toolbar").lastChild;

function setContourEnabledFunction() {
  return function (checked) {
    contoursViewModel.enableContour = checked;
    updateContours();

    // update view model
    viewModel.contourEnabled = checked;
  };
}

Sandcastle.addToggleButton(
  "Contours @ " + contoursViewModel.contourSpacing.toFixed(0) + "m",
  contoursViewModel.enableContour,
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

Sandcastle.addToggleButton(
  "Skirts",
  scene.globe.showSkirts,
  setSkirtsEnabledFunction()
);

// get checkbox input to be able to modify it programmatically
var enableSkirtsButton = document.getElementById("toolbar").lastChild;
var enableSkirtsCbx = enableSkirtsButton.firstChild.firstChild; // input

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

function updateShadowsMaxDist(maxDist) {
  if (viewModel.shadowsMaxDistance == maxDist) {
    return;
  }

  var shadowsMaxDistance = maxDist * 1000.0; // m
  viewModel.shadowsMaxDistance = shadowsMaxDistance;
  shadowMap.maximumDistance = shadowsMaxDistance;
}

function setShadowsMaxDistanceFunction(maxDist) {
  return function () {
    updateShadowsMaxDist(maxDist);
  };
}

var shadowsMaxDistList = [50, 100, 200, 500, 1000]; // km
var shadowsMaxDistOptions = [];
for (var i = 0; i < shadowsMaxDistList.length; i++) {
  var shadowsMaxDist = shadowsMaxDistList[i];
  var shadowsMaxDistEntryName =
    "Shadows Max Distance: " + shadowsMaxDist.toString() + "km";
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

// SHOW COORDINATES
var cartesian = new Cesium.Cartesian3();
var cartesianCamera = new Cesium.Cartesian3();
export var cartographicCamera = new Cesium.Cartographic();
var cartographic = new Cesium.Cartographic();
var camera = viewer.scene.camera;
var ellipsoid = viewer.scene.globe.ellipsoid;
var entity = document.getElementById("hud");
var height = 1;
viewer.scene.canvas.addEventListener("mousemove", function (e) {
  // Mouse over the globe to see the cartographic position
  cartesian = viewer.camera.pickEllipsoid(
    new Cesium.Cartesian3(e.clientX, e.clientY),
    ellipsoid
  );
  if (cartesian) {
    cartographic = ellipsoid.cartesianToCartographic(
      invAdjustCartesianCoords(cartesian, isOptimizedPolarTerrain)
    );
    //console.log(cartographic);
    var longitudeString = Cesium.Math.toDegrees(cartographic.longitude).toFixed(
      3
    );
    var latitudeString = Cesium.Math.toDegrees(cartographic.latitude).toFixed(
      3
    );

    // Sample the terrain (async) and write the answer to the console.
    Cesium.sampleTerrain(viewer.terrainProvider, 9, [cartographic]).then(
      function (samples) {
        height = samples[0].height;
        var lbl =
          "Cursor: (Lon,Lat,H)=" +
          longitudeString +
          ",&nbsp;" +
          latitudeString +
          ",&nbsp;" +
          (height * 0.001).toFixed(1);
        updateCoordsDisplay(lbl);
      }
    );

    // entity.position = cartesian;
    var lbl =
      "Cursor: (Lon,Lat,H)=" + longitudeString + ",&nbsp;" + latitudeString;
    updateCoordsDisplay(lbl);
  }
});

function rad2deg(radians) {
  var pi = Math.PI;
  return radians * (180 / pi);
}

viewer.camera.moveEnd.addEventListener(function () {
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
    "<br>" +
    "(R,P,Y)=" +
    rad2deg(camera.roll).toFixed(1) +
    ",&nbsp;" +
    rad2deg(camera.pitch).toFixed(1) +
    ",&nbsp;" +
    rad2deg(camera.heading).toFixed(1);
  updateCameraCoordsDisplay(lbl);

  maybeUpdateTerrainProvider(camLat, camH);
  maybeUpdateContours(camH);

  // update view model
  viewModel.camera_position = camera.position;
  viewModel.camera_direction = camera.direction;
  viewModel.camera_up = camera.up;
});

function setHeightKm(heightInKilometers) {
  ellipsoid.cartesianToCartographic(camera.position, cartographicCamera);
  cartographicCamera.height = heightInKilometers * 1000; // convert to meters
  ellipsoid.cartographicToCartesian(cartographicCamera, cartesianCamera);
  camera.position = cartesianCamera;
}

// Show the coords display below the toobar buttons.
cameraCoordsDisplay.style.background = "rgba(42, 42, 42, 0.7)";
cameraCoordsDisplay.style.padding = "5px 10px";
document.getElementById("toolbar").appendChild(cameraCoordsDisplay);

// Show the coords display below the toobar buttons.
coordsDisplay.style.background = "rgba(42, 42, 42, 0.7)";
coordsDisplay.style.padding = "5px 10px";
document.getElementById("toolbar").appendChild(coordsDisplay);

// current terrain label
terrainDisplay.style.background = "rgba(42, 42, 42, 0.7)";
terrainDisplay.style.padding = "5px 10px";
document.getElementById("toolbar").appendChild(terrainDisplay);

/*
// Show the coords display below the toobar buttons.
timeDisplay.style.background = "rgba(42, 42, 42, 0.7)";
timeDisplay.style.padding = "5px 10px";
document.getElementById("toolbar").appendChild(timeDisplay);
*/

/*
// Add buttons, for convenience.
Sandcastle.addToolbarButton("1km height", function () {
setHeightKm(1);
});
Sandcastle.addToolbarButton("10km height", function () {
setHeightKm(10);
});
Sandcastle.addToolbarButton("100km height", function () {
setHeightKm(100);
});
Sandcastle.addToolbarButton("500km height", function () {
setHeightKm(500);
});
*/

// add go to button
addGoToButton();
// add set time button
// addTimeButton();

initializeBaseLayerPicker();

if (window.LIS_MODE === "development") {
  viewer.extend(Cesium.viewerCesiumInspectorMixin);
}

document.getElementById("toolbar").style.width = "50%";

// SUN
var solarRadiusInMeters = 6.955e8;
// magnify sun, just to see it better
// Will need to render as in cesium
solarRadiusInMeters = solarRadiusInMeters * 2;

//Move the far wall of the viewing frustum.
viewer.scene.camera.frustum.far = 1e12;

// Create a Yellow rim-lit material.
var material = Cesium.Material.fromType(Cesium.Material.RimLightingType);
material.uniforms.color = Cesium.Color.YELLOW;

// Create Sun graphics primitive.
var sunSPICE = scene.primitives.add(
  new Cesium.EllipsoidPrimitive({
    center: new Cesium.Cartesian3(), // For now, place the Sun at the origin.
    radii: new Cesium.Cartesian3(
      solarRadiusInMeters,
      solarRadiusInMeters,
      solarRadiusInMeters
    ),
    material: material,
  })
);

// EARTH
var earthRadiusInMeters = 6.371e6 / earthScaleFactor;

var materialEarth = Cesium.Material.fromType(Cesium.Material.ImageType);
// materialEarth.uniforms.color = Cesium.Color.BLUE;
var earthTextureUrl = "https://files.actgate.com/earth/earthSmall.jpg";
// var earthTextureUrl = "https://files.actgate.com/earth/earthNoCloudsSmall.jpg";
materialEarth.uniforms.image = earthTextureUrl;
materialEarth.translucent = false;

// Create Earth graphics primitive.
var earthSPICE = scene.primitives.add(
  new Cesium.EllipsoidPrimitive({
    center: new Cesium.Cartesian3(), // For now, place the Earth at the origin.
    radii: new Cesium.Cartesian3(
      earthRadiusInMeters,
      earthRadiusInMeters,
      earthRadiusInMeters
    ),
    material: materialEarth,
    // enables sun lighting on earth but uses cesium earth based sun position
    //    onlySunLighting: true
  })
);

// Allocate "new" variables outside of the render loop when possible, to reduce garbage collection.
var sunModelMatrixScratch = new Cesium.Matrix4();
var earthModelMatrixScratch = new Cesium.Matrix4();

// needed for properly rotate earth texture when using polar dem terrain
// rotate around y axis by 90 deg
var poleRotationM = new Cesium.Matrix3(0, 0, -1, 0, 1, 0, 1, 0, 0);

// Update the camera and the Sun with each animation frame.
function icrf(scene, time) {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) {
    return;
  }

  if (scene.light === sunLightSPICE || scene.light === earthLightSPICE) {
    sunSPICE.modelMatrix = Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.IDENTITY,
      sunPosSPICE,
      sunModelMatrixScratch
    );
    if (!isOptimizedPolarTerrain) {
      earthSPICE.modelMatrix = Cesium.Matrix4.fromRotationTranslation(
        Cesium.Matrix3.IDENTITY,
        earthPosSPICE,
        earthModelMatrixScratch
      );
    } else {
      earthSPICE.modelMatrix = Cesium.Matrix4.fromRotationTranslation(
        poleRotationM,
        earthPosSPICE,
        earthModelMatrixScratch
      );
    }
  }
}
scene.preRender.addEventListener(icrf);

/////
// add entities
var entitySphereRadius = 50;
for (var locationName in locationsInfo) {
  var location = locationsInfo[locationName];
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

    var newCameraPos = adjustCartesianCoords(
      Cesium.Cartesian3.fromDegrees(
        location.longitude,
        location.latitude,
        location.height + 20000,
        ellipsoid
      ),
      isOptimizedPolarTerrain
    );

    scene.camera.flyTo({
      destination: newCameraPos,
      duration: deltaT,
    });
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

  /*
// earth rise
destination : Cesium.Cartesian3.fromDegrees(
-121.012,
72.995,
29700,
Cesium.Ellipsoid.WGS84),
orientation: {
heading : Cesium.Math.toRadians(62.6),
pitch : Cesium.Math.toRadians(-23.7),
roll : Cesium.Math.toRadians(359.7)
}
});
*/
}

// ENTITY TO SUN/EARTH VECTORS
var itemToSunArrow = viewer.entities.add({
  name: "Item to Sun vector",
  polyline: {
    // for synchronously line drawing
    positions: new Cesium.CallbackProperty(
      getSelectedEntityToSunLinePositions,
      false
    ),
    width: 10,
    arcType: Cesium.ArcType.NONE,
    material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.YELLOW),
  },
  show: true,
});

var itemToEarthArrow = viewer.entities.add({
  name: "Item to Earth vector",
  polyline: {
    // for synchronously line drawing
    positions: new Cesium.CallbackProperty(
      getSelectedEntityToSunEarthPositions,
      false
    ),
    width: 10,
    arcType: Cesium.ArcType.NONE,
    material: new Cesium.PolylineArrowMaterialProperty(Cesium.Color.BLUE),
  },
  show: true,
});

var entityToSunVec = new Cesium.Cartesian3();
var entityToSunVecNorm = new Cesium.Cartesian3();
var entityToSunVecScaled = new Cesium.Cartesian3();
var entityToSunArrowTipPos = new Cesium.Cartesian3();
var entityToEarthVec = new Cesium.Cartesian3();
var entityToEarthVecNorm = new Cesium.Cartesian3();
var entityToEarthVecScaled = new Cesium.Cartesian3();
var entityToEarthArrowTipPos = new Cesium.Cartesian3();
var entityCartesianPos;
var entityCartoPos;
function updateEntityVectors(entityChanged) {
  if (entityChanged) {
    entityCartesianPos = entitySelected.position.getValue(
      viewer.clock.currentTime
    );
    entityCartoPos = ellipsoid.cartesianToCartographic(entityCartesianPos);
  }

  if (itemToSunArrow.show) {
    Cesium.Cartesian3.subtract(sunPosSPICE, entityCartesianPos, entityToSunVec);
    Cesium.Cartesian3.normalize(entityToSunVec, entityToSunVecNorm);
    Cesium.Cartesian3.multiplyByScalar(
      entityToSunVecNorm,
      4 * entitySphereRadius,
      entityToSunVecScaled
    );
    Cesium.Cartesian3.add(
      entityToSunVecScaled,
      entityCartesianPos,
      entityToSunArrowTipPos
    );
  }

  if (itemToEarthArrow.show) {
    Cesium.Cartesian3.subtract(
      earthPosSPICE,
      entityCartesianPos,
      entityToEarthVec
    );
    Cesium.Cartesian3.normalize(entityToEarthVec, entityToEarthVecNorm);
    Cesium.Cartesian3.multiplyByScalar(
      entityToEarthVecNorm,
      4 * entitySphereRadius,
      entityToEarthVecScaled
    );
    Cesium.Cartesian3.add(
      entityToEarthVecScaled,
      entityCartesianPos,
      entityToEarthArrowTipPos
    );
  }
}

function getSelectedEntityToSunLinePositions() {
  return [entityCartesianPos, entityToSunArrowTipPos];
}

function getSelectedEntityToSunEarthPositions() {
  return [entityCartesianPos, entityToEarthArrowTipPos];
}

/*
Sandcastle.addToggleButton(
"Sun Vector",
itemToSunArrow.polyline.show,
function (checked) {
itemToSunArrow.polyline.show = checked;
updateEntityVectors();
}
);

Sandcastle.addToggleButton(
"Earth Vector",
itemToEarthArrow.polyline.show,
function (checked) {
itemToEarthArrow.polyline.show = checked;
updateEntityVectors();
}
);
*/

// set initial state
reset();
setSceneLight(sunLightSPICE);
updateTerrainMeshMaxError(defaultMeshMaxError);
// terrain mesh error
var terrainMeshMaxErrorIdx = maxErrorList.indexOf(defaultMeshMaxError);
if (terrainMeshMaxErrorIdx) {
  terrainMaxErrMenu.selectedIndex = terrainMeshMaxErrorIdx;
}
newTerrainNameSelected(defaultTerrainName, true);
initializeTime(defaultUTCTime);

// set location
/*
locationMenu.selectedIndex = defaultLocationIndex;
locationToolbarOptions[defaultLocationIndex].onselect();
*/
var defaultLocation = locationsInfo[defaultLocationName];
if (defaultLocation) {
  setLocation(defaultLocation);
}

// shadows max distance
var shadowsMaxDistanceIdx = shadowsMaxDistList.indexOf(
  defaultShadowMapMaxDistance / 1000.0
);
if (shadowsMaxDistanceIdx) {
  shadowsMaxDistMenu.selectedIndex = shadowsMaxDistanceIdx;
  shadowsMaxDistOptions[shadowsMaxDistanceIdx].onselect();
}

// CONTOUR
var contourColor = Cesium.Color.RED.clone();
var contourUniforms = {};
var countoursVisible = false;

function maybeUpdateContours(height) {
  if (!contoursViewModel.enableContour) {
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
    (countoursVisible && height > showContourAlt) ||
    (!countoursVisible && height < showContourAlt)
  ) {
    updateContours(height);
  }
}

function updateContours(height) {
  var hasContour = contoursViewModel.enableContour;
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

    if (height < showContourAlt) {
      material = Cesium.Material.fromType("ElevationContour");
      contourUniforms = material.uniforms;
      contourUniforms.width = contoursViewModel.contourWidth;
      contourUniforms.spacing = contoursViewModel.contourSpacing;
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
    currTime = viewModel.UTCTime;
  }

  if (startUTCTime !== undefined || stopUTCTime !== undefined) {
    initializeTime(currTime, startUTCTime, stopUTCTime);
  }

  // illumination
  if (searchParams.has("lightSourceIdx")) {
    var lightSourceIdx = searchParams.get("lightSourceIdx");
    illuminationMenu.selectedIndex = lightSourceIdx;
    illuminationOptions[lightSourceIdx].onselect();
  }

  // terrain mesh max error
  if (searchParams.has("terrainMeshMaxError")) {
    var terrainMeshMaxError = searchParams.get("terrainMeshMaxError");
    terrainMeshMaxErrorIdx = maxErrorList.indexOf(
      parseFloat(terrainMeshMaxError)
    );
    if (terrainMeshMaxErrorIdx >= 0) {
      terrainMaxErrMenu.selectedIndex = terrainMeshMaxErrorIdx;
      terrainMaxErrOptions[terrainMeshMaxErrorIdx].onselect();
    }
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

    // var ul = new Cesium.Cartesian3.fromDegrees(0, 88);
    // var ur = new Cesium.Cartesian3.fromDegrees(90, 88);
    // var lr = new Cesium.Cartesian3.fromDegrees(180, 88);
    // var ll = new Cesium.Cartesian3.fromDegrees(270, 88);

    var rrCartesianCoords = [ul, ur, lr, ll];
    var rectangle = Cesium.Rectangle.fromCartesianArray(rrCartesianCoords);

    var redRectangle = viewer.entities.add({
      rectangle: {
        coordinates: rectangle,
        material: Cesium.Color.WHITE.withAlpha(0.1),
        outline: true,
        outlineColor: Cesium.Color.WHITE,
        //             clampToGround: true,
      },
    });

    viewer.scene.camera.flyTo({
      destination: rectangle,
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(-90.0),
        roll: Cesium.Math.toRadians(0.0),
      },
    });
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
      parseFloat(shadowsMaxDistance) / 1000.0
    );
    if (shadowsMaxDistanceIdx >= 0) {
      shadowsMaxDistMenu.selectedIndex = shadowsMaxDistanceIdx;
      shadowsMaxDistOptions[shadowsMaxDistanceIdx].onselect();
    }
  }

  // location
  if (searchParams.has("selectedLocationName")) {
    var locationName = searchParams.get("selectedLocationName");
    if (locationName in locationsInfo) {
      setSelectedEntity(locationsInfo[locationName]);
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
    enableSkirtsCbx.checked = checked;
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
    enableHiresDemRegionsCbx.checked = checked;
    var setHiresDemRegionsEnabled = setHiresDemRegionsEnabledFunction();
    setHiresDemRegionsEnabled(checked);
  }

  if (searchParams.has("WACMosaicNSEnabled")) {
    var checked = searchParams.get("WACMosaicNSEnabled") === "true";
    // enableWACNSCbx.checked = checked;
    var setWACNoShadowsEnabled = setWACNoShadowsEnabledFunction();
    setWACNoShadowsEnabled(checked, true);
  }

  if (searchParams.has("sunVisibility60Enabled")) {
    var checked = searchParams.get("sunVisibility60Enabled") === "true";
    // enableSunVisibility60mCbx.checked = checked;
    var setSunVisibility60mEnabled = setSunVisibility60mEnabledFunction();
    setSunVisibility60mEnabled(checked, true);
  }

  viewModel.viewModelLoadFinished = true;
}

//Sandcastle_End
Sandcastle.finishedLoading();

// Load QueryString on initial app load
// Note: load after the Sandcastle interface has been fully loaded in order to properly
// override default initial state
loadStateFromQueryString();
