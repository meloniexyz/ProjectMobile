Pod::Spec.new do |s|
  s.name           = 'NegusifyAudio'
  s.version        = '1.0.0'
  s.summary        = 'Negusify audio engine: queue playback with EQ, loudness leveling and lock-screen controls'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Negusify'
  s.homepage       = 'https://github.com/meloniexyz/Negusify'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'MediaToolbox', 'MediaPlayer', 'Accelerate'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
