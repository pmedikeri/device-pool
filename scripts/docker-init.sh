#!/bin/sh
set -e

echo "=== Device Pool: Initializing database ==="

echo "1. Pushing schema..."
npx prisma db push --accept-data-loss 2>&1

echo "2. Seeding data..."
npx tsx prisma/seed.ts 2>&1

echo "=== Done ==="
