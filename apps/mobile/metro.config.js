const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// In a monorepo setup, Metro might auto-include root paths that do not exist yet.
// Filter watchFolders and nodeModulesPaths to only directories that exist on disk.
if (config.watchFolders) {
  config.watchFolders = config.watchFolders.filter((folder) => fs.existsSync(folder));
}

if (config.resolver?.nodeModulesPaths) {
  config.resolver.nodeModulesPaths = config.resolver.nodeModulesPaths.filter((dir) => fs.existsSync(dir));
}

// Add .onnx extension to assetExts so Metro bundles YOLOv8 models as static assets
if (config.resolver?.assetExts && !config.resolver.assetExts.includes('onnx')) {
  config.resolver.assetExts.push('onnx');
}

module.exports = config;
