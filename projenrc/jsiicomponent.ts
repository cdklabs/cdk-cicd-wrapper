import { yarn } from 'cdklabs-projen-project-types';
import * as pj from 'projen';

export class JSIIComponent extends pj.Component {
  readonly packageAllTask: pj.Task;
  private readonly publisher?: pj.release.Publisher;

  private JSII_TOOLCHAIN: Record<string, pj.github.workflows.Tools> = {
    js: {},
    python: { python: { version: '3.x' } },
  };

  constructor(
    readonly project: pj.typescript.TypeScriptProject,
    options: Partial<pj.cdk.JsiiProjectOptions>,
  ) {
    super(project);

    if (project instanceof yarn.TypeScriptWorkspace) {
      // TODO contribute this back
      this.publisher = yarn.MonorepoRelease.of(project.parent!)!['packagesToRelease'].find(
        (element: any) => element['workspaceDirectory'] === project.workspaceDirectory,
      )['release']['publisher'];
    } else {
      this.publisher = project.release?.publisher;
    }

    const srcdir = project.srcdir;
    const libdir = project.libdir;
    project.addFields({ types: `${libdir}/index.d.ts` });

    project.addFields({ types: `${libdir}/index.d.ts` });

    const compressAssembly = false;
    const compatIgnore = '.compatignore';

    // this is an unhelpful warning
    const jsiiFlags = ['--silence-warnings=reserved-word'];
    if (compressAssembly) {
      jsiiFlags.push('--compress-assembly');
    }

    project.addFields({ stability: 'stable' });

    project.addTask('compat', {
      description: 'Perform API compatibility check against latest version',
      exec: `jsii-diff npm:$(node -p "require(\'./package.json\').name") -k --ignore-file ${compatIgnore} || (echo "\nUNEXPECTED BREAKING CHANGES: add keys such as \'removed:constructs.Node.of\' to ${compatIgnore} to skip.\n" && exit 1)`,
    });

    project.compileTask.reset(['jsii', ...jsiiFlags].join(' '));
    project.watchTask.reset(['jsii', '-w', ...jsiiFlags].join(' '));
    this.packageAllTask = project.addTask('package-all', {
      description: 'Packages artifacts for all target languages',
    });
    project.packageTask.reset();
    project.packageTask.spawn(this.packageAllTask);

    const targets: Record<string, any> = {};

    const jsii: any = {
      outdir: project.artifactsDirectory,
      targets,
      tsc: {
        outDir: libdir,
        rootDir: srcdir,
      },
    };

    project.addFields({ jsii });

    const extraJobOptions: Partial<pj.github.workflows.Job> = {
      ...this.getJobRunsOnConfig(options),
      ...(options.workflowContainerImage ? { container: { image: options.workflowContainerImage } } : {}),
    };

    // NPM
    const task = this.addPackagingTask('js');
    this.publisher?.publishToNpm({
      ...this.pacmakForLanguage('js', task),
      registry: this.project.package.npmRegistry,
      npmTokenSecret: this.project.package.npmTokenSecret,
      npmProvenance: this.project.package.npmProvenance,
    });
    this.addPackagingTarget('js', task, extraJobOptions);

    if (options.publishToMaven) {
      targets.java = {
        package: options.publishToMaven.javaPackage,
        maven: {
          groupId: options.publishToMaven.mavenGroupId,
          artifactId: options.publishToMaven.mavenArtifactId,
        },
      };

      const task = this.addPackagingTask('java');

      this.publisher?.publishToMaven({
        ...this.pacmakForLanguage('java', task),
        ...options.publishToMaven,
      });

      this.addPackagingTarget('java', task, extraJobOptions);
    }

    const pypi = options.publishToPypi ?? options.python;
    if (pypi) {
      targets.python = {
        distName: pypi.distName,
        module: pypi.module,
      };

      const task = this.addPackagingTask('python');
      this.publisher?.publishToPyPi({
        ...this.pacmakForLanguage('python', task),
        ...pypi,
      });

      this.addPackagingTarget('python', task, extraJobOptions);
    }

    const nuget = options.publishToNuget ?? options.dotnet;
    if (nuget) {
      targets.dotnet = {
        namespace: nuget.dotNetNamespace,
        packageId: nuget.packageId,
        iconUrl: nuget.iconUrl,
      };

      const task = this.addPackagingTask('dotnet');
      this.publisher?.publishToNuget({
        ...this.pacmakForLanguage('dotnet', task),
        ...nuget,
      });

      this.addPackagingTarget('dotnet', task, extraJobOptions);
    }

    const golang = options.publishToGo;
    if (golang) {
      targets.go = {
        moduleName: golang.moduleName,
        packageName: golang.packageName,
      };

      const task = this.addPackagingTask('go');
      this.publisher?.publishToGo({
        ...this.pacmakForLanguage('go', task),
        ...golang,
      });

      this.addPackagingTarget('go', task, extraJobOptions);
    }

    const jsiiSuffix =
      options.jsiiVersion === '*'
        ? // If jsiiVersion is "*", don't specify anything so the user can manage.
          ''
        : // Otherwise, use `jsiiVersion` or fall back to `1.x`.
          `@${options.jsiiVersion ?? '~5.4.0'}`;
    this.project.addDevDeps(`jsii${jsiiSuffix}`, `jsii-rosetta${jsiiSuffix}`, 'jsii-diff', 'jsii-pacmak');

    this.project.gitignore.exclude('.jsii', 'tsconfig.json');
    this.project.npmignore?.include('.jsii');

    if (this.project.npmignore) {
      this.project.npmignore.readonly = false;
    }
  }

  private addPackagingTask(language: string): pj.Task {
    const packageTask = this.project.tasks.addTask(`package:${language}`, {
      description: `Create ${language} language bindings`,
    });
    const commandParts = ['jsii-pacmak', '-v'];

    commandParts.push(`--target ${language}`);

    packageTask.exec(commandParts.join(' '));

    this.packageAllTask.spawn(packageTask);
    return packageTask;
  }

  private pacmakForLanguage(target: string, _: pj.Task): pj.release.CommonPublishOptions {
    // at this stage, `artifactsDirectory` contains the prebuilt repository.
    // for the publishing to work seamlessely, that directory needs to contain the actual artifact.
    // so we move the repo, create the artifact, and put it in the expected place.
    const prePublishSteps: Array<pj.github.workflows.Step> = [];

    // prePublishSteps.push(...this.project.workflowBootstrapSteps);

    // prePublishSteps.push(
    //   {
    //     name: 'Prepare Repository',
    //     run: `mv ${this.project.artifactsDirectory} ${this.repoTmpDirectory}`,
    //   },
    //   {
    //     name: 'Install Dependencies',
    //     run: `cd ${this.repoTmpDirectory} && ${this.project.package.installCommand}`,
    //   },
    //   {
    //     name: `Create ${target} artifact`,
    //     run: `cd ${this.repoTmpDirectory} && npx projen ${packTask.name}`,
    //   },
    //   {
    //     name: `Collect ${target} Artifact`,
    //     run: `mv ${this.repoTmpDirectory}/${this.project.artifactsDirectory} ${this.project.artifactsDirectory}`,
    //   },
    // );
    return {
      publishTools: this.JSII_TOOLCHAIN[target],
      prePublishSteps,
    };
  }

  /**
   * Generates the runs-on config for Jobs.
   * Throws error if 'runsOn' and 'runsOnGroup' are both set.
   *
   * @param options - 'runsOn' or 'runsOnGroup'.
   */
  private getJobRunsOnConfig(options: Partial<pj.cdk.JsiiProjectOptions>) {
    return options.workflowRunsOnGroup
      ? { runsOnGroup: options.workflowRunsOnGroup }
      : options.workflowRunsOn
        ? { runsOn: options.workflowRunsOn }
        : {};
  }

  /**
   * Adds a target language to the build workflow and creates a package task.
   * @param language
   * @returns
   */
  private addPackagingTarget(language: string, packTask: pj.Task, extraJobOptions: Partial<pj.github.workflows.Job>) {
    const pacmak = this.pacmakForLanguage(language, packTask);

    this.project.buildWorkflow?.addPostBuildJob(`package-${language}`, {
      ...pj.filteredRunsOnOptions(extraJobOptions.runsOn, extraJobOptions.runsOnGroup),
      permissions: {},
      tools: {
        node: { version: '18.x' },
        ...pacmak.publishTools,
      },
      steps: pacmak.prePublishSteps ?? [],
      ...extraJobOptions,
    });
  }
}
