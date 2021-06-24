import { Cartesian3 } from "../../Source/Cesium.js";

import { viewer } from "./LIS.js";
import { isOptimizedPolarTerrain } from "./LIS.js";

import { adjustCartesianCoords } from "./adjustCartesian.js";

//////////////////////////////////////////////
///////////// GO TO TOOL /////////////////////
//////////////////////////////////////////////

var recenterButtonSrc = "./images/recenter_white_16x16.png";
var recenterButtonSelectedSrc = "./images/recenter_16x16.png";
var recenterButtonBgColor = "rgba(42, 42, 42, 0.7)";
var recenterButtonBgSelectedColor = "rgba(255, 255, 255, 0.7)";

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
  recenterButton.id = "goto-button";
  recenterButton.src = recenterButtonSrc;
  recenterButton.type = "image";
  recenterButton.style.backgroundColor = recenterButtonBgColor;
  recenterButtonDiv.appendChild(recenterButton);
  document.getElementById("toolbar").appendChild(recenterButtonDiv);

  recenterButton.onclick = recenterButtonClicked;

  var goto = document.createElement("div");
  var gotoformHTML =
    "<form id='goto-form' hidden> \
            <p id='goto-error' hidden>Please fill out all fields.</p> \
            <input type='text' id='goto-input' placeholder='lon,lat[,ele (km)]' required /> \
            <button type='submit'>Go</button> \
    </form>";
  goto.innerHTML = gotoformHTML;

  document.getElementById("toolbar").appendChild(goto);

  gotoForm = document.getElementById("goto-form");
  gotoInput = document.getElementById("goto-input");
  gotoError = document.getElementById("goto-error");

  gotoInput.oninvalid = invalid;
  gotoForm.onsubmit = submit;
}

function setRecenterButtonChecked(checked) {
  if (checked) {
    // select
    recenterButton.style.backgroundColor = recenterButtonBgSelectedColor;
    recenterButton.src = recenterButtonSelectedSrc;
  } else {
    // unselect
    recenterButton.style.backgroundColor = recenterButtonBgColor;
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
  // For this example, don't actually submit the form
  event.preventDefault();
}
