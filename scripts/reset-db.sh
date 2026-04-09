#!/usr/bin/env bash
set -euo pipefail

echo "Resetting database..."
npx prisma db push --force-reset
echo "Re-seeding..."
npx tsx prisma/seed.ts
echo "Done!"
