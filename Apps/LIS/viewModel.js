import { Cartesian3 } from "../../Source/Cesium.js";
import { JulianDate } from "../../Source/Cesium.js";

import { isOptimizedPolarTerrain } from "./LIS.js";

import { invAdjustCartesianCoords } from "./adjustCartesian.js";

import { updateUrlParams } from "./utils.js";

// The viewModel tracks the state of the application.
// Decouple the state from the interface specific vars.
// Each setter calls the status updated fuction that updates the state url
export var viewModel = {
  // camera position and orientation
  _camera_position: new Cartesian3(),
  _camera_direction: new Cartesian3(),
  _camera_up: new Cartesian3(),
  _UTCtime: "",
  _lightSourceIdx: -1,

  // terrain
  _terrainProviderIdx: -1,
  _terrainMeshMaxError: 1.0,
  _terrainShadowsEnabled: true,

  // shadows
  _shadowsMaxDistance: 100000.0, // m

  /**
   * true if the state info have been fully loaded
   */
  viewModelLoadFinished: false,

  // camera_position
  get camera_position() {
    return this._camera_position;
  },

  set camera_position(value) {
    this._camera_position = value;
    saveStateToQueryString();
  },

  // camera_direction
  get camera_direction() {
    return this._camera_direction;
  },

  set camera_direction(value) {
    this._camera_direction = value;
    saveStateToQueryString();
  },

  // camera_up
  get camera_up() {
    return this._camera_up;
  },

  set camera_up(value) {
    this._camera_up = value;
    saveStateToQueryString();
  },

  // UTCtime
  get UTCtime() {
    return this._UTCtime;
  },

  set UTCtime(value) {
    this._UTCtime = JulianDate.toIso8601(value, 3);
    maybeUpdateStateUrl();
  },

  // lightSourceIdx
  get lightSourceIdx() {
    return this._lightSourceIdx;
  },

  set lightSourceIdx(value) {
    this._lightSourceIdx = value;
    saveStateToQueryString();
  },

  // terrainProviderIdx
  get terrainProviderIdx() {
    return this._terrainProviderIdx;
  },

  set terrainProviderIdx(value) {
    this._terrainProviderIdx = value;
    saveStateToQueryString();
  },

  // terrain mesh max error
  get terrainMeshMaxError() {
    return this._terrainMeshMaxError;
  },

  set terrainMeshMaxError(value) {
    this._terrainMeshMaxError = value;
    saveStateToQueryString();
  },

  // terrainShadowsEnabled
  get terrainShadowsEnabled() {
    return this._terrainShadowsEnabled;
  },

  set terrainShadowsEnabled(value) {
    this._terrainShadowsEnabled = value;
    saveStateToQueryString();
  },

  // shadows Max Distance
  get shadowsMaxDistance() {
    return this._shadowsMaxDistance;
  },

  set shadowsMaxDistance(value) {
    this._shadowsMaxDistance = value;
    saveStateToQueryString();
  },
};

var FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL = 1000; // ms
var updateStateTimerId = -1;
var lastUrlStateUpdateTime = -1;
export function resetStateUpdateTimer() {
  if (updateStateTimerId > 0) {
    // stop timer
    clearInterval(updateStateTimerId);
    updateStateTimerId = -1;
  }
}

// wait FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL since last time update before updating the url
// this is needed in order to avoid to many history.push requests (there is a limit on Safari browser)
export function maybeUpdateStateUrl() {
  if (lastUrlStateUpdateTime !== viewModel.UTCtime) {
    console.log("Updating time... " + viewModel.UTCtime);
    lastUrlStateUpdateTime = viewModel.UTCtime;
    if (updateStateTimerId >= 0) {
      // reset the timer
      resetStateUpdateTimer();
    }

    // let us set the timer
    updateStateTimerId = setInterval(
      saveStateToQueryString,
      FORCE_UPDATE_URL_STATE_TRIGGER_INTERVAL
    );
  }
}

/**
 * Get current base state and saves to querystring
 */
function saveStateToQueryString() {
  console.log("updating state url...");
  if (!viewModel.viewModelLoadFinished) {
    // wait the state has been loaded before updating it
    return;
  }

  resetStateUpdateTimer();

  // store pos and orientation. Note: use regular terrain coords (not accounting for polar view rotation)
  var camera_position = Cartesian3.pack(
    invAdjustCartesianCoords(
      viewModel.camera_position,
      isOptimizedPolarTerrain
    ),
    []
  );
  var camera_direction = Cartesian3.pack(
    invAdjustCartesianCoords(
      viewModel.camera_direction,
      isOptimizedPolarTerrain
    ),
    []
  );
  var camera_up = Cartesian3.pack(
    invAdjustCartesianCoords(viewModel.camera_up, isOptimizedPolarTerrain),
    []
  );
  var UTCtime = JulianDate.fromIso8601(viewModel.UTCtime);

  // illumination
  var lightSourceIdx = viewModel.lightSourceIdx;

  // terrain
  var terrainProviderIdx = viewModel.terrainProviderIdx;

  // terrain mesh max error
  var terrainMeshMaxError = viewModel.terrainMeshMaxError;

  // terrain shadows enabled
  var terrainShadowsEnabled = viewModel.terrainShadowsEnabled;

  // shadows max distance
  var shadowsMaxDistance = viewModel.shadowsMaxDistance;

  // updateUrlParams({position, orientation});
  updateUrlParams({
    camera_position,
    camera_direction,
    camera_up,
    UTCtime,
    lightSourceIdx,
    terrainProviderIdx,
    terrainMeshMaxError,
    terrainShadowsEnabled,
    shadowsMaxDistance,
  });
}
