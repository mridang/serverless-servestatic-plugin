/**
 * @file Unit tests for the serverless static plugin deploy hook and its generated CloudFormation resources.
 */
import ServerlessServeStaticPlugin from '../src/index';

type Ctor = ConstructorParameters<typeof ServerlessServeStaticPlugin>;

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
  const serverless = {
    service: {
      service: 'simple-service',
      custom,
      provider: {
        stage: 'dev',
        compiledCloudFormationTemplate: {
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
        },
      },
    },
  };
  const success: string[] = [];
  const logging = { log: { success: (line: string) => success.push(line) } };
  const plugin = new ServerlessServeStaticPlugin(
    serverless as unknown as Ctor[0],
    {} as Ctor[1],
    logging as unknown as Ctor[2],
    {},
  );
  const run = async () => {
    await (
      plugin.hooks[
        'after:aws:package:finalize:mergeCustomProviderResources'
      ] as () => Promise<void>
    )();
    return serverless.service.provider.compiledCloudFormationTemplate
      .Resources as Record<
      string,
      { Type: string; Properties: Record<string, unknown> }
    >;
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
        Code: { ZipFile: expect.any(String) },
      }),
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
