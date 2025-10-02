import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import * as common from './msdo-common';
import * as installer from './defender-installer';

/**
 * The default version of Defender CLI to install if no version is specified.
 */
const cliVersionDefault: string = 'latest';

/**
 * Sets up the environment for the Defender CLI run.
 * Sets pipeline variables.
 * Resolves the version of Defender CLI to install.
 * Installs Defender CLI
 * 
 * @param taskFolder The folder of the task that is using the Defender CLI
 */
async function setupEnvironment(): Promise<void> {
    
    console.log('------------------------------------------------------------------------------');

    // initialize the _defender directory
    let agentDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_defender');
    tl.debug(`agentDirectory = ${agentDirectory}`);
    common.ensureDirectory(agentDirectory);

    let agentPackagesDirectory = process.env.DEFENDER_PACKAGES_DIRECTORY;
    if (!agentPackagesDirectory) {
        agentPackagesDirectory = path.join(agentDirectory, 'packages');
        tl.debug(`agentPackagesDirectory = ${agentPackagesDirectory}`);
        common.ensureDirectory(agentPackagesDirectory);
        process.env.DEFENDER_PACKAGES_DIRECTORY = agentPackagesDirectory;
    }

    if (!process.env.DEFENDER_FILEPATH) {
        let cliVersion = resolveCliVersion();
        await installer.install(cliVersion);
    }

    console.log('------------------------------------------------------------------------------');
}

/**
 * Resolves the version of Defender CLI to install.
 * 
 * @returns The version of Defender CLI to install
 */
function resolveCliVersion(): string {
    let cliVersion = cliVersionDefault;
    
    console.log(`Initial CLI version (default): ${cliVersion}`);

    if (process.env.DEFENDER_VERSION) {
        cliVersion = process.env.DEFENDER_VERSION;
        console.log(`Using DEFENDER_VERSION: ${cliVersion}`);
    }

    if (cliVersion.includes('*')) {
        console.log(`Version contains '*', switching to Latest`);
        cliVersion = cliVersionDefault;
    }

    return cliVersion;
}

/**
 * Gets the path to the Defender CLI
 * 
 * @returns The path to the Defender CLI
 */
function getCliFilePath() : string {
    let cliFilePath: string = process.env.DEFENDER_FILEPATH;
    tl.debug(`cliFilePath = ${cliFilePath}`);
    return cliFilePath;
}
/**
 * Runs a Defender scan with the specified scan type and target
 * @param scanType - The type of scan to perform (e.g., "fs", "image")
 * @param target - The target to scan (directory path or image name)
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
async function scan(
    scanType: string,
    target: string,
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null
): Promise<void> {
    
    if (!outputPath) {
        outputPath = path.join(process.env.BUILD_STAGINGDIRECTORY || process.cwd(), 'defender.sarif');
    }

    let args = [
        'scan',
        scanType,
        target,
        '--defender-policy', policy,
        '--defender-output', outputPath
    ];

    await runDefenderCli(args, successfulExitCodes);
}

/**
 * Runs the Defender CLI with the specified arguments for directory scanning
 * @param directoryPath - The directory path to scan
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
export async function scanDirectory(
    directoryPath: string, 
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null
): Promise<void> {
    await scan('fs', directoryPath, policy, outputPath, successfulExitCodes);
}

/**
 * Runs the Defender CLI with the specified arguments for container image scanning
 * @param imageName - The container image name to scan
 * @param policy - The policy to use for scanning (default: "mdc")
 * @param outputPath - The output SARIF file path
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
export async function scanImage(
    imageName: string, 
    policy: string = 'mdc',
    outputPath?: string,
    successfulExitCodes: number[] = null
): Promise<void> {
    await scan('image', imageName, policy, outputPath, successfulExitCodes);
}

/**
 * Runs the Defender CLI with the specified arguments
 * @param inputArgs - The CLI arguments to pass to the Defender CLI
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
async function runDefenderCli(inputArgs: string[], successfulExitCodes: number[] = null): Promise<void> {
    let tool = null;

    try {
        
        if (successfulExitCodes == null) {
            successfulExitCodes = [0];
        }
        
        await setupEnvironment();
        
        let cliFilePath = getCliFilePath();

        tool = tl.tool(cliFilePath);

        if (inputArgs != null) {
            for (let i = 0; i < inputArgs.length; i++) {
                tool.arg(inputArgs[i]);
            }
        }

        let systemDebug = tl.getVariable("system.debug");

        if (systemDebug == 'true') {
            // Add verbose logging if system debug is enabled
            tool.arg('--verbose');
        }

    } catch (error) {
        console.error('Exception occurred while initializing Defender CLI:');
        tl.setResult(tl.TaskResult.Failed, error);
        return;
    }

    try {
        // let us parse the exit code
        let options: IExecOptions = <IExecOptions>{
            ignoreReturnCode: true
        };

        tl.debug('Running Microsoft Defender CLI...');

        let exitCode = await tool.exec(options);

        let success = false;
        for (let i = 0; i < successfulExitCodes.length; i++) {
            if (exitCode == successfulExitCodes[i]) {
                success = true;
                break;
            }
        }

        if (!success) {
            throw `Defender CLI exited with an error exit code: ${exitCode}`;
        }
    } catch (error) {
        tl.setResult(tl.TaskResult.Failed, error);
    }
}

// Authentication is handled automatically by the scan commands, so no separate auth function is needed
