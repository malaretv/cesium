import {
  JulianDate,
  Cartesian3,
  Matrix4,
  viewerCesiumInspectorMixin,
} from "../../Source/Cesium.js";

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

export function initializeUI() {
  if (window.LIS_MODE === "development") {
    addMeshControls();
  }

  // add button for showing/hiding controls
  addControlsVisibilityButton();
  // hide controls
  setControlVisibilityButtonChecked(false);

  // add go to button
  addGoToButton();
  // add set time button
  addTimeButton();
  // add tutorial button
  addTutorialButton();

  initializeBaseLayerPicker();

  if (window.LIS_MODE === "development") {
    viewer.extend(viewerCesiumInspectorMixin);
  }

  document.getElementById("toolbarWrapper").style.width = "50%";

  addStatusBar();
}

//////////////////////////////////////////////
// SHOW/HIDE CONTROLS BUTTON
//////////////////////////////////////////////

var controlVisibilityButtonSrc = "./images/gearwheel_white_16x16.png";
var controlVisibilityButtonSelectedSrc = "./images/gearwheel_16x16.png";

var controlVisibilityButton;
function addControlsVisibilityButton() {
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

function setControlVisibilityButtonChecked(checked) {
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

function addGoToButton() {
  "use strict";

  recenterButton = document.createElement("input");
  recenterButton.src = recenterButtonSrc;
  recenterButton.type = "image";
  recenterButton.title = "Show/Hide Go-To Controls";
  recenterButton.className = "toolbar-button";
  document.getElementById("toolbar-buttons-ctrls").appendChild(recenterButton);

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

var timePickerButtonSrc = "./images/Calendar-Time-32x32_white.png";
var timePickerButtonSelectedSrc = "./images/Calendar-Time-32x32.png";

/**
    add Time tool
 */
var timeButton;
var timeForm;
var startTimeInput;
var stopTimeInput;
var currentTimeInput;
var timeInputsArray;
var timeError;
var startTimePickerButton;
var stopTimePickerButton;
var currTimePickerButton;
var timePickerButtonsArray;
var startTimePicker;
var stopTimePicker;
var currTimePicker;
var timePickersArray;

function addTimeButton() {
  "use strict";

  timeButton = document.createElement("input");
  timeButton.src = timeButtonSrc;
  timeButton.type = "image";
  timeButton.title = "Show/Hide Time Controls";
  timeButton.className = "toolbar-button";
  var toolbarButtonsDiv = document.getElementById("toolbar-buttons-ctrls");
  toolbarButtonsDiv.appendChild(timeButton);

  timeButton.onclick = timeButtonClicked;

  var time = document.createElement("div");
  var timeformHTML =
    "<form id='time-form' onsubmit='return false' hidden> \
            <p id='time-error' hidden>Please fill out all fields.</p> \
            <label>Start Time: </label><input type='text' id='start-time-input' placeholder='Start Time (ISO 8601))' required /> \
            <input type='image' id='start-time-picker-button' src='" +
    timePickerButtonSrc +
    "' title='Date Picker' class='time-picker-button'/><br> \
            <label>Stop Time: </label><input type='text' id='stop-time-input' placeholder='Stop Time (ISO 8601) - opt'/> \
            <input type='image' id='stop-time-picker-button' src='" +
    timePickerButtonSrc +
    "' title='Date Picker' class='time-picker-button'/><br> \
            <label>Current Time: </label><input type='text' id='current-time-input' placeholder='Current Time (ISO 8601) - opt' /> \
            <input type='image' id='curr-time-picker-button' src='" +
    timePickerButtonSrc +
    "' title='Date Picker' class='time-picker-button'/><br> \
            <button type='submit' id='submit-time' name='submit-time'>Go</button> \
    </form>";
  time.innerHTML = timeformHTML;

  document.getElementById("toolbar-buttons-ctrls").appendChild(time);

  timeForm = document.getElementById("time-form");
  startTimeInput = document.getElementById("start-time-input");
  stopTimeInput = document.getElementById("stop-time-input");
  currentTimeInput = document.getElementById("current-time-input");
  timeInputsArray = [startTimeInput, stopTimeInput, currentTimeInput];
  var is_chrome = navigator.userAgent.indexOf("Chrome") > -1;
  var is_safari = navigator.userAgent.indexOf("Safari") > -1;
  if (is_chrome && is_safari) {
    is_safari = false;
  }
  if (!is_safari) {
    // not Safari.
    // Does not work on Safari.
    for (let i = 0; i < timeInputsArray.length; i++) {
      timeInputsArray[i].className = "cesium-button";
    }
  }
  timeError = document.getElementById("time-error");

  startTimePickerButton = document.getElementById("start-time-picker-button");
  stopTimePickerButton = document.getElementById("stop-time-picker-button");
  currTimePickerButton = document.getElementById("curr-time-picker-button");
  startTimePickerButton.onclick = startTimePickerButtonClicked;
  stopTimePickerButton.onclick = stopTimePickerButtonClicked;
  currTimePickerButton.onclick = currTimePickerButtonClicked;
  timePickerButtonsArray = [
    startTimePickerButton,
    stopTimePickerButton,
    currTimePickerButton,
  ];
  for (let i = 0; i < timePickerButtonsArray.length; i++) {
    timePickerButtonsArray[i].setAttribute("checked", false);

    // set name for opening date-time picker
    timePickerButtonsArray[i].name = "dateTimePicker" + i;
  }

  startTimeInput.oninvalid = invalid;
  // timeForm.onsubmit = submitTime;
  document.getElementById("submit-time").onclick = submitTime;

  timePickersArray = [startTimePicker, stopTimePicker, currTimePicker];
  for (let i = 0; i < timePickersArray.length; i++) {
    timePickersArray[i] = new dtsel.DTS(
      'input[name="dateTimePicker' + i + '"]',
      {
        showTime: true,
        dateFormat: "yyyy-mm-dd",
        timeFormat: "HH:MM:SS",
      }
    );

    timePickerButtonsArray[i].addEventListener(
      "pickerDateTimeChanged",
      function (e) {
        timeInputsArray[i].value = pickerTimeValueToISO(
          timePickerButtonsArray[i].value
        );
      }
    );
    timePickerButtonsArray[i].addEventListener("pickerClosed", function (e) {
      if (timePickerButtonToggled(timePickerButtonsArray[i])) {
        setTimePickerVisible(timePickerButtonsArray[i], false);
      }
    });
  }
}

function pickerTimeValueToISO(dateString) {
  return dateString.replace(", ", "T") + "Z";
}

function hideTimeFormError() {
  timeError.setAttribute("hidden", "");
}

function startTimePickerButtonClicked() {
  timePickerButtonClicked(startTimePickerButton);
}

function stopTimePickerButtonClicked() {
  timePickerButtonClicked(stopTimePickerButton);
}

function currTimePickerButtonClicked() {
  timePickerButtonClicked(currTimePickerButton);
}

function untoggleTimePickerButtons() {
  for (var i = 0; i < timePickerButtonsArray.length; i++) {
    if (timePickerButtonToggled(timePickerButtonsArray[i])) {
      setTimePickerVisible(timePickerButtonsArray[i], false);
    }
  }
}

function setTimePickerVisible(timePickerButton, yes) {
  if (yes) {
    // select
    timePickerButton.style.backgroundColor = buttonBgSelectedColor;
    timePickerButton.src = timePickerButtonSelectedSrc;
  } else {
    // unselect
    timePickerButton.style.backgroundColor = buttonBgColor;
    timePickerButton.src = timePickerButtonSrc;
  }
  timePickerButton.setAttribute("checked", yes);
  // setTimeFormVisible(checked);
}

function timePickerButtonToggled(timePickerButton) {
  var checkedAttribute = timePickerButton.getAttribute("checked");
  return checkedAttribute === "true";
}

function timePickerButtonClicked(timePickerButton) {
  var checked = !timePickerButtonToggled(timePickerButton);
  if (checked) {
    // only on button at a time can be checked
    untoggleTimePickerButtons();

    let btnIdx = timePickerButtonsArray.indexOf(timePickerButton);
    timePickerButton.value = timeInputsArray[btnIdx].value
      .replace("T", ", ")
      .replace("Z", "");
  }

  // show/hide picker
  setTimePickerVisible(timePickerButton, checked);
}

function showTimeFormError(msg) {
  timeError.innerHTML = msg;
  timeError.removeAttribute("hidden");
}

function fixISOMissingT(dateString) {
  // Looks for strings that match ISO8601 but have whitespace instead of a T
  if (
    dateString.match(
      /(\d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d\.\d+)|(\d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d)|(\d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d)/
    )
  ) {
    return dateString.replace(" ", "T");
  }
  return dateString;
}

function fixISOMissingTimeZone(dateString) {
  if (dateString.endsWith("Z")) {
    return dateString;
  }

  // check whether the string has time zone information
  // Note: time zone patter ±[hh]:[mm], ±[hh][mm] o ±[hh]
  let re = /[+-][0-2]\d(?:\:?[0-5]\d)?$/;
  if (dateString.match(re)) {
    // found time zone substring
    // console.log("time zone " + dateString.match(re));
    return dateString;
  }
  // no time zone
  // force UTC
  return dateString + "Z";
}

function fixTimeISOString(dateString) {
  // remove whitespace on either end
  dateString = dateString.trim();
  // if ISO8601 format and using space instead of T fix it
  dateString = fixISOMissingT(dateString);
  // if ISO8601 and not time zone is specified then force Z param for UTC
  dateString = fixISOMissingTimeZone(dateString);
  return dateString;
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

function submitTime() {
  hideTimeFormError();

  let startTimeS = startTimeInput.value;
  let stopTimeS = stopTimeInput.value;
  let currentTimeS = currentTimeInput.value;
  let startTime, stopTime, currentTime;

  let res;
  if (startTimeS) {
    startTimeS = fixTimeISOString(startTimeS);
    [res, startTime] = stringToJulianDate(startTimeS);
    if (!res) {
      showTimeFormError(
        "Invalid Start Time format.<br>Please use ISO 8601 format YYYY-MM-DDTHH:MM:SSZ"
      );
      return false;
    }
  }
  if (stopTimeS) {
    stopTimeS = fixTimeISOString(stopTimeS);
    [res, stopTime] = stringToJulianDate(stopTimeS);
    if (!res) {
      showTimeFormError(
        "Invalid Stop Time format.<br>Please use ISO 8601 format YYYY-MM-DDTHH:MM:SSZ"
      );
      return false;
    }
  }
  if (currentTimeS) {
    currentTimeS = fixTimeISOString(currentTimeS);
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

  // update fields strings

  // initialize missing fields
  if (!stopTimeInput.value || stopTimeInput.value !== stopTimeS) {
    stopTimeInput.value = stopTimeS;
  }
  if (!startTimeInput.value || startTimeInput.value !== startTimeS) {
    startTimeInput.value = startTimeS;
  }
  if (!currentTimeInput.value || currentTimeInput.value !== currentTimeS) {
    currentTimeInput.value = currentTimeS;
  }

  // update time
  setTimes(startTime, stopTime, currentTime);
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
/////////////// TUTORIAL BUTTON ///////////////
///////////////////////////////////////////////

var tutorialButtonSrc = "./images/manual_white_16x16.png";

function addTutorialButton() {
  "use strict";

  var tutorialButton = document.createElement("input");
  tutorialButton.src = tutorialButtonSrc;
  tutorialButton.type = "image";
  tutorialButton.title = "Open tutorial page";
  tutorialButton.className = "toolbar-button";
  var toolbarButtonsDiv = document.getElementById("toolbar-buttons-ctrls");
  toolbarButtonsDiv.appendChild(tutorialButton);

  tutorialButton.onclick = tutorialButtonClicked;
}

function tutorialButtonClicked() {
  let tutorial_url =
    "https://docs.google.com/document/d/1-rHFrKKnIDlUEakjfWYyHsDHWZwVfHGKwOkRK9Yd6Y8/edit#bookmark=id.43le16fer84h";
  window.open(tutorial_url);
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

function addMeshControls() {
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

function initializeBaseLayerPicker() {
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

var statusBarLblCamera;
var statusBarLblLongitude;
var statusBarLblLatitude;
var statusBarLblPosition;
var statusBarLblHeight;
var statusBarLBLObs2PosDist;
var detailInfoShowButton;
var detailInfoHideButton;
var datailsStatusBar;
var statusBarWrapper;

var detailInfoShowButtonSrc = "./images/up_24x24.png";
var detailInfoHideButtonSrc = "./images/down_24x24.png";
var disclaimerDialogShowButtonSrc = "./images/info_16x16.png";

const statusBarWrapperCornerRadius = "4px";

// Status Bar
function addStatusBar() {
  var bottomContainer = viewer.bottomContainer;
  bottomContainer.style.width = "100%";

  // detail info show button
  var detailInfoHideButtonDiv = document.createElement("div");
  detailInfoHideButtonDiv.className = "statusbar-hide-info-button-div";
  detailInfoHideButton = document.createElement("input");
  detailInfoHideButton.src = detailInfoHideButtonSrc;
  detailInfoHideButton.type = "image";
  detailInfoHideButton.className = "statusbar-hide-info-button";
  detailInfoHideButton.title = "Hide Detail Info";
  detailInfoHideButtonDiv.appendChild(detailInfoHideButton);
  // hide by default
  detailInfoHideButton.style.display = "none";
  bottomContainer.appendChild(detailInfoHideButtonDiv);
  detailInfoHideButton.onclick = detailInfoHideButtonClicked;

  statusBarWrapper = document.createElement("div");
  statusBarWrapper.className = "statusbar-wrapper";
  statusBarWrapper.style.borderRadius = statusBarWrapperCornerRadius;
  bottomContainer.appendChild(statusBarWrapper);

  // status bar main div
  datailsStatusBar = document.createElement("div");
  datailsStatusBar.className = "statusbar-detail";
  // hide by default
  datailsStatusBar.style.display = "none";
  statusBarWrapper.appendChild(datailsStatusBar);
  var statusBar = document.createElement("div");
  statusBar.className = "statusbar";
  statusBarWrapper.appendChild(statusBar);

  // detail info show button
  detailInfoShowButton = document.createElement("input");
  detailInfoShowButton.src = detailInfoShowButtonSrc;
  detailInfoShowButton.type = "image";
  detailInfoShowButton.className = "statusbar-button";
  detailInfoShowButton.title = "More Info";
  statusBar.appendChild(detailInfoShowButton);
  detailInfoShowButton.onclick = detailInfoShowButtonClicked;

  // camera info
  statusBarLblCamera = document.createElement("div");
  statusBarLblCamera.id = "lbl-camera";
  statusBarLblCamera.title = "Elevation of the camera above average radius";
  statusBar.appendChild(statusBarLblCamera);
  statusBarLblCamera.innerHTML = "Camera: ";

  // position info
  statusBarLblPosition = document.createElement("div");
  // lon label
  var lonLbl = statusBarLblPosition.appendChild(document.createElement("div"));
  lonLbl.innerHTML = "Lon:";
  // lon
  statusBarLblLongitude = document.createElement("div");
  statusBarLblLongitude.className = "min-w-[4em] text-right";
  statusBarLblLongitude.id = "lbl-lon";
  statusBarLblPosition.appendChild(statusBarLblLongitude);
  // lat label
  var latLbl = statusBarLblPosition.appendChild(document.createElement("div"));
  latLbl.innerHTML = "Lat:";
  // lat
  statusBarLblLatitude = document.createElement("div");
  statusBarLblLatitude.className = "min-w-[4em] text-right";
  statusBarLblLatitude.id = "lbl-lat";
  statusBarLblPosition.appendChild(statusBarLblLatitude);
  // height label
  var heightLbl = statusBarLblPosition.appendChild(
    document.createElement("div")
  );
  heightLbl.innerHTML = "H:";
  // height
  statusBarLblHeight = document.createElement("div");
  statusBarLblHeight.className = "min-w-[4em] text-right";
  statusBarLblHeight.title = "Ground point elevation above average radius";
  statusBarLblHeight.id = "lbl-height";
  statusBarLblPosition.appendChild(statusBarLblHeight);

  statusBarLblPosition.title = "Ground point coordinates at cursor position";
  statusBar.appendChild(statusBarLblPosition);

  // observer to cursor distance
  statusBarLBLObs2PosDist = document.createElement("div");
  statusBarLBLObs2PosDist.id = "lbl-obs2pos-dist";
  statusBarLBLObs2PosDist.title =
    "Distance from observer position to cursor ground point";
  statusBar.appendChild(statusBarLBLObs2PosDist);
  statusBarLBLObs2PosDist.innerHTML = "Distance to Ground: ";

  // accuracy disclaimer
  addDisclaimerDialogButton(statusBar);
}

const disclaimerDialogMessage =
  "QTS 3D is a 3D engine for inspecting terrain topography and illumination. Both terrain and shadows are simulated. It provides many control options to speed up results, at the expense of accuracy in the resulting view.<br><br> \
For proper usage see manual.";

function addDisclaimerDialogButton(statusBar) {
  var button = document.createElement("input");
  button.src = disclaimerDialogShowButtonSrc;
  button.type = "image";
  button.className = "statusbar-button";
  button.title = "Accuracy";
  button.setAttribute("aria-describedby", "disclaimer-dialog");
  statusBar.appendChild(button);

  var disclaimerDialog = document.createElement("div");
  disclaimerDialog.innerHTML =
    disclaimerDialogMessage +
    " <div id='disclaimer-dialog-arrow' data-popper-arrow></div>";
  disclaimerDialog.id = "disclaimer-dialog";
  disclaimerDialog.role = "disclaimer-dialog";
  statusBar.appendChild(disclaimerDialog);

  var disclaimerDialogPopperInstance = Popper.createPopper(
    button,
    disclaimerDialog,
    {
      placement: "top",
      modifiers: [
        {
          name: "offset",
          options: {
            offset: [0, 15],
          },
        },
      ],
      strategy: "fixed",
    }
  );

  function show() {
    disclaimerDialog.setAttribute("data-show", "");

    // We need to tell Popper to update the tooltip position
    // after we show the tooltip, otherwise it will be incorrect
    disclaimerDialogPopperInstance.update();
  }

  function hide() {
    disclaimerDialog.removeAttribute("data-show");
  }

  // const disclaimerDialogAShowEvents = ['click'];
  const disclaimerDialogHideEvents = ["blur"];

  // disclaimerDialogAShowEvents.forEach((event) => {
  //   button.addEventListener(event, show);
  // });

  disclaimerDialogHideEvents.forEach((event) => {
    button.addEventListener(event, hide);
  });

  button.onclick = disclaimerButtonClicked;

  function disclaimerButtonClicked() {
    if (disclaimerDialog.hasAttribute("data-show")) {
      hide();
    } else {
      show();
    }
  }

  return button;
}

export function addStatusBarDetailInfo(label) {
  var elem = document.createElement("div");
  datailsStatusBar.appendChild(elem);
  return elem;
}

export function setStatusBarCameraHeight(value) {
  statusBarLblCamera.innerHTML = `Camera: ${value.toFixed(1)} km`;
}

export function setStatusBarCursorPosition(lon, lat, height) {
  statusBarLblLongitude.innerHTML = lon.toFixed(3);
  statusBarLblLatitude.innerHTML = lat.toFixed(3);

  statusBarLblHeight.innerHTML = `${(height * 0.001).toFixed(1)} km`;
}

export function setStatusBarObs2CursorDist(value) {
  var c2cDistanceS;
  if (value < 1000.0) {
    c2cDistanceS = value.toFixed(3) + " m";
  } else {
    c2cDistanceS = (value / 1000.0).toFixed(3) + " km";
  }
  statusBarLBLObs2PosDist.innerHTML = `Distance to Ground: ${c2cDistanceS}`;
}

//////////////////////////////////////////////
// DETAIL INFO BUTTON
//////////////////////////////////////////////

function detailInfoShowButtonClicked() {
  setStatusDetailInfoVisible(true);
}

function detailInfoHideButtonClicked() {
  setStatusDetailInfoVisible(false);
}

function getStatusDetailInfoHeight() {
  datailsStatusBar.style.display = "block"; // Make it visible
  var height = datailsStatusBar.scrollHeight + "px"; // Get it's height
  datailsStatusBar.style.display = ""; //  Hide it again
  return height;
}

function setStatusDetailInfoVisible(checked) {
  if (checked) {
    // remove corner radius for better detailInfoHideButton edges matching
    statusBarWrapper.style.borderTopLeftRadius = "0px";
    var height = getStatusDetailInfoHeight();
    datailsStatusBar.classList.add("is-visible");
    datailsStatusBar.style.height = height;

    // Once the transition is complete, remove the inline max-height so the content can scale responsively
    window.setTimeout(function () {
      datailsStatusBar.style.height = "";
    }, 350);

    detailInfoHideButton.style.display = "block";
    detailInfoShowButton.style.display = "none";
    // more camera info in detail info label
    statusBarLblCamera.style.display = "none";
  } else {
    datailsStatusBar.style.height = datailsStatusBar.scrollHeight + "px";
    // Set the height back to 0
    window.setTimeout(function () {
      datailsStatusBar.style.height = "0";
    }, 1);

    // When the transition is complete, hide it
    window.setTimeout(function () {
      datailsStatusBar.classList.remove("is-visible");
    }, 350);

    // restore border radius
    statusBarWrapper.style.borderTopLeftRadius = statusBarWrapperCornerRadius;
    detailInfoHideButton.style.display = "none";
    detailInfoShowButton.style.display = "";
    statusBarLblCamera.style.display = "";
  }
}
