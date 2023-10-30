import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import * as common from './msdo-common';
import * as installer from './msdo-installer';

/**
 * The default version of Guardian to install if no version is specified.
 */
const cliVersionDefault: string = 'Latest';

/**
 * Sets up the environment for the Guardian run.
 * Sets pipeline variables.
 * Resolves the version of Guardian to install.
 * Installs Guardian
 * 
 * @param taskFolder The folder of the task that is using the Guardian Pipeline
 */
async function setupEnvironment(): Promise<void> {
    
    console.log('------------------------------------------------------------------------------');

    if (!process.env.MSDO_FILEPATH) {
        let cliVersion = resolveCliVersion();
        await installer.install(cliVersion);
    }

    process.env.GDN_SETTINGS_FOLDERS = `Install=${process.env.MSDO_PACKAGES_DIRECTORY}`

    console.log('------------------------------------------------------------------------------');
}

/**
 * Resolves the version of Guardian to install.
 * 
 * @returns The version of Guardian to install
 */
function resolveCliVersion(): string {
    let cliVersion = cliVersionDefault;

    if (process.env.MSDO_VERSION) {
        cliVersion = process.env.MSDO_VERSION;
    }

    if (cliVersion.includes('*')) {
        // Before manual nuget installs, "1.*" was acceptable.
        // As this is no longer supported, and it functionally meant "Latest",
        // default that value back to Latest
        cliVersion = 'Latest';
    }

    return cliVersion;
}

/**
 * Gets the path to the MSDO CLI
 * 
 * @returns The path to the MSDO CLI
 */
function getCliFilePath() : string {
    let cliFilePath: string = process.env.MSDO_FILEPATH;
    tl.debug(`cliFilePath = ${cliFilePath}`);
    return cliFilePath;
}

/**
 * Runs "guardian init" to ensure the Guardian CLI is initialized.
 */
async function init() {
    try {
        let cliFilePath = getCliFilePath();
        let tool = tl.tool(cliFilePath).arg('init').arg('--force');
        await tool.exec();
    }
    catch (error) {
        tl.debug(error);
    }
}

/**
 * Runs "guardian run" with the input CLI arguments
 * @param inputArgs - The CLI arguments to pass to "guardian run"
 * @param successfulExitCodes - The exit codes that are considered successful. Defaults to [0]. All others will throw an Error.
 */
export async function run(inputArgs: string[], successfulExitCodes: number[] = null, publish: boolean = true, publishArtifactName: string = null, telemetryEnvironment: string = 'azdevops'): Promise<void> {
    let tool = null;

    let sarifFile: string = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msdo.sarif');
    tl.debug(`sarifFile = ${sarifFile}`);

    try {
        
        if (successfulExitCodes == null) {
            successfulExitCodes = [0];
        }
        
        await setupEnvironment();
        await init();
        
        let cliFilePath = getCliFilePath();

        tool = tl.tool(cliFilePath).arg('run');

        if (inputArgs != null) {
            for (let i = 0; i < inputArgs.length; i++) {
                tool.arg(inputArgs[i]);
            }
        }

        tool.arg('--logger-pipeline');

        let systemDebug = tl.getVariable("system.debug");
        let loggerLevel = tl.getVariable("GDN_LOGGERLEVEL");
        tl.debug(`GDN_LOGGERLEVEL = ${loggerLevel}`);

        if (systemDebug == 'true') {
            tool.arg('--logger-level').arg('trace');
            tool.arg('--logger-show-level');
        }
        else if (loggerLevel) {
            tool.arg('--logger-level').arg(loggerLevel);
        }

        // Write it as an environment variable for follow up tasks to consume
        tl.setVariable('MSDO_SARIF_FILE', sarifFile);

        if (common.isVersionGreaterThanOrEqualTo(process.env.MSDO_INSTALLEDVERSION, '0.183.0')) {
            // Export all SARIF results to a file
            tool.arg('--export-file');
        } else {
            // This still exists, but the behavior was corrected in 0.183.0
            // This defaults to only exporting breaking results, as the name implies
            tool.arg('--export-breaking-results-to-file');
            tool.arg(sarifFile);
        }

        tool.arg('--telemetry-environment');
        tool.arg(telemetryEnvironment);
    } catch (error) {
        console.error('Exception occurred while initializing MSDO:');
        tl.setResult(tl.TaskResult.Failed, error);
        return;
    }

    try {
        // let us parse the exit code
        let options: IExecOptions = <IExecOptions>{
            ignoreReturnCode: true
        };

        tl.debug('Running Microsoft Security DevOps...');

        let exitCode = await tool.exec(options);

        let success = false;
        for (let i = 0; i < successfulExitCodes.length; i++) {
            if (exitCode == successfulExitCodes[i]) {
                success = true;
                break;
            }
        }

        if (publish && fs.existsSync(sarifFile)) {
            if (common.isNullOrWhiteSpace(publishArtifactName)) {
                publishArtifactName = 'CodeAnalysisLogs';
            }

            console.log(`##vso[artifact.upload artifactname=${publishArtifactName}]${sarifFile}`);
        }

        if (!success) {
            throw `MSDO CLI exited with an error exit code: ${exitCode}`;
        }
    } catch (error) {
        tl.setResult(tl.TaskResult.Failed, error);
    }
}