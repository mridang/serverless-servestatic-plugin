import Serverless from 'serverless';
import Plugin, { Logging } from 'serverless/classes/Plugin';
import { execSync } from 'node:child_process';

class ServerlessServeStaticPlugin implements Plugin {
  public readonly hooks: Plugin.Hooks = {};
  public readonly name: string = 'serverless-servestatic-plugin';
  private readonly stage: string;

  constructor(
    private readonly serverless: Serverless,
    private readonly options: Serverless.Options,
    private readonly logging: Logging,
  ) {
    this.hooks = {
      'after:aws:package:finalize:mergeCustomProviderResources':
        this.addAliases.bind(this),
    };
    this.stage =
      this.serverless.service.provider.stage || this.options.stage || 'dev';
  }

  getGitCommitSha(): string | null {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
      this.logging.log.notice('Not a Git repository or Git command failed');
      return null;
    }
  }

  addAliases() {
    const commitSha = this.getGitCommitSha();

    if (!commitSha) {
      this.logging.log.notice(
        'Skipping alias creation as the commit SHA could not be determined',
      );
      return;
    }

    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate;

    template.Resources = {
      ...template.Resources,
      CustomResourceHandlerLambdaFunction: {
        Type: 'AWS::Lambda::Function',
        Properties: {
          FunctionName: `cfn-servestatic-${this.serverless.service.service}-${this.stage}-resource`,
          Description:
            'A custom resource to manage function aliases for Serverless Framework projects',
          Runtime: 'nodejs20.x',
          Architectures: ['arm64'],
          MemorySize: 128,
          Handler: 'index.handler',
          Role: { 'Fn::GetAtt': ['CustomResourceHandlerLambdaRole', 'Arn'] },
          Code: {
            ZipFile: `
              const { LambdaClient, CreateAliasCommand, DeleteAliasCommand, ListAliasesCommand } = require('@aws-sdk/client-lambda');
              const response = require('cfn-response');

              exports.handler = async (event, context) => {
                console.log(event);
                const lambdaClient = new LambdaClient();
                const functionName = event.ResourceProperties.FunctionName;
                const aliasName = event.ResourceProperties.AliasName;
                const functionVersion = event.ResourceProperties.FunctionVersion;

                try {
                  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
                    const listAliasesCommand = new ListAliasesCommand({ FunctionName: functionName });
				    const aliases = await lambdaClient.send(listAliasesCommand);

			  	    if (aliases.Aliases.some(alias => alias.Name === aliasName)) {
					  console.warn(\`Alias \${aliasName} already exists for function \${functionName}\`);
				    } else {
					  const createAliasCommand = new CreateAliasCommand({
					    FunctionName: functionName,
					    Name: aliasName,
					    Description: \`Alias for commit \${aliasName}\`,
					    FunctionVersion: functionVersion,
					  });
					  await lambdaClient.send(createAliasCommand);
                    }
                  } else if (event.RequestType === 'Delete') {
                    const listAliasesCommand = new ListAliasesCommand({ FunctionName: functionName });
                    const aliases = await lambdaClient.send(listAliasesCommand);

                    for (const alias of aliases.Aliases) {
                      const deleteAliasCommand = new DeleteAliasCommand({
                        FunctionName: functionName,
                        Name: alias.Name,
                      });
                      await lambdaClient.send(deleteAliasCommand);
                    }
                  }
                  await response.send(event, context, response.SUCCESS, undefined, \`\${functionName}/servestatic\`);
                } catch (error) {
                  console.error(error);
                  await response.send(event, context, response.FAILED, undefined, \`\${functionName}/servestatic\`);
                }
              };
            `,
          },
        },
      },
      CustomResourceHandlerLambdaRole: {
        Type: 'AWS::IAM::Role',
        Properties: {
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
          Policies: [
            {
              PolicyName: 'CustomResourcePolicy',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                  {
                    Effect: 'Allow',
                    Action: [
                      'logs:*',
                      'lambda:CreateAlias',
                      'lambda:UpdateAlias',
                      'lambda:DeleteAlias',
                      'lambda:ListAliases',
                    ],
                    Resource: '*',
                  },
                ],
              },
            },
          ],
        },
      },
      ...Object.entries(template.Resources)
        .filter(([, resource]) => resource.Type === 'AWS::Lambda::Version')
        .reduce(
          (acc, [key, resource]) => {
            const functionName = resource.Properties.FunctionName.Ref;
            this.logging.log.info(
              `Alias "${commitSha}" added for function "${functionName}"`,
            );

            return {
              ...acc,
              [`${functionName}ServeStaticAlias`]: {
                Type: 'Custom::LambdaAlias',
                Properties: {
                  ServiceToken: {
                    'Fn::GetAtt': [
                      'CustomResourceHandlerLambdaFunction',
                      'Arn',
                    ],
                  },
                  FunctionName: { Ref: functionName },
                  FunctionVersion: { 'Fn::GetAtt': [key, 'Version'] },
                  AliasName: `version-${commitSha}`,
                },
              },
            };
          },
          {} as { [key: string]: object },
        ),
    };
  }
}

export = ServerlessServeStaticPlugin;
