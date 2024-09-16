import runServerless from '@serverless/test/run-serverless';
import path from 'path';
// @ts-expect-error since the types are missing
import logEmitter from 'log/lib/emitter.js';
import * as fs from 'node:fs';
import {
  CloudFormationResource,
  CloudFormationResources,
} from 'serverless/plugins/aws/provider/awsProvider';

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

    const aliasResources = Object.entries(
      compiledTemplate.Resources as CloudFormationResources,
    ).filter(
      ([, resource]: [string, CloudFormationResource]) =>
        resource.Type === 'Custom::LambdaAlias',
    );

    expect(aliasResources.length).toEqual(2);

    aliasResources.forEach(
      ([, aliasResource]: [string, CloudFormationResource]) => {
        expect(aliasResource).toEqual({
          Type: 'Custom::LambdaAlias',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomResourceHandlerLambdaFunction', 'Arn'],
            },
            FunctionName: { Ref: aliasResource.Properties.FunctionName.Ref },
            FunctionVersion: {
              'Fn::GetAtt': [
                expect.stringMatching(new RegExp(`^.*LambdaVersion`)),
                'Version',
              ],
            },
            AliasName: expect.stringMatching(new RegExp(/version-[0-9a-f]*/)),
          },
        });
      },
    );

    expect(logsBuffer.join('\n')).toContain(
      'added for function "FooLambdaFunction"',
    );

    expect(logsBuffer.join('\n')).toContain(
      'added for function "BarLambdaFunction"',
    );
  });
});
