import {
  defined,
  Rectangle,
  Cartesian3,
  Cartographic,
  Math,
} from "../../Source/Cesium.js";

import { flyingToNewPosition } from "./LIS.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

/**
 * Utility function to update querystring in url.
 *
 * takes a `params` object and updates those values in the querystring
 */
export function updateUrlParams(params) {
  if (history.pushState) {
    var url = new URL(window.location);
    // remove undefined url params
    url.searchParams.forEach(function (value, key) {
      if (params[key] === undefined) {
        // remove param
        url.searchParams.delete(key);
      }
    });
    for (var [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    window.history.pushState({}, "", url);
  } else {
    console.log("browser does not support querystring updating");
  }
}

/**
 * Utility function to fly to a point/region emulating stereographic projection for polar regions.
 * Make sure the north pole is up for mid latitudes
 *
 * inputs:
 *  - camera: The final position of the camera in WGS84 (world) coordinates or a rectangle that would be visible from a top-down view.
 *  - destination: final point or
 *  - polarLat (opt)
 */

// for destination at +/- defaultPolarLat, the camera will be orientated for emulating polar steregraphic view
// or for having the north up in case of mid latitudes
const defaultPolarLat = 65;

var scratchFlyToDestination = new Cartesian3();
var poiCarto = new Cartographic();
var poiCartesian = new Cartesian3();
var cameraDirNorm = new Cartesian3();
var cameraDir = new Cartesian3();

export function cameraFlyToLookDownNorthUp(
  camera,
  destination,
  ellipsoid,
  duration,
  polarLat
) {
  var isRectangle = defined(destination.west);
  if (isRectangle) {
    poiCarto = Rectangle.center(destination, poiCarto);
    destination = camera.getRectangleCameraCoordinates(
      destination,
      scratchFlyToDestination
    );
  } else {
    poiCarto = Cartographic.fromCartesian(destination, ellipsoid);
  }

  if (!defined(polarLat)) {
    polarLat = defaultPolarLat;
  }

  var poiLat = Math.toDegrees(poiCarto.latitude);
  var up;
  if (poiLat < -polarLat) {
    // south pole. Emulate south polar sterographic => lon 0 up
    up = new Cartesian3(1, 0, 0);
  } else if (poiLat > polarLat) {
    // north pole. Emulate north polar sterographic => lon 180 up
    up = new Cartesian3(-1, 0, 0);
  } else {
    // north pole up
    up = new Cartesian3(0, 0, 1);
  }

  destination = adjustCartesianCoords(destination, isOptimizedPolarTerrain);
  //   if (defined(up)) {
  up = adjustCartesianCoords(up, isOptimizedPolarTerrain);
  // camera direction straight down to the point of interest
  poiCartesian = Cartographic.toCartesian(poiCarto, ellipsoid, poiCartesian);
  poiCartesian = adjustCartesianCoords(poiCartesian, isOptimizedPolarTerrain);
  cameraDirNorm = Cartesian3.normalize(poiCartesian, cameraDirNorm);
  cameraDir = Cartesian3.negate(cameraDirNorm, cameraDir);

  flyingToNewPosition();
  camera.flyTo({
    destination: destination,
    orientation: {
      direction: cameraDir,
      up: up,
    },
    duration: duration,
  });
  // } else {
  //   camera.flyTo({
  //     destination: destination,
  //     orientation: {
  //       heading: 0.0,
  //       pitch: -Math.PI_OVER_TWO,
  //       roll: 0.0,
  //     },
  //     duration: duration,
  //   });
  // }
}
