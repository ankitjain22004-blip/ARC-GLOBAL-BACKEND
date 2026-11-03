const { Schema, model } = require('mongoose');
const AdminUser = model('AdminUser', new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'editor'], default: 'admin' },
  lastLoginAt: Date,
}, { timestamps: true }));
// One document per website section; `key` matches window.ARC keys in assets/data.js + content.js.
const Content = model('Content', new Schema({
  key: { type: String, required: true, unique: true, match: /^[A-Za-z]{2,40}$/ },
  value: { type: Schema.Types.Mixed, required: true },
  published: { type: Boolean, default: true },
  updatedBy: String,
}, { timestamps: true, minimize: false }));
const TYPES = ['general', 'training', 'vehicle', 'parts', 'custom'];
const enquirySchema = new Schema({
  type: { type: String, enum: TYPES, default: 'general', index: true },
  name: { type: String, required: true, maxlength: 120, trim: true },
  email: { type: String, required: true, maxlength: 200, lowercase: true, trim: true },
  phone: { type: String, maxlength: 40, trim: true },
  subject: { type: String, maxlength: 200, trim: true },
  message: { type: String, required: true, maxlength: 5000 },
  status: { type: String, enum: ['new', 'pending', 'contacted', 'resolved'], default: 'new', index: true },
  notes: { type: String, maxlength: 5000, default: '' },
  ip: String,
}, { timestamps: true });
enquirySchema.index({ createdAt: -1 });
const Enquiry = model('Enquiry', enquirySchema);
const Application = model('Application', new Schema({
  name: { type: String, required: true, maxlength: 120, trim: true },
  email: { type: String, required: true, maxlength: 200, lowercase: true, trim: true },
  phone: { type: String, maxlength: 40, trim: true },
  qualification: { type: String, maxlength: 200, trim: true },
  area: { type: String, maxlength: 120, trim: true },
  message: { type: String, maxlength: 5000 },
  resumeId: { type: Schema.Types.ObjectId, ref: 'Resume' },
  resumeName: String,
  status: { type: String, enum: ['new', 'reviewing', 'shortlisted', 'rejected', 'hired'], default: 'new', index: true },
  notes: { type: String, maxlength: 5000, default: '' },
  ip: String,
}, { timestamps: true }));
// Resume PDFs live in MongoDB (private; only served through an authenticated admin route).
const Resume = model('Resume', new Schema({ filename: String, data: { type: Buffer, select: false }, size: Number }, { timestamps: true }));
const MediaAsset = model('MediaAsset', new Schema({
  url: { type: String, required: true }, publicId: { type: String, required: true, unique: true },
  originalName: String, bytes: Number, format: String, uploadedBy: String,
}, { timestamps: true }));
module.exports = { AdminUser, Content, Enquiry, Application, Resume, MediaAsset, TYPES };
