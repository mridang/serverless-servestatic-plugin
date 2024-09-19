A plugin for the Serverless framework to deploy the static assets into a separate
deployment bucket.

This ensures that that the lambda isn't invoked for serving assets which in turn
reduces the costs and improves performace.

> [!NOTE]
> This plugin has only been tested with the AWS provider and will
> not work if you are deploying to other providers e.g. GCP.

## Installation

Install using NPM by using the following command

```sh
npm install --save-dev @mridang/serverless-servestatic-plugin
```

And then add the plugin to your `serverless.yml` file:

```yaml
plugins:
  - @mridang/serverless-servestatic-plugin
```

A thorough guide on installing plugins can be found at
https://www.serverless.com/framework/docs-guides-plugins

## Usage

### Configuration

The configuration of the plugin is done by defining a custom `servestatic`
object in your serverless.yml with your specific configuration.

All settings are optional and will be set to reasonable defaults if missing.

See the sections below for detailed descriptions of the settings.

```yaml
custom:
  servestatic:
    include:
      - 'public/**/*' # The list of assets to be included
    exclude:
      - '**/' # The list of assets to be excluded
    public: false # A boolean indicating whether thr S3 bucket is public
```

If `public` is enabled, the assets in the bucket can be served directly from the
bucket. Public acess can be disabled if you intend to front the bucket via
CloudFront.

#### Using CloudFront

When you trigger a deployment, the custom resource will unpack all the assets
that the match the glob patterns into the bucket that will be used for serving
static assets.

```
$ sls deploy

Deploying test-logcls to stage dev (us-east-1)
Compiling with Typescript...
Using local tsconfig.json - tsconfig.json
Typescript compiled.

✔ Service deployed to stack test-logcls-dev (104s)

endpoint: https://sfukfimmof3tinylzdbum77uvdu0xtznt.lambda-url.us-east-1.on.aws/
functions:
  probot: test-logcls-dev-probot (22 MB)

Need a faster logging experience than CloudWatch? Try our Dev Mode in Console: run "serverless dev"
```

## Contributing

If you have suggestions for how this app could be improved, or
want to report a bug, open an issue - we'd love all and any
contributions.

## License

Apache License 2.0 © 2024 Mridang Agarwalla
