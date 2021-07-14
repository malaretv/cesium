import { Cartesian3 } from "../../Source/Cesium.js";

import { viewer, locationsInfo, setLocation } from "./LIS.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

import {
  initializeTerrainPicker,
  isOptimizedPolarTerrain,
} from "./terrainProvider.js";

import { initializeImageryPicker } from "./imageryProvider.js";

import { cameraFlyToLookDownNorthUp } from "./utils.js";

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

export function initializeBaseLayerPicker() {
  initializeImageryPicker();
  initializeTerrainPicker();
}
