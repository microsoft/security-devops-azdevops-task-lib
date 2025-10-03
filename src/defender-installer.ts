import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as https from 'https';
import * as tl from 'azure-pipelines-task-lib/task';
import * as common from './msdo-common';

/**
 * Installs the Microsoft Defender CLI 
 * 
 * @param cliVersion - The version of the Defender CLI to install. Also accepts 'latest' value.
 */
export async function install(cliVersion: string): Promise<void> {
    console.log(`Installing Microsoft Defender CLI version: ${cliVersion}`);
    console.log(`Received cliVersion parameter: '${cliVersion}'`);

    if (process.env.DEFENDER_FILEPATH) {
        console.log(`Defender CLI File Path overridden by %DEFENDER_FILEPATH%: ${process.env.DEFENDER_FILEPATH}`);
        return;
    }

    if (process.env.DEFENDER_DIRECTORY) {
        console.log(`Defender CLI Directory overridden by %DEFENDER_DIRECTORY%: ${process.env.DEFENDER_DIRECTORY}`);

        // Set the defender file path with correct filename
        let fileName = resolveFileName();
        let defenderFilePath = path.join(process.env.DEFENDER_DIRECTORY, fileName);
        tl.debug(`defenderFilePath = ${defenderFilePath}`);

        process.env.DEFENDER_FILEPATH = defenderFilePath;
        return;
    }

    let fileName = resolveFileName();

    let agentDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_defender');
    let agentVersionsDirectory = path.join(agentDirectory, 'versions');
    tl.debug(`agentVersionsDirectory = ${agentVersionsDirectory}`);
    common.ensureDirectory(agentVersionsDirectory);

    if (isInstalled(agentVersionsDirectory, fileName, cliVersion)) {
        return;
    }

    let failed = false;
    let attempts = 0;
    let maxAttempts = 3;

    do {
        failed = false;

        try {
            await downloadDefenderCli(agentVersionsDirectory, fileName, cliVersion);
        } catch (error) {
            tl.debug(`Download attempt ${attempts + 1} failed: ${error}`);
            failed = true;
            attempts += 1;
            if (attempts >= maxAttempts) {
                throw new Error(`Failed to download Defender CLI after ${maxAttempts} attempts: ${error}`);
            }
        }
    } while (failed);

    console.log(`Successfully installed Defender CLI version ${cliVersion}`);
    setVariables(agentVersionsDirectory, fileName, cliVersion, true);
}

/**
 * Downloads the Defender CLI from the official repository
 * 
 * @param packagesDirectory - The directory where packages are installed
 * @param fileName - The name of the file to download
 * @param cliVersion - The version to download
 */
async function downloadDefenderCli(packagesDirectory: string, fileName: string, cliVersion: string): Promise<void> {
    let downloadUrl = getDownloadUrl(fileName, cliVersion);
    console.log(`Downloading Defender CLI from: ${downloadUrl}`);

    // Create version-specific directory
    let versionDirectory = path.join(packagesDirectory, `defender-cli.${cliVersion}`);
    common.ensureDirectory(versionDirectory);

    let targetFilePath = path.join(versionDirectory, fileName);
    
    return new Promise<void>((resolve, reject) => {
        const request = https.get(downloadUrl, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirects
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    console.log(`Following redirect to: ${redirectUrl}`);
                    https.get(redirectUrl, (redirectResponse) => {
                        handleDownloadResponse(redirectResponse, targetFilePath, resolve, reject);
                    }).on('error', reject);
                } else {
                    reject(new Error('Redirect without location header'));
                }
            } else {
                handleDownloadResponse(response, targetFilePath, resolve, reject);
            }
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

/**
 * Handles the download response stream
 */
function handleDownloadResponse(
    response: any, 
    targetFilePath: string, 
    resolve: () => void, 
    reject: (error: Error) => void
): void {
    if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
    }

    const fileStream = fs.createWriteStream(targetFilePath);
    response.pipe(fileStream);

    fileStream.on('finish', () => {
        fileStream.close();
        console.log(`\nDownload completed: ${targetFilePath}`);
        
        // Set executable permissions for non-Windows platforms
        if (process.platform !== 'win32') {
            try {
                fs.chmodSync(targetFilePath, '755');
                console.log('Set executable permissions');
            } catch (error) {
                console.warn(`Warning: Could not set executable permissions: ${error}`);
            }
        }
        
        resolve();
    });

    fileStream.on('error', (error) => {
        fs.unlink(targetFilePath, () => {}); // Clean up partial file
        reject(error);
    });

    response.on('error', reject);
}

/**
 * Constructs the download URL for the Defender CLI
 * 
 * @param fileName - The name of the file to download
 * @param cliVersion - The version to download
 * @returns The complete download URL
 */
function getDownloadUrl(fileName: string, cliVersion: string): string {
    const baseUrl = 'https://cli.dfd.security.azure.com/public';
    console.log(`getDownloadUrl called with fileName: '${fileName}', cliVersion: '${cliVersion}'`);
    
    // Convert 'Latest' to 'latest' for URL compatibility
    let urlVersion = cliVersion;
    if (cliVersion === 'Latest') {
        urlVersion = 'latest';
        console.log(`Converting 'Latest' to 'latest' for URL`);
    }
    
    const downloadUrl = `${baseUrl}/${urlVersion}/${fileName}`;
    console.log(`Constructed download URL: ${downloadUrl}`);
    return downloadUrl;
}

/**
 * Resolves the filename of the Defender CLI based on the current platform
 * 
 * @returns the filename of the Defender CLI for the current platform
 */
function resolveFileName(): string {
    let fileName: string;
    
    if (process.platform === 'win32') {
        if (process.arch === 'arm64') {
            fileName = 'Defender_win-arm64.exe';
        } else if (process.arch === 'ia32') {
            fileName = 'Defender_win-x86.exe';
        } else {
            fileName = 'Defender_win-x64.exe';
        }
    } else if (process.platform === 'linux') {
        if (process.arch === 'arm64') {
            fileName = 'Defender_linux-arm64';
        } else {
            fileName = 'Defender_linux-x64';
        }
    } else if (process.platform === 'darwin') {
        if (process.arch === 'arm64') {
            fileName = 'Defender_osx-arm64';
        } else {
            fileName = 'Defender_osx-x64';
        }
    } else {
        // Default fallback
        fileName = 'Defender_linux-x64';
    }
    
    tl.debug(`Resolved fileName = ${fileName}`);
    return fileName;
}

/**
 * Checks if the Defender CLI is already installed
 * 
 * @param packagesDirectory - The directory where the Defender CLI packages are installed
 * @param fileName - The name of the Defender CLI file
 * @param cliVersion - The version of the Defender CLI to install
 * @returns true if the Defender CLI is already installed, false otherwise
 */
function isInstalled(
    packagesDirectory: string, 
    fileName: string, 
    cliVersion: string): boolean {
    let installed = false;

    // Always check for existing installation, regardless of version type
    installed = setVariables(packagesDirectory, fileName, cliVersion);
    
    if (installed) {
        console.log(`Defender CLI v${cliVersion} already installed.`);
    } else {
        console.log(`Defender CLI v${cliVersion} not found, proceeding with download.`);
    }

    return installed;
}

/**
 * Sets the DEFENDER_DIRECTORY and DEFENDER_FILEPATH environment variables
 * 
 * @param packagesDirectory - The directory where the Defender CLI packages are installed
 * @param fileName - The name of the Defender CLI file
 * @param cliVersion - The version of the Defender CLI to install
 * @param validate - Whether to validate the file exists after setting variables
 */
function setVariables(
    packagesDirectory: string, 
    fileName: string, 
    cliVersion: string, 
    validate: boolean = false): boolean {

    let versionDirectory = path.join(packagesDirectory, `defender-cli.${cliVersion}`);
    tl.debug(`versionDirectory = ${versionDirectory}`);

    let defenderFilePath = path.join(versionDirectory, fileName);
    tl.debug(`defenderFilePath = ${defenderFilePath}`);

    process.env.DEFENDER_DIRECTORY = versionDirectory;
    process.env.DEFENDER_FILEPATH = defenderFilePath;
    process.env.DEFENDER_INSTALLEDVERSION = cliVersion;

    let exists = fs.existsSync(process.env.DEFENDER_FILEPATH);

    if (validate && !exists) {
        throw new Error(`Defender CLI v${cliVersion} was not found after installation. Expected location: ${defenderFilePath}`);
    }

    return exists;
}
