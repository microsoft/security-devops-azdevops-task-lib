import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import { MscaInstaller } from './msca-installer'

export class MscaClient {
    cliVersion: string = '0.*';

    async setupEnvironment() {
        
        // prevent welcome message
        process.env.DOTNET_NOLOGO = 'true';

        console.log('------------------------------------------------------------------------------');

        if (!process.env.MSCA_FILEPATH) {
            let cliVersion = this.resolveCliVersion();
            let mscaInstaller = new MscaInstaller();
            await mscaInstaller.install(cliVersion);
        }

        console.log('------------------------------------------------------------------------------');
    }

    resolveCliVersion() : string {
        let cliVersion = this.cliVersion;

        if (process.env.MSCA_VERSION) {
            cliVersion = process.env.MSCA_VERSION;
        }

        return cliVersion;
    }

    isNullOrWhiteSpace(value: string) : boolean {
        return !value || !value.trim();
    }


    getCliFilePath() : string {
        let cliFilePath: string = process.env.MSCA_FILEPATH;
        tl.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }

    async init() {
        try {
            let cliFilePath = this.getCliFilePath();
            let tool = tl.tool(cliFilePath).arg('init').arg('--force');
            await tool.exec();
        }
        catch (error) {
            tl.debug(error);
        }
    }

    async run(args: string[], successfulExitCodes: number[] = null) {
        let tool = null;

        try {
            if (successfulExitCodes == null) {
                successfulExitCodes = [0];
            }

            await this.setupEnvironment();
            await this.init();
            
            let cliFilePath = this.getCliFilePath();

            tool = tl.tool(cliFilePath).arg('run');

            if (args != null) {
                for (let i = 0; i < args.length; i++) {
                    tool.arg(args[i]);
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

            let sarifFile : string = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msca.sarif');
            tl.debug(`sarifFile = ${sarifFile}`);

            // Write it as a GitHub Action variable for follow up tasks to consume
            tl.setVariable('MSCA_SARIF_FILE', sarifFile);

            args.push('--export-breaking-results-to-file');
            args.push(`${sarifFile}`);
        } catch (error) {
            error('Exception occurred while initializing MSCA:');
            error(error);
            tl.setResult(tl.TaskResult.Failed, error);
            return;
        }

        try {
            // let us parse the exit code
            let options: IExecOptions = <IExecOptions>{
                ignoreReturnCode: true
            };

            tl.debug('Running Microsoft Security Code Analysis...');

            let exitCode = await tool.exec(options);

            let success = false;
            for (let i = 0; i < successfulExitCodes.length; i++) {
                if (exitCode == successfulExitCodes[i]) {
                    success = true;
                    break;
                }
            }

            if (!success) {
                throw `MSCA CLI exited with an error exit code: ${exitCode}`;
            }
        } catch (error) {
            error(error);
            tl.setResult(tl.TaskResult.Failed, error);
        }
    }
}