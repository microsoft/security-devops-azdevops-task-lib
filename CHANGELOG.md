# security-devops-azdevops-task-lib change log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## v1.7.2 - 06/21/2023

### Fixed
- Added try-catch best effort for gzip json response decompression from nuget.org
- Compile with nodenext moduleResolution so it implements a Promise resolver intead of yield on dynamic module resolution (node v13.2+)
  - Resolves node and node10 task runners

## v1.7.0 - 06/13/2023

### Added
- The `msdo-nuget-client.ts` javascript nuget client
- Dependency on adm-zip
- Dependency on decompress-response

### Changed
- Install the MSDO nuget package via javascript
  - Removes a dependency on dotnet to leverage restore to install the platform cross-platform
- Upgraded dependencies
  - azure-pipelines-task-lib to v4.3.1
  - azure-pipelines-tool-lib to v2.0.4
  - typescript to v5.1.3