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

        this._lastAlpha = undefined;
        this._lastBeta = undefined;
        this._lastGamma = undefined;

        this._alpha = undefined;
        this._beta = undefined;
        this._gamma = undefined;

        var that = this;

        function callback(e) {
            var alpha = e.alpha;
            if (!defined(alpha)) {
                that._alpha = undefined;
                that._beta = undefined;
                that._gamma = undefined;
                return;
            }

            that._alpha = CesiumMath.toRadians(e.alpha);
            that._beta = CesiumMath.toRadians(e.beta);
            that._gamma = CesiumMath.toRadians(e.gamma);
            that._orient = CesiumMath.toRadians(window.orientation || 0);
        }
        // 90 0 -90 90
        function screenCallback() {
          console.log('orientation', window.orientation);
          this._orient = CesiumMath.toRadians(window.orientation || 0);
        }
        window.addEventListener('deviceorientation', callback, false);
        window.addEventListener('screenorientation', screenCallback, false);
        this._removeListener = function() {
            window.removeEventListener('deviceorientation', callback, false);
            window.removeEventListener('screenorientation', screenCallback, false);
        };
    }

    function eulerToQuaternionInYXZOrder(_x, _y, _z) {
      var c1 = Math.cos( _x / 2 );
  		var c2 = Math.cos( _y / 2 );
  		var c3 = Math.cos( _z / 2 );
  		var s1 = Math.sin( _x / 2 );
  		var s2 = Math.sin( _y / 2 );
  		var s3 = Math.sin( _z / 2 );
      var x = s1 * c2 * c3 + c1 * s2 * s3;
			var y = c1 * s2 * c3 - s1 * c2 * s3;
			var z = c1 * c2 * s3 - s1 * s2 * c3;
			var w = c1 * c2 * c3 + s1 * s2 * s3;

      return new Quaternion(x, y, z, w);
    }
    function eulerToQuaternionInZXYOrder(_x, _y, _z) {
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

      return new Quaternion(x, y, z, w);
    }
    var quat = new Quaternion();
    var matrix = new Matrix3();
    var adjustToWorldQuat = new Quaternion( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) );

    function rotate(camera, alpha, beta, gamma, orient) {

        var quat = eulerToQuaternionInYXZOrder(beta, alpha, -gamma);

        // Camera looks out back of device, not the top
        Quaternion.multiply(quat, adjustToWorldQuat, quat);

        // adjust for screen orientation
        Quaternion.multiply(quat, Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, -orient), quat);


        // Quat -> Matrix
        Matrix3.fromQuaternion(quat, matrix);

        // Can't seem to get this part right...
        Matrix3.getRow(matrix, 0, camera.up);
        Matrix3.getRow(matrix, 2, camera.direction);
        Matrix3.getRow(matrix, 1, camera.right);
    }

    DeviceOrientationCameraController.prototype.update = function() {
        if (!defined(this._alpha)) {
            return;
        }

        var a = this._alpha;
        var b = this._beta;
        var g = this._gamma;
        var orient = this._orient;

        rotate(this._scene.camera, a, b, g, orient);

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
