import * as Cesium from "../../Source/Cesium.js";

import { QTSConfig } from "./config/config.js";

import { viewModel } from "./viewModel.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

import { viewer } from "./LIS.js";

var bodiesPrimitive = {};
var bodiesCurrentSPICEPos = {};
export function initializeBodiesSPICE() {
  // create a body primitive for each light source
  for (var body in QTSConfig.lightSource) {
    var bodyPrimitive = viewer.scene.primitives.add(
      new Cesium.EllipsoidPrimitive({
        center: new Cesium.Cartesian3(), // For now, place the at the origin.
        radii: new Cesium.Cartesian3(
          QTSConfig.lightSource[body].radius /
            QTSConfig.lightSource[body].radiusScaleFactor,
          QTSConfig.lightSource[body].radius /
            QTSConfig.lightSource[body].radiusScaleFactor,
          QTSConfig.lightSource[body].radius /
            QTSConfig.lightSource[body].radiusScaleFactor
        ),
        material: QTSConfig.lightSource[body].primitiveParams.material,
      })
    );
    bodiesPrimitive[body] = bodyPrimitive;
    bodiesCurrentSPICEPos[body] = new Cesium.Cartesian3();
  }
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function getIlluminationOptions() {
  var optionsArray = [];
  for (var lightSource in QTSConfig.lightSource) {
    const illuminationEntryName =
      capitalizeFirstLetter(String(lightSource).toLowerCase()) +
      " -> " +
      capitalizeFirstLetter(String(QTSConfig.observer).toLowerCase()) +
      " (SatV)";

    const lightSourceId = lightSource;
    optionsArray.push({
      text: illuminationEntryName,
      onselect: function () {
        console.log(illuminationEntryName + " selected...");
        setSceneLight(lightSourceId);
      },
    });
  }
  return optionsArray;
}

export function setSceneLight(lightSource) {
  var lightDirection = new Cesium.Cartesian3(1, 1, 1);
  if (lastBodiesPosActiveIndex >= 0) {
    var bodiesPos = bodiesPosList[lastBodiesPosActiveIndex];
    // update light direction
    let currentLightSource = viewModel.lightSource;
    lightDirection.x = bodiesPos[currentLightSource].light_direction[0];
    lightDirection.y = bodiesPos[currentLightSource].light_direction[1];
    lightDirection.z = bodiesPos[currentLightSource].light_direction[2];
    lightDirection = adjustCartesianCoords(
      lightDirection,
      isOptimizedPolarTerrain
    );
  } else {
    // invalid light direction
    lightDirection = new Cesium.Cartesian3(1, 1, 1);
  }

  let light = new Cesium.DirectionalLight({
    direction: lightDirection,
    color: QTSConfig.lightSource[lightSource].lightParams.lightColor,
    intensity: QTSConfig.lightSource[lightSource].lightParams.lightIntensity,
  });
  viewer.scene.light = light;

  // update model
  viewModel.lightSource = lightSource;
}

// update celestial bodies positions using ACT SPICE based service
var bodiesPosList;
var secsFromStartUTCArray = [];
var lastBodiesPosActiveIndex = -1;

export async function updateBodiesPosSPICE() {
  // build url to get the source light direction
  var startUTCTime = viewer.clock.startTime;
  var endUTCTime = viewer.clock.stopTime;
  var nSecs = Cesium.JulianDate.secondsDifference(endUTCTime, startUTCTime);
  // Server limit is max 1000 times returned. Do not pass that limit
  var stepSec = nSecs / 700; //
  // var stepSec = 3600 * 2; // 1 hr
  var act_bodies_pos_moon_url =
    "https://mare3.actgate.com/fcgi-bin/fprovweb.exe?_xtype=text/plain&version=0" +
    "&observer=" +
    QTSConfig.observer +
    "&bodies=" +
    String(Object.keys(QTSConfig.lightSource)) +
    "&start_utc_time=" +
    startUTCTime +
    "&end_utc_time=" +
    endUTCTime +
    "&step_sec=" +
    stepSec +
    "&cmd_script=satiview_get_bodies_position.msh";
  console.log(act_bodies_pos_moon_url);
  var response = await fetch(act_bodies_pos_moon_url);
  var bodiesPos = await response.json();
  bodiesPosList = bodiesPos.utc_times;
  // reset
  lastBodiesPosActiveIndex = -1;

  console.log("bodies pos num:");
  console.log(bodiesPosList.length);
  secsFromStartUTCArray.length = bodiesPosList.length;
  for (var i = 0; i < bodiesPosList.length; i++) {
    secsFromStartUTCArray[i] = Cesium.JulianDate.secondsDifference(
      Cesium.JulianDate.fromIso8601(bodiesPos.utc_times[i].utc_time),
      startUTCTime
    );
    // console.log(secsFromStartUTCArray[i]);
  }

  updateBodiesPosAtCurrentTime();
}

// needed for properly rotate earth texture when using polar dem terrain
// rotate around y axis by 90 deg
var poleRotationM = new Cesium.Matrix3(0, 0, -1, 0, 1, 0, 1, 0, 0);
const bodiesPosUpdatedEvent = new Event("bodiesPosUpdated");

// Allocate "new" variables outside of the render loop when possible, to reduce garbage collection.
var posSPICE = new Cesium.Cartesian3(1, 1, 1);
var lightDirectionSPICE = new Cesium.Cartesian3(1, 1, 1);
export function updateBodiesPosAtCurrentTime() {
  if (secsFromStartUTCArray.length <= 0) {
    return;
  }

  let secsFromStartUTC = Cesium.JulianDate.secondsDifference(
    viewer.clock.currentTime,
    viewer.clock.startTime
  );

  var closestTimeIndex = nearestTimeIndexBinarySearch(secsFromStartUTC);
  if (closestTimeIndex >= 0 && lastBodiesPosActiveIndex !== closestTimeIndex) {
    lastBodiesPosActiveIndex = closestTimeIndex;
    // updade bodies position
    updateBodiesPosition();

    document.dispatchEvent(bodiesPosUpdatedEvent);
  }
}

export function updateBodiesPosition() {
  if (lastBodiesPosActiveIndex < 0) {
    // nothing to do
    return;
  }

  var bodiesPos = bodiesPosList[lastBodiesPosActiveIndex];
  for (var body in bodiesPrimitive) {
    posSPICE = bodiesCurrentSPICEPos[body];
    posSPICE.x =
      (bodiesPos[body].position[0] * 1000.0) /
      QTSConfig.lightSource[body].radiusScaleFactor;
    posSPICE.y =
      (bodiesPos[body].position[1] * 1000.0) /
      QTSConfig.lightSource[body].radiusScaleFactor;
    posSPICE.z =
      (bodiesPos[body].position[2] * 1000.0) /
      QTSConfig.lightSource[body].radiusScaleFactor;
    bodiesCurrentSPICEPos[body] = adjustCartesianCoords(
      posSPICE,
      isOptimizedPolarTerrain
    );

    if (
      !QTSConfig.lightSource[body].primitiveParams
        .dependsOnTerrainModelRotation ||
      !isOptimizedPolarTerrain
    ) {
      Cesium.Matrix4.fromRotationTranslation(
        Cesium.Matrix3.IDENTITY,
        bodiesCurrentSPICEPos[body],
        bodiesPrimitive[body].modelMatrix
      );
    } else {
      Cesium.Matrix4.fromRotationTranslation(
        poleRotationM,
        bodiesCurrentSPICEPos[body],
        bodiesPrimitive[body].modelMatrix
      );
    }
  }

  // update light direction
  let currentLightSource = viewModel.lightSource;
  lightDirectionSPICE.x = bodiesPos[currentLightSource].light_direction[0];
  lightDirectionSPICE.y = bodiesPos[currentLightSource].light_direction[1];
  lightDirectionSPICE.z = bodiesPos[currentLightSource].light_direction[2];
  lightDirectionSPICE = adjustCartesianCoords(
    lightDirectionSPICE,
    isOptimizedPolarTerrain
  );
  viewer.scene.light.direction = lightDirectionSPICE;
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

export function getLightSourceSPICEPosition() {
  return getBodySPICEPosition(viewModel.lightSource);
}

export function getBodySPICEPosition(body) {
  if (lastBodiesPosActiveIndex < 0) {
    // nothing
    return undefined;
  }

  return bodiesCurrentSPICEPos[body];
}
