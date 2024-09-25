import runServerless from '@serverless/test/run-serverless';
import path from 'path';
// @ts-expect-error since the types are missing
import logEmitter from 'log/lib/emitter.js';
import * as fs from 'node:fs';

const logsBuffer: string[] = [];
logEmitter.on(
  'log',
  (event: { logger: { namespace: string }; messageTokens: string[] }) => {
    if (
      !event.logger.namespace.startsWith('serverless:lifecycle') &&
      event.logger.namespace !== 'serverless'
    ) {
      logsBuffer.push(event.messageTokens[0]);
    }
  },
);

describe('plugin tests', () => {
  it('should run servestatic on package', async () => {
    await runServerless(path.join(require.resolve('serverless'), '..', '..'), {
      cwd: path.resolve(__dirname, 'fixtures', 'simple-service'),
      command: 'package',
    });

    const compiledTemplatePath = path.resolve(
      __dirname,
      'fixtures',
      'simple-service',
      '.serverless',
      'cloudformation-template-update-stack.json',
    );
    const compiledTemplate = JSON.parse(
      fs.readFileSync(compiledTemplatePath, 'utf-8'),
    );

    expect(compiledTemplate.Resources).toEqual({
      ServerlessDeploymentBucket: {
        Type: 'AWS::S3::Bucket',
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
        },
      },
      ServerlessDeploymentBucketPolicy: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          PolicyDocument: {
            Statement: [
              {
                Action: 's3:*',
                Effect: 'Deny',
                Principal: '*',
                Resource: [
                  {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::',
                        {
                          Ref: 'ServerlessDeploymentBucket',
                        },
                        '/*',
                      ],
                    ],
                  },
                  {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::',
                        {
                          Ref: 'ServerlessDeploymentBucket',
                        },
                      ],
                    ],
                  },
                ],
                Condition: {
                  Bool: {
                    'aws:SecureTransport': false,
                  },
                },
              },
            ],
          },
        },
      },
      FooLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/simple-service-dev-foo',
        },
      },
      BarLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/simple-service-dev-bar',
        },
      },
      IamRoleLambdaExecution: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: ['lambda.amazonaws.com'],
                },
                Action: ['sts:AssumeRole'],
              },
            ],
          },
          Policies: [
            {
              PolicyName: {
                'Fn::Join': ['-', ['simple-service', 'dev', 'lambda']],
              },
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: [
                      'logs:CreateLogStream',
                      'logs:CreateLogGroup',
                      'logs:TagResource',
                    ],
                    Resource: [
                      {
                        'Fn::Sub':
                          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/simple-service-dev*:*',
                      },
                    ],
                  },
                  {
                    Effect: 'Allow',
                    Action: ['logs:PutLogEvents'],
                    Resource: [
                      {
                        'Fn::Sub':
                          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/simple-service-dev*:*:*',
                      },
                    ],
                  },
                ],
              },
            },
          ],
          Path: '/',
          RoleName: {
            'Fn::Join': [
              '-',
              [
                'simple-service',
                'dev',
                {
                  Ref: 'AWS::Region',
                },
                'lambdaRole',
              ],
            ],
          },
        },
      },
      FooLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: {
              Ref: 'ServerlessDeploymentBucket',
            },
            S3Key: expect.stringMatching(
              /serverless\/simple-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/simple-service\.zip/,
            ),
          },
          Handler: 'index.handler',
          Runtime: 'nodejs20.x',
          FunctionName: 'simple-service-dev-foo',
          MemorySize: 1024,
          Timeout: 6,
          Role: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        },
        DependsOn: ['FooLogGroup'],
      },
      BarLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: {
              Ref: 'ServerlessDeploymentBucket',
            },
            S3Key: expect.stringMatching(
              /serverless\/simple-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/simple-service\.zip/,
            ),
          },
          Handler: 'index.handler',
          Runtime: 'nodejs20.x',
          FunctionName: 'simple-service-dev-bar',
          MemorySize: 1024,
          Timeout: 6,
          Role: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        },
        DependsOn: ['BarLogGroup'],
      },
      FooLambdaVersionJQPWIph7LTOFfYj5shkcpOCqiGsGTQOXARgA9KI8: {
        Type: 'AWS::Lambda::Version',
        DeletionPolicy: 'Retain',
        Properties: {
          FunctionName: {
            Ref: 'FooLambdaFunction',
          },
          CodeSha256: 'Rke/vVu8DPxDMO3QCdY/dYgrn7bV8RJu8NYtjZSDzr8=',
        },
      },
      BarLambdaVersionAdrQqhdJv5cLOO42J7mFZIhkMd0KxaPy6USvqgvfrdM: {
        Type: 'AWS::Lambda::Version',
        DeletionPolicy: 'Retain',
        Properties: {
          FunctionName: {
            Ref: 'BarLambdaFunction',
          },
          CodeSha256: 'Rke/vVu8DPxDMO3QCdY/dYgrn7bV8RJu8NYtjZSDzr8=',
        },
      },
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
            BlockPublicAcls: false,
            BlockPublicPolicy: false,
            IgnorePublicAcls: false,
            RestrictPublicBuckets: false,
          },
          VersioningConfiguration: 'Enabled',
        },
      },
      ServeStaticLambdaRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          RoleName: 'simple-service-dev-servestatic-cfn-lambdarole',
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
          FunctionName: 'cfn-servestatic-simple-service-dev-resource',
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
            ZipFile: expect.any(String),
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
            Name: 'simple-service-dev-servestatic-oac',
            OriginAccessControlOriginType: 's3',
            SigningBehavior: 'always',
            SigningProtocol: 'sigv4',
            Description: {
              'Fn::Sub': 'OAI for S3 bucket ${ServeStaticAssetsBucket}',
            },
          },
        },
      },
      StaticAssetsCustomResource: {
        Type: 'Custom::UnzipResource',
        Properties: {
          ServiceToken: {
            'Fn::GetAtt': ['ServeStaticLambdaFunction', 'Arn'],
          },
          SourceBucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          SourceKeys: [
            expect.stringMatching(
              /serverless\/simple-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/simple-service\.zip/,
            ),
          ],
          DestinationBucket: {
            Ref: 'ServeStaticAssetsBucket',
          },
          IncludePatterns: [],
          ExcludePatterns: [],
        },
      },
    });
  });

  it('should handle the supplied configuration', async () => {
    await runServerless(path.join(require.resolve('serverless'), '..', '..'), {
      cwd: path.resolve(__dirname, 'fixtures', 'complex-service'),
      command: 'package',
    });

    const compiledTemplatePath = path.resolve(
      __dirname,
      'fixtures',
      'complex-service',
      '.serverless',
      'cloudformation-template-update-stack.json',
    );
    const compiledTemplate = JSON.parse(
      fs.readFileSync(compiledTemplatePath, 'utf-8'),
    );

    expect(compiledTemplate.Resources).toEqual({
      ServerlessDeploymentBucket: {
        Type: 'AWS::S3::Bucket',
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
        },
      },
      ServerlessDeploymentBucketPolicy: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          PolicyDocument: {
            Statement: [
              {
                Action: 's3:*',
                Effect: 'Deny',
                Principal: '*',
                Resource: [
                  {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::',
                        {
                          Ref: 'ServerlessDeploymentBucket',
                        },
                        '/*',
                      ],
                    ],
                  },
                  {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::',
                        {
                          Ref: 'ServerlessDeploymentBucket',
                        },
                      ],
                    ],
                  },
                ],
                Condition: {
                  Bool: {
                    'aws:SecureTransport': false,
                  },
                },
              },
            ],
          },
        },
      },
      FooLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/complex-service-dev-foo',
        },
      },
      BarLogGroup: {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: '/aws/lambda/complex-service-dev-bar',
        },
      },
      IamRoleLambdaExecution: {
        Type: 'AWS::IAM::Role',
        Properties: {
          AssumeRolePolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: {
                  Service: ['lambda.amazonaws.com'],
                },
                Action: ['sts:AssumeRole'],
              },
            ],
          },
          Policies: [
            {
              PolicyName: {
                'Fn::Join': ['-', ['complex-service', 'dev', 'lambda']],
              },
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: [
                      'logs:CreateLogStream',
                      'logs:CreateLogGroup',
                      'logs:TagResource',
                    ],
                    Resource: [
                      {
                        'Fn::Sub':
                          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/complex-service-dev*:*',
                      },
                    ],
                  },
                  {
                    Effect: 'Allow',
                    Action: ['logs:PutLogEvents'],
                    Resource: [
                      {
                        'Fn::Sub':
                          'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/complex-service-dev*:*:*',
                      },
                    ],
                  },
                ],
              },
            },
          ],
          Path: '/',
          RoleName: {
            'Fn::Join': [
              '-',
              [
                'complex-service',
                'dev',
                {
                  Ref: 'AWS::Region',
                },
                'lambdaRole',
              ],
            ],
          },
        },
      },
      FooLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: {
              Ref: 'ServerlessDeploymentBucket',
            },
            S3Key: expect.stringMatching(
              /serverless\/complex-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/complex-service\.zip/,
            ),
          },
          Handler: 'index.handler',
          Runtime: 'nodejs20.x',
          FunctionName: 'complex-service-dev-foo',
          MemorySize: 1024,
          Timeout: 6,
          Role: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        },
        DependsOn: ['FooLogGroup'],
      },
      BarLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Bucket: {
              Ref: 'ServerlessDeploymentBucket',
            },
            S3Key: expect.stringMatching(
              /serverless\/complex-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/complex-service\.zip/,
            ),
          },
          Handler: 'index.handler',
          Runtime: 'nodejs20.x',
          FunctionName: 'complex-service-dev-bar',
          MemorySize: 1024,
          Timeout: 6,
          Role: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        },
        DependsOn: ['BarLogGroup'],
      },
      FooLambdaVersiong9i4xdTpFMXJuWeDuCEhOjXEqIzxUj1n1FnjoterE: {
        Type: 'AWS::Lambda::Version',
        DeletionPolicy: 'Retain',
        Properties: {
          FunctionName: {
            Ref: 'FooLambdaFunction',
          },
          CodeSha256: 'Rke/vVu8DPxDMO3QCdY/dYgrn7bV8RJu8NYtjZSDzr8=',
        },
      },
      BarLambdaVersionKHa46UBsMmXPcKOH6NTJAtoDohT1y67t4hQGcYzpw: {
        Type: 'AWS::Lambda::Version',
        DeletionPolicy: 'Retain',
        Properties: {
          FunctionName: {
            Ref: 'BarLambdaFunction',
          },
          CodeSha256: 'Rke/vVu8DPxDMO3QCdY/dYgrn7bV8RJu8NYtjZSDzr8=',
        },
      },
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
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
          VersioningConfiguration: 'Enabled',
        },
      },
      ServeStaticLambdaRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
          RoleName: 'complex-service-dev-servestatic-cfn-lambdarole',
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
          FunctionName: 'cfn-servestatic-complex-service-dev-resource',
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
            ZipFile: expect.any(String),
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
            Name: 'complex-service-dev-servestatic-oac',
            OriginAccessControlOriginType: 's3',
            SigningBehavior: 'always',
            SigningProtocol: 'sigv4',
            Description: {
              'Fn::Sub': 'OAI for S3 bucket ${ServeStaticAssetsBucket}',
            },
          },
        },
      },
      StaticAssetsCustomResource: {
        Type: 'Custom::UnzipResource',
        Properties: {
          ServiceToken: {
            'Fn::GetAtt': ['ServeStaticLambdaFunction', 'Arn'],
          },
          SourceBucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          SourceKeys: [
            expect.stringMatching(
              /serverless\/complex-service\/dev\/\d{13}-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\/complex-service\.zip/,
            ),
          ],
          DestinationBucket: {
            Ref: 'ServeStaticAssetsBucket',
          },
          IncludePatterns: ['public/**/*'],
          ExcludePatterns: ['**/*'],
        },
      },
    });
  });
});
