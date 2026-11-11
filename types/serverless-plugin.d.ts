/**
 * @file Ambient module declarations for the `serverless` package subpaths used by the plugin.
 *
 * These are ambient module shims for `serverless/...` subpaths.
 *
 * The `serverless` npm package does not declare an `exports` map that exposes
 * its internal subpaths, so under TypeScript's `nodenext` module resolution
 * imports like `serverless/classes/Plugin` cannot be resolved even though
 * `@types/serverless` ships the corresponding `.d.ts` files. These shims
 * re-declare the small surface of those subpaths that the codebase actually
 * uses so the existing imports in `src/index.ts` continue to type-check
 * without resorting to `require()`-style imports.
 *
 * The shape mirrors the relevant parts of the `@types/serverless`
 * declarations (which themselves use CommonJS `export =` with interface +
 * namespace merging). Keeping the surface inline avoids referencing the
 * `@types/...` paths directly, which TypeScript's `nodenext` resolution
 * rejects (`TS6137`).
 */
declare module 'serverless/classes/Plugin' {
  import type Serverless from 'serverless';

  interface Plugin {
    hooks: Plugin.Hooks;
    commands?: Plugin.Commands;
    variableResolvers?: Plugin.VariableResolvers;
    configurationVariablesSources?: Plugin.ConfigurationVariablesSources;
    provider?:
      string | ReturnType<InstanceType<typeof Serverless>['getProvider']>;
  }

  namespace Plugin {
    interface Hooks {
      [event: string]: (...rest: unknown[]) => unknown;
    }

    interface Commands {
      [command: string]: {
        usage?: string;
        lifecycleEvents?: string[];
        commands?: {
          [command: string]: {
            lifecycleEvents?: string[];
            usage?: string;
            options?: {
              [option: string]: {
                usage?: string;
                required?: boolean;
                shortcut?: string;
                type: 'string' | 'boolean' | 'multiple';
              };
            };
          };
        };
        options?: {
          [option: string]: {
            usage?: string;
            required?: boolean;
            shortcut?: string;
          };
        };
      };
    }

    type VariableResolver = (variableSource: string) => Promise<unknown>;

    interface VariableResolvers {
      [variablePrefix: string]:
        | VariableResolver
        | {
            resolver: VariableResolver;
            isDisabledAtPrepopulation?: boolean;
            serviceName?: string;
          };
    }

    type ConfigurationVariablesSource = (
      variableSource: unknown,
    ) => Promise<unknown>;

    interface ConfigurationVariablesSources {
      [variablePrefix: string]:
        | ConfigurationVariablesSource
        | {
            resolve: ConfigurationVariablesSource;
            isDisabledAtPrepopulation?: boolean;
            serviceName?: string;
          };
    }

    interface Logging {
      log: {
        error: (...args: unknown[]) => void;
        warning: (...args: unknown[]) => void;
        notice: (...args: unknown[]) => void;
        info: (...args: unknown[]) => void;
        debug: (...args: unknown[]) => void;
        verbose: (...args: unknown[]) => void;
        success: (...args: unknown[]) => void;
      };
      writeText: (text: string | string[]) => void;
      progress: {
        get: (name: string) => Progress;
        create: (args: { message?: string; name?: string }) => Progress;
      };
    }

    interface Progress {
      namespace: string;
      name: string;
      update: (message: string) => void;
      info: (message: string) => void;
      notice: (message: string) => void;
      remove: () => void;
    }

    interface PluginStatic {
      new (
        serverless: Serverless,
        options: Serverless.Options,
        logging: Logging,
      ): Plugin;
    }
  }

  export default Plugin;
  export type Hooks = Plugin.Hooks;
  export type Commands = Plugin.Commands;
  export type VariableResolver = Plugin.VariableResolver;
  export type VariableResolvers = Plugin.VariableResolvers;
  export type ConfigurationVariablesSource =
    Plugin.ConfigurationVariablesSource;
  export type ConfigurationVariablesSources =
    Plugin.ConfigurationVariablesSources;
  export type Logging = Plugin.Logging;
  export type Progress = Plugin.Progress;
  export type PluginStatic = Plugin.PluginStatic;
}

declare module 'serverless/plugins/aws/provider/awsProvider' {
  namespace Aws {
    interface CloudFormationResource {
      Type: string;
      Properties: {
        Tags?: Array<{ Key: string; Value: string }>;
        [key: string]: unknown;
      };
      DependsOn?: string | { [key: string]: unknown };
      Condition?: string;
      DeletionPolicy?: string;
    }

    interface CloudFormationResources {
      [key: string]: CloudFormationResource;
    }
  }

  export default Aws;
  export type CloudFormationResource = Aws.CloudFormationResource;
  export type CloudFormationResources = Aws.CloudFormationResources;
}
