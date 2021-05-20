import { Cartesian3 } from "../../Source/Cesium.js";

export function cartesianToDummyPolar(cartesianCoords) {
  // rotate along y axis by -90 deg
  // multiple vector my rotation matrix
  // R1 = (0, 0, -1)
  //     (0, 1, 0)
  //     (1, 0, 0)
  // rotate along z axis by 180 deg
  // R2 = (-1, 0, 0)
  //      (0, -1, 0)
  //      (0, 0, 1)
  // final rotation
  // R = R1 * R2 =
  //      (0, 0, -1)
  //      (0, -1, 0)
  //      (-1, 0, 0)
  // v = (x, y, z)

  // optimization
  // vr = v * R = -z, -y, -x

  var polarCartesianCoords = Cartesian3.clone(cartesianCoords);
  polarCartesianCoords.x = -cartesianCoords.z;
  polarCartesianCoords.y = -cartesianCoords.y;
  polarCartesianCoords.z = -cartesianCoords.x;
  return polarCartesianCoords;
}

export function dummyPolarToCartesian(cartesianCoords) {
  // rotate along y axis by -90 deg
  // multiple vector my rotation matrix
  // R1 = (0, 0, -1)
  //     (0, 1, 0)
  //     (1, 0, 0)
  // rotate along z axis by 180 deg
  // R2 = (-1, 0, 0)
  //      (0, -1, 0)
  //      (0, 0, 1)
  // final rotation
  // R = R1 * R2 =
  //      (0, 0, -1)
  //      (0, -1, 0)
  //      (-1, 0, 0)
  // v = (x, y, z)

  // optimization
  // vr = v * R = -z, -y, -x

  var polarCartesianCoords = Cartesian3.clone(cartesianCoords);
  polarCartesianCoords.x = -cartesianCoords.z;
  polarCartesianCoords.y = -cartesianCoords.y;
  polarCartesianCoords.z = -cartesianCoords.x;
  return polarCartesianCoords;
}

export function adjustCartesianCoords(
  cartesianCoords,
  isOptimizedPolarTerrain
) {
  if (isOptimizedPolarTerrain) {
    // adjust for dummy polar case
    return cartesianToDummyPolar(cartesianCoords);
  }
  // nothing to change
  return cartesianCoords;
}

export function invAdjustCartesianCoords(
  cartesianCoords,
  isOptimizedPolarTerrain
) {
  if (isOptimizedPolarTerrain) {
    // adjust for dummy polar case
    return dummyPolarToCartesian(cartesianCoords);
  }
  // nothing to change
  return cartesianCoords;
}
