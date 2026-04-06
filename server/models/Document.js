import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Untitled" },
    source: { type: String, required: true },
    jobDescription: { type: String, default: "" },
    skills: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const Document = mongoose.model("Document", documentSchema);
