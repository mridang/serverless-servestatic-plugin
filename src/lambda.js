const { buffer } = require('node:stream/consumers');
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const AdmZip = require('adm-zip');
const response = require('cfn-response');
const { minimatch } = require('minimatch');
const { lookup } = require('mime-types');

async function uploadFile(client, entry, bucket) {
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

exports.handler = async (event, context) => {
  console.log(event);
  if (event.ResourceProperties.RequestType === 'Delete') {
    await response.send(event, context, response.SUCCESS, undefined, 'ok');
    return;
  }

  const { SourceBucket, SourceKeys, DestinationBucket, IncludePatterns } =
    event.ResourceProperties;

  if (!IncludePatterns?.length) {
    throw new Error("No include patterns specified")
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

        const zipBuffer = await buffer(zipObject.Body);

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
    await response.send(event, context, response.SUCCESS, undefined, 'ok');
  } catch (error) {
    console.error(error);
    await response.send(event, context, response.FAILED, undefined, 'ok');
  }
};
