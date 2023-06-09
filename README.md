# Microsoft Security DevOps AzDevOps Task Library

An Azure DevOps javascript library for running the [Microsoft Security DevOps CLI](https://aka.ms/msdo-nuget).

## Leveraged By
* Microsoft Security DevOps Azure DevOps Extension [code](https://github.com/microsoft/security-devops-azdevops) - [marketplace](https://marketplace.visualstudio.com/items?itemName=ms-securitydevops.microsoft-security-devops-azdevops)

## Related

* [Microsoft Security DevOps Toolkit for GitHub Actions](https://github.com/microsoft/security-devops-actions-toolkit)

## Build

### Preqrequisities:

* Install [dotnet](https://dotnet.microsoft.com/en-us/)
* install [node.js](https://nodejs.org/en) (for npm)

To build, run:
```powershell
dotnet build ./build.proj [/p:NpmInstall=true|false]
```

The build:
1. If `NpmInstall` is true, runs `npm install` at the root of the repo
1. Compiles the typescript in the `./src` directory
1. Outputs javascript to the `./lib` directory
1. Copies the `./package.json` file to the `./lib` folder

## Publish

This package is hosted on [this repo's package feed](https://github.com/microsoft/security-devops-azdevops-task-lib/pkgs/npm/security-devops-azdevops-task-lib).

To publish a build, please see ["Working with the npm registry"](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
