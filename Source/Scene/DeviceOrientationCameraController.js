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

            that._alpha = CesiumMath.toRadians(alpha);
            that._beta = CesiumMath.toRadians(e.beta);
            that._gamma = CesiumMath.toRadians(e.gamma);
            that._orient = CesiumMath.toRadians(window.orientation || 0);
        }

        window.addEventListener('deviceorientation', callback, false);

        this._removeListener = function() {
            window.removeEventListener('deviceorientation', callback, false);
        };
    }

    var quat = new Quaternion();
    var matrix = new Matrix3();
    var q1 = new Quaternion( - Math.sqrt( 0.5 ), 0, 0, Math.sqrt( 0.5 ) );

    function rotate(camera, alpha, beta, gamma, orient) {

        // Get rotations
        // NOTE: in no other implementation is alpha made negative
        // but for some reason here it is required
        var xRotation = Matrix3.fromRotationX(beta);
        var yRotation = Matrix3.fromRotationY(-alpha);
        var zRotation = Matrix3.fromRotationZ(-gamma);

        // xRotation * yRotation * zRotation
        Matrix3.multiply(yRotation, xRotation, matrix);
        Matrix3.multiply(zRotation, matrix, matrix);

        Quaternion.fromRotationMatrix(matrix, quat);

        // Camera looks out back of device, not the top
        Quaternion.multiply(quat, q1, quat);

        // adjust for screen orientation
        Quaternion.multiply(quat, Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, -orient), quat);

        Matrix3.fromQuaternion(quat, matrix);

        // Set to camera
        // NOTE: not sure why assignemnts differ from Dan Bagnelli's suggestions
        // here https://groups.google.com/forum/#!searchin/cesium-dev/deviceorientation|sort:relevance/cesium-dev/cr2P2wfOwl4/e4opSe_5BrwJ
        // where row 0 => right, row 1 => up, row 2 => direction
        Matrix3.getRow(matrix, 0, camera.up);
        Matrix3.getRow(matrix, 1, camera.direction);
        Matrix3.getRow(matrix, 2, camera.right);
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
