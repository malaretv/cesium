import { Cartesian3, defined, Math } from "../../Source/Cesium.js";
import { JulianDate } from "../../Source/Cesium.js";

import Matrix4 from "../../Source/Core/Matrix4.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

import { invAdjustCartesianCoords } from "./adjustCartesian.js";

import { updateUrlParams } from "./utils.js";

import { viewer } from "./LIS.js";

// The viewModel tracks the state of the application.
// Decouple the state from the interface specific vars.
// Each setter calls the status updated fuction that updates the state url
export var viewModel = {
  // camera position and orientation
  _camera_position: new Cartesian3(),
  _camera_direction: new Cartesian3(),
  _camera_up: new Cartesian3(),
  _lightSourceIdx: -1,

  // time
  _UTCTime: "",
  _startUTCTime: "",
  _stopUTCTime: "",

  // terrain
  _terrainProviderName: undefined,
  _terrainVertexNormalsEnabled: true,
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

  // NAC IMAGE ID
  _NACImageID: undefined,
  _NACImageEnabled: false,

  // QMap IMAGE ID
  _QMapImageServerName: undefined,
  _QMapImageLayerName: undefined,
  _QMapImageID: undefined,
  _QMapImageEnabled: false,

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

  // UTCTime
  get UTCTime() {
    return this._UTCTime;
  },

  set UTCTime(value) {
    this._UTCTime = JulianDate.toIso8601(value, 3);
    maybeUpdateStateUrl();
  },

  // start UTCTime
  get startUTCTime() {
    return this._startUTCTime;
  },

  set startUTCTime(value) {
    this._startUTCTime = JulianDate.toIso8601(value, 3);
    saveStateToQueryString();
  },

  // stop UTCTime
  get stopUTCTime() {
    return this._stopUTCTime;
  },

  set stopUTCTime(value) {
    this._stopUTCTime = JulianDate.toIso8601(value, 3);
    saveStateToQueryString();
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

  // terrain vertex normals
  get terrainVertexNormalsEnabled() {
    return this._terrainVertexNormalsEnabled;
  },

  set terrainVertexNormalsEnabled(value) {
    this._terrainVertexNormalsEnabled = value;
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

  // NAC IMAGE ID
  get NACImageID() {
    return this._NACImageID;
  },

  set NACImageID(id) {
    this._NACImageID = id;
    saveStateToQueryString();
  },

  get NACImageEnabled() {
    return this._NACImageEnabled;
  },

  set NACImageEnabled(checked) {
    this._NACImageEnabled = checked;
    saveStateToQueryString();
  },

  // QMAP IMAGE ID
  get QMapImageServerName() {
    return this._QMapImageServerName;
  },

  get QMapImageLayerName() {
    return this._QMapImageLayerName;
  },

  get QMapImageID() {
    return this._QMapImageID;
  },

  get QMapImageEnabled() {
    return this._QMapImageEnabled;
  },

  set QMapImageEnabled(checked) {
    this._QMapImageEnabled = checked;
    saveStateToQueryString();
  },
};

viewModel.setCameraPandO = function (
  camera_position,
  camera_direction,
  camera_up
) {
  var diff1 = Cartesian3.distance(this._camera_position, camera_position);
  var diff2 = Cartesian3.distance(this._camera_direction, camera_direction);
  var diff3 = Cartesian3.distance(this._camera_up, camera_up);
  if (diff1 > Math.EPSILON8 || diff2 > Math.EPSILON8 || diff3 > Math.EPSILON8) {
    // ignore if the difference is too small.
    this._camera_position = Cartesian3.clone(camera_position);
    this._camera_direction = Cartesian3.clone(camera_direction);
    this._camera_up = Cartesian3.clone(camera_up);

    saveStateToQueryString();
  }
};

viewModel.setQMapImageInfo = function (serverName, layerName, imageID) {
  this._QMapImageServerName = serverName;
  this._QMapImageLayerName = layerName;
  this._QMapImageID = imageID;

  saveStateToQueryString();
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
  if (lastUrlStateUpdateTime !== viewModel.UTCTime) {
    lastUrlStateUpdateTime = viewModel.UTCTime;
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
export function saveStateToQueryString() {
  // console.log("updating state url...");
  if (!viewModel.viewModelLoadFinished) {
    // wait the state has been loaded before updating it
    return;
  }

  resetStateUpdateTimer();

  // var transform = viewer.camera.inverseTransform;
  var transform = viewer.camera.transform;

  // store pos and orientation. Note: use regular terrain coords (not accounting for polar view rotation)
  var camera_position = new Cartesian3();
  var camera_direction = new Cartesian3();
  var camera_up = new Cartesian3();

  // use the globe center as reference frame (it might change if there is an entity selected)
  camera_position = Matrix4.multiplyByPoint(
    transform,
    viewModel.camera_position,
    camera_position
  );
  camera_position = Cartesian3.pack(
    invAdjustCartesianCoords(camera_position, isOptimizedPolarTerrain),
    []
  );

  // use the globe center as reference frame (it might change if there is an entity selected)
  camera_direction = Matrix4.multiplyByPointAsVector(
    transform,
    viewModel.camera_direction,
    camera_direction
  );
  if (Cartesian3.magnitude(camera_direction) > 0) {
    // normalize
    Cartesian3.normalize(camera_direction, camera_direction);
  }
  camera_direction = Cartesian3.pack(
    invAdjustCartesianCoords(camera_direction, isOptimizedPolarTerrain),
    []
  );

  // use the globe center as reference frame (it might change if there is an entity selected)
  camera_up = Matrix4.multiplyByPointAsVector(
    transform,
    viewModel.camera_up,
    camera_up
  );
  if (Cartesian3.magnitude(camera_up) > 0) {
    // normalize
    Cartesian3.normalize(camera_up, camera_up);
  }
  camera_up = Cartesian3.pack(
    invAdjustCartesianCoords(camera_up, isOptimizedPolarTerrain),
    []
  );

  // time
  var UTCTime = JulianDate.fromIso8601(viewModel.UTCTime);
  var startUTCTime = JulianDate.fromIso8601(viewModel.startUTCTime);
  var stopUTCTime = JulianDate.fromIso8601(viewModel.stopUTCTime);

  // illumination
  var lightSourceIdx = viewModel.lightSourceIdx;

  // terrain
  var terrainProviderName = viewModel.terrainProviderName;

  // terrain normals enabled
  var terrainVertexNormalsEnabled = viewModel.terrainVertexNormalsEnabled;

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
  // var hiresDemRegionsEnabled = viewModel.hiresDemRegionsEnabled;

  //  var WACMosaicNSEnabled = viewModel.WACMosaicNSEnabled;
  //  var sunVisibility60Enabled = viewModel.sunVisibility60Enabled;

  var urlParams = {
    camera_position,
    camera_direction,
    camera_up,
    UTCTime,
    startUTCTime,
    stopUTCTime,
    lightSourceIdx,
    terrainProviderName,
    terrainVertexNormalsEnabled,
    terrainMeshMaxError,
    contourEnabled,
    //    atmSimuEnabled,
    shadowsMaxDistance,
    selectedLocationName,
    skirtsEnabled,
    terrainShadowsEnabled,
    shadowsFadingEnabled,
    //    hiresDemRegionsEnabled,
    //    WACMosaicNSEnabled,
    //    sunVisibility60Enabled,
  };

  if (
    viewer._baseLayerPicker.viewModel.selectedImagery.layerObj !== undefined
  ) {
    urlParams[
      viewer._baseLayerPicker.viewModel.selectedImagery.layerObj + "Enabled"
    ] = true;
  }

  var NACImageID = viewModel.NACImageID;

  if (NACImageID !== undefined) {
    var NACImageEnabled = viewModel.NACImageEnabled;
    urlParams["NACImageID"] = NACImageID;
    urlParams["NACImageEnabled"] = NACImageEnabled;
  }

  var QMapImageServerName = viewModel.QMapImageServerName;
  var QMapImageLayerName = viewModel.QMapImageLayerName;
  var QMapImageID = viewModel.QMapImageID;
  if (QMapImageID && QMapImageLayerName && QMapImageServerName) {
    var QMapImageEnabled = viewModel.QMapImageEnabled;
    urlParams["QMapImageServerName"] = QMapImageServerName;
    urlParams["QMapImageLayerName"] = QMapImageLayerName;
    urlParams["QMapImageID"] = QMapImageID;
    urlParams["QMapImageEnabled"] = QMapImageEnabled;
  }

  // update url
  updateUrlParams(urlParams);
}
