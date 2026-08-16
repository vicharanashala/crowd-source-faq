import mongoose from 'mongoose';

async function checkDb() {
  const MONGODB_URI = 'mongodb://127.0.0.1:25950/';
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to local MongoDB!');
    
    // List databases
    const adminDb = mongoose.connection.db.admin();
    const dbs = await adminDb.listDatabases();
    
    for (const dbInfo of dbs.databases) {
      if (dbInfo.name === 'admin' || dbInfo.name === 'local' || dbInfo.name === 'config') continue;
      
      const dbConnection = mongoose.connection.useDb(dbInfo.name);
      
      // Let's query 'yaksha_faq_communityposts'
      const Post = dbConnection.model('Post', new mongoose.Schema({}, { strict: false }), 'yaksha_faq_communityposts');
      const postsCount = await Post.countDocuments();
      console.log(`Total posts in collection 'yaksha_faq_communityposts' in ${dbInfo.name}:`, postsCount);
      if (postsCount > 0) {
        const posts = await Post.find().lean();
        console.log('Posts:', JSON.stringify(posts, null, 2));
      }

      // Let's also check 'yaksha_faq_session_support' (support tickets)
      const Ticket = dbConnection.model('Ticket', new mongoose.Schema({}, { strict: false }), 'yaksha_faq_session_support');
      const ticketsCount = await Ticket.countDocuments();
      console.log(`Total tickets in 'yaksha_faq_session_support' in ${dbInfo.name}:`, ticketsCount);
      if (ticketsCount > 0) {
        const tickets = await Ticket.find().lean();
        console.log('Tickets:', JSON.stringify(tickets, null, 2));
      }
    }
  } catch (err: any) {
    console.error('Error connecting to local DB:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkDb();
