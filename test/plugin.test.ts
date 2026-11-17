/**
 * @file Unit tests for the serverless static plugin deploy hook and its generated CloudFormation resources.
 */
import ServerlessServeStaticPlugin from '../src/index.js';
import type Plugin from 'serverless/classes/Plugin';

type Ctor = ConstructorParameters<typeof ServerlessServeStaticPlugin>;

interface CompiledTemplate {
  Resources: Record<
    string,
    { Type: string; Properties: Record<string, unknown> }
  >;
}

/**
 * Builds a plugin instance backed by an in-memory Serverless service with two Lambda functions.
 * @param custom - The optional `custom` block of the service, such as the `servestatic` settings.
 * @returns The `run` function that executes the deploy hook and resolves the generated resources, and the messages logged during the run.
 * @example
 * ```ts
 * const { run, success } = createPlugin({ servestatic: { public: false } });
 * const resources = await run();
 * ```
 */
function createPlugin(custom?: Record<string, unknown>) {
  const noop = () => undefined;
  const progress: Plugin.Progress = {
    namespace: 'test',
    name: 'test',
    update: noop,
    info: noop,
    notice: noop,
    remove: noop,
  };
  const template: CompiledTemplate = {
    Resources: {
      FooLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'serverless/foo.zip',
          },
        },
      },
      BarLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
            S3Key: 'serverless/foo.zip',
          },
        },
      },
    },
  };
  const serverless = {
    service: {
      service: 'simple-service',
      custom,
      provider: {
        stage: 'dev',
        compiledCloudFormationTemplate: template,
      },
    },
  };
  const success: string[] = [];
  const logging: Plugin.Logging = {
    log: {
      error: noop,
      warning: noop,
      notice: noop,
      info: noop,
      debug: noop,
      verbose: noop,
      success: (line: unknown) => success.push(String(line)),
    },
    writeText: noop,
    progress: { get: () => progress, create: () => progress },
  };
  const plugin = new ServerlessServeStaticPlugin(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- a full Serverless instance needs a real service load; the plugin reads only the service name, custom section and provider
    serverless as unknown as Ctor[0],
    {},
    logging,
    {},
  );
  const run = async () => {
    await plugin.hooks[
      'after:aws:package:finalize:mergeCustomProviderResources'
    ]();
    return template.Resources;
  };
  return { run, success };
}

describe('plugin tests', () => {
  it('should add the static assets resources with the defaults', async () => {
    const { run, success } = createPlugin();

    const resources = await run();

    expect(resources.ServeStaticAssetsBucket.Type).toBe('AWS::S3::Bucket');
    expect(resources.ServeStaticAssetsBucket.Properties).toEqual(
      expect.objectContaining({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          BlockPublicPolicy: false,
          IgnorePublicAcls: false,
          RestrictPublicBuckets: false,
        },
      }),
    );
    expect(resources.ServeStaticLambdaFunction.Properties).toEqual(
      expect.objectContaining({
        FunctionName: 'cfn-servestatic-simple-service-dev-resource',
      }),
    );
    expect(resources.ServeStaticLambdaFunction.Properties.Code).toHaveProperty(
      'ZipFile',
      expect.any(String),
    );
    expect(resources.StaticAssetsCustomResource.Properties).toEqual(
      expect.objectContaining({
        SourceKeys: ['serverless/foo.zip'],
        DestinationBucket: { Ref: 'ServeStaticAssetsBucket' },
        IncludePatterns: [],
        ExcludePatterns: [],
      }),
    );
    expect(success).toEqual(['Added configuration to deploy static assets']);
  });

  it('should handle the supplied configuration', async () => {
    const { run } = createPlugin({
      servestatic: {
        include: ['public/**/*'],
        exclude: ['**/*'],
        public: false,
      },
    });

    const resources = await run();

    expect(resources.ServeStaticAssetsBucket.Properties).toEqual(
      expect.objectContaining({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
    expect(resources.StaticAssetsCustomResource.Properties).toEqual(
      expect.objectContaining({
        IncludePatterns: ['public/**/*'],
        ExcludePatterns: ['**/*'],
      }),
    );
  });
});
