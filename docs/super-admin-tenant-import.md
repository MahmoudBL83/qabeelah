# Super Admin Tenant Import

This page is for super-admins who need to create a new family tenant quickly and seed it with initial member data.

## What the page does

- Creates a new tenant with a name, slug, and optional custom domain.
- Imports family members from JSON or CSV.
- Attaches an optional cover image to the tenant.
- Can create a temporary QABILA_ADMIN account for the tenant.

## Supported inputs

### JSON

Preferred format. You can paste an array of members or an object containing `members` or `people`.

Example:

```json
[
  {
    "id": "root",
    "fullName": "عبدالله بن أحمد",
    "birthYear": 1920,
    "isLiving": false
  },
  {
    "id": "child-1",
    "fullName": "سالم بن عبدالله",
    "parentId": "root",
    "birthYear": 1950,
    "isLiving": true
  }
]
```

### CSV

Use headers such as `id`, `fullName`, `firstName`, `lastName`, `parentId`, `birthYear`, `deathYear`, `isLiving`, `branchId`, `bio`, and `imageSrc`.

Example:

```csv
id,fullName,parentId,birthYear,isLiving
root,عبدالله بن أحمد,,1920,false
child-1,سالم بن عبدالله,root,1950,true
```

### Image

An uploaded image is stored as the tenant cover image. This is useful for family branding and visual identification. If the source data is only an image, create the tenant first and add the family tree data in a follow-up import.

## Admin account

If you provide both `adminName` and `adminEmail`, the API creates a temporary `QABILA_ADMIN` user and returns the generated password once in the response.

## Workflow

1. Open `/super-admin/import`.
2. Enter the family name and slug.
3. Add an optional custom domain.
4. Paste JSON or CSV, or upload a file.
5. Upload a cover image if you have one.
6. Optionally create a temporary tenant admin account.
7. Submit the form.

## Notes

- The import route requires a `SUPER_ADMIN` account.
- Duplicate tenant slugs or custom domains are rejected.
- Imported members should reference parent rows by their `id` values.
- If no member data is provided, the tenant shell is still created.
