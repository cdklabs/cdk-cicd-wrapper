# License Management

The `npx {{npm_cli}} license` can validate and generate a NOTICE file for the project.

The NOTICE file consistency is tested by the `npx {{npm_cli}} license`, this script is included into the CodePipeline Build step to ensure the NOTICE file is always up-to-date.

The script checks dependencies in `package.json` for NPM, `Pipfile.lock`, and `requirements.txt` for Python projects. In case, you are using other package managers, you need to manage those dependencies by **yourself** as long as that is not supported by {{ project_name }}.

The used dependencies can be dependent on the Operating System and the runtime environment so for this reason the generated NOTICE file could be different based on which environment is generated. Our tool persists the state of the project files which hold information about 3rd party dependencies in the `package-verification.json` file. If those files are not modified or a new file hasn't been added or previously existing files haven't been removed the tool considers the NOTICE file as up to date. In this situation you want to forcefully regenerate the NOTICE file you can do that with the `--force` parameter.

To update the NOTICE file you need to run the following command:

```bash
npx {{npm_cli}} license --fix
```

## Configuration options

The script configuration can be specified in the `licensecheck.json` file.

Example configuration:

```json
{
  "failOnLicenses": ["MIT License"],
  "npm": {
    "excluded": [],
    "excludedSubProjects": ["./example/package.json"]
  },
  "python": {
    "excluded": [],
    "excludedSubProjects": ["./example/Pipfile"]
  }
}
```

- Banned licenses can be listed on the `failOnLicenses` attribute. The license name match is case sensitive.
- Sub folder which `Pipfile` or `package.json` file should not be included into the License check should be listen under the `npm.excludedSubProjects` or `python.excludedSubProjects` attributes.
- For NPM packages the subfolder also needs to contain a package-lock.json file to ensure the right dependencies will be installed and checked.
- Dependencies can be excluded from the license verification for NPM and Python as well.
