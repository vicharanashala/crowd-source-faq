import { MongoMemoryServer } from 'mongodb-memory-server';

async function main() {
  console.log("Starting in-memory MongoDB server...");
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'yaksha-faq'
    }
  });
  const uri = mongoServer.getUri();
  console.log(`In-memory MongoDB started successfully!`);
  console.log(`URI: ${uri}`);
  console.log(`Default port 27017 bound.`);
  console.log("Keep this process running to keep the database alive.");

  process.on('SIGINT', async () => {
    await mongoServer.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Failed to start in-memory MongoDB:", err);
  process.exit(1);
});
