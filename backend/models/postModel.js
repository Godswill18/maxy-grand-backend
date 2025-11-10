import mongoose from 'mongoose';

// A simple function to create a URL-friendly 'slug' from a title
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w-]+/g, '')     // Remove all non-word chars
    .replace(/--+/g, '-');         // Replace multiple - with single -
};

const postSchema = new mongoose.Schema({
    hotelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hotel',
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    content: {
        type: String, // Can be simple text or HTML from a rich text editor
        required: true,
    },
    featuredImage: {
        type: [String], // URL to the image
        required: false,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    status: {
        type: String,
        enum: ['draft', 'published'],
        default: 'draft',
    },
    postType: {
        type: String,
        enum: ['blog', 'news'],
        required: true,
    },
}, { timestamps: true });

// Pre-save middleware to generate the slug before saving
postSchema.pre('validate', function(next) {
    if (this.title) {
        // Create a base slug
        let baseSlug = slugify(this.title);
        
        // If the title is modified, or it's a new document, generate a unique slug
        if (this.isModified('title') || this.isNew) {
            // We'll append a unique suffix if the slug already exists
            // For this example, we'll append the current timestamp for simplicity
            // A more robust solution would check the DB and increment a number
            this.slug = `${baseSlug}-${Date.now()}`;
        }
    }
    next();
});

const Post = mongoose.model('Post', postSchema);

export default Post;