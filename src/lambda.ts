/**
 * @file Custom resource handler that copies the static assets from the deployment bucket into the assets bucket.
 */
import { buffer } from 'node:stream/consumers';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import response from 'cfn-response';
import { minimatch } from 'minimatch';
import { lookup } from 'mime-types';
import lambda from 'aws-lambda';
import { Readable } from 'node:stream';

/**
 * Uploads a single zip entry to the static assets bucket with a content type inferred from its name.
 *
 * Failures are logged rather than thrown, so one bad asset does not abort the rest of the deployment.
 * @param client - The S3 client used to send the upload request.
 * @param entry - The zip entry whose contents are uploaded.
 * @param bucket - The name of the destination bucket.
 * @returns A promise that resolves once the upload has finished or its failure has been logged.
 * @example
 * ```ts
 * const zip = new AdmZip(zipBuffer);
 * await uploadFile(new S3Client({ region: 'us-east-1' }), zip.getEntries()[0], 'assets-bucket');
 * ```
 */
async function uploadFile(
  client: S3Client,
  entry: AdmZip.IZipEntry,
  bucket: string,
): Promise<void> {
  const destKey = `${['static', ...entry.entryName.split('/').slice(1)].join('/')}`;
  console.log(`Uploading ${entry.entryName} to s3://${bucket}/${destKey}`);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: destKey,
    Body: entry.getData(),
    ContentType: lookup(entry.entryName) || 'application/octet-stream',
  });
  try {
    await client.send(command);
    console.log(`Uploaded ${entry.entryName} successfully`);
  } catch (error) {
    console.error(
      `Failed to upload ${entry.entryName}:`,
      (error as Error).message,
    );
  }
}

export const handler = async (
  event: lambda.CloudFormationCustomResourceEvent & {
    ResourceProperties: {
      RequestType: string;
      CurrentRegion: string;
      SourceBucket: string;
      SourceKeys: string[];
      DestinationBucket: string;
      IncludePatterns: string[];
      ExcludePatterns: string[];
    };
  },
  context: lambda.Context,
) => {
  console.log(event);
  if (event.ResourceProperties.RequestType === 'Delete') {
    await response.send(event, context, response.SUCCESS, undefined, 'ok');
    return;
  }

  const {
    SourceBucket,
    SourceKeys,
    DestinationBucket,
    IncludePatterns,
    CurrentRegion,
  } = event.ResourceProperties;

  if (!IncludePatterns || IncludePatterns.length === 0) {
    throw new Error('No include patterns specified');
  }

  const s3 = new S3Client({ region: CurrentRegion });

  try {
    await Promise.all(
      SourceKeys.map(async (sourceKey) => {
        console.log(`Deploying assets from ${sourceKey}`);
        const getObjectCommand = new GetObjectCommand({
          Bucket: SourceBucket,
          Key: sourceKey,
        });
        const zipObject = await s3.send(getObjectCommand);
        console.log(
          `Unpacking assets from ZIP of ${zipObject.ContentLength} bytes`,
        );

        const zipBuffer = await buffer(zipObject.Body as Readable);

        await Promise.race([
          Promise.all(
            new AdmZip(zipBuffer)
              .getEntries()
              .filter((entry) => {
                const { IncludePatterns, ExcludePatterns } =
                  event.ResourceProperties;
                const isIncluded = (IncludePatterns || []).some((pattern) =>
                  minimatch(entry.entryName, pattern),
                );
                const isExcluded = (ExcludePatterns || []).some((pattern) =>
                  minimatch(entry.entryName, pattern),
                );
                return isIncluded && !isExcluded;
              })
              .map((entry) => uploadFile(s3, entry, DestinationBucket)),
          ),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), 180_000),
          ),
        ]);
      }),
    );

    console.log(`Sucessfully uploaded all the assets`);
    await response.send(event, context, response.SUCCESS, undefined, 'ok');
  } catch (error) {
    console.error(error);
    await response.send(event, context, response.FAILED, undefined, 'ok');
  }
};
