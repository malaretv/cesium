import * as Cesium from "../../Source/Cesium.js";

import { createLayerImageryProvider, viewer } from "./LIS.js";

import { isOptimizedPolarTerrain } from "./terrainProvider.js";

function createEmptyImageryProvider() {
  /* NOTE: use out of range scaling values for returning empty tiles*/
  var layerUrl =
    "https://act-test.lroc.asu.edu/fcgi-bin/fprovweb.exe?_xtype=dynamic&z={zPlusOne}&x={x}&y={y}&format=png&layer=wac_albedo&bodyview=lunar-fulleqc&d_mask=1&d_imf=none&d_opt=wcolut0&d_val=1000%2C2000&cmd_script=get_tile.msh";

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

const NullModel = new Cesium.ProviderViewModel({
  name: "None",
  iconUrl: "./images/ImageryProviders/none.png",
  tooltip: "None (Plain terrain with shadows)",
  creationFunction: function () {
    return NullImageryProvider;
  },
});

const WACMosaicNSImageryProvider = createLayerImageryProvider(
  "wac_albedo",
  "lunar-fulleqc",
  "jpg"
);

const WACMosaicNSModel = new Cesium.ProviderViewModel({
  name: "WAC Mosaic (No Shadows)",
  iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
  tooltip: "WAC Mosaic (No Shadows)",
  creationFunction: function () {
    return WACMosaicNSImageryProvider;
  },
});

const WACMosaicNSPolarImageryProvider = createLayerImageryProvider(
  "wac_albedo",
  "lunar-polarshifted-eqc",
  "jpg"
);

const WACMosaicNSPolarModel = new Cesium.ProviderViewModel({
  name: "WAC Mosaic (No Shadows)",
  iconUrl: "./images/ImageryProviders/wac_no_shadows.png",
  tooltip: "WAC Mosaic (No Shadows)",
  creationFunction: function () {
    return WACMosaicNSPolarImageryProvider;
  },
});

const sunVisibilty60mImageryProvider = createLayerImageryProvider(
  "lavgvis_s_60m",
  "lunar-polarshifted-eqc",
  "png"
);

const sunVisibilty60mModel = new Cesium.ProviderViewModel({
  name: "Sun Visibility 60m",
  iconUrl: "./images/ImageryProviders/sun_visibility_60m.png",
  tooltip: "Sun Visibility 60m",
  creationFunction: function () {
    return sunVisibilty60mImageryProvider;
  },
});

export var NoneModelIdx;
export var WACMosaicNSModelIdx;
export var sunVisibilty60mModelIdx;

export function initializeImageryPicker() {
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels.removeAll();
  // viewer.baseLayerPicker.viewModel.terrainProviderViewModels.removeAll();
  var providerViewModels = [];
  providerViewModels.push(NullModel);
  NoneModelIdx = providerViewModels.length - 1;
  providerViewModels.push(WACMosaicNSModel);
  WACMosaicNSModelIdx = providerViewModels.length - 1;
  providerViewModels.push(sunVisibilty60mModel);
  sunVisibilty60mModelIdx = providerViewModels.length - 1;
  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
  viewer.baseLayerPicker.viewModel.selectedImagery = NullModel;

  // change Imager Title
  var dropPanel = viewer.baseLayerPicker._dropPanel;
  var dropPanelSections = dropPanel.getElementsByClassName(
    "cesium-baseLayerPicker-sectionTitle"
  );
  var imageryTitle = dropPanelSections[0];
  imageryTitle.innerHTML = "BaseMap Image";
}

export function updateBaseLayerPickerImageryLayers() {
  var providerViewModels =
    viewer.baseLayerPicker.viewModel.imageryProviderViewModels;

  if (isOptimizedPolarTerrain) {
    providerViewModels[WACMosaicNSModelIdx] = WACMosaicNSPolarModel;
    if (viewer.baseLayerPicker.viewModel.selectedImagery === WACMosaicNSModel) {
      viewer.baseLayerPicker.viewModel.selectedImagery = WACMosaicNSPolarModel;
    }
  } else {
    providerViewModels[WACMosaicNSModelIdx] = WACMosaicNSModel;
    if (
      viewer.baseLayerPicker.viewModel.selectedImagery === WACMosaicNSPolarModel
    ) {
      viewer.baseLayerPicker.viewModel.selectedImagery = WACMosaicNSModel;
    }
  }

  viewer.baseLayerPicker.viewModel.imageryProviderViewModels = providerViewModels;
}

export function getImageryLayerIdx(imageryLayerProvider) {
  var pickerImageryProvider;
  var imageryProviderCreationFunction;

  for (var i in viewer.baseLayerPicker.viewModel.imageryProviderViewModels) {
    imageryProviderCreationFunction =
      viewer.baseLayerPicker.viewModel.imageryProviderViewModels[i]
        ._creationCommand;
    if (imageryProviderCreationFunction !== undefined) {
      pickerImageryProvider = imageryProviderCreationFunction();
      if (imageryLayerProvider === pickerImageryProvider) return parseInt(i);
    }
  }

  // not found
  return -1;
}
