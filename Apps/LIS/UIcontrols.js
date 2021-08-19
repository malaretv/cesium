import { Cartesian3, Matrix4 } from "../../Source/Cesium.js";

import { viewer, locationsInfo, setLocation } from "./LIS.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

import {
  initializeTerrainPicker,
  isOptimizedPolarTerrain,
  updateTerrainMeshMaxErrorParams,
} from "./terrainProvider.js";

import { initializeImageryPicker } from "./imageryProvider.js";

import { cameraFlyToLookDownNorthUp } from "./utils.js";

import { viewModel } from "./viewModel.js";

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
  var is_chrome = navigator.userAgent.indexOf("Chrome") > -1;
  var is_safari = navigator.userAgent.indexOf("Safari") > -1;
  if (is_chrome && is_safari) {
    is_safari = false;
  }
  if (!is_safari) {
    // not Safari.
    // Does not work on Safari.
    gotoInput.className = "cesium-button";
  }
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

  var goOK = false;

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

      // var newCameraPos = adjustCartesianCoords(
      //   Cartesian3.fromDegrees(
      //     lon,
      //     lat,
      //     ele * 1000.0, // m
      //     viewer.scene.globe.ellipsoid
      //   ),
      //   isOptimizedPolarTerrain
      // );

      // viewer.scene.camera.flyTo({
      //   destination: newCameraPos,
      //   duration: deltaT,
      // });

      var newCameraPos = Cartesian3.fromDegrees(
        lon,
        lat,
        ele * 1000.0, // m
        viewer.scene.globe.ellipsoid
      );

      cameraFlyToLookDownNorthUp(
        viewer.scene.camera,
        newCameraPos,
        viewer.scene.globe.ellipsoid,
        deltaT
      );
      goOK = true;
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
      goOK = true;
    } else {
      showFormError("Invalid location");
    }
  }

  if (goOK) {
    // reset camera transformation when recentering
    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    } else if (!Matrix4.equals(viewer.camera.transform, Matrix4.IDENTITY)) {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
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

///////////////////////////////////////////////
////////////// TERRAIN MESH CONTROLS //////////
///////////////////////////////////////////////

/**
  add terrain mesh controls
 */
var meshControlsForm;
var meshControlsInput;
var meshControlsError;

export function addMeshControls() {
  "use strict";

  var meshControls = document.createElement("div");
  var meshControlsFormHTML =
    "<form id='mesh-controls-form'> \
              <p id='mesh-controls-error' hidden>Please fill out all fields.</p> \
              <input type='text' id='mesh-controls-input' placeholder='mult,min,max[,th_mult]' required /> \
              <button type='submit'>Set</button> \
      </form>";
  meshControls.innerHTML = meshControlsFormHTML;

  document.getElementById("toolbar").appendChild(meshControls);

  meshControlsForm = document.getElementById("mesh-controls-form");
  meshControlsInput = document.getElementById("mesh-controls-input");
  meshControlsError = document.getElementById("mesh-controls-error");

  const params =
    viewModel._terrainAutoMeshMaxErrorMult < 0
      ? // use default values
        viewModel.terrainMeshAlgorithm === "martini"
        ? [0.1, 0.5, 600, -1]
        : [0.04, 1, 250, -1]
      : // use provided values
        [
          viewModel._terrainAutoMeshMaxErrorMult,
          viewModel._terrainAutoMeshMaxErrorMin,
          viewModel._terrainAutoMeshMaxErrorMax,
          viewModel._terrainAutoMeshMaxErrorThMult,
        ];

  meshControlsInput.value = params.toString();
  // force udpate based on mesh max error
  meshMaxErrorChanged(viewModel.meshMaxErr);

  meshControlsInput.oninvalid = invalidMeshControls;
  meshControlsForm.onsubmit = setTerrainMeshParams;
}

export function refreshMeshControlsParams() {
  if (meshControlsInput) {
    const params =
      viewModel._terrainAutoMeshMaxErrorMult < 0
        ? // nothing set
          (meshControlsInput.value = "")
        : // use provided values
          [
            viewModel._terrainAutoMeshMaxErrorMult,
            viewModel._terrainAutoMeshMaxErrorMin,
            viewModel._terrainAutoMeshMaxErrorMax,
            viewModel._terrainAutoMeshMaxErrorThMult,
          ];

    meshControlsInput.value = params.toString();
  }
}

function invalidMeshControls() {
  meshControlsError.innerHTML = "Must enter value";
  meshControlsError.removeAttribute("hidden");
}

function hideMeshControlsFormError() {
  meshControlsError.setAttribute("hidden", "");
}

function showMeshControlsFormError(msg) {
  meshControlsError.innerHTML = msg;
  meshControlsError.removeAttribute("hidden");
}

function setMeshControlsFormEnabled(yes) {
  if (!meshControlsInput) {
    meshControlsInput = document.getElementById("mesh-controls-input");
  }
  if (meshControlsInput) {
    meshControlsInput.disabled = !yes;
  }
}

export function meshMaxErrorChanged(meshMaxErr) {
  setMeshControlsFormEnabled(meshMaxErr === "auto");
}

function setTerrainMeshParams() {
  hideMeshControlsFormError();

  const value = meshControlsInput.value;
  if (value.includes(",")) {
    // splits string into array off of ',' and converts every item in array to number
    const params = value.split(",").map((x) => +x);
    // check if valid params
    if (
      (params.length === 3 || params.length === 4) &&
      params.every((x) => isFinite(x))
    ) {
      if (params.length === 3) {
        // no mesh_max_error_threshold_multiplier
        params.push(-1);
      }
      const [
        mesh_max_error_multiplier,
        mesh_max_error_min,
        mesh_max_error_max,
        mesh_max_error_th_multiplier,
      ] = params;
      console.log(
        `mesh_max_error_multiplier: ${mesh_max_error_multiplier} mesh_max_error_min: ${mesh_max_error_min} mesh_max_error_max: ${mesh_max_error_max} mesh_max_error_th_multiplier: ${mesh_max_error_th_multiplier}`
      );

      // update terrain
      updateTerrainMeshMaxErrorParams(
        mesh_max_error_multiplier,
        mesh_max_error_min,
        mesh_max_error_max,
        mesh_max_error_th_multiplier
      );
    } else {
      showMeshControlsFormError("Invalid terrain mesh params");
    }
  } else {
    showMeshControlsFormError("Invalid terrain mesh params");
  }

  return false;
}

//////////////////////////////////////////////
////////////// BASE LAYER PICKER /////////////
//////////////////////////////////////////////

export function initializeBaseLayerPicker() {
  initializeImageryPicker();
  initializeTerrainPicker();
}
