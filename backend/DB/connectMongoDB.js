import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            dbName: 'maxy_grand'
        });
         
            console.log("✅ MongoDB Connected Successfully");
    

    } catch (err) {
        console.error("❌ MongoDB Connection Failed:", err);
        console.error("⚠️ Connection Cause:", err.cause);  // This will give more details
        process.exit(1);
    }
};

export default connectDB;
