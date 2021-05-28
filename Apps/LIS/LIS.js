window.CESIUM_BASE_URL = "../../Source/";

import * as Cesium from "../../Source/Cesium.js";

import { updateUrlParams } from "./utils.js";
import {
  cartesianToDummyPolar,
  dummyPolarToCartesian,
  adjustCartesianCoords,
  invAdjustCartesianCoords,
} from "./adjustCartesian.js";
//Sandcastle_Begin
// LIS changelog
// https://docs.google.com/document/d/197lf-E9bC4HIPmyUZ1Qidc0TZOWlY58k3O5qJ24wb0o/edit?usp=sharing
Cesium.Ellipsoid.WGS84 = new Cesium.Ellipsoid(1737400, 1737400, 1737400);

// tiles settings
// https://lunar-dem-tiles2.quickmap.io/sldem_lola/docs#/default/serve_layer_info_layer_json_get

var defaultTerrainName = "automatic";
var terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/sldem_lola";
var terrainResampligMethod = "cubic";
var terrainMeshScale = 3;
var terrainMeshAlgorithm = "delatin";
var terrainMeshMaxError = 1.0;
var requestVertexNormals = true;
var isOptimizedPolarTerrain = false;
var currTerrainName;
var defaultUTCTime = "2022-12-04T00:00:00.000Z";

// for automatic regular/polar terrain switch
var automaticPolarTerrainTransition = false;
// switch to polar dem when abs(lat) > polarDemLatTh
var polarDemLatTh = 70; // deg
// lat tolerance for switching terrain
// the switch is happening if abs(lat) > (polarDemLatTh + autoDemTransitionLatTol)
// or abs(lat) < (polarDemLatTh - autoDemTransitionLatTol)
// note when the camera height > 1000 km then autoDemTransitionLatTol is increased by a factor of 2
var autoDemTransitionLatTol = 5; // deg
// km. Enable automatic terrain switch when camera altitude is lower than this param
var autoDemTransitionEnabledAlt = 2000;
var regularTerrainNameDef = "sldem_lola";
var polarTerrainNameDef = "GOTM";
var regularTerrainName = regularTerrainNameDef;
var polarTerrainName = polarTerrainNameDef;
var noNormalsNameSuffix = " - no normals";

// The viewModel tracks the state of our mini application.
var viewModel = {
  enableContour: false,
  contourSpacing: 150.0,
  contourWidth: 2.0,
};

var showContourAlt = 200; // km

function buildTerrainUrl() {
  var terrainUrl =
    terrainBaseUrl +
    "?" +
    "resampling_method=" +
    terrainResampligMethod +
    "&" +
    "mesh_scale=" +
    terrainMeshScale +
    "&" +
    "mesh_algorithm=" +
    terrainMeshAlgorithm +
    "&" +
    "mesh_max_error=" +
    terrainMeshMaxError;
  console.log("terrain url:");
  console.log(terrainUrl);

  return terrainUrl;
}

function createTerrainProvider() {
  var terrainProvider = new Cesium.CesiumTerrainProvider({
    url: buildTerrainUrl(),
    requestVertexNormals: requestVertexNormals,
  });
  return terrainProvider;
}

var viewer = new Cesium.Viewer("cesiumContainer", {
  //  terrainProvider: createTerrainProvider(),
  infoBox: false,
  selectionIndicator: false,
  skyAtmosphere: false,
  shadows: true,
  terrainShadows: Cesium.ShadowMode.ENABLED,
});

var usgsLolaProvider = new Cesium.CesiumTerrainProvider({
  url: "https://lunar-dem-tiles2.quickmap.io/usgs_lola/",
  requestVertexNormals: true,
});

var JPLProvider = new Cesium.CesiumTerrainProvider({
  url: "https://marshub.s3.amazonaws.com/moon_v14",
  requestVertexNormals: false,
});

var scene = viewer.scene;
var globe = scene.globe;
globe.enableLighting = true;
globe.showGroundAtmosphere = false;
globe.baseColor = Cesium.Color.GRAY;
scene.fog.enabled = false;

var shadowMap = viewer.shadowMap;
shadowMap.maximumDistance = 100000.0; // m
shadowMap.softShadows = false;
shadowMap.size = 4096;
shadowMap.normalOffset = false;
shadowMap.darkness = 0; // lower -> darker shadows

viewer.imageryLayers.removeAll();

function resetStateUpdateTimer() {
  if (updateStateTimerId > 0) {
    // stop timer
    clearInterval(updateStateTimerId);
    updateStateTimerId = -1;
  }
}

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
  var stepSec = 3600 * 2; // 1 hr
  //  var stepSec = 86400; // 1 day
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

function updateGlobeCartesianPositions() {
  var trackedEntity = viewer.trackedEntity;
  var trackedEntityViewFrom;
  if (trackedEntity) {
    // untrack the current entity in order to properly rotate around the globe center
    viewer.trackedEntity = undefined;
  }

  updateBodiesPosToDummyPolar();
  updateEntitiesPos();
  updateEntityVectors(true);
  updateImageryLayersUrl();

  // preserve camera position/orientation
  var newCameraPos;
  var newCameraDir;
  var newCameraUp;
  var newTrackedEntityViewFrom;
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

var FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL = 1000; // ms
var updateStateTimerId = -1;
var lastUrlStateUpdateTime = -1;
// wait FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL since last time update before updating the url
// this is needed in order to avoid to many history.push requests (there is a limit on Safari browser)
function maybeUpdateStateUrl() {
  var date = viewer.clock.currentTime;
  var time = Cesium.JulianDate.toIso8601(date, 3);
  if (lastUrlStateUpdateTime !== time) {
    lastUrlStateUpdateTime = time;
    if (updateStateTimerId >= 0) {
      // reset the timer
      resetStateUpdateTimer();
    }

    // let us set the timer
    updateStateTimerId = setInterval(
      saveStateToQueryString,
      FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL
    );
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
viewer.clock.onTick.addEventListener(maybeUpdateStateUrl);

function setTime(iso8601) {
  var currentTime = Cesium.JulianDate.fromIso8601(iso8601);
  var endTime = Cesium.JulianDate.addDays(
    currentTime,
    29 * 2,
    new Cesium.JulianDate()
  );
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

  viewer.clock.currentTime = currentTime;
  viewer.timeline.zoomTo(currentTime, endTime);

  viewer.clock.startTime = currentTime;
  viewer.clock.stopTime = endTime;
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
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
function updateTerrainDisplay(msg) {
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
  console.log("setSceneLight");
  scene.light = lightSource;
  updateBodiesPosSPICE();
  saveStateToQueryString();
}

function updateTerrainProvider(
  terrainBaseUrl,
  optimizedPolarTerrain,
  requestVertexNormals
) {
  // update terrain provider
  viewer.terrainProvider = createTerrainProvider();
  // check if reference system changed
  var wasOptimizedPolarTerrain = isOptimizedPolarTerrain;
  isOptimizedPolarTerrain = optimizedPolarTerrain;
  maybeUpdateGlobeCartesianPositions(
    wasOptimizedPolarTerrain,
    isOptimizedPolarTerrain
  );
}

function setTerrainProvider(terrainProvider, optimizedPolarTerrain) {
  // update terrain provider
  viewer.terrainProvider = terrainProvider;
  // check if reference system changed
  var wasOptimizedPolarTerrain = isOptimizedPolarTerrain;
  isOptimizedPolarTerrain = optimizedPolarTerrain;
  maybeUpdateGlobeCartesianPositions(
    wasOptimizedPolarTerrain,
    isOptimizedPolarTerrain
  );
}

var terrainNameList = [
  "automatic",
  "automatic" + noNormalsNameSuffix,
  "sldem_lola",
  "sldem_lola" + noNormalsNameSuffix,
  "usgs_lola",
  "NASA JPL - no normals",
  //        "Optimized PolarDEM",
  //        "Optimized PolarDEM" + noNormalsNameSuffix,
  "GOTM",
  "GOTM" + noNormalsNameSuffix,
  "GOTM (High Res)",
  "GOTM (High Res)" + noNormalsNameSuffix,
];

// change terrain provider based on terrain name
function setTerrain(terrainName) {
  if (terrainName === currTerrainName) {
    // nothing to do
    return;
  }

  console.log("setting terrain " + terrainName);
  var optimizedPolarTerrain;

  currTerrainName = terrainName;
  updateTerrainDisplay("Terrain: " + currTerrainName);

  if (terrainName === "sldem_lola") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/sldem_lola";
    requestVertexNormals = true;
    optimizedPolarTerrain = false;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "sldem_lola - no normals") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/sldem_lola";
    requestVertexNormals = false;
    optimizedPolarTerrain = false;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "usgs_lola") {
    optimizedPolarTerrain = false;
    setTerrainProvider(usgsLolaProvider, optimizedPolarTerrain);
    return;
  }

  if (terrainName === "NASA JPL - no normals") {
    optimizedPolarTerrain = false;
    setTerrainProvider(JPLProvider, optimizedPolarTerrain);
    return;
  }

  if (terrainName === "Optimized PolarDEM") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/dummy_poles2";
    requestVertexNormals = true;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "Optimized PolarDEM - no normals") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/dummy_poles2";
    requestVertexNormals = false;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "GOTM") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/alt_poles";
    requestVertexNormals = true;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "GOTM - no normals") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/alt_poles";
    requestVertexNormals = false;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "GOTM (High Res)") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/alt_poles_hires";
    requestVertexNormals = true;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  if (terrainName === "GOTM (High Res) - no normals") {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/alt_poles_hires";
    requestVertexNormals = false;
    optimizedPolarTerrain = true;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return;
  }

  console.log("TERRAIN NOT FOUND!!!");
}

function setCurrTerrainLabelVisible(showLbl) {
  if (showLbl) {
    document.getElementById("toolbar").appendChild(terrainDisplay);
  } else {
    document.getElementById("toolbar").removeChild(terrainDisplay);
  }
}

// change terrain provider based on terrain name
// support "automatic" terrain for automatically switching between regular/polar terrain
// based on latitude
function newTerrainNameSelected(terrainName) {
  console.log("terrain name selected: " + terrainName);
  if (terrainName === "automatic" || terrainName === "automatic - no normals") {
    console.log("enabling automatic terrain loading...");
    automaticPolarTerrainTransition = true;
    setCurrTerrainLabelVisible(true);

    if (terrainName === "automatic") {
      regularTerrainName = regularTerrainNameDef;
      polarTerrainName = polarTerrainNameDef;
    } else {
      regularTerrainName = regularTerrainNameDef + noNormalsNameSuffix;
      polarTerrainName = polarTerrainNameDef + noNormalsNameSuffix;
    }
    maybeUpdateTerrainProvider();
  } else {
    if (automaticPolarTerrainTransition) {
      setCurrTerrainLabelVisible(false);
    }
    automaticPolarTerrainTransition = false;
    setTerrain(terrainName);
  }

  saveStateToQueryString();
}

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

function getBestLatTerrainName(lat, height) {
  // adapt lat tolerance based on elevation
  // increase when looking from higher elevation
  var autoDemTransLatTolAdapted =
    height < 1000 ? autoDemTransitionLatTol : 2 * autoDemTransitionLatTol;
  if (Math.abs(lat) > polarDemLatTh + autoDemTransLatTolAdapted) {
    return polarTerrainName;
  } else if (Math.abs(lat) < polarDemLatTh - autoDemTransLatTolAdapted) {
    return regularTerrainName;
  } else {
    return currTerrainName;
  }
}

function maybeUpdateTerrainProvider(lat, height) {
  if (!automaticPolarTerrainTransition) {
    // nothing to do
    return;
  }

  if (!lat || !height) {
    // get current camera lat
    ellipsoid.cartesianToCartographic(
      invAdjustCartesianCoords(camera.positionWC, isOptimizedPolarTerrain),
      cartographicCamera
    );
    lat = Cesium.Math.toDegrees(cartographicCamera.latitude);
    height = cartographicCamera.height * 0.001; // km
  }

  if (height > autoDemTransitionEnabledAlt) {
    // high elevation
    // nothing to do
    return;
  }

  // best terrain based on camera location
  var bestTerrainName = getBestLatTerrainName(lat, height);
  // console.log("best terrain (" + lat.toFixed(3) + "): " + bestTerrainName);
  setTerrain(bestTerrainName);
}

function resetTerrain() {
  if (!automaticPolarTerrainTransition) {
    // nothing to do
    return;
  }

  setTerrain(regularTerrainName);
}

function maybeUpdateGlobeCartesianPositions(wasOptimizedPolarTerrain) {
  if (wasOptimizedPolarTerrain == isOptimizedPolarTerrain) {
    // no changed
    return;
  }

  updateGlobeCartesianPositions();
}

function updateTerrainMeshMaxError(err) {
  if (terrainMeshMaxError == err) {
    return;
  }

  terrainMeshMaxError = err;
  // update terrain provider (only url changed)
  viewer.terrainProvider = createTerrainProvider();
}

// LOCATIONS
var locationsInfo = {
  Tycho: {
    longitude: -11.34246,
    latitude: -43.33986,
    height: -1000,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Haworth_1: {
    longitude: -17.665,
    latitude: -86.744,
    height: 1300,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Haworth_2: {
    longitude: -19.023,
    latitude: -86.516,
    height: 1300,
    color: Cesium.Color.TOMATO,
    entity: null,
  },
  PSR0: {
    longitude: 135.36409,
    latitude: -81.87225,
    height: -4100,
    color: Cesium.Color.TOMATO,
    entity: null,
  },
  PSR1: {
    longitude: -11.77213,
    latitude: -85.61268,
    height: 2500,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  Hill_Top_Near_SP: {
    longitude: 222,
    latitude: -89.44,
    height: 2000,
    color: Cesium.Color.WHITE,
    entity: null,
  },
  testing2: {
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

var locationName = "custom camera";
locationToolbarOptions.push({
  text: locationName,
  onselect: setCustomCameraView,
});

Sandcastle.addToolbarMenu(illuminationOptions);
var illuminationMenu = document.getElementById("toolbar").lastChild;
Sandcastle.addToolbarMenu(terrainOptions);
var terrainMenu = document.getElementById("toolbar").lastChild;

var polesHiresData = Cesium.GeoJsonDataSource.load(
  "https://files.actgate.com/temp/poles_hires.geojson",
  {
    fill: Cesium.Color.PINK.withAlpha(0.1),
    clampToGround: true,
  }
);

var dataSource;
var dataSourceLastIndex = -1;
Sandcastle.addToggleButton("hires dem regions", false, function (checked) {
  if (checked) {
    dataSourceLastIndex = viewer.dataSources.length;
    viewer.dataSources.add(polesHiresData);
  } else {
    if (viewer.dataSources.length > dataSourceLastIndex) {
      // console.log("removing data source");
      var res = viewer.dataSources.remove(dataSource, false);
      if (res) {
        // console.log("data source removed");
        dataSourceLastIndex -= 1;
      }
    }
  }
});

viewer.dataSources.dataSourceAdded.addEventListener(function () {
  // console.log("data source added");
  if (viewer.dataSources.length > dataSourceLastIndex) {
    dataSource = viewer.dataSources.get(dataSourceLastIndex);
    dataSourceLastIndex = viewer.dataSources.length - 1;
  }
});

var layer_url_template =
  "https://act-test.lroc.asu.edu/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=__FORMAT__&layer=__LAYER__&bodyview=__BODY_VIEW__&cmd_script=get_tile.msh";

function createLayer(layerName, bodyView, format) {
  var layerUrl = layer_url_template.replace("__LAYER__", layerName);
  var layerUrl = layerUrl.replace("__FORMAT__", format);
  if (!bodyView) {
    bodyView = isOptimizedPolarTerrain
      ? "lunar-polarshifted-eqc"
      : "lunar-fulleqc";
  }
  layerUrl = layerUrl.replace("__BODY_VIEW__", bodyView);
  const layerProvider = new Cesium.UrlTemplateImageryProvider({
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
  return new Cesium.ImageryLayer(layerProvider);
}

// polar optimized Sun Visibility 60m layer
var layerSunVis60mPolar = createLayer(
  "lavgvis_s_60m",
  "lunar-polarshifted-eqc",
  "png"
);
layerSunVis60mPolar.show = false;
viewer.imageryLayers.add(layerSunVis60mPolar);

// regular WAC no shadows layer
var layerWACAlbedo = createLayer("wac_albedo", "lunar-fulleqc", "jpg");
layerWACAlbedo.show = false;
viewer.imageryLayers.add(layerWACAlbedo);
// polar optimized WAC no shadows layer
var layerWACAlbedoPolar = createLayer(
  "wac_albedo",
  "lunar-polarshifted-eqc",
  "jpg"
);
layerWACAlbedoPolar.show = false;
viewer.imageryLayers.add(layerWACAlbedoPolar);

Sandcastle.addToggleButton("WAC Mosaic (no shadows)", false, function (
  checked
) {
  if (checked) {
    if (isOptimizedPolarTerrain) {
      layerWACAlbedoPolar.show = true;
    } else {
      layerWACAlbedo.show = true;
    }
  } else {
    layerWACAlbedo.show = false;
    layerWACAlbedoPolar.show = false;
  }
});

var sunVisibility60mChecked = false;
Sandcastle.addToggleButton(
  "Sun Visibility 60m",
  sunVisibility60mChecked,
  function (checked) {
    sunVisibility60mChecked = checked;
    if (checked) {
      if (isOptimizedPolarTerrain) {
        layerSunVis60mPolar.show = true;
      }
    } else {
      layerSunVis60mPolar.show = false;
    }
  }
);

function updateImageryLayersUrl() {
  if (isOptimizedPolarTerrain) {
    if (layerWACAlbedo.show) {
      layerWACAlbedo.show = false;
      layerWACAlbedoPolar.show = true;
    }
    if (sunVisibility60mChecked) {
      layerSunVis60mPolar.show = true;
    }
  } else {
    if (layerWACAlbedoPolar.show) {
      layerWACAlbedoPolar.show = false;
      layerWACAlbedo.show = true;
    }
    if (sunVisibility60mChecked) {
      layerSunVis60mPolar.show = false;
    }
  }
}

Sandcastle.addToolbarMenu([
  {
    text: "mesh surf. max_err: 1m",
    onselect: function () {
      updateTerrainMeshMaxError(1);
    },
  },
  {
    text: "mesh surf. max_err: 0.01m",
    onselect: function () {
      updateTerrainMeshMaxError(0.01);
    },
  },
  {
    text: "mesh surf. max_err: 0.1m",
    onselect: function () {
      updateTerrainMeshMaxError(0.1);
    },
  },
  {
    text: "mesh surf. max_err: 10m",
    onselect: function () {
      updateTerrainMeshMaxError(10);
    },
  },
  {
    text: "mesh surf. max_err: 20m",
    onselect: function () {
      updateTerrainMeshMaxError(20);
    },
  },
]);

Sandcastle.addToggleButton(
  "Contours @ " + viewModel.contourSpacing.toFixed(0) + "m",
  viewModel.enableContour,
  function (checked) {
    viewModel.enableContour = checked;
    updateContours();
  }
);

Sandcastle.addToggleButton("Skirts", scene.globe.showSkirts, function (
  checked
) {
  scene.globe.showSkirts = checked;
});

function setTerrainShadowsEnabledFunction() {
  return function (checked) {
    viewer.terrainShadows = checked
      ? Cesium.ShadowMode.ENABLED
      : Cesium.ShadowMode.DISABLED;
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

Sandcastle.addToggleButton("Shadows Fading", shadowMap.fadingEnabled, function (
  checked
) {
  shadowMap.fadingEnabled = checked;
});

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

Sandcastle.addToolbarMenu([
  {
    text: "ShadowsMaxDistance (km): 100",
    onselect: function () {
      shadowMap.maximumDistance = 100000;
    },
  },
  {
    text: "ShadowsMaxDistance (km): 1000",
    onselect: function () {
      shadowMap.maximumDistance = 1000000;
    },
  },
  {
    text: "ShadowsMaxDistance (km): 500",
    onselect: function () {
      shadowMap.maximumDistance = 500000;
    },
  },
  {
    text: "ShadowsMaxDistance (km): 200",
    onselect: function () {
      shadowMap.maximumDistance = 200000;
    },
  },
  {
    text: "ShadowsMaxDistance (km): 50",
    onselect: function () {
      shadowMap.maximumDistance = 50000;
    },
  },
]);

Sandcastle.addToggleButton(
  "Atm simu",
  scene.globe.showGroundAtmosphere,
  function (checked) {
    scene.globe.showGroundAtmosphere = checked;
  }
);

Sandcastle.addToolbarMenu(locationToolbarOptions);

// SHOW COORDINATES
var cartesian = new Cesium.Cartesian3();
var cartesianCamera = new Cesium.Cartesian3();
var cartographicCamera = new Cesium.Cartographic();
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

  saveStateToQueryString();
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
function setSelectedEntity(entity) {
  entitySelected = entity;
}

var deltaT = 10;
var entities = viewer.entities.values;
function setLocation(location) {
  if (location.entity) {
    setSelectedEntity(location.entity);
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

    updateEntityVectors(true);
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
newTerrainNameSelected(defaultTerrainName);
setTime(defaultUTCTime);
setLocation(locationsInfo.Tycho);

// CONTOUR
var contourColor = Cesium.Color.RED.clone();
var contourUniforms = {};
var countoursVisible = false;

function maybeUpdateContours(height) {
  if (!viewModel.enableContour) {
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
  var hasContour = viewModel.enableContour;
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
      contourUniforms.width = viewModel.contourWidth;
      contourUniforms.spacing = viewModel.contourSpacing;
      contourUniforms.color = contourColor;

      countoursVisible = true;
    }
  }

  globe.material = material;
}

maybeUpdateContours();

/**
 * Get current base state and saves to querystring
 */
function saveStateToQueryString() {
  console.log("updating state url...");
  if (!stateLoaded) {
    // wait the state has been loaded before updating it
    return;
  }

  resetStateUpdateTimer();

  // store pos and orientation. Note: use regular terrain coords (not accounting for polar view rotation)
  var camera_position = Cesium.Cartesian3.pack(
    invAdjustCartesianCoords(camera.positionWC, isOptimizedPolarTerrain),
    []
  );
  var camera_direction = Cesium.Cartesian3.pack(
    invAdjustCartesianCoords(camera.direction, isOptimizedPolarTerrain),
    []
  );
  var camera_up = Cesium.Cartesian3.pack(
    invAdjustCartesianCoords(camera.up, isOptimizedPolarTerrain),
    []
  );
  var UTCtime = viewer.clock.currentTime;

  // illumination
  var lightSourceIdx = illuminationMenu.selectedIndex;

  // terrain
  var terrainProviderIdx = terrainMenu.selectedIndex;

  // terrain shadows enabled

  // updateUrlParams({position, orientation});
  updateUrlParams({
    camera_position,
    camera_direction,
    camera_up,
    UTCtime,
    lightSourceIdx,
    terrainProviderIdx,
  });
}

/**
 * Check if base state info are available if so loads them
 */
var stateLoaded = false;
function loadStateFromQueryString() {
  var searchParams = new URL(window.location).searchParams;
  // camera position and orientation
  if (
    searchParams.has("camera_position") &&
    searchParams.has("camera_direction") &&
    searchParams.has("camera_up")
  ) {
    var camera_position = searchParams
      .get("camera_position")
      .split(",")
      .map(Number);
    var camera_direction = searchParams
      .get("camera_direction")
      .split(",")
      .map(Number);
    var camera_up = searchParams.get("camera_up").split(",").map(Number);
    viewer.scene.camera.flyTo({
      destination: Cesium.Cartesian3.unpack(camera_position),
      orientation: {
        direction: Cesium.Cartesian3.unpack(camera_direction),
        up: Cesium.Cartesian3.unpack(camera_up),
      },
    });
  }

  // time
  if (searchParams.has("UTCtime")) {
    var UTCtime = searchParams.get("UTCtime");
    setTime(UTCtime);
  }

  // illumination
  if (searchParams.has("lightSourceIdx")) {
    var lightSourceIdx = searchParams.get("lightSourceIdx");
    console.log("lightSourceIdx: " + lightSourceIdx);
    illuminationMenu.selectedIndex = lightSourceIdx;
    illuminationOptions[lightSourceIdx].onselect();
  }

  // terrain provider
  if (searchParams.has("terrainProviderIdx")) {
    var terrainProviderIdx = searchParams.get("terrainProviderIdx");
    terrainMenu.selectedIndex = terrainProviderIdx;
    terrainOptions[terrainProviderIdx].onselect();
  }

  // terrainShadowsCbx.checked = false;
  // var setTerrainShadowsEnabled = setTerrainShadowsEnabledFunction();
  // setTerrainShadowsEnabled(false);

  stateLoaded = true;
}

//Sandcastle_End
Sandcastle.finishedLoading();

// Load QueryString on initial app load
// Note: load after the Sandcastle interface has been fully loaded in order to properly
// override default initial state
loadStateFromQueryString();
