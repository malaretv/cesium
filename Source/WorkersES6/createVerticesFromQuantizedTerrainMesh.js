import AxisAlignedBoundingBox from "../Core/AxisAlignedBoundingBox.js";
import Cartesian2 from "../Core/Cartesian2.js";
import Cartesian3 from "../Core/Cartesian3.js";
import Cartographic from "../Core/Cartographic.js";
import defined from "../Core/defined.js";
import Ellipsoid from "../Core/Ellipsoid.js";
import EllipsoidalOccluder from "../Core/EllipsoidalOccluder.js";
import IndexDatatype from "../Core/IndexDatatype.js";
import CesiumMath from "../Core/Math.js";
import Matrix4 from "../Core/Matrix4.js";
import Rectangle from "../Core/Rectangle.js";
import TerrainEncoding from "../Core/TerrainEncoding.js";
import TerrainProvider from "../Core/TerrainProvider.js";
import Transforms from "../Core/Transforms.js";
import WebMercatorProjection from "../Core/WebMercatorProjection.js";
import createTaskProcessorWorker from "./createTaskProcessorWorker.js";

var maxShort = 32767;

var enableAdditionalSkirt = true;
var enableSkirtsBottomPlane = true;

var cartesian3Scratch = new Cartesian3();
var scratchMinimum = new Cartesian3();
var scratchMaximum = new Cartesian3();
var cartographicScratch = new Cartographic();
var toPack = new Cartesian2();

function createVerticesFromQuantizedTerrainMesh(
  parameters,
  transferableObjects
) {
  var enableAdditionalSkirtEff = enableAdditionalSkirt && parameters.level > 6;
  var enableSkirtsBottomPlaneEff =
    enableSkirtsBottomPlane && parameters.level > 6;

  var quantizedVertices = parameters.quantizedVertices;
  var quantizedVertexCount = quantizedVertices.length / 3;
  var octEncodedNormals = parameters.octEncodedNormals;
  var edgeVertexCount =
    parameters.westIndices.length +
    parameters.eastIndices.length +
    parameters.southIndices.length +
    parameters.northIndices.length;
  var addSkirtVertexCount = 2 * 4;
  var includeWebMercatorT = parameters.includeWebMercatorT;

  var exaggeration = parameters.exaggeration;
  var exaggerationRelativeHeight = parameters.exaggerationRelativeHeight;
  var hasExaggeration = exaggeration !== 1.0;
  var includeGeodeticSurfaceNormals = hasExaggeration;

  var rectangle = Rectangle.clone(parameters.rectangle);
  var west = rectangle.west;
  var south = rectangle.south;
  var east = rectangle.east;
  var north = rectangle.north;

  var ellipsoid = Ellipsoid.clone(parameters.ellipsoid);

  var minimumHeight = parameters.minimumHeight;
  var maximumHeight = parameters.maximumHeight;

  var center = parameters.relativeToCenter;
  var fromENU = Transforms.eastNorthUpToFixedFrame(center, ellipsoid);
  var toENU = Matrix4.inverseTransformation(fromENU, new Matrix4());

  var southMercatorY;
  var oneOverMercatorHeight;
  if (includeWebMercatorT) {
    southMercatorY = WebMercatorProjection.geodeticLatitudeToMercatorAngle(
      south
    );
    oneOverMercatorHeight =
      1.0 /
      (WebMercatorProjection.geodeticLatitudeToMercatorAngle(north) -
        southMercatorY);
  }

  var uBuffer = quantizedVertices.subarray(0, quantizedVertexCount);
  var vBuffer = quantizedVertices.subarray(
    quantizedVertexCount,
    2 * quantizedVertexCount
  );
  var heightBuffer = quantizedVertices.subarray(
    quantizedVertexCount * 2,
    3 * quantizedVertexCount
  );
  var hasVertexNormals = defined(octEncodedNormals);

  var uvs = new Array(quantizedVertexCount);
  var heights = new Array(quantizedVertexCount);
  var positions = new Array(quantizedVertexCount);
  var webMercatorTs = includeWebMercatorT
    ? new Array(quantizedVertexCount)
    : [];
  var geodeticSurfaceNormals = includeGeodeticSurfaceNormals
    ? new Array(quantizedVertexCount)
    : [];

  var minimum = scratchMinimum;
  minimum.x = Number.POSITIVE_INFINITY;
  minimum.y = Number.POSITIVE_INFINITY;
  minimum.z = Number.POSITIVE_INFINITY;

  var maximum = scratchMaximum;
  maximum.x = Number.NEGATIVE_INFINITY;
  maximum.y = Number.NEGATIVE_INFINITY;
  maximum.z = Number.NEGATIVE_INFINITY;

  var minLongitude = Number.POSITIVE_INFINITY;
  var maxLongitude = Number.NEGATIVE_INFINITY;
  var minLatitude = Number.POSITIVE_INFINITY;
  var maxLatitude = Number.NEGATIVE_INFINITY;

  for (var i = 0; i < quantizedVertexCount; ++i) {
    var rawU = uBuffer[i];
    var rawV = vBuffer[i];

    var u = rawU / maxShort;
    var v = rawV / maxShort;
    var height = CesiumMath.lerp(
      minimumHeight,
      maximumHeight,
      heightBuffer[i] / maxShort
    );

    cartographicScratch.longitude = CesiumMath.lerp(west, east, u);
    cartographicScratch.latitude = CesiumMath.lerp(south, north, v);
    cartographicScratch.height = height;

    minLongitude = Math.min(cartographicScratch.longitude, minLongitude);
    maxLongitude = Math.max(cartographicScratch.longitude, maxLongitude);
    minLatitude = Math.min(cartographicScratch.latitude, minLatitude);
    maxLatitude = Math.max(cartographicScratch.latitude, maxLatitude);

    var position = ellipsoid.cartographicToCartesian(cartographicScratch);

    uvs[i] = new Cartesian2(u, v);
    heights[i] = height;
    positions[i] = position;

    if (includeWebMercatorT) {
      webMercatorTs[i] =
        (WebMercatorProjection.geodeticLatitudeToMercatorAngle(
          cartographicScratch.latitude
        ) -
          southMercatorY) *
        oneOverMercatorHeight;
    }

    if (includeGeodeticSurfaceNormals) {
      geodeticSurfaceNormals[i] = ellipsoid.geodeticSurfaceNormal(position);
    }

    Matrix4.multiplyByPoint(toENU, position, cartesian3Scratch);

    Cartesian3.minimumByComponent(cartesian3Scratch, minimum, minimum);
    Cartesian3.maximumByComponent(cartesian3Scratch, maximum, maximum);
  }

  var westIndicesSouthToNorth = copyAndSort(parameters.westIndices, function (
    a,
    b
  ) {
    return uvs[a].y - uvs[b].y;
  });
  var eastIndicesNorthToSouth = copyAndSort(parameters.eastIndices, function (
    a,
    b
  ) {
    return uvs[b].y - uvs[a].y;
  });
  var southIndicesEastToWest = copyAndSort(parameters.southIndices, function (
    a,
    b
  ) {
    return uvs[b].x - uvs[a].x;
  });
  var northIndicesWestToEast = copyAndSort(parameters.northIndices, function (
    a,
    b
  ) {
    return uvs[a].x - uvs[b].x;
  });

  var occludeePointInScaledSpace;
  if (minimumHeight < 0.0) {
    // Horizon culling point needs to be recomputed since the tile is at least partly under the ellipsoid.
    var occluder = new EllipsoidalOccluder(ellipsoid);
    occludeePointInScaledSpace = occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(
      center,
      positions,
      minimumHeight
    );
  }

  var hMin = minimumHeight;
  hMin = Math.min(
    hMin,
    findMinMaxSkirts(
      parameters.westIndices,
      parameters.westSkirtHeight,
      heights,
      uvs,
      rectangle,
      ellipsoid,
      toENU,
      minimum,
      maximum
    )
  );
  hMin = Math.min(
    hMin,
    findMinMaxSkirts(
      parameters.southIndices,
      parameters.southSkirtHeight,
      heights,
      uvs,
      rectangle,
      ellipsoid,
      toENU,
      minimum,
      maximum
    )
  );
  hMin = Math.min(
    hMin,
    findMinMaxSkirts(
      parameters.eastIndices,
      parameters.eastSkirtHeight,
      heights,
      uvs,
      rectangle,
      ellipsoid,
      toENU,
      minimum,
      maximum
    )
  );
  hMin = Math.min(
    hMin,
    findMinMaxSkirts(
      parameters.northIndices,
      parameters.northSkirtHeight,
      heights,
      uvs,
      rectangle,
      ellipsoid,
      toENU,
      minimum,
      maximum
    )
  );

  var addSkirtHeight;
  var fullHMin;
  if (enableAdditionalSkirtEff) {
    var eastT = rectangle.east;
    var westT = rectangle.west;

    if (eastT < westT) {
      eastT += CesiumMath.TWO_PI;
    }

    var tileXSize = (eastT - westT) * ellipsoid.maximumRadius;
    var addSkirtSize = tileXSize * 2;
    if (addSkirtSize < 4000) {
      // Note: force high skirt size in order to force rendering
      // (additional skirts are not shown if too small)
      addSkirtSize = 5000;
    }
    addSkirtHeight = hMin - addSkirtSize;

    fullHMin = Math.min(hMin, addSkirtHeight);
  } else {
    fullHMin = hMin;
  }

  var aaBox = new AxisAlignedBoundingBox(minimum, maximum, center);
  var encoding = new TerrainEncoding(
    center,
    aaBox,
    fullHMin,
    maximumHeight,
    fromENU,
    hasVertexNormals,
    includeWebMercatorT,
    includeGeodeticSurfaceNormals,
    exaggeration,
    exaggerationRelativeHeight
  );
  var vertexStride = encoding.stride;
  var size =
    quantizedVertexCount * vertexStride + edgeVertexCount * vertexStride;
  if (enableAdditionalSkirtEff) {
    size += addSkirtVertexCount * vertexStride;
  }
  var vertexBuffer = new Float32Array(size);

  var bufferIndex = 0;
  for (var j = 0; j < quantizedVertexCount; ++j) {
    if (hasVertexNormals) {
      var n = j * 2.0;
      toPack.x = octEncodedNormals[n];
      toPack.y = octEncodedNormals[n + 1];
    }

    bufferIndex = encoding.encode(
      vertexBuffer,
      bufferIndex,
      positions[j],
      uvs[j],
      heights[j],
      toPack,
      webMercatorTs[j],
      geodeticSurfaceNormals[j]
    );
  }

  var edgeTriangleCount = Math.max(0, (edgeVertexCount - 4) * 2);
  if (enableAdditionalSkirtEff) {
    edgeTriangleCount += addSkirtVertexCount;
  }

  var indexBufferLength = parameters.indices.length + edgeTriangleCount * 3;
  if (enableSkirtsBottomPlaneEff) {
    // 2 more triangles for bottom skirts plane
    indexBufferLength += 2 * 3;
  }
  var indexBuffer;
  var totVertextCount = quantizedVertexCount + edgeVertexCount;
  if (enableAdditionalSkirtEff) totVertextCount += addSkirtVertexCount;
  indexBuffer = IndexDatatype.createTypedArray(
    totVertextCount,
    indexBufferLength
  );
  indexBuffer.set(parameters.indices, 0);

  var percentage = 0.0001;
  var lonOffset = (maxLongitude - minLongitude) * percentage;
  var latOffset = (maxLatitude - minLatitude) * percentage;
  var westLongitudeOffset = -lonOffset;
  var westLatitudeOffset = 0.0;
  var eastLongitudeOffset = lonOffset;
  var eastLatitudeOffset = 0.0;
  var northLongitudeOffset = 0.0;
  var northLatitudeOffset = latOffset;
  var southLongitudeOffset = 0.0;
  var southLatitudeOffset = -latOffset;

  // Add skirts.
  var terrainHeight;
  if (enableAdditionalSkirtEff || enableSkirtsBottomPlaneEff) {
    terrainHeight = hMin;
  }
  var vertexBufferIndex = quantizedVertexCount * vertexStride;
  addSkirt(
    vertexBuffer,
    vertexBufferIndex,
    westIndicesSouthToNorth,
    encoding,
    heights,
    uvs,
    octEncodedNormals,
    ellipsoid,
    rectangle,
    parameters.westSkirtHeight,
    southMercatorY,
    oneOverMercatorHeight,
    westLongitudeOffset,
    westLatitudeOffset,
    terrainHeight
  );
  vertexBufferIndex += parameters.westIndices.length * vertexStride;
  addSkirt(
    vertexBuffer,
    vertexBufferIndex,
    southIndicesEastToWest,
    encoding,
    heights,
    uvs,
    octEncodedNormals,
    ellipsoid,
    rectangle,
    parameters.southSkirtHeight,
    southMercatorY,
    oneOverMercatorHeight,
    southLongitudeOffset,
    southLatitudeOffset,
    terrainHeight
  );
  vertexBufferIndex += parameters.southIndices.length * vertexStride;
  addSkirt(
    vertexBuffer,
    vertexBufferIndex,
    eastIndicesNorthToSouth,
    encoding,
    heights,
    uvs,
    octEncodedNormals,
    ellipsoid,
    rectangle,
    parameters.eastSkirtHeight,
    southMercatorY,
    oneOverMercatorHeight,
    eastLongitudeOffset,
    eastLatitudeOffset,
    terrainHeight
  );
  vertexBufferIndex += parameters.eastIndices.length * vertexStride;
  addSkirt(
    vertexBuffer,
    vertexBufferIndex,
    northIndicesWestToEast,
    encoding,
    heights,
    uvs,
    octEncodedNormals,
    ellipsoid,
    rectangle,
    parameters.northSkirtHeight,
    southMercatorY,
    oneOverMercatorHeight,
    northLongitudeOffset,
    northLatitudeOffset,
    terrainHeight
  );

  if (enableAdditionalSkirtEff) {
    vertexBufferIndex += parameters.northIndices.length * vertexStride;
    addAdditionalSkirt(
      vertexBuffer,
      vertexBufferIndex,
      westIndicesSouthToNorth,
      encoding,
      heights,
      uvs,
      octEncodedNormals,
      ellipsoid,
      rectangle,
      addSkirtHeight,
      southMercatorY,
      oneOverMercatorHeight,
      westLongitudeOffset,
      westLatitudeOffset
    );
    vertexBufferIndex += 2 * vertexStride;
    addAdditionalSkirt(
      vertexBuffer,
      vertexBufferIndex,
      southIndicesEastToWest,
      encoding,
      heights,
      uvs,
      octEncodedNormals,
      ellipsoid,
      rectangle,
      addSkirtHeight,
      southMercatorY,
      oneOverMercatorHeight,
      southLongitudeOffset,
      southLatitudeOffset
    );
    vertexBufferIndex += 2 * vertexStride;
    addAdditionalSkirt(
      vertexBuffer,
      vertexBufferIndex,
      eastIndicesNorthToSouth,
      encoding,
      heights,
      uvs,
      octEncodedNormals,
      ellipsoid,
      rectangle,
      addSkirtHeight,
      southMercatorY,
      oneOverMercatorHeight,
      eastLongitudeOffset,
      eastLatitudeOffset
    );
    vertexBufferIndex += 2 * vertexStride;
    addAdditionalSkirt(
      vertexBuffer,
      vertexBufferIndex,
      northIndicesWestToEast,
      encoding,
      heights,
      uvs,
      octEncodedNormals,
      ellipsoid,
      rectangle,
      addSkirtHeight,
      southMercatorY,
      oneOverMercatorHeight,
      northLongitudeOffset,
      northLatitudeOffset
    );
  }

  var offset = TerrainProvider.addSkirtIndices(
    westIndicesSouthToNorth,
    southIndicesEastToWest,
    eastIndicesNorthToSouth,
    northIndicesWestToEast,
    quantizedVertexCount,
    indexBuffer,
    parameters.indices.length
  );

  if (enableAdditionalSkirtEff) {
    TerrainProvider.addAdditionalSkirtIndices(
      westIndicesSouthToNorth,
      southIndicesEastToWest,
      eastIndicesNorthToSouth,
      northIndicesWestToEast,
      quantizedVertexCount,
      indexBuffer,
      offset
    );
  }

  if (enableSkirtsBottomPlaneEff) {
    var WSVertexIndex, WNVertexIndex, ENVertexIndex, ESVertexIndex;
    if (enableAdditionalSkirtEff) {
      // add the bottom plane to additional skirts
      var skirtVertexCount =
        westIndicesSouthToNorth.length +
        southIndicesEastToWest.length +
        eastIndicesNorthToSouth.length +
        northIndicesWestToEast.length;
      var addVertexIndex = quantizedVertexCount + skirtVertexCount;
      // add the bottom plane to skirts
      WSVertexIndex = addVertexIndex;
      WNVertexIndex = addVertexIndex + 1;
      addVertexIndex += 2;
      addVertexIndex += 2;
      ENVertexIndex = addVertexIndex;
      ESVertexIndex = addVertexIndex + 1;
    } else {
      // add the bottom plane to skirts
      var vertexIndex = quantizedVertexCount;
      WSVertexIndex = vertexIndex;
      WNVertexIndex = vertexIndex + westIndicesSouthToNorth.length - 1;
      vertexIndex += westIndicesSouthToNorth.length;
      vertexIndex += southIndicesEastToWest.length;
      ENVertexIndex = vertexIndex;
      ESVertexIndex = vertexIndex + eastIndicesNorthToSouth.length - 1;
    }

    TerrainProvider.addSkirtsBottomPlane(
      WSVertexIndex,
      WNVertexIndex,
      ENVertexIndex,
      ESVertexIndex,
      indexBuffer,
      offset
    );
  }

  transferableObjects.push(vertexBuffer.buffer, indexBuffer.buffer);

  return {
    vertices: vertexBuffer.buffer,
    indices: indexBuffer.buffer,
    westIndicesSouthToNorth: westIndicesSouthToNorth,
    southIndicesEastToWest: southIndicesEastToWest,
    eastIndicesNorthToSouth: eastIndicesNorthToSouth,
    northIndicesWestToEast: northIndicesWestToEast,
    vertexStride: vertexStride,
    center: center,
    minimumHeight: minimumHeight,
    maximumHeight: maximumHeight,
    occludeePointInScaledSpace: occludeePointInScaledSpace,
    encoding: encoding,
    indexCountWithoutSkirts: parameters.indices.length,
  };
}

function findMinMaxSkirts(
  edgeIndices,
  edgeHeight,
  heights,
  uvs,
  rectangle,
  ellipsoid,
  toENU,
  minimum,
  maximum
) {
  var hMin = Number.POSITIVE_INFINITY;

  var north = rectangle.north;
  var south = rectangle.south;
  var east = rectangle.east;
  var west = rectangle.west;

  if (east < west) {
    east += CesiumMath.TWO_PI;
  }

  var length = edgeIndices.length;
  for (var i = 0; i < length; ++i) {
    var index = edgeIndices[i];
    var h = heights[index];
    var uv = uvs[index];

    cartographicScratch.longitude = CesiumMath.lerp(west, east, uv.x);
    cartographicScratch.latitude = CesiumMath.lerp(south, north, uv.y);
    cartographicScratch.height = h - edgeHeight;

    var position = ellipsoid.cartographicToCartesian(
      cartographicScratch,
      cartesian3Scratch
    );
    Matrix4.multiplyByPoint(toENU, position, position);

    Cartesian3.minimumByComponent(position, minimum, minimum);
    Cartesian3.maximumByComponent(position, maximum, maximum);

    hMin = Math.min(hMin, cartographicScratch.height);
  }
  return hMin;
}

function addSkirtVertex(
  vertexBuffer,
  vertexBufferIndex,
  encoding,
  index,
  height,
  uv,
  octEncodedNormals,
  ellipsoid,
  north,
  south,
  east,
  west,
  southMercatorY,
  oneOverMercatorHeight,
  longitudeOffset,
  latitudeOffset
) {
  var hasVertexNormals = defined(octEncodedNormals);

  cartographicScratch.longitude =
    CesiumMath.lerp(west, east, uv.x) + longitudeOffset;
  cartographicScratch.latitude =
    CesiumMath.lerp(south, north, uv.y) + latitudeOffset;
  cartographicScratch.height = height;

  var position = ellipsoid.cartographicToCartesian(
    cartographicScratch,
    cartesian3Scratch
  );

  if (hasVertexNormals) {
    var n = index * 2.0;
    toPack.x = octEncodedNormals[n];
    toPack.y = octEncodedNormals[n + 1];
  }

  var webMercatorT;
  if (encoding.hasWebMercatorT) {
    webMercatorT =
      (WebMercatorProjection.geodeticLatitudeToMercatorAngle(
        cartographicScratch.latitude
      ) -
        southMercatorY) *
      oneOverMercatorHeight;
  }

  vertexBufferIndex = encoding.encode(
    vertexBuffer,
    vertexBufferIndex,
    position,
    uv,
    cartographicScratch.height,
    toPack,
    webMercatorT
  );

  return vertexBufferIndex;
}

function addSkirt(
  vertexBuffer,
  vertexBufferIndex,
  edgeVertices,
  encoding,
  heights,
  uvs,
  octEncodedNormals,
  ellipsoid,
  rectangle,
  skirtLength,
  southMercatorY,
  oneOverMercatorHeight,
  longitudeOffset,
  latitudeOffset,
  terrainHeight
) {
  var north = rectangle.north;
  var south = rectangle.south;
  var east = rectangle.east;
  var west = rectangle.west;

  if (east < west) {
    east += CesiumMath.TWO_PI;
  }

  var index;
  var uv;
  var height;
  if (terrainHeight) height = terrainHeight;
  var length = edgeVertices.length;
  for (var i = 0; i < length; ++i) {
    index = edgeVertices[i];
    uv = uvs[index];

    if (!terrainHeight) {
      var h = heights[index];
      height = h - skirtLength;
    }
    vertexBufferIndex = addSkirtVertex(
      vertexBuffer,
      vertexBufferIndex,
      encoding,
      index,
      height,
      uv,
      octEncodedNormals,
      ellipsoid,
      north,
      south,
      east,
      west,
      southMercatorY,
      oneOverMercatorHeight,
      longitudeOffset,
      latitudeOffset
    );
  }
}

function addAdditionalSkirt(
  vertexBuffer,
  vertexBufferIndex,
  edgeVertices,
  encoding,
  heights,
  uvs,
  octEncodedNormals,
  ellipsoid,
  rectangle,
  addSkirtHeight,
  southMercatorY,
  oneOverMercatorHeight,
  longitudeOffset,
  latitudeOffset
) {
  var north = rectangle.north;
  var south = rectangle.south;
  var east = rectangle.east;
  var west = rectangle.west;

  if (east < west) {
    east += CesiumMath.TWO_PI;
  }

  var index;
  var uv;
  var height;

  // add to more vertices for additional simplified skirt to put to the bottom of the main skirt
  height = addSkirtHeight;
  index = edgeVertices[0];
  uv = uvs[index];
  vertexBufferIndex = addSkirtVertex(
    vertexBuffer,
    vertexBufferIndex,
    encoding,
    index,
    height,
    uv,
    octEncodedNormals,
    ellipsoid,
    north,
    south,
    east,
    west,
    southMercatorY,
    oneOverMercatorHeight,
    longitudeOffset,
    latitudeOffset
  );

  index = edgeVertices[edgeVertices.length - 1];
  uv = uvs[index];
  vertexBufferIndex = addSkirtVertex(
    vertexBuffer,
    vertexBufferIndex,
    encoding,
    index,
    height,
    uv,
    octEncodedNormals,
    ellipsoid,
    north,
    south,
    east,
    west,
    southMercatorY,
    oneOverMercatorHeight,
    longitudeOffset,
    latitudeOffset
  );
}

function copyAndSort(typedArray, comparator) {
  var copy;
  if (typeof typedArray.slice === "function") {
    copy = typedArray.slice();
    if (typeof copy.sort !== "function") {
      // Sliced typed array isn't sortable, so we can't use it.
      copy = undefined;
    }
  }

  if (!defined(copy)) {
    copy = Array.prototype.slice.call(typedArray);
  }

  copy.sort(comparator);

  return copy;
}
export default createTaskProcessorWorker(
  createVerticesFromQuantizedTerrainMesh
);
