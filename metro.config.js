const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

const defaultResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // music-metadata's format sniffer has Node-only code Hermes can't parse: use a small stand-in
  if (moduleName === 'file-type') return { type: 'sourceFile', filePath: path.join(__dirname, 'src/lib/file-type-lite.js') }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform)
}

module.exports = config
