import mongoose from 'mongoose';
import User from '../models/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

const checkUsersWithoutHotelId = async () => {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to database');

        // Find all users without hotelId or with empty hotelId
        const usersWithoutHotelId = await User.find({
            $or: [
                { hotelId: { $exists: false } },
                { hotelId: null },
                { hotelId: '' }
            ]
        });

        console.log('\n📊 Users Without hotelId Report:');
        console.log('=' .repeat(60));
        console.log(`Total users without hotelId: ${usersWithoutHotelId.length}`);
        console.log('=' .repeat(60));

        if (usersWithoutHotelId.length === 0) {
            console.log('✅ All users have valid hotelId!');
        } else {
            console.log('\n⚠️  Users needing hotelId:\n');
            
            const roleGroups = {};
            usersWithoutHotelId.forEach(user => {
                if (!roleGroups[user.role]) {
                    roleGroups[user.role] = [];
                }
                roleGroups[user.role].push(user);
            });

            Object.keys(roleGroups).forEach(role => {
                console.log(`\n${role.toUpperCase()} (${roleGroups[role].length}):`);
                console.log('-'.repeat(60));
                roleGroups[role].forEach(user => {
                    console.log(`  ID: ${user._id}`);
                    console.log(`  Name: ${user.firstName} ${user.lastName}`);
                    console.log(`  Email: ${user.email}`);
                    console.log(`  isActive: ${user.isActive}`);
                    console.log('');
                });
            });

            console.log('\n📌 Recommendations:');
            console.log('=' .repeat(60));
            
            if (roleGroups['superadmin']) {
                console.log('✅ SuperAdmins: No action needed (they don\'t require hotelId)');
            }
            
            if (roleGroups['guest']) {
                console.log('✅ Guests: No action needed (they don\'t require hotelId)');
            }
            
            if (roleGroups['admin']) {
                console.log('⚠️  ADMINS: These users MUST have a hotelId!');
                console.log('   Run the fix script below to assign hotelId to admins.');
            }
            
            const staffRoles = ['receptionist', 'cleaner', 'waiter', 'headWaiter'];
            const staffWithoutHotelId = Object.keys(roleGroups).filter(role => staffRoles.includes(role));
            
            if (staffWithoutHotelId.length > 0) {
                console.log('⚠️  STAFF: These users MUST have a hotelId!');
                console.log('   Run the fix script below to assign hotelId to staff.');
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ Check complete!');
        console.log('=' .repeat(60) + '\n');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Error checking database:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
};

checkUsersWithoutHotelId();