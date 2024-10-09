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

async function uploadFile(
  client: S3Client,
  entry: AdmZip.IZipEntry,
  bucket: string,
) {
  const destKey = `${['static', ...entry.entryName.split('/').slice(1)].join('/')}`;
  console.log(`Uploading ${entry.entryName} to s3://${bucket}/${destKey}`);
  return client
    .send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: destKey,
        Body: entry.getData(),
        ContentType: lookup(entry.entryName) || 'application/octet-stream',
      }),
    )
    .then(() => {
      console.log(`Uploaded ${entry.entryName} successfully`);
    })
    .catch((error) => {
      console.error(`Failed to upload ${entry.entryName}:`, error.message);
    });
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
    response.send(event, context, response.SUCCESS, undefined, 'ok');
    return;
  }

  const { SourceBucket, SourceKeys, DestinationBucket, IncludePatterns } =
    event.ResourceProperties;

  if (!IncludePatterns || !IncludePatterns.length) {
    throw new Error('No include patterns specified');
  }

  const s3 = new S3Client({ region: event.ResourceProperties.CurrentRegion });

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
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Operation timed out')), 180000),
          ),
        ]);
      }),
    );

    console.log(`Sucessfully uploaded all the assets`);
    response.send(event, context, response.SUCCESS, undefined, 'ok');
  } catch (error) {
    console.error(error);
    response.send(event, context, response.FAILED, undefined, 'ok');
  }
};
