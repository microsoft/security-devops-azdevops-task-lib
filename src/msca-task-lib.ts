import * as path from 'path';
import * as process from 'process';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as tl from 'azure-pipelines-task-lib/task';
import { IExecOptions } from "azure-pipelines-task-lib/toolrunner";
import { MscaInstaller } from './msca-installer'
import * as gdnVariables from './msca-variables';

export class MscaClient {
    cliVersion: string = '0.*';

    async setupEnvironment() {

        // Setup Guardian Pipeline variables
        this.setupTaskVariables(taskFolder);

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

    setupTaskVariables(taskDirectory: string) {
        // set up the input environment variables
        process.env.GDN_AGENT_TASKDIRECTORY = taskDirectory;

        const taskFilePath = `${taskDirectory}/task.json`;
        tl.debug(`taskFilePath = ${taskFilePath}`);
        
        const taskFile = require(taskFilePath);

        const taskName = taskFile.name.toUpperCase();
        tl.debug(`taskName = ${taskName}`);

        for (const taskInput of taskFile.inputs) {
            const inputValue = tl.getInput(`${taskInput.name}`);
            if (inputValue != null) {
                const varName = `GDNP_${taskName}_${taskInput.name.toUpperCase()}`;
                const varValue = process.env[varName];
                if (varValue == null) {
                    tl.debug(`Input : ${varName}`);
                    process.env[varName] = inputValue;
                } else {
                    tl.debug(`Override : ${varName}`);
                }
            }
        }
    }

    async init() {

        let cliFilePath: string = process.env.MSCA_FILEPATH;
        tl.debug(`cliFilePath = ${cliFilePath}`);

        try {
            await exec.exec(cliFilePath, ['init', '--force']);
        }
        catch (error) {
            tl.debug(error.Message);
        }
    }

    async run(inputArgs: string[]) {
        try {
            const gdnTaskLibFolder = path.resolve(__dirname);
            tl.debug(`gdnTaskLibFolder = ${__dirname}`);

            const taskFolder = path.dirname(gdnTaskLibFolder);
            tl.debug(`taskFolder = ${taskFolder}`);
            
            let gdnDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_gdn');
            tl.debug(`gdnDirectory = ${gdnDirectory}`);

            await this.setupEnvironment(taskFolder);
            await this.init();
            
            let cliFilePath: string = process.env.MSCA_FILEPATH;
            tl.debug(`cliFilePath = ${cliFilePath}`);

            let args = ['run'];

            if (inputArgs != null)
            {
                for (let i = 0; i < inputArgs.length; i++)
                {
                    args.push(inputArgs[i]);
                }
            }

            args.push('--not-break-on-detections');

            if (tl.isDebug()) {
                args.push('--logger-level');
                args.push('trace');
            }

            let sarifFile : string = path.join(process.env.GITHUB_WORKSPACE, '.gdn', 'msca.sarif');
            tl.debug(`sarifFile = ${sarifFile}`);

            // Write it as a GitHub Action variable for follow up tasks to consume
            tl.exportVariable('MSCA_SARIF_FILE', sarifFile);
            tl.setOutput('sarifFile', sarifFile);

            args.push('--export-breaking-results-to-file');
            args.push(`${sarifFile}`);

            tl.debug('Running Microsoft Security Code Analysis...');

            await exec.exec(cliFilePath, args);
 
        } catch (error) {
            error('Exception occurred while initializing guardian:');
            error(error);
            tl.setResult(tl.TaskResult.Failed, error);
            return;
        }
    }
}