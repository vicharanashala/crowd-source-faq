// Import Mongoose to interact with MongoDB
import mongoose from 'mongoose';
import { dbLog } from '../utils/http/logger.js';
// Hardcoded local fallback — used when MONGODB_URI is not set in any .env file.
// This lets the dev server boot and connect to a local mongod without any
// extra configuration. Production deploys should always set MONGODB_URI explicitly.
const LOCAL_FALLBACK_URI = 'mongodb://127.0.0.1:27017/crowd_source_faq';
// Cache connection in serverless environment
let cachedConnection = null;
// v1.67 — Wire mongoose's connection event listeners so we get
// DISCORD-pinging ALERTS on disconnect / reconnection, not just
// console.error noise. `connected` and `disconnected` are
// lifecycle events; `error` is for protocol-level failures.
mongoose.connection.on('connected', () => {
    dbLog.info('connection established', { host: mongoose.connection.host });
});
mongoose.connection.on('disconnected', () => {
    dbLog.alert('disconnected', {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
    });
});
mongoose.connection.on('reconnected', () => {
    dbLog.info('reconnected', { host: mongoose.connection.host });
});
mongoose.connection.on('error', (err) => {
    dbLog.alert('connection error', { message: err.message });
});
// Async function to handle the database connection
const connectDB = async () => {
    if (cachedConnection) {
        return cachedConnection;
    }
    // Resolve URI: prefer MONGODB_URI from env (loaded from .env.local or .env),
    // fall back to the local default so dev servers boot without manual config.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || LOCAL_FALLBACK_URI;
    if (!process.env.MONGODB_URI) {
        dbLog.info('MONGODB_URI not set — using local fallback URI', {
            uri: LOCAL_FALLBACK_URI,
            nodeEnv: process.env.NODE_ENV,
        });
    }
    try {
        // Connect using the resolved URI.
        // serverSelectionTimeoutMS: 10 s — gives a locally-starting mongod time to
        //   accept the first connection without immediately aborting.
        // connectTimeoutMS / socketTimeoutMS: standard OS-level socket guards.
        cachedConnection = (await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        })).connection;
        dbLog.info('connected at startup', { host: cachedConnection.host });
        return cachedConnection;
    }
    catch (error) {
        const err = error;
        // SSL alert 80 (internal_error) is how Atlas rejects connections from
        // non-whitelisted IPs at the TLS handshake layer. Surface this clearly
        // instead of letting it appear as a generic SSL failure.
        if (err.message.includes('SSL alert number 80') || err.message.includes('ssl3_read_bytes')) {
            dbLog.alert('connection failed — IP not whitelisted on MongoDB Atlas', {
                hint: 'Go to https://cloud.mongodb.com → Network Access → Add IP Address and add your current IP (or 0.0.0.0/0 for dev)',
                message: err.message,
            });
        }
        else {
            dbLog.alert('connection failed at startup', { message: err.message, uri });
        }
        throw error;
    }
};
// Export the function to be called in your main server file (e.g., server.js or index.js)
export default connectDB;
