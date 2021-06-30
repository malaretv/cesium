import * as Cesium from "../../Source/Cesium.js";

import { Cartesian3 } from "../../Source/Cesium.js";

import {
  viewer,
  locationsInfo,
  setLocation,
  createLayerImageryProvider,
} from "./LIS.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

import {
  initializeTerrainPicker,
  isOptimizedPolarTerrain,
} from "./terrainProvider.js";

var buttonBgColor = "rgba(42, 42, 42, 0.7)";
var buttonBgSelectedColor = "rgba(255, 255, 255, 0.7)";

//////////////////////////////////////////////
///////////// GO TO TOOL /////////////////////
//////////////////////////////////////////////

var recenterButtonSrc = "./images/recenter_white_16x16.png";
var recenterButtonSelectedSrc = "./images/recenter_16x16.png";

/**
    add goto tool
 */
var recenterButton;
var gotoForm;
var gotoInput;
var gotoError;

export function addGoToButton() {
  "use strict";

  var recenterButtonDiv = document.createElement("div");
  recenterButton = document.createElement("input");
  recenterButton.src = recenterButtonSrc;
  recenterButton.type = "image";
  recenterButton.style.backgroundColor = buttonBgColor;
  recenterButtonDiv.appendChild(recenterButton);
  document.getElementById("toolbar").appendChild(recenterButtonDiv);

  recenterButton.onclick = recenterButtonClicked;

  var goto = document.createElement("div");
  var gotoformHTML =
    "<form id='goto-form' hidden> \
            <p id='goto-error' hidden>Please fill out all fields.</p> \
            <input list='locationsList' type='text' id='goto-input' placeholder='lon,lat[,ele (km)]' required /> \
            <datalist id='locationsList'></datalist> \
            <button type='submit'>Go</button> \
    </form>";
  goto.innerHTML = gotoformHTML;

  var locationsOptionList = "";
  for (var locationName in locationsInfo) {
    locationsOptionList += '<option value="' + locationName + '" />';
  }

  document.getElementById("toolbar").appendChild(goto);

  gotoForm = document.getElementById("goto-form");
  gotoInput = document.getElementById("goto-input");
  gotoInput.className = "cesium-button";
  gotoError = document.getElementById("goto-error");
  document.getElementById("locationsList").innerHTML = locationsOptionList;

  gotoInput.oninvalid = invalid;
  gotoForm.onsubmit = submit;
}

function setRecenterButtonChecked(checked) {
  if (checked) {
    // select
    recenterButton.style.backgroundColor = buttonBgSelectedColor;
    recenterButton.src = recenterButtonSelectedSrc;
  } else {
    // unselect
    recenterButton.style.backgroundColor = buttonBgColor;
    recenterButton.src = recenterButtonSrc;
  }
  setGotoFormVisible(checked);
}

function recenterButtonClicked() {
  var checked = gotoForm.hasAttribute("hidden");
  setRecenterButtonChecked(checked);
}

function setGotoFormVisible(yes) {
  if (yes) {
    gotoForm.removeAttribute("hidden");
  } else {
    gotoForm.setAttribute("hidden", "");
    hideFormError();
    // clear input string
    gotoInput.value = "";
  }
}

function invalid(event) {
  gotoError.innerHTML = "Must enter value";
  gotoError.removeAttribute("hidden");
}

function hideFormError() {
  gotoError.setAttribute("hidden", "");
}

function showFormError(msg) {
  gotoError.innerHTML = msg;
  gotoError.removeAttribute("hidden");
}

const deltaT = 10;
function submit(event) {
  hideFormError();

  const value = gotoInput.value;
  if (value.includes(",")) {
    // splits string into array off of ',' and converts every item in array to number
    const coords = value.split(",").map((x) => +x);
    // check if valid coordinate pair
    if (
      (coords.length === 2 || coords.length === 3) &&
      coords.every((x) => isFinite(x))
    ) {
      if (coords.length === 2) {
        // default elevation
        coords.push(20);
      }
      const [lon, lat, ele] = coords;
      console.log(`lon: ${lon} lat: ${lat} ele: ${ele}`);
      var newCameraPos = adjustCartesianCoords(
        Cartesian3.fromDegrees(
          lon,
          lat,
          ele * 1000.0, // m
          viewer.scene.globe.ellipsoid
        ),
        isOptimizedPolarTerrain
      );

      viewer.scene.camera.flyTo({
        destination: newCameraPos,
        duration: deltaT,
      });
    } else {
      showFormError("Invalid coordinates");
    }
  } else {
    // search key case insensitive
    var location =
      locationsInfo[
        Object.keys(locationsInfo).find(
          (key) => key.toLowerCase() === value.toLowerCase()
        )
      ];
    if (location !== undefined) {
      setLocation(location);
    } else {
      showFormError("Invalid location");
    }
  }
  // For this example, don't actually submit the form
  event.preventDefault();
}

//////////////////////////////////////////////
///////////// Time TOOL //////////////////
//////////////////////////////////////////////

var timeButtonSrc = "./images/clock_white_16x16.png";
var timeButtonSelectedSrc = "./images/clock_16x16.png";

/**
    add Time tool
 */
var timeButton;
var timeForm;
var timeInput;
var timeError;

export function addTimeButton() {
  "use strict";

  var timeButtonDiv = document.createElement("div");
  timeButton = document.createElement("input");
  timeButton.src = timeButtonSrc;
  timeButton.type = "image";
  timeButton.style.backgroundColor = buttonBgColor;
  timeButtonDiv.appendChild(timeButton);
  document.getElementById("toolbar").appendChild(timeButtonDiv);

  // timeButton.onclick = timeButtonClicked;

  var time = document.createElement("div");
  var timeformHTML =
    "<form id='time-form' hidden> \
            <p id='time-error' hidden>Please fill out all fields.</p> \
            <input type='text' id='time-input' placeholder='startT,endT,currentT' required /> \
            <button type='submit'>Go</button> \
    </form>";
  time.innerHTML = timeformHTML;

  document.getElementById("toolbar").appendChild(time);

  timeForm = document.getElementById("time-form");
  timeInput = document.getElementById("time-input");
  timeError = document.getElementById("time-error");

  timeInput.oninvalid = invalid;
  timeForm.onsubmit = submit;
}

//////////////////////////////////////////////
////////////// BASE LAYER PICKER /////////////
//////////////////////////////////////////////

function createEmptyImageryProvider() {
  /* NOTE: use out of range scaling values for returning empty tiles*/
  var layerUrl =
    "https://act-test.lroc.asu.edu/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=png&layer=wac_albedo&bodyview=lunar-fulleqc&d_mask=1&d_imf=none&d_opt=wcolut0&d_val=1000%2C2000&cmd_script=get_tile.msh";

  const layerImageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: layerUrl,
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

const NullImageryProvider = createEmptyImageryProvider(
  "wac_albedo",
  "lunar-fulleqc",
  "png"
);

const NullModel = new Cesium.ProviderViewModel({
  name: "None",
  iconUrl: "./images/ImageryProviders/none.png",
  tooltip: "None (Plain terrain with shadows)",
  creationFunction: function () {
    return NullImageryProvider;
  },
});

const WACMosaicNSImageryProvider = createLayerImageryProvider(
  "wac_albedo",
  "lunar-fulleqc",
  "jpg"
);

const WACMosaicNSModel = new Cesium.ProviderViewModel({
  name: "WAC Mosaic (No Shadows)",
  iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
  tooltip: "WAC Mosaic (No Shadows)",
  creationFunction: function () {
    return WACMosaicNSImageryProvider;
  },
});

const WACMosaicNSPolarImageryProvider = createLayerImageryProvider(
  "wac_albedo",
  "lunar-polarshifted-eqc",
  "jpg"
);

const WACMosaicNSPolarModel = new Cesium.ProviderViewModel({
  name: "WAC Mosaic (No Shadows)",
  iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
  tooltip: "WAC Mosaic (No Shadows)",
  creationFunction: function () {
    return WACMosaicNSPolarImageryProvider;
  },
});

const sunVisibilty60mImageryProvider = createLayerImageryProvider(
  "lavgvis_s_60m",
  "lunar-polarshifted-eqc",
  "png"
);

const sunVisibilty60mModel = new Cesium.ProviderViewModel({
  name: "Sun Visibility 60m",
  iconUrl: "./images/ImageryProviders/sun_visibility_60m.png",
  tooltip: "Sun Visibility 60m",
  creationFunction: function () {
    return sunVisibilty60mImageryProvider;
  },
});

export var NoneModelIdx;
export var WACMosaicNSModelIdx;
export var sunVisibilty60mModelIdx;

export function initializeBaseLayerPicker() {
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels.removeAll();
  // viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();
  var providerViewModels = [];
  providerViewModels.push(NullModel);
  NoneModelIdx = providerViewModels.length - 1;
  providerViewModels.push(WACMosaicNSModel);
  WACMosaicNSModelIdx = providerViewModels.length - 1;
  providerViewModels.push(sunVisibilty60mModel);
  sunVisibilty60mModelIdx = providerViewModels.length - 1;
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
  viewer.baseLayerPicker.viewModel.selectedImagery = NullModel;

  initializeTerrainPicker();
}

export function updateBaseLayerPickerImageryLayers() {
  var providerViewModels =
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels;
  if (isOptimizedPolarTerrain) {
    providerViewModels[WACMosaicNSModelIdx] = WACMosaicNSPolarModel;
    if (viewer.baseLayerPicker.viewModel.selectedImagery === WACMosaicNSModel) {
      viewer.baseLayerPicker.viewModel.selectedImagery = WACMosaicNSPolarModel;
    }
  } else {
    providerViewModels[WACMosaicNSModelIdx] = WACMosaicNSModel;
    if (
      viewer.baseLayerPicker.viewModel.selectedImagery === WACMosaicNSPolarModel
    ) {
      viewer.baseLayerPicker.viewModel.selectedImagery = WACMosaicNSModel;
    }
  }
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
}

export function getImageryLayerIdx(imageryLayerProvider) {
  var pickerImageryProvider;
  var imageryProviderCreationFunction;

  for (var i in viewer.baseLayerPicker.viewModel.imageryProviderViewModels) {
    imageryProviderCreationFunction =
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels[i]
        ._creationCommand;
    if (imageryProviderCreationFunction !== undefined) {
      pickerImageryProvider = imageryProviderCreationFunction();
      if (imageryLayerProvider === pickerImageryProvider) return parseInt(i);
    }
  }

  // not found
  return -1;
}
