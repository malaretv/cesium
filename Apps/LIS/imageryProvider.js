import * as Cesium from "../../Source/Cesium.js";

import { QTSConfig } from "./config/config.js";

import { viewer } from "./LIS.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

import { saveStateToQueryString } from "./viewModel.js";

function createEmptyImageryProvider() {
  /* NOTE: use out of range scaling values for returning empty tiles*/
  var layerUrl =
    "https://qm-proxy.lroc.asu.edu/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=png&layer=wac_albedo&bodyview=lunar-fulleqc&d_mask=1&d_imf=none&d_opt=wcolut0&d_val=1000%2C2000&cmd_script=get_tile.msh";

  const layerImageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: layerUrl,
    tileWidth: 512,
    tileHeight: 512,
    customTags: {
      zPlusOne: function (imageryProvider, x, y, z) {
        return z + 1;
      },
    },
  });
  return layerImageryProvider;
}

const NullImageryProvider = createEmptyImageryProvider(
  "wac_albedo",
  "lunar-fulleqc",
  "png"
);

function createLayerImageryProvider(
  servername,
  layerName,
  bodyView,
  format,
  optURLParam
) {
  const layer_url_template =
    "https://__SERVER_NAME__/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=__FORMAT__&layer=__LAYER__&bodyview=__BODY_VIEW____OPT__&cmd_script=get_tile.msh";

  var layerUrl = layer_url_template.replace("__LAYER__", layerName);
  layerUrl = layerUrl.replace("__SERVER_NAME__", servername);
  layerUrl = layerUrl.replace("__FORMAT__", format);
  if (!bodyView) {
    bodyView = isOptimizedPolarTerrain
      ? "lunar-polarshifted-eqc"
      : "lunar-fulleqc";
  }
  layerUrl = layerUrl.replace("__BODY_VIEW__", bodyView);
  if (optURLParam === undefined) {
    optURLParam = "";
  }
  layerUrl = layerUrl.replace("__OPT__", optURLParam);
  const layerImageryProvider = new Cesium.UrlTemplateImageryProvider({
    url: layerUrl,
    tilingScheme: new Cesium.GeographicTilingScheme({
      ellipsoid: viewer.scene.globe.ellipsoid,
      numberOfLevelZeroTilesX: 2,
      numberOfLevelZeroTilesY: 1,
    }),
    tileWidth: 512,
    tileHeight: 512,
    customTags: {
      zPlusOne: function (imageryProvider, x, y, z) {
        return z + 1;
      },
    },
  });
  return layerImageryProvider;
}

function createLayerImageModel(layerObj) {
  var layerInfo = QTSConfig.layersInfo[layerObj];
  var layerImageryModel = new Cesium.ProviderViewModel({
    name: layerInfo.name,
    iconUrl: layerInfo.iconUrl,
    tooltip: layerInfo.tooltip,
    creationFunction: function () {
      var layerProjection = isOptimizedPolarTerrain
        ? QTSConfig.polarShiftedEqcProjectionName
        : QTSConfig.eqcProjectionName;
      var layerImageryProvider = createLayerImageryProvider(
        layerInfo.servername,
        layerInfo.layerName,
        layerProjection,
        layerInfo.layerFormat
      );
      return layerImageryProvider;
    },
  });
  layerImageryModel.layerObj = layerObj;

  return layerImageryModel;
}

export function initializeImageryPicker() {
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels.removeAll();

  const NullModel = new Cesium.ProviderViewModel({
    name: "None",
    iconUrl: "./images/ImageryProviders/none.png",
    tooltip: "None (Plain terrain with shadows)",
    creationFunction: function () {
      return NullImageryProvider;
    },
  });

  // viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();
  var providerViewModels = [];
  providerViewModels.push(NullModel);

  for (var layerObj in QTSConfig.layersInfo) {
    var layerImageryModel = createLayerImageModel(layerObj);
    providerViewModels.push(layerImageryModel);
  }

  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
  viewer.baseLayerPicker.viewModel.selectedImagery = NullModel;

  // change Imager Title
  var dropPanel = viewer.baseLayerPicker._dropPanel;
  var dropPanelSections = dropPanel.getElementsByClassName(
    "cesium-baseLayerPicker-sectionTitle"
  );
  var imageryTitle = dropPanelSections[0];
  imageryTitle.innerHTML = "BaseMap Image";

  // update query string when the current layer provider changes
  viewer.imageryLayers.layerAdded.addEventListener(function (layer) {
    if (layer.show === true) {
      // call after a delay to be sure the selected layer has been updated
      setTimeout(saveStateToQueryString, 300);
    }
  });
}

export function updateBaseLayerPickerImageryLayers() {
  // get selected model
  if (viewer.baseLayerPicker.viewModel.selectedImagery.layerObj !== undefined) {
    var providerViewModels =
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels;

    var idx = providerViewModels.indexOf(
      viewer.baseLayerPicker.viewModel.selectedImagery
    );
    // force model update
    var layerImageModel = createLayerImageModel(
      viewer.baseLayerPicker.viewModel.selectedImagery.layerObj
    );
    providerViewModels[idx] = layerImageModel;
    viewer.baseLayerPicker.viewModel.selectedImagery = layerImageModel;

    viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
  }
}

export function setLayerImageryEnabled(layerObj) {
  for (var layerViewModelObj in viewer.baseLayerPicker.viewModel
    .imageryProviderViewModels) {
    var layerViewModel =
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels[
        layerViewModelObj
      ];
    if (
      layerViewModel.layerObj !== undefined &&
      layerViewModel.layerObj === layerObj
    ) {
      if (viewer.baseLayerPicker.viewModel.selectedImagery !== layerViewModel) {
        viewer.baseLayerPicker.viewModel.selectedImagery = layerViewModel;
      }
    }
  }
}

// NAC Image
export function createLayerNACImageProvider(NACImageId) {
  var optURLParam = "&oid=" + NACImageId;
  var layerProjection = isOptimizedPolarTerrain
    ? "lunar-polarshifted-eqc"
    : "lunar-fulleqc";
  // var layerProjection = "lunar-polarshifted-eqc";
  var layerNACImage = createLayerImageryProvider(
    "act-test.lroc.asu.edu",
    "lrocnac",
    layerProjection,
    "png",
    optURLParam
  );
  return layerNACImage;
}

// QMap Image
export function createLayerQMapImageProvider(servername, layername, imageId) {
  var optURLParam = "&oid=" + imageId;
  var layerProjection = isOptimizedPolarTerrain
    ? "lunar-polarshifted-eqc"
    : "lunar-fulleqc";
  // var layerProjection = "lunar-polarshifted-eqc";
  var layerImage = createLayerImageryProvider(
    servername,
    layername,
    layerProjection,
    "png",
    optURLParam
  );
  return layerImage;
}
