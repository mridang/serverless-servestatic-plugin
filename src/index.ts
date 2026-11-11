/**
 * @file Serverless Framework plugin that provisions an S3 bucket and a custom resource that publishes static assets to it.
 */
import { readFile } from 'node:fs/promises';
import Serverless from 'serverless';

import Plugin, { Logging } from 'serverless/classes/Plugin';

/**
 * Reads the source of the custom resource handler so it can be inlined into the CloudFormation template.
 *
 * The compiled `lambda.js` is preferred, and the TypeScript source `lambda.ts` is used when the package has not been built.
 * @returns A promise that resolves to the handler source as UTF-8 text.
 * @throws {Error} When neither `lambda.js` nor `lambda.ts` can be read.
 * @example
 * ```ts
 * const zipFile = await readLambdaSource();
 * ```
 */
async function readLambdaSource(): Promise<string> {
  try {
    return await readFile(new URL('lambda.js', import.meta.url), 'utf8');
  } catch {
    return readFile(new URL('lambda.ts', import.meta.url), 'utf8');
  }
}

class ServerlessServeStaticPlugin implements Plugin {
  public readonly hooks: Plugin.Hooks = {};
  public readonly name: string = 'serverless-servestatic-plugin';
  private readonly stage: string;

  constructor(
    private readonly serverless: Serverless,
    private readonly options: Serverless.Options,
    private readonly logging: Logging,
    private readonly settings: {
      include?: string[];
      exclude?: string[];
      public?: boolean;
    },
  ) {
    this.hooks = {
      'after:aws:package:finalize:mergeCustomProviderResources':
        this.deployStatic.bind(this),
    };
    this.stage =
      this.serverless.service.provider.stage || this.options.stage || 'dev';
    this.settings = this.serverless.service.custom?.servestatic || {};
  }

  async deployStatic() {
    const zipFile = await readLambdaSource();
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate;

    template.Resources = {
      ...template.Resources,
      ServeStaticAssetsBucket: {
        Type: 'AWS::S3::Bucket',
        DeletionPolicy: 'Retain',
        Properties: {
          BucketEncryption: {
            ServerSideEncryptionConfiguration: [
              {
                ServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'AES256',
                },
              },
            ],
          },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: this.settings.public === false,
            BlockPublicPolicy: this.settings.public === false,
            IgnorePublicAcls: this.settings.public === false,
            RestrictPublicBuckets: this.settings.public === false,
          },
          VersioningConfiguration: {
            Status: 'Enabled',
          },
        },
      },
      ServeStaticLambdaRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          RoleName: `${this.serverless.service.service}-${this.stage}-servestatic-cfn-lambdarole`,
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: 'lambda.amazonaws.com',
                },
                Action: 'sts:AssumeRole',
              },
            ],
          },
          ManagedPolicyArns: [
            'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            'arn:aws:iam::aws:policy/AmazonS3FullAccess',
          ],
        },
      },
      ServeStaticLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: `cfn-servestatic-${this.serverless.service.service}-${this.stage}-resource`,
          Description:
            'A custom resource to deploy the static assets to the static assets bucket',
          Runtime: 'nodejs20.x',
          Architectures: ['arm64'],
          MemorySize: 512,
          Handler: 'index.handler',
          Role: {
            'Fn::GetAtt': ['ServeStaticLambdaRole', 'Arn'],
          },
          Code: {
            ZipFile: zipFile,
          },
          Timeout: 120,
          Layers: [
            'arn:aws:lambda:us-east-1:188628773952:layer:adm-zip-layer:7',
          ],
        },
      },
      ServeStaticAllowCloudfront: {
        Type: 'AWS::CloudFront::OriginAccessControl',
        Properties: {
          OriginAccessControlConfig: {
            Name: `${this.serverless.service.service}-${this.stage}-servestatic-oac`,
            OriginAccessControlOriginType: 's3',
            SigningBehavior: 'always',
            SigningProtocol: 'sigv4',
            Description: {
              'Fn::Sub': 'OAI for S3 bucket ${ServeStaticAssetsBucket}',
            },
          },
        },
      },
      [`StaticAssetsCustomResource`]: {
        Type: 'Custom::UnzipResource',
        Properties: {
          ServiceToken: {
            'Fn::GetAtt': ['ServeStaticLambdaFunction', 'Arn'],
          },
          SourceBucket: { Ref: 'ServerlessDeploymentBucket' },
          SourceKeys: Object.entries(template.Resources)
            .filter(([, resource]) => resource.Type === 'AWS::Lambda::Function')
            .filter(
              ([, resource]) =>
                resource.Properties?.Code?.S3Bucket?.Ref ===
                'ServerlessDeploymentBucket',
            )
            .map(([, resource]) => resource.Properties.Code.S3Key)
            .reduce((acc: string[], key: string) => {
              if (!acc.includes(key)) {
                acc.push(key);
              }
              return acc;
            }, [] satisfies string[]),
          DestinationBucket: {
            Ref: 'ServeStaticAssetsBucket',
          },
          IncludePatterns: this.settings.include || [],
          ExcludePatterns: this.settings.exclude || [],
        },
      },
    };

    this.logging.log.success('Added configuration to deploy static assets');
  }
}

export default ServerlessServeStaticPlugin;
