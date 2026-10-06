# File Upload Configuration

## Bunny.net Setup for Image Uploads

The Qabila platform now supports image uploads to Bunny.net CDN for fast, distributed image serving.

### Prerequisites

1. **Bunny.net Account**: Sign up at https://bunny.net
2. **Create a Storage Zone**: Used for file storage
3. **Create a Pull Zone**: CDN for serving files

### Environment Variables

Set these in your Railway environment or `.env` file:

```env
# Bunny.net Storage Configuration
BUNNY_STORAGE_ZONE=your-storage-zone-name
BUNNY_API_KEY=your-bunny-api-key
BUNNY_PULL_ZONE=your-pull-zone-name
```

### How to Get These Values

1. **BUNNY_STORAGE_ZONE**:
   - Go to Bunny Dashboard > Storage > Storage Zones
   - Create a new storage zone (e.g., `qabila-storage`)
   - Copy the storage zone name

2. **BUNNY_API_KEY**:
   - Go to Bunny Dashboard > Account > API
   - Copy your API Key

3. **BUNNY_PULL_ZONE**:
   - Go to Bunny Dashboard > CDN > Pull Zones
   - Create a new pull zone pointing to your storage zone
   - Copy the pull zone name (e.g., `qabila-cdn`)

### API Endpoints

#### Upload File
```
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body:
- file: Image file (JPEG, PNG, WebP, or GIF)
  Max size: 10MB

Response:
{
  "success": true,
  "url": "https://{pullZone}.b-cdn.net/qabila/{fileName}",
  "fileName": "1234567890-abc123.jpg",
  "size": 245620
}
```

#### Health Check
```
GET /api/upload/health

Response:
{
  "status": "ok",
  "service": "file-upload"
}
```

### Image Support

Supported formats:
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- GIF (.gif)

Maximum file size: 10MB

### Usage in Frontend

Images are automatically uploaded when users:
1. Edit a person in the family tree
2. Upload a profile picture
3. Add an image to their member profile

The upload happens client-side with:
- Real-time preview before upload
- Progress indication ("جارٍ الرفع...")
- Error handling with user-friendly messages
- Automatic retry on network failure

### Cost Considerations

Bunny.net pricing:
- Storage: ~$0.01 per GB per month
- Bandwidth: ~$0.01 per GB
- API requests: Free up to 100GB

For a platform with 100 members, average image size 500KB:
- Storage: 50GB × $0.01 = $0.50/month
- CDN bandwidth: Depends on usage

### Troubleshooting

1. **"Bunny.net API key not configured"**
   - Set `BUNNY_API_KEY` environment variable

2. **"File type not allowed"**
   - Only JPEG, PNG, WebP, and GIF are supported

3. **"File size exceeds maximum"**
   - Maximum file size is 10MB

4. **Upload fails but no error message**
   - Check Bunny.net dashboard for storage quota
   - Verify API key has upload permissions

### Security Notes

- All uploads require authentication (JWT token)
- File types are validated both client-side and server-side
- File names are sanitized and randomized
- Images are stored in `/qabila/` directory on Bunny
