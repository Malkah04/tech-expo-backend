const cloudinary = require("cloudinary").v2;
const stream = require("stream");


const CLOUDINARY_CONFIG = {
  cloudName: "dpgbkye9f",
  apiUrl: "https://api.cloudinary.com/v1_1",
};

cloudinary.config({
  cloud_name: "dpgbkye9f",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (buffer, folder = "certificates") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image", 
        folder,
        format: "pdf" 
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
};

module.exports = uploadToCloudinary;
