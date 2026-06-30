import { MongoMemoryServer } from 'mongodb-memory-server';
async function test() {
    console.log("Starting MongoMemoryServer...");
    const mongod = await MongoMemoryServer.create({
        binary: {
            version: '6.0.14',
        }
    });
    console.log("URI:", mongod.getUri());
    await mongod.stop();
    console.log("Done!");
}
test().catch((err) => {
    console.error("Test failed:", err);
});
