import { Cartesian3 } from "../../Source/Cesium.js";
import { JulianDate } from "../../Source/Cesium.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

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
  _terrainProviderName: undefined,
  _terrainMeshMaxError: 1.0,

  // contour
  _contourEnabled: false,

  // atm simu
  _atmSimuEnabled: false,

  // shadows
  _shadowsMaxDistance: 100000.0, // m
  _skirtsEnabled: true,
  _shadowsFading: true,
  _terrainShadowsEnabled: true,

  // selected location
  _selectedLocationName: undefined,

  // layers
  _hiresDemRegionsEnabled: false,
  _WACMosaicNSEnabled: false,
  _sunVisibility60Enabled: false,

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

  // terrainProviderName
  get terrainProviderName() {
    return this._terrainProviderName;
  },

  set terrainProviderName(value) {
    this._terrainProviderName = value;
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

  // contour enabled
  get contourEnabled() {
    return this._contourEnabled;
  },

  set contourEnabled(checked) {
    this._contourEnabled = checked;
    saveStateToQueryString();
  },

  // atm simu enabled
  get atmSimuEnabled() {
    return this._atmSimuEnabled;
  },

  set atmSimuEnabled(checked) {
    this._atmSimuEnabled = checked;
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

  // shadows skirts enabled
  get skirtsEnabled() {
    return this._skirtsEnabled;
  },

  set skirtsEnabled(checked) {
    this._skirtsEnabled = checked;
    saveStateToQueryString();
  },

  // terrain shadows enabled
  get terrainShadowsEnabled() {
    return this._terrainShadowsEnabled;
  },

  set terrainShadowsEnabled(checked) {
    this._terrainShadowsEnabled = checked;
    saveStateToQueryString();
  },

  // shadows fading enabled
  get shadowsFadingEnabled() {
    return this._shadowsFading;
  },

  set shadowsFadingEnabled(checked) {
    this._shadowsFading = checked;
    saveStateToQueryString();
  },

  // selected location name
  get selectedLocationName() {
    return this._selectedLocationName;
  },

  set selectedLocationName(value) {
    this._selectedLocationName = value;
    saveStateToQueryString();
  },

  // hires DEM Regions enabled
  get hiresDemRegionsEnabled() {
    return this._hiresDemRegionsEnabled;
  },

  set hiresDemRegionsEnabled(checked) {
    this._hiresDemRegionsEnabled = checked;
    saveStateToQueryString();
  },

  // WAC Mosaic (No Shadows) enabled
  get WACMosaicNSEnabled() {
    return this._WACMosaicNSEnabled;
  },

  set WACMosaicNSEnabled(checked) {
    this._WACMosaicNSEnabled = checked;
    saveStateToQueryString();
  },

  // Sun Visibility 60m enabled
  get sunVisibility60Enabled() {
    return this._sunVisibility60Enabled;
  },

  set sunVisibility60Enabled(checked) {
    this._sunVisibility60Enabled = checked;
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
  // console.log("updating state url...");
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
  var terrainProviderName = viewModel.terrainProviderName;

  // terrain mesh max error
  var terrainMeshMaxError = viewModel.terrainMeshMaxError;

  // contour enabled
  var contourEnabled = viewModel.contourEnabled;

  // atm simu enabled
  // var atmSimuEnabled = viewModel.atmSimuEnabled;

  // shadows max distance
  var shadowsMaxDistance = viewModel.shadowsMaxDistance;

  // selected location name
  var selectedLocationName = viewModel.selectedLocationName;

  // skirts enabled
  var skirtsEnabled = viewModel.skirtsEnabled;

  // terrain shadows enabled
  var terrainShadowsEnabled = viewModel.terrainShadowsEnabled;

  // shadows fading enabled
  var shadowsFadingEnabled = viewModel.shadowsFadingEnabled;

  // layers
  var hiresDemRegionsEnabled = viewModel.hiresDemRegionsEnabled;
  var WACMosaicNSEnabled = viewModel.WACMosaicNSEnabled;
  var sunVisibility60Enabled = viewModel.sunVisibility60Enabled;

  var urlParams = {
    camera_position,
    camera_direction,
    camera_up,
    UTCtime,
    lightSourceIdx,
    terrainProviderName,
    terrainMeshMaxError,
    contourEnabled,
    //    atmSimuEnabled,
    shadowsMaxDistance,
    selectedLocationName,
    skirtsEnabled,
    terrainShadowsEnabled,
    shadowsFadingEnabled,
    hiresDemRegionsEnabled,
    WACMosaicNSEnabled,
    sunVisibility60Enabled,
  };

  // update url
  updateUrlParams(urlParams);
}
