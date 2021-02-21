"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const tl = __importStar(require("azure-pipelines-task-lib/task"));
const msca_installer_1 = require("./msca-installer");
class MscaClient {
    constructor() {
        this.cliVersion = '0.*';
    }
    setupEnvironment() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('------------------------------------------------------------------------------');
            if (!process.env.MSCA_FILEPATH) {
                let cliVersion = this.resolveCliVersion();
                let mscaInstaller = new msca_installer_1.MscaInstaller();
                yield mscaInstaller.install(cliVersion);
            }
            console.log('------------------------------------------------------------------------------');
        });
    }
    resolveCliVersion() {
        let cliVersion = this.cliVersion;
        if (process.env.MSCA_VERSION) {
            cliVersion = process.env.MSCA_VERSION;
        }
        return cliVersion;
    }
    isNullOrWhiteSpace(value) {
        return !value || !value.trim();
    }
    getCliFilePath() {
        let cliFilePath = process.env.MSCA_FILEPATH;
        tl.debug(`cliFilePath = ${cliFilePath}`);
        return cliFilePath;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let cliFilePath = this.getCliFilePath();
                let tool = tl.tool(cliFilePath).arg('init').arg('--force');
                yield tool.exec();
            }
            catch (error) {
                tl.debug(error);
            }
        });
    }
    run(args, successfulExitCodes = null) {
        return __awaiter(this, void 0, void 0, function* () {
            let tool = null;
            try {
                if (successfulExitCodes == null) {
                    successfulExitCodes = [0];
                }
                yield this.setupEnvironment();
                yield this.init();
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
                let sarifFile = path.join(process.env.BUILD_STAGINGDIRECTORY, '.gdn', 'msca.sarif');
                tl.debug(`sarifFile = ${sarifFile}`);
                tl.setVariable('MSCA_SARIF_FILE', sarifFile);
                args.push('--export-breaking-results-to-file');
                args.push(`${sarifFile}`);
            }
            catch (error) {
                error('Exception occurred while initializing MSCA:');
                error(error);
                tl.setResult(tl.TaskResult.Failed, error);
                return;
            }
            try {
                let options = {
                    ignoreReturnCode: true
                };
                tl.debug('Running Microsoft Security Code Analysis...');
                let exitCode = yield tool.exec(options);
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
            }
            catch (error) {
                error(error);
                tl.setResult(tl.TaskResult.Failed, error);
            }
        });
    }
}
exports.MscaClient = MscaClient;
