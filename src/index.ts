// Export existing MSDO modules
export * as msdoClient from './msdo-client';
export * as msdoCommon from './msdo-common';
export * as msdoInstaller from './msdo-installer';
export * as msdoNugetClient from './msdo-nuget-client';

// Export new Defender CLI modules
export * as defenderClient from './defender-client';
export * as defenderInstaller from './defender-installer';

// Re-export individual functions from defender-client for easier access
export { scanDirectory, scanImage } from './defender-client';
