#!/bin/sh
set -e

# Run Prisma DB Push to update schema (if connected)
echo "Running Prisma DB Push..."
# Check if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  npx prisma db push --accept-data-loss
else
  echo "DATABASE_URL not set, skipping DB push."
fi

# Generate Prisma Client to ensure it matches the current schema
echo "Regenerating Prisma Client..."
npx prisma generate

# Start the application
exec "$@"
