import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { AppError, badRequest } from "@/lib/errors";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

let configured: boolean | undefined;

export function isUploadConfigured(): boolean {
  if (configured !== undefined) return configured;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  configured = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
  if (configured) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  return configured;
}

/** Reads the `file` field of a multipart request and validates it as an image. */
export async function readImageField(req: Request, field = "file"): Promise<File> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Send the image as multipart/form-data");
  }
  const file = form.get(field);
  if (!(file instanceof File)) throw badRequest(`Missing "${field}" file`);
  if (!IMAGE_TYPES.has(file.type)) throw badRequest("Only JPEG, PNG, WebP or GIF images are allowed");
  if (file.size > MAX_IMAGE_BYTES) throw badRequest("Image must be 5 MB or smaller");
  return file;
}

/** Uploads to <CLOUDINARY_FOLDER>/<orgId>/<subfolder>. */
export async function uploadImage(file: File, organizationId: string, subfolder: string) {
  if (!isUploadConfigured()) {
    throw new AppError(503, "Image uploads are not configured on this server (set the CLOUDINARY_* variables).");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const folder = [process.env.CLOUDINARY_FOLDER || "rims", organizationId, subfolder].join("/");
  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: "image", overwrite: false }, (err, res) =>
        err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res),
      )
      .end(buffer);
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteImage(publicId: string | null | undefined) {
  if (!publicId || !isUploadConfigured()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn("[upload] failed to delete", publicId, err);
  }
}
