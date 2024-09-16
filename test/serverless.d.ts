declare module '@serverless/test/run-serverless' {
  export default function runServerless(
    serverlessPath: string,
    options: object,
  ): Promise<void>;
}
