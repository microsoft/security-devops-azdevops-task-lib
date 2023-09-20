import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import * as common from './msdo-common';
import * as installer from './msdo-installer';
import AdmZip = require('adm-zip');

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
    let debugDrop = process.env.GDN_DEBUG_DROP;

    let sarifFile: string = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msdo.sarif');
    tl.debug(`sarifFile = ${sarifFile}`);

    try {
        
        if (successfulExitCodes == null) {
            successfulExitCodes = [0];
        }

        const gdnTaskLibFolder = path.resolve(__dirname);
        tl.debug(`gdnTaskLibFolder = ${gdnTaskLibFolder}`);

        const nodeModulesFolder = path.dirname(path.dirname(gdnTaskLibFolder));
        tl.debug(`nodeModulesFolder = ${nodeModulesFolder}`);

        const taskFolder = path.dirname(nodeModulesFolder);
        tl.debug(`taskFolder = ${taskFolder}`);
        
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

        tool.arg('--export-breaking-results-to-file');
        tool.arg(sarifFile);

        tool.arg('--telemetry-environment');
        tool.arg(telemetryEnvironment);

        // Include the debug drop option on the command line if applicable.
        tl.debug(`GdnDebugDrop = ${debugDrop}`);
        if (debugDrop)
        {
            const dropPathValue = path.join(taskFolder, 'debug');
            tool.arg('--debug-drop').arg('--debug-drop-path').arg(dropPathValue);
            const dropPathName = `GDN_DEBUGDROPPATH`;

            tl.debug(`Debug Drop enabled. ${dropPathName}: ${dropPathValue}`);
            process.env[dropPathName] = dropPathValue;
        }
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

        // Ensure debug folder starts clean
        const taskFolder = path.dirname(path.dirname(path.dirname(path.resolve(__dirname))));
        const debugFolder = path.join(taskFolder, 'debug');
        cleanupDirectory(debugFolder);

        let exitCode = await tool.exec(options);

        let success = false;
        for (let i = 0; i < successfulExitCodes.length; i++) {
            if (exitCode == successfulExitCodes[i]) {
                success = true;
                break;
            }
        }

        // Package up debug drop if applicable.
        let debugStagingDir = '';
        tl.debug(`GdnDebugDrop = ${debugDrop}`);
        if (debugDrop) {
            if (fs.existsSync(debugFolder)) {
                tl.debug("Creating debug drop archive...");
                let zippedOutput = getZippedFolder(debugFolder);

                const taskFilePath = path.join(taskFolder, `task.json`);
                tl.debug(`taskFilePath = ${taskFilePath}`);
                const taskFile = require(taskFilePath);
                const taskName = taskFile.name.toUpperCase();

                const instanceDirectory = getInstanceDirectory();
                debugStagingDir = path.join(instanceDirectory, '.gdn', 'debugdrop');
                if (!fs.existsSync(debugStagingDir)) {
                    tl.debug(`Creating missing folder: ${debugStagingDir}`)
                    fs.mkdirSync(debugStagingDir)
                }

                let debugDropArtifact = path.join(debugStagingDir, `${taskName}_debug.zip`);
                let dupeCount = 0;
                while (fs.existsSync(debugDropArtifact)) {
                    dupeCount += 1;
                    debugDropArtifact = path.join(debugStagingDir, `${taskName}_${dupeCount}_debug.zip`)
                }
                fs.copyFileSync(zippedOutput, debugDropArtifact);
                tl.debug(`Finished creating: ${debugDropArtifact}`);
                tl.debug(`Cleaning up: ${path.join(taskFolder, 'debug')}`);
                cleanupDirectory(path.join(taskFolder, 'debug'));
                tl.debug(`Successfully cleaned up debug dump.`);
            }
        }

        if (publish && fs.existsSync(sarifFile)) {
            if (common.isNullOrWhiteSpace(publishArtifactName)) {
                publishArtifactName = 'CodeAnalysisLogs';
            }

            console.log(`##vso[artifact.upload artifactname=${publishArtifactName}]${sarifFile}`);
        }

        if (publish && fs.existsSync(debugStagingDir)) {
            console.log(`##vso[artifact.upload artifactname=DebugDrop]${debugStagingDir}`);
        }

        if (!success) {
            throw `MSDO CLI exited with an error exit code: ${exitCode}`;
        }
    } catch (error) {
        tl.setResult(tl.TaskResult.Failed, error);
    }
}

function getInstanceDirectory(): string {
    let hostType = process.env.SYSTEM_HOSTTYPE;
    if (hostType) {
        hostType = hostType.toUpperCase();
    }

    if (hostType == "RELEASE") {
        return process.env.AGENT_RELEASEDIRECTORY;
    } else { // hostType == "BUILD" or default
        return process.env.BUILD_SOURCESDIRECTORY;
    }
}

function getZippedFolder(dir): string {
    tl.debug(`Zipping up folder: ${dir}`)
    let allPaths = getFilePathsRecursively(dir);
    const zip = new AdmZip();
    for (let filePath of allPaths) {
        tl.debug(`Adding file to archive: ${filePath}`);
        zip.addLocalFile(filePath);
    }

    let destPath = `${dir}.zip`;
    tl.debug(`Writing to file: ${destPath}`)
    zip.writeZip(destPath);
    if (fs.existsSync(destPath)) {
        tl.debug(`Successfully wrote file: ${destPath}`)
    } else {
        tl.debug(`Something went wrong! File does not exist: ${destPath}`)
    }
    return destPath;
}

// Returns a flat array of absolute paths to all files contained in the dir
function getFilePathsRecursively(dir) {
    tl.debug(`Searching for files under dir: ${dir}`)
    var files = [];
    let fileList = fs.readdirSync(dir);
    var remaining = fileList.length;
    if (!remaining) return files;

    for (let file of fileList) {
        file = path.resolve(dir, file);
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            let f = getFilePathsRecursively(file);
            files = files.concat(f);
        } else {
            files.push(file);
        }
        if (!--remaining) {
            return files;
        }
    }
}

function cleanupDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    let items = fs.readdirSync(dir);

    for (let item of items) {
        item = path.resolve(dir, item)
        let stat = fs.statSync(item);
        if (stat && stat.isDirectory()) {
            cleanupDirectory(item)
        } else {
            fs.unlinkSync(item);
        }
    }

    fs.rmdirSync(dir);
}