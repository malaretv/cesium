import CesiumMath from "../../Source/Core/Math.js";
import CesiumTerrainProvider from "../../Source/Core/CesiumTerrainProvider.js";
import ProviderViewModel from "../../Source/Widgets/BaseLayerPicker/ProviderViewModel.js";

import {
  cartographicCamera,
  setCurrTerrainLabelVisible,
  updateGlobeCartesianPositions,
  updateTerrainDisplay,
  viewer,
} from "./LIS.js";

import { viewModel } from "./viewModel.js";

import { invAdjustCartesianCoords } from "./adjustCartesian.js";

import {
  isOptimizedPolarTerrain,
  setOptimizedPolarTerrainEnabled,
} from "./terrainProviderData.js";
export { isOptimizedPolarTerrain };

// use this for having server caching enabled
var terrainServername = "https://lunar-dem-tiles2.quickmap.io";
// var terrainServername = "https://lunar-dem-api.quickmap.io";
var terrainBaseUrl = terrainServername + "/sldem_lola";
var terrainResampligMethod = "cubic";
var terrainMeshScale = 3;
var terrainMeshAlgorithm = "delatin";
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
  //  "auto_mesh_max_error=True";
  console.log("terrain url:");
  console.log(terrainUrl);

  return terrainUrl;
}

function createTerrainProvider(requestVertexNormals) {
  var terrainProvider = new CesiumTerrainProvider({
    url: buildTerrainUrl(),
    requestVertexNormals: requestVertexNormals,
  });

  return terrainProvider;
}

export function updateTerrainVertexNormalsEnabled(terrainNormalsEnabled) {
  if (viewModel.terrainVertexNormalsEnabled === terrainNormalsEnabled) {
    return;
  }

  viewModel.terrainVertexNormalsEnabled = terrainNormalsEnabled;
  // update terrain provider
  if (currTerrainName) {
    viewer.terrainProvider = createTerrainProvider(terrainNormalsEnabled);
  }
}

export function updateTerrainMeshMaxError(err) {
  if (viewModel.terrainMeshMaxError === err) {
    return;
  }

  viewModel.terrainMeshMaxError = err;
  // update terrain provider (only url changed)
  if (currTerrainName) {
    viewer.terrainProvider = createTerrainProvider(
      viewModel.terrainVertexNormalsEnabled
    );
  }
}

export function resetTerrain() {
  if (!automaticPolarTerrainTransition) {
    // nothing to do
    return;
  }

  setTerrain(regularTerrainName, viewModel.terrainVertexNormalsEnabled);
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
  setOptimizedPolarTerrainEnabled(optimizedPolarTerrain);

  maybeUpdateGlobeCartesianPositions(
    wasOptimizedPolarTerrain,
    isOptimizedPolarTerrain
  );

  return viewer.terrainProvider;
}

function setTerrainProvider(terrainProvider, optimizedPolarTerrain) {
  // update terrain provider
  viewer.terrainProvider = terrainProvider;
  // check if reference system changed
  var wasOptimizedPolarTerrain = isOptimizedPolarTerrain;
  setOptimizedPolarTerrainEnabled(optimizedPolarTerrain);
  maybeUpdateGlobeCartesianPositions(
    wasOptimizedPolarTerrain,
    isOptimizedPolarTerrain
  );
}

// change terrain provider based on terrain name
function setTerrain(terrainName, terrainNormalsEnabled) {
  if (
    terrainName === currTerrainName &&
    terrainNormalsEnabled === viewModel.terrainVertexNormalsEnabled
  ) {
    // nothing to do
    return viewer.terrainProvider;
  }

  console.log(
    "setting terrain " +
      terrainName +
      " (normals enabled : " +
      terrainNormalsEnabled +
      ")"
  );
  var optimizedPolarTerrain;

  currTerrainName = terrainName;
  viewModel.terrainVertexNormalsEnabled = terrainNormalsEnabled;
  updateTerrainDisplay("Terrain: " + currTerrainName);

  if (terrainName === "sldem_lola") {
    terrainBaseUrl = terrainServername + "/sldem_lola";
    optimizedPolarTerrain = false;
    return updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      terrainNormalsEnabled
    );
  }

  if (terrainName === "usgs_lola") {
    optimizedPolarTerrain = false;
    setTerrainProvider(usgsLolaProvider, optimizedPolarTerrain);
    return viewer.terrainProvider;
  }

  if (terrainName === "NASA JPL - no normals") {
    optimizedPolarTerrain = false;
    setTerrainProvider(JPLProvider, optimizedPolarTerrain);
    return viewer.terrainProvider;
  }

  if (terrainName === "Optimized PolarDEM") {
    terrainBaseUrl = terrainServername + "/dummy_poles2";
    optimizedPolarTerrain = true;
    return updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      terrainNormalsEnabled
    );
  }

  /*
    if (terrainName === "GOTM") {
      terrainBaseUrl = terrainServername + "/alt_poles";
      requestVertexNormals = true;
      optimizedPolarTerrain = true;
      return updateTerrainProvider(
        terrainBaseUrl,
        optimizedPolarTerrain,
        requestVertexNormals
      );
    }
  
    if (terrainName === "GOTM - no normals") {
      terrainBaseUrl = terrainServername + "/alt_poles";
      requestVertexNormals = false;
      optimizedPolarTerrain = true;
      return updateTerrainProvider(
        terrainBaseUrl,
        optimizedPolarTerrain,
        requestVertexNormals
      );
    }
    */

  if (terrainName === "GOTM") {
    terrainBaseUrl = terrainServername + "/alt_poles_hires";
    optimizedPolarTerrain = true;
    return updateTerrainProvider(
      terrainBaseUrl,
      optimizedPolarTerrain,
      terrainNormalsEnabled
    );
  }

  console.log("TERRAIN NOT FOUND!!!");
  return viewer.terrainProvider;
}

// change terrain provider based on terrain name
// support "automatic" terrain for automatically switching between regular/polar terrain
// based on latitude
export function newTerrainNameSelected(terrainName, updateSelected) {
  // note: if this is called after imagery layerAdded event, then the selected entry on the picker
  // had not been updated yet, so call this with updateSelected set to false in order to avoid bad behavior
  if (updateSelected === undefined) {
    updateSelected = false;
  }

  var terrainProvider;
  console.log("terrain name selected: " + terrainName);
  if (terrainName === "automatic terrain") {
    console.log("enabling automatic terrain loading...");
    automaticPolarTerrainTransition = true;
    setCurrTerrainLabelVisible(true);

    regularTerrainName = regularTerrainNameDef;
    polarTerrainName = polarTerrainNameDef;

    terrainProvider = maybeUpdateTerrainProvider();
  } else {
    if (automaticPolarTerrainTransition) {
      setCurrTerrainLabelVisible(false);
    }
    automaticPolarTerrainTransition = false;
    terrainProvider = setTerrain(
      terrainName,
      viewModel.terrainVertexNormalsEnabled
    );
  }

  // update view model
  viewModel.terrainProviderName = terrainName;

  if (updateSelected) {
    var selectedModelList = viewer.baseLayerPicker.viewModel.terrainProviderViewModels.filter(
      (obj) => {
        return obj.terrainName === terrainName;
      }
    );
    if (selectedModelList.length) {
      var selectedModel = selectedModelList[0];
      if (viewer.baseLayerPicker.viewModel.selectedTerrain !== selectedModel) {
        viewer.baseLayerPicker.viewModel.selectedTerrain = selectedModel;
      }
    }
  }

  return terrainProvider;
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
    return viewer.terrainProvider;
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
    lat = CesiumMath.toDegrees(cartographicCamera.latitude);
    height = cartographicCamera.height * 0.001; // km
  }

  if (height > autoDemTransitionEnabledAlt) {
    if (currTerrainName) {
      // high elevation
      // nothing to do
      return viewer.terrainProvider;
    } else {
      // no terrain initialized. Let's use a default one
      return setTerrain(
        regularTerrainName,
        viewModel.terrainVertexNormalsEnabled
      );
    }
  }

  // best terrain based on camera location
  var bestTerrainName = getBestLatTerrainName(lat, height);
  // console.log("best terrain (" + lat.toFixed(3) + "): " + bestTerrainName);
  return setTerrain(bestTerrainName, viewModel.terrainVertexNormalsEnabled);
}

var usgsLolaProvider = new CesiumTerrainProvider({
  url: "https://lunar-dem-tiles2.quickmap.io/usgs_lola/",
  requestVertexNormals: true,
});

var JPLProvider = new CesiumTerrainProvider({
  url: "https://marshub.s3.amazonaws.com/moon_v14",
  requestVertexNormals: false,
});

export function initializeTerrainPicker() {
  viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();

  // Automatic
  const automaticTerrainModel = new ProviderViewModel({
    name: "Automatic Terrain",
    iconUrl: "./images/TerrainProviders/terrain_auto.png",
    tooltip: "Automatic Terrain Selection based on latitude",
    creationFunction: function () {
      return newTerrainNameSelected("automatic terrain");
    },
  });
  automaticTerrainModel.terrainName = "automatic terrain";

  // SLDEM LOLA
  const SldemLolaModel = new ProviderViewModel({
    name: "SLDEM LOLA",
    iconUrl: "./images/TerrainProviders/terrain.png",
    tooltip: "SLDEM LOLA",
    creationFunction: function () {
      return newTerrainNameSelected("sldem_lola");
    },
  });
  // add attribute
  SldemLolaModel.terrainName = "sldem_lola";

  // GOTM (HI RES)
  const GOTMHRModel = new ProviderViewModel({
    name: "Polar Optimized",
    iconUrl: "./images/TerrainProviders/gotm.png",
    tooltip: "Polar Optimized",
    creationFunction: function () {
      return newTerrainNameSelected("GOTM");
    },
  });
  // add attribute
  GOTMHRModel.terrainName = "GOTM";

  var providerTerrainModels = [];
  providerTerrainModels.push(automaticTerrainModel);
  providerTerrainModels.push(SldemLolaModel);
  providerTerrainModels.push(GOTMHRModel);
  viewer.baseLayerPicker.viewModel.terrainProviderViewModels = providerTerrainModels;
  // viewer.baseLayerPicker.viewModel.selectedTerrain = automaticTerrainModel;

  // change Imager Title
  var dropPanel = viewer.baseLayerPicker._dropPanel;
  var dropPanelSections = dropPanel.getElementsByClassName(
    "cesium-baseLayerPicker-sectionTitle"
  );
  var imageryTitle = dropPanelSections[1];
  imageryTitle.innerHTML = "Terrain Source";
}
