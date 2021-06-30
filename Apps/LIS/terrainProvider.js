import * as Cesium from "../../Source/Cesium.js";

import {
  cartographicCamera,
  setCurrTerrainLabelVisible,
  terrainMenu,
  updateGlobeCartesianPositions,
  updateTerrainDisplay,
  viewer,
} from "./LIS.js";

import { viewModel } from "./viewModel.js";

import { invAdjustCartesianCoords } from "./adjustCartesian.js";

var terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/sldem_lola";
var terrainResampligMethod = "cubic";
var terrainMeshScale = 3;
var terrainMeshAlgorithm = "delatin";
export var isOptimizedPolarTerrain = false;
var currTerrainName;

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
    viewModel.terrainMeshMaxError;
  console.log("terrain url:");
  console.log(terrainUrl);

  return terrainUrl;
}

function createTerrainProvider(requestVertexNormals) {
  var terrainProvider = new Cesium.CesiumTerrainProvider({
    url: buildTerrainUrl(),
    requestVertexNormals: requestVertexNormals,
  });

  return terrainProvider;
}

export function updateTerrainMeshMaxError(err) {
  if (viewModel.terrainMeshMaxError == err) {
    return;
  }

  viewModel.terrainMeshMaxError = err;
  // update terrain provider (only url changed)
  viewer.terrainProvider = createTerrainProvider(
    viewer.terrainProvider.requestVertexNormals
  );
}

export function resetTerrain() {
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

function updateTerrainProvider(
  terrainBaseUrl,
  optimizedPolarTerrain,
  requestVertexNormals
) {
  // update terrain provider
  viewer.terrainProvider = createTerrainProvider(requestVertexNormals);
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

// change terrain provider based on terrain name
function setTerrain(terrainName) {
  if (terrainName === currTerrainName) {
    // nothing to do
    return;
  }

  console.log("setting terrain " + terrainName);
  var optimizedPolarTerrain;
  var requestVertexNormals;

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

  /*
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
    */

  if (terrainName === "GOTM") {
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

  if (terrainName === "GOTM - no normals") {
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

// change terrain provider based on terrain name
// support "automatic" terrain for automatically switching between regular/polar terrain
// based on latitude
export function newTerrainNameSelected(terrainName) {
  console.log("terrain name selected: " + terrainName);
  if (
    terrainName === "automatic terrain" ||
    terrainName === "automatic terrain - no normals"
  ) {
    console.log("enabling automatic terrain loading...");
    automaticPolarTerrainTransition = true;
    setCurrTerrainLabelVisible(true);

    if (terrainName === "automatic terrain") {
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

  // update view model
  viewModel.terrainProviderIdx = terrainMenu.selectedIndex;
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

export function maybeUpdateTerrainProvider(lat, height) {
  if (!automaticPolarTerrainTransition) {
    // nothing to do
    return;
  }

  if (!lat || !height) {
    // get current camera lat
    viewer.scene.globe.ellipsoid.cartesianToCartographic(
      invAdjustCartesianCoords(
        viewer.scene.camera.positionWC,
        isOptimizedPolarTerrain
      ),
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

var usgsLolaProvider = new Cesium.CesiumTerrainProvider({
  url: "https://lunar-dem-tiles2.quickmap.io/usgs_lola/",
  requestVertexNormals: true,
});

var JPLProvider = new Cesium.CesiumTerrainProvider({
  url: "https://marshub.s3.amazonaws.com/moon_v14",
  requestVertexNormals: false,
});

const SldemLolaModel = new Cesium.ProviderViewModel({
  name: "sldem lola",
  iconUrl: "./images/TerrainProviders/terrain.png",
  tooltip: "Sldem Lola",
  creationFunction: function () {
    terrainBaseUrl = "https://lunar-dem-tiles2.quickmap.io/sldem_lola";
    requestVertexNormals = true;
    optimizedPolarTerrain = false;
    updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      requestVertexNormals
    );
    return WACMosaicNSImageryProvider;
  },
});

export function initializeTerrainPicker() {
  viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();

  var providerTerrainModels = [];
  providerTerrainModels.push(SldemLolaModel);
  viewer.baseLayerPicker.viewModel.terrainProviderViewModels = providerTerrainModels;
}
