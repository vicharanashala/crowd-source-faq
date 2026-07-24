import { describe, expect, it } from 'vitest';
import { isOurCloudinaryAsset } from '../integrations/cloudinary/cloudinary.js';

describe('Cloudinary asset validation', () => {
  it('accepts HTTPS assets from the configured Cloudinary cloud only', () => {
    expect(
      isOurCloudinaryAsset('https://res.cloudinary.com/mycloud/image/upload/v123/avatar.png', 'mycloud'),
    ).toBe(true);
  });

  it('rejects substring host smuggling attempts', () => {
    expect(
      isOurCloudinaryAsset('https://evil.example/res.cloudinary.com/mycloud/image/upload/v123/avatar.png', 'mycloud'),
    ).toBe(false);
    expect(
      isOurCloudinaryAsset('https://res.cloudinary.com.evil.example/mycloud/image/upload/v123/avatar.png', 'mycloud'),
    ).toBe(false);
  });

  it('rejects wrong cloud names and non-HTTPS URLs', () => {
    expect(
      isOurCloudinaryAsset('https://res.cloudinary.com/othercloud/image/upload/v123/avatar.png', 'mycloud'),
    ).toBe(false);
    expect(
      isOurCloudinaryAsset('http://res.cloudinary.com/mycloud/image/upload/v123/avatar.png', 'mycloud'),
    ).toBe(false);
  });
});
