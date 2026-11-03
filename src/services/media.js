const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const configured = () => !!(env.cloudinary.name && env.cloudinary.key && env.cloudinary.secret);
if (configured()) cloudinary.config({ cloud_name: env.cloudinary.name, api_key: env.cloudinary.key, api_secret: env.cloudinary.secret, secure: true });
// Magic-byte sniffing: never trust the client-supplied mimetype alone.
const sniff = (b) => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())) return 'gif';
  return null;
};
const isPdf = (b) => b.length > 5 && b.subarray(0, 5).toString() === '%PDF-';
const upload = (buffer) => new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream({ folder: 'arc-global', resource_type: 'image' }, (e, r) => (e ? reject(e) : resolve(r))).end(buffer);
});
const destroy = (publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
module.exports = { configured, sniff, isPdf, upload, destroy };
