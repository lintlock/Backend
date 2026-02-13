import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

let cloudinaryConfigured = false;
const ensureCloudinaryConfig = () => {
  if (!cloudinaryConfigured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    cloudinaryConfigured = true;
  }
};

export const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};
export const deleteCloudinaryImages = async (cloudinaryIds) => {
  console.log("Deleting Cloudinary images:", cloudinaryIds);
  if (!cloudinaryIds || !cloudinaryIds.length) return;
  ensureCloudinaryConfig();
  const deletePromises = cloudinaryIds.map((id) =>
    cloudinary.uploader.destroy(id).catch(() => {})
  );
  await Promise.all(deletePromises);
};
const uploadToCloudinaryStream = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const uploadToCloudinary = (options = {}) => {
  const { dest = "uploads", fileFilter = imageFilter, limits = {} } = options;

  const storage = multer.memoryStorage();

  const upload = multer({
    storage,
    fileFilter,
    limits,
  });

  const cloudinaryUpload = async (req, res, next) => {
    try {
      ensureCloudinaryConfig();

      if (req.file) {
        const result = await uploadToCloudinaryStream(req.file.buffer, dest);
        req.file.url = result.secure_url;
        req.file.cloudinaryId = result.public_id;
      }

      if (req.files && Array.isArray(req.files)) {

        const uploadPromises = req.files.map((file) =>
          uploadToCloudinaryStream(file.buffer, dest)
        );
        const results = await Promise.all(uploadPromises);

        req.files = req.files.map((file, index) => ({
          ...file,
          url: results[index].secure_url,
          cloudinaryId: results[index].public_id,
        }));
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  return {
    single: (fieldName) => [upload.single(fieldName), cloudinaryUpload],
    array: (fieldName, maxCount) => [
      upload.array(fieldName, maxCount),
      cloudinaryUpload,
    ],
    fields: (fields) => [upload.fields(fields), cloudinaryUpload],
  };
};

export default uploadToCloudinary;
