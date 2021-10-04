import CesiumMath from "../../Source/Core/Math.js";
import CesiumTerrainProvider from "../../Source/Core/CesiumTerrainProvider.js";
import ProviderViewModel from "../../Source/Widgets/BaseLayerPicker/ProviderViewModel.js";

import { QTSConfig } from "./config/config.js";

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

var terrainBaseUrl = "";
var terrainResampligMethod = "cubic";
var terrainMeshScale = 3;

// for automatic regular/polar terrain switch
var automaticPolarTerrainTransition = false;
// switch to polar dem when abs(lat) > polarDemLatTh
var polarDemLatTh = 45; // deg
// lat tolerance for switching terrain
// the switch is happening if abs(lat) > (polarDemLatTh + autoDemTransitionLatTol)
// or abs(lat) < (polarDemLatTh - autoDemTransitionLatTol)
// note when the camera height > 1000 km then autoDemTransitionLatTol is increased by a factor of 2
var autoDemTransitionLatTol = 5; // deg
// km. Enable automatic terrain switch when camera altitude is lower than this param
var autoDemTransitionEnabledAlt = 2000;
var regularTerrainName = "";
var polarTerrainName = "";
var currTerrainName;

function buildTerrainUrl() {
  var meshMaxErrorParam;
  if (viewModel.terrainMeshMaxError !== "auto") {
    meshMaxErrorParam = "mesh_max_error=" + viewModel.terrainMeshMaxError;
  } else {
    if (viewModel.terrainMeshAlgorithm === "martini") {
      // martini
      // set some default params
      if (viewModel._terrainAutoMeshMaxErrorMult < 0) {
        // default values
        viewModel._terrainAutoMeshMaxErrorMult = 0.1;
        viewModel._terrainAutoMeshMaxErrorMin = 0.5;
        viewModel._terrainAutoMeshMaxErrorMax = 600;
      }
    } else {
      // delatin
      // set some default params
      if (viewModel._terrainAutoMeshMaxErrorMult < 0) {
        // default values
        viewModel._terrainAutoMeshMaxErrorMult = 0.04;
        viewModel._terrainAutoMeshMaxErrorMin = 1;
        viewModel._terrainAutoMeshMaxErrorMax = 250;
      }
    }
    meshMaxErrorParam = `UNSTABLE_auto_mesh_max_error_multiplier=${viewModel._terrainAutoMeshMaxErrorMult}&UNSTABLE_auto_mesh_max_error_min=${viewModel._terrainAutoMeshMaxErrorMin}&UNSTABLE_auto_mesh_max_error_max=${viewModel._terrainAutoMeshMaxErrorMax}`;
    if (viewModel._terrainAutoMeshMaxErrorThMult >= 0) {
      meshMaxErrorParam =
        meshMaxErrorParam +
        `&UNSTABLE_auto_mesh_max_error_threshold_multiplier=${viewModel._terrainAutoMeshMaxErrorThMult}`;
    }
    meshMaxErrorParam = meshMaxErrorParam + "&auto_mesh_max_error=True";
  }

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
    viewModel.terrainMeshAlgorithm +
    "&" +
    meshMaxErrorParam;
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

export function updateTerrainMeshAlgorithm(alg) {
  if (viewModel.terrainMeshAlgorithm === alg) {
    return;
  }

  viewModel.terrainMeshAlgorithm = alg;
  // update terrain provider (only url changed)
  if (currTerrainName) {
    viewer.terrainProvider = createTerrainProvider(
      viewModel.terrainVertexNormalsEnabled
    );
  }
}

export function updateTerrainMeshMaxErrorParams(mult, min, max, thMult) {
  viewModel.setAutoMeshMaxErrorParams(mult, min, max, thMult);

  if (viewModel.terrainMeshMaxError === "auto") {
    // update terrain provider (only url changed)
    if (currTerrainName) {
      viewer.terrainProvider = createTerrainProvider(
        viewModel.terrainVertexNormalsEnabled
      );
    }
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

  updateTerrainDisplay("Terrain: " + terrainName);

  if (QTSConfig.terrainInfoList[terrainName]) {
    currTerrainName = terrainName;
    viewModel.terrainVertexNormalsEnabled = terrainNormalsEnabled;

    terrainBaseUrl =
      QTSConfig.terrainServername +
      QTSConfig.terrainInfoList[terrainName].urlSubpath;
    return updateTerrainProvider(
      terrainBaseUrl,
      QTSConfig.terrainInfoList[terrainName].optimizedPolarTerrain,
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
  if (terrainName === "automatic") {
    console.log("enabling automatic terrain loading...");
    automaticPolarTerrainTransition = true;
    setCurrTerrainLabelVisible(true);

    regularTerrainName = QTSConfig.defaultRegularTerrain;
    polarTerrainName = QTSConfig.defaultPolarTerrain;

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
        QTSConfig.defaultRegularTerrain,
        viewModel.terrainVertexNormalsEnabled
      );
    }
  }

  // best terrain based on camera location
  var bestTerrainName = getBestLatTerrainName(lat, height);
  // console.log("best terrain (" + lat.toFixed(3) + "): " + bestTerrainName);
  return setTerrain(bestTerrainName, viewModel.terrainVertexNormalsEnabled);
}

export function initializeTerrainPicker() {
  viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();

  var providerTerrainModels = [];
  for (const terrainID in QTSConfig.terrainInfoList) {
    if (QTSConfig.terrainInfoList.hasOwnProperty(terrainID)) {
      const terrainModel = new ProviderViewModel({
        name: QTSConfig.terrainInfoList[terrainID].name,
        iconUrl: QTSConfig.terrainInfoList[terrainID].iconUrl,
        tooltip: QTSConfig.terrainInfoList[terrainID].tooltip,
        creationFunction: function () {
          return newTerrainNameSelected(terrainID);
        },
      });

      // add attribute
      terrainModel.terrainName = terrainID;
      providerTerrainModels.push(terrainModel);
    }
  }

  viewer.baseLayerPicker.viewModel.terrainProviderViewModels = providerTerrainModels;

  // change Imager Title
  var dropPanel = viewer.baseLayerPicker._dropPanel;
  var dropPanelSections = dropPanel.getElementsByClassName(
    "cesium-baseLayerPicker-sectionTitle"
  );
  var imageryTitle = dropPanelSections[1];
  imageryTitle.innerHTML = "Terrain Source";
}
