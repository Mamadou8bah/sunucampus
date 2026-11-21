import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { deleteUpload, imageUpload, saveImage } from '../utils/images.js';

export const handleUpload = imageUpload({ field: 'photo', max: 1 });

const isUploadedAvatar = (url) => typeof url === 'string' && url.startsWith('/uploads/avatars/');

export async function setAvatar(req, res) {
  if (!req.file) throw ApiError.badRequest('Choose a photo to upload');
  const url = await saveImage(req.file, 'avatars', req.user.id);

  const previous = req.user.avatarUrl;
  const user = await User.findByIdAndUpdate(req.user._id, { avatarUrl: url }, { returnDocument: 'after' });
  if (isUploadedAvatar(previous)) await deleteUpload(previous);
  res.json({ user });
}

export async function removeAvatar(req, res) {
  const previous = req.user.avatarUrl;
  const user = await User.findByIdAndUpdate(req.user._id, { $unset: { avatarUrl: 1 } }, { returnDocument: 'after' });
  if (isUploadedAvatar(previous)) await deleteUpload(previous);
  res.json({ user });
}
