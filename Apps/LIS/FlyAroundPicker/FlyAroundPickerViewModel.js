import createCommand from "../../../Source/Widgets/createCommand.js";
import defined from "../../../Source/Core/defined.js";
import destroyObject from "../../../Source/Core/destroyObject.js";
import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import DeveloperError from "../../../Source/Core/DeveloperError.js";
import EventHelper from "../../../Source/Core/EventHelper.js";
import HeadingPitchRange from "../../../Source/Core/HeadingPitchRange.js";
import knockout from "../../../Source/ThirdParty/knockout.js";
import CesiumMath from "../../../Source/Core/Math.js";
import Matrix4 from "../../../Source/Core/Matrix4.js";
import ScreenSpaceEventHandler from "../../../Source/Core/ScreenSpaceEventHandler.js";
import ScreenSpaceEventType from "../../../Source/Core/ScreenSpaceEventType.js";
import Transforms from "../../../Source/Core/Transforms.js";

import {
  cartesianToDummyPolar,
  dummyPolarToCartesian,
} from "../adjustCartesian.js";

import { mousePosCartesian } from "../LIS.js";

import { getLightSourceSPICEPosition } from "../illumination.js";

import { isOptimizedPolarTerrain } from "../terrainProvider.js";

/**
 * The view model for {@link FlyAroundPicker}.
 * @alias FlyAroundPickerViewModel
 * @constructor
 *
 * @param {Scene} scene The Scene to switch projections.
 */
function FlyAroundPickerViewModel(viewer) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(viewer)) {
    throw new DeveloperError("scene is required.");
  }
  //>>includeEnd('debug');

  this._viewer = viewer;
  this._scene = viewer.scene;
  this._rotateCameraAroundPointEnabled = false;
  this._rotateCameraAroundPointLightInFrontEnabled = false;
  this._flightInProgress = false;

  this._cancelOrbitEventHandler = null;

  /**
   * Gets or sets whether the button drop-down is currently visible.  This property is observable.
   * @type {Boolean}
   * @default false
   */
  this.dropDownVisible = false;

  /**
   * Gets or sets the fly around point tooltip.  This property is observable.
   */
  this.tooltipRotateAroundPoint = "Fly around selected point";

  /**
   * Gets or sets Force Sun in Front Point tooltip.  This property is observable.
   */
  this.tooltipRotateAroundPointSunInFront =
    "Rotate around selected point, forcing the sun to be in front of the viewer";

  /**
   * Gets the currently active tooltip.  This property is observable.
   * @type {String}
   */
  this.selectedTooltip = undefined;

  knockout.track(this, [
    "_rotateCameraAroundPointEnabled",
    "_rotateCameraAroundPointLightInFrontEnabled",
    "_flightInProgress",
    "dropDownVisible",
    "tooltipRotateAroundPoint",
    "tooltipRotateAroundPointSunInFront",
  ]);

  var that = this;
  knockout.defineProperty(this, "selectedTooltip", function () {
    if (that._rotateCameraAroundPointLightInFrontEnabled) {
      return that.tooltipRotateAroundPointSunInFront;
    }
    return that.tooltipRotateAroundPoint;
  });

  knockout
    .getObservable(that, "_flightInProgress")
    .subscribe(function (flightInProgress) {
      if (flightInProgress) {
        that.stopRotating();
      }
    });

  this._onPickerClick = createCommand(function () {
    if (that._flightInProgress) {
      return;
    }

    if (that.rotatingEnabled()) {
      that.stopRotating();
    } else {
      that.dropDownVisible = !that.dropDownVisible;
    }
  });

  this._eventHelper = new EventHelper();
  this._eventHelper.add(that._scene.preRender, function () {
    that._flightInProgress = defined(that._scene.camera._currentFlight);
  });

  // EVENTS HANDLING
  this._screenEventHandler = new ScreenSpaceEventHandler(viewer.canvas);
  // LEFT CLICK
  this._screenEventHandler.setInputAction(() => {
    if (
      (that._rotateCameraAroundPointEnabled ||
        that._rotateCameraAroundPointLightInFrontEnabled) &&
      !that._mouseClickPosCartesian
    ) {
      that._mouseClickPosCartesian = Cartesian3.clone(mousePosCartesian);
      // start rotating
      if (that._rotateCameraAroundPointLightInFrontEnabled) {
        that.initializeRotateCameraAroundPointLightInFront(
          that._mouseClickPosCartesian
        );
      } else {
        that.rotateCameraAroundPoint(that._mouseClickPosCartesian);
      }
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  document.addEventListener("bodiesPosUpdated", function (e) {
    if (that._rotateCameraAroundPointLightInFrontEnabled) {
      that.rotateCameraAroundPointLightInFront(that._mouseClickPosCartesian);
    }
  });

  document.addEventListener("globeRefereceSystemUpdated", function (e) {
    if (that._mouseClickPosCartesian) {
      // update mouse click position
      if (isOptimizedPolarTerrain) {
        that._mouseClickPosCartesian = cartesianToDummyPolar(
          that._mouseClickPosCartesian
        );
      } else {
        that._mouseClickPosCartesian = dummyPolarToCartesian(
          that._mouseClickPosCartesian
        );
      }
    }
  });

  this._enableRotateCameraAroundPoint = createCommand(function () {
    that.setRotateCameraAroundPointEnabled(true);
    that.dropDownVisible = false;
  });

  this._enableRotateCameraAroundPointSunInFront = createCommand(function () {
    that.setRotateCameraAroundPointLightInFrontEnabled(true);
    that.dropDownVisible = false;
    that.dropDownVisible = false;
  });
}

Object.defineProperties(FlyAroundPickerViewModel.prototype, {
  /**
   * Gets the scene
   * @memberof FlyAroundPickerViewModel.prototype
   * @type {Scene}
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },

  /**
   * Gets the command to toggle the drop down box.
   * @memberof FlyAroundPickerViewModel.prototype
   *
   * @type {Command}
   */
  onPickerClick: {
    get: function () {
      return this._onPickerClick;
    },
  },

  /**
   * Gets the command to enable rotate camera around point.
   * @memberof FlyAroundPickerViewModel.prototype
   *
   * @type {Command}
   */
  enableRotateCameraAroundPoint: {
    get: function () {
      return this._enableRotateCameraAroundPoint;
    },
  },

  /**
   * Gets the command to enable rotate camera around point keeping sun in front.
   * @memberof FlyAroundPickerViewModel.prototype
   *
   * @type {Command}
   */
  enableRotateCameraAroundPointSunInFront: {
    get: function () {
      return this._enableRotateCameraAroundPointSunInFront;
    },
  },

  rotateCameraAroundPointEnabled: {
    get: function () {
      return this._rotateCameraAroundPointEnabled;
    },
  },
});

/**
 * @returns {Boolean} true if the object has been destroyed, false otherwise.
 */
FlyAroundPickerViewModel.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the view model.
 */
FlyAroundPickerViewModel.prototype.destroy = function () {
  this._eventHelper.removeAll();
  destroyObject(this);
};

FlyAroundPickerViewModel.prototype.setRotateCameraAroundPointEnabled = function (
  checked
) {
  if (this.rotateCameraAroundPointEnabled === checked) {
    return;
  }
  this._rotateCameraAroundPointEnabled = checked;

  // make sure fly around is disabled
  if (
    this.rotateCameraAroundPointEnabled &&
    this.rotateCameraAroundPointLightInFrontEnabled
  ) {
    this._rotateCameraAroundPointLightInFrontEnabled = false;
  }

  if (
    !this.rotateCameraAroundPointEnabled &&
    !defined(this.scene.trackedEntity)
  ) {
    this.resetCameraPivotPoint();
  } else {
    this.rotateCameraAroundPoint(this._mouseClickPosCartesian);
  }
};

FlyAroundPickerViewModel.prototype.resetCameraPivotPoint = function () {
  this._scene.camera.lookAtTransform(Matrix4.IDENTITY);
  if (this._cancelOrbitEventHandler) {
    this._cancelOrbitEventHandler();
  }
  this._mouseClickPosCartesian = undefined;
};

FlyAroundPickerViewModel.prototype.rotateCameraAroundPoint = function (
  pointCartesianCoords
) {
  if (!this.setCameraPivotPoint(pointCartesianCoords)) {
    return;
  }

  const deltaAngle = CesiumMath.toRadians(0.05);
  this._cancelOrbitEventHandler = this._viewer.clock.onTick.addEventListener(
    () => {
      this._scene.camera.rotate(Cartesian3.UNIT_Z, deltaAngle);
    }
  );
};

FlyAroundPickerViewModel.prototype.setCameraPivotPoint = function (
  pointCartesianCoords
) {
  if (this._cancelOrbitEventHandler) this._cancelOrbitEventHandler();
  if (!pointCartesianCoords) return false;

  var transform = Transforms.eastNorthUpToFixedFrame(
    pointCartesianCoords,
    this._scene.globe.ellipsoid
  );

  const pithCorrectTh = CesiumMath.toRadians(0.01);
  // console.log("camera pitch: " + camera.pitch + "(deg: " + rad2deg(camera.pitch) +")");
  if (Math.abs(this._scene.camera.pitch) > CesiumMath.PI / 2 - pithCorrectTh) {
    // note: slightly change the pitch as there could be rotation issues around Z axis when changing transformation
    // Cesium issue???
    const p = this._scene.camera.pitch + pithCorrectTh;
    const h = 0;
    const m = Cartesian3.distance(
      this._scene.camera.positionWC,
      pointCartesianCoords
    );
    this._scene.camera.lookAtTransform(
      transform,
      new HeadingPitchRange(h, p, m)
    );
  } else {
    // View in east-north-up frame
    // camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    this._scene.camera.lookAtTransform(transform);
  }

  // console.log("camera pitch: " + camera.pitch + "(deg: " + rad2deg(camera.pitch) +")");

  // referenceFramePrimitive = scene.primitives.add(
  //   new Cesium.DebugModelMatrixPrimitive({
  //     modelMatrix: transform,
  //     length: 10000.0,
  //   })
  // );

  return true;
};

FlyAroundPickerViewModel.prototype.initializeRotateCameraAroundPointLightInFront = function (
  pointCartesianCoords
) {
  if (!this.setCameraPivotPoint(pointCartesianCoords)) {
    return;
  }

  this.rotateCameraAroundPointLightInFront(pointCartesianCoords);
};

FlyAroundPickerViewModel.prototype.setRotateCameraAroundPointLightInFrontEnabled = function (
  checked
) {
  if (this._rotateCameraAroundPointLightInFrontEnabled === checked) {
    return;
  }
  this._rotateCameraAroundPointLightInFrontEnabled = checked;

  // make sure fly around is disabled
  if (
    this._rotateCameraAroundPointLightInFrontEnabled &&
    this._rotateCameraAroundPointEnabled
  ) {
    // re-use current POI
    this._rotateCameraAroundPointEnabled = false;
    if (this._cancelOrbitEventHandler) {
      this._cancelOrbitEventHandler();
    }
  }

  if (
    !this._rotateCameraAroundPointLightInFrontEnabled &&
    !defined(this.scene.trackedEntity)
  ) {
    this.resetCameraPivotPoint();
  } else {
    this.rotateCameraAroundPointLightInFront(this._mouseClickPosCartesian);
  }
};

FlyAroundPickerViewModel.prototype.rotatingEnabled = function () {
  return (
    this._rotateCameraAroundPointEnabled ||
    this._rotateCameraAroundPointLightInFrontEnabled
  );
};

FlyAroundPickerViewModel.prototype.stopRotating = function () {
  if (this._rotateCameraAroundPointEnabled) {
    this.setRotateCameraAroundPointEnabled(false);
  } else {
    this.setRotateCameraAroundPointLightInFrontEnabled(false);
  }
};

var POICartesianPos = new Cartesian3();
var POIToLightVec = new Cartesian3();
var POIToCameraVec = new Cartesian3();
var POIToLightOVec = new Cartesian3();
var POIToCameraOVec = new Cartesian3();
var crossVec = new Cartesian3();
FlyAroundPickerViewModel.prototype.rotateCameraAroundPointLightInFront = function (
  pointCartesianCoords
) {
  if (!pointCartesianCoords) return;

  let lightPosSPICE = getLightSourceSPICEPosition();
  if (!lightPosSPICE) return;

  // POI to sun vector
  Cartesian3.subtract(lightPosSPICE, pointCartesianCoords, POIToLightVec);
  Cartesian3.normalize(POIToLightVec, POIToLightVec);
  // POI to camera vector
  Cartesian3.subtract(
    this._scene.camera.positionWC,
    pointCartesianCoords,
    POIToCameraVec
  );
  Cartesian3.normalize(POIToCameraVec, POIToCameraVec);

  // compute orthogonal vectors (they are on the same plane)
  Cartesian3.normalize(pointCartesianCoords, POICartesianPos);
  Cartesian3.cross(POIToLightVec, POICartesianPos, POIToLightOVec);
  Cartesian3.cross(POIToCameraVec, POICartesianPos, POIToCameraOVec);
  // compute angle between then
  // var toLightVsToCameraAngle = Cesium.Cartesian3.angleBetween(POIToLightOVec, POIToCameraOVec);
  // Note: Extracted from Cartesian3.angleBetween, for optimization purposes
  var cosine = Cartesian3.dot(POIToLightOVec, POIToCameraOVec);
  Cartesian3.cross(POIToLightOVec, POIToCameraOVec, crossVec);
  var sine = Cartesian3.magnitude(crossVec);
  var toLightVsToCameraAngle = Math.atan2(sine, cosine);

  // adjust the sign of the angle
  // Use cross product of the two vectors to get the normal of the plane formed by the two vectors.
  // Then check the dotproduct between that and the original plane normal to see if they are facing
  // the same direction.
  if (Cartesian3.dot(POICartesianPos, crossVec) < 0) {
    toLightVsToCameraAngle = CesiumMath.TWO_PI - toLightVsToCameraAngle;
  }

  // rotate camera for having the sun in front
  const deltaAngle = toLightVsToCameraAngle - CesiumMath.PI;
  // console.log("rotate camera by angle: " + rad2deg(deltaAngle));
  this._scene.camera.rotate(Cartesian3.UNIT_Z, deltaAngle);
};

export default FlyAroundPickerViewModel;
