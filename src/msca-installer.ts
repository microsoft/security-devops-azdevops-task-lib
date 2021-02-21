import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as tl from 'azure-pipelines-task-lib/task';

export class MscaInstaller {

    async install(cliVersion: string) {
        console.log('Installing Microsoft Security Code Analysis Cli...');

        if (process.env.MSCA_FILEPATH) {
            console.log(`MSCA CLI File Path overriden by %MSCA_FILEPATH%: ${process.env.MSCA_FILEPATH}`);
            return;
        }

        if (process.env.MSCA_DIRECTORY) {
            console.log(`MSCA CLI Directory overriden by %MSCA_DIRECTORY%: ${process.env.MSCA_DIRECTORY}`);

            // Set the msca file path
            let mscaFilePath = path.join(process.env.MSCA_DIRECTORY, 'guardian');
            tl.debug(`mscaFilePath = ${mscaFilePath}`);

            process.env.MSCA_FILEPATH = mscaFilePath;
            return;
        }

        // initialize the _msca directory
        let mscaDirectory = path.join(process.env.AGENT_ROOTDIRECTORY, '_msca');
        tl.debug(`mscaDirectory = ${mscaDirectory}`);
        this.ensureDirectory(mscaDirectory);

        let mscaPackagesDirectory = path.join(mscaDirectory, 'versions');
        tl.debug(`mscaPackagesDirectory = ${mscaPackagesDirectory}`);
        this.ensureDirectory(mscaPackagesDirectory);

        let mscaVersionsDirectory = path.join(mscaPackagesDirectory, 'microsoft.security.codeanalysis.cli');
        tl.debug(`mscaVersionsDirectory = ${mscaVersionsDirectory}`);

        if (this.isInstalled(mscaVersionsDirectory, cliVersion)) {
            return;
        }

        let failed = false;
        let attempts = 0;
        let maxAttempts = 2;

        do {
            try {
                failed = false;

                const mscaTaskLibDirectory = path.resolve(__dirname);
                tl.debug(`mscaTaskLibDirectory = ${mscaTaskLibDirectory}`);

                const mscaProjectFile = path.join(mscaTaskLibDirectory, 'msca-task-lib.proj');
                tl.debug(`mscaProjectFile = ${mscaProjectFile}`);

                let tool = tl.tool('dotnet')
                    .arg('restore')
                    .arg(mscaProjectFile)
                    .arg(`/p:MscaPackageVersion=${cliVersion}`)
                    .arg('--packages')
                    .arg(mscaPackagesDirectory)
                    .arg('--source')
                    .arg('https://api.nuget.org/v3/index.json');

                await tool.exec();
            } catch (error) {
                tl.debug(error);
                failed = true;
                attempts += 1;
                if (attempts > maxAttempts) {
                    break;
                }
            }
        } while (failed);

        this.resolvePackageDirectory(mscaVersionsDirectory, cliVersion);
    }

    ensureDirectory(directory: string) : void {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }
    }

    isInstalled(versionsDirectory: string, cliVersion: string) : boolean {
        let installed = false;

        if (cliVersion.includes("*")) {
            tl.debug(`MSCA CLI version contains a latest quantifier: ${cliVersion}. Continuing with install...`);
            return installed;
        }

        this.setVariablesWithVersion(versionsDirectory, cliVersion);
        
        if (fs.existsSync(process.env.MSCA_DIRECTORY)) {
            console.log(`MSCA CLI v${cliVersion} already installed.`);
            installed = true;
        }

        return installed;
    }

    resolvePackageDirectory(
        versionDirectory: string,
        cliVersion: string) : void {
        if (cliVersion.includes("*")) {
            // find the latest directory
            let packageDirectory = this.findLatestVersionDirectory(versionDirectory);
            this.setVariables(packageDirectory);
        } else {
            this.setVariablesWithVersion(versionDirectory, cliVersion);
        }

        if (!fs.existsSync(process.env.MSCA_DIRECTORY)) {
            throw `MSCA CLI v${cliVersion} was not found after installation.`
        }
    }

    findLatestVersionDirectory(versionsDirectory: string, isPreRelease: boolean = false) : string {

        let latestDirectory = null;
        let latestVersionParts = null;
        let latestIsPreRelease = false;
        let latestPreReleaseFlag = null;

        // Get all of the directories in the versions directory
        tl.debug(`Searching for all version folders in: ${versionsDirectory}`);
        let dirs = this.getDirectories(versionsDirectory);

        // Evaluate each directory
        for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
            let dir = dirs[dirIndex];

            if (dir == null || dir == "") {
                tl.debug(`Skipping null or empty directory: ${dir}`);
                continue;
            }

            tl.debug(`Evaluating MSCA directory: ${dir}`);
            // If we reuse the same RegExp object, it will return null every other call
            const dirRegex = new RegExp(/^(\d+\.?){1,6}(\-\w+)?$/g);
            if (dirRegex.exec(dir) == null) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
                continue;
            }

            let fullVersionParts = dir.split("-");

            if (fullVersionParts == null || fullVersionParts.length < 0 || fullVersionParts.length > 2) {
                tl.debug(`Skipping invalid version directory: ${dir}`);
            }

            let dirIsPreRelease = fullVersionParts.length > 1;

            if (!isPreRelease && dirIsPreRelease) {
                tl.debug(`Skipping pre-release version directory: ${dir}`);
                continue;
            }

            let dirPreReleaseFlag = null;
            if (dirIsPreRelease) {
                dirPreReleaseFlag = fullVersionParts[1];
            }

            let versionNumbersString = fullVersionParts[0];

            let versionParts = dir.split(".");

            // If the latestDirectory isn't set yet, the folder is the latest directory
            let isLatest = latestDirectory == null;

            if (!isLatest) {
                // Evaluate the directory's version against the latest directory

                // Handle comparisions of separate level versions
                // Some packages exclude Patch or include Revisions up to two levels (Rev1 and Rev2)
                let maxVersionParts = versionParts.length;
                if (latestVersionParts.length > maxVersionParts) {
                    maxVersionParts = latestVersionParts.length;
                }

                for (let versionPartIndex = 0; versionPartIndex < versionParts.length; versionPartIndex++) {
                    let versionPart = 0;
                    let latestVersionPart = 0;

                    let isLastVersionPart = versionPartIndex == (maxVersionParts - 1);

                    if (versionPartIndex < versionParts.length) {
                        versionPart = parseInt(versionParts[versionPartIndex]);
                    }

                    if (versionPartIndex < latestVersionParts.length) {
                        latestVersionPart = parseInt(latestVersionParts[versionPartIndex]);
                    }

                    if (versionPart > latestVersionPart) {
                        isLatest = true;
                    } else if (versionPart == latestVersionPart) {
                        isLatest = isLastVersionPart
                            &&
                            (
                                (isPreRelease && latestIsPreRelease && dirPreReleaseFlag > latestPreReleaseFlag)
                                ||
                                (!isPreRelease && latestIsPreRelease)
                            );
                    } else {
                        // Current version is less than latest found
                        break;
                    }

                    if (isLatest) {
                        break;
                    }
                }
            }

            if (isLatest) {
                tl.debug(`Setting latest version directory: ${dir}`);
                latestDirectory = path.join(versionsDirectory, dir);
                latestVersionParts = versionParts;
                latestIsPreRelease = dirIsPreRelease;
                latestPreReleaseFlag = dirPreReleaseFlag;
            }
        }

        tl.debug(`latestDirectory = ${latestDirectory}`);

        return latestDirectory;
    }

    getDirectories(directory: string) : string[] {
        // read the directory for all paths
        // filter for directories
        return fs.readdirSync(directory).filter(p => this.isDirectory(directory, p));
    }

    isDirectory(directory: string, p: string) : boolean {
        // statSync follows symlinks
        return fs.statSync(path.join(directory, p)).isDirectory();
    }

    setVariablesWithVersion(versionDirectory: string, cliVersion: string) : void {
        let packageDirectory = path.join(versionDirectory, cliVersion)
        tl.debug(`packageDirectory = ${packageDirectory}`);

        this.setVariables(packageDirectory);
    }

    setVariables(packageDirectory: string) : void {
        let mscaDirectory = path.join(packageDirectory, 'tools');
        tl.debug(`mscaDirectory = ${mscaDirectory}`);

        let mscaFilePath = path.join(mscaDirectory, 'guardian');
        tl.debug(`mscaFilePath = ${mscaFilePath}`);

        process.env.MSCA_DIRECTORY = mscaDirectory;
        process.env.MSCA_FILEPATH = mscaFilePath;
    }
}