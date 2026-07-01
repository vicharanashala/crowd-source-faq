import 'dotenv/config';
import { Storage } from '@google-cloud/storage';
import { getGcsConfig } from '../integrations/gcs/gcs.js';

async function testGcs() {
  console.log('=== GCS Connection Test ===');
  console.log('1. Loading config...');
  
  let cfg;
  try {
    cfg = getGcsConfig();
    console.log(`  ✓ Bucket name: ${cfg.bucket}`);
    console.log(`  ✓ Public host: ${cfg.publicHost}`);
  } catch (err) {
    console.error('  ✗ Failed to load GCS config from env:', (err as Error).message);
    process.exit(1);
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.warn('  ! GOOGLE_APPLICATION_CREDENTIALS is not set. Relying on default credentials (may fail locally)...');
  } else {
    console.log(`  ✓ Using key file: ${keyPath}`);
  }

  console.log('2. Initializing Storage client...');
  const storage = new Storage();
  const bucket = storage.bucket(cfg.bucket);

  console.log(`3. Checking if bucket "${cfg.bucket}" exists...`);
  try {
    const [exists] = await bucket.exists();
    if (!exists) {
      console.error(`  ✗ Bucket "${cfg.bucket}" does not exist in your GCP project.`);
      try {
        const [buckets] = await storage.getBuckets();
        if (buckets.length > 0) {
          console.log('\nAvailable buckets in your GCP project:');
          buckets.forEach(b => console.log(`  - ${b.name}`));
          console.log('\nPlease update GCS_BUCKET in your apps/backend/.env file to one of these.');
        } else {
          console.log('\nNo GCS buckets found in this project. Please create one in the GCP Console first.');
        }
      } catch (listErr) {
        console.error('  (Unable to list project buckets: service account may lack storage.buckets.list permission)');
      }
      process.exit(1);
    }
    console.log('  ✓ Bucket exists!');
  } catch (err) {
    console.error('  ✗ Failed to connect to bucket / fetch metadata:', (err as Error).message);
    console.error('\nTips:');
    console.error('  - Verify that the project ID in your key file matches the bucket\'s project.');
    console.error('  - Verify that your Service Account has "Storage Object Viewer" or "Storage Object Admin" permissions.');
    process.exit(1);
  }

  console.log('4. Testing write permission (uploading a test file)...');
  const testFileName = `test-connection-${Date.now()}.txt`;
  const file = bucket.file(testFileName);
  try {
    await file.save('Hello from Yaksha FAQ Portal GCS connection test!', {
      contentType: 'text/plain',
      resumable: false,
    });
    console.log(`  ✓ Successfully uploaded test file: ${testFileName}`);
  } catch (err) {
    console.error('  ✗ Write failed:', (err as Error).message);
    console.error('\nTips:');
    console.error('  - Verify that your Service Account has the "Storage Object Creator" or "Storage Object Admin" role.');
    process.exit(1);
  }

  console.log('5. Testing delete permission (cleaning up the test file)...');
  try {
    await file.delete();
    console.log('  ✓ Successfully deleted test file!');
  } catch (err) {
    console.warn(`  ! Warning: Cleanup failed to delete "${testFileName}":`, (err as Error).message);
    console.warn('  You may need to manually delete this file in the GCP Console.');
  }

  console.log('\n======================================');
  console.log('🎉 GCS Connection Test PASSED successfully!');
  console.log('Your GCP configuration is fully working.');
  console.log('======================================');
}

testGcs().catch(err => {
  console.error('Test threw an unhandled exception:', err);
  process.exit(1);
});
