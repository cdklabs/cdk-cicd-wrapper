# Working with Python dependencies

The project utilizes the [Pipenv](https://pipenv.pypa.io/en/latest/). Pipenv automatically creates and manages a virtual enviornment for your projects, as well as adds/removes packages from your `Pipfile` as you install/uninstall packages. It also generates a project `Pipfile.lock`, which is used to produce deterministic builds.

The Python dependencies are maintained in `Pipfile` instead of the `requirements.txt` file and requirements.txt files should not be committed into Git.

## How to install Pipenv

The recommended approach is to use `pip install pipenv -U` command. More information can be found [here](https://pipenv.pypa.io/en/latest/installation/#installing-pipenv).

The `pipenv` command is not added to the $PATH by default that need to be done manually. The `pipenv` command location can be determined by executing:

```bash
python3 -m site --user-base
```

This will return a value like `/Users/user/Library/Python/3.11`. Then the $PATH needs to be extended with the `/Users/user/Library/Python/3.11/bin`.

```bash
export PATH="${PATH}:/Users/user/Library/Python/3.11/bin";
```

You can add this your `$HOME/.zshrc` or `$HOME/.bashrc` to have this folder permanently.

## Migrating existing `requirements.txt`

Existing `requirements.txt` can be transformed into a `Pipfile` with the `pipenv install` command:

```bash
cd path-to-the-module
pipenv install -r requirements.txt && pipenv lock
```

`Pipfile` has to be created where the `requirements.txt` would be created. That folder will be considered as a Python module.

## Installing a new dependency

The `pipenv` command install api is identical as the `pip` commands.

```bash
pipenv install <dependency>
```

## Updating lock file

The `Pipfile.lock` can be updated with the `pipenv lock` command.

## Installing dependencies based on the `Pipfile.lock`

The locked dependencies can be installed with the locked version with the `pipenv sync` command.
