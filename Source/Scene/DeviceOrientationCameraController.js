/*global define*/
define([
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/destroyObject',
        '../Core/Cartesian3',
        '../Core/DeveloperError',
        '../Core/Math',
        '../Core/Matrix3',
        '../Core/Quaternion'
    ], function(
        defaultValue,
        defined,
        destroyObject,
        Cartesian3,
        DeveloperError,
        CesiumMath,
        Matrix3,
        Quaternion) {
    'use strict';

    /**
     * @private
     */
    function DeviceOrientationCameraController(scene) {
        //>>includeStart('debug', pragmas.debug);
        if (!defined(scene)) {
            throw new DeveloperError('scene is required.');
        }
        //>>includeEnd('debug');

        this._scene = scene;

        this._deviceOrientation = {};
        this._screenOrientation = window.orientation || 0;

        var that = this;

        function deviceOrientationCallback(e) {
          that._deviceOrientation = e;
        }

        function screenOrientationCallback() {
          that._screenOrientation = window.orientation || 0;
        }

        window.addEventListener('deviceorientation', deviceOrientationCallback, false);
        window.addEventListener('orientationchange', screenOrientationCallback, false);

        this._removeListener = function() {
            window.removeEventListener('deviceorientation', deviceOrientationCallback, false);
            window.removeEventListener('orientationchange', screenOrientationCallback, false);
        };
    }

    function eulerToQuaternionInZXYOrder(_x, _y, _z, quat) {
      var c1 = Math.cos( _x / 2 );
  		var c2 = Math.cos( _y / 2 );
  		var c3 = Math.cos( _z / 2 );
  		var s1 = Math.sin( _x / 2 );
  		var s2 = Math.sin( _y / 2 );
  		var s3 = Math.sin( _z / 2 );
      var x = s1 * c2 * c3 - c1 * s2 * s3;
			var y = c1 * s2 * c3 + s1 * c2 * s3;
			var z = c1 * c2 * s3 + s1 * s2 * c3;
			var w = c1 * c2 * c3 - s1 * s2 * s3;

      quat.x = x;
      quat.y = y;
      quat.z = z;
      quat.w = w;

      return quat;
    }

    var rotQuat = new Quaternion();
    var rotMatrix = new Matrix3();
    var adjustToWorldQuat =
      Quaternion.fromAxisAngle(Cartesian3.UNIT_Y, -CesiumMath.toRadians(270));

    function rotate(camera, alpha, beta, gamma, orient) {

        // device euler angles => quaternion
        eulerToQuaternionInZXYOrder(beta, gamma, alpha, rotQuat);

        // Look out back of device
        Quaternion.multiply(rotQuat, adjustToWorldQuat, rotQuat);

        // Rotate to adjust for screen orientation
        var adjustToScreen = Quaternion.fromAxisAngle(Cartesian3.UNIT_X, CesiumMath.PI_OVER_TWO - orient)

        Quaternion.multiply(rotQuat, adjustToScreen, rotQuat);

        // quaternion => matrix
        Matrix3.fromQuaternion(rotQuat, rotMatrix);

        Matrix3.getColumn(rotMatrix, 0, camera.direction);
        Matrix3.getColumn(rotMatrix, 2, camera.up);
        Cartesian3.cross(camera.direction, camera.up, camera.right);
    }

    DeviceOrientationCameraController.prototype.update = function() {
        if (!defined(this._deviceOrientation.alpha)) {
            return;
        }

        var alpha = this._deviceOrientation.alpha ?
          CesiumMath.toRadians(this._deviceOrientation.alpha) : 0;
        var beta = this._deviceOrientation.beta ?
          CesiumMath.toRadians(this._deviceOrientation.beta) : 0;
        var gamma = this._deviceOrientation.gamma ?
          CesiumMath.toRadians(this._deviceOrientation.gamma) : 0;
        console.log('screen', this._screenOrientation);
        var orient = CesiumMath.toRadians(this._screenOrientation);

        rotate(this._scene.camera, alpha, beta, gamma, orient);
    };

    /**
     * Returns true if this object was destroyed; otherwise, false.
     * <br /><br />
     *
     * @returns {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
     */
    DeviceOrientationCameraController.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Destroys the resources held by this object.  Destroying an object allows for deterministic
     * release of resources, instead of relying on the garbage collector to destroy this object.
     * <br /><br />
     * Once an object is destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
     * assign the return value (<code>undefined</code>) to the object as done in the example.
     *
     * @returns {undefined}
     *
     * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
     */
    DeviceOrientationCameraController.prototype.destroy = function() {
        this._removeListener();
        return destroyObject(this);
    };

    return DeviceOrientationCameraController;
});
