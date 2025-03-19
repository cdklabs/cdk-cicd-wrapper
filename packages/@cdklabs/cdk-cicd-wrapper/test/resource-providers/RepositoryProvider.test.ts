import * as s3 from 'aws-cdk-lib/aws-s3';
import {
  CIDefinitionProvider,
  CodeBuildFactoryProvider,
  ParameterProvider,
  PhaseCommandProvider,
  VPCProvider,
} from '../../src';
import { GlobalResources, RepositoryType, Stage } from '../../src/common';
import {
  BasicRepositoryProvider,
  CodeCommitRepositorySource,
  CodeStarConnectionRepositorySource,
  RepositorySource,
  S3RepositorySource,
} from '../../src/resource-providers/RepositoryProvider';
import { TestContext } from '../TestConfig';

describe('RepositoryProvider', () => {
  describe('BasicRepositoryProvider', () => {
    test('provides repository stack based on configuration', () => {
      // Arrange
      const provider = new BasicRepositoryProvider({
        name: 'test-repo',
        branch: 'main',
        repositoryType: 'CODECOMMIT',
      });
      const context = TestContext(
        {},
        {
          [GlobalResources.CODEBUILD_FACTORY]: new CodeBuildFactoryProvider(),
          [GlobalResources.PARAMETER_STORE]: new ParameterProvider(),
          [GlobalResources.VPC]: new VPCProvider(),
          [GlobalResources.PHASE]: new PhaseCommandProvider(),
          [GlobalResources.CI_DEFINITION]: new CIDefinitionProvider(),
        },
      );
      context.initStage(Stage.RES);

      // Act
      const result = provider.provide(context);

      // Assert
      expect(result).toBeDefined();
    });

    test('uses repository source from blueprint props if provided', () => {
      // Arrange
      const mockSource = {
        produceSourceConfig: jest.fn().mockReturnValue({}),
      };
      const context = TestContext({
        repositorySource: mockSource as any,
      });
      context.initStage(Stage.RES);
      const provider = new BasicRepositoryProvider();

      // Act
      provider.provide(context);

      // Assert
      expect(mockSource.produceSourceConfig).toHaveBeenCalledWith(context);
    });
  });

  describe('RepositorySource', () => {
    test('codecommit creates CodeCommitRepositorySource', () => {
      const source = RepositorySource.codecommit({
        repositoryName: 'test-repo',
        branch: 'main',
      });
      expect(source).toBeInstanceOf(CodeCommitRepositorySource);
      expect(source).toHaveProperty('options', { branch: 'main', repositoryName: 'test-repo' });
    });

    test('codestarConnection creates CodeStarConnectionRepositorySource', () => {
      const source = RepositorySource.codestarConnection({
        repositoryName: 'test-repo',
        branch: 'main',
      });
      expect(source).toBeInstanceOf(CodeStarConnectionRepositorySource);
    });

    test('github creates CodeStarConnectionRepositorySource', () => {
      const source = RepositorySource.github({
        repositoryName: 'test-repo',
        branch: 'main',
      });
      expect(source).toBeInstanceOf(CodeStarConnectionRepositorySource);
    });

    test('s3 creates S3RepositorySource', () => {
      const source = RepositorySource.s3({
        bucketName: 'test-bucket',
      });
      expect(source).toBeInstanceOf(S3RepositorySource);
    });

    test('basedType throws error for unsupported repository type', () => {
      expect(() => {
        RepositorySource.basedType('INVALID' as RepositoryType);
      }).toThrow('Unsupported repository type: INVALID');
    });
  });

  describe('CodeCommitRepositorySource', () => {
    test('produces source config with pull request checks enabled', () => {
      // Arrange
      const context = TestContext(
        {},
        {
          [GlobalResources.CODEBUILD_FACTORY]: new CodeBuildFactoryProvider(),
          [GlobalResources.PARAMETER_STORE]: new ParameterProvider(),
          [GlobalResources.VPC]: new VPCProvider(),
          [GlobalResources.PHASE]: new PhaseCommandProvider(),
          [GlobalResources.CI_DEFINITION]: new CIDefinitionProvider(),
        },
      );
      context.initStage(Stage.RES);
      const source = new CodeCommitRepositorySource({
        repositoryName: 'test-repo',
        branch: 'main',
        enablePullRequestChecks: true,
      });

      // Act
      const result = source.produceSourceConfig(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.repositoryBranch).toBe('main');
      expect(result.pipelineInput).toBeDefined();
    });

    test('produces source config with pull request checks disabled', () => {
      // Arrange
      const context = TestContext();
      context.initStage(Stage.RES);
      const source = new CodeCommitRepositorySource({
        repositoryName: 'test-repo',
        branch: 'develop',
        enablePullRequestChecks: false,
      });

      // Act
      const result = source.produceSourceConfig(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.repositoryBranch).toBe('develop');
    });
  });

  describe('CodeStarConnectionRepositorySource', () => {
    test('throws error if connection ARN is not provided', () => {
      // Arrange
      const context = TestContext();
      context.initStage(Stage.RES);
      const source = new CodeStarConnectionRepositorySource();

      // Act & Assert
      expect(() => {
        source.produceSourceConfig(context);
      }).toThrow('CodeStarConnectionArn is required');
    });

    test('produces source config with provided connection ARN', () => {
      // Arrange
      const context = TestContext();
      context.initStage(Stage.RES);
      const source = new CodeStarConnectionRepositorySource({
        codeStarConnectionArn: 'arn:aws:codestar-connections:us-west-2:123456789012:connection/abcdef',
        repositoryName: 'my/test-repo',
        branch: 'main',
      });

      // Act
      const result = source.produceSourceConfig(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.repositoryBranch).toBe('main');
    });
  });

  describe('S3RepositorySource', () => {
    test('produces source config with generated bucket name', () => {
      // Arrange
      const context = TestContext();
      context.initStage(Stage.RES);
      const source = new S3RepositorySource();

      // Act
      const result = source.produceSourceConfig(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.repositoryBranch).toBe('main');
      expect(((result.pipelineInput as any).bucket as s3.Bucket).encryptionKey).toBeDefined();
    });

    test('produces source config with provided bucket name and prefix', () => {
      // Arrange
      const context = TestContext();
      context.initStage(Stage.RES);
      const source = new S3RepositorySource({
        bucketName: 'test-bucket',
        prefix: 'test-prefix',
        branch: 'develop',
      });

      // Act
      const result = source.produceSourceConfig(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.repositoryBranch).toBe('develop');
    });
  });
});
