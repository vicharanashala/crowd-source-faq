const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ATTACHMENT_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_TAG_LENGTH = 20;

export interface PostAttachmentValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePostAttachment(file: File): PostAttachmentValidationResult {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Please choose a JPEG, PNG, WebP, or GIF image.',
    };
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image is too large. Please choose a file smaller than 8 MB.`,
    };
  }

  return { valid: true };
}

export function validatePostTag(tag: string, existingTags: string[]): PostAttachmentValidationResult {
  const normalizedTag = tag.trim().replace(/,/g, '');
  if (!normalizedTag) {
    return {
      valid: false,
      error: 'Tag cannot be empty.',
    };
  }

  if (existingTags.some((existing) => existing.toLowerCase() === normalizedTag.toLowerCase())) {
    return {
      valid: false,
      error: 'That tag is already added.',
    };
  }

  if (normalizedTag.length > MAX_TAG_LENGTH) {
    return {
      valid: false,
      error: 'Tag is too long. Keep it under 20 characters.',
    };
  }

  return { valid: true };
}
