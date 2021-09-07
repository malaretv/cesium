import { JulianDate, Cartesian3, Matrix4 } from "../../Source/Cesium.js";

import { viewer, locationsInfo, setLocation, setTimes } from "./LIS.js";

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
// SHOW/HIDE CONTROLS BUTTON
//////////////////////////////////////////////

var controlVisibilityButtonSrc = "./images/gearwheel_white_16x16.png";
var controlVisibilityButtonSelectedSrc = "./images/gearwheel_16x16.png";

var controlVisibilityButton;
export function addControlsVisibilityButton() {
  "use strict";

  var controlVisibilityButtonDiv = document.createElement("div");
  controlVisibilityButton = document.createElement("input");
  controlVisibilityButton.src = controlVisibilityButtonSrc;
  controlVisibilityButton.type = "image";
  controlVisibilityButton.className = "toolbar-button";
  controlVisibilityButton.title = "Show/Hide Controls";
  controlVisibilityButtonDiv.appendChild(controlVisibilityButton);
  var toolbar = document.getElementById("toolbar");
  var toolbarParent = toolbar.parentElement;
  toolbarParent.insertBefore(controlVisibilityButtonDiv, toolbar);

  controlVisibilityButton.onclick = controlVisibilityButtonClicked;
}

function controlVisibilityButtonClicked() {
  var toolbar = document.getElementById("toolbar");
  var checked = toolbar.style.display === "none";
  setControlVisibilityButtonChecked(checked);
}

export function setControlVisibilityButtonChecked(checked) {
  if (checked) {
    // select
    controlVisibilityButton.style.backgroundColor = buttonBgSelectedColor;
    controlVisibilityButton.src = controlVisibilityButtonSelectedSrc;
  } else {
    // unselect
    controlVisibilityButton.style.backgroundColor = buttonBgColor;
    controlVisibilityButton.src = controlVisibilityButtonSrc;
  }
  setControlsPanelVisible(checked);
}

function setControlsPanelVisible(checked) {
  var toolbar = document.getElementById("toolbar");
  if (toolbar.style.display === "none") {
    toolbar.style.display = "block";
  } else {
    toolbar.style.display = "none";
  }
}

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

  recenterButton = document.createElement("input");
  recenterButton.src = recenterButtonSrc;
  recenterButton.type = "image";
  recenterButton.title = "Show/Hide Go-To Controls";
  recenterButton.className = "toolbar-button";
  document.getElementById("toolbar-buttons").appendChild(recenterButton);

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

  document.getElementById("toolbar-buttons-ctrls").appendChild(goto);

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
  if (checked) {
    // only on button at a time can be checked
    untoggleToolbarButtons();
  }
  setRecenterButtonChecked(checked);
}

function untoggleToolbarButtons() {
  setRecenterButtonChecked(false);
  setTimeButtonChecked(false);
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
var startTimeInput;
var stopTimeInput;
var currentTimeInput;
var timeError;

export function addTimeButton() {
  "use strict";

  timeButton = document.createElement("input");
  timeButton.src = timeButtonSrc;
  timeButton.type = "image";
  timeButton.title = "Show/Hide Time Controls";
  timeButton.className = "toolbar-button";
  var toolbarButtonsDiv = document.getElementById("toolbar-buttons");
  toolbarButtonsDiv.appendChild(timeButton);

  timeButton.onclick = timeButtonClicked;

  var time = document.createElement("div");
  var timeformHTML =
    "<form id='time-form' hidden> \
            <p id='time-error' hidden>Please fill out all fields.</p> \
            <label>Start Time: </label><input type='text' id='start-time-input' placeholder='Start Time (ISO 8601))' required /><br> \
            <label>Stop Time: </label><input type='text' id='stop-time-input' placeholder='Stop Time (ISO 8601) - opt'/><br> \
            <label>Current Time: </label><input type='text' id='current-time-input' placeholder='Current Time (ISO 8601) - opt' /><br> \
            <button type='submit'>Go</button> \
    </form>";
  time.innerHTML = timeformHTML;

  document.getElementById("toolbar-buttons-ctrls").appendChild(time);

  timeForm = document.getElementById("time-form");
  startTimeInput = document.getElementById("start-time-input");
  stopTimeInput = document.getElementById("stop-time-input");
  currentTimeInput = document.getElementById("current-time-input");
  var is_chrome = navigator.userAgent.indexOf("Chrome") > -1;
  var is_safari = navigator.userAgent.indexOf("Safari") > -1;
  if (is_chrome && is_safari) {
    is_safari = false;
  }
  if (!is_safari) {
    // not Safari.
    // Does not work on Safari.
    startTimeInput.className = "cesium-button";
    stopTimeInput.className = "cesium-button";
    currentTimeInput.className = "cesium-button";
  }
  timeError = document.getElementById("time-error");

  startTimeInput.oninvalid = invalid;
  timeForm.onsubmit = submitTime;
}

function hideTimeFormError() {
  timeError.setAttribute("hidden", "");
}

function showTimeFormError(msg) {
  timeError.innerHTML = msg;
  timeError.removeAttribute("hidden");
}

function stringToJulianDate(date) {
  try {
    let julDate = JulianDate.fromIso8601(date);
    return [true, julDate];
  } catch (error) {
    console.log(error.message);
    return [false, undefined];
  }
}

function submitTime(event) {
  hideTimeFormError();

  let startTimeS = startTimeInput.value;
  let stopTimeS = stopTimeInput.value;
  let currentTimeS = currentTimeInput.value;
  let startTime, stopTime, currentTime;

  let res;
  if (startTimeS) {
    [res, startTime] = stringToJulianDate(startTimeS);
    if (!res) {
      showTimeFormError(
        "Invalid Start Time format.<br>Please use ISO 8601 format YYYY-MM-DDTHH:MM:SSZ"
      );
      return false;
    }
  }
  if (stopTimeS) {
    [res, stopTime] = stringToJulianDate(stopTimeS);
    if (!res) {
      showTimeFormError(
        "Invalid Stop Time format.<br>Please use ISO 8601 format YYYY-MM-DDTHH:MM:SSZ"
      );
      return false;
    }
  }
  if (currentTimeS) {
    [res, currentTime] = stringToJulianDate(currentTimeS);
    if (!res) {
      showTimeFormError(
        "Invalid Current Time format.<br>Please use ISO 8601 format YYYY-MM-DDTHH:MM:SSZ"
      );
      return false;
    }
  }

  if (!startTime && !currentTime) {
    showTimeFormError("Please insert valid Start time or Current Time");
    return false;
  }

  if (currentTime && !startTime) {
    startTime = currentTime;
    startTimeS = currentTimeS;
  } else if (startTime && !currentTime) {
    currentTime = startTime;
    currentTimeS = startTimeS;
  }

  if (!stopTime) {
    stopTime = JulianDate.addDays(startTime, 29, new JulianDate());
    stopTimeS = stopTime.toString(stopTime);
  }

  // check
  // startTime < stopTime
  if (JulianDate.compare(startTime, stopTime) >= 0) {
    showTimeFormError("Stop time must be greater than start time");
    return false;
  }

  // check
  // current time >= start time
  // current time <= end time
  if (JulianDate.compare(currentTime, startTime) < 0) {
    showTimeFormError("Current time must be greater than start time");
    return false;
  }

  if (JulianDate.compare(currentTime, stopTime) > 0) {
    showTimeFormError("Current time must be lower than end time");
    return false;
  }

  // initialize missing fields
  if (!stopTimeInput.value) {
    stopTimeInput.value = stopTimeS;
  }
  if (!startTimeInput.value) {
    startTimeInput.value = startTimeS;
  }
  if (!currentTimeInput.value) {
    currentTimeInput.value = currentTimeS;
  }

  // update time
  setTimes(startTime, stopTime, currentTime);

  // For this example, don't actually submit the form
  event.preventDefault();
}

function setTimeButtonChecked(checked) {
  if (checked) {
    // select
    timeButton.style.backgroundColor = buttonBgSelectedColor;
    timeButton.src = timeButtonSelectedSrc;
  } else {
    // unselect
    timeButton.style.backgroundColor = buttonBgColor;
    timeButton.src = timeButtonSrc;
  }
  setTimeFormVisible(checked);
}

function timeButtonClicked() {
  var checked = timeForm.hasAttribute("hidden");
  if (checked) {
    // only on button at a time can be checked
    untoggleToolbarButtons();
  }
  setTimeButtonChecked(checked);
}

function setTimeFormVisible(yes) {
  if (yes) {
    timeForm.removeAttribute("hidden");
  } else {
    timeForm.setAttribute("hidden", "");
    hideTimeFormError();
    // clear input string
    startTimeInput.value = JulianDate.fromIso8601(viewModel.startUTCTime);
    stopTimeInput.value = JulianDate.fromIso8601(viewModel.stopUTCTime);
    currentTimeInput.value = JulianDate.fromIso8601(viewModel.UTCTime);
  }
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
              <label>Auto Mesh Max Error Params: </label><input type='text' id='mesh-controls-input' placeholder='mult,min,max[,th_mult]' required /> \
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

//////////////////////////////////////////////
export function setMapLoadingIconVisible(yes) {
  if (yes) {
    document.getElementById("map-loading").style.display = "inline-block";
  } else {
    document.getElementById("map-loading").style.display = "none";
  }
}
