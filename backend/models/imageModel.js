import mongoose from "mongoose";

export const imageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      sparse: true, // ✅ Only index non-null values
      // unique: true,
    },
    url: {
      type: String,
      required: true,
    },
    alt: {
      type: String,
      default: 'Blog image',
    },
    caption: {
      type: String,
      default: '',
    },
  },
  { _id: false } // Prevents MongoDB from creating _id for each image
);

export default imageSchema;